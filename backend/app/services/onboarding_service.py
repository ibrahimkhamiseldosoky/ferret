import json
import logging
import time
from openai import OpenAI
from openai import APIError, APITimeoutError, RateLimitError, APIConnectionError
from app.core.config import settings
from app.services.reading_order import compute_reading_order

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 1.0
TIMEOUT_SECONDS = 90
MAX_NODES_IN_CONTEXT = 200
MAX_EDGES_IN_CONTEXT = 500


def _call_llm(client: OpenAI, system_prompt: str, user_message: str) -> dict:
    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=2000,
    )
    raw = json.loads(response.choices[0].message.content)
    if not isinstance(raw, dict):
        raise ValueError("LLM response is not a JSON object")
    return raw


def _call_llm_with_retry(client: OpenAI, system_prompt: str, user_message: str) -> dict:
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            return _call_llm(client, system_prompt, user_message)
        except (json.JSONDecodeError, ValueError) as e:
            logger.error("LLM returned invalid JSON (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)
            raise
        except RateLimitError as e:
            logger.warning("Rate limited (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)
            last_error = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(INITIAL_RETRY_DELAY * (2 ** attempt))
        except APITimeoutError as e:
            logger.warning("LLM timeout (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)
            last_error = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(INITIAL_RETRY_DELAY)
        except APIConnectionError as e:
            logger.warning("Connection error (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)
            last_error = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(INITIAL_RETRY_DELAY)
        except APIError as e:
            logger.error("OpenAI API error (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)
            last_error = e
            if attempt < MAX_RETRIES - 1 and (e.status_code or 0) >= 500:
                time.sleep(INITIAL_RETRY_DELAY * (2 ** attempt))
            else:
                break
        except Exception as e:
            logger.exception("Unexpected LLM error (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)
            raise

    raise last_error or Exception("LLM call failed after retries")


SYSTEM_PROMPT = """You are a code analysis assistant. Given a repository's node and edge data, generate the prose portions of an onboarding guide.

The reading order has already been computed deterministically from the dependency graph. You only need to generate:

1. A 2-3 sentence overview of the repository's architecture and purpose
2. A list of 3-6 core concepts to understand the codebase

You MUST respond in valid JSON with this exact schema:
{
  "overview": "2-3 sentence summary",
  "core_concepts": ["concept1", "concept2", "concept3"]
}

Core concepts should be broad architectural topics relevant to this specific repo (e.g. for a FastAPI app: "REST API Design", "Dependency Injection", "SQLAlchemy ORM", "Pydantic Validation").
"""


def generate_onboarding(repository_id: str) -> dict:
    from app.core.database import get_supabase
    supabase = get_supabase()

    nodes = supabase.table("nodes").select("node_id,label,type").eq("repository_id", repository_id).execute()
    edges = supabase.table("edges").select("source_id,target_id,label").eq("repository_id", repository_id).execute()

    if not nodes.data:
        logger.warning("No nodes found for repository %s, cannot generate onboarding", repository_id)
        raise ValueError("No graph data available for onboarding")

    # Deterministic reading order
    reading_order = compute_reading_order(repository_id)

    # LLM only generates overview + core concepts
    node_summaries = [f"- {n['type']}: {n['label']}" for n in nodes.data]
    edge_summaries = [f"  {e['source_id']} -> {e['target_id']} [{e.get('label', 'depends_on')}]" for e in (edges.data or [])]

    context = f"""Nodes ({len(node_summaries)}):
{chr(10).join(node_summaries[:MAX_NODES_IN_CONTEXT])}

Edges ({len(edge_summaries)}):
{chr(10).join(edge_summaries[:MAX_EDGES_IN_CONTEXT])}
"""

    overview = ""
    core_concepts = []

    try:
        client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            timeout=TIMEOUT_SECONDS,
        )
        user_message = f"Repository graph data:\n{context}\n\nGenerate overview and core concepts based on this data."
        raw = _call_llm_with_retry(client, SYSTEM_PROMPT, user_message)
        overview = raw.get("overview", "")
        core_concepts = raw.get("core_concepts", [])
        if not isinstance(core_concepts, list):
            core_concepts = []
    except Exception as e:
        logger.warning("LLM call for overview/concepts failed, using fallback: %s", e)
        overview = f"A {nodes.data[0].get('type', 'code')} repository with {len(nodes.data)} files."
        core_concepts = ["Code Architecture", "Dependency Management"]

    validated = {
        "overview": overview,
        "reading_order": reading_order,
        "core_concepts": core_concepts,
        "estimated_hours": max(1, len(reading_order)),
    }

    logger.info(
        "Onboarding generated for repo=%s items=%d concepts=%d",
        repository_id, len(reading_order), len(core_concepts),
    )

    return validated
