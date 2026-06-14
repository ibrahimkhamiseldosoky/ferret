# Ferret

Upload a repository, get an interactive architecture graph, and ask AI questions about the codebase.

## Features

### Repository Upload
Upload a ZIP of any codebase. Ferret scans the files, detects languages (Python, JavaScript, TypeScript), parses ASTs, maps dependencies, and builds a knowledge graph stored in Supabase PostgreSQL.

### Interactive Architecture Graph
The graph visualizes your codebase as nodes (files, services, APIs, databases) with edges showing dependencies.

**Layout** — nodes are grouped by type (service, API, database, file) and directory, so structure is readable at a glance. Uses dagre auto-layout for sub-graph overlays.

**Search & filter** — a centered search bar filters nodes by name; type pills (All/Services/APIs/Databases/Files/Events/External) show visible/total counts. Non-matching nodes are dimmed (not hidden) to preserve graph structure.

**Directory collapsing** — files in the same directory can be collapsed into a single compact chip with a folder icon and child count badge. Collapsed directories show at the bounding box center of their children; all child edges are re-routed to the directory node.

**Focus mode** — click the crosshair (Isolate) button in the InfoPanel to focus on a node and its immediate neighbors. Everything else fades to 0.04 opacity. Click Exit (X) to return to full view.

**Heat map** — toggle heat map mode (top-right button) to color nodes by dependency count.

**Click to inspect** — click any node to see its dependencies and dependents in a floating info panel. Clicking empty space or another node clears AI state and returns to free exploration.

**Color-coded types** — services are green, APIs yellow, databases pink, files blue — easy to distinguish architectural roles.

**Edge highlights** — clicking a node shows only its connected edges (dimmed for unrelated ones). AI highlights use purple for exact matches and dimmed edges for neighbors. Filtered edges (connected to non-matching nodes) are dimmed at 0.08 opacity.

### AI Assistant
Ask natural-language questions about the codebase. Uses a **2-tier architecture** for accuracy and speed:

- **Tier A (Rules Classifier)** — 28 regex patterns classify the question into one of 6 intents: entrypoints, unused code, external dependencies, auth flow, DB interactions, request flow. This is deterministic — no LLM involved.
- **Tier B (LLM Formatter)** — if a known intent is matched, the answer is built from deterministic graph data and a small LLM formats it as natural language. For freeform questions, a full LLM query runs with strict graph-grounded validation.

**Deterministic semantic queries** — the 6 intents map to pure graph-traversal functions: `find_entrypoints`, `find_unused_nodes`, `find_external_dependencies`, `find_auth_flow`, `find_db_interactions`, `find_request_flow`. Zero LLM calls for these paths — just BFS/DFS over real DB nodes and edges.

**Graph-grounded validation** — every LLM-generated claim (highlight suggestions, edge intents, evidence file hints) is verified against actual DB nodes. Confidence = fraction of claims that reference real graph entities. If the LLM invents a file or function, it's dropped from the response.

**Accuracy-focused prompting** — the system prompt enforces strict rules: the AI may not introduce new entities, must cite only graph-observed sources, and cannot invent function names. All responses include confidence scores backed by graph overlap.

Five preset questions get you started:
- Explain Repository
- Show Authentication
- Show Main Services
- Show Request Flow
- Find Dead Code

**Integrated onboarding** — the New Dev Mode guide is built into the AI panel. Reading order is computed deterministically via topological sort of the dependency graph (no LLM involved). The LLM only generates the overview and core concept explanations. When triggered, an overview + guided tour appears at the top of the chat. Core concepts are pinned at the bottom with an unpin/repin toggle. The guide scrolls away naturally as you scroll down (sticky-once-you-scroll-past behavior).

**Clickable file names** — file and service names in AI responses are rendered as blue clickable chips that open the InfoPanel for that node.

**Markdown rendering** — AI responses render bold, code, lists, and headings. Code blocks wrap and scroll horizontally instead of overflowing.

### AI-Driven Graph Control
The AI doesn't just answer in text — it interacts with the graph visually.

**Sub-graph overlays** — the AI can draw custom flow diagrams in a floating panel to explain concepts (e.g., login flow: User → Auth API → Database). Uses dagre auto-layout with `rankdir: TB`. The overlay is draggable and positioned with `position: fixed`. A "View in Main Graph" button maps overlay nodes to real files via label and ID matching.

**Evidence cards** — each answer includes evidence showing which files support the claim, their relevance score (0–100%), and whether the evidence is `observed` (in symbol data), `inference` (educated guess), or `dependency` (based on graph edges). Clicking an evidence card highlights that file in the main graph.

**Manual mode** — clicking any node or empty space clears AI highlights and overlays, returning to free exploration.

**Degraded mode** — if the AI output exceeds size limits or contains invalid references, Ferret shows a warning banner rather than silently breaking.

### New Dev Mode (Onboarding Guide)
Auto-generated onboarding for unfamiliar codebases. After analysis completes, the AI panel shows:
- **Overview** — high-level description of the codebase
- **Reading order** — numbered files to read first, each clickable to highlight in the graph
- **Concept chips** — key concepts you can click to ask the AI about
- **Time estimate** — estimated reading time badge

The guide is cached in the `onboarding_guides` table to avoid regenerating on every visit.

### Analysis Progress
After uploading, Ferret shows step-by-step progress: detecting languages → building ASTs → mapping dependencies → creating knowledge graph → generating architecture. No blank loading screens.

## Tech Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind v4, React Flow, lucide-react, dagre, react-markdown
- **Backend:** Python FastAPI, Supabase (PostgreSQL), OpenRouter/OpenAI, JWT (python-jose), bcrypt (passlib)
- **Parsers:** Python `ast` module, regex-based JS/TS parsing
- **Storage:** Supabase PostgreSQL (`repositories`, `nodes`, `edges`, `onboarding_guides` tables)

### Authentication (Beta)

Ferret uses email/password authentication for beta access, limited to 20 test users.

**Flow:**
1. User signs up at `/signup` — backend checks user count (< 20), creates account with bcrypt-hashed password
2. On success, user receives a JWT (7-day expiry) and a unique reward key for full-release benefits
3. All API routes (except auth endpoints) require `Authorization: Bearer <token>` header
4. When the 20-user cap is reached, signup shows a waitlist form collecting emails in a `waitlist` table

**Reward keys** — each user gets a UUID at signup stored in `users.reward_key`. Displayed in the dashboard with a copy button. For use at full release.

**Frontend auth** — `AuthContext` provider in `src/lib/auth.tsx` manages token + user state. Protected pages redirect to `/login` if no valid token.

## Backend Architecture

### Deterministic over LLM (Architecture Principle)
Ferret treats the graph as the single source of truth. The LLM is only a narrator — it may never introduce new entities, create edges, or invent file names. Everything structural (subgraphs, reading order, flow paths) is computed deterministically from the DB. The LLM only formats precomputed data.

### Caching Layer
A unified `QueryCache` (LRU, 200 entries, 5-minute TTL) caches all deterministic operations:

- **Semantic queries** — all 6 query results cached per intent
- **Subgraph extractions** — cached by anchor node IDs + depth
- **Reading orders** — cached per repository

Cache is **invalidated automatically** when a repo is re-analyzed or deleted. A `POST /{id}/invalidate-cache` endpoint is also available for manual invalidation.

### 2-Tier Question Handling
1. Tier A (`query_classifier.py`) — 28 regex rules classify the question into: `entrypoints`, `unused_code`, `external_deps`, `auth_flow`, `db_interactions`, `request_flow`, or `freeform`
2. Tier B (`_handle_semantic_query`) — for known intents, the deterministic query executes (cached) and a small formatter LLM narrates the result. For freeform, the full LLM path runs with post-hoc graph validation.

### Subgraph Endpoint
`POST /{id}/subgraph` with `{ anchor_node_ids, depth }` — BFS extraction from real DB nodes/edges. Used by the frontend for mini-graph overlays. Stored in cache per anchor+depth.

### Resilient LLM Calls
Both `question_service.py` and `onboarding_service.py` use a robust LLM calling pattern:

- **Timeouts** — OpenAI client configured with a 90-second timeout (was: no timeout, could hang forever)
- **Retry with exponential backoff** — up to 3 retries for rate limits (429), timeouts, connection errors, and server errors (5xx). Bad JSON and auth errors fail fast.
- **Error categorization** — each error type maps to a user-facing hint: rate limit → "please wait", timeout → "try again", connection → "check network"
- **Logging** — every LLM request logs repo name, node/edge counts, confidence, degraded mode, and evidence count. Errors include full stack traces.
- **Input validation** — empty questions, missing repos, and incomplete analyses return specific messages without hitting the LLM.

### Pipeline
1. **`analysis_service.py`** — background thread scans files, parses ASTs, extracts dependencies, builds graph, stores in DB. Fire-and-forget onboarding generation after completion.
2. **`question_service.py`** — classifies question intent (Tier A), runs deterministic query or full LLM path (Tier B). All LLM responses verified against graph entities.
3. **`validator.py`** — sanitizes LLM output: truncates oversized lists, validates confidence range, drops claims referencing unknown nodes, sets degraded mode when data is trimmed.
4. **`resolver.py`** — maps filename hints from the LLM to actual node IDs in the database, handles ambiguity with alias resolution. Logs unresolvable items instead of silent drops.

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.10+
- Supabase project (tables: `repositories`, `nodes`, `edges`, `onboarding_guides`)
- OpenRouter or OpenAI API key

### Setup

1. Clone the repo and install dependencies:

```bash
cd frontend && npm install
cd ../backend && pip install -r requirements.txt
```

2. Create `.env.txt` at project root:

```
# .env.txt
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openrouter_or_openai_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=openai/gpt-oss-120b
NEXT_PUBLIC_API_URL=http://localhost:8000
```

3. Run migrations against your Supabase database (run in order):
   - `backend/migrations/001_create_tables.sql`
   - `backend/migrations/004_onboarding_guides.sql`

4. Start both servers:

```bash
# Terminal 1 — Backend (restart to pick up new files)
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend && npx next dev -p 3000
```

5. Open `http://localhost:3000`, upload a ZIP, and explore.

## Deployment

### Frontend → Vercel
1. Push this repo to GitHub
2. Create a new project in Vercel, import the GitHub repo
3. Set root directory to `frontend/`
4. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-railway-url.com`
5. Deploy — auto-deploys on every push to main

### Backend → Railway
1. Create a new project in Railway, point it at the same GitHub repo
2. Set root directory to `backend/`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`
   - `JWT_SECRET` (generate a random string)
   - `ALLOWED_ORIGINS=https://your-vercel-app.vercel.app`
   - `ENVIRONMENT=production`

### Supabase
Run each migration SQL file against your Supabase project in order:
- `backend/migrations/001_create_tables.sql`
- `backend/migrations/004_onboarding_guides.sql`
- `backend/migrations/005_auth.sql`

## Project Structure

```
ferret/
├── frontend/               # Next.js app (TypeScript, Tailwind v4, App Router)
│   └── src/
│       ├── app/
│       │   ├── page.tsx                 # Landing page
│       │   ├── dashboard/page.tsx       # Repository list
│       │   └── repos/[id]/page.tsx      # Graph view, AI assistant, panels
│       ├── components/
│       │   ├── ArchitectureGraph.tsx    # React Flow graph with focus/dim/collapse
│       │   ├── GraphControls.tsx        # Search bar + type filter pills
│       │   ├── DirectoryNode.tsx        # Collapsible directory group node
│       │   ├── AIAssistant.tsx          # Chat + onboarding + pinned concepts
│       │   ├── SubGraphOverlay.tsx      # Floating mini-graph (dagre, position:fixed)
│       │   ├── InfoPanel.tsx            # Floating node detail + Isolate button
│       │   ├── Markdown.tsx             # Markdown renderer with clickable file links
│       │   ├── AnalysisProgress.tsx     # Step progress indicator
│       │   └── CustomScrollArea.tsx     # Styled scroll area wrapper
│       ├── lib/
│       │   └── api.ts                   # API client (upload, ask, graph, etc.)
│       └── types/
│           └── index.ts                 # QAItem, GraphNode, OnboardingData, etc.
├── backend/                # FastAPI app (Python)
│   └── app/
│       ├── api/
│       │   ├── repositories.py   # Upload, delete, onboarding, status endpoints
│       │   ├── analysis.py       # Graph + files endpoints
│       │   └── questions.py      # Ask endpoint
│       ├── services/
│       │   ├── cache.py                  # LRU query cache (200 entries, 5min TTL)
│       │   ├── question_service.py       # AI Q&A with 2-tier model + graph validation
│       │   ├── query_classifier.py       # Tier A — 28-pattern rules-based intent classifier
│       │   ├── semantic_queries.py       # 6 deterministic graph-traversal query functions
│       │   ├── subgraph_service.py       # BFS subgraph extraction from real DB nodes
│       │   ├── reading_order.py          # Topological sort for onboarding reading order
│       │   ├── resolver.py               # LLM intent (filename/edge) → DB ID resolution
│       │   ├── validator.py              # LLM output sanitization + graph claim validation
│       │   ├── analysis_service.py       # Background analysis pipeline (daemon thread)
│       │   ├── repository_service.py     # Repository CRUD
│       │   └── onboarding_service.py     # Onboarding guide (deterministic reading order)
│       ├── parsers/
│       │   ├── ast_parser.py         # Python AST + JS/TS regex parsing
│       │   ├── dependency_extractor.py # Cross-file dependency mapping
│       │   ├── scanner.py            # File discovery
│       │   ├── detector.py           # Primary language detection
│       │   └── graph_builder.py      # Graph node/edge construction + layout
│       ├── models/
│       │   ├── repository.py         # Pydantic request/response models
│       │   └── graph.py              # GraphNode, GraphEdge, ArchitectureGraph
│       └── core/
│           ├── config.py             # Settings from .env.txt
│           └── database.py           # Supabase client
├── backend/migrations/
│   ├── 001_create_tables.sql
│   ├── 002_add_repo_fields.sql
│   ├── 003_clean_tables.sql
│   └── 004_onboarding_guides.sql
├── docs/superpowers/
│   ├── specs/
│   │   └── ferret-v1.md              # Product spec
│   └── plans/
│       └── checklists/               # Implementation plans
└── .env.txt                          # Secrets (not committed)
```
