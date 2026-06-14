# New Dev Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the static onboarding panel into a guided tour with active/done/upcoming states, progress dots, "View in graph" handshake, step tags, concept chips that pre-fill the ask input, inline ask scoped to the panel, loading skeleton, and sessionStorage persistence.

**Architecture:** Frontend-only changes to `NewDevPanel.tsx` + `page.tsx` + `types/index.ts`, plus backend prompt enrichment in `onboarding_service.py`. The graph handshake reuses existing `fitToNode` + `setSelectedNode`. Progress uses sessionStorage. No new backend endpoints or migrations needed.

**Tech Stack:** Next.js/TypeScript/Tailwind v4, lucide-react, Python FastAPI, OpenRouter/OpenAI

---

### File Structure

**Modified files:**
- `frontend/src/types/index.ts:95-98` — Enrich `ReadingOrderItem` with `tags` and `estimated_minutes`
- `backend/app/services/onboarding_service.py` — Update prompt + parsing with fallbacks
- `frontend/src/components/NewDevPanel.tsx` — Complete rewrite
- `frontend/src/app/repos/[id]/page.tsx` — Wiring changes

---

### Task 1: Enrich ReadingOrderItem type

**Files:**
- Modify: `frontend/src/types/index.ts:95-98`

- [ ] **Step 1: Add tags and estimated_minutes to ReadingOrderItem**

```typescript
export interface ReadingOrderItem {
  node_id: string;
  reason: string;
  tags?: string[];
  estimated_minutes?: number;
}
```

Edit `frontend/src/types/index.ts:95-98` to match the above.

---

### Task 2: Enriched prompt + fallback parsing (backend)

**Files:**
- Modify: `backend/app/services/onboarding_service.py`

- [ ] **Step 1: Update ONBOARDING_PROMPT to request tags and estimated_minutes per step**

Edit the prompt's JSON schema section:

```
Respond in valid JSON with this exact schema:
{
  "overview": "One paragraph explaining what this repository does and its purpose.",
  "reading_order": [
    {
      "node_id": "exact_file_label_from_nodes",
      "reason": "Why this file should be read first",
      "tags": ["config", "env vars"],
      "estimated_minutes": 5
    }
  ],
  "core_concepts": ["Authentication", "Data Layer", "API Gateway", ...],
  "estimated_hours": 3
}
```

Add new rules:
- `tags`: 2-3 keywords per step
- `estimated_minutes`: integer, rough time to understand this file (2-15 range typical)

- [ ] **Step 2: Update parsing to extract new fields with fallbacks**

In `generate_onboarding`, update the reading_order extraction:

```python
    reading_order = []
    for item in raw.get("reading_order", []):
        if not isinstance(item, dict):
            continue
        reading_order.append({
            "node_id": item.get("node_id", ""),
            "reason": item.get("reason", "Key file in the codebase"),
            "tags": item.get("tags") or [],
            "estimated_minutes": max(0, int(item["estimated_minutes"])) if item.get("estimated_minutes") is not None else None,
        })
```

Replace the existing `reading_order = raw.get("reading_order", [])` and the validation loop after it. Keep the `valid_labels` filter.

- [ ] **Step 3: Verify no syntax errors**

Run: `cd backend && python -c "import ast; ast.parse(open('app/services/onboarding_service.py').read()); print('OK')"`
Expected: `OK`

---

### Task 3: Rewrite NewDevPanel with guided tour

**Files:**
- Rewrite: `frontend/src/components/NewDevPanel.tsx`

This is the largest task. The panel has these sections (built top-to-bottom):
1. Header: icon, title, subtitle, badges (file count + total time)
2. Overview: prose paragraph with bolded key terms
3. Guided tour steps: each step a row with circle indicator (num/check), filename, desc, tags, "View in graph" button (active only). Prev/Next nav + progress dots
4. Concept chips: with icons, clicking pre-fills ask input
5. Inline ask input: fires via onAsk prop
6. Loading skeleton: shown when `data` prop is null/loading
7. Close button: calls onClose

Props interface:

```typescript
interface GuidedTourStep {
  node_id: string;
  reason: string;
  tags?: string[];
  estimated_minutes?: number;
}

interface Props {
  data?: OnboardingData | null;
  loading?: boolean;
  repoName?: string;
  fileCount?: number;
  onClose: () => void;
  onViewInGraph: (nodeId: string) => void;
  onAsk: (question: string) => void;
}
```

States:
- `currentStep: number` (0-indexed, which step is active)
- `completedSteps: Set<number>` (indices of completed steps)
- `askInput: string` (controlled input value)
- `askError: string | null` (error message on submit failure)

- [ ] **Step 1: Write the loading skeleton**

When `loading` is true or `data` is null, render a skeleton with 3 placeholder step rows:

```tsx
{loading || !data ? (
  <div className="p-4 space-y-4">
    <div className="h-4 bg-zinc-200 rounded animate-pulse w-3/4" />
    <div className="h-3 bg-zinc-200 rounded animate-pulse w-full" />
    <div className="h-3 bg-zinc-200 rounded animate-pulse w-5/6" />
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex items-center gap-3 p-3">
        <div className="w-5 h-5 rounded-full bg-zinc-200 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-zinc-200 rounded animate-pulse w-2/3" />
          <div className="h-2.5 bg-zinc-200 rounded animate-pulse w-full" />
        </div>
      </div>
    ))}
  </div>
) : (
  // real content
)}
```

- [ ] **Step 2: Compute total estimated time from steps**

```typescript
const totalMinutes = useMemo(() => {
  if (!data) return 0;
  return data.reading_order.reduce((sum, step) => {
    return sum + (step.estimated_minutes && step.estimated_minutes > 0 ? step.estimated_minutes : 0);
  }, 0);
}, [data]);
```

Used in the time badge: `~{totalMinutes} min` if `totalMinutes > 0`, else `~{data.estimated_hours}h`.

- [ ] **Step 3: Build the guided tour steps UI**

Each step row:

```tsx
<div
  key={idx}
  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
    idx === currentStep
      ? 'bg-blue-50 border-blue-200'
      : completedSteps.has(idx)
        ? 'bg-green-50/50 border-green-200/50'
        : 'bg-white border-transparent hover:bg-zinc-50'
  }`}
  onClick={() => setCurrentStep(idx)}
>
  {/* Number circle */}
  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5 ${
    completedSteps.has(idx)
      ? 'bg-green-500 text-white'
      : idx === currentStep
        ? 'bg-blue-600 text-white'
        : 'bg-zinc-100 text-zinc-500'
  }`}>
    {completedSteps.has(idx) ? '✓' : idx + 1}
  </div>

  {/* Body */}
  <div className="flex-1 min-w-0">
    <div className={`text-xs font-mono font-medium ${
      idx === currentStep ? 'text-blue-700' : 'text-zinc-800'
    }`}>
      {step.node_id.split('/').pop()}
    </div>
    <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{step.reason}</p>

    {/* Tags */}
    {step.tags && step.tags.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {step.tags.map((tag) => (
          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200/50">
            {tag}
          </span>
        ))}
      </div>
    )}
  </div>

  {/* "View in graph" — active step only */}
  {idx === currentStep && (
    <button
      onClick={(e) => { e.stopPropagation(); onViewInGraph(step.node_id); }}
      className="shrink-0 text-[10px] px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
    >
      View in graph ↗
    </button>
  )}
</div>
```

- [ ] **Step 4: Progress dots + Prev/Next navigation**

```tsx
/* Progress dots row */
<div className="flex items-center justify-between pt-2">
  <div className="flex gap-1.5">
    {data.reading_order.map((_, idx) => (
      <div
        key={idx}
        className={`h-1.5 rounded-full transition-all duration-300 ${
          completedSteps.has(idx)
            ? 'w-4 bg-green-500'
            : idx === currentStep
              ? 'w-6 bg-blue-500'
              : 'w-1.5 bg-zinc-300'
        }`}
      />
    ))}
  </div>

  <div className="flex gap-2">
    <button
      onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
      disabled={currentStep === 0}
      className="text-xs px-3 py-1.5 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-default transition-colors"
    >
      ← Prev
    </button>
    <button
      onClick={() => {
        if (currentStep === data.reading_order.length - 1) {
          onClose();
          return;
        }
        const next = currentStep + 1;
        const newCompleted = new Set(completedSteps);
        newCompleted.add(currentStep);
        setCompletedSteps(newCompleted);
        setCurrentStep(next);
      }}
      className="text-xs px-3 py-1.5 rounded-md bg-zinc-900 text-white hover:bg-zinc-800 transition-colors font-medium"
    >
      {currentStep === data.reading_order.length - 1 ? 'Done ✓' : 'Next →'}
    </button>
  </div>
</div>
```

- [ ] **Step 5: Concept chips — pre-fill ask input**

Each chip has an icon and label. Clicking sets askInput:

```tsx
const CONCEPT_ICONS: Record<string, string> = {
  'Authentication': '🔒',
  'Data Layer': '🗄️',
  'API Gateway': '🌐',
};

// In render:
<div className="flex flex-wrap gap-2">
  {data.core_concepts.map((concept) => (
    <button
      key={concept}
      onClick={() => setAskInput(`Explain ${concept} in this codebase`)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 text-xs text-zinc-600 hover:bg-zinc-200 hover:text-zinc-800 transition-colors"
    >
      <span>{CONCEPT_ICONS[concept] || '💡'}</span>
      {concept}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Inline ask input**

```tsx
<div className="pt-3 border-t border-zinc-100">
  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Ask anything</p>
  <div className="flex gap-2">
    <input
      type="text"
      value={askInput}
      onChange={(e) => setAskInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && askInput.trim()) {
          e.preventDefault();
          try { onAsk(askInput.trim()); setAskError(null); } catch { setAskError('Could not send question'); }
        }
      }}
      placeholder="e.g. where do I add a new API endpoint?"
      className="flex-1 h-9 px-3 rounded-lg border border-zinc-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
    />
    <button
      onClick={() => {
        if (askInput.trim()) {
          try { onAsk(askInput.trim()); setAskError(null); } catch { setAskError('Could not send question'); }
        }
      }}
      disabled={!askInput.trim()}
      className="h-9 px-3 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-40 transition-colors"
    >
      Ask ↗
    </button>
  </div>
  {askError && <p className="text-[10px] text-red-500 mt-1">{askError}</p>}
</div>
```

- [ ] **Step 7: Assemble the full panel + sessionStorage**

Read progress on mount from `sessionStorage.getItem('ferret-tour-{repoId}')`. Use a `repoId` prop to key storage.

Write progress on every step change:
```typescript
useEffect(() => {
  if (!repoId) return;
  sessionStorage.setItem(
    `ferret-tour-${repoId}`,
    JSON.stringify({ currentStep: Array.from(completedSteps), completedSteps: currentStep })
  );
}, [currentStep, completedSteps, repoId]);
```

- [ ] **Step 8: Verify build**

Run: `cd frontend && npm run build`
Expected: No TypeScript or compilation errors.

---

### Task 4: Wire page.tsx

**Files:**
- Modify: `frontend/src/app/repos/[id]/page.tsx`

- [ ] **Step 1: Update NewDevPanel props usage**

Replace the current `<NewDevPanel>` usage in the render:

Remove the `onConceptClick` prop. Add `onViewInGraph` and `onAsk` props. Pass `repoName` and `fileCount` from repo data.

Update the auto-load effect to use sessionStorage dismissal key `ferret-panel-closed-{repoId}`:

```typescript
useEffect(() => {
  if (!graphData || loading) return;
  const dismissed = sessionStorage.getItem(`ferret-panel-closed-${id}`);
  if (dismissed) return;

  setOnboardingLoading(true);
  getOnboarding(id)
    .then((data) => {
      setOnboardingData(data);
      setOnboardingLoading(false);
    })
    .catch(() => setOnboardingLoading(false));
}, [graphData, loading, id]);
```

- [ ] **Step 2: Add onViewInGraph handler**

```typescript
const handleViewInGraph = useCallback(
  (nodeId: string) => {
    navigateToNode(nodeId);
    setAiGraphActions([{ type: 'highlight_nodes', nodes: [nodeId] }]);
  },
  [navigateToNode]
);
```

- [ ] **Step 3: Update the NewDevPanel render**

Replace the existing `<NewDevPanel>` block:

```typescript
      {onboardingData !== null || onboardingLoading ? (
        <NewDevPanel
          data={onboardingData}
          loading={onboardingLoading}
          repoName={repo?.name}
          fileCount={graphData?.nodes.length}
          onClose={() => {
            sessionStorage.setItem(`ferret-panel-closed-${id}`, '1');
            setOnboardingData(null);
            setOnboardingLoading(false);
          }}
          onViewInGraph={handleViewInGraph}
          onAsk={handleAsk}
        />
      ) : null}
```

- [ ] **Step 4: Remove reference to `handleConceptClick` and `handleStartExploring`**

These are no longer needed since the panel handles concept clicks internally and the entry mode is gone.

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: No TypeScript or compilation errors.

---

### Self-Review

**1. Spec coverage:**
- Guided tour with active/done/upcoming states → Task 3 Step 3
- Progress dots + Prev/Next → Task 3 Step 4
- "View in graph" on active step only → Task 3 Step 3 + Task 4 Step 2
- Step tags → Task 3 Step 3 (tags rendering)
- Concept chips pre-fill ask input → Task 3 Step 5 (setAskInput, no prop)
- Ask input fires into main AI Assistant → Task 3 Step 6 (onAsk prop) + Task 4 Step 3
- Loading skeleton → Task 3 Step 1
- Entry condition + dismissal → Task 4 Step 1 + Step 3 (sessionStorage key)
- sessionStorage progress persistence → Task 3 Step 7
- Backend enriched prompt → Task 2 Step 1
- Fallback handling → Task 2 Step 2
- Enriched types → Task 1

**2. Placeholder scan:** All steps contain actual code or exact descriptions. No TODOs, TBDs, or vague "add error handling" instructions.

**3. Type consistency:**
- `ReadingOrderItem.tags?: string[]` matches `item.get("tags")` in Python
- `ReadingOrderItem.estimated_minutes?: number` matches `max(0, int(...))` fallback
- `Props.onViewInGraph: (nodeId: string) => void` matches `handleViewInGraph(nodeId: string)`
- `Props.onAsk: (question: string) => void` matches `handleAsk(question: string)`
- `Props.data?: OnboardingData | null` matches `typeof onboardingData`
