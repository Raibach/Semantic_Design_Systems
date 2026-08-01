# Semantic Design System Manager

> **One surface. Any payload. The AI is the Architect.**

**Raibach Interactive Design Studio** · John Holt  
Version **0.9.1** · A2UI Protocol Compliant · 2026-07-31

---

## Overview

A **prompt-package lifecycle workspace** built on the A2UI (Agent-to-User Interface) protocol. The AI assembles every pixel at runtime from a trusted component catalog — no URL routing, no static pages, no hardcoded layouts. Navigation is an AI command that returns a spec-compliant envelope through a single unified endpoint.

**The product:** prompt *packages* — configuration + conversation + execution trace + governance metadata — bundled as one versioned, shareable, contributor-owned unit. The package is the aggregate root; the user is not the package.

---

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────┐
│                        A2UI v0.9.1 Surface                      │
│                                                                  │
│  POST /api/ai/assemble-surface                                   │
│  ┌────────────┐  ┌─────────────────┐  ┌───────────────────┐     │
│  │  Section    │  │   Compiled      │  │     Chat          │     │
│  │  Editor     │  │   Output        │  │     Panel         │     │
│  │  (left)     │  │   (middle)      │  │     (right)      │     │
│  └────────────┘  └─────────────────┘  └───────────────────┘     │
│                                                                  │
│  Intents: render-console · render-composer · render-session:{id} │
│  Envelope: createSurface → updateComponents → updateDataModel    │
└──────────────────────────────────────────────────────────────────┘
         │                    │                     │
    PostgreSQL          DeepSeek V4          Zilliz Cloud
    (42 tables)         (AI assembly)       (vector memory)
```

---

## Key Principles

| Principle | Implementation |
|-----------|---------------|
| **AI as Architect** | The AI generates complete component trees — structure, layout, and data — at runtime. No templates. No fallbacks. |
| **Zero-Trust Catalog** | Every component validated against `component-catalog.json`. Unknown → HTTP 503. No silent failures. |
| **Fail Loud** | Invalid AI responses → 503 with diagnostics. Database down → 503. Never silently degrade. |
| **No Executable Code** | `eval()` eliminated. `innerHTML` blocked. Buttons dispatch declarative `a2ui:action` events only. |
| **Package-First** | A composer creates the draft package row on mount. Chat is scoped from keystroke one. |
| **Pixel-Exact Figma** | Lit components render 1:1 against Figma API specs. Design system owns the values. |

---

## Component Catalog

24 trusted components — 6 A2UI Basic + 18 project-specific — typed with `ChildList` / `DynamicString` per validator rules.

```
A2UI Basic:     Column · Text · Image · Button · ActionGroup · DecisionDialog
Surface:        ConsoleCardGrid · SectionEditor · CompiledOutput · ChatPanel
Controls:       ControlBar · AddSectionButton · StatusReadout · TokenCostReadout
Cards:          AgentCard · FlipCard · FeaturedCard · ApprovalQueueItem
Layout:         WorkspaceLayout · ResizableSplitter · AiSurfaceSandbox · SidebarNavigation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Lit 3.x (hybrid) · Vite · pnpm · Tailwind · TypeScript |
| **Backend** | FastAPI · PostgreSQL 15 · Zilliz Cloud (Milvus) · DeepSeek V4 |
| **Components** | Lit Web Components (Shadow DOM) · Figma API spec-driven |
| **Deploy** | Docker · Northflank (us-central) · Cloudflare Tunnel |

---

## Repository Layout

```
backend/
├── main.py              # App setup, startup, router includes
├── deps.py              # A2UI catalog loader, shared helpers
├── services.py          # Database service startup
├── figma_service.py     # Figma API → Lit spec extractor
├── grace_gui.py         # AI system prompts & assembly logic
└── routes/              # 11 topic routers
    ├── ai.py                # Manifest, assemble-surface, save, audit
    ├── conversations.py    # Conversation + message CRUD
    ├── prompt_sessions.py  # Packages, versions, permissions
    ├── projects.py         # Project CRUD
    ├── memory.py           # Memory storage (dictation)
    ├── figma.py            # Figma API proxy
    ├── milvus.py           # Zilliz/Milvus vectors
    ├── agent_rpc.py        # JSON-RPC 2.0 agent integration
    ├── teacher.py          # Teacher query, model ensure
    ├── misc.py             # Health, news, PDF, reasoning
    └── files.py            # Documentation file I/O

frontend/
├── src/
│   ├── App.tsx              # Root app with routes
│   ├── components/
│   │   ├── A2UI/            # A2UI surface container
│   │   ├── lit/             # Lit web components (agent-card, control-bar, workspace-layout, …)
│   │   └── _old/            # Archived components (excluded from build)
│   ├── pages/               # WritingAreaIndex (main surface)
│   ├── hooks/               # React hooks
│   └── shared/              # Surface contract, tag registry
├── scripts/                  # Manifest generator, Figma sync
└── storybook-static/         # Component storybook
```

---

## Quick Start

```bash
# Frontend build (required for local dev)
cd frontend && pnpm install && pnpm build

# Start backend + serve UI
bash RESTART-LOCAL.sh

# Open
open http://localhost:5001
```

- **Health:** `GET /api/health` → `{"database":"connected","milvus":"connected"}`
- **Dev PIN:** `7377`
- **Dev mode:** global no-cache middleware — no stale bytes

---

## Deployment

Docker on **Northflank** (`prompt-composer-console`, us-central). Production deploys via git push to `main` (CI/CD) or the local `DEPLOY-NORTHFLANK.sh` runbook.

---

## Documentation

- [`SPECIFICATIONS.md`](SPECIFICATIONS.md) — A2UI Protocol v0.9.1 (verbatim from [a2ui.org](https://a2ui.org/))
- [`READ-ME/A2UI_TRUE_VS_FAKE_AUDIT.md`](READ-ME/A2UI_TRUE_VS_FAKE_AUDIT.md) — Live-verified compliance ledger
- [`CHANGELOG.md`](CHANGELOG.md) — Release history (includes the DeepSeek restoration battle)
- [`A2UI_CARD_CONTRACT.md`](A2UI_CARD_CONTRACT.md) — Card component data contract

---

## Roadmap

- **Phase 3:** Generic adjacency-list renderer + JSON Pointer data binding
- **Phase 4:** Remaining docs cleanup, advanced contributor workflows

---

*"The interface never changes. The AI delivers different levels of access. That's the architecture."*
