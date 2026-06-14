import logging
from app.models.repository import EvidenceItem, SubGraph, SubGraphNode, SubGraphEdge

logger = logging.getLogger(__name__)

MAX_HIGHLIGHT_CANDIDATES = 50
MAX_EDGE_INTENTS = 50
MAX_EVIDENCE = 20


def validate_llm_output(raw: dict) -> tuple[dict, bool, list[str]]:
    warnings = []
    degraded = False

    conf = raw.get("confidence", 0.0)
    if not isinstance(conf, (int, float)):
        conf = 0.0
        degraded = True
        warnings.append("Invalid confidence value; defaulted to 0")
    else:
        conf = max(0.0, min(1.0, float(conf)))

    candidates = raw.get("highlight_candidates", [])
    if not isinstance(candidates, list):
        candidates = []
        degraded = True
        warnings.append("highlight_candidates must be a list")
    elif len(candidates) > MAX_HIGHLIGHT_CANDIDATES:
        candidates = candidates[:MAX_HIGHLIGHT_CANDIDATES]
        degraded = True
        warnings.append(f"highlight_candidates truncated to {MAX_HIGHLIGHT_CANDIDATES}")

    edge_intents = raw.get("edge_intents", [])
    if not isinstance(edge_intents, list):
        edge_intents = []
        degraded = True
        warnings.append("edge_intents must be a list")
    elif len(edge_intents) > MAX_EDGE_INTENTS:
        edge_intents = edge_intents[:MAX_EDGE_INTENTS]
        degraded = True
        warnings.append(f"edge_intents truncated to {MAX_EDGE_INTENTS}")

    evidence_raw = raw.get("evidence", [])
    if not isinstance(evidence_raw, list):
        evidence_raw = []
        degraded = True
        warnings.append("evidence must be a list")
    elif len(evidence_raw) > MAX_EVIDENCE:
        evidence_raw = evidence_raw[:MAX_EVIDENCE]
        degraded = True
        warnings.append(f"evidence truncated to {MAX_EVIDENCE}")

    result = {
        "answer": raw.get("answer", ""),
        "confidence": conf,
        "highlight_candidates": candidates,
        "edge_intents": edge_intents,
        "evidence": evidence_raw,
    }

    return result, degraded, warnings


def verify_claims_against_graph(
    repository_id: str,
    highlight_candidates: list[str],
    edge_intents: list[dict],
    evidence: list[dict],
) -> tuple[list[str], list[str], list[dict], int, int]:
    from app.core.database import get_supabase
    supabase = get_supabase()

    nodes_raw = supabase.table("nodes").select("node_id,label").eq("repository_id", repository_id).execute()
    edges_raw = supabase.table("edges").select("id,source_id,target_id").eq("repository_id", repository_id).execute()

    node_ids = {n["node_id"] for n in (nodes_raw.data or [])}
    node_labels = {n["label"]: n["node_id"] for n in (nodes_raw.data or [])}
    edge_map = {}
    for e in (edges_raw.data or []):
        edge_map[(e["source_id"], e["target_id"])] = e["id"]

    total_claims = 0
    verified_claims = 0

    def _resolve(hint: str) -> str | None:
        hint_normalized = hint.replace("\\", "/")
        if hint_normalized in node_ids:
            return hint_normalized
        for label, nid in node_labels.items():
            if label.lower() == hint_normalized.lower():
                return nid
        filename = hint_normalized.split("/")[-1]
        for label, nid in node_labels.items():
            if label.split("/")[-1] == filename:
                return nid
        stem = filename.rsplit(".", 1)[0].lower() if "." in filename else filename.lower()
        for label, nid in node_labels.items():
            if label.rsplit(".", 1)[0].lower().endswith(stem):
                return nid
        return None

    valid_candidates = []
    for c in highlight_candidates:
        total_claims += 1
        resolved = _resolve(c)
        if resolved:
            valid_candidates.append(resolved)
            verified_claims += 1
        else:
            logger.warning("Claim verification failed: highlight candidate '%s' not found in graph", c)

    valid_edge_ids = []
    for intent in edge_intents:
        total_claims += 1
        frm = _resolve(intent.get("from", ""))
        to = _resolve(intent.get("to", ""))
        if frm and to:
            eid = edge_map.get((frm, to))
            if eid:
                valid_edge_ids.append(eid)
                verified_claims += 1
            else:
                logger.warning("Claim verification failed: edge '%s->%s' not in graph", frm, to)
        else:
            logger.warning("Claim verification failed: edge intent nodes '%s'/'%s' not found", intent.get("from"), intent.get("to"))

    valid_evidence = []
    for ev in evidence:
        total_claims += 1
        resolved_nid = _resolve(ev.get("file_hint", ""))
        if resolved_nid:
            ev_type = "observed" if resolved_nid in node_ids else ev.get("type", "inference")
            valid_evidence.append({
                "node_id": resolved_nid,
                "display_name": ev.get("file_hint", "").split("/")[-1],
                "type": ev_type,
                "reason": ev.get("reason", ""),
                "relevance": max(0.0, min(1.0, float(ev.get("relevance", 0.5)))),
            })
            verified_claims += 1
        else:
            logger.warning("Claim verification failed: evidence file_hint '%s' not found", ev.get("file_hint"))
            valid_evidence.append({
                "node_id": "__unresolved__",
                "display_name": ev.get("file_hint", "").split("/")[-1],
                "type": "inference",
                "reason": ev.get("reason", "") + " (file not found in graph)",
                "relevance": 0.1,
            })

    return valid_candidates, valid_edge_ids, valid_evidence, verified_claims, total_claims
