import logging
from collections import deque, defaultdict
from app.core.database import get_supabase

logger = logging.getLogger(__name__)


def analyze_impact(repository_id: str, node_id: str) -> dict:
    supabase = get_supabase()

    nodes_raw = supabase.table("nodes").select("node_id,label,type,data").eq("repository_id", repository_id).execute()
    edges_raw = supabase.table("edges").select("source_id,target_id,label").eq("repository_id", repository_id).execute()

    if not nodes_raw.data:
        raise ValueError("No graph data found")

    # Build reverse adjacency: node -> [nodes that directly depend on it]
    reverse_deps = defaultdict(list)
    for e in edges_raw.data or []:
        reverse_deps[e["target_id"]].append(e["source_id"])

    # BFS to find all affected nodes
    affected = set()
    queue = deque([node_id])
    depth_map = {node_id: 0}
    max_depth = 0
    visited = {node_id}

    while queue:
        current = queue.popleft()
        for dependent in reverse_deps.get(current, []):
            if dependent not in visited:
                visited.add(dependent)
                affected.add(dependent)
                depth_map[dependent] = depth_map[current] + 1
                max_depth = max(max_depth, depth_map[dependent])
                queue.append(dependent)

    # Remove the node itself from affected set
    affected.discard(node_id)

    # Build affected file list
    node_lookup = {}
    for n in nodes_raw.data:
        node_lookup[n["node_id"]] = n

    affected_files = []
    feature_set = set()
    for aid in affected:
        n = node_lookup.get(aid)
        if n:
            affected_files.append({
                "node_id": aid,
                "label": n["label"],
                "type": n["type"],
            })
            # Derive feature name from file label
            label = n["label"]
            stem = label.split("/")[-1].rsplit(".", 1)[0] if "." in label else label
            stem = stem.replace("_", " ").replace("-", " ").title()
            feature_set.add(stem)

    count = len(affected_files)

    # Compute risk level
    if count == 0:
        risk = "Low"
    elif count <= 2 and max_depth <= 1:
        risk = "Low"
    elif count <= 5 and max_depth <= 2:
        risk = "Medium"
    else:
        risk = "High"

    # Confidence based on edge coverage of total nodes
    total_edges = len(edges_raw.data or [])
    confidence = min(0.95, round(count / max(1, len(nodes_raw.data)) * 0.5 + min(total_edges, 50) / 50 * 0.5, 2))

    result = {
        "risk": risk,
        "affected_files": affected_files,
        "affected_features": sorted(feature_set),
        "dependency_depth": max_depth,
        "confidence": confidence,
        "total_affected": count,
    }

    logger.info(
        "Impact analysis for %s in repo %s: risk=%s affected=%d depth=%s confidence=%s",
        node_id, repository_id, risk, count, max_depth, confidence,
    )

    return result
