# AI-Driven Graph Control

## Overview

Allow the AI assistant to visually manipulate the architecture graph in real-time: highlight relevant parts of the existing graph and draw custom explanatory sub-graphs as overlays.

## Architecture

```
User Question
    ↓
Backend (Question Service)
  → Build context (nodes + edges + indices from DB)
  → Send to LLM with structured output JSON schema
    ↓
LLM Response (JSON) — intentions only, never final identifiers
    ↓
Backend Validator
  → Validate confidence, sizes, label lengths, edge refs
  → Clamp/drop invalid values
  → Set degraded_mode + warnings if anything was sanitized
    ↓
Backend Resolver
  → Build canonical index (full path → node_id)
  → Build alias index (filename → [node_ids]) as fallback
  → Resolve highlight_candidate → highlight_nodes
  → Resolve edge intentions (from/to) → real edge IDs
  → Resolve evidence file_hint → node_id + display_name
  → Namespace sub-graph node IDs
    ↓
Frontend
  → Render answer text with evidence (clickable)
  → Apply graph actions (highlight nodes, highlight edges, show sub-graph)
  → Show degraded mode indicator if present
```

## API Contract

### POST /{id}/ask — Response Shape

```json
{
  "schema_version": 1,
  "answer": "Authentication is handled by auth.py which verifies credentials against the database.",
  "confidence": 0.92,
  "degraded_mode": false,
  "evidence": [
    {
      "node_id": "file:backend/auth.py",
      "display_name": "auth.py",
      "type": "source",
      "reason": "Contains login endpoint",
      "relevance": 0.95
    },
    {
      "node_id": "file:backend/database.py",
      "display_name": "database.py",
      "type": "dependency",
      "reason": "Verifies user credentials",
      "relevance": 0.88
    }
  ],
  "graph_actions": [
    {
      "type": "highlight_nodes",
      "nodes": ["file:backend/auth.py", "file:backend/database.py"]
    },
    {
      "type": "highlight_edges",
      "edges": ["edge-uuid-abc123", "edge-uuid-def456"]
    },
    {
      "type": "show_subgraph",
      "graph": {
        "type": "request_flow",
        "title": "Login Flow",
        "nodes": [
          {"id": "subgraph:login_flow:client", "label": "Client", "type": "external"},
          {"id": "subgraph:login_flow:api", "label": "Auth API", "type": "api"},
          {"id": "subgraph:login_flow:db", "label": "Database", "type": "database"}
        ],
        "edges": [
          {"source": "subgraph:login_flow:client", "target": "subgraph:login_flow:api", "label": "POST /login"},
          {"source": "subgraph:login_flow:api", "target": "subgraph:login_flow:db", "label": "verify credentials"}
        ]
      }
    }
  ]
}
```

All fields except `answer` and `confidence` are optional. `graph_actions` array and `evidence` array are omitted entirely when not needed.

### LLM Prompt

System prompt instructs the LLM to respond ONLY in valid JSON matching the schema. Uses `response_format: { "type": "json_object" }` via OpenRouter/OpenAI.

Key rules the prompt must convey:
- **Never output node_ids directly.** Output `highlight_candidates` (filename hints) instead.
- **Never output edge IDs directly.** Output `edge_intents` as `{"from": "...", "to": "..."}` pairs instead.
- Evidence `file_hint` should be a filename, not a full path.
- Sub-graph node IDs should be simple unique labels (backend will namespace them).

The LLM produces **intentions only**. The backend owns all final identifiers.

## Backend Components

### Resolver (new module)

Two-level resolution for all LLM output that references files:

**Level 1 — Canonical index** (primary):
- Key: full relative path (e.g., `"backend/auth.py"`)
- Value: node_id (e.g., `"file:backend/auth.py"`)
- Built from the `label` field of all nodes in the repository

**Level 2 — Alias index** (fallback):
- Key: filename only (e.g., `"auth.py"`)
- Value: list of matching node_ids (e.g., `["file:backend/auth.py", "file:frontend/auth.py"]`)
- If one match → resolve
- If multiple matches → include all

Resolution priority:
1. Try canonical match first
2. Try alias match second
3. If no match → log warning, omit

**Edge resolution:**

LLM output:
```json
{"from": "auth.py", "to": "database.py"}
```

Resolver:
1. Resolve `from` → candidate node_ids
2. Resolve `to` → candidate node_ids
3. Search edges table for edges matching source in `from` candidates AND target in `to` candidates
4. Return resolved edge IDs

**Evidence resolution:**

LLM output:
```json
{"file_hint": "auth.py", "reason": "...", "relevance": 0.95}
```

Resolver:
1. Resolve file_hint to node_id(s)
2. Return `{node_id, display_name: filename, reason, relevance}`

**Sub-graph ID namespacing:**
- Each sub-graph node ID gets prefixed: `subgraph:<title_slug>:<original_id>`
- Title slug: lowercase, replace spaces/dashes with underscores, strip non-alphanumeric
- This prevents ID collisions when multiple sub-graphs or main graph nodes coexist

### Validator

Run on parsed LLM response before resolution:

| Check | Rule | On Violation |
|-------|------|-------------|
| confidence | `0 <= confidence <= 1` | Clamp to valid range |
| sub_graph.nodes | max 20 | Truncate excess |
| sub_graph.edges | max 30 | Truncate excess |
| node labels | max 100 chars | Truncate |
| edge refs | source/target must exist in sub_graph.nodes | Drop invalid edges |
| highlight_candidates | max 50 | Truncate excess |
| edge_intents | max 50 | Truncate excess |
| evidence | max 20 items | Truncate excess |

Validator never fails the request. If any value was modified, set:

```json
{
  "degraded_mode": true,
  "warnings": [
    "Sub-graph exceeded max 20 nodes; truncated",
    "1 edge intent referencing unknown files was removed"
  ]
}
```

## Frontend Components

### State (page.tsx)

```typescript
const [aiGraphActions, setAiGraphActions] = useState<GraphAction[] | null>(null);
const [aiEvidence, setAiEvidence] = useState<EvidenceItem[]>([]);
const [degraded, setDegraded] = useState<{warnings: string[]} | null>(null);
```

Set when a new AI answer arrives. Cleared when user asks a new question or clicks "Reset view."

### ArchitectureGraph — Graph Actions Applied

The component receives the resolved `graph_actions` array and applies each action:

| Action Type | Effect |
|-------------|--------|
| `highlight_nodes` | Dim all nodes except these + their connected edges |
| `highlight_edges` | Make specified edges purple + animated |
| `show_subgraph` | Show overlay panel with mini React Flow |

Actions are applied simultaneously (all at once), not sequentially.

Highlight layering:
1. If `highlight_nodes` is active → AI highlight overrides click selection
2. User can still click a node to see InfoPanel (but highlight stays)
3. Clicking canvas or "Reset view" clears AI highlights

### SubGraph Overlay

- Floating panel positioned over the graph (top-right area)
- Title bar: flow type badge (e.g., "request_flow") + title + close button
- Mini React Flow inside (~400x300px) with the sub-graph nodes/edges
- "View in Main Graph" button at bottom:
  - Maps sub-graph node IDs back to real repo node_ids via label matching
  - Highlights matched nodes in main graph
  - Closes overlay
- Draggable via title bar

### Evidence in Chat

- Each evidence item rendered in the AI answer bubble
- Shows: type badge + `display_name` (clickable link) + `reason` + relevance bar
- Evidence types: `source` (green), `inference` (amber), `dependency` (blue)
- Clicking evidence:
  1. Highlights the corresponding `node_id` in the graph
  2. Opens InfoPanel for that node

### Degraded Mode Indicator

When `degraded_mode` is true, the frontend shows a subtle warning banner:

```
⚠ AI explanation partially simplified (details)
```

Clicking "details" shows the warnings array. This builds trust by being transparent about limitations.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| LLM returns invalid JSON | Catch parse error, return error answer with confidence=0 |
| LLM returns no graph_actions or evidence | Frontend renders answer only, no graph change |
| LLM hallucinates filenames | Resolver drops unknowns. highlight_nodes only includes real IDs |
| LLM returns giant sub-graph | Validator caps at 20 nodes / 30 edges, sets degraded_mode |
| Multiple questions rapid-fire | Each new question clears previous AI highlights and overlays |
| Evidence node doesn't exist | Omitted from frontend rendering |
| Sub-graph nodes overlap with real repo | "View in Main Graph" resolves known nodes via label matching, leaves unknown as-is |
| All LLM output sanitized | degraded_mode=true, frontend shows warning, answer text still renders |
| Edge intent resolves to zero edges | Omitted from highlight_edges action |

## Guiding Principle

The LLM never produces final identifiers — only intentions. The backend validates, resolves, and owns all graph state. This keeps Ferret stable as the codebase grows and model outputs vary.
