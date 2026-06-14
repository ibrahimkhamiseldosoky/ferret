import json
import logging
import re
import time
from openai import OpenAI
from openai import APIError, APITimeoutError, RateLimitError, APIConnectionError
from app.core.config import settings
from app.services.resolver import NodeResolver
from app.services.validator import validate_llm_output, verify_claims_against_graph
from app.services.query_classifier import classify_question
from app.services.cache import cache
from app.services.semantic_queries import (
    find_entrypoints,
    find_unused_nodes,
    find_external_dependencies,
    find_auth_flow,
    find_db_interactions,
    find_request_flow,
)

logger = logging.getLogger(__name__)

FORMATTER_PROMPT = """You are a code explanation assistant. You are given precomputed data about a repository's structure. Explain it in clear natural language.

RULES:
1. Do NOT add any information not in the data.
2. Do NOT speculate. Use only the file names given.
3. Keep it concise — 2-4 sentences.

Data:
Title: {title}
Description: {description}
Key files ({file_count}): {file_list}
Edges ({edge_count}): {edge_summary}

You MUST respond in valid JSON:
{
  "answer": "your explanation here"
}"""

SYSTEM_PROMPT = """You are a code analysis assistant. You answer questions about a repository using ONLY the graph data provided below.

CRITICAL RULES — you MUST follow every one:

1. YOU CANNOT SEE THE ACTUAL CODE. You only see filenames, file types, and a list of symbols (function names, class names, API endpoints) that were extracted from each file. Never claim a function, class, variable, or behavior exists unless it appears in the provided symbols.

2. NEVER CLAIM A FUNCTION IS CALLED IN A SPECIFIC CODE PATH. The graph shows file-level imports only. It does NOT show which functions call which other functions. For example: if `orders.py` imports `notification_service.py`, and `notification_service.py` contains `send_order_confirmation`, you CANNOT claim that `cancel_order_route` calls `send_order_confirmation`. The function may only be used in a different route (like `place_order`). If asked about a specific flow, you can say "orders.py imports notification_service, but it's unclear whether cancellation uses it."

3. NEVER INVENT DETAILS. Do not fabricate function names, class names, method names, parameter names, or logic steps. If the symbols data for a file shows no functions, do not claim any exist. If you are speculating, you MUST set confidence < 0.5 and mark the evidence type as "inference".

4. CITE YOUR SOURCES. Every claim in your answer must reference specific filenames from the node list. When you mention a function or class, say which file it belongs to. Use the FULL file path (e.g. "backend/app/main.py", NOT "main.py").

5. EVIDENCE TYPES:
   - "observed": The claim is directly supported by a symbol listed in the node data (e.g., a function name exists in a file's symbols).
   - "inference": You are making a reasonable guess based on the filename or file type (e.g., guessing a file called "auth.py" handles authentication).
   - "dependency": The claim is based on an edge between two files in the edge list.

6. highlight_candidates: List full or partial filenames that are relevant to your answer. These will be highlighted in the visual graph. Only reference files that exist in the node list. You may use the filename, the full path, or a recognizable portion.

7. edge_intents: If you want to highlight specific dependency relationships, list pairs of files that have a direct edge between them. Only reference files that exist in the node list.

You MUST respond ONLY in valid JSON with this exact schema:
{
  "answer": "Clear explanation text",
  "confidence": 0.0-1.0,
  "highlight_candidates": ["filename1.py", "filename2.py"],
  "edge_intents": [{"from": "file1.py", "to": "file2.py"}],
  "evidence": [
    {"file_hint": "filename.py", "reason": "Why this file is relevant", "relevance": 0.0-1.0, "type": "observed|inference|dependency"}
  ]
}

If no graph manipulation is needed, omit highlight_candidates and edge_intents entirely."""

SEMANTIC_QUERY_MAP = {
    "entrypoints": find_entrypoints,
    "unused_code": find_unused_nodes,
    "external_deps": find_external_dependencies,
    "auth_flow": find_auth_flow,
    "db_interactions": find_db_interactions,
    "request_flow": find_request_flow,
}

PREDEFINED_QUESTIONS = {
    "explain_repository": "Explain the overall architecture and purpose of the repository.",
    "show_authentication": "Describe the authentication system used in this repository.",
    "show_main_services": "List and describe the main services and their responsibilities.",
    "show_request_flow": "Describe the typical request flow from entry point to response.",
    "find_dead_code": "Identify any potentially unused or dead code in this repository.",
}

MAX_RETRIES = 3
INITIAL_RETRY_DELAY = 1.0
MAX_TOKENS = 4000
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
        max_tokens=MAX_TOKENS,
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
            return {"answer": "I received an invalid response from the AI. Please try rephrasing your question.", "confidence": 0.0}
        except RateLimitError as e:
            logger.warning("Rate limited (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, e)
            last_error = e
            if attempt < MAX_RETRIES - 1:
                delay = INITIAL_RETRY_DELAY * (2 ** attempt)
                time.sleep(delay)
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
            last_error = e
            break

    error_type = type(last_error).__name__ if last_error else "UnknownError"
    hint = {
        "RateLimitError": "The AI provider is rate-limiting requests. Please wait a moment and try again.",
        "APITimeoutError": "The AI provider took too long to respond. Please try again.",
        "APIConnectionError": "Could not connect to the AI provider. Please check your network and try again.",
        "APIError": "The AI provider returned an error. Please try again.",
    }.get(error_type, "An unexpected error occurred while generating the answer.")

    logger.error("LLM call failed after %d attempts: %s", MAX_RETRIES, hint)
    return {"answer": hint, "confidence": 0.0}


def answer_question(repository_id: str, question: str, question_type: str = "freeform") -> dict:
    from app.core.database import get_supabase
    supabase = get_supabase()

    if not question or not question.strip():
        logger.warning("Empty question submitted for repository %s", repository_id)
        return {
            "schema_version": 1,
            "answer": "Please ask a specific question about the repository.",
            "confidence": 0.0,
            "degraded_mode": False,
            "evidence": [],
            "graph_actions": [],
        }

    repo = supabase.table("repositories").select("*").eq("id", repository_id).execute()
    nodes = supabase.table("nodes").select("*").eq("repository_id", repository_id).execute()
    edges = supabase.table("edges").select("*").eq("repository_id", repository_id).execute()

    if not repo.data:
        logger.warning("Repository %s not found", repository_id)
        return {
            "schema_version": 1,
            "answer": "Repository not found.",
            "confidence": 0.0,
            "degraded_mode": False,
            "evidence": [],
            "graph_actions": [],
        }

    if not nodes.data:
        logger.warning("Repository %s has no nodes (analysis may be incomplete)", repository_id)
        return {
            "schema_version": 1,
            "answer": "Repository analysis is not yet complete. Please wait for the analysis to finish before asking questions.",
            "confidence": 0.0,
            "degraded_mode": False,
            "evidence": [],
            "graph_actions": [],
        }

    if question_type == "predefined":
        mapped = PREDEFINED_QUESTIONS.get(question, question)
        final_question = mapped
    else:
        final_question = question

    repo_name = repo.data[0].get("name", "unknown")
    repo_lang = repo.data[0].get("language", "unknown")
    file_count = repo.data[0].get("file_count", 0)

    logger.info(
        "Answering question for repo=%s type=%s nodes=%d edges=%d",
        repo_name, question_type, len(nodes.data), len(edges.data),
    )

    def _summarize_symbols(raw: dict) -> str:
        data = raw.get("data") or {}
        symbols = data.get("symbols") if isinstance(data, dict) else []
        if not symbols:
            return ""
        parts = []
        funcs = [s["name"] for s in symbols if s.get("type") == "function"]
        classes = [s["name"] for s in symbols if s.get("type") == "class"]
        endpoints = [s["name"] for s in symbols if s.get("type") == "api_endpoint"]
        imports = [s["name"] for s in symbols if s.get("type") == "import"]
        if funcs:
            parts.append(f"fn: {', '.join(funcs)}")
        if classes:
            parts.append(f"cls: {', '.join(classes)}")
        if endpoints:
            parts.append(f"ep: {', '.join(endpoints)}")
        if imports:
            parts.append(f"imports: {', '.join(imports)}")
        return " [" + "; ".join(parts) + "]" if parts else ""

    node_summaries = [f"- {n['type']}: {n['label']}{_summarize_symbols(n)}" for n in nodes.data]
    edge_summaries = [f"  {e['source_id']} -> {e['target_id']} [{e.get('label', 'depends_on')}]" for e in edges.data]

    context = f"""Repository: {repo_name}
Language: {repo_lang}
File count: {file_count}

Nodes ({len(node_summaries)}):
{chr(10).join(node_summaries[:MAX_NODES_IN_CONTEXT])}

Edges ({len(edge_summaries)}):
{chr(10).join(edge_summaries[:MAX_EDGES_IN_CONTEXT])}
"""

    # Tier A: Classify intent
    classification = classify_question(final_question)

    if classification["type"] == "semantic":
        return _handle_semantic_query(repository_id, repo_name, classification, context, final_question)
    else:
        return _handle_llm_query(repository_id, repo_name, context, final_question, nodes, edges)


def _handle_semantic_query(repository_id: str, repo_name: str, classification: dict, context: str, question: str) -> dict:
    intent = classification["intent"]
    query_fn = SEMANTIC_QUERY_MAP.get(intent)
    if not query_fn:
        return {
            "schema_version": 1,
            "answer": f"I don't have a precomputed query for '{classification['label']}'. Please rephrase your question.",
            "confidence": 0.0,
            "degraded_mode": False,
            "evidence": [],
            "graph_actions": [],
        }

    try:
        cached = cache.get(repository_id, "semantic", intent)
        if cached is not None:
            query_result = cached
        else:
            query_result = query_fn(repository_id)
            cache.set(repository_id, "semantic", query_result, intent)
    except Exception as e:
        logger.exception("Semantic query '%s' failed for repo %s: %s", intent, repository_id, e)
        return {
            "schema_version": 1,
            "answer": f"Failed to analyze {classification['label'].lower()}. Please try again.",
            "confidence": 0.0,
            "degraded_mode": False,
            "evidence": [],
            "graph_actions": [],
        }

    # Build highlight candidates from result nodes
    nodes_data = query_result.get("nodes", [])
    highlight_candidates = [n["node_id"] for n in nodes_data if n.get("node_id")]

    # Build evidence from result
    evidence = []
    for n in nodes_data:
        evidence.append({
            "node_id": n.get("node_id", ""),
            "display_name": n.get("label", ""),
            "type": "observed",
            "reason": f"Part of {classification['label'].lower()}",
            "relevance": 1.0,
        })

    # Subgraph for flow-type queries
    graph_actions = []
    if highlight_candidates:
        graph_actions.append({"type": "highlight_nodes", "nodes": highlight_candidates})

    edges_data = query_result.get("edges", [])
    if edges_data:
        if len(nodes_data) <= 50:
            from app.services.subgraph_service import extract_subgraph
            sub = extract_subgraph(repository_id, highlight_candidates[:5], depth=2)
            if sub.get("nodes"):
                sub["title"] = classification["label"]
                graph_actions.append({"type": "show_subgraph", "graph": sub})

    # Build answer from data (deterministic fallback)
    title = query_result.get("title", "")
    description = query_result.get("description", "")
    all_nodes = query_result.get("nodes", [])
    all_edges = query_result.get("edges", [])
    all_deps = query_result.get("dependencies", [])

    file_labels = [n.get("label", "") for n in all_nodes if n.get("label")]
    file_list_str = ", ".join(file_labels[:8])
    if len(file_labels) > 8:
        file_list_str += f" (+{len(file_labels) - 8} more)"

    if all_deps:
        top_deps = [d.get("external_name", "") for d in all_deps[:5]]
        dep_str = ", ".join(top_deps)
        answer = f"This repository has {len(all_deps)} external dependenc{'y' if len(all_deps) == 1 else 'ies'}: {dep_str}."
    elif intent == "auth_flow":
        auth_files = [n.get("label", "") for n in all_nodes if any(k in n.get("label","").lower() for k in ["auth","login","user","token","jwt","session"])]
        answer = f"The authentication system involves {len(auth_files)} key files: {', '.join(auth_files[:6])}."
        if len(auth_files) > 6:
            answer += f" ({len(auth_files) - 6} additional related files)"
    elif intent == "entrypoints":
        entry_labels = [n.get("label", "") for n in all_nodes]
        deps = query_result.get("direct_dependents", [])
        dep_labels = list(set(d.get("from", "") for d in deps))
        answer = f"Entry point: {', '.join(entry_labels)}. It directly imports {len(dep_labels)} files: {', '.join(dep_labels[:6])}."
        if len(dep_labels) > 6:
            answer += f" ({len(dep_labels) - 6} more)"
    elif intent == "db_interactions":
        answer = description
        if all_nodes:
            answer += f" Files: {file_list_str}."
    elif intent == "unused_code":
        answer = description
        if all_nodes:
            answer += f" Files: {file_list_str}."
    elif intent == "request_flow":
        answer = description
        if all_nodes:
            answer += f" Files: {file_list_str}."
    else:
        answer = description

    # Tier B: LLM polish (best-effort, fallback already set)
    try:
        edge_summary = f"{len(all_edges)} dependency edges"
        if all_deps:
            edge_summary = f"{len(all_deps)} external deps"
        file_list_short = ", ".join(n.get("label", "") for n in all_nodes[:12])
        if len(all_nodes) > 12:
            file_list_short += f" and {len(all_nodes) - 12} more"

        formatter_msg = FORMATTER_PROMPT.format(
            title=title,
            description=description,
            file_count=len(all_nodes),
            file_list=file_list_short,
            edge_count=len(all_edges) if all_edges else len(all_deps),
            edge_summary=edge_summary,
        )
        client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            timeout=TIMEOUT_SECONDS,
        )
        raw = _call_llm_with_retry(client, formatter_msg, f"Question: {question}")
        validated, _, _ = validate_llm_output(raw)
        llm_answer = validated.get("answer", "").strip()
        if llm_answer:
            answer = llm_answer
    except Exception as e:
        logger.warning("Tier B formatter polish failed (using fallback): %s", e)

    return {
        "schema_version": 1,
        "answer": answer,
        "confidence": 0.95 if len(evidence) > 0 else 0.5,
        "degraded_mode": False,
        "warnings": [],
        "evidence": evidence,
        "graph_actions": graph_actions,
    }


def _handle_llm_query(repository_id: str, repo_name: str, context: str, question: str, nodes, edges) -> dict:
    try:
        client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
            timeout=TIMEOUT_SECONDS,
        )
        user_message = (
            f"Repository context:\n{context}\n\n"
            f"Question: {question}\n\n"
            f"Reminder: The graph shows file-level imports and symbol definitions only. "
            f"It does not show which functions call which other functions. "
            f"Never claim a specific function from File B is called in a specific code path of File A "
            f"unless you see a direct edge or import for that specific pairing."
        )
        raw = _call_llm_with_retry(client, SYSTEM_PROMPT, user_message)
    except Exception as e:
        logger.exception("Unexpected error during LLM call for repo %s: %s", repository_id, e)
        return {
            "schema_version": 1,
            "answer": "An unexpected error occurred. Please try again.",
            "confidence": 0.0,
            "degraded_mode": False,
            "evidence": [],
            "graph_actions": [],
        }

    validated, degraded, warnings = validate_llm_output(raw)
    logger.info(
        "LLM response validated for repo=%s candidates=%d intents=%d evidence=%d",
        repo_name,
        len(validated.get("highlight_candidates", [])),
        len(validated.get("edge_intents", [])),
        len(validated.get("evidence", [])),
    )

    valid_candidates, valid_edge_ids, valid_evidence, verified_claims, total_claims = verify_claims_against_graph(
        repository_id,
        validated.get("highlight_candidates", []),
        validated.get("edge_intents", []),
        validated.get("evidence", []),
    )

    overlap_confidence = (verified_claims / max(total_claims, 1)) if total_claims > 0 else 1.0
    final_confidence = round(min(validated.get("confidence", 0.0), overlap_confidence), 4)

    if total_claims > verified_claims:
        diff = total_claims - verified_claims
        warnings.append(f"{diff} of {total_claims} claims could not be verified against the graph")
        degraded = degraded or (diff > 0)

    graph_actions = []
    if valid_candidates:
        graph_actions.append({"type": "highlight_nodes", "nodes": valid_candidates})
    if valid_edge_ids:
        graph_actions.append({"type": "highlight_edges", "edges": valid_edge_ids})

    logger.info(
        "Answer generated for repo=%s llm_confidence=%s overlap_confidence=%s final_confidence=%s degraded=%s evidence=%d actions=%d",
        repo_name, validated.get("confidence"), overlap_confidence, final_confidence, degraded, len(valid_evidence), len(graph_actions),
    )

    return {
        "schema_version": 1,
        "answer": validated.get("answer", ""),
        "confidence": final_confidence,
        "degraded_mode": degraded,
        "warnings": warnings,
        "evidence": valid_evidence,
        "graph_actions": graph_actions,
    }
