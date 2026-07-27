# Semantic Design System Lifecycle Management 

> **One surface. Any payload. The AI is the Architect.**

**Built by John Holt, Raibach Interactive Design Studio**
**Date:** 2026-07-27 · **Version:** 0.9.1-dev · **Status:** Active Development (honest A2UI restoration in progress)

---

## What This Is

An **A2UI (Agent-to-User Interface) workspace** — a single, stable three-column surface where every pixel is assembled at runtime by the AI from a trusted component catalog. No URL routing to surfaces. No static pages. Every navigation action is an AI command (`intent`) that flows through one unified endpoint and returns a spec-compliant envelope.

**The product:** prompt *packages* — configuration + conversation history + execution trace + governance metadata, bundled as one versioned, shareable, contributor-owned unit. The package is the aggregate root; the user is not the package.

**Docs of record:**
- [`SPECIFICATIONS.md`](SPECIFICATIONS.md) — full A2UI Protocol v0.9.1 + Basic Catalog Guide + A2A Extension (verbatim from [a2ui.org](https://a2ui.org/))
- [`READ-ME/A2UI_TRUE_VS_FAKE_AUDIT.md`](READ-ME/A2UI_TRUE_VS_FAKE_AUDIT.md) — the live-verified ledger of what was real vs compliance theater, and the remediation that fixed it
- [`CHANGELOG.md`](CHANGELOG.md) — day-by-day build log

---

## A2UI v0.9.1 — As Actually Implemented (verified live 2026-07-27)

| Mechanism | Reality |
|-----------|---------|
| **Unified assembly endpoint** | `POST /api/ai/assemble-surface` — the ONLY surface path. Intents: `render-console`, `render-composer`, `render-session:{id}` |
| **Envelope** | Array of protocol messages — `createSurface`, `updateComponents`, `updateDataModel` — each stamped `"version": "v0.9.1"`, `catalogId` = catalog `$id` |
| **Trusted catalog** | `frontend/src/components/A2UI/component-catalog.json` — **24 components** (6 A2UI Basic + 18 project-specific, `ChildList`/`DynamicString` typed per validator rules) |
| **Zero-trust validation** | Catalog loads at startup (fail-fast); `validate_a2ui_components()` guards every return point; unknown components → **HTTP 503 `VALIDATION_FAILED`** (spec error format) |

---

## Repository Layout (post-2026-07-27 refactor)

The backend was modularized from a single 4,323-line `main.py` into focused files (zero behavior change; all 79 endpoints verified by AST route parity, compile checks, and a live boot):

```
backend/
├── main.py            # 135 lines — app setup, startup, router includes, SPA serving
├── deps.py            # Shared helpers: constants, A2UI catalog loader, user helpers
├── services.py        # Database service startup (all 5 APIs)
└── routes/            # 11 topic routers
    ├── conversations.py   # Conversation + message CRUD, surface state, tags
    ├── projects.py        # Project CRUD
    ├── prompt_sessions.py # Packages, versions, permissions, suggestions, context
    ├── memory.py          # Memory storage/update/delete (dictation)
    ├── ai.py              # Manifest, assemble-surface, confirm-exit, save-surface, audit
    ├── teacher.py         # Teacher query, model ensure, transcribe stub
    ├── misc.py            # Health, news, PDF, memory recall, reasoning, source eval, train
    ├── figma.py           # Figma API proxy endpoints
    ├── milvus.py          # Zilliz/Milvus info, collections, vectors, save, versions
    ├── agent_rpc.py       # JSON-RPC 2.0 agent integration
    └── files.py           # Documentation file read/write/list
```

**Local dev:** `bash RESTART-LOCAL.sh` (unchanged, compatible). **Production:** Northflank `prompt-composer-console` (us-central) — deploy via git push to `main` (CI/CD) or the local `DEPLOY-NORTHFLANK.sh` runbook (gitignored).
| **No executable code** | `eval()` deleted; raw `innerHTML` injection blocked; buttons dispatch declarative `a2ui:action` events only |
| **No fallbacks** | AI offline or invalid JSON → HTTP 503 with the real error. Fail hard, fail loud |
| **Chat = command interface** | XML tags in AI responses (`<update_agent>`, `<add_role>`, `<reassemble-console>`) bridge to surface commands via CustomEvents |

## Architecture

```
Console tab ──► render-console  ──► PostgreSQL → DeepSeek → v0.9.1 envelope ──► Lit agent-card grid
Composer tab ─► render-composer ─► draft package row CREATED ON MOUNT ─► chat package-scoped from keystroke one
Open card ────► render-session:{id} ─► full package: sections + output + conversation + versions

Left column   = SectionEditor (prompt sections: System/User/Tool/FewShot/Context/Constraints)
Middle column = CompiledOutput (universal render target)
Right column  = ChatPanel (the command interface for the whole surface)
Sandbox frame = <ai-surface-sandbox> — Lit Shadow DOM viewport; React shell only orchestrates
```

**Package-first composer:** a new composer creates the draft package row immediately (`metadata.draft = true`, hidden from the console until saved). **Contributors:** `session_permissions` (owner/editor/viewer) with owner-gated grant/revoke/transfer endpoints; reads are permission-aware (owned OR shared).

## Data Layer

| Store | Role | Truth |
|-------|------|-------|
| **PostgreSQL `railway`** (local 15.14, Homebrew) | Source of truth: 42 tables — packages, versions (4.9k), conversations, permissions, audit | Local dev stays authoritative until site repair completes |
| **Zilliz Cloud** (`in03-5620992e020c852`, gcp-us-west1) | Vector memory: 8 collections — `prompt_versions`, `prompt_memory`, `ai_actions` (384-dim, `BAAI/bge-small-en`, COSINE) | Live via REST + pymilvus w/ token |
| **DeepSeek** (`deepseek-v4-flash`, fallback `deepseek-chat`) | All assembly + compilation | Live |

## Development

```bash
bash RESTART-LOCAL.sh        # verifies .env/.venv/Postgres, kills :5173, boots uvicorn main:app
cd frontend && npm run build # rebuild dist (backend serves frontend/dist — REBUILD AFTER ANY FRONTEND CHANGE)
```

- **Health:** `GET /api/health` → `{"database":"connected","milvus":"connected"}`
- **Access:** PIN gate (`7377` local dev)
- **Dev phase:** global no-cache middleware — nothing is ever cached; long loads expected
- **Identity:** console is strictly user-scoped; the header chip shows the active identity (`u:00000000…0001`)

## Deployment

Docker on Northflank (see `Dockerfile`). The backend serves the committed `frontend/dist` bundle — production deploys require `git add -f frontend/dist` per release process. Remote DB untouched pending local↔remote comparison.

## Roadmap

- **Phase 3 (next):** generic adjacency-list renderer + JSON Pointer data binding (`DynamicString` resolution, `ChildList` templates, client→server `action` messages) — replaces the hand-parsed view logic
- **Phase 4:** remaining READ-ME rewrites, changelog dedup

---

*"The interface never changes. The AI delivers different levels of access. That's the architecture."*
