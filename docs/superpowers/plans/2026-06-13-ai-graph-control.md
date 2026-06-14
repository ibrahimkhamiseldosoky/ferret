# AI Graph Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI can highlight existing nodes/edges and draw custom sub-graph overlays to explain architecture visually.

**Architecture:** LLM returns structured JSON (intents only) → backend validates + resolves to real DB IDs → frontend applies highlight actions on the React Flow graph and shows sub-graph overlay.

**Tech Stack:** Python FastAPI, OpenAI/OpenRouter structured output, React Flow, TypeScript, Tailwind v4

---

### Task 1: Backend — Create Graph Action Pydantic Models

**Files:**
- Modify: `backend/app/models/repository.py:49-57`

- [ ] **Replace QuestionResponse and add graph action models**

Current `repository.py` ends with:

```python
class QuestionRequest(BaseModel):
    question: str
    type: str = "freeform"


class QuestionResponse(BaseModel):
    answer: str
    confidence: float
    relevant_files: list[str]
```

Replace with:

```python
class QuestionRequest(BaseModel):
    question: str
    type: str = "freeform"


class EvidenceItem(BaseModel):
    node_id: str
    display_name: str
    type: str  # "source" | "inference" | "dependency"
    reason: str
    relevance: float


class SubGraphNode(BaseModel):
    id: str
    label: str
    type: str


class SubGraphEdge(BaseModel):
    source: str
    target: str
    label: str | None = None


class SubGraph(BaseModel):
    type: str
    title: str
    nodes: list[SubGraphNode]
    edges: list[SubGraphEdge]


class HighlightNodesAction(BaseModel):
    type: str = "highlight_nodes"
    nodes: list[str]


class HighlightEdgesAction(BaseModel):
    type: str = "highlight_edges"
    edges: list[str]


class ShowSubGraphAction(BaseModel):
    type: str = "show_subgraph"
    graph: SubGraph


GraphAction = HighlightNodesAction | HighlightEdgesAction | ShowSubGraphAction


class QuestionResponse(BaseModel):
    schema_version: int = 1
    answer: str
    confidence: float
    degraded_mode: bool = False
    warnings: list[str] = []
    evidence: list[EvidenceItem] = []
    graph_actions: list[GraphAction] = []
```

- [ ] **Verify file parses**

Run: `cd backend && python -c "from app.models.repository import QuestionResponse, EvidenceItem, SubGraph, GraphAction; print('OK')"`
Expected: `OK`

### Task 2: Backend — Create Resolver Module

**Files:**
- Create: `backend/app/services/resolver.py`

- [ ] **Write the resolver module**

```python
import re
from collections import defaultdict
from app.core.database import get_supabase


class NodeResolver:
    def __init__(self, repository_id: str):
        supabase = get_supabase()
        nodes = supabase.table("nodes").select("node_id,label").eq("repository_id", repository_id).execute()
        edges = supabase.table("edges").select("id,source_id,target_id").eq("repository_id", repository_id).execute()

        # Canonical index: full label path -> node_id
        self.canonical: dict[str, str] = {}
        # Alias index: filename only -> list of node_ids
        self.alias: dict[str, list[str]] = defaultdict(list)

        for n in nodes.data:
            nid = n["node_id"]
            label = n["label"]
            self.canonical[label] = nid
            filename = label.split("/")[-1]
            self.alias[filename].append(nid)

        # Edge lookup: (source_id, target_id) -> edge_id
        self.edge_map: dict[tuple[str, str], str] = {}
        for e in edges.data:
            self.edge_map[(e["source_id"], e["target_id"])] = e["id"]

    def resolve_file_hint(self, hint: str) -> list[str]:
        if hint in self.canonical:
            return [self.canonical[hint]]
        filename = hint.split("/")[-1]
        if filename in self.alias:
            return self.alias[filename]
        return []

    def resolve_evidence(self, file_hint: str, reason: str, relevance: float, ev_type: str) -> dict | None:
        ids = self.resolve_file_hint(file_hint)
        if not ids:
            return None
        return {
            "node_id": ids[0],
            "display_name": file_hint.split("/")[-1],
            "type": ev_type,
            "reason": reason,
            "relevance": relevance,
        }

    def resolve_edge_intent(self, from_hint: str, to_hint: str) -> str | None:
        from_ids = self.resolve_file_hint(from_hint)
        to_ids = self.resolve_file_hint(to_hint)
        for fid in from_ids:
            for tid in to_ids:
                eid = self.edge_map.get((fid, tid))
                if eid:
                    return eid
        return None

    def resolve_highlight_candidates(self, candidates: list[str]) -> list[str]:
        result = []
        for c in candidates:
            result.extend(self.resolve_file_hint(c))
        return result
```

- [ ] **Verify file parses**

Run: `cd backend && python -c "from app.services.resolver import NodeResolver; print('OK')"`
Expected: `OK`

### Task 3: Backend — Create Validator Module

**Files:**
- Create: `backend/app/services/validator.py`

- [ ] **Write the validator module**

```python
from app.models.repository import EvidenceItem, SubGraph, SubGraphNode, SubGraphEdge

MAX_SUBGRAPH_NODES = 20
MAX_SUBGRAPH_EDGES = 30
MAX_NODE_LABEL_LENGTH = 100
MAX_HIGHLIGHT_CANDIDATES = 50
MAX_EDGE_INTENTS = 50
MAX_EVIDENCE = 20


def validate_llm_output(raw: dict) -> tuple[dict, bool, list[str]]:
    warnings = []
    degraded = False

    # Validate confidence
    conf = raw.get("confidence", 0.0)
    if not isinstance(conf, (int, float)):
        conf = 0.0
        degraded = True
        warnings.append("Invalid confidence value; defaulted to 0")
    else:
        conf = max(0.0, min(1.0, float(conf)))

    # Validate highlight_candidates
    candidates = raw.get("highlight_candidates", [])
    if not isinstance(candidates, list):
        candidates = []
        degraded = True
        warnings.append("highlight_candidates must be a list")
    elif len(candidates) > MAX_HIGHLIGHT_CANDIDATES:
        candidates = candidates[:MAX_HIGHLIGHT_CANDIDATES]
        degraded = True
        warnings.append(f"highlight_candidates truncated to {MAX_HIGHLIGHT_CANDIDATES}")

    # Validate edge_intents
    edge_intents = raw.get("edge_intents", [])
    if not isinstance(edge_intents, list):
        edge_intents = []
        degraded = True
        warnings.append("edge_intents must be a list")
    elif len(edge_intents) > MAX_EDGE_INTENTS:
        edge_intents = edge_intents[:MAX_EDGE_INTENTS]
        degraded = True
        warnings.append(f"edge_intents truncated to {MAX_EDGE_INTENTS}")

    # Validate evidence
    evidence_raw = raw.get("evidence", [])
    if not isinstance(evidence_raw, list):
        evidence_raw = []
        degraded = True
        warnings.append("evidence must be a list")
    elif len(evidence_raw) > MAX_EVIDENCE:
        evidence_raw = evidence_raw[:MAX_EVIDENCE]
        degraded = True
        warnings.append(f"evidence truncated to {MAX_EVIDENCE}")

    # Validate sub_graph
    sg = raw.get("sub_graph")
    if sg and isinstance(sg, dict):
        sg_nodes = sg.get("nodes", [])
        sg_edges = sg.get("edges", [])
        if not isinstance(sg_nodes, list) or not isinstance(sg_edges, list):
            sg = None
            degraded = True
            warnings.append("sub_graph nodes/edges must be lists")
        else:
            if len(sg_nodes) > MAX_SUBGRAPH_NODES:
                sg_nodes = sg_nodes[:MAX_SUBGRAPH_NODES]
                sg["nodes"] = sg_nodes
                degraded = True
                warnings.append(f"sub_graph nodes truncated to {MAX_SUBGRAPH_NODES}")
            if len(sg_edges) > MAX_SUBGRAPH_EDGES:
                sg_edges = sg_edges[:MAX_SUBGRAPH_EDGES]
                sg["edges"] = sg_edges
                degraded = True
                warnings.append(f"sub_graph edges truncated to {MAX_SUBGRAPH_EDGES}")

            # Validate node labels
            node_ids_in_sg = set()
            for n in sg_nodes:
                if not isinstance(n, dict):
                    continue
                nid = n.get("id", "")
                label = n.get("label", "")
                if len(label) > MAX_NODE_LABEL_LENGTH:
                    n["label"] = label[:MAX_NODE_LABEL_LENGTH]
                if nid:
                    node_ids_in_sg.add(nid)

            # Drop edges referencing missing nodes
            valid_edges = []
            for e in sg_edges:
                if not isinstance(e, dict):
                    continue
                if e.get("source") in node_ids_in_sg and e.get("target") in node_ids_in_sg:
                    valid_edges.append(e)
                else:
                    degraded = True
                    warnings.append("Dropped sub_graph edge referencing unknown node")
            sg["edges"] = valid_edges

    result = {
        "answer": raw.get("answer", ""),
        "confidence": conf,
        "highlight_candidates": candidates,
        "edge_intents": edge_intents,
        "evidence": evidence_raw,
        "sub_graph": sg,
    }

    return result, degraded, warnings
```

- [ ] **Verify file parses**

Run: `cd backend && python -c "from app.services.validator import validate_llm_output; print('OK')"`
Expected: `OK`

### Task 4: Backend — Update Question Service

**Files:**
- Modify: `backend/app/services/question_service.py`

- [ ] **Replace question_service.py with structured output + resolver + validator**

```python
import json
from openai import OpenAI
from app.core.config import settings
from app.services.resolver import NodeResolver
from app.services.validator import validate_llm_output

SYSTEM_PROMPT = """You are a code analysis assistant. Answer questions about the repository architecture based on the graph data.

You MUST respond ONLY in valid JSON with this exact schema:
{
  "answer": "Clear explanation text",
  "confidence": 0.0-1.0,
  "highlight_candidates": ["filename1.py", "filename2.py"],
  "edge_intents": [{"from": "file1.py", "to": "file2.py"}],
  "evidence": [
    {"file_hint": "filename.py", "reason": "Why this file is relevant", "relevance": 0.0-1.0, "type": "source|inference|dependency"}
  ],
  "sub_graph": {
    "type": "request_flow|dependency_flow|event_flow",
    "title": "Descriptive title",
    "nodes": [{"id": "unique_id", "label": "Display Name", "type": "service|api|database|external|file"}],
    "edges": [{"source": "node_id", "target": "node_id", "label": "relationship description"}]
  }
}

RULES:
- highlight_candidates: Use simple filenames like "auth.py" (not full paths). The backend resolves them.
- edge_intents: Use filename pairs to describe which connections matter. Backend resolves to real edge IDs.
- evidence: Use file_hint (simple filename), type (source=code reference, inference=educated guess, dependency=depends on), relevance (0-1).
- sub_graph: Only include when a flow diagram would help explain. Node IDs should be short unique labels.
- If no graph manipulation is needed, omit highlight_candidates, edge_intents, and sub_graph entirely.
- Be concise and specific in your answer."""

PREDEFINED_QUESTIONS = {
    "explain_repository": "Explain the overall architecture and purpose of the repository.",
    "show_authentication": "Describe the authentication system used in this repository.",
    "show_main_services": "List and describe the main services and their responsibilities.",
    "show_request_flow": "Describe the typical request flow from entry point to response.",
    "find_dead_code": "Identify any potentially unused or dead code in this repository.",
}


def answer_question(repository_id: str, question: str, question_type: str = "freeform") -> dict:
    from app.core.database import get_supabase
    supabase = get_supabase()
    repo = supabase.table("repositories").select("*").eq("id", repository_id).execute()
    nodes = supabase.table("nodes").select("*").eq("repository_id", repository_id).execute()
    edges = supabase.table("edges").select("*").eq("repository_id", repository_id).execute()

    if not repo.data or not nodes.data:
        return {
            "schema_version": 1,
            "answer": "Repository not found or not yet analyzed.",
            "confidence": 0.0,
            "degraded_mode": False,
            "evidence": [],
            "graph_actions": [],
        }

    if question_type == "predefined":
        mapped = PREDEFINED_QUESTIONS.get(question, question)
        final_question = mapped
    else:
        final_question = question

    repo_name = repo.data[0].get("name", "unknown")
    repo_lang = repo.data[0].get("language", "unknown")
    file_count = repo.data[0].get("file_count", 0)

    node_summaries = [f"- {n['type']}: {n['label']} (id: {n['node_id']})" for n in nodes.data]
    edge_summaries = [f"  {e['source_id']} -> {e['target_id']} [{e.get('label', 'depends_on')}]" for e in edges.data]

    context = f"""Repository: {repo_name}
Language: {repo_lang}
File count: {file_count}

Nodes ({len(node_summaries)}):
{chr(10).join(node_summaries[:50])}

Edges ({len(edge_summaries)}):
{chr(10).join(edge_summaries[:100])}
"""

    try:
        client = OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
        response = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Repository context:\n{context}\n\nQuestion: {final_question}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=3000,
        )
        raw = json.loads(response.choices[0].message.content)
    except Exception as e:
        return {
            "schema_version": 1,
            "answer": f"Could not generate AI answer: {str(e)}",
            "confidence": 0.0,
            "degraded_mode": False,
            "evidence": [],
            "graph_actions": [],
        }

    # Validate
    validated, degraded, warnings = validate_llm_output(raw)

    # Resolve
    resolver = NodeResolver(repository_id)

    graph_actions = []

    # Resolve highlight_candidates -> highlight_nodes action
    if validated.get("highlight_candidates"):
        resolved_nodes = resolver.resolve_highlight_candidates(validated["highlight_candidates"])
        if resolved_nodes:
            graph_actions.append({"type": "highlight_nodes", "nodes": resolved_nodes})

    # Resolve edge_intents -> highlight_edges action
    edge_ids = []
    for intent in validated.get("edge_intents", []):
        eid = resolver.resolve_edge_intent(intent.get("from", ""), intent.get("to", ""))
        if eid:
            edge_ids.append(eid)
    if edge_ids:
        graph_actions.append({"type": "highlight_edges", "edges": edge_ids})

    # Resolve evidence
    evidence_list = []
    for ev in validated.get("evidence", []):
        resolved = resolver.resolve_evidence(
            file_hint=ev.get("file_hint", ""),
            reason=ev.get("reason", ""),
            relevance=ev.get("relevance", 0.5),
            ev_type=ev.get("type", "inference"),
        )
        if resolved:
            evidence_list.append(resolved)

    # Build sub_graph action
    sub_graph = validated.get("sub_graph")
    if sub_graph and sub_graph.get("nodes"):
        from app.models.repository import SubGraph, SubGraphNode, SubGraphEdge

        title_slug = sub_graph.get("title", "graph").lower()
        title_slug = re.sub(r"[^a-z0-9_]+", "_", title_slug).strip("_")

        sg_nodes = []
        for n in sub_graph.get("nodes", []):
            nid = n.get("id", "")
            prefixed = f"subgraph:{title_slug}:{nid}" if nid else ""
            sg_nodes.append({"id": prefixed, "label": n.get("label", ""), "type": n.get("type", "file")})

        sg_edges = []
        for e in sub_graph.get("edges", []):
            src = e.get("source", "")
            tgt = e.get("target", "")
            sg_edges.append({
                "source": f"subgraph:{title_slug}:{src}",
                "target": f"subgraph:{title_slug}:{tgt}",
                "label": e.get("label", ""),
            })

        sub_graph_action = {
            "type": "show_subgraph",
            "graph": {
                "type": sub_graph.get("type", "request_flow"),
                "title": sub_graph.get("title", ""),
                "nodes": sg_nodes,
                "edges": sg_edges,
            },
        }
        graph_actions.append(sub_graph_action)

    return {
        "schema_version": 1,
        "answer": validated.get("answer", ""),
        "confidence": validated.get("confidence", 0.0),
        "degraded_mode": degraded,
        "warnings": warnings,
        "evidence": evidence_list,
        "graph_actions": graph_actions,
    }
```

Need to add the `re` import at the top:

```python
import json
import re
from openai import OpenAI
from app.core.config import settings
from app.services.resolver import NodeResolver
from app.services.validator import validate_llm_output
```

- [ ] **Verify file parses**

Run: `cd backend && python -c "from app.services.question_service import answer_question; print('OK')"`
Expected: `OK`

### Task 5: Backend — Update Questions API Endpoint

**Files:**
- Modify: `backend/app/api/questions.py`

- [ ] **Remove response_model from the endpoint (dynamic shape)**

```python
from fastapi import APIRouter, HTTPException
from app.models.repository import QuestionRequest
from app.services.question_service import answer_question

router = APIRouter(prefix="/api/repositories", tags=["questions"])


@router.post("/{repository_id}/ask")
async def ask_question(repository_id: str, request: QuestionRequest):
    return answer_question(
        repository_id=repository_id,
        question=request.question,
        question_type=request.type,
    )
```

- [ ] **Verify file parses**

Run: `cd backend && python -c "from app.api.questions import router; print('OK')"`
Expected: `OK`

### Task 6: Frontend — Add New Types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Add types for evidence, graph actions, and sub-graph**

Append before the final closing of the file:

```typescript
export interface EvidenceItem {
  node_id: string;
  display_name: string;
  type: 'source' | 'inference' | 'dependency';
  reason: string;
  relevance: number;
}

export interface SubGraphNode {
  id: string;
  label: string;
  type: string;
}

export interface SubGraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface SubGraph {
  type: string;
  title: string;
  nodes: SubGraphNode[];
  edges: SubGraphEdge[];
}

export interface HighlightNodesAction {
  type: 'highlight_nodes';
  nodes: string[];
}

export interface HighlightEdgesAction {
  type: 'highlight_edges';
  edges: string[];
}

export interface ShowSubGraphAction {
  type: 'show_subgraph';
  graph: SubGraph;
}

export type GraphAction = HighlightNodesAction | HighlightEdgesAction | ShowSubGraphAction;

export interface QuestionResponse {
  schema_version: number;
  answer: string;
  confidence: number;
  degraded_mode: boolean;
  warnings: string[];
  evidence: EvidenceItem[];
  graph_actions: GraphAction[];
}
```

Also update `QAItem` to include the new fields:

```typescript
export interface QAItem {
  question: string;
  answer: string;
  confidence?: number;
  relevant_files?: string[];
  evidence?: EvidenceItem[];
  graph_actions?: GraphAction[];
  degraded_mode?: boolean;
  warnings?: string[];
}
```

- [ ] **Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

### Task 7: Frontend — Update API Client

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Update askQuestion return type and add the type import**

```typescript
import type { Repository, GraphNode, GraphEdge, FileItem, QAItem, QuestionResponse } from '@/types';
```

Update the `askQuestion` function:

```typescript
export async function askQuestion(
  id: string,
  question: string,
  type?: string
): Promise<QuestionResponse> {
  return fetchApi<QuestionResponse>(
    `/api/repositories/${id}/ask`,
    {
      method: 'POST',
      body: JSON.stringify({ question, type }),
    }
  );
}
```

- [ ] **Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

### Task 8: Frontend — Update ArchitectureGraph for AI Highlights

**Files:**
- Modify: `frontend/src/components/ArchitectureGraph.tsx`

- [ ] **Add aiHighlightNodes and aiHighlightEdges props**

Update the Props interface and component to accept:

```typescript
interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  aiHighlightNodes: string[] | null;
  aiHighlightEdges: string[] | null;
  onNodeClick: (node: GraphNode | null) => void;
  onAiReset: () => void;
}
```

Update node dimming logic. When `aiHighlightNodes` is set, create an `aiNeighborIds` set that includes all `aiHighlightNodes` plus their adjacent nodes. Nodes outside this set get `opacity: 0.2`.

Update edge styling. When `aiHighlightEdges` is set, edges in that list get purple + animated. When only `aiHighlightNodes` is set (no specific edges), edges connecting two highlighted nodes get purple + animated.

Priority: `aiHighlightNodes` overrides click selection. Reset view button calls `onAiReset`.

- [ ] **Write the full updated component**

```typescript
'use client';

import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type NodeProps,
  type Edge as RFEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { GraphNode, GraphEdge } from '@/types';
import { X } from 'lucide-react';

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  file: { bg: '#f0f9ff', border: '#38bdf8', text: '#0369a1' },
  service: { bg: '#f0fdf4', border: '#4ade80', text: '#15803d' },
  api: { bg: '#fefce8', border: '#facc15', text: '#a16207' },
  database: { bg: '#fdf2f8', border: '#f472b6', text: '#be185d' },
  event: { bg: '#f5f3ff', border: '#a78bfa', text: '#6d28d9' },
  external: { bg: '#fafafa', border: '#a1a1aa', text: '#52525b' },
};

const TYPE_LAYER_ORDER: Record<string, number> = {
  service: 0,
  api: 1,
  database: 2,
  event: 3,
  file: 4,
  external: 5,
};

function CustomNode({ data }: NodeProps) {
  const colors = TYPE_COLORS[data.nodeType] || TYPE_COLORS.external;
  return (
    <div
      className="rounded-xl shadow-sm border-2 px-4 py-3 min-w-[140px] transition-shadow hover:shadow-md cursor-pointer"
      style={{
        background: colors.bg,
        borderColor: colors.border,
        opacity: data.opacity ?? 1,
      }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-0" style={{ background: colors.border }} />
      <p className="text-sm font-medium leading-tight" style={{ color: colors.text }}>
        {data.label}
      </p>
      <p className="text-[10px] mt-1 uppercase tracking-wider opacity-60" style={{ color: colors.text }}>
        {data.nodeType}
      </p>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-0" style={{ background: colors.border }} />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  aiHighlightNodes: string[] | null;
  aiHighlightEdges: string[] | null;
  onNodeClick: (node: GraphNode | null) => void;
  onAiReset: () => void;
}

function layoutNodes(nodes: GraphNode[]): GraphNode[] {
  const groups: Record<string, GraphNode[]> = {};
  for (const node of nodes) {
    const layer = TYPE_LAYER_ORDER[node.type] ?? 5;
    const dir = node.node_id.includes('/') ? node.node_id.split('/').slice(0, -1).join('/') : '';
    const key = `${layer}|${dir}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(node);
  }

  const sortedKeys = Object.keys(groups).sort();
  let y = 40;
  const positioned: GraphNode[] = [];
  for (const key of sortedKeys) {
    const group = groups[key];
    let x = 40;
    for (const node of group) {
      positioned.push({ ...node, position: { x, y } });
      x += 240;
    }
    y += 160;
  }
  return positioned;
}

export default function ArchitectureGraph({
  nodes, edges, selectedNodeId, aiHighlightNodes, aiHighlightEdges, onNodeClick, onAiReset,
}: Props) {
  // Determine which node IDs to highlight (from click or AI)
  const { neighborIds, activeHighlight } = useMemo(() => {
    if (aiHighlightNodes && aiHighlightNodes.length > 0) {
      const ids = new Set(aiHighlightNodes);
      // Include neighbors of AI-highlighted nodes
      for (const e of edges) {
        if (ids.has(e.source_id)) ids.add(e.target_id);
        if (ids.has(e.target_id)) ids.add(e.source_id);
      }
      return { neighborIds: ids, activeHighlight: 'ai' as const };
    }
    if (selectedNodeId) {
      const ids = new Set([selectedNodeId]);
      for (const e of edges) {
        if (e.source_id === selectedNodeId) ids.add(e.target_id);
        if (e.target_id === selectedNodeId) ids.add(e.source_id);
      }
      return { neighborIds: ids, activeHighlight: 'click' as const };
    }
    return { neighborIds: null, activeHighlight: null };
  }, [nodes, edges, selectedNodeId, aiHighlightNodes]);

  const highlightedEdgeSet = useMemo(() => {
    if (aiHighlightEdges && aiHighlightEdges.length > 0) {
      return new Set(aiHighlightEdges);
    }
    return null;
  }, [aiHighlightEdges]);

  const flowNodes = useMemo(
    () =>
      layoutNodes(nodes).map((n) => {
        const isDimmed = neighborIds && !neighborIds.has(n.node_id);
        return {
          id: n.node_id,
          type: 'custom' as const,
          position: n.position || { x: 0, y: 0 },
          data: { label: n.label, nodeType: n.type, opacity: isDimmed ? 0.2 : 1 },
        };
      }),
    [nodes, neighborIds]
  );

  const flowEdges: RFEdge[] = useMemo(
    () =>
      edges.map((e) => {
        let isHighlighted = false;
        if (highlightedEdgeSet) {
          isHighlighted = highlightedEdgeSet.has(e.id);
        } else if (neighborIds) {
          isHighlighted = neighborIds.has(e.source_id) && neighborIds.has(e.target_id);
        }
        return {
          id: e.id,
          source: e.source_id,
          target: e.target_id,
          label: e.label,
          animated: isHighlighted,
          style: {
            stroke: isHighlighted ? '#6366f1' : '#d4d4d8',
            strokeWidth: isHighlighted ? 2.5 : 1.5,
          },
        };
      }),
    [edges, neighborIds, highlightedEdgeSet]
  );

  return (
    <div className="w-full h-full relative">
      {activeHighlight === 'ai' && (
        <button
          onClick={onAiReset}
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Reset view
        </button>
      )}
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          const original = nodes.find((n) => n.node_id === node.id);
          if (original) onNodeClick(original);
        }}
        onPaneClick={() => onNodeClick(null)}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#e4e4e7" gap={16} />
        <Controls className="!rounded-lg !border !border-zinc-200 !shadow-sm" />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(n) => TYPE_COLORS[n.data?.nodeType]?.border || '#a1a1aa'}
          className="!rounded-lg !border !border-zinc-200 !shadow-sm"
        />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

### Task 9: Frontend — Create SubGraphOverlay Component

**Files:**
- Create: `frontend/src/components/SubGraphOverlay.tsx`

- [ ] **Write the SubGraphOverlay component**

```typescript
'use client';

import { useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, type Edge as RFEdge } from 'reactflow';
import 'reactflow/dist/style.css';
import { X, Maximize2 } from 'lucide-react';
import type { SubGraph as SubGraphType, GraphNode } from '@/types';

const TYPE_COLORS: Record<string, string> = {
  file: '#38bdf8',
  service: '#4ade80',
  api: '#facc15',
  database: '#f472b6',
  event: '#a78bfa',
  external: '#a1a1aa',
};

interface Props {
  graph: SubGraphType;
  nodes: GraphNode[];
  onClose: () => void;
  onViewInMain: (nodeIds: string[]) => void;
}

export default function SubGraphOverlay({ graph, nodes, onClose, onViewInMain }: Props) {
  const [position, setPosition] = useState({ x: 60, y: 60 });
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  const flowNodes = useMemo(
    () =>
      graph.nodes.map((n, i) => ({
        id: n.id,
        type: 'default' as const,
        position: { x: (i % 3) * 150 + 20, y: Math.floor(i / 3) * 80 + 20 },
        data: { label: n.label },
        style: {
          background: `${TYPE_COLORS[n.type] || '#a1a1aa'}20`,
          borderColor: TYPE_COLORS[n.type] || '#a1a1aa',
          borderWidth: 2,
          borderRadius: 8,
          padding: '6px 12px',
          fontSize: 12,
          color: '#27272a',
          fontWeight: 500,
        },
      })),
    [graph.nodes]
  );

  const flowEdges: RFEdge[] = useMemo(
    () =>
      graph.edges.map((e, i) => ({
        id: `sg-edge-${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        labelStyle: { fontSize: 10, fill: '#6366f1' },
        labelBgStyle: { fill: '#fff' },
        labelBgPadding: [2, 2] as [number, number],
        labelBgBorderRadius: 2,
      })),
    [graph.edges]
  );

  const handleViewInMain = () => {
    const mainNodeIds: string[] = [];
    for (const sgNode of graph.nodes) {
      const match = nodes.find((n) => n.label.includes(sgNode.label));
      if (match) mainNodeIds.push(match.node_id);
    }
    if (mainNodeIds.length > 0) {
      onViewInMain(mainNodeIds);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
    };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition({
        x: dragRef.current.offsetX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.offsetY + (ev.clientY - dragRef.current.startY),
      });
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const typeColors: Record<string, string> = {
    request_flow: '#6366f1',
    dependency_flow: '#0891b2',
    event_flow: '#d946ef',
    data_flow: '#059669',
  };

  return (
    <div
      className="absolute z-20 rounded-xl border border-zinc-200 bg-white shadow-xl overflow-hidden"
      style={{ left: position.x, top: position.y, width: 380, height: 320 }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-zinc-100 bg-zinc-50 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: typeColors[graph.type] || '#6366f1' }}
          />
          <span className="text-xs font-semibold text-zinc-700 truncate">{graph.title}</span>
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{graph.type}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-zinc-200 transition-colors">
          <X className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>
      <div className="h-[200px]">
        <ReactFlow nodes={flowNodes} edges={flowEdges} fitView attributionPosition="bottom-left">
          <Background color="#e4e4e7" gap={16} />
        </ReactFlow>
      </div>
      <div className="flex items-center justify-end px-4 py-2 border-t border-zinc-100 bg-zinc-50">
        <button
          onClick={handleViewInMain}
          className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
        >
          <Maximize2 className="w-3 h-3" />
          View in Main Graph
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

### Task 10: Frontend — Update AIAssistant for Evidence Rendering

**Files:**
- Modify: `frontend/src/components/AIAssistant.tsx`

- [ ] **Update the AIAssistant to accept and render evidence items**

Update Props:

```typescript
interface Props {
  onAsk: (question: string) => void;
  onEvidenceClick: (nodeId: string) => void;
  loading: boolean;
  chatHistory: QAItem[];
}
```

Update the answer bubble rendering. Replace the current relevant_files display with evidence rendering:

```typescript
{!loading && item.answer !== '...' && (
  <>
    <p className="text-xs leading-relaxed whitespace-pre-wrap">{item.answer}</p>
    {item.degraded_mode && item.warnings && item.warnings.length > 0 && (
      <div className="mt-2 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-200">
        <p className="text-[10px] text-amber-700 font-medium">AI explanation partially simplified</p>
        {item.warnings.map((w, wi) => (
          <p key={wi} className="text-[9px] text-amber-600 mt-0.5">{w}</p>
        ))}
      </div>
    )}
    {item.evidence && item.evidence.length > 0 && (
      <div className="mt-2 pt-2 border-t border-zinc-200 space-y-1.5">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase">Evidence</p>
        {item.evidence.map((ev, ei) => (
          <button
            key={ei}
            onClick={() => onEvidenceClick(ev.node_id)}
            className="w-full text-left flex items-start gap-2 p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
          >
            <span
              className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                ev.type === 'source' ? 'bg-emerald-500' : ev.type === 'dependency' ? 'bg-sky-500' : 'bg-amber-500'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono text-indigo-600 font-medium">{ev.display_name}</span>
                <span className="text-[9px] uppercase text-zinc-400">{ev.type}</span>
              </div>
              <p className="text-[10px] text-zinc-600 leading-relaxed">{ev.reason}</p>
              <div className="mt-0.5 w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${Math.round(ev.relevance * 100)}%` }}
                />
              </div>
            </div>
          </button>
        ))}
      </div>
    )}
  </>
)}
```

Also update the handleAsk to call `onAsk(input.trim())` as before, and `onEvidenceClick` is passed from parent.

The preset questions should remain unchanged.

- [ ] **Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

### Task 11: Frontend — Wire Everything in page.tsx

**Files:**
- Modify: `frontend/src/app/repos/[id]/page.tsx`

- [ ] **Add state for AI graph actions and evidence, update handlers**

Add to existing state:

```typescript
const [aiGraphActions, setAiGraphActions] = useState<GraphAction[] | null>(null);
const [aiSubGraph, setAiSubGraph] = useState<SubGraph | null>(null);
```

Update `handleAsk` to process graph_actions and evidence:

```typescript
const handleAsk = useCallback(async (question: string) => {
  if (!id) return;
  setAiLoading(true);
  setChatHistory((prev) => [
    ...prev,
    { question, answer: '...', confidence: 0, relevant_files: [], evidence: [], graph_actions: [] },
  ]);
  try {
    const res = await askQuestion(id, question);
    setChatHistory((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        question,
        answer: res.answer,
        confidence: res.confidence,
        relevant_files: res.evidence.map((e) => e.display_name),
        evidence: res.evidence,
        graph_actions: res.graph_actions,
        degraded_mode: res.degraded_mode,
        warnings: res.warnings,
      };
      return updated;
    });
    // Apply graph actions
    setAiGraphActions(res.graph_actions || []);
    // Find sub_graph action
    const sgAction = (res.graph_actions || []).find((a) => a.type === 'show_subgraph');
    if (sgAction && sgAction.type === 'show_subgraph') {
      setAiSubGraph(sgAction.graph);
    } else {
      setAiSubGraph(null);
    }
  } catch (e) {
    setChatHistory((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        question,
        answer: 'Sorry, I encountered an error processing your question.',
        confidence: 0,
        relevant_files: [],
      };
      return updated;
    });
  } finally {
    setAiLoading(false);
  }
}, [id]);
```

Add handler for evidence click and AI reset:

```typescript
const handleEvidenceClick = useCallback((nodeId: string) => {
  const node = graphData?.nodes.find((n) => n.node_id === nodeId);
  if (node) setSelectedNode(node);
  setAiGraphActions([{ type: 'highlight_nodes', nodes: [nodeId] }]);
  setAiSubGraph(null);
}, [graphData]);

const handleAiReset = useCallback(() => {
  setAiGraphActions(null);
  setAiSubGraph(null);
}, []);
```

Extract props for ArchitectureGraph:

```typescript
const aiHighlightNodes = useMemo(() => {
  const action = (aiGraphActions || []).find((a) => a.type === 'highlight_nodes');
  return action?.type === 'highlight_nodes' ? action.nodes : null;
}, [aiGraphActions]);

const aiHighlightEdges = useMemo(() => {
  const action = (aiGraphActions || []).find((a) => a.type === 'highlight_edges');
  return action?.type === 'highlight_edges' ? action.edges : null;
}, [aiGraphActions]);
```

Update the ArchitectureGraph usage:

```typescript
<ArchitectureGraph
  nodes={graphData?.nodes || []}
  edges={graphData?.edges || []}
  selectedNodeId={selectedNode?.node_id || null}
  aiHighlightNodes={aiHighlightNodes}
  aiHighlightEdges={aiHighlightEdges}
  onNodeClick={handleNodeClick}
  onAiReset={handleAiReset}
/>
```

Update AIAssistant usage:

```typescript
<AIAssistant
  onAsk={handleAsk}
  onEvidenceClick={handleEvidenceClick}
  loading={aiLoading}
  chatHistory={chatHistory}
/>
```

Add SubGraphOverlay alongside InfoPanel:

```typescript
{aiSubGraph && (
  <SubGraphOverlay
    graph={aiSubGraph}
    nodes={graphData?.nodes || []}
    onClose={() => setAiSubGraph(null)}
    onViewInMain={(nodeIds) => {
      setAiGraphActions([{ type: 'highlight_nodes', nodes: nodeIds }]);
      setAiSubGraph(null);
    }}
  />
)}
```

Add imports:

```typescript
import SubGraphOverlay from '@/components/SubGraphOverlay';
import type { GraphNode, GraphEdge, QAItem, GraphAction, SubGraph, EvidenceItem } from '@/types';
```

- [ ] **Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

### Task 12: End-to-End Verification

- [ ] **Restart backend and frontend, test the full flow**

1. Restart backend: `cd backend && uvicorn app.main:app --reload`
2. Restart frontend: `cd frontend && npm run dev`
3. Upload `test-repo.zip` and wait for analysis
4. Click a node — InfoPanel shows connections
5. Ask "Explain Repository" — wait for AI response
6. Verify: graph highlights relevant nodes, sub-graph overlay appears if AI generated one
7. Click evidence item — graph re-highlights, InfoPanel opens
8. Click "Reset view" — graph returns to full view
9. Click canvas — selection clears
10. Ask "Find Dead Code" — verify answer and graph response
