# Graph Layout Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed grid-per-directory layout with a constraint-hierarchical force-directed layout that minimizes edge length, eliminates wasted whitespace, and prevents overlap.

**Architecture:** A Python force simulation with 5-step iteration loop (Edge → Repulsion → Local Springs → Collision → Damping) runs during backend analysis, storing positions in the existing `position_x`/`position_y` fields. Frontend updated to trust backend positions and fix the fallback layout bug.

**Tech Stack:** Python 3 (no external deps — pure math), TypeScript / React Flow, dagre (existing frontend dependency)

---

### Task 1: Add node dimension estimation utility

**Files:**
- Modify: `backend/app/parsers/graph_builder.py` (top of file)

- [ ] **Step 1: Add `estimate_node_size()` helper**

```python
from typing import List, Tuple


def estimate_node_size(label: str) -> Tuple[int, int]:
    width = max(120, min(180, len(label) * 8 + 24))
    height = 36
    return (width, height)
```

Place this near the top of `graph_builder.py`, before `_is_service_dir`.

---

### Task 2: Add edge weight mapping

**Files:**
- Modify: `backend/app/parsers/graph_builder.py` (after `estimate_node_size`)

- [ ] **Step 1: Add `_get_edge_weight()` helper**

```python
def _get_edge_weight(label: str | None) -> float:
    if label is None:
        return 1.0
    mapping = {
        "imports": 1.0,
        "external_dep": 0.5,
        "contains": 0.0,
    }
    return mapping.get(label, 1.0)
```

This maps existing edge labels to attraction weights. The framework is ready for future edge types (function calls, API calls, DB access) as they get added to the parsers.

---

### Task 3: Implement the force simulation core

**Files:**
- Modify: `backend/app/parsers/graph_builder.py`
  - Replace `_auto_layout(nodes)` with `_layout_graph(nodes, edges)`
  - Update call site in `build_graph()` to pass edges

- [ ] **Step 1: Replace `_auto_layout()` with `_layout_graph()`**

Remove the existing `_auto_layout` function (lines 126-141) and replace with:

```python
import math
from collections import defaultdict


def _layout_graph(nodes: List[GraphNode], edges: List[GraphEdge]) -> None:
    if not nodes:
        return

    # Initialize positions with small random offsets
    rng = random.Random(42)  # deterministic seed
    for i, node in enumerate(nodes):
        if node.position_x == 0 and node.position_y == 0:
            cols = max(1, int(math.sqrt(len(nodes))))
            node.position_x = (i % cols) * 100 + rng.uniform(-10, 10)
            node.position_y = (i // cols) * 100 + rng.uniform(-10, 10)

    # Precompute node dimensions
    node_sizes = {n.id: estimate_node_size(n.label) for n in nodes}
    node_map = {n.id: n for n in nodes}

    # Group nodes by parent directory
    dir_groups = defaultdict(list)
    for node in nodes:
        fp = (node.data or {}).get("filePath", "") or (node.data or {}).get("path", "")
        parent = str(Path(fp).parent) if fp else ""
        dir_groups[parent].append(node.id)

    # Pre-compute edge weights
    edge_forces = []
    for e in edges:
        w = _get_edge_weight(e.label)
        if w > 0:
            edge_forces.append((e.source_id, e.target_id, w))

    n = len(nodes)
    max_iterations = min(60, max(20, int(40 * math.log2(n + 1) / math.log2(51))))

    # Adaptive parameters
    canvas_area = 800000  # ~1000x800 heuristic
    k = math.sqrt(canvas_area / max(n, 1))
    ideal_length = 150 + math.log2(n + 1) * 50

    velocities = {node.id: (0.0, 0.0) for node in nodes}

    for iteration in range(max_iterations):
        forces = {node.id: (0.0, 0.0) for node in nodes}

        # Step 1: Edge attraction (structural backbone)
        for src_id, tgt_id, weight in edge_forces:
            if src_id not in node_map or tgt_id not in node_map:
                continue
            sx, sy = node_map[src_id].position_x, node_map[src_id].position_y
            tx, ty = node_map[tgt_id].position_x, node_map[tgt_id].position_y
            dx = tx - sx
            dy = ty - sy
            dist = math.hypot(dx, dy)
            if dist < 1:
                dist = 1
            displacement = (dist - ideal_length) * weight * 0.1
            fx = (dx / dist) * displacement
            fy = (dy / dist) * displacement
            fx_src, fy_src = forces[src_id]
            fx_tgt, fy_tgt = forces[tgt_id]
            forces[src_id] = (fx_src + fx, fy_src + fy)
            forces[tgt_id] = (fx_tgt - fx, fy_tgt - fy)

        # Step 2: Global repulsion (spacing)
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

        # Step 3: Soft grouping (local directory springs only)
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
                    if dist < 1 or dist > ideal_length * 1.5:
                        continue
                    # Very weak spring — only nearest neighbors within ideal range
                    spring = (dist - 80) * 0.02
                    if dist < 1:
                        dist = 1
                    fx = (dx / dist) * spring
                    fy = (dy / dist) * spring
                    fa_x, fa_y = forces[id_a]
                    fb_x, fb_y = forces[id_b]
                    forces[id_a] = (fa_x + fx, fa_y + fy)
                    forces[id_b] = (fb_x - fx, fb_y - fy)

        # Step 4: Center gravity (stability)
        for node_id in node_map:
            nx = node_map[node_id].position_x
            ny = node_map[node_id].position_y
            f = 0.01 * n
            fx, fy = forces[node_id]
            forces[node_id] = (fx - nx * f, fy - ny * f)

        # Step 5: Apply forces with damping
        damping = 0.85 - 0.25 * (iteration / max_iterations)
        total_energy = 0.0
        for node_id in node_map:
            fx, fy = forces[node_id]
            vx, vy = velocities[node_id]
            vx = (vx + fx) * damping
            vy = (vy + fy) * damping
            velocities[node_id] = (vx, vy)
            node_map[node_id].position_x += vx
            node_map[node_id].position_y += vy
            total_energy += abs(vx) + abs(vy)

        # Step 6: Collision resolution (hard constraint)
        for _ in range(5):  # up to 5 sub-iterations to resolve overlaps
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
                        overlap_x += 8  # margin
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

        # Early convergence check
        if total_energy < 0.01 * n:
            break
```

- [ ] **Step 2: Update call site in `build_graph()`**

Change line 121 from:
```python
_auto_layout(nodes)
```
to:
```python
_layout_graph(nodes, edge_objects)
```

Also update the function import: add `List` to imports (should already be there), and add `random` and `math` imports if not present.

Add `import random` at the top of the file (pathlib and typing are already imported).

---

### Task 4: Update frontend `layoutNodes()` fallback

**Files:**
- Modify: `frontend/src/components/ArchitectureGraph.tsx`

- [ ] **Step 1: Fix the `layoutNodes()` function**

Replace the existing `layoutNodes` (lines 95-106) with:

```typescript
function layoutNodes(nodes: GraphNode[]): GraphNode[] {
  if (nodes.length === 0) return nodes;

  const hasMissing = (n: GraphNode) =>
    n.position == null || (n.position.x === 0 && n.position.y === 0);

  const missingCount = nodes.filter(hasMissing).length;
  if (missingCount === 0) return nodes;

  // Only re-layout nodes that actually lack positions
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  return nodes.map((n, i) => ({
    ...n,
    position: hasMissing(n)
      ? { x: (i % cols) * 280 + 40, y: Math.floor(i / cols) * 180 + 40 }
      : n.position!,
  }));
}
```

Key fix: was replacing ALL positions if ANY node was missing; now only replaces positions for nodes that actually lack them.

- [ ] **Step 2: Remove the inline fallback in `flowNodes` useMemo**

In the `flowNodes` useMemo (line 221), remove this inline fallback:
```typescript
position: n.position?.x != null ? n.position : { x: (idx % 5) * 240 + 40, y: Math.floor(idx / 5) * 160 + 40 },
```

Replace with:
```typescript
position: n.position || { x: 0, y: 0 },
```

Since `layoutNodes()` already guarantees all nodes have positions, this expression should never actually hit the fallback — but keep the fallback for type safety.

- [ ] **Step 3: Verify the change**

Check that: (a) `layoutNodes` is still called in the `flowNodes` useMemo at line 193, (b) the import for `dagre` is not needed in this file (the fallback is just a grid, no dagre needed — dagre stays for SubGraphOverlay only).

---

### Task 5: Verify the layout runs correctly

- [ ] **Step 1: Run the backend lint/type check**

```powershell
cd backend
python -c "from app.parsers.graph_builder import _layout_graph; print('import OK')"
```

- [ ] **Step 2: Run a quick smoke test**

Create a minimal test script to verify the layout produces reasonable positions:

```powershell
cd backend
python -c "
from pathlib import Path
from app.parsers.graph_builder import build_graph
from app.parsers.dependency_extractor import extract_dependencies
from app.parsers.ast_parser import parse_python
import tempfile, os

# Create a small test repo
tmp = Path(tempfile.mkdtemp())
(tmp / 'src').mkdir()
(tmp / 'src/__init__.py').write_text('')
(tmp / 'src/main.py').write_text('import os\\nimport utils\\n')
(tmp / 'src/utils.py').write_text('def foo(): pass\\n')

# Build graph
files = list(tmp.rglob('*.py'))
all_symbols = {}
for f in files:
    all_symbols[str(f)] = [s.to_dict() for s in parse_python(str(f), f.read_text())]
edges = extract_dependencies(files, all_symbols)
graph = build_graph(files, all_symbols, edges)

# Check positions
for n in graph.nodes:
    assert isinstance(n.position_x, (int, float)), f'bad position_x for {n.id}'
    assert isinstance(n.position_y, (int, float)), f'bad position_y for {n.id}'
    assert not (n.position_x == 0 and n.position_y == 0), f'zero position for {n.id}'

print(f'OK: {len(graph.nodes)} nodes, {len(graph.edges)} edges, all positioned')
"
```

- [ ] **Step 3: Run the frontend type check**

```powershell
cd frontend
npx tsc --noEmit
```
