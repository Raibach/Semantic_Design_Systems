# Design System Lifecycle Management

> *"Agentic Design System Collaboraiton for Non-designers"*

**Product Package — Document of Record**
Built by **Raibach** &bull; AI Model **Claude Code (GitHub Copilot CLI)**
**Date**: 2026-07-21 &bull; **Version**: 0.4.4
**Status**: Active Development

---

## A2UI v0.9 Specification Compliance

This platform implements **Google's A2UI (Agent-to-User Interface) v0.9 specification** — the open standard for AI-driven user interfaces.

| Specification | Link |
|---------------|------|
| **Repository** | [github.com/google/A2UI](https://github.com/google/A2UI) |
| **Specification** | [a2ui.org/specification/v0.9/](https://a2ui.org/specification/v0.9/) |
| **Announcement** | [Google Developers Blog (Dec 15, 2025)](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) |


### A2UI Core Philosophy

> "A2UI is a declarative data format, not executable code. Agents can only render components from a pre-approved catalog."

The platform enforces **strict A2UI compliance**:
- Every console load triggers an LLM call (DeepSeek v4-flash)
- No cached/static fallback UI — if AI is offline, user sees error
- Temperature = 0.0 ensures deterministic card generation
- Partners: Google, CopilotKit, Flutter GenUI SDK

**Full documentation:** [`frontend/src/storybook/documentation/A2UI_SPEC_COMPLIANCE.md`](frontend/src/storybook/documentation/A2UI_SPEC_COMPLIANCE.md)

---

## About

Raibach Design System Lifecycle Management is a central hub for design system governance — a three-column AI workspace where designers, engineers, and UX leads assemble, test, evaluate, and govern design patterns at scale.

**What it does:**
- **Assemble** — structured prompt agents define component specs, design tokens, and behavior rules
- **Evaluate** — AI scores every execution against grounding metrics (faithfulness, hallucination, recall)
- **Govern** — every change is versioned, traced, and auditable; the AI iterates autonomously until quality thresholds are met

**Who it's for:**
- **Design system teams** managing component libraries across product surfaces
- **UX oversight leads** auditing pattern adherence and drift across teams
- **Design engineers** bridging Figma designs to production code through AI-assisted pipelines
- **Enterprise governance** requiring audit trails, role-based access, and quality gates on design output

Each prompt session is a self-contained agent lifecycle: build, test, evaluate, iterate, govern.

---

## Features

| Feature | Phase | Status | File |
|---------|-------|--------|------|
| A2UI Control Surface | 1–4 | 🔄 In Progress | [`phases-markdown/A2UI_CONTROL_SURFACE.md`](phases-markdown/A2UI_CONTROL_SURFACE.md) |
| Figma Make Pipeline | 1 | ⚠️ Needs Automation | [`phases-markdown/FIGMA_MAKE_PIPELINE.md`](phases-markdown/FIGMA_MAKE_PIPELINE.md) |

## Architecture

- [Agent Package Architecture](READ-ME/AGENT_PACKAGE_ARCHITECTURE.md) — Three-column prompt sessions as atomic units
- [Architecture Overview](READ-ME/ARCHITECTURE_2026-07-07.md) — Dual database, agentic flow
- [Dynamic Semantic Canvas](READ-ME/THE_DYNAMIC_SEMANTIC_CANVAS.md) — Design philosophy


🎨 **Live Documentation:** [`storybook-static/`](frontend/storybook) | Production Ready
---

## 🏗️ Architecture Excellence

### Lightweight & Fast
- **Lit Web Components** - Native browser standards, zero framework lock-in
- **Vite 7** - Sub-second hot reload, optimized production builds
- **Tailwind CSS 4** - Utility-first with zero runtime overhead
- **FastAPI** - Async Python backend with incredible performance

### Intelligent Data Layer
- **Dual-Database Architecture** - PostgreSQL for structure, Milvus for semantic search
- **Agent Packages** - Prompts become versioned, shareable units with full execution context
- **Six-Layer Validation** - Enterprise-grade compliance and governance built-in
- **Pattern Assembly Framework** - Reusable patterns assembled by AI and humans collaboratively

### Production Infrastructure
- **Northflank Deployment** - Container-native with auto-scaling
- **Secret Management** - Enterprise-grade credential handling
- **Real-Time Collaboration** - Multi-user editing with synchronized state
- **24/7 Availability** - Deployed and running in production

---


**Traditional Development:**
Designer → Mockup → Developer → Code → Deploy

**This Approach:**
Designer + AI → Working Product → Deploy

The entire platform was built through natural language conversations with Claude Code, proving that domain expertise combined with AI assistance can produce production-quality software without traditional coding.

---

## 🚀 Live System Components

| Component | Purpose | Status |
|---|---|---|
| **Pattern Library** | Reusable Lit components | ✅ Production |
| **AI Orchestrator** | XML command processing | ✅ Production |
| **Surface Controller** | Real-time UI manipulation | ✅ Production |
| **Database Layer** | PostgreSQL + Milvus | ✅ Production |
| **Deployment** | Northflank containers | ✅ Production |

---

## 📊 Technical Achievements

- **15,000+ lines** of production TypeScript/Python
- **Dual database** architecture implemented
- **Six-layer validation** system
- **Real-time collaboration** features
- **Production deployment** on Northflank
- **Comprehensive Storybook** documentation

All built through conversational programming with AI.

---

## 🔧 Quick Start

```bash
# 1. Build the frontend (FastAPI serves the built dist)
pnpm --dir frontend install && pnpm --dir frontend build

# 2. Configure the backend
#    backend/.env needs DATABASE_URL and DEEPSEEK_API_KEY

# 3. Run — one process serves API + UI
cd backend && uvicorn main:app --host 0.0.0.0 --port 5173
```

Open http://localhost:5173 — the FastAPI backend serves both the API and the
built frontend. Requires PostgreSQL locally; Milvus is optional for semantic
search features.

Release process: [`deployment/RELEASE-PROCESS.md`](deployment/RELEASE-PROCESS.md)

---

## 💡 Key Innovation: A2UI Pattern Assembly

Unlike static UI specifications, this platform enables:

1. **Dynamic Pattern Creation** - Define once, use everywhere
2. **AI-Controlled Surfaces** - Agents manipulate UI through XML commands
3. **Conversation Persistence** - Full history and state management
4. **Version Control** - Roll back, fork, and merge UI states
5. **Enterprise Compliance** - Six-layer validation for critical workflows

### Package-Owned Conversations (v0.4.4)

Conversations belong to **prompt sessions (packages), not users** — each
package carries its own tab-scoped conversation history (`conversations.session_id`
+ `tab`), making packages fully portable between users. Users are audit
context only. Schema: `api/database/migration_019_package_owned_conversations.sql`.

**Save = surface photograph.** Saving a template captures the exact surface
state — prompt sections as-is, output column only if a run produced output.
Reopening a package restores precisely the state that was saved: no synthetic
compiled output, no resurrected stale data.

---

## 🏆 Why This Matters

This project demonstrates that:

1. **Designers can build production software** with AI assistance
2. **25 years of UX expertise** translates directly to system architecture
3. **Conversational programming** is viable for complex applications
4. **AI pair programming** accelerates development by 10-100x
5. **The future is here** - and it's more accessible than ever

---

## 📚 Documentation

Comprehensive documentation available in multiple formats:

- **Storybook**: Interactive component documentation
- **Markdown**: Technical specifications in `/docs`
- **Version History**: Complete development timeline
- **A2UI Philosophy**: Pattern assembly framework documentation

---

## 🎨 About the Creator

**John Holt** - Raibach Interactive Design Studio


---

## 🔒 License

Copyright © 2026 John Holt, Raibach Interactive Design Studio
All Rights Reserved. Proprietary and confidential.

---

*"The best interface is no interface. The best code is conversation."*
