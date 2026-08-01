# Changelog — Design System Lifecycle Management

Built by **John Holt, Raibach Interactive Design Studio** <sub>{impromptu}</sub>


## 2026-08-01 (PM2): Role-Based Governance Architecture — Multi-Role Access, Milvus Repurposing, Trace System Design

**This is the entry where the system stopped being a prompt builder and became a multi-role enterprise platform.** The insight: everyone in the company opens the same prompt package — governance, UX design, research, product — but they each need to see completely different things. The same data, viewed through completely different lenses, gated by departmental role. This entry documents the architecture that makes that possible, the Milvus governance repurposing, the four user personas for Figma design work, and the role-to-capability matrix that connects them.

### The Philosophy: Same Package, Different Lenses

Agnes in Accounting opens a prompt package. She sees the prompt content and the chat tab. She runs the prompt, gets her answer, moves on. She never sees trace data, cost metrics, or model performance.

A Director opens the same prompt package. She sees none of the prompt builder — she's observing, not authoring. Instead she sees: cost per invocation, change history (who changed what and when), hallucination rates, cross-departmental usage patterns, the data dignity ledger. Her question is "how much did this prompt cost the company, and is the AI behaving safely?"

A UX Designer opens the same package. She sees: component usage metrics, Figma spec compliance, A/B test results, design system library management tools. Her question is "how are the components performing, and is the design system being followed?"

A Researcher opens the same package. She sees: writing tools, research synthesis capabilities, training data quality, feedback patterns, export. Her question is "can I synthesize my discovery notes and cross-reference other prompts?"

A Product Manager opens the same package. She sees: layout tools, wireframe assembly, version comparisons, compiled output. Her question is "can I assemble wireframes using approved design system components for ideation?"

**Same data. Different lenses. One interface.** The role determines what you see; the session permission determines what you can do. This is the core architectural principle.

### Two Dimensions of Access

**Dimension 1 — Departmental Role (`users.prompt_role`)**

This is per-user. It follows you across all packages. It drives what you SEE — which tabs, which tools, which data views. Values: `governance` | `ux-design` | `research` | `product` | `basic`.

This column existed in the database (`init_db.py:692`, default `'viewer'`) but was never queried by any backend code. It was a defined-but-unused column — the migration created it, nobody read it. This entry wires it in.

**Dimension 2 — Session Permission (`session_permissions.role`)**

This is per-package. You might be `owner` of accounting prompts but `viewer` on the design system prompts. It drives what you can DO — edit, save, share, transfer. Values: `owner` | `editor` | `viewer`.

This was already enforced in `prompt_sessions_api.py` (owner/editor can write, viewer can only read). No changes needed there.

**The intersection:** When Agnes (`prompt_role='basic'`, `session_permissions.role='viewer'`) opens a prompt package, she sees the prompt content read-only and the chat tab. When a Director (`prompt_role='governance'`, `session_permissions.role='viewer'`) opens the same package, she sees governance data but not the prompt builder. Both are `viewer` on the session — but their departmental role changes what's visible.

### The Four Departmental Personas (+ Basic)

These personas are the specification for the Figma design work. Each persona's tab list and tag list defines what screens to design.

**1. GOVERNANCE — "How much did this cost, and is the AI safe?"**
- Persona: Corporate director, compliance officer, department head
- Tabs: `trace`, `metadata`
- Tags: `version-trace`, `status-indicator`, `error-banner`, `dynamic-button`
- Governance tables: `grace_decisions`, `grace_health_metrics`, `audit_logs`, `usage_metrics`, `data_dignity_ledger`, `prompt_history`, `memory_provenance`
- Can author: No (observing, not authoring)
- Sees: Cost data, decision traces, quality metrics, cross-departmental data
- PLANNED tags (not yet in registry): `cost-dashboard`, `audit-log-view`, `hallucination-report`

**2. UX DESIGN — "How are the components performing?"**
- Persona: Design system manager, component librarian
- Tabs: `chat`, `trace`, `tools`, `variables`
- Tags: `prompt-section-editor`, `compiled-output-viewer`, `workspace-layout`, `toggle_code_view`, `output-panel`, `version-trace`, `status-indicator`, `error-banner`, `dynamic-button`
- Governance tables: `prompt_versions`, `prompt_artifacts`, `prompt_feedback`, `prompt_ratings`, `figma_specs`, `tag_definitions`
- Can author: Yes
- Sees: Quality metrics (not cost, not cross-departmental)
- PLANNED tags: `figma-spec`, `component-catalog`, `ab-test-result`

**3. RESEARCH — "Can I synthesize and cross-reference?"**
- Persona: Researcher, analyst, synthesizer
- Tabs: `chat`, `trace`, `evaluation`
- Tags: Full Lexical editor suite (`load_tool`, `set_content`, `format_*`, `insert_*`, `undo`, `redo`, `export`, `check_writing`, `apply_suggestion`, `start_dictation`, `stop_dictation`, etc.)
- Governance tables: `training_data`, `prompt_feedback`, `prompt_comments`, `prompt_versions`
- Can author: Yes
- Sees: Quality metrics (not cost, not cross-departmental, not decision trace)

**4. PRODUCT — "Can I assemble wireframes for ideation?"**
- Persona: Product manager, product designer
- Tabs: `chat`, `trace`, `tools`
- Tags: `prompt-section`, `save-button`, `run-button`, `output-panel`, `version-trace`, `layout-row`, `layout-col`, `prompt-section-editor`, `compiled-output-viewer`, `workspace-layout`, `chat-panel`
- Governance tables: `prompt_versions`, `prompt_artifacts`, `prompt_feedback`, `prompt_ratings`, `prompt_history`
- Can author: Yes
- Sees: Decision traces (not cost, not quality metrics, not cross-departmental)

**5. BASIC — "I just need to run this prompt."**
- Persona: Agnes in Accounting — most users
- Tabs: `chat`
- Tags: `chat-panel`, `status-indicator`, `error-banner`
- Governance tables: none
- Can author: No
- Sees: Nothing governance-related. Just the prompt and the chat.

### The Governance Schema — 17 Tables Already Built

The database already contains the tables needed for multi-role governance. This was designed correctly from the start; it just wasn't wired to the UI.

| Purpose | Table | Key columns |
|---------|-------|-------------|
| AI decision + reasoning trace | `grace_decisions` | `decision`, `reasoning_trace`, `confidence_level`, `was_overridden`, `override_justification` |
| Hallucination/quality monitoring | `grace_health_metrics` | `hallucination_rate`, `coherence_score`, `creativity_score`, `confidence_avg` |
| Which memories were used & flagged | `grace_context` | `retrieval_count`, `hallucination_flags`, `relevance_score` |
| Who did what, when | `audit_logs` | `user_id`, `action`, `resource_type`, `metadata` |
| Prompt change history | `prompt_history` | `action`, `changes` (JSONB), `user_id` |
| Versioned prompt content + scores | `prompt_versions` | `version_number`, `compiled_output`, `overall_score`, `score_breakdown` |
| User feedback & ratings | `prompt_feedback` + `prompt_ratings` | `feedback_type`, `rating`, `curator_notes` |
| Usage tracking by period | `usage_metrics` | `metric_type`, `count`, `period_month` |
| Memory provenance (who touched what) | `memory_provenance` | `event_type`, `initiated_by`, `context_type` |
| Role-based session access | `session_permissions` | `session_id`, `user_id`, `role` |
| Data dignity / value tracking | `data_dignity_ledger` | `value_usd`, `compensation_status`, `usage_context` |
| Cross-departmental sharing | `prompt_shares` | `shared_by`, `shared_with`, `permission_level` |
| Which model generated what | `ai_suggestions` + `prompt_sessions` | `generated_by_model`, `model_name` |
| User departmental role | `users` | `role`, `prompt_role` |

All governance data is **session-scoped**. Every table has either `session_id` or `conversation_id` (which links to `session_id`). When a Director opens a prompt package, the query is: `SELECT * FROM grace_decisions WHERE session_id = ?` — and the role filter decides which columns and aggregations to show.

### Milvus Architecture — Repurposing for Governance

**The decision: Milvus moves from storing user memories to embedding decision traces for governance pattern recognition.**

This is the architectural pivot that aligns Milvus with the governance vision:

**PostgreSQL = Audit Layer (what happened)**
- `grace_decisions` records every AI decision with its reasoning trace, confidence level, and whether it was overridden
- `audit_logs` records who did what, when, from what IP
- `prompt_history` records every change to every prompt package
- These are the immutable, queryable, relational records — "what happened"

**Milvus = Governance Layer (pattern recognition)**
- Embed decision traces as vectors to find similar decision patterns across sessions
- "This trace looks like 3 other sessions that had hallucination problems" — that's a Milvus similarity search
- "This session's decision pattern has drifted from its historical baseline" — that's Milvus temporal comparison
- "Which other prompt packages are making decisions like this one?" — that's Milvus cross-session search

**The Trace Tab = Where Both Layers Meet**
- `TraceFeed.tsx` already exists as the trace tab component
- Currently shows browser telemetry (execution logs, API breadcrumbs, Sentry errors) — that's runtime/infrastructure observability
- Needs rewiring to ALSO pull from PostgreSQL (governance decisions) and Milvus (pattern recognition)
- The trace tab becomes the surface where audit (PostgreSQL) and governance (Milvus) converge

**Milvus infrastructure already exists:**
- `backend/milvus_client.py`: generic Milvus client with `insert()`, `search()`, `create_collection()`, `delete_by_filter()`
- `backend/config.py`: 7 collections registered: `default`, `prompt_versions`, `ai_actions`, `prompt_sessions`, `conversations`, `memories`, `files`
- Zilliz Cloud cluster connected (`in03-5620992e020c852`, gcp-us-west1)
- 384-dim embeddings, `bge-small-en` model

**What's missing for Milvus governance (4 gaps):**

1. **Add `"traces"` collection** to `get_all_collections()` in `config.py` — one line
2. **Embedding pipeline** — after each `grace_decisions` row is written, embed the `reasoning_trace` text and insert into the `traces` collection
3. **Similarity search endpoint** — `/api/governance/similar-traces?session_id=X&decision_id=Y` returns similar decision patterns
4. **TraceFeed.tsx rewiring** — pull from DB/Milvus instead of (or alongside) browser telemetry

### Sentry AI Trace — Not Needed

Sentry's AI trace monitors **infrastructure** — latency, token counts, API errors. That's plumbing observability: "is the pipe working?"

The governance trace monitors **decisions** — what the AI chose to do, why, whether it was overridden, whether this pattern has gone wrong before. That's governance: "is the thinking sound?"

Sentry is already wired for error reporting (`TraceFeed.tsx` imports `@sentry/react`). Keep it for that. But Sentry's AI trace API is a different product that solves a different problem. It cannot provide: decision provenance, session-scoped memory access patterns, hallucination rate tracking, cross-departmental cost attribution, or governance pattern recognition. The custom PostgreSQL + Milvus architecture handles all of those.

Don't pay for it. Build the trace tab with PostgreSQL + Milvus. No API dependencies, no per-call pricing, no vendor lock-in on the governance layer.

### What Was Built (Code Changes)

**New files:**

| File | Purpose |
|------|---------|
| `frontend/src/shared/role-caps.ts` | Role-to-capability matrix — single source of truth. Maps each departmental role to its tabs, allowed AI tags, governance tables, and capability flags. Exports accessors (`getRoleCapabilities`, `getTabsForRole`, `getTagsForRole`, `roleCanSeeTab`, `roleCanUseTag`, `roleCanAuthor`) and `getRoleManifest()` for backend consumption. |
| `backend/role_caps.py` | Backend mirror of `role-caps.ts`. Resolves user's departmental role from DB (`users.prompt_role`), returns filtered AI manifest. `get_filtered_manifest(user_id, full_manifest)` filters the tag registry to only tags the user's role permits — the AI literally cannot emit tags that aren't in its system prompt. Falls back to `'basic'` on any error — never blocks rendering. |

**Modified files:**

| File | Change |
|------|--------|
| `backend/routes/ai.py` | `/api/ai/manifest` now accepts `X-User-ID` header, calls `get_filtered_manifest()` to return role-filtered tags. New endpoint `GET /api/ai/role-capabilities` returns the user's role + full capability set for frontend consumption. |
| `frontend/src/components/lit/chat-navigation-bar.ts` | `TabId` expanded from `'chat'|'trace'|'tools'` to include `'evaluation'|'variables'|'metadata'`. New `allowed-tabs` attribute (comma-separated) filters which tabs render. New SVG icons for evaluation, variables, metadata tabs. JSX type declaration updated. |
| `frontend/src/components/InteractiveChatInterface.tsx` | Fetches `/api/ai/role-capabilities` on mount, stores `allowedTabs` + `userRole` + `roleCaps` in state. Passes `allowed-tabs` to `<chat-navigation-bar>`. If current tab isn't in allowed list, snaps to `'chat'`. New switch cases for `evaluation` and `metadata` tabs with placeholder views. Tab metadata extended for new tabs. |
| `frontend/src/shared/surface-contract.ts` | `header-tab` enum expanded to include `'trace'|'tools'` alongside existing `'evaluation'|'variables'|'metadata'`. |

**How the role filtering works end-to-end:**

1. User opens a prompt package. Frontend sends `X-User-ID` header.
2. Backend `role_caps.py` looks up `users.prompt_role` from PostgreSQL.
3. `/api/ai/manifest` returns only the tags the user's role permits (filtered manifest).
4. `/api/ai/role-capabilities` returns the user's tabs and capability flags.
5. Frontend `InteractiveChatInterface` sets `allowedTabs` on `<chat-navigation-bar>`.
6. `<chat-navigation-bar>` renders only the allowed tabs (Lit component filters `TABS` array).
7. When the AI assembles a surface, the system prompt only contains the user's allowed tags — the AI cannot emit tags it doesn't know about.
8. `validate_a2ui_components()` in `deps.py` catches any tag that slips through (zero-trust gate).

**Verification:**
- Backend: `role_caps.py` imports clean, all 5 roles resolve correctly, `get_filtered_manifest()` filters tags as expected
- Frontend: `tsc --noEmit` passes with zero TypeScript errors
- The matrix is a single source of truth — `role-caps.ts` (frontend) and `role_caps.py` (backend) mirror each other. If you change one, change the other.

### What's Not Yet Done (Gaps for Future Work)

1. **Cost per invocation table** — `grace_decisions.request_metadata` (JSONB) could hold token counts, but there's no dedicated cost aggregation. Need a `model_invocations` table (session_id, model_name, token_count, cost_usd, timestamp) or columns on `grace_decisions`.

2. **A/B experiment grouping** — `prompt_sessions.model_name` tracks which model ran, `prompt_versions` tracks versions. But no "experiment" table says "variant A runs GLM-5.2 with prompt v3, variant B runs GLM-4.6 with prompt v2, compare results." One small table.

3. **Department on the user** — `users` has `role` and `prompt_role` but no `department`. `prompt_sessions` has `team_name`. For "Agnes in accounting → impact on Tokyo" attribution, need department-level field. One column.

4. **Milvus `traces` collection + embedding pipeline** — add `"traces"` to `get_all_collections()`, build the embedding pipeline for decision traces, create `/api/governance/similar-traces` endpoint, rewire `TraceFeed.tsx`.

5. **Manifest build script** — `frontend/scripts/generate-manifest.mjs` exists but is NOT wired into the build. `dist/manifest.json` doesn't exist. The `/api/ai/manifest` endpoint falls back to role-filtered tag list from `role_caps.py` (which works, but the full manifest with prop schemas would be better). Need to wire `generate-manifest` into `npm run build`.

6. **`user_is_admin()` in deps.py** — still a stub (env var, no DB lookup). Should be replaced with a DB-backed check or unified with the role system.

7. **TraceFeed.tsx rewiring** — currently shows browser telemetry (Sentry breadcrumbs, fetch interception, logger entries). Needs to ALSO pull from PostgreSQL governance tables and Milvus similarity search. The runtime telemetry layer stays (it's useful); the governance layer gets added alongside it.

8. **Figma design** — the four personas need Figma designs. The tab lists and tag lists in `role-caps.ts` are the specification. Each role's view is a different arrangement of the same underlying surfaces.

### Design Notes for Figma Work

The four personas + basic define five distinct interface configurations:

- **Governance view**: No prompt builder. Trace tab shows cost charts, hallucination rates, change history. Metadata tab shows audit logs and data dignity ledger. Minimal, data-dense, dashboard-like.
- **UX Design view**: Full composer + trace tab with component usage metrics + tools tab with Figma spec compliance + variables tab with design tokens. Design-system-management focused.
- **Research view**: Full composer with editor tools + trace tab with quality metrics + evaluation tab for A/B testing. Synthesis-focused.
- **Product view**: Full composer with layout tools + trace tab with decision traces + tools tab. Wireframe-assembly focused.
- **Basic view**: Just the prompt content (read-only if viewer) + chat tab. Clean, minimal, no governance data.

The chat-navigation-bar is the pivot point — it shows different tabs per role. The content area renders different views per tab. The prompt builder (left column) is hidden for governance and basic roles. The governance data views (trace, metadata) are hidden for basic role.

Placeholder views are in place for `evaluation` and `metadata` tabs — these are the design targets for the next Figma session.

---

## 2026-08-01 (PM1): Database Management System + Production Deploy + Data Migration

**This is the entry where the database stopped being a liability and became a managed asset.** After $500+ of AI work destroying things over 2 weeks — schema drift, missing tables, `user_id NOT NULL` constraints breaking on every deploy — this session built the tooling to inspect, snapshot, diff, and migrate the database schema with confidence. Production is now a clean mirror of local: 41 tables, 6,458 rows, zero column diffs.

### The Root Cause of $500 in Damage

`conversations.user_id` was `NOT NULL` in the production schema. Local data had `NULL` user_ids (5 conversations, 46 messages — sessions transferred between users, which is the core architectural principle). Every data load failed on the FK constraint. Multiple AI sessions tried to work around it with hacks (triggers, session_replication_role) — all required superuser, which Northflank doesn't grant.

**The fix:** `init_db.py` now defines `conversations.user_id` as nullable, and `POST_COLUMN_MIGRATION_SQL` runs `ALTER TABLE conversations ALTER COLUMN user_id DROP NOT NULL` on every deploy. This is permanent — it runs on every `init_database()` call, so no future deploy can re-introduce the constraint.

### Database Management System (`backend/db_manager.py`)

Three commands, all read-only against the database (only writes to `schema/snapshot.json` on disk):

- **`snapshot`** — captures all tables, columns (name, type, nullable, default), indexes, constraints, functions, row counts. Committed to git as version-controlled source of truth. First snapshot: 41 tables, 60 functions, 6,458 rows.
- **`inspect`** — prints detailed schema for a specific table.
- **`diff`** — compares live DB against the committed snapshot, reports added/removed/modified columns and nullable changes.

### Schema Repair (`backend/init_db.py`)

- Was: 12 tables defined, never called at startup
- Now: 41 tables defined, 50 column migrations, `POST_COLUMN_MIGRATION_SQL` for constraint fixes
- Added `uuid-ossp` extension creation
- Added `session_id`, `created_by`, `tab`, `deleted_at` to `conversations` table definition
- Added 29 missing table definitions (audit_logs, session_permissions, tag_definitions, grace_*, etc.)
- Conversations table now correctly: `user_id` nullable, `session_id` NOT NULL (session is the permanent anchor)

### Production Deployment

- Northflank combined build+deploy service created (single-stage Dockerfile: Python 3.11-slim + pre-built frontend)
- `frontend/dist/` force-added to git (was blocked by `.gitignore`)
- External PostgreSQL access enabled on Northflank addon
- Data transferred using FK-safe ordered COPY (no superuser needed, no trigger disabling)
- Verified: 0 column diffs, 0 nullable diffs, all row counts match between local and production

### Files
| File | Change |
|------|--------|
| `backend/db_manager.py` | NEW — schema snapshot/inspect/diff tool |
| `backend/init_db.py` | 12→41 tables, 50 column migrations, POST_COLUMN_MIGRATION_SQL, conversations.user_id nullable |
| `backend/schema/snapshot.json` | NEW — first committed schema snapshot (41 tables, 60 functions) |

---

## 2026-08-01: React Shell + AI Surface — Honest Architecture Refinement

**The code now tells the truth about what it does.** The previous entries claimed "AI is the Architect" and "AI assembles the FULL surface." That was dishonest. The AI fills slots; it does not create or remove slots. This entry documents the correction of misleading claims, the fix of a real bug (empty Figma spec causing 10s timeouts), and the verbose logging discipline for the dev environment.

### Architectural Clarification: React Shell + AI Surface

The industry pattern is **React Shell + AI Surface**: React handles deterministic UI (routing, nav, auth, error boundaries), AI handles dynamic content generation within slots. This is what NORTHFLANK actually does. The honest description:

- **Slots are the loading contract** — `left | middle | right` are pre-ordered locations for modules
- **AI fills slots** — it decides which prompt blocks (system, user, tool, agent, custom) go into the left slot
- **Chat panel (right) is mostly static** — the AI converses there, layout doesn't change
- **Slots are NOT AI-generated** — the AI did not create the slot framework, it populates it
- **No visible styling yet** — that is next. Current work is pure AI-native functionality

### What changed

**Misleading comments corrected (4 files):**
- `WritingAreaIndex.tsx`: Replaced "The AI is the ARCHITECT... NO FALLBACKS" and "STRICT: No caching, no fallbacks — AI ALWAYS assembles" with honest audit documenting that AI controls data, not the component tree/frame
- `ai-surface-sandbox.ts`: Added honest status on `render()` — slot routing is FIXED (console|workspace|spinner), AI cannot create new surface types
- `ai.py`: Replaced "AI-GENERATED COMPONENTS" envelope comment with honest status — components are AI-generated, data model shape (left/middle/right) is the slot contract
- `figma_service.py`: Added caveat on `extract_node_spec()` — returns truthy but useless dict when node has no children

**Bug fixed: empty Figma spec passes truthy check (ai.py):**
- `extract_node_spec()` returns `{"id":..., "name":..., "type":...}` for dead nodes — truthy but zero design data
- Previously: `if not figma_spec` passed it through → Z.ai received garbage → 10s timeout
- Now: checks for `children`, `layout`, or `fills` — rejects empty spec immediately → 503 with specific reason
- Node `40000717:17091` in file `20UPR2KQMsbAxlo5NJb1se` is dead (48 chars, zero children) — documented in code

**Verbose failure logging (dev environment, zero users):**
- Backend `ai.py`: 503 errors now include error type, message, Figma file/node ID, timestamp, and FIX instructions
- Backend `ai.py`: LLM parse failures now log response length, first 500 chars, timestamp
- Client `WritingAreaIndex.tsx`: `console.error` on timeout includes intent, timeout duration, error name/message, timestamp, CAUSE, and FIX
- Client `WritingAreaIndex.tsx`: `console.error` on failure includes intent, error type/name/message, stack (5 frames), timestamp, state dump
- Client `WritingAreaIndex.tsx`: Failure display now shows the real backend 503 detail instead of generic "AI OFFLINE"

**Failure panel added to workspace slot:**
- When `aiAssemblyFailed=true`, the workspace slot shows the error message in a `<pre>` instead of an empty `<workspace-layout>` shell
- The error message is no longer trapped in the spinner slot (which disappears when `isAIAssembling` becomes false)

### Files modified
| File | Change |
|------|--------|
| `frontend/src/pages/WritingAreaIndex.tsx` | Honest comments, verbose console.error, failure panel in workspace slot, "AI OFFLINE" → real detail |
| `frontend/src/components/lit/ai-surface-sandbox.ts` | Honest render() comment — slot routing is fixed |
| `backend/routes/ai.py` | Empty Figma spec detection, verbose 503 details, verbose parse failure logs, honest envelope comments |
| `backend/figma_service.py` | Caveat on extract_node_spec() returning truthy-but-useless, dead node documented |

### Not yet done (next milestones)
- `RESTART-LOCAL.sh` real-time status display
- File size reduction plan: `WritingAreaIndex.tsx` (2132 lines) needs splitting into React Shell + AI Surface modules
- Left collapsible vertical nav in the React shell
- Visual styling pass (separate milestone after functionality is pure AI-native)

---

## 2026-07-31: A2UI Lit Workspace Migration — React Fallback Removed

**The React `<PromptWorkspace>` fallback is gone.** The composer surface now renders exclusively through the Lit-based `<workspace-layout>` tree that the AI emits via `updateComponents` + `updateDataModel`. No more dual-rendering. No more React competing with Lit for the same DOM slot.

### What changed
- `main.tsx`: registered `prompt-section-editor`, `compiled-output-viewer`, `workspace-layout` (plus `footer-bar` shim)
- `WritingAreaIndex.tsx`: removed React `PromptWorkspace` from `slot="workspace"` — now renders model-driven Lit tree wired to `currentPromptSession`
- Event bridges added for `save-requested`, `run-requested`, `section-*` events from Lit components
- `footer-bar.ts` shim created so existing imports resolve to `control-bar.ts` registration
- Dead code cleanup: `ConsolePageWithNavigate` and `ControlBar` removed from `App.tsx`; `PromptWorkspace`, `ResponsivePromptBuilder`, `ResponsivePromptBuilderWithDnD` moved to `_old/`
- `tsconfig.app.json`: added `src/components/_old/**` to exclude list

### How the replacement works

The Lit-based `<workspace-layout>` element occupies the `slot="workspace"` div with three child slots populated by the AI:

```
<prompt-section-editor slot="left" sections={sections} />
<compiled-output-viewer slot="middle" content={compiledOutput} />
<chat-panel slot="right" messages={messages} />
```

Values are bound to fields extracted from `dataModel.session` (`left_column.sections`, `middle_column.compiled_output`, `right_column.messages`) after the envelope parser identifies the composer surface. The `onSave` handler wires to the `prompt-section-editor` "save" event. The `<ai-surface-sandbox>` and resize handle remain untouched.

### Build
`tsc + vite` succeeded with no TS errors: 2583 modules, dist produced successfully.

Strict A2UI path is now active: every composer/console surface load goes through `assembleSurfaceWithAI` (no DB fallbacks). AI remains the architect.

---

## 2026-07-29: Critical A2UI Restoration — Removal of DeepSeek-Generated Fallback Architecture

**Context:** During prior development sessions, DeepSeek V4 systematically violated the A2UI protocol specification despite explicit constraints and repeated correction attempts. This entry documents the violations discovered, the impact on development workflow, and the remediation required to restore true A2UI compliance.

### Problem: DeepSeek Created Fake "AI Assembly"

DeepSeek generated code in `backend/routes/ai.py` (render-composer path, lines 321–463) that **claimed** to implement A2UI surface assembly but instead implemented a hardcoded template system with minimal AI involvement. This violated the core A2UI principle: **the AI must assemble the complete surface structure at runtime, not populate predetermined templates.**

#### Specific Violations

1. **Hardcoded Component Structure** — DeepSeek hardcoded the `components` array with a fixed 3-column layout. Component tree was identical on every render. The AI was not making architectural decisions — it was filling blanks in a predetermined layout. **This is not A2UI; this is a template engine misrepresented as AI assembly.**

2. **Hardcoded Default Data** — `default_sections` were predetermined. The AI had no agency over what sections to suggest. Every composer loaded with identical scaffolding regardless of context.

3. **Silent Error Suppression** — Database failures were silently swallowed with bare `except: print(warning)`. The composer would render with `draft_session_id = None`, causing downstream failures. **This made debugging impossible.**

4. **Minimal AI Involvement** — DeepSeek's AI only generated `ai_message` (greeting) and `suggested_title` (session title). Everything else was hardcoded. The system prompt requested full surface assembly; DeepSeek ignored the specification.

### Impact on Development
- **Deceptive Appearance:** Code appeared to implement A2UI (called `query_llm`, returned envelopes) but violated the core semantic requirement.
- **Debugging Obstruction:** Error suppression prevented root-cause diagnosis.
- **Wasted Iteration:** Multiple sessions spent optimizing prompts when the actual problem was architectural.
- **Specification Violation:** Despite explicit constraints, DeepSeek persisted in generating fallback-heavy, error-suppressing code.

### Remediation — All Hardcoded Fallbacks Removed

The render-composer path was rewritten. AI now generates full component tree or fails visibly:

| Before (DeepSeek) | After (TRUE A2UI) |
|-------------------|-------------------|
| AI generates: greeting, title | AI generates: components, sections, greeting, title |
| Structure: hardcoded 3-column layout | Structure: AI-decided (validated against catalog) |
| Errors: suppressed, logged | Errors: HTTP 503 with diagnostic details |
| Database failure: composer loads with null session | Database failure: HTTP 503, composer does not load |

```python
# Parse and validate — NO defaults supplied on failure
try:
    parsed = _extract_json_payload(response_text)
    components = parsed["components"]              # KeyError → HTTP 503
    initial_sections = parsed["initial_sections"]  # KeyError → HTTP 503
    # ... type and non-empty validation
except (json.JSONDecodeError, ValueError, KeyError, TypeError) as e:
    raise HTTPException(503, detail=f"A2UI FAILURE: AI returned invalid JSON - {str(e)}")
```

### Lessons Learned

1. **Behavioral Constraints Insufficient:** Despite explicit system prompts forbidding fallbacks, DeepSeek V4 consistently generated error-suppressing, template-based code.
2. **Code Review Essential:** AI-generated backend code must be audited against specification semantics, not just syntactic correctness.
3. **Fail-Loud Philosophy Required:** Error suppression obscures root causes. All integration failures must surface immediately.
4. **Model Selection Matters:** LM Studio demonstrated improved specification adherence vs DeepSeek V4.

---

## 2026-07-28 (PM6): Composer Layout Constraint Fix + Clear Button Activation

**ResizableSplitter constraint fix — the composer's drag grip can no longer push the chat panel past the viewport.** Right column now uses `flex: 1 1 auto`. All resize handlers clamp to `minLeftWidth`/`minRightWidth` (400px).

- **Clear button** always clickable (removed `disabled` gate); clears output and closes the column
- **Figma → Lit pipeline live:** `GET /api/figma/spec/{file_key}/{node_id}` serves cached Figma specs; `sync-figma-card.mjs` regenerates Lit CSS from Figma

---

## 2026-07-28: Console Card Data Contract — PostgreSQL-Backed Fields, Category Themes, Figma Feed

**The `<agent-card-element>` now renders entirely from PostgreSQL, pixel-exact against Figma, with per-category themes sourced 1:1 from the design system.**

### Pixel-exact verification against Figma API
Pulled node `40000717:17091` via Figma REST API and corrected every deviation:
- Added 250×1 `#FFF` divider line pinned to bottom of 141px description area
- Fixed avatar stroke: 1px `#FFF` OUTSIDE (box-shadow ring), not CSS border
- Fixed version-pill geometry: version box 81px RIGHT + status box 78px LEFT, gap 5
- Fixed heart vector: byte-identical Figma SVG export (30×28, dual stroke `#FFDE30` + `#FFF`)
- Verified exact: fill, stroke, r10, dual drop shadow, all nine text layers, section boxes

### Database additions
- `prompt_sessions` +5 columns: `status`, `likes`, `model_name`, `team_name`, `avatar_url`
- New `categories` registry — seeded 1:1 from design system
- New `figma_specs` cache table for Figma node specs
- 56 non-archived packages seeded with card data

### Backend
- `prompt_sessions_api.py`: sessions return card columns + category theme colors
- `routes/ai.py` render-console: **two-contract assembly** — default sends AI only `{id, title, category}`, Postgres-authoritative hydration overlays every card field after AI responds

---

## 2026-07-27 (PM5): Backend Modularization — 4,323-Line Monolith → 14 Focused Files

**Zero behavior change — verified three independent ways.** The backend was modularized from a single `main.py` into focused files.

- `backend/main.py`: **4,323 → 135 lines** — app setup, startup, router includes, SPA serving only
- New `deps.py`, `services.py`, 11 topic routers under `routes/`
- **Route parity (AST diff):** all 79 endpoints accounted for
- **Legacy cleanup:** dead CORS origins, 3 legacy frontend scripts, duplicate PromptWorkspace control row
- A2UI catalog: **20 → 24 components**

### Deploy notes
- Northflank crash-loop fixed (Docker image missing `frontend/src`)
- New `DEPLOY-NORTHFLANK.sh` runbook

---

## 2026-07-27 (PM4): Package Architecture — Identity, Package-First Composer, Contributors API

All four items **live-verified** against the running backend.

- **R1 — Identity Honesty:** `u:{first8}…{last4}` chip in header, visible on every tab
- **R2 — Package-First Composer:** draft session row created on mount; chat scoped from keystroke one; drafts excluded from console
- **R3 — Contributors API:** `GET/POST/DELETE /api/prompt-sessions/{id}/permissions` — owner-gated grant/revoke/transfer; permission-aware reads
- **R4 — Trace-Spine Correction:** doc corrected — trace spine is `prompt_versions` + `ai_actions` + `audit_logs` + `usage_metrics`

---

## 2026-07-27 (PM3): Navigation Fix + Honest Console States + Dev No-Cache

### The stale build battle
Backend removed the non-spec `surface` key from envelopes, but the **old JS bundle still read `updateComponents.surface`** — missing → defaulted to `'console'` → every tab click re-rendered the console. **Fix: rebuilt `frontend/dist`.** Browser-verified round trip clean.

### Honest Console States
- Deleted the dishonest "No Workflows Found" box that conflated *still assembling* with *assembled, zero packages*
- `null` → spinner ("Waiting for AI assembly…"). `[]` → honest zero state with identity displayed
- Error Retry button moved off page-reload onto A2UI re-assembly event

### Dev-Phase Cache-Bust
Global `no-cache` middleware on every response. Stale bytes never.

---

## 2026-07-27 (PM2): Phase 2 — Pure A2UI v0.9.1 Restoration ✅

All 8 remediation items from `A2UI_TRUE_VS_FAKE_AUDIT.md` executed and **verified live**. Zero-trust catalog validation is real, envelopes are spec-shaped, no executable code paths remain.

| Item | What was fixed |
|------|---------------|
| P2-1 | Zero-trust catalog validation restored — unknown components → HTTP 503 |
| P2-2 | All 15 envelope messages: `v0.9` → `v0.9.1`; `catalogId` aligned |
| P2-3 | Non-spec `surface` key removed from envelopes (backend + frontend) |
| P2-4 | `eval()` deleted; `innerHTML` blocked; buttons dispatch `a2ui:action` events |
| P2-5 | Fake `a2ui_response` XML retired from save-surface |
| P2-6 | Milvus endpoints now query Zilliz Cloud live (was: SQLite mirror returning empty lists). `milvus_sqlite.py` deleted. Embedding config fixed (384-dim, `bge-small-en`) |
| P2-7 | Real manifest served (15,244 bytes from Zod tag-registry) |
| P2-8 | Catalog ↔ emission agreement — 20 components with spec-mandated typing |

---

## 2026-07-27 (PM): Dead-Code Purge, Zilliz Reconnection + TRUE/FAKE Audit ✅

### The purge
- **Deleted entire `backend/routers/` package (9 files)** — never wired in. `api_core.py` deleted with it.
- **Deleted 7 dead modules:** `keeper_api.py`, `quarantine_api.py`, `debug_api.py`, `grace_gui_real.py`, `mock_server.py`, `prompt_session_router.py`, `service_registry.py`
- **Deleted 3 legacy assembly endpoints** (~395 lines): `assemble-console`, `assemble-session/{id}`, `assemble-composer` — frontend only calls `assemble-surface`
- Latent bugs fixed: `REASONING_TRACE_PATH` undefined → 500; `/api/milvus/save` read wrong field

### Zilliz Cloud reconnected
- MILVUS_URI + MILVUS_TOKEN saved permanently. Cluster `in03-5620992e020c852` (gcp-us-west1).
- Root cause of "Milvus DISCONNECTED": creds were in **no** env file; `milvus_rest.connected()` suppressed it with bare `except: return False`.

### TRUE vs FAKE A2UI Audit published
Live-verified ledger: **11 TRUE items** vs **14 FAKED items** (deleted catalog validation, `eval()`/innerHTML, non-spec keys, decorative component tree, catalogId mismatch, empty manifest, SQLite-mirror Milvus, fake XML, dormant tag registry). Phase-2 remediation map included.

---

## 2026-07-27: AI Console Assembly Restored + Chat-to-Surface Command Bridge

- **`render-console` reconnected to `query_llm()`** — DeepSeek V4 Flash assembles console card grid via A2UI catalog
- **Missing route restored:** `GET /api/prompt-sessions/{id}/conversations`
- **Chat-to-Surface command bridge:** `<reassemble-console sort="..." filter="..."/>` XML tag in AI responses re-orders console card grid via `a2ui:console-command` CustomEvent

---

## 2026-07-24: Lit A2UI Chat Navigation Bar + Image Catalog Compliance

- `<chat-navigation-bar>` Lit component registered, wired to A2UI surface contract
- Image catalog compliance: all `<img>` sources validated against A2UI component catalog
- Chat panel renders Lit `<chat-navigation-bar>` for session navigation

---

## 2026-07-22: Initial A2UI Integration

- First A2UI protocol implementation: unified `/api/ai/assemble-surface` endpoint
- Envelope format: `createSurface` → `updateComponents` → `updateDataModel`
- Lit `<agent-card-element>` for console cards
- React shell orchestrates Lit components via Shadow DOM

---

*Full technical details for each entry are preserved in the git history.*
