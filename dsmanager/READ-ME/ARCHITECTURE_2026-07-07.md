# Architecture & Build Retrospective

**Date:** 2026-07-07  
**Session:** Full-stack prompt IDE build — agentic flow execution, Milvus versioning, conversation scoping, output workspace  
**Author:** Prompt Composer Engineering

---

## Executive Summary

The Prompt Composer Console is not a chatbot wrapper. It is a **deterministic, multi-layer prompt IDE** designed for building, executing, versioning, and auditing enterprise-grade agentic prompt packages. The architecture enforces structural validation across six segmented data layers, avoiding the probabilistic drift that makes open-ended chat interfaces unsuitable for compliance-critical workflows.

This document captures the architecture as it stands after the 2026-07-07 build session — covering the three-column workspace, the agentic flow assembly engine, the dual-database persistence layer (PostgreSQL + Milvus Lite), and the AI assistant control surface.

---

## 1. Three-Column Architecture

### Left Column — Agentic Flow Builder (`ResponsivePromptBuilder`)

The left column presents the prompt as a collection of structured code modules. Each section represents a step in an agentic flow pipeline — not an arbitrary text box.

**Core Roles (6 predefined):**

| Step | Section | Purpose |
|------|---------|---------|
| 1 | System Role | AI identity, expertise, behavioral rules |
| 2 | User Role | User's request, task, or query template |
| 3 | Tool Call | Functions, APIs, source code to analyze |
| 4 | Few Shot | Input→output exemplar pairs |
| 5 | Context | Background, domain knowledge, RAG snippets |
| 6 | Constraints | Hard rules the agent must never violate |

**Custom Roles:** Unlimited additional sections created via the "Add Section" dropdown or by the AI assistant using `<add_role name="X">content</add_role>`. Each custom section receives the same UI lifecycle (drag-and-drop, collapse/expand, state persistence) as core roles.

**Section Controls:**
- Drag-and-drop reorder via HTML5 backend
- Collapse/expand with `display:none` persistence
- Remove with confirmation modal
- Role change dropdown (any section can switch to any other role type)
- File attachment: paperclip icon in Tool Call triggers hidden file input, reads text files into textarea

**Design Principle:** This is not a form. It is a code editor for natural language. Each section is a module in a composable agent pipeline. The user builds the pipeline; the AI assistant (right column) helps construct and refine it.

---

### Middle Column — Output Workspace (`MiddleColumnSlot`)

The third column is the execution output panel. When the user clicks RUN, the assembled prompt is dispatched to the backend, executed by the selected model, and the response streams into an editable textarea.

**Features:**
- **Model selector dropdown:** DeepSeek V4 Pro, GPT-4.1, Llama 3.1 8B, Claude 3 Opus
- **Streaming:** Handles both SSE `data:` lines and plain JSON responses
- **Editable:** User can modify output after streaming completes
- **Actions:** Copy, Save (to Milvus), Export (download .txt), Clear, Regenerate
- **Regenerate:** Re-runs the prompt through the currently selected model
- **Beforeunload guard:** Browser dialog on tab close with unsaved output
- **Locked open:** Third column cannot be closed while output exists — toast blocks it
- **Auto-restore:** Opening a saved prompt from Console fetches the last Milvus output and reopens the third column

**Design Principle:** The output is not a static dump. It is a live workspace where the user can inspect, edit, re-run, and export results. The column is the "powerhouse output" — it will eventually support A/B split views, image rendering, and code blocks.

---

### Right Column — AI Assistant + Audit System (`InteractiveChatInterface`)

The right column serves three functions: AI assistant, conversation manager, and audit trail browser.

**Three Navigation Tabs:**

| Tab | Content |
|-----|---------|
| **Chat** | All conversations scoped to the current prompt session, labeled by source (`[General]`, `[Trace]`, `[Variables]`). Conversations are collapsed timestamped items — click to open, delete available. |
| **Trace** | Milvus version snapshots (v1–vN) with timestamps and expandable content viewer. Merges PostgreSQL version records with Milvus snapshots. |
| **Variables** | Detects `{token}` and `{{token}}` patterns across all prompt sections. Shows "0 variables" when none found. |

**AI Assistant as Control Surface:**

The AI in the right column is the primary interface for modifying the left-column prompt builder. It is not a passive chatbot — it actively reads the workspace context and writes to sections using XML command tags.

```
<update_agent>text</update_agent>        → System Role
<update_user>text</update_user>          → User Role
<update_tool>text</update_tool>          → Tool Call
<update_few_shot>text</update_few_shot>  → Few Shot
<update_context>text</update_context>    → Context
<update_constraints>text</update_constraints> → Constraints
<add_role name="X">content</add_role>    → Create custom section
<remove_role name="X"/>                  → Remove section
<save/> <get_versions/> <load_version>N  → Milvus memory
```

Tags are stripped from the visible chat by a frontend interceptor and executed on the DOM. The AI also renders clickable action buttons: `[Confirm](action:confirm)`, `[Remove "Section"](action:remove_role:Section)`.

**Chat Behavior:**
- Conversations start collapsed on load — no auto-open
- Scoped to current prompt session via `grace_conversation_tags` localStorage mapping
- Collapse on save (`collapse-chat` event) → reappear as timestamped list item
- Scroll-to-bottom on new messages via `ResizeObserver` + `requestAnimationFrame`
- Pauses on manual scroll-up, resumes when user scrolls back down
- Scrolls to top on tab change
- Standard mode only (inverted mode removed)

**Design Principle:** The right column is not a separate chat app. It is the command surface for the entire IDE. Every conversation is an audit record. Every trace is a compliance artifact. The AI reads the full workspace state and acts as the user's engineering partner.

---

## 2. Backend — Agentic Flow Assembly Engine (`grace_gui.py`)

### prompt_output Mode

When `mode="prompt_output"`, the backend receives structured JSON:

```json
{
  "core_roles": {
    "System Role": "You are a code reviewer...",
    "User Role": "Review this code for bugs.",
    "Tool Call": "import foo\nfunction bar() {}",
    "Constraints": "Never suggest removing error boundaries."
  },
  "custom_roles": []
}
```

The assembly logic maps this into a proper agentic flow:

```
SYSTEM PROMPT  ← System Role + Constraints + Context + Few Shot + Custom Roles
USER MESSAGE   ← User Role + Tool Call (truncated to 3000 chars, labeled "Source Code to Analyze")
```

This ensures the model speaks AS the System Role persona, executes the User Role task, follows the Constraints, and analyzes the Tool Call content — rather than echoing raw source code or emitting function call XML.

**Provider Priority:**
1. DeepSeek Chat V4 Pro (`deepseek-chat`) — priority 1
2. NVIDIA NIM (`meta/llama-3.1-8b-instruct`) — priority 2

### Milvus Integration

- `_milvus_save()`: Vectorizes workspace context via `BAAI/bge-small-en`, stores in Milvus Lite collection `prompt_workspace_versions`
- `_milvus_get_versions()`: Returns formatted version history
- `_milvus_get_versions_json()`: Returns structured JSON for API responses
- `_milvus_load_version()`: Retrieves specific version by number
- `_process_backend_tags()`: Intercepts `<save/>`, `<get_versions/>`, `<load_version>N>` in model responses

---

## 3. Database Layer

### PostgreSQL (Railway → SiteGround)
- Prompt sessions and versions (`/api/prompts/`)
- Conversation records (`/api/conversations/`)
- Relational metadata: timestamps, scores, authors, change descriptions

### Milvus Lite (Vector Memory)
- Collection: `prompt_workspace_versions`
- Embedding: `BAAI/bge-small-en` (384 dimensions)
- Stores: full workspace context (prompt configuration + output) as vector snapshots
- Auto-saved after every RUN
- Endpoints: `POST /api/milvus/save`, `GET /api/milvus/versions`

---

## 4. Event-Driven Architecture

The three columns communicate through a custom event system, avoiding prop drilling across deeply nested components:

| Event | Source | Listener | Purpose |
|-------|--------|----------|---------|
| `run-prompt` | ResponsivePromptBuilder RUN button | PromptWorkspace | Triggers handleRun |
| `restore-output` | WritingAreaIndex (on prompt load) | PromptWorkspace | Opens third column with saved output |
| `collapse-chat` | WritingAreaIndex (on save) | InteractiveChatInterface | Collapses chat into list item |
| `run-blocked` | PromptWorkspace (validation fail) | InteractiveChatInterface | Posts error to assistant chat |
| `add-prompt-role` | AI assistant or toolbar | ResponsivePromptBuilder | Creates new section |
| `remove-prompt-role` | AI assistant or UI | ResponsivePromptBuilder | Removes section |
| `set-left-column-text` | Various | AutoResizeTextarea | Injects content into specific textarea |
| `save-template` | MiddleColumnSlot Save button | WritingAreaIndex | Triggers prompt save |
| `toggle-third-column` | ResponsivePromptBuilder | ResizableSplitter | Opens/closes third column |

---

## 5. Validation & Safety

### Empty Section Guard
When RUN is clicked, all visible sections are scanned. If any are empty:
- Third column stays closed
- Destructive toast appears with `duration: 0` (persistent)
- AI assistant posts a message with clickable `[Remove "Section"]` buttons
- Run is blocked until the user fills or removes the empty section

### Save Confirmation
- `beforeunload` browser dialog warns on tab close with unsaved output
- Output auto-saves to Milvus after every RUN completes
- Save Template persists all visible sections to PostgreSQL

### Conversation Scoping
- Conversations are tagged with the prompt session ID
- Only conversations from the current prompt appear in the Chat tab
- Conversations collapse on save and reappear as timestamped list items

---

## 6. Key Design Decisions

### 1. XML Tags Over Bracket Actions
Earlier versions used `[ACTION:SET_FIELD:target:content]` syntax. Migrated to XML tags (`<update_agent>content</update_agent>`) for better AI compliance. Square brackets caused the model to describe content instead of emitting it. XML tags, combined with explicit "Correct vs Wrong" examples in the system prompt, resolved this reliably.

### 2. Structured JSON Over Flat Context
The RUN pipeline sends `{core_roles: {...}, custom_roles: [...]}` rather than flat concatenated text. The backend assembly logic maps each role to its proper position in the agentic flow: System Role → system prompt, User Role → user message, Tool Call → appended as source code input. This separation prevents the model from confusing instructions with input data.

### 3. Section-by-Section Assembly Instead of "Prompt to Execute"
Early iterations labeled everything as "PROMPT TO EXECUTE" — causing the model to echo source code instead of analyzing it. The fix: System Role becomes the system prompt (model's identity), User Role becomes the task, and Tool Call becomes labeled input ("Source Code to Analyze"). Constraints, Context, and Few Shot are appended to the system prompt as additional rules.

### 4. Conversation Scoping by Prompt Session
Conversations are not global. They are scoped to the prompt session that created them. This prevents cross-contamination between different prompts and creates a clean audit trail. The AI assistant can still search company-wide if asked, but the default view is strictly scoped.

### 5. AI as Control Surface, Not Just Chatbot
The right-column AI is not a passive conversationalist. It reads the full workspace (left column sections + middle column output), writes to sections via XML tags, removes sections via clickable buttons, and posts structured messages (run-blocked notices, confirmation buttons). The system prompt defines a strict 6-step workflow protocol that maps user ideas to the correct agentic flow steps.

### 6. Milvus as Audit Backbone
Every RUN produces a Milvus snapshot containing the complete prompt configuration and output. These snapshots are timestamped, versioned, and queryable from the Trace tab. Combined with PostgreSQL's relational version history, this creates a dual-database audit trail suitable for regulatory compliance.

---

## 7. Files Modified (2026-07-07 Session)

### Frontend (React + TypeScript + Vite)

| File | Change Summary |
|------|---------------|
| `InteractiveChatInterface.tsx` | AI system prompt rewrite, tab filtering by content type, conversation scoping to prompt session, scroll behavior (ResizeObserver + requestAnimationFrame), Send button fix (MouseEvent override), collapse-chat & run-blocked event listeners, renderMessageContent with action buttons, chat direction removal, auto-analysis on RUN |
| `PromptWorkspace.tsx` | handleRun with empty-section validation, beforeunload guard, Milvus auto-save after RUN, run-prompt event listener, restore-output event listener, third column close lock, save modal (removed — too aggressive), handleRegenerate, structured JSON payload assembly |
| `MiddleColumnSlot.tsx` | Complete rewrite: A/B testing cards replaced with editable output workspace, model selector dropdown, Save/Export/Copy/Clear/Regenerate actions, streaming auto-scroll, compiled output sync |
| `ResponsivePromptBuilder.tsx` | Toolbar Attachment/Tool Call buttons wired with onClick handlers, run-prompt event dispatch, GenericRoleSection dragRef support, FewShot/Context/Constraints section renderers, dynamic panel management via add-prompt-role/remove-prompt-role events, "Select Role" → "Add Section" label |
| `SidebarNavigation.tsx` | Labels: Trace→Chat, Variables→Trace, Tools→Variables |
| `WritingAreaIndex.tsx` | Save toast improvements, conversationId in metadata, handleLoadPromptSession with Milvus output restoration, collapse-chat dispatch on save, prompt-composer-active-tab persistence |
| `conversationStorage.ts` | `tag` field on Conversation interface, `tag` parameter on createConversation |
| `toast.tsx` | Opaque `bg-white` default variant |
| `toaster.tsx` | Centered viewport, larger max-width |
| `useNotificationGate.ts` | Tab persistence to localStorage |
| `ConsolePage.tsx` | Loading overlay disabled, direct onOpenPrompt/onCreateNew calls |
| `VersionManager.tsx` | `/api/prompt-sessions` → `/api/prompts` endpoints |
| `neuralNetworkService.ts` | `mode` field added to QueryOptions |
| `MetadataTitle.tsx` | `/api/prompt-sessions` → `/api/prompts` endpoints |
| `useDragAndDrop.ts` | `/api/prompt-sessions` → `/api/prompts` endpoints |

### Backend (Python + Flask)

| File | Change Summary |
|------|---------------|
| `grace_gui.py` | prompt_output mode: structured JSON assembly (System→system, User→user, Tool→input, Constraints/Context/Few Shot→system append), Tool Call truncation at 3000 chars, DeepSeek priority 1, NVIDIA priority 2, Milvus helpers (_milvus_save, _milvus_get_versions, _milvus_get_versions_json, _milvus_load_version), _process_backend_tags interceptor |
| `grace_api.py` | `/api/milvus/save` and `/api/milvus/versions` endpoints, `mode` parameter forwarding to query_llm, embedding model import fix (try/except), DeepSeek API key detection in debug endpoint |

---

## 8. Current State & Next Steps

### Working End-to-End
- Prompt sections captured → JSON payload → backend assembly → DeepSeek execution → output in third column
- Milvus auto-save after every RUN → versions queryable from Trace tab
- Conversations scoped to prompt session, collapsed on save, restorable on click
- Output workspace with model selector, save/export/regenerate
- AI assistant reads full workspace, writes to sections via XML tags

### Pending
- GitHub push + SiteGround deployment
- A/B split output (future)
- Backend auto-start via restart-services.sh reliability improvement
- Production Milvus configuration on SiteGround

---

*This document serves as the canonical architecture reference for the Prompt Composer Console as of 2026-07-07. All future changes should reference this baseline.*
