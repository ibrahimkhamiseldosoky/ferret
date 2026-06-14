import logging
from collections import defaultdict, deque
from app.core.database import get_supabase
from app.services.cache import cache

logger = logging.getLogger(__name__)


def _is_entry_point(label: str, file_path: str) -> bool:
    name = label.lower()
    path = file_path.lower()
    entry_patterns = ["main.py", "app.ts", "app.js", "index.tsx", "index.jsx", "index.ts", "index.js", "server.py", "application.py"]
    for pat in entry_patterns:
        if path.endswith(pat) or name == pat:
            return True
    return False


def _is_config(label: str, file_path: str) -> bool:
    path = file_path.lower()
    name = label.lower()
    config_patterns = ["settings", "config", "configuration", "env", "environment"]
    for pat in config_patterns:
        if pat in path or pat == name:
            return True
    return False


def _is_test(label: str, file_path: str) -> bool:
    path = file_path.lower()
    return "test" in path or "spec" in path


def _is_infrastructure(label: str, file_path: str) -> bool:
    path = file_path.lower()
    keywords = ["database", "db", "schema", "migration", "orm", "cache", "redis", "queue", "celery"]
    return any(k in path for k in keywords)


def _is_model(label: str, file_path: str) -> bool:
    path = file_path.lower()
    keywords = ["model", "entity", "domain"]
    return any(k in path for k in keywords)


def _is_service(label: str, file_path: str) -> bool:
    path = file_path.lower()
    keywords = ["service", "business", "logic"]
    return any(k in path for k in keywords)


def _is_route(label: str, file_path: str) -> bool:
    path = file_path.lower()
    keywords = ["route", "api", "controller", "handler", "endpoint", "view"]
    return any(k in path for k in keywords)


def _is_utility(label: str, file_path: str) -> bool:
    path = file_path.lower()
    keywords = ["util", "helper", "common", "shared", "middleware", "decorator"]
    return any(k in path for k in keywords)


def _categorize_node(label: str, file_path: str) -> int:
    if _is_entry_point(label, file_path):
        return 0
    if _is_config(label, file_path):
        return 1
    if _is_infrastructure(label, file_path):
        return 2
    if _is_model(label, file_path):
        return 3
    if _is_service(label, file_path):
        return 4
    if _is_route(label, file_path):
        return 5
    if _is_utility(label, file_path):
        return 6
    if _is_test(label, file_path):
        return 8
    return 7


def compute_reading_order(repository_id: str) -> list[dict]:
    cached = cache.get(repository_id, "reading_order")
    if cached is not None:
        return cached
    supabase = get_supabase()
    nodes_raw = supabase.table("nodes").select("node_id,label,type,data").eq("repository_id", repository_id).execute()
    edges_raw = supabase.table("edges").select("source_id,target_id").eq("repository_id", repository_id).execute()

    node_list = nodes_raw.data or []
    edges_list = [(e["source_id"], e["target_id"]) for e in (edges_raw.data or [])]

    if not node_list:
        return []

    node_ids = {n["node_id"] for n in node_list}

    file_path_of = {}
    for n in node_list:
        data = n.get("data", {})
        fp = data.get("filePath", n["label"]) if isinstance(data, dict) else n["label"]
        file_path_of[n["node_id"]] = fp

    out_degree = defaultdict(int)
    dependents = defaultdict(list)
    for src, tgt in edges_list:
        if src in node_ids and tgt in node_ids:
            out_degree[src] += 1
            dependents[tgt].append(src)

    entry_points_found = []
    for n in node_list:
        fp = file_path_of.get(n["node_id"], n["label"])
        if _is_entry_point(n["label"], fp):
            entry_points_found.append(n["node_id"])

    test_nodes = {n["node_id"] for n in node_list if _is_test(n["label"], file_path_of.get(n["node_id"], n["label"]))}

    queue = deque(nid for nid in node_ids if out_degree.get(nid, 0) == 0)
    topological = []
    while queue:
        nid = queue.popleft()
        topological.append(nid)
        for dep in dependents.get(nid, []):
            out_degree[dep] -= 1
            if out_degree[dep] == 0:
                queue.append(dep)

    remaining = node_ids - set(topological)
    topological.extend(remaining)

    categorized: dict[int, list[dict]] = defaultdict(list)
    for nid in topological:
        n = next((x for x in node_list if x["node_id"] == nid), None)
        if not n:
            continue
        fp = file_path_of.get(nid, n["label"])
        cat = _categorize_node(n["label"], fp)
        categorized[cat].append(nid)

    ordered = []
    for cat in sorted(categorized):
        for nid in categorized[cat]:
            if nid not in test_nodes:
                n = next(x for x in node_list if x["node_id"] == nid)
                fp = file_path_of.get(nid, n["label"])
                ordered.append(nid)

    for nid in test_nodes:
        n = next(x for x in node_list if x["node_id"] == nid)
        fp = file_path_of.get(nid, n["label"])
        ordered.append(nid)

    seen = set()
    deduped = []
    for nid in ordered:
        if nid not in seen:
            seen.add(nid)
            deduped.append(nid)
    ordered = deduped[:10]

    def _reason(nid: str) -> str:
        n = next(x for x in node_list if x["node_id"] == nid)
        fp = file_path_of.get(nid, n["label"])
        if _is_entry_point(n["label"], fp):
            return "Entry point — application starts here"
        if _is_config(n["label"], fp):
            return "Configuration and environment settings"
        if _is_infrastructure(n["label"], fp):
            return "Infrastructure layer (database, cache, etc.)"
        if _is_model(n["label"], fp):
            return "Domain models and data entities"
        if _is_service(n["label"], fp):
            return "Business logic services"
        if _is_route(n["label"], fp):
            return "API routes and request handlers"
        if _is_utility(n["label"], fp):
            return "Utilities and cross-cutting concerns"
        if _is_test(n["label"], fp):
            return "Test coverage and verification"
        dep_count = len(dependents.get(nid, []))
        if dep_count > 2:
            return f"Core file with {dep_count} dependents"
        return "Supporting file"

    def _tags(nid: str) -> list[str]:
        n = next(x for x in node_list if x["node_id"] == nid)
        fp = file_path_of.get(nid, n["label"])
        tags = []
        if _is_entry_point(n["label"], fp):
            tags.append("entrypoint")
        if _is_config(n["label"], fp):
            tags.append("config")
        if _is_infrastructure(n["label"], fp):
            tags.append("infrastructure")
        if _is_model(n["label"], fp):
            tags.append("models")
        if _is_service(n["label"], fp):
            tags.append("service")
        if _is_route(n["label"], fp):
            tags.append("routing")
        if _is_utility(n["label"], fp):
            tags.append("utility")
        if _is_test(n["label"], fp):
            tags.append("testing")
        if not tags:
            tags.append("file")
        return tags

    result = [{
        "node_id": nid,
        "reason": _reason(nid),
        "tags": _tags(nid),
        "estimated_minutes": 5,
    } for nid in ordered]
    cache.set(repository_id, "reading_order", result)
    return result
