import logging
from collections import defaultdict
from app.core.database import get_supabase

logger = logging.getLogger(__name__)


def _fetch_graph(repository_id: str) -> tuple[list[dict], list[dict], dict[str, dict], dict[str, list[str]], dict[str, list[str]]]:
    supabase = get_supabase()
    nodes_raw = supabase.table("nodes").select("node_id,label,type,data").eq("repository_id", repository_id).execute()
    edges_raw = supabase.table("edges").select("source_id,target_id,label").eq("repository_id", repository_id).execute()
    nodes = nodes_raw.data or []
    edges = [(e["source_id"], e["target_id"], e.get("label", "")) for e in (edges_raw.data or [])]
    node_map = {n["node_id"]: n for n in nodes}

    outgoing = defaultdict(list)
    incoming = defaultdict(list)
    for src, tgt, lbl in edges:
        outgoing[src].append((tgt, lbl))
        incoming[tgt].append((src, lbl))

    return nodes, edges, node_map, dict(outgoing), dict(incoming)


def find_entrypoints(repository_id: str) -> dict:
    nodes, edges, node_map, outgoing, incoming = _fetch_graph(repository_id)
    entry_patterns = ["main.py", "app.ts", "app.js", "index.tsx", "index.jsx", "server.py", "application.py"]

    entry_nodes = []
    for nid, n in node_map.items():
        data = n.get("data") or {}
        fp = data.get("filePath", n["label"]) if isinstance(data, dict) else n["label"]
        if any(fp.lower().endswith(p) for p in entry_patterns):
            entry_nodes.append(n)

    entry_node_ids = {n["node_id"] for n in entry_nodes}

    deps = []
    for nid in entry_node_ids:
        for tgt, lbl in outgoing.get(nid, []):
            tn = node_map.get(tgt)
            if tn:
                deps.append({"from": tn["label"], "to": n["label"] if n["node_id"] == nid else "", "label": lbl})

    return {
        "intent": "entrypoints",
        "title": "Entry Points",
        "description": f"Found {len(entry_nodes)} entry point(s)",
        "nodes": [{"node_id": n["node_id"], "label": n["label"], "type": n["type"]} for n in entry_nodes],
        "direct_dependents": deps,
    }


def find_unused_nodes(repository_id: str) -> dict:
    nodes, edges, node_map, outgoing, incoming = _fetch_graph(repository_id)
    entry_patterns = ["main.py", "app.ts", "app.js", "index.tsx", "index.jsx", "server.py", "application.py"]

    unused = []
    for nid, n in node_map.items():
        if n.get("type") in ("external",):
            continue
        data = n.get("data") or {}
        fp = data.get("filePath", n["label"]) if isinstance(data, dict) else n["label"]
        if any(fp.lower().endswith(p) for p in entry_patterns):
            continue
        if "test" in fp.lower() or "spec" in fp.lower():
            continue
        inc = incoming.get(nid, [])
        if len(inc) == 0:
            unused.append({"node_id": nid, "label": n["label"], "type": n["type"]})

    return {
        "intent": "unused_code",
        "title": "Potentially Unused Files",
        "description": f"Found {len(unused)} file(s) with no incoming dependencies (excluding entry points and tests)",
        "nodes": unused,
    }


def find_external_dependencies(repository_id: str) -> dict:
    nodes, edges, node_map, outgoing, incoming = _fetch_graph(repository_id)

    external_map = defaultdict(list)
    for src, tgt, lbl in edges:
        if lbl == "external_dep":
            tn = node_map.get(tgt)
            sn = node_map.get(src)
            external_map[tgt].append(src)

    deps = []
    for ext_id, sources in external_map.items():
        ext_name = ext_id.replace("external:", "", 1) if ext_id.startswith("external:") else ext_id
        source_labels = [node_map.get(s, {}).get("label", s) for s in sources]
        deps.append({
            "external_name": ext_name,
            "used_by": source_labels,
            "usage_count": len(sources),
        })

    deps.sort(key=lambda d: d["usage_count"], reverse=True)

    return {
        "intent": "external_deps",
        "title": "External Dependencies",
        "description": f"Found {len(deps)} external dependencies",
        "dependencies": deps,
    }


def find_auth_flow(repository_id: str) -> dict:
    nodes, edges, node_map, outgoing, incoming = _fetch_graph(repository_id)

    auth_keywords = ["auth", "login", "token", "jwt", "session", "oauth", "password", "user"]
    auth_node_ids = set()

    for nid, n in node_map.items():
        data = n.get("data") or {}
        fp = data.get("filePath", n["label"]) if isinstance(data, dict) else n["label"]
        label_lower = n["label"].lower()
        fp_lower = fp.lower()
        if any(k in label_lower or k in fp_lower for k in auth_keywords):
            auth_node_ids.add(nid)

    if not auth_node_ids:
        nodes_data = []
        edges_data = []
    else:
        reachable = set(auth_node_ids)
        for nid in list(auth_node_ids):
            for tgt, _ in outgoing.get(nid, []):
                reachable.add(tgt)
            for src, _ in incoming.get(nid, []):
                reachable.add(src)

        nodes_data = []
        for nid in reachable:
            n = node_map.get(nid)
            if n:
                nodes_data.append({"node_id": nid, "label": n["label"], "type": n["type"]})

        edges_data = []
        for src, tgt, lbl in edges:
            if src in reachable and tgt in reachable:
                sn = node_map.get(src)
                tn = node_map.get(tgt)
                edges_data.append({
                    "source": sn["label"] if sn else src,
                    "target": tn["label"] if tn else tgt,
                    "label": lbl,
                })

    return {
        "intent": "auth_flow",
        "title": "Authentication Flow",
        "description": f"Found {len(auth_node_ids)} auth-related files" if auth_node_ids else "No auth-related files detected",
        "nodes": nodes_data,
        "edges": edges_data,
    }


def find_db_interactions(repository_id: str) -> dict:
    nodes, edges, node_map, outgoing, incoming = _fetch_graph(repository_id)

    db_keywords = ["db", "database", "schema", "migration", "sql", "orm", "model", "entity"]
    db_node_ids = set()

    for nid, n in node_map.items():
        data = n.get("data") or {}
        fp = data.get("filePath", n["label"]) if isinstance(data, dict) else n["label"]
        if any(k in n["label"].lower() or k in fp.lower() for k in db_keywords):
            db_node_ids.add(nid)

    if not db_node_ids:
        return {
            "intent": "db_interactions",
            "title": "Database Interactions",
            "description": "No database-related files detected",
            "nodes": [],
            "edges": [],
        }

    interactors = set()
    for nid in db_node_ids:
        for src, _ in incoming.get(nid, []):
            interactors.add(src)
        for tgt, _ in outgoing.get(nid, []):
            interactors.add(tgt)
    interactors.update(db_node_ids)

    nodes_data = []
    for nid in interactors:
        n = node_map.get(nid)
        if n:
            nodes_data.append({"node_id": nid, "label": n["label"], "type": n["type"]})

    edges_data = []
    for src, tgt, lbl in edges:
        if src in interactors and tgt in interactors:
            sn = node_map.get(src)
            tn = node_map.get(tgt)
            edges_data.append({
                "source": sn["label"] if sn else src,
                "target": tn["label"] if tn else tgt,
                "label": lbl,
            })

    return {
        "intent": "db_interactions",
        "title": "Database Interactions",
        "description": f"Found {len(db_node_ids)} database-related files with {len(interactors) - len(db_node_ids)} interacting files",
        "nodes": nodes_data,
        "edges": edges_data,
    }


def find_request_flow(repository_id: str) -> dict:
    nodes, edges, node_map, outgoing, incoming = _fetch_graph(repository_id)

    entry_patterns = ["main.py", "app.ts", "app.js", "index.tsx", "index.jsx", "server.py"]
    route_patterns = ["router", "route", "api", "controller", "handler", "endpoint", "view"]
    service_patterns = ["service", "business"]
    model_patterns = ["model", "entity", "schema"]

    entry_nodes = []
    route_nodes = []
    service_nodes = []
    model_nodes = []

    for nid, n in node_map.items():
        data = n.get("data") or {}
        fp = data.get("filePath", n["label"]) if isinstance(data, dict) else n["label"]
        fl = fp.lower()
        if any(fl.endswith(p) for p in entry_patterns):
            entry_nodes.append(n)
        if any(k in fl for k in route_patterns):
            route_nodes.append(n)
        if any(k in fl for k in service_patterns):
            service_nodes.append(n)
        if any(k in fl for k in model_patterns):
            model_nodes.append(n)

    relevant = set()
    for group in [entry_nodes, route_nodes, service_nodes, model_nodes]:
        for n in group:
            relevant.add(n["node_id"])

    nodes_data = [{"node_id": n["node_id"], "label": n["label"], "type": n["type"]} for nid in relevant for n in [node_map[nid]]]
    edges_data = []
    for src, tgt, lbl in edges:
        if src in relevant and tgt in relevant:
            sn = node_map.get(src)
            tn = node_map.get(tgt)
            edges_data.append({"source": sn["label"] if sn else src, "target": tn["label"] if tn else tgt, "label": lbl})

    return {
        "intent": "request_flow",
        "title": "Request Flow",
        "description": f"Entry: {len(entry_nodes)}, Routes: {len(route_nodes)}, Services: {len(service_nodes)}, Models: {len(model_nodes)}",
        "nodes": nodes_data,
        "edges": edges_data,
    }
