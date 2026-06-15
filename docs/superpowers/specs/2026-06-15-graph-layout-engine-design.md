# Graph Layout Engine: Constraint-Hierarchical Force Layout

**Date:** 2026-06-15
**Status:** Approved design

## Overview

Replace the simple grid-per-directory layout in the Ferret architecture graph with a production-grade layout engine that maximizes spatial efficiency, minimizes edge length, and preserves semantic directory grouping — without node overlap.

Uses a **constraint hierarchy** model instead of equal-force simulation, preventing instability from competing forces.

## Architecture

### Before
- `_auto_layout()` in `backend/app/parsers/graph_builder.py` — fixed grid grouped by directory (250px cols, 200px rows)
- `layoutNodes()` in `frontend/src/components/ArchitectureGraph.tsx` — fallback 6-column grid for missing positions
- Node positions stored in Supabase via `GraphNode.position_x` / `position_y`

### After
- `_layout_graph()` in `backend/app/parsers/graph_builder.py` — replaces `_auto_layout()`
- Same call site (`build_graph()` line 121), same storage path — no schema changes
- Frontend `layoutNodes()` updated to be a lightweight safety net

## Constraint Hierarchy

Three levels, strictly ordered. Higher levels never compromise for lower ones.

### Level 1: Hard Constraints (never violated)
- **No overlap** — collision resolution runs after every iteration
- Bounding box separation enforced with margin

### Level 2: Structural Constraints (authoritative)
- **Edge attraction** defines truth structure — weighted by edge type
- Dominates all other forces

### Level 3: Soft Constraints (guidance only, never override structure)
- **Local directory springs** — nearest-neighbor bonding within directories
- **Center gravity** — mild pull to prevent drift
- **Global repulsion** — aesthetic spacing, optimized with Barnes-Hut

## Iteration Loop (per iteration)

```
Step 1 — Edge Layout (dominant)
  Apply Hooke's law attraction on edges: F = (d - idealLength) * edgeWeight
  Weighted by edge type:
    Import / dependency       → 1.0
    Function call             → 2.0
    Service / API interaction → 3.0
    Database access           → 4.0
    "contains" (dir→file)     → 0.0 (skipped)
  This is the structural backbone — everything else adjusts around it.

Step 2 — Global Repulsion (spacing)
  Coulomb's law: F = k² / distance between all node pairs
  k is adaptive: k = sqrt(canvasArea / nodeCount)
  Barnes-Hut tree for > 200 nodes (O(n log n) instead of O(n²))
  Prevents collapse — nodes maintain breathing room.

Step 3 — Soft Grouping (local directory springs only)
  NO centroid attraction — that fights edge forces.
  Instead: for each directory, connect nearest-neighbor pairs within the
  directory with a very light spring (weight ~0.1 × edge weight).
  If directory bounding box stretches too wide, compress farthest pair
  across the diagonal — but only subtly.
  This preserves locality without fighting structure.

Step 4 — Collision Resolution (hard constraint)
  Scan all pairs for bounding box overlap.
  Push overlapping nodes apart along vector between centers.
  Overlap amount + 8px margin.
  Repeat scan until no overlaps remain.
  Non-negotiable — overrides all force offsets if needed.

Step 5 — Damping
  velocity *= 0.6–0.85
  Prevents oscillation and "breathing" artifacts.
```

## Adaptive Parameters

| Parameter | Formula | Notes |
|---|---|---|
| Ideal edge length | `150 + log2(nodeCount + 1) * 50` | ~170px (10 nodes) → ~300px (500 nodes) |
| Repulsion constant k | `sqrt((1000 * 800) / nodeCount)` | Canvas area heuristic |
| Max iterations | **40–60** | Diminishing returns beyond this |
| Damping factor | `0.85 - 0.25 × (iteration / maxIterations)` | Decays from 0.85 → 0.60 for stability |
| Convergence | Stop early when kinetic energy < 0.01 | Avoids wasted cycles on settled graphs |

## Node Dimension Estimation (Python)

```python
def estimate_node_size(label: str) -> tuple[int, int]:
    width = max(120, min(180, len(label) * 8 + 24))
    height = 36
    return (width, height)
```

Matches frontend rendering: `min-w-[120px] max-w-[180px]`, `py-2.5` ≈ 36px.

## Frontend Changes

### `layoutNodes()` in ArchitectureGraph.tsx
- Preserve backend positions when available
- For nodes without positions: use a **compact dagre-based fallback** (dagre already a dependency)
- Fix the `nodes.some()` bug that re-applies layout to ALL nodes if ANY one is missing positions
- Remove the inline grid fallback in the `flowNodes` useMemo (line 221) — backend positions are the source of truth

### `layoutSubGraph()` in SubGraphOverlay.tsx
- No changes needed — dagre layout for AI sub-graph overlays is independent

## Edge Cases

| Case | Handling |
|---|---|
| Single node | Centered at (0, 0) |
| Two connected nodes | Placed `idealLength` apart horizontally |
| Disconnected components | Each component clusters independently; repulsion handles spacing |
| Very large graph (1000+ nodes) | Barnes-Hut; 40 iterations cap; always produces valid (if not perfect) layout |
| All nodes same directory | Local directory springs become a web of weak bonds; edge forces dominate as expected |
| Zero edges | Pure repulsion + center gravity → uniform spherical spread |
| Contains edges only (dir→file) | Treated as structural hints; weight = 0, no force contribution |

## Verification

- **No overlap:** Guaranteed by collision resolution post-pass after every iteration
- **Edge length:** Average edge length within 20% of `idealLength` for weighted edges
- **Directory cohesion:** Average intra-directory distance < inter-directory distance
- **Stability:** Final iteration's kinetic energy < 0.01; no oscillation in last 10 frames
- **Performance:** Layout for 200-node graph completes in < 500ms on server-side Python
