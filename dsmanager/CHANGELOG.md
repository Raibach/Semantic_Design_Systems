# Changelog — Design System Lifecycle Management

Built by **John Holt, Raibach Interactive Design Studio** <sub>{impromptu}</sub>


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
