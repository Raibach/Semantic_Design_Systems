# A2UI — Prompt Portal Architecture

> **User-facing term:** "Prompts" — simple, accessible, human. Under the hood each prompt is an **agent package**: configuration + conversation history + execution trace + governance metadata, bundled together as a single versioned, shareable unit.

> **Product strategy:** This is the **enterprise governance layer** for the organization. It manages design access for product teams, code for developers, marketing packages for marketing, and presentations for executives — all through the same prompt-based interface connected to the Figma Code layer and corporate design system.

---

## 0. What This Tool Is

The Prompt Portal gives **product people and executives direct access to the design layer** without requiring designers as intermediaries. A product person writes what they're trying to build, the AI fetches elements from the Figma Code layer and the UX team's design system, and returns exactly what's needed — or builds something new.

It serves four enterprise functions through one interface:

| Function | Who | What They Do |
|----------|-----|--------------|
| **Design Governance** | Product teams | Ideate, inspect, approve, manipulate design system elements. Write prompts → AI fetches from Figma Code layer → returns usable output. |
| **Code Governance** | Developers | Manage code packages, enforce standards, share reusable components. |
| **Marketing Governance** | Marketing teams | Build and distribute marketing packages with approved brand assets. |
| **Executive Governance** | CEOs / Leadership | Generate production-ready presentations, reports, and decision documents from the same design system. |

Every interaction is logged. Every prompt is versioned. Every output is auditable. This is the single source of truth for how the organization builds, reviews, and ships.

---

## 1. What Is a Prompt (Agent Package)?

An agent package is the atomic unit of work in Grace AI. It is:

| Component | Location | Description |
|-----------|----------|-------------|
| **Configuration** | Left column (composer) | System role, user role, tools (Figma Make, etc.), variables, metadata |
| **Conversation History** | Right column (chat) | All discussions, tests, and iterations about this agent — saved with the package on every "Save Template" |
| **Execution Trace** | Third column (trace panel) | Complete audit trail: tokens used, cost, timestamps, execution count, flow diagram |
| **Diagram / Canvas** | Behind prompt editor + third column | Double-click the vertical tab to reveal canvas; "Run" generates diagram output |
| **Version History** | Backend `prompt_versions` table | Every save creates a timestamped version with full content snapshot |
| **Governance Metadata** | Metadata block | Tags, author, access level, approval status, variables scope |

All six components travel together. When you share an agent package with a teammate, they get the full bundle — config, history, trace, and permissions.

---

## 2. Column Layout

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER: Console | Composer | Components | Eval | Vars | …  │
├──────────────┬───────────────────────┬───────────────────────┤
│  LEFT        │  MIDDLE (hidden)      │  RIGHT                │
│  Composer    │  Canvas / Notes       │  Chat + Trace         │
│              │                       │                       │
│  System Role │  ← Double-click       │  Conversation about   │
│  User Role   │    vertical tab to    │  this agent           │
│  Tools       │    reveal canvas      │                       │
│  Variables   │                       │  Click "Run" →        │
│  Functions   │  Audit notes          │  diagram in 3rd col   │
│              │  Regulatory docs      │                       │
│              │  Diagrams             │  Execution Trace:     │
│              │                       │  • Tokens used        │
│  Save Tmpl   │                       │  • Est. cost          │
│  RUN ⌘⏎     │                       │  • Executions         │
│              │                       │  • Flow diagram       │
└──────────────┴───────────────────────┴───────────────────────┘
```

---

## 3. Save Template = Save Agent Package

When the user clicks **Save Template** (or presses a keyboard shortcut), the system captures:

### 3.1 What Gets Saved

| # | Data | Source | Stored In |
|---|------|--------|-----------|
| 1 | Agent config (roles, tools, vars, sections) | Left column DOM textareas | `prompt_sessions.left_column_content` |
| 2 | Full conversation history (all messages) | Right column chat | Serialized JSON in `compiled_output` + `conversation_id` FK |
| 3 | Execution trace / audit | Third column trace panel | `prompt_trace_activity` table |
| 4 | Timestamp (`savedAt`) | `new Date().toISOString()` | `prompt_sessions.updated_at` + version metadata |
| 5 | Version number (auto-incremented) | Backend | `prompt_sessions.current_version` + new `prompt_versions` row |
| 6 | Metadata (tags, author, access, tokens) | Metadata block | `prompt_sessions.metadata` (JSONB) |

### 3.2 API Flow

```
Save Template click
  │
  ├─► collectPromptSectionsFromUI()     ← reads DOM textareas
  ├─► conversationStorage.getConversation() ← reads full chat
  │
  ├─► IF new agent:
  │     POST   /api/prompts              ← create session
  │     POST   /api/prompts/{id}/versions ← save v1 content
  │     PUT    /api/prompts/{id}          ← attach metadata + conversation_id
  │
  └─► IF existing agent:
        PUT    /api/prompts/{id}          ← update content + conversation_id
        (versioning handled by backend)
```

### 3.3 Database Tables Involved

| Table | Role |
|-------|------|
| `prompt_sessions` | Main agent record: config, title, conversation_id FK, metadata |
| `prompt_versions` | Immutable version history: full content snapshot per save |
| `conversations` | Chat messages linked via FK from prompt_sessions |
| `prompt_trace_activity` | Execution audit: tokens, cost, runs, timestamps |
| `audit_logs` | (future) Governance: who saved, when, what changed |

---

## 4. Governance & Access Model

Every user gets the **same UI experience** regardless of role. Governance is enforced through access levels, not UI gates:

| Role | Can View | Can Create/Edit | Can Approve | Can Publish | Manage Users |
|------|----------|-----------------|-------------|-------------|--------------|
| Viewer | ✅ | — | — | — | — |
| Contributor | ✅ | ✅ (own) | — | — | — |
| Curator | ✅ | ✅ | ✅ | ✅ | — |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ |

### Variable & Tool Scoping
- Variables used in an agent package are **specific to that agent**
- In restricted corporate environments, only approved variables and tools are available
- The variable scope is part of the agent package metadata — it travels with the package when shared

---

## 5. The Canvas (Behind the Prompt Editor)

Double-clicking the vertical tab in the prompt input area closes it and reveals a **canvas space**. This is for:

- **Audit notes** — freeform documentation attached to the agent
- **Regulatory compliance** — required disclosures, data handling notes
- **Diagrams** — generated when the agent runs (appears in third column)
- **Work-in-progress annotations** — team comments, design rationale

The canvas content is part of the agent package and persists across saves.

---

## 6. Run → Diagram Output

When the user clicks **Run** (⌘⏎):

1. The agent configuration is sent to the LLM backend
2. The response is processed and formatted
3. If the agent produces structured output, a **diagram** is generated in the third column
4. The execution is recorded in `prompt_trace_activity`:
   - Tokens used
   - Estimated cost
   - Execution timestamp
   - Run count (incremented)

---

## 7. Sharing & Collaboration

An agent package can be shared with another user:

1. Recipient gets the **full package**: config + conversation history + trace + metadata
2. Recipient can run the agent in their own environment with their own variables
3. Recipient can create their own version (fork)
4. Approval workflow: Submit → Review → Approve/Reject → Publish
5. Published agents can be added to the **design system** for org-wide use

**Goal:** Eliminate meetings. A product person builds an agent, shares it with another product person in a different department, they run it with their own team's data, get a yes/no decision, and add the approved result to the design system — all without a single meeting.

---

## 8. Notification Gates (Navigation Barriers)

Between Console ↔ Composer navigation, intentional pause screens surface critical notifications:

| Notification Type | Trigger | Actions |
|-------------------|---------|---------|
| Approval Request | Teammate tagged you | Skip / View in Console / Approve & open in Composer |
| Breaking Change | Prompt you're editing was modified | Dismiss / See diff / Reload |
| Team Joined | Someone joined your session | Dismiss / Share context |
| Model Update | New LLM version available | Dismiss / Switch now |

Users can suppress notification types in **Settings → Notification Gates**. Suppressed types skip the barrier entirely.

---

## 9. Key Files Reference

| Layer | File | Purpose |
|-------|------|---------|
| Frontend | `src/pages/WritingAreaIndex.tsx` | Main workspace: save handler, tab management, event listeners |
| Frontend | `src/services/promptService.ts` | API client for agent CRUD |
| Frontend | `src/services/conversationStorage.ts` | Conversation persistence (API + localStorage fallback) |
| Frontend | `src/components/PromptWorkspace.tsx` | Three-column layout with approval mode banner |
| Frontend | `src/components/LoadingOverlay.tsx` | Navigation barrier with staged notification cards |
| Frontend | `src/components/SettingsTab.tsx` | Settings panel including Notification Gates |
| Frontend | `src/types/settings.ts` | `GraceSettings` type with notification preferences |
| Backend | `api/grace_api.py` | Flask API: `/api/prompts`, `/api/conversations`, `/api/projects` |
| Backend | `backend/prompt_sessions_api.py` | Database layer for agent sessions |
| Backend | `backend/conversation_api.py` | Database layer for conversations |
| Database | `api/DATABASE_SCHEMA_REQUIRED.sql` | Full schema (prompt_sessions, versions, trace, audit) |

---

## 10. Terminology

| Term | Definition |
|------|-----------|
| **Agent Package** | The complete bundle: config + conversation + trace + metadata. The atomic unit. |
| **Composer** | The left-column editor where agent configuration is built |
| **Trace** | The execution audit trail: tokens, cost, runs, diagram |
| **Canvas** | The space behind the prompt editor for notes and diagrams |
| **Notification Gate** | Intentional pause between navigation views to surface critical info |
| **Approval Mode** | Composer state when reviewing an agent tagged for your approval |

---

*Last updated: 2026-07-06*
*This document should be updated as the architecture evolves.*
