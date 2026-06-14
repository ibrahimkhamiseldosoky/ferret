import logging
from collections import defaultdict
from app.core.database import get_supabase
from app.parsers.ast_parser import parse_file

logger = logging.getLogger(__name__)


def get_symbols(repository_id: str, node_id: str) -> dict:
    supabase = get_supabase()

    nodes = supabase.table("nodes").select("node_id,data").eq("repository_id", repository_id).execute()
    edges = supabase.table("edges").select("source_id,target_id,label").eq("repository_id", repository_id).execute()

    if not nodes.data:
        raise ValueError("No graph data found")

    target_node = None
    for n in nodes.data:
        if n["node_id"] == node_id:
            target_node = n
            break

    if not target_node:
        raise ValueError("Node not found")

    data = target_node.get("data") or {}
    raw_symbols = data.get("symbols", []) if isinstance(data, dict) else []

    functions = []
    classes = []
    for sym in raw_symbols:
        if sym["type"] == "function":
            functions.append({
                "name": sym["name"],
                "line": sym.get("line", 0),
                "calls": sym.get("calls", []),
            })
        elif sym["type"] == "class":
            classes.append({
                "name": sym["name"],
                "line": sym.get("line", 0),
                "methods": sym.get("calls", []),
            })

    # Build a map: function name -> list of functions that call it
    called_by = defaultdict(list)
    for fn in functions:
        for call in fn.get("calls", []):
            called_by[call["name"]].append({
                "caller": fn["name"],
                "line": call["line"],
            })
    for cls in classes:
        for method in cls.get("methods", []):
            for call in method.get("calls", []):
                called_by[call["name"]].append({
                    "caller": f"{cls['name']}.{method['name']}",
                    "line": call["line"],
                })

    # Add called_by to each function
    for fn in functions:
        fn["called_by"] = called_by.get(fn["name"], [])

    result = {
        "node_id": node_id,
        "label": target_node.get("label", ""),
        "type": target_node.get("type", ""),
        "functions": functions,
        "classes": classes,
    }

    logger.info("Symbols fetched for %s: %d functions, %d classes", node_id, len(functions), len(classes))
    return result


def get_call_chain(repository_id: str, node_id: str, function_name: str) -> dict:
    supabase = get_supabase()
    nodes = supabase.table("nodes").select("node_id,label,data").eq("repository_id", repository_id).execute()

    if not nodes.data:
        raise ValueError("No graph data found")

    # Build function-to-file index across all nodes
    # Maps: function_name -> list of { node_id, label, line }
    func_index = defaultdict(list)
    for n in nodes.data:
        data = n.get("data") or {}
        raw_symbols = data.get("symbols", []) if isinstance(data, dict) else []
        for sym in raw_symbols:
            if sym["type"] == "function":
                func_index[sym["name"]].append({
                    "node_id": n["node_id"],
                    "label": n["label"],
                    "line": sym.get("line", 0),
                })
            elif sym["type"] == "class":
                for m in sym.get("calls", []):
                    func_index[m["name"]].append({
                        "node_id": n["node_id"],
                        "label": n["label"],
                        "line": m.get("line", 0),
                    })

    target_node = None
    for n in nodes.data:
        if n["node_id"] == node_id:
            target_node = n
            break

    if not target_node:
        raise ValueError("Node not found")

    data = target_node.get("data") or {}
    if not isinstance(data, dict):
        data = {}

    raw_symbols = data.get("symbols", []) if isinstance(data, dict) else []

    # If stored symbols lack call info, re-parse from sourceContent
    has_call_info = any(s.get("calls") for s in raw_symbols if s["type"] == "function")
    if not has_call_info:
        source_content = data.get("sourceContent", "")
        if source_content:
            raw_symbols = [s.to_dict() for s in parse_file(node_id, source_content)]
            # Update stored data for future queries
            try:
                supabase.table("nodes").update({"data": {**data, "symbols": raw_symbols}}).eq("node_id", node_id).eq("repository_id", repository_id).execute()
            except Exception:
                pass

    function_calls = []
    for sym in raw_symbols:
        if sym["type"] == "function" and sym["name"] == function_name:
            function_calls = sym.get("calls", [])
            break
        if sym["type"] == "class":
            for m in sym.get("calls", []):
                if m["name"] == function_name:
                    function_calls = m.get("calls", [])
                    break

    # Resolve each call to a file node
    chain = []
    resolved_node_ids = set()
    for call in function_calls:
        callee_name = call["name"]
        definitions = func_index.get(callee_name, [])
        if definitions:
            for defn in definitions:
                chain.append({
                    "caller_func": function_name,
                    "callee_func": callee_name,
                    "callee_node_id": defn["node_id"],
                    "callee_label": defn["label"],
                    "callee_line": defn["line"],
                    "call_line": call["line"],
                })
                resolved_node_ids.add(defn["node_id"])
        else:
            chain.append({
                "caller_func": function_name,
                "callee_func": callee_name,
                "callee_node_id": None,
                "callee_label": f"{callee_name} (external)",
                "callee_line": None,
                "call_line": call["line"],
            })

    logger.info(
        "Call chain for %s.%s: %d resolved calls, %d unique files",
        node_id, function_name, len(chain), len(resolved_node_ids),
    )

    return {
        "function_name": function_name,
        "source_node_id": node_id,
        "source_label": target_node.get("label", ""),
        "chain": chain,
        "highlighted_node_ids": list(resolved_node_ids),
    }
