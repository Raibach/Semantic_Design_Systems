# Lit Architecture Plan

**Status:** Ready for implementation  
**Created:** 2026-07-15  
**Distinct from:** `LIT_A2UI_ARCHITECTURE.md` (vision) — this is the build order.

---

## Foundation: What the Island Is

The **island** is the entire three-column prompt session — builder (left), output (middle), chat (right) — scoped to a session UID. The AI owns everything inside that boundary: components, code, layout. The **shell** (console homepage, left nav, headers, split panel behavior) is **untouchable**. Split panels remain draggable, collapsible, edge-to-edge exactly as they are now.

---

## Phase 1 — Tag Registry

### 1.1 Create `shared/tag-registry.ts`

Define every AI-addressable tag with Zod schemas. Export as typed const and JSON manifest.

**Initial 15 tags:**

| Tag | Column | Purpose |
|-----|--------|---------|
| `prompt-section` | Left | System Role, User Role, Tool Call, Few Shot, Constraints |
| `output-panel` | Middle | Compiled output display |
| `version-trace` | Middle | Version timeline / audit |
| `chat-panel` | Right | AI conversation |
| `save-button` | Left | Save / version |
| `run-button` | Left | Execute pipeline |
| `agent-card` | Console | Card in grid |
| `featured-card` | Console | Hero card |
| `filter-pill` | Console | Category/status filter |
| `search-bar` | Console | Text search |
| `status-indicator` | Any | Loading, error, success state |
| `error-banner` | Any | Inline error display |
| `dynamic-button` | Any | AI-generated action button |
| `layout-row` | Middle | Horizontal layout container |
| `layout-col` | Middle | Vertical layout container |

**Example schema entry:**

```typescript
{
  tag: "prompt-section",
  props: {
    type: { type: "enum", values: ["system-role","user-role","tool-call","few-shot","constraints"] },
    content: { type: "string" },
    order: { type: "number" },
    state: { type: "enum", values: ["idle","editing","saving","error"] }
  },
  events: ["section-update", "section-remove", "section-reorder"],
  constraints: ["type=system-role is required before Run"],
  surface: "composer",
  column: "left"
}
```

### 1.2 Export JSON manifest

Static export so the Python backend can read the registry directly. The AI's system prompt includes the manifest.

---

## Phase 2 — Annotate Existing Components

### 2.1 Add `data-tag` attributes

No Lit yet. Add `data-tag="agent-card"`, `data-tag="filter-pill"`, etc. to existing React components.

**Files to touch:**
- `PromptDashboardCanvas.tsx` — `DesignCard`, `FeaturedCard`, `Toolbar`
- `AgentCardGrid.tsx` — search, pagination
- `ResponsivePromptBuilderWithDnD.tsx` — sections
- `InteractiveChatInterface.tsx` — chat
- `ControlBar.tsx` — run/save

### 2.2 Create frontend event bus

```typescript
// shared/event-bus.ts
class EventBus {
  emit(command: AiCommand) {
    window.dispatchEvent(new CustomEvent('ai-command', { detail: command }));
  }
  on(handler: (cmd: AiCommand) => void) {
    window.addEventListener('ai-command', (e) => handler((e as CustomEvent).detail));
  }
}
```

---

## Phase 3 — Wire the Chat Parser

### 3.1 Backend: `grace_gui.py` emits commands

Extend XML parser to emit JSON matching tag registry:

```json
{
  "sessionId": "uuid",
  "command": "add-section",
  "tag": "prompt-section",
  "props": { "type": "few-shot", "content": "Example: ..." },
  "timestamp": "iso"
}
```

### 3.2 Frontend: command listener

Three-column workspace listens for `ai-command` events, validates against registry, executes.

---

## Phase 4 — Lit Component Pipeline

### 4.1 Install

```bash
pnpm add lit @lit/react
```

### 4.2 Build `<AiManagedContainer/>`

React wrapper for the middle column: accepts XML stream, validates tags (Gatekeeper), mounts Lit via `@lit/react`, logs to PostgreSQL audit, blocks shell manipulation.

### 4.3 Conversion order

1. `output-panel` — simplest, no interaction
2. `status-indicator` — tiny, high reuse
3. `prompt-section` — core builder
4. `version-trace` — read-only display
5. `agent-card` — console grid
6. `filter-pill`, `search-bar` — interactive

---

## Phase 5 — Chat as Control Surface on Console

### 5.1 Console chat emits tagged commands

Wire `InteractiveChatInterface` on homepage to event bus. AI says "show writing prompts" → filter fires.

### 5.2 Grid responds

`AgentCardGrid` listens for:
- `<filter-grid category="writing"/>` → sets filter
- `<sort-order by="lastUsed" dir="desc"/>` → reorders
- `<search-query term="design"/>` → searches

---

## Constraints (Do Not Break)

- Split panels: draggable, collapsible (75px), edge-to-edge — exactly as is
- Console grid: 5 columns max, 2 rows max, centered, paginated, responsive
- Toolbar carousel: arrow-scrollable, aligned with cards
- No overlays — panels share viewport
- Session scoping — all AI actions bound to session UID

---

## First Action

Create `shared/tag-registry.ts` with 15 tags, Zod schemas, JSON manifest export.



Gemini

That is a much more realistic and common architectural approach than trying to convert the entire application at once. In fact, keeping the AI-managed portion separate from the rest of your application is a best practice.

Here is how you can architect a "Hybrid" system where only a specific part of your app is AI-managed:

1. The "Island Architecture" Pattern
Think of your UI as a standard application (React or another framework) with an "AI Island" embedded inside it.

The Shell: Your standard app manages the global navigation, user authentication, profile settings, and everything that shouldn't change via AI commands.

The Island: This is a dedicated container (like a <div> or a <chat-composer-surface>) where you mount your Lit-based components. This is the only area the AI has permission to "rearrange" or "assemble."

2. Implementation Strategy: The "Gatekeeper"
To ensure the AI doesn't touch the rest of your app, you need a Gatekeeper Orchestrator.

Namespace Constraints: Tell your AI: "You are only allowed to emit tags within the <ai-interface-container> scope."

Registry Segregation: Split your TAG_REGISTRY into two:

Global Components: (Standard React components)

AI-Playground Components: (Lit-based tags that the AI is allowed to emit).

Validation: Your Orchestrator should act as a firewall. If the AI tries to emit a tag that isn't in your "AI-Playground" registry, the Orchestrator blocks it and returns an error. This prevents the AI from accidentally modifying your sidebar, header, or footer.

3. The Lit-in-React Bridge
Since you are keeping part of the app in React, you don't have to remove React at all. You can use Web Component Integration to keep the AI-managed "Island" safe:

You build the Lit components as normal.

You use @lit/react to create a React component wrapper for those Lit pieces.

In your React code, you treat the AI-managed section just like any other component: <AiManagedContainer/>.

React doesn't know (and doesn't care) that the internal bits of that container are being dynamically swapped out by an AI. It just renders the container as a standard DOM element.

Why this is safer for you:
Controlled Scope: The AI has a "playground" it can mess around in, but it can't accidentally break your production-critical navigation or billing components.

Incremental Adoption: You can build one "AI-orchestrated" feature (like a custom prompt builder or a dashboard widget) and leave the rest of your app as standard, stable code.

Easier Auditing: Because all AI interactions are scoped to that one "Island," your audit logs (the ones you mentioned sending to PostgreSQL) will be much cleaner. You'll know exactly what the AI did within that specific container.

Does this "Island" approach feel more manageable? It allows you to use the power of the Lit-based A2UI protocol where you need it, without forcing you to rewrite the parts of your app that are already working perfectly in React.
