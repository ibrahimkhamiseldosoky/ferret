import logging
from collections import deque, defaultdict
from app.core.database import get_supabase
from app.services.cache import cache

logger = logging.getLogger(__name__)


def extract_subgraph(repository_id: str, anchor_node_ids: list[str], depth: int = 2) -> dict:
    sorted_anchors = sorted(anchor_node_ids)
    cached = cache.get(repository_id, "subgraph", str(depth), *sorted_anchors)
    if cached is not None:
        return cached
    nodes_raw = get_supabase().table("nodes").select("node_id,label,type").eq("repository_id", repository_id).execute()
    edges_raw = get_supabase().table("edges").select("source_id,target_id,label").eq("repository_id", repository_id).execute()

    all_nodes = {n["node_id"]: n for n in (nodes_raw.data or [])}
    all_edges = [(e["source_id"], e["target_id"], e) for e in (edges_raw.data or [])]

    valid_anchors = [nid for nid in anchor_node_ids if nid in all_nodes]
    if not valid_anchors:
        return {"nodes": [], "edges": [], "title": "No valid anchor nodes"}

    forward = defaultdict(list)
    reverse = defaultdict(list)
    for src, tgt, e in all_edges:
        forward[src].append((tgt, e))
        reverse[tgt].append((src, e))

    visited = set(valid_anchors)
    queue = deque((nid, 0) for nid in valid_anchors)
    result_node_ids = set(valid_anchors)

    while queue:
        nid, d = queue.popleft()
        if d >= depth:
            continue
        for neighbor, _ in forward.get(nid, []):
            if neighbor not in visited:
                visited.add(neighbor)
                result_node_ids.add(neighbor)
                queue.append((neighbor, d + 1))
        for neighbor, _ in reverse.get(nid, []):
            if neighbor not in visited:
                visited.add(neighbor)
                result_node_ids.add(neighbor)
                queue.append((neighbor, d + 1))

    result_nodes = [{
        "id": n["node_id"],
        "label": n["label"],
        "type": n["type"],
    } for nid in result_node_ids for n in [all_nodes[nid]]]

    result_edges = [{
        "source": src,
        "target": tgt,
        "label": e.get("label", ""),
    } for src, tgt, e in all_edges if src in result_node_ids and tgt in result_node_ids]

    result = {
        "type": "dependency_flow",
        "title": f"Subgraph ({len(valid_anchors)} anchors, depth {depth})",
        "nodes": result_nodes,
        "edges": result_edges,
    }
    cache.set(repository_id, "subgraph", result, str(depth), *sorted_anchors)
    return result
