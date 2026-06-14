from pathlib import Path
from typing import List
from app.models.graph import GraphNode, GraphEdge, ArchitectureGraph


def _is_service_dir(path: Path, all_dirs: set[Path]) -> bool:
    if not path.is_dir():
        return False
    has_init = (path / "__init__.py").exists() or (path / "index.js").exists() or (path / "index.ts").exists()
    return has_init or path.name in ("services", "api", "controllers", "routes", "handlers")


def _is_db_file(path: Path) -> bool:
    name = path.stem.lower()
    return any(kw in name for kw in ("db", "database", "schema", "migration", "model", "entity"))


def build_graph(
    files: list[Path],
    all_symbols: dict[str, list[dict]],
    edges: list[dict],
    all_contents: dict[str, str] = None,
) -> ArchitectureGraph:
    nodes: list[GraphNode] = []
    node_ids: set[str] = set()
    edge_objects: list[GraphEdge] = []
    seen_edges: set[tuple[str, str, str]] = set()

    dirs = {p.parent for p in files if p.parent != Path(".")}
    file_node_count = 0

    node_id_map = {}

    for file_path in files:
        fp_str = str(file_path)
        node_id = f"file:{fp_str}"

        symbols = all_symbols.get(fp_str, [])
        has_api = any(s["type"] == "api_endpoint" for s in symbols)
        has_class = any(s["type"] == "class" for s in symbols)
        is_db = _is_db_file(file_path)

        if is_db:
            node_type = "database"
        elif has_api:
            node_type = "api"
        elif has_class:
            node_type = "service"
        else:
            node_type = "file"

        try:
            file_size = file_path.stat().st_size
        except OSError:
            file_size = 0

        content = (all_contents or {}).get(fp_str, "")
        node = GraphNode(
            id=node_id,
            label=file_path.name,
            type=node_type,
            data={
                "filePath": fp_str,
                "symbols": symbols,
                "sourceContent": content,
                "fileSize": file_size,
                "symbolCount": len(symbols),
            },
        )
        nodes.append(node)
        node_ids.add(node_id)
        node_id_map[fp_str] = node_id
        file_node_count += 1

    for d in dirs:
        if _is_service_dir(d, dirs):
            dir_node_id = f"dir:{d}"
            if dir_node_id not in node_ids:
                children = [p for p in files if p.parent == d]
                node = GraphNode(
                    id=dir_node_id,
                    label=d.name,
                    type="service",
                    data={"path": str(d), "children": len(children)},
                )
                nodes.append(node)
                node_ids.add(dir_node_id)
                for child in children:
                    child_id = node_id_map.get(str(child))
                    if child_id:
                        edge_key = (dir_node_id, child_id, "contains")
                        if edge_key not in seen_edges:
                            edge_objects.append(GraphEdge(
                                source_id=dir_node_id,
                                target_id=child_id,
                                label="contains",
                            ))
                            seen_edges.add(edge_key)

    for edge_data in edges:
        source = node_id_map.get(edge_data["source"])
        target = node_id_map.get(edge_data["target"])
        if source and target:
            edge_key = (source, target, edge_data.get("label", ""))
            if edge_key not in seen_edges:
                edge_objects.append(GraphEdge(
                    source_id=source,
                    target_id=target,
                    label=edge_data.get("label"),
                ))
                seen_edges.add(edge_key)

    import_counts: dict[str, int] = {}
    for edge in edge_objects:
        import_counts[edge.source_id] = import_counts.get(edge.source_id, 0) + 1
        import_counts[edge.target_id] = import_counts.get(edge.target_id, 0) + 1

    for node in nodes:
        node.data["importCount"] = import_counts.get(node.id, 0)

    _auto_layout(nodes)

    return ArchitectureGraph(nodes=nodes, edges=edge_objects)


def _auto_layout(nodes: List[GraphNode]) -> None:
    cols = 6
    for i, node in enumerate(nodes):
        node.position_x = (i % cols) * 280 + 40
        node.position_y = (i // cols) * 180 + 40
