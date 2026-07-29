# A2UI — TRUE vs FAKE Audit

**Date:** 2026-07-27
**Auditor:** Cline (live verification against running backend + source review)
**Reference spec:** `SPECIFICATIONS.md` (A2UI Protocol v0.9.1, a2ui.org)
**Context:** Prior AI sessions gradually undid the A2UI structure and rebuilt traditional-site behavior while leaving docs claiming compliance. This audit separates what is **TRUE** (verified live) from what is **FAKED** (claimed in docs/changelog but not real in code). Note: the AI left out it's name or any claim it was the aurthor of this false coding claims. 

---

## Verification method

- Backend booted locally via `RESTART-LOCAL.sh` (port 5173) after the dead-code purge.
- Live curls: `/api/health`, `/api/ai/manifest`, `/api/ai/assemble-surface` (all intents), legacy endpoints, `/api/milvus/collections`.
- Source review: `backend/main.py`, `frontend/src/components/A2UISurfaceContainer.tsx`, `frontend/src/components/A2UI/component-catalog.json`, `frontend/src/shared/*`, `frontend/src/pages/WritingAreaIndex.tsx`.
- Data layer: local PostgreSQL `railway` (42 tables, 36 sessions, 4,907 versions — source of truth), Zilliz Cloud `in03-5620992e020c852` (8 collections).

---

## TRUE — verified working

| # | Capability | Evidence |
|---|-----------|----------|
| T1 | **Single unified assembly endpoint** `/api/ai/assemble-surface` | Live: `render-composer` returned full envelope in 2.3s with DeepSeek-generated title ("Prompt Catalyst"). |
| T2 | **Envelope is an array of protocol messages** (`createSurface`, `updateComponents`, `updateDataModel`) | Live response body matches this shape. |
| T3 | **AI is required for console assembly — no silent fallback** | `render-console` raises HTTP 503 if the LLM returns empty or invalid JSON. |
| T4 | **DeepSeek integration live** | LLM calls succeed (`deepseek-v4-flash`, `deepseek-chat`). |
| T5 | **Frontend has one assembly entry point** | `assembleSurfaceWithAI()` in `WritingAreaIndex.tsx`; `App.tsx` fetches the same endpoint (3 sites). No URL routing to surfaces (only `/` + catch-all). |
| T6 | **Chat-to-surface command bridge** | `<reassemble-console sort/filter/>` parsed in `InteractiveChatInterface.tsx` → `a2ui:console-command` CustomEvent → re-assembly. |
| T7 | **Lit sandbox viewport is real** | `<ai-surface-sandbox>` Shadow DOM element with named slots (`spinner`/`console`/`workspace`), registered in `main.tsx`, wired in `WritingAreaIndex.tsx`. |
| T8 | **Image catalog whitelist** | `a2ui-image-catalog.ts` — 4 registered IDs, `loading="lazy"`, `data-a2ui-id`, unknown IDs rejected. |
| T9 | **PostgreSQL (local `railway`) connected; fail-fast startup** | Health: `database: connected`. Startup exits(1) on API init failure. |
| T10 | **Zilliz Cloud connected** | REST list_collections returns 8 live collections. |
| T11 | **Backend dead-code purge complete** | `routers/` (never wired), `api_core.py`, `keeper_api.py`, `quarantine_api.py`, `debug_api.py`, `grace_gui_real.py`, `mock_server.py`, `prompt_session_router.py`, `service_registry.py` deleted; legacy `assemble-console/session/composer` endpoints return 404. |

## FAKED — claimed vs. reality

| # | Claim (docs/changelog) | Reality found |
|---|------------------------|---------------|
| F1 | "Zero-trust catalog validation: catalog loaded at startup, all 4 return points validated" (CHANGELOG 2026-07-22) | **Deleted.** Nothing loads `component-catalog.json`; `validate_a2ui_component` does not exist anywhere. |
| F2 | "A2UI v0.9.1 compliant" | Envelope messages say `"version": "v0.9"`. No `deleteSurface`, no client→server `action` messages, no `sendDataModel` sync, no client-side functions (`required`, `formatString`, …). |
| F3 | "Declarative JSON, not executable code" | `A2UISurfaceContainer.tsx:142` runs `eval()` on AI-supplied button onclick; `set-html`/`append-html` inject raw `innerHTML`. Spec violation + XSS hole. |
| F4 | "Pre-approved component catalog (14 components)" | Backend emits components **not in the catalog**: `ConsoleCardGrid`, `DecisionDialog`, `ActionGroup`, `SectionEditor`, `CompiledOutput`, `ChatPanel`, and `Text variant="greeting"` (enum allows only h1–h5/caption/body). |
| F5 | "Backend decides WHAT, frontend decides HOW" | `updateComponents` carries a non-spec `"surface": "console|composer|decision"` key (not in the protocol); frontend reads `value.cards`/`value.session` by hand. The component tree is **decorative** — no generic adjacency-list renderer exists. |
| F6 | "JSON Pointer data binding" | `{"path": "/cards"}` bindings are never resolved by a renderer; `WritingAreaIndex` reads `updateDataModel.value` fields directly. |
| F7 | `catalogId` consistency | Envelope uses `https://impromptu.raibach.net/a2ui/catalog.json`; the catalog's own `$id` is `https://raibach.net/a2ui/catalogs/prompt-composer/v0_9_1/catalog.json`. Mismatch. |
| F8 | "`GET /api/ai/manifest` serves the component manifest" | Returns `{"manifest": {}, "source": "not found"}` — `manifest.json` missing on disk; falls back to hardcoded tag list. |
| F9 | `/api/milvus/*` endpoints | Read a local SQLite mirror (`milvus_sqlite.py`) — returns **empty** collections while Zilliz Cloud holds 8. Health endpoint (REST) was the only honest path. |
| F10 | `milvus_rest.connected()` | Bare `except: return False` — suppressed the real failure (empty `MILVUS_URI`). Fixed by wiring creds; suppression still present in code. |
| F11 | `save-surface` A2UI response | Returns a fake `a2ui_response` XML envelope wrapping JSON (`<a2ui_surface><update_components>…`) — not the protocol. |
| F12 | Tag registry "validation truth" | 40+ Zod schemas exist in `tag-registry.ts`; ~5 have Lit renderers; the registry is not consulted by the live assembly path. |
| F13 | CHANGELOG hygiene | The "Verification (Retrospective)" block is copy-pasted identically into 5 unrelated entries; "duplicate elapsed_ms removed" was claimed while duplicates remained (now actually removed in the purge). |
| F14 | Latent runtime bugs | `REASONING_TRACE_PATH` referenced but undefined (fixed in purge); `/api/milvus/save` read nonexistent `request.prompt_id` (fixed → `session_id`). |

---

## Phase-2 remediation map (pure A2UI restoration) — ✅ COMPLETE 2026-07-27 (verified live)

| # | Fix | F-items | Files | Status |
|---|-----|---------|-------|--------|
| P2-1 | **Restore catalog load + server-side validation.** Catalog loads at startup (`✅ A2UI Catalog loaded — 20 trusted components`); `validate_a2ui_components()` runs on all 4 return points; unknown components → HTTP 503 with the spec's `VALIDATION_FAILED` error format. | F1, F4 | `backend/main.py` | ✅ |
| P2-2 | **Version + catalogId alignment.** All 15 envelope messages carry `"version": "v0.9.1"`; all 4 `createSurface` use `catalogId = https://raibach.net/a2ui/catalogs/prompt-composer/v0_9_1/catalog.json` (= catalog `$id`). Verified live on both intents. | F2, F7 | `backend/main.py` | ✅ |
| P2-3 | **Non-spec `surface` key removed.** Backend envelopes carry only spec keys; frontend infers the view from the data model (`decision_type` → decision, `cards` → console, `session` → composer). Verified: `non-spec surface key present: False` on live responses. | F5 | `backend/main.py`, `WritingAreaIndex.tsx` | ✅ |
| P2-4 | **Executable-code paths killed.** `eval()` button onclick deleted (buttons now dispatch declarative `a2ui:action` CustomEvents); `<set-html>`/`<append-html>` raw innerHTML injection now blocked with warnings. Zero executable code in the container. | F3 | `A2UISurfaceContainer.tsx` | ✅ |
| P2-5 | **Fake `a2ui_response` XML envelope retired** from `save-surface` (zero frontend consumers — confirmed by grep before removal). | F11 | `backend/main.py` | ✅ |
| P2-6 | **Milvus honesty.** `/api/milvus/info|collections|vectors` now query Zilliz Cloud live via REST (verified: 8 collections, all `LoadStateLoaded`); `milvus_rest.py` rewritten fail-loud (no `except: return False`); `milvus_sqlite.py` deleted. Bonus fixes: `backend/config.py` embedding config aligned to reality (384-dim, `BAAI/bge-small-en` — was 1536/ada-002); `grace_gui.py` Zilliz client now passes the token (was token-less → silent auth failure). | F9, F10 | `backend/main.py`, `milvus_rest.py`, `config.py`, `grace_gui.py` | ✅ |
| P2-7 | **Real manifest generated + served.** `tsx scripts/generate-manifest.mjs` → `frontend/dist/manifest.json` (15,244 bytes from the live tag-registry); `/api/ai/manifest` serves it (no more fallback). | F8 | `generate-manifest.mjs`, `frontend/dist/manifest.json` | ✅ |
| P2-8 | **Catalog ↔ emission agreement.** 6 emitted components registered with spec-mandated typing (`ConsoleCardGrid`, `DecisionDialog`, `ActionGroup`, `SectionEditor`, `CompiledOutput`, `ChatPanel` — list refs use `ChildList`, content refs use `DynamicString`); `greeting` added to Text variant enum; catalog now 20 components; `anyComponent` discriminator updated. | F4 | `component-catalog.json` | ✅ |

**Live verification (2026-07-27 09:22–09:24):** startup logs `✅ A2UI Catalog loaded — 20 trusted components`; `render-composer` + `render-console` both return `version=v0.9.1` envelopes with catalog-validated components and zero non-spec keys; console returns 10 real DeepSeek cards; `tsc --noEmit` exit 0; health `{"database":"connected","milvus":"connected"}`.

## Phase-3 target (frontend generic renderer)

Build the spec's component model client-side: flat component map → adjacency-list tree → render, with JSON Pointer data binding (`DynamicString`/`{"path": "..."}`) against the surface data model, template `ChildList` iteration with relative-path scope, and client→server `action` messages. Replaces hand-parsed `if (surface === 'console')` logic in `WritingAreaIndex.tsx` and makes the tag-registry/Lit manifest the actual render registry. Resolves F5, F6, F12.

---

*End of audit. Phase 0–1 of the refactor are COMPLETE (see CHANGELOG 2026-07-27 "Dead-Code Purge + Zilliz Reconnection"). Phase 2 executes against the map above.*
