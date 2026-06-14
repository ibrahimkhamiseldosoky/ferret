# New Dev Panel Redesign — Guided Tour Experience

## Overview

Replace the current static onboarding panel with a guided tour that feels like a senior engineer walking a new dev through the codebase. Steps have explicit active/done/upcoming states, progress persistence, a "View in graph" button that snaps the main graph to the relevant node, enriched backend metadata per step, and an inline ask-input scoped to the panel.

## Architecture

```
page.tsx (repo page)
  ├── NewDevPanel (stateful guided tour)
  │   ├── tour-steps: active / done / upcoming
  │   ├── progress-dots + Prev/Next navigation
  │   ├── "View in graph" button (active step only)
  │   ├── concept chips → pre-fill ask input
  │   └── ask-input (scoped inline, pre-loaded system context)
  │
  ├── ArchitectureGraph (React Flow)
  │   └── receives focusNodeId → fitView + open InfoPanel
  │
  └── InfoPanel (opens on "View in graph" click)

backend/onboarding_service.py
  └── prompt enriched: per-step {why, tags, estimated_minutes}

backend/migrations/005_onboarding_progress.sql
  └── new onboarding_progress table (session_id, step_index, completed)
```

## Frontend Changes

### 1. NewDevPanel — Guided Tour with State

Replace the two-mode (entry/compact) panel with a single unified panel that supports:
- **Progress dots**: small bar showing all steps, with dot for each. Active dot is wider/colored. Done dots are success color.
- **Three step states**: `done` (checkmark), `active` (highlighted with info border), `upcoming` (default).
- **Prev/Next buttons**: "Prev" goes back (enabled only past first step), "Next" advances (shows "Done ✓" on last step).
- **"View in graph" button**: shown only on the active step. Calls a callback that tells the parent to fitView + open InfoPanel.
- **Step tags**: small pills on each step (config, entry point, routing, async, etc.).
- **Overview as prose paragraph** with bolded key architecture terms.

State management:
```typescript
interface GuidedTourState {
  currentStep: number;       // 0-indexed, which step is active
  completedSteps: number[];  // indices of completed steps
  totalSteps: number;
}
```

Progress is persisted to sessionStorage as `ferret-tour-{repoId}` so closing/reopening preserves place.

### 2. "View in Graph" Handshake

When the user clicks "View in graph" on the active step, the panel calls a new prop:

```typescript
onViewInGraph: (nodeId: string) => void;
```

The parent page handler:
1. Sets `focusNodeId` to the node ID (triggers `fitView` in ArchitectureGraph via existing `fitToNode` logic)
2. Finds the node by filename in `graphData.nodes`
3. Calls `setSelectedNode(node)` to open InfoPanel

Implementation uses existing `fitToNode` in ArchitectureGraph which already calls `fitView` with connected nodes and `setCenter` as fallback. No changes needed in ArchitectureGraph itself — just the parent wiring.

### 3. Concept Chips Pre-fill Ask Input

Currently clicking a concept chip calls `handleAsk` directly. Change to pre-fill the ask input inside NewDevPanel instead. No prop needed — the chip click handler calls `setAskInput(concept)` directly on local state. The user can edit the question before submitting. Remove `onConceptClick` from the prop interface entirely.

### 4. Ask Input Fires into Main AI Assistant

Add an inline ask input at the bottom of the panel with:
- Input field + "Ask" button
- System context pre-loaded: "You are helping a new developer understand this codebase. Answer in beginner-friendly terms."
- Submit calls `onAsk(question: string)` prop on the parent
- **Answer appears in the main AI Assistant sidebar** (not inside the panel). The panel stays open so the user sees both the tour and the answer simultaneously.

### 5. Enriched ReadingOrderItem Type

Update frontend types:

```typescript
export interface ReadingOrderItem {
  node_id: string;
  reason: string;
  tags?: string[];           // NEW: 2-3 keywords per step
  estimated_minutes?: number; // NEW: estimated time for this step
}
```

### 6. Entry Condition and Dismissal

- **Auto-mount**: Panel mounts automatically after analysis completes and onboarding data is available (same trigger as current auto-load logic in `page.tsx`).
- **Dismissal**: X close button at top-right of panel. Closed state is persisted to `sessionStorage` as `ferret-panel-closed-{repoId}` so it won't re-open on page refresh during the same session.
- **Re-open**: The "New Dev Mode" button (currently at top-left of graph area) remains available to re-open the panel after dismissal.

### 7. Loading Skeleton

When onboarding data is being fetched (LLM call can take several seconds), show a skeleton state rather than hiding the panel:

- 3 placeholder step rows with pulse animation
- Each row: circle placeholder (20x20) + two line placeholders (one short, one long)
- No header buttons or action items during loading
- Auto-transitions to real content once data arrives
- If fetch fails: panel closes and does not show error (same as current behavior)

Progress persistence is read from sessionStorage key `ferret-tour-{repoId}` so closing/reopening preserves place.

## Backend Changes

### 1. Enriched Prompt (onboarding_service.py)

Update `ONBOARDING_PROMPT` to request richer metadata per reading_order item:

```json
{
  "overview": "One paragraph...",
  "reading_order": [
    {
      "node_id": "exact_file_label",
      "reason": "Why this file should be read first",
      "tags": ["config", "env vars"],
      "estimated_minutes": 5
    }
  ],
  "core_concepts": ["Authentication", ...],
  "estimated_hours": 3
}
```

New rules:
- `tags`: 2-3 keywords per step (e.g., "config", "entry point", "async", "core logic")
- `estimated_minutes`: integer, rough time to understand this file (2-15 range typical)

**Fallback handling when LLM omits fields:**
- If `tags` is null, undefined, or empty: render no tags for that step (no empty pill UI)
- If `estimated_minutes` is null, undefined, or non-positive: skip that step when calculating total time, never display "NaN min"
- If `reason` is empty: render a generic fallback like "Key file in the codebase"
- Python parsing uses `raw.get("tags", []) or []` pattern to normalize, frontend treats `?` types with explicit null checks before rendering

### 2. Progress Persistence Table

New migration `005_onboarding_progress.sql`:

```sql
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  current_step INTEGER DEFAULT 0,
  completed_steps INTEGER[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_progress_session
  ON onboarding_progress(repository_id, session_id);
```

New endpoint `POST /repos/{id}/onboarding/progress` to save/load progress and `GET /repos/{id}/onboarding/progress?session_id=X` to retrieve.

**Note:** sessionStorage is simpler and works for this use case — the backend progress endpoint is optional and can be deferred.

## File Changes

### Modified files:
- `frontend/src/components/NewDevPanel.tsx` — Complete rewrite: guided tour with active/done/upcoming states, progress dots, Prev/Next, per-step tags, "View in graph" on active step only, concept chips pre-fill local ask input, inline ask firing into main AI assistant, loading skeleton, close + sessionStorage dismissal
- `frontend/src/types/index.ts` — Enrich `ReadingOrderItem` with `tags` and `estimated_minutes`
- `frontend/src/app/repos/[id]/page.tsx` — Add `onViewInGraph` handler, remove `onConceptClick` from NewDevPanel props, wire panel ask input to `handleAsk`
- `backend/app/services/onboarding_service.py` — Update prompt + parsing for enriched schema with fallback handling

### Potentially modified:
- `frontend/src/lib/api.ts` — Optionally add progress save/load endpoints

## Error Handling

- If onboarding fetch fails: skeleton replaces with nothing, panel closes silently (no error UI)
- If LLM returns null/partial fields: frontend renders fallbacks — no tags for missing tags, skip step in time calc for missing minutes, "Key file" fallback for missing reason
- If "View in graph" node not found: no-op (node doesn't exist in graph)
- If ask fails: show a small error message below the ask input ("Could not send question, try again")
- If progress save to sessionStorage fails: silently ignore (non-critical, user just loses their place on refresh)

## Testing

1. Open a repo with analysis complete → panel appears with tour steps (loading skeleton first, then transitions to content)
2. Click "Next" → step 1 marks done, step 2 becomes active, progress dot updates
3. Click "Prev" → goes back, step becomes active again
4. Click "View in graph" → graph snaps to node, InfoPanel opens
5. Click a concept chip → ask input is pre-filled with the concept question
6. Type/edit question in ask input → submit → AI Assistant sidebar shows the answer, panel stays open
7. Close panel with X → panel closes, "New Dev Mode" button remains
8. Refresh page → panel stays closed (sessionStorage dismissal key)
9. Re-open via button → panel opens, progress restored from sessionStorage
10. Verify: if tags missing → no tags shown. If estimated_minutes missing → step skipped in total time calc
