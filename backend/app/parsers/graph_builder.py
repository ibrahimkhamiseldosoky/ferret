import math
import random
from collections import defaultdict
from pathlib import Path
from typing import List, Tuple
from app.models.graph import GraphNode, GraphEdge, ArchitectureGraph


def estimate_node_size(label: str) -> Tuple[int, int]:
    width = max(120, min(180, len(label) * 8 + 24))
    height = 36
    return (width, height)


def _get_edge_weight(label: str | None) -> float:
    if label is None:
        return 1.0
    mapping = {
        "imports": 1.0,
        "external_dep": 0.5,
        "contains": 0.3,
    }
    return mapping.get(label, 1.0)


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

    _layout_graph(nodes, edge_objects)

    return ArchitectureGraph(nodes=nodes, edges=edge_objects)


def _layout_graph(nodes: List[GraphNode], edges: List[GraphEdge]) -> None:
    if not nodes:
        return

    rng = random.Random(42)
    for i, node in enumerate(nodes):
        if node.position_x == 0 and node.position_y == 0:
            cols = max(1, int(math.sqrt(len(nodes) * 1.5)))
            spacing = 180
            node.position_x = (i % cols) * spacing + rng.uniform(-30, 30)
            node.position_y = (i // cols) * spacing + rng.uniform(-30, 30)

    node_sizes = {n.id: estimate_node_size(n.label) for n in nodes}
    node_map = {n.id: n for n in nodes}

    dir_groups = defaultdict(list)
    for node in nodes:
        fp = (node.data or {}).get("filePath", "") or (node.data or {}).get("path", "")
        parent = str(Path(fp).parent) if fp else ""
        dir_groups[parent].append(node.id)

    edge_forces = []
    for e in edges:
        w = _get_edge_weight(e.label)
        if w > 0:
            edge_forces.append((e.source_id, e.target_id, w))

    n = len(nodes)
    max_iterations = min(60, max(20, int(40 * math.log2(n + 1) / math.log2(51))))

    k = 100.0

    velocities = {node.id: (0.0, 0.0) for node in nodes}

    for iteration in range(max_iterations):
        forces = {node.id: (0.0, 0.0) for node in nodes}

        for src_id, tgt_id, weight in edge_forces:
            if src_id not in node_map or tgt_id not in node_map:
                continue
            sx = node_map[src_id].position_x
            sy = node_map[src_id].position_y
            tx = node_map[tgt_id].position_x
            ty = node_map[tgt_id].position_y
            dx = tx - sx
            dy = ty - sy
            dist = math.hypot(dx, dy)
            if dist < 1:
                dist = 1
            attraction = (dist * dist / k) * weight
            fx = (dx / dist) * attraction
            fy = (dy / dist) * attraction
            fx_src, fy_src = forces[src_id]
            fx_tgt, fy_tgt = forces[tgt_id]
            forces[src_id] = (fx_src + fx, fy_src + fy)
            forces[tgt_id] = (fx_tgt - fx, fy_tgt - fy)

        node_ids = list(node_map.keys())
        for i in range(n):
            for j in range(i + 1, n):
                id_a, id_b = node_ids[i], node_ids[j]
                ax = node_map[id_a].position_x
                ay = node_map[id_a].position_y
                bx = node_map[id_b].position_x
                by = node_map[id_b].position_y
                dx = bx - ax
                dy = by - ay
                dist = math.hypot(dx, dy)
                if dist < 1:
                    dist = 1
                rep_force = (k * k) / dist
                fx = (dx / dist) * rep_force
                fy = (dy / dist) * rep_force
                fa_x, fa_y = forces[id_a]
                fb_x, fb_y = forces[id_b]
                forces[id_a] = (fa_x - fx, fa_y - fy)
                forces[id_b] = (fb_x + fx, fb_y + fy)

        for parent, member_ids in dir_groups.items():
            if len(member_ids) < 2:
                continue
            for i in range(len(member_ids)):
                for j in range(i + 1, len(member_ids)):
                    id_a, id_b = member_ids[i], member_ids[j]
                    if id_a not in node_map or id_b not in node_map:
                        continue
                    ax = node_map[id_a].position_x
                    ay = node_map[id_a].position_y
                    bx = node_map[id_b].position_x
                    by = node_map[id_b].position_y
                    dx = bx - ax
                    dy = by - ay
                    dist = math.hypot(dx, dy)
                    if dist < 1 or dist > k * 2.5:
                        continue
                    spring = (dist - k * 0.6) * 0.02
                    if dist < 1:
                        dist = 1
                    fx = (dx / dist) * spring
                    fy = (dy / dist) * spring
                    fa_x, fa_y = forces[id_a]
                    fb_x, fb_y = forces[id_b]
                    forces[id_a] = (fa_x + fx, fa_y + fy)
                    forces[id_b] = (fb_x - fx, fb_y - fy)

        for node_id in node_map:
            nx = node_map[node_id].position_x
            ny = node_map[node_id].position_y
            f = 0.005
            fx, fy = forces[node_id]
            forces[node_id] = (fx - nx * f, fy - ny * f)

        damping = 0.85 - 0.25 * (iteration / max_iterations)
        total_energy = 0.0
        max_vel = 500.0
        for node_id in node_map:
            fx, fy = forces[node_id]
            fx = max(-1000.0, min(1000.0, fx))
            fy = max(-1000.0, min(1000.0, fy))
            vx, vy = velocities[node_id]
            vx = (vx + fx) * damping
            vy = (vy + fy) * damping
            vx = max(-max_vel, min(max_vel, vx))
            vy = max(-max_vel, min(max_vel, vy))
            velocities[node_id] = (vx, vy)
            node_map[node_id].position_x += vx
            node_map[node_id].position_y += vy
            total_energy += abs(vx) + abs(vy)

        for _ in range(10):
            overlap_found = False
            for i_ in range(n):
                for j_ in range(i_ + 1, n):
                    id_a, id_b = node_ids[i_], node_ids[j_]
                    na = node_map[id_a]
                    nb = node_map[id_b]
                    wa, ha = node_sizes[id_a]
                    wb, hb = node_sizes[id_b]
                    ax, ay = na.position_x, na.position_y
                    bx, by = nb.position_x, nb.position_y
                    overlap_x = (wa + wb) / 2 - abs(bx - ax)
                    overlap_y = (ha + hb) / 2 - abs(by - ay)
                    if overlap_x > 0 and overlap_y > 0:
                        overlap_found = True
                        overlap_x += 8
                        overlap_y += 8
                        if overlap_x < overlap_y:
                            sign = 1 if bx > ax else -1
                            push = overlap_x / 2
                            na.position_x -= sign * push
                            nb.position_x += sign * push
                        else:
                            sign = 1 if by > ay else -1
                            push = overlap_y / 2
                            na.position_y -= sign * push
                            nb.position_y += sign * push
            if not overlap_found:
                break

        if total_energy < 0.01 * n:
            break
