"""Tier A — Intent classifier for user questions.

Pure rules/deterministic. No LLM. Maps user questions to precomputed graph queries
so that Tier B (small LLM) only formats the results.
"""

import logging
import re

logger = logging.getLogger(__name__)

INTENT_PATTERNS = {
    "entrypoints": [
        r"\bentry\s*points?\b",
        r"\bwhere\s+does\s+(the\s+)?app(lication)?\s+start\b",
        r"\bwhat\s+(is\s+the\s+)?entry\b",
        r"\bmain\s+(file|module|entry)\b",
        r"\bhow\s+(is\s+)?the\s+app(lication)?\s+(started|launched|bootstrapped)\b",
    ],
    "unused_code": [
        r"\b(unused|dead)\s*(code|files?|imports?)\b",
        r"\bwhat(\'s| is)\s+(not\s+)?used\b",
        r"\borphaned\b",
        r"\bno\s+(one|file)\s+(imports|uses)\b",
    ],
    "external_deps": [
        r"\bexternal\s+(dep(endenci)?es|libra(ry|ries)|packages?|modules?)\b",
        r"\bthird.?\s*party\b",
        r"\bwhat\s+(libra|packages?|modules?|dependencie)s?\s+does\b",
        r"\boutside\s+(dep|lib)\b",
    ],
    "auth_flow": [
        r"\b(auth(en[st]icat(ion|e))?|login|logout|sign[-\s]?in|sign[-\s]?up|register)\b",
        r"\bhow\s+(is\s+|does\s+).*(auth|login|secure)\b",
        r"\bpassword\b",
        r"\bjwt\b",
        r"\bsession\b",
        r"\boauth\b",
    ],
    "db_interactions": [
        r"\b(database|db|data\s*store|persist(ence|ent)?)\b",
        r"\bhow\s+(is\s+|does\s+).*(data|stor|persist|sav)\b",
        r"\bsql\b",
        r"\borm\b",
        r"\bmigration[s]?\b",
        r"\bschema\b",
        r"\bmodel[s]?\b",
    ],
    "request_flow": [
        r"\b(request|http|api)\s*(flow|pipeline|lifecycle|cycle)\b",
        r"\bhow\s+(does\s+)?a\s+request\b",
        r"\b(end[-\s]?to[-\s]?end|full\s+cycle)\b",
        r"\broute\s+flow\b",
    ],
}

INTENT_LABELS = {
    "entrypoints": "Entry Points",
    "unused_code": "Unused Code",
    "external_deps": "External Dependencies",
    "auth_flow": "Authentication Flow",
    "db_interactions": "Database Interactions",
    "request_flow": "Request Flow",
}


def classify_question(question: str) -> dict:
    if not question or not question.strip():
        return {"intent": "freeform", "type": "llm", "label": "Freeform"}

    q_lower = question.lower().strip()

    matches = []
    for intent, patterns in INTENT_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, q_lower):
                matches.append(intent)
                break

    if len(matches) == 1:
        logger.info("Tier A classified question as '%s' (unique match)", matches[0])
        return {"intent": matches[0], "type": "semantic", "label": INTENT_LABELS.get(matches[0], matches[0])}
    elif len(matches) > 1:
        priority = ["auth_flow", "request_flow", "entrypoints", "db_interactions", "external_deps", "unused_code"]
        for p in priority:
            if p in matches:
                logger.info("Tier A classified question as '%s' (multi-match, highest priority)", p)
                return {"intent": p, "type": "semantic", "label": INTENT_LABELS.get(p, p)}

    logger.info("Tier A: no semantic intent matched, falling back to LLM")
    return {"intent": "freeform", "type": "llm", "label": "Freeform"}
