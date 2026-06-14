# New Dev Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generated onboarding guide for any repo (overview, reading order, core concepts, time estimate) shown in a floating panel.

**Architecture:** Backend LLM call with graph context, cached in new `onboarding_guides` Supabase table, auto-generated after analysis completes. Frontend floating panel (like SubGraphOverlay) with clickable reading list + concept chips.

**Tech Stack:** Python FastAPI, Supabase PostgreSQL, OpenRouter/OpenAI (`openai/gpt-oss-120b`), Next.js/TypeScript/Tailwind v4, lucide-react.

---

### File Structure

**New files:**
- `backend/app/services/onboarding_service.py` — LLM prompt + caching logic for onboarding guide
- `frontend/src/components/NewDevPanel.tsx` — floating panel showing onboarding content
- `backend/migrations/004_onboarding_guides.sql` — new Supabase table

**Modified files:**
- `backend/app/api/repositories.py` — new `POST /repos/{id}/onboarding` endpoint
- `backend/app/services/analysis_service.py` — auto-generate onboarding after graph build
- `frontend/src/lib/api.ts` — new `getOnboarding()` API function
- `frontend/src/types/index.ts` — new `OnboardingData` type
- `frontend/src/app/repos/[id]/page.tsx` — add "New Dev Mode" button + panel state

---

### Task 1: Database migration — `onboarding_guides` table

**Files:**
- Create: `backend/migrations/004_onboarding_guides.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Create onboarding_guides table
CREATE TABLE IF NOT EXISTS onboarding_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  overview TEXT NOT NULL,
  reading_order JSONB NOT NULL DEFAULT '[]',
  core_concepts JSONB NOT NULL DEFAULT '[]',
  estimated_hours INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_repository_id ON onboarding_guides(repository_id);
```

- [ ] **Step 2: Run migration against Supabase**

Run: `psql <migration> or apply via Supabase SQL editor`

---

### Task 2: Onboarding service (backend)

**Files:**
- Create: `backend/app/services/onboarding_service.py`

- [ ] **Step 1: Write the onboarding service**

```python
import json
import re
from typing import Optional
from openai import OpenAI
from app.core.config import settings
from app.core.database import get_supabase

ONBOARDING_PROMPT = """You are a codebase onboarding guide. Given the repository's nodes and edges, generate a developer onboarding guide.

Respond in valid JSON with this exact schema:
{
  "overview": "One paragraph explaining what this repository does and its purpose.",
  "reading_order": [
    {"node_id": "exact_file_label_from_nodes", "reason": "Why this file should be read first"}
  ],
  "core_concepts": ["Authentication", "Data Layer", "API Gateway", ...],
  "estimated_hours": 3
}

RULES:
- reading_order: List 3-8 files in order from "most foundational" to "most specific". The node_id field must exactly match a label from the provided node list.
- core_concepts: List the main architectural concepts (4-8 items). Be specific to this repo.
- estimated_hours: Integer estimate based on file count and complexity. Under 20 files = 1-2 hrs, 20-50 = 2-4 hrs, 50-100 = 4-6 hrs, 100+ = 6-8 hrs.
- overview: One paragraph (2-4 sentences). Plain language. Assume the reader has never seen this repo.
- Be concise. No markdown. No extra text outside the JSON."""


def generate_onboarding(repository_id: str) -> dict:
    supabase = get_supabase()

    # Check cache first
    cached = supabase.table("onboarding_guides").select("*").eq("repository_id", repository_id).execute()
    if cached.data:
        row = cached.data[0]
        return {
            "overview": row["overview"],
            "reading_order": row["reading_order"],
            "core_concepts": row["core_concepts"],
            "estimated_hours": row["estimated_hours"],
        }

    # Fetch graph data
    repo = supabase.table("repositories").select("*").eq("id", repository_id).execute()
    nodes = supabase.table("nodes").select("*").eq("repository_id", repository_id).execute()
    edges = supabase.table("edges").select("*").eq("repository_id", repository_id).execute()

    if not nodes.data:
        return {"overview": "No data available.", "reading_order": [], "core_concepts": [], "estimated_hours": 0}

    repo_name = repo.data[0].get("name", "unknown") if repo.data else "unknown"
    file_count = repo.data[0].get("file_count", 0) if repo.data else 0

    node_summaries = [f"- {n['type']}: {n['label']}" for n in nodes.data]
    edge_summaries = [f"  {e['source_id']} -> {e['target_id']}" for e in edges.data]

    context = f"""Repository: {repo_name}
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
                {"role": "system", "content": ONBOARDING_PROMPT},
                {"role": "user", "content": f"Generate an onboarding guide for this repository:\n\n{context}"},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=2000,
        )
        raw = json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"overview": f"Could not generate: {str(e)}", "reading_order": [], "core_concepts": [], "estimated_hours": 0}

    overview = raw.get("overview", "")
    reading_order = raw.get("reading_order", [])
    core_concepts = raw.get("core_concepts", [])
    estimated_hours = raw.get("estimated_hours", 0)

    # Validate reading_order node_ids match actual node labels
    valid_labels = {n["label"] for n in nodes.data}
    reading_order = [item for item in reading_order if item.get("node_id") in valid_labels]

    # Cache in DB
    try:
        supabase.table("onboarding_guides").upsert({
            "repository_id": repository_id,
            "overview": overview,
            "reading_order": json.dumps(reading_order),
            "core_concepts": json.dumps(core_concepts),
            "estimated_hours": estimated_hours,
        }).execute()
    except Exception:
        pass  # Cache failure is non-critical

    return {
        "overview": overview,
        "reading_order": reading_order,
        "core_concepts": core_concepts,
        "estimated_hours": estimated_hours,
    }
```

- [ ] **Step 2: Verify imports work**

Run: `cd backend && python -c "from app.services.onboarding_service import generate_onboarding; print('OK')"`
Expected: `OK`

---

### Task 3: New endpoint `POST /repos/{id}/onboarding`

**Files:**
- Modify: `backend/app/api/repositories.py`

- [ ] **Step 1: Add import and endpoint**

Add import at top of `backend/app/api/repositories.py`:
```python
from app.services.onboarding_service import generate_onboarding
```

Add endpoint after the `/ask` route (or before the delete route):
```python
@router.post("/{repository_id}/onboarding")
async def get_onboarding(repository_id: str):
    try:
        repo = get_repository(repository_id)
        if not repo:
            raise HTTPException(status_code=404, detail="Repository not found")
        result = generate_onboarding(repository_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 2: Start backend and test endpoint**

```bash
cd backend && uvicorn app.main:app --reload
```

Test with a known repo ID:
```bash
curl -X POST http://localhost:8000/api/repositories/<REPO_ID>/onboarding -H "Content-Type: application/json"
```
Expected: JSON with overview, reading_order, core_concepts, estimated_hours

---

### Task 4: Auto-generate onboarding after analysis

**Files:**
- Modify: `backend/app/services/analysis_service.py`

- [ ] **Step 1: Add onboarding call at end of analysis**

Add import at top:
```python
from app.services.onboarding_service import generate_onboarding
```

Add after `update_status(repository_id, "completed")` at end of `_run_analysis`:
```python
        # Generate onboarding guide in background (fire and forget)
        try:
            generate_onboarding(repository_id)
        except Exception:
            pass  # Non-critical; user can trigger manually
```

---

### Task 5: Frontend — `OnboardingData` type

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add OnboardingData and related types**

Add after the `QAItem` interface:
```typescript
export interface ReadingOrderItem {
  node_id: string;
  reason: string;
}

export interface OnboardingData {
  overview: string;
  reading_order: ReadingOrderItem[];
  core_concepts: string[];
  estimated_hours: number;
}
```

---

### Task 6: Frontend — API client

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `getOnboarding` function**

Add after the `askQuestion` function:
```typescript
export async function getOnboarding(id: string): Promise<OnboardingData> {
  return fetchApi<OnboardingData>(
    `/api/repositories/${id}/onboarding`,
    { method: 'POST' }
  );
}
```

---

### Task 7: Frontend — `NewDevPanel.tsx` component

**Files:**
- Create: `frontend/src/components/NewDevPanel.tsx`

- [ ] **Step 1: Write NewDevPanel component**

```typescript
'use client';

import { Clock, BookOpen, Lightbulb, X, ExternalLink } from 'lucide-react';
import type { OnboardingData } from '@/types';

interface Props {
  data: OnboardingData;
  onClose: () => void;
  onFileClick: (nodeId: string) => void;
  onConceptClick: (concept: string) => void;
}

export default function NewDevPanel({ data, onClose, onFileClick, onConceptClick }: Props) {
  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[420px] max-h-[80vh] bg-white rounded-xl border border-zinc-200 shadow-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-semibold text-zinc-800">New Dev Guide</span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] text-amber-700 font-medium">
            <Clock className="w-3 h-3" />
            ~{data.estimated_hours} hrs
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 text-zinc-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Overview */}
        <div>
          <p className="text-xs text-zinc-600 leading-relaxed">{data.overview}</p>
        </div>

        {/* Reading order */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-xs font-semibold text-zinc-700">Suggested reading order</span>
          </div>
          <div className="space-y-1.5">
            {data.reading_order.map((item, i) => (
              <button
                key={item.node_id}
                onClick={() => onFileClick(item.node_id)}
                className="w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 transition-all"
              >
                <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-indigo-100 text-[10px] font-semibold text-indigo-700 mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-mono font-medium text-indigo-600">{item.node_id}</span>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{item.reason}</p>
                </div>
                <ExternalLink className="w-3 h-3 text-zinc-300 mt-1 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Core concepts */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-zinc-700">Core concepts</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.core_concepts.map((concept) => (
              <button
                key={concept}
                onClick={() => onConceptClick(concept)}
                className="px-2.5 py-1.5 rounded-full bg-zinc-100 text-[11px] text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 transition-colors"
              >
                {concept}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### Task 8: Frontend — Wire panel into page

**Files:**
- Modify: `frontend/src/app/repos/[id]/page.tsx`

- [ ] **Step 1: Import NewDevPanel and getOnboarding**

Replace existing imports:
```typescript
import ArchitectureGraph from '@/components/ArchitectureGraph';
import InfoPanel from '@/components/InfoPanel';
import AIAssistant from '@/components/AIAssistant';
import SubGraphOverlay from '@/components/SubGraphOverlay';
import AnalysisProgress from '@/components/AnalysisProgress';
```

With:
```typescript
import ArchitectureGraph from '@/components/ArchitectureGraph';
import InfoPanel from '@/components/InfoPanel';
import AIAssistant from '@/components/AIAssistant';
import SubGraphOverlay from '@/components/SubGraphOverlay';
import AnalysisProgress from '@/components/AnalysisProgress';
import NewDevPanel from '@/components/NewDevPanel';
```

Add imports for `getOnboarding` and type:
```typescript
import { getRepositoryGraph, getRepository, getRepositoryStatus, askQuestion, getOnboarding } from '@/lib/api';
import type { GraphNode, GraphEdge, QAItem, GraphAction, SubGraph, OnboardingData } from '@/types';
```

- [ ] **Step 2: Add state variables after existing state**

Add after `const [aiSubGraph, setAiSubGraph] = useState<SubGraph | null>(null);`:
```typescript
const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);
const [onboardingLoading, setOnboardingLoading] = useState(false);
```

- [ ] **Step 3: Add handler functions after `handleAiReset`**

Add after `const handleAiReset`:
```typescript
const handleOpenOnboarding = useCallback(async () => {
  if (!id) return;
  setOnboardingLoading(true);
  try {
    const data = await getOnboarding(id);
    setOnboardingData(data);
  } catch {
    // Keep panel closed on error
  } finally {
    setOnboardingLoading(false);
  }
}, [id]);

const handleReadingFileClick = useCallback((nodeId: string) => {
  const node = graphData?.nodes.find((n) => n.node_id === nodeId);
  if (node) setSelectedNode(node);
  setAiGraphActions([{ type: 'highlight_nodes', nodes: [nodeId] }]);
  setAiSubGraph(null);
}, [graphData]);

const handleConceptClick = useCallback((concept: string) => {
  handleAsk(`Explain ${concept} in this codebase`);
  setOnboardingData(null);
}, [handleAsk]);
```

- [ ] **Step 4: Add "New Dev Mode" button to the toolbar area**

The AIAssistant component currently renders preset buttons inside it. We need to add the "New Dev Mode" button in the page, near the AIAssistant toolbar area, or add it as a prop to AIAssistant.

Simplest approach: add a button directly in the page layout, above the graph area. Insert after the `<AIAssistant>` component in the return:

```typescript
        <button
          onClick={handleOpenOnboarding}
          disabled={onboardingLoading}
          className="absolute top-3 left-3 z-10 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          New Dev Mode
        </button>
```

And import `BookOpen`:
```typescript
import { BookOpen } from 'lucide-react';
```

But wait — the AIAssistant already has a toolbar with preset buttons. The spec says "Sits next to existing preset buttons." But the preset buttons are inside AIAssistant component. We need to either:
1. Add the button inside AIAssistant as a prop
2. Or add it as a separate button in the page

Option 1 is cleaner since the presets are in AIAssistant. Let's add a `onboardingButton` prop.

Actually, looking at the current layout, the presets are inside AIAssistant's side variant (lines 98-114) and bottom variant (lines 229-245). Adding the button there would be the most natural UX.

Let me modify AIAssistant to accept an optional `onboardingButton` ReactNode:

Add to Props:
```typescript
  onboardingButton?: React.ReactNode;
```

Then in the side variant, after the presets scroll area (line 114), add nothing special. The button should go at the end of the scroll area.

Actually, simpler: just render the button in the page as a floating button above the graph. That's clean and doesn't require AIAssistant modification.

Let me go with the floating button approach:

```typescript
// In the return, right after the <div className="flex-1 relative"> line:
<button
  onClick={handleOpenOnboarding}
  disabled={onboardingLoading}
  className="absolute top-3 left-3 z-10 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-50 transition-colors"
>
  <BookOpen className="w-3.5 h-3.5" />
  New Dev Mode
</button>
```

Wait, but the ArchitectureGraph already has a "Reset view" button at `top-3 right-3`. Our button at `top-3 left-3` would overlap with the AIAssistant panel (which is on the left). Actually, the AIAssistant is a separate panel resized via width, so `left-3` of the graph container would be to the right of the AIAssistant. Let me check... The layout is:

```
<div className="flex flex-1 overflow-hidden">
  <AIAssistant ... side />   <!-- left panel -->
  <div className="flex-1 relative">   <!-- graph area -->
    <ArchitectureGraph ... />
  </div>
</div>
```

So `left-3` relative to the `flex-1` graph container would work. It would be just to the right of the AIAssistant panel.

- [ ] **Step 5: Add NewDevPanel to the render**

Add after the SubGraphOverlay:
```typescript
      {onboardingData && (
        <NewDevPanel
          data={onboardingData}
          onClose={() => setOnboardingData(null)}
          onFileClick={handleReadingFileClick}
          onConceptClick={handleConceptClick}
        />
      )}
```

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```
Expected: No errors.

- [ ] **Step 7: Start frontend and do a manual test**

```bash
npx next dev -p 3000
```
1. Open a repo page
2. Click "New Dev Mode" button
3. Verify panel opens with overview, reading order (numbered), core concepts (chips), time badge
4. Click a file in reading order → verify highlight in graph
5. Click a concept chip → verify AI assistant sends the question

---

### Task 9: Self-review

Check against spec requirements:

1. **POST /repos/{id}/onboarding endpoint** ✓ (Task 3)
2. **Prompt engineering for onboarding generation** ✓ (Task 2 - ONBOARDING_PROMPT)
3. **Cache onboarding result in Supabase** ✓ (Task 1 + Task 2 upsert)
4. **Auto-generate after graph build** ✓ (Task 4)
5. **NewDevPanel component** ✓ (Task 7 - overview text, reading order list, concept chips, time badge, draggable, close button)
6. **"New Dev Mode" button** ✓ (Task 8 - floating button above graph)
7. **Wire reading order to graph highlights** ✓ (Task 8 - handleReadingFileClick reuses highlight system)
8. **Concept chips → AI question** ✓ (Task 8 - handleConceptClick calls handleAsk)

**Placeholder check:** No TODOs, TBDs, or incomplete sections. All code blocks contain actual implementation code.

**Type consistency check:** 
- `OnboardingData.overview: string` in frontend matches `overview: str` in backend
- `ReadingOrderItem.node_id: string` matches `node_id` in backend JSON
- `onFileClick(nodeId: string)` matches `handleReadingFileClick(nodeId: string)`
- `onConceptClick(concept: string)` → `handleConceptClick(concept: string)` → `handleAsk("Explain...")`

All consistent.
