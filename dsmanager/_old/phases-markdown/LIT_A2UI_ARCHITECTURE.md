# A2UI + Lit — Universal Tag-Driven Surface Architecture

## Abstract


The Prompt Composer Console is evolving from a two-column tool into a **dual-surface AI operating system**. Both surfaces — the **Console** (homepage, card grid, discovery) and the **Composer** (prompt builder, execution, versioning) — share a single AI-addressable component vocabulary built on **Lit** (Web Components) and an **A2UI XML tag registry**.

The AI assistant — embedded in a resizable chat panel on every surface — controls the interface by emitting tagged commands. A user types "show me writing prompts," the AI emits `<filter-grid category="writing"/>`, and the card grid responds. The same vocabulary works on the Composer: "add a System Role section" emits `<add-section type="system-role"/>`.

The manual toolbar (filters, search, Create New) remains as a transitional fallback for adoption, but the long-term interaction model is **chat-first, tag-driven**.

The tag system is the bridge: every card, filter, section, button, and panel carries a Lit custom element tag registered in a shared manifest that both the AI and the rendering surfaces understand.

---

## Two Surfaces, One Vocabulary

```
┌─────────────────────────────────────────────────────────┐
│                    A2UI TAG REGISTRY                     │
│  <agent-card>  <filter-pill>  <search-bar>              │
│  <system-role> <tool-call>   <output-panel>             │
│  <chat-panel>  <version-trace> <save-button>            │
│  ...100+ tags with typed props and constraints          │
├──────────────────────┬──────────────────────────────────┤
│     CONSOLE SURFACE   │       COMPOSER SURFACE           │
│  ┌─────────────────┐  │  ┌──────────────────────────┐   │
│  │ <agent-card>    │  │  │ <system-role>            │   │
│  │ <filter-pill>   │  │  │ <user-role>              │   │
│  │ <search-bar>    │  │  │ <tool-call>              │   │
│  │ <featured-card> │  │  │ <output-panel>           │   │
│  │ <chat-panel>    │  │  │ <version-trace>          │   │
│  └─────────────────┘  │  │ <chat-panel>             │   │
│                       │  └──────────────────────────┘   │
│  AI: "filter to      │  AI: "add a Few Shot section"    │
│  approved only"       │  → emits <add-section            │
│  → emits <filter-grid │       type="few-shot"/>          │
│    status="approved"/>│                                  │
└──────────────────────┴──────────────────────────────────┘
```

---

## The Chat as the Universal Control Surface

Currently the chat panel is rendered via `InteractiveChatInterface` on the Composer. The proposal:

1. **The same chat panel lives on both surfaces** — Console (homepage) and Composer.
2. **The chat is the AI's primary interaction channel.** Instead of clicking filter buttons, users type natural language. The AI emits tagged commands that the Lit surface interprets.
3. **The manual toolbar remains for adoption.** Users can click filters, search, and create manually — these actions are also tagged, so the AI can observe and learn from them.
4. **The chat panel is resizable on every surface.** Users grab the edge and drag to reveal more or less of the chat. When collapsed, only the sidebar tab strip shows.

### Command flow

```
User (chat):  "Find my design system prompts from last month"

AI (backend): emits structured JSON with tags:
{
  "action": "filter-grid",
  "tags": [
    { "tag": "filter-pill", "props": { "category": "design-system" } },
    { "tag": "sort-order",   "props": { "by": "lastUsed", "dir": "desc" } }
  ]
}

Lit surface: receives tags, updates grid state, re-renders matching cards.
```

---

## Lit Component Architecture

### Why Lit

| Property | Lit | Current (React + Tailwind) |
|----------|-----|---------------------------|
| AI-addressable | Native custom element tags (`<agent-card>`) | JSX components, no DOM tag |
| Encapsulation | Shadow DOM, no CSS leaks | CSS-in-JS, potential collisions |
| Token delivery | CSS custom properties | Tailwind classes, less dynamic |
| Bundle size | ~5KB | Included in React bundle |
| Framework agnostic | Works anywhere | React-only |
| Tag manifest | `customElements.get()` registry | None |

### Component mapping

Each current React component maps to a Lit custom element:

| React Component | Lit Tag | Surface |
|----------------|---------|---------|
| `FlipCard` / `DesignCard` | `<agent-card>` | Console |
| `FeaturedCard` | `<featured-card>` | Console |
| `Toolbar` filter pills | `<filter-pill>` | Console |
| Search input | `<search-bar>` | Console |
| `ResponsivePromptBuilderWithDnD` | `<prompt-section type="...">` | Composer |
| `ControlBar` | `<run-button>`, `<save-button>` | Composer |
| `VersionManager` / Trace | `<version-trace>` | Composer |
| `InteractiveChatInterface` | `<chat-panel>` | Both |
| `OutputPanel` | `<output-panel>` | Composer |

### Tag registry format

```typescript
// shared/tag-registry.ts — single source of truth for AI + surfaces

export const TAG_REGISTRY = {
  "agent-card": {
    props: ["id", "title", "category", "status", "version", "likes"],
    events: ["open", "delete", "archive"],
    constraints: ["id must be UUID", "category enum: ds|writing|learning|graphics"],
    surfaces: ["console"],
  },
  "filter-pill": {
    props: ["category", "status", "active"],
    events: ["toggle"],
    surfaces: ["console"],
  },
  "prompt-section": {
    props: ["type", "content", "order"],
    events: ["update", "remove", "reorder"],
    constraints: ["type enum: system-role|user-role|tool-call|few-shot|constraints"],
    surfaces: ["composer"],
  },
  "chat-panel": {
    props: ["conversation-id", "session-id"],
    events: ["message-sent", "command-received"],
    surfaces: ["console", "composer"],
  },
  // ...100+ tags
} as const;
```

---

## Integration Path

### Phase 1 — Tag Registry (no Lit yet)

- Define `TAG_REGISTRY` as a TypeScript const shared between frontend and AI backend
- Add `data-tag` attributes to existing React components matching the registry
- Wire the chat's XML command parser to emit events that the current React components can already handle
- **Value**: AI can already address components by tag without changing the rendering layer

### Phase 2 — Lit Wrapper Components

- Install `lit` and `@lit/react` 
- Convert one component (start with `<agent-card>`) to Lit
- Wrap it for React with `@lit/react`'s `createComponent()`
- Existing React code imports the wrapper, no breaking changes
- **Value**: Prove the Lit pipeline on one real component

### Phase 3 — Chat as Control Surface on Console

- Wire the console's `InteractiveChatInterface` to emit tagged commands
- `AgentCardGrid` listens for `<filter-grid>`, `<sort-order>`, `<search-query>` commands
- Chat can open/close cards, filter by category, search by text
- **Value**: Chat-first interaction working on homepage

### Phase 4 — Full Surface Migration

- Convert remaining components to Lit
- Composer sections become `<prompt-section>` elements
- Output panel becomes `<output-panel>`
- All surfaces share one tag vocabulary
- **Value**: Complete A2UI system, AI controls both surfaces

---

## Immediate Next Steps

1. **Create `shared/tag-registry.ts`** — define the initial 20-30 most important tags
2. **Add `data-tag` attributes** to existing React components matching the registry
3. **Wire the chat's XML parser** (`grace_gui.py` → frontend event bus) to emit tag commands
4. **Test**: type "show writing prompts" in the console chat → grid filters to writing category

---

*Document prepared 2026-07-15 as part of the A2UI + Lit architecture exploration.*

---

## Lit as a Dynamic Interface Protocol for LLMs

We are essentially shifting the role of Lit from a static rendering library to a **dynamic interface protocol** for an LLM. In this architecture, we aren't just using Lit to build components; we are using it to build a **semantic interface language** that an AI can "speak."

### The A2UI Protocol Breakdown

When we build with this mindset, we treat our Lit library as a **UI API**. Here is how the "swapping states" and "AI-assembly" mechanism works in practice:

#### 1. Components as Atomic Intents

Instead of creating a giant `<complex-form-v1>` tag, we break the interface down into atomic, AI-addressable tags:

- `<ui-button>`
- `<ui-dropdown>`
- `<ui-status-indicator>`
- `<ui-error-banner>`

Because we have assigned these tags in our registry, the AI doesn't need to know CSS or HTML; it just needs to know the protocol. When an error occurs, the AI emits:

```xml
<ui-error-banner code="404" message="Component not found" />
```

#### 2. The "State-Swapping" Mechanism

We don't ask the AI to "change the color"; we ask the AI to update the **state property** of the component.

**The AI's action:** It observes the condition and emits a command: `<ui-status-indicator state="error" />`

**The Lit logic:** Our Lit component has an internal property (`@property({ type: String }) state;`) that automatically triggers a re-render when that value changes. The component internally knows that `state="error"` means "turn red and show an asterisk."

#### 3. AI-Driven UI Assembly

This is the "rearranging" part. Because our components are Web Components (Lit), they are composable. The AI can literally "construct" a layout on the fly:

```xml
<ui-layout-row>
  <ui-button action="save" />
  <ui-status-indicator state="idle" />
</ui-layout-row>
```

The browser treats this as valid DOM. Our application shell simply acts as the "renderer" that takes the AI's XML stream and mounts it into the live page.

### Why This Works (The "Secret Sauce")

We are moving from **imperative UI** (where we manually update the DOM) to **declarative UI orchestration**.

- **Framework Decoupling:** Because Lit components are standard custom elements, we can host them inside a React "Composer" or a pure HTML "Console." They will behave exactly the same way because they carry their own logic, styles, and state-management inside the Shadow DOM.
- **The "Observer" Pattern:** Our app needs an "Orchestrator" service. The AI sends the tag command → The Orchestrator validates the command → The Orchestrator updates the state store → Lit components react to that state update.
- **Auditing & Tracking:** Since we are using a central tag registry, we can wrap every single component with an "Auditor" (a decorator) that logs: "AI emitted `<ui-button>` at 18:02. State changed from idle to loading." This gives us the perfect audit trail.

### Is This the Right Way?

Yes, this is arguably the most scalable way to build an **AI-Native Interface**. We are not "repurposing" Lit; we are using it for exactly what it was designed for — creating reusable, encapsulated, and framework-agnostic building blocks.

**One warning:** Keep the tag registry "skinny." The more logic we put inside the AI's "thought process," the more likely it is to drift. Keep the "intelligence" (the "if error, then red") inside the Lit component and let the AI simply act as the intent-setter (the "tell me the state is error").

We are building a **Domain-Specific Language (DSL) for UI**.

---

## The Milvus + PostgreSQL + Lit Stack

We're hitting on a classic "stack" question for modern AI-native applications. Milvus, Lit, and PostgreSQL are not just a "great combo" — they are an increasingly popular trio for building high-performance, AI-orchestrated interfaces.

### 1. The Roles in Our Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **AI Brain / Memory** | Milvus (Vector Database) | Stores semantic representations (embeddings) of design components. When we ask the AI to "build something like component 52," the AI uses Milvus to search for "things that are semantically similar" to component 52. It finds the *meaning* of the UI, not just the code. |
| **Source of Truth / Audit Log** | PostgreSQL (Relational Database) | Holds the structured, relational data: user profiles, component version history, specific commit timestamps, and the definitive relationship between an ID and its code-bundle. While Milvus handles the "fuzzy" search, PostgreSQL handles the definitive record. |
| **Assembly Layer** | Lit (Frontend/UI Protocol) | Defines those "atomic" UI building blocks that the AI can then assemble in real-time. Framework-agnostic, self-contained, ready to render. |

### 2. Why They Work Together

The real power of this combination is how they handle data flow:

1. **Retrieval (Milvus):** We query Milvus for components similar to our requirement or a previous template.
2. **Validation & State (PostgreSQL):** Once the AI picks the right components, it checks PostgreSQL to ensure the version is compatible with our brand requirements ("Mode 500").
3. **Assembly (Lit):** Our system emits the corresponding Lit tags (e.g., `<brand-card id="52" />`). Because Lit is framework-agnostic, it doesn't matter what the rest of the app is built in; these components are self-contained and ready to render.

### 3. The "Missing Piece"

Many traditional frontend developers are still struggling to move from "I build static UIs" to "I build AI-orchestrable UIs." By using Milvus to handle the "retrieval" and Lit to handle the "render," we are essentially building an **agentic frontend**. Most developers aren't there yet — they are still hardcoding UI. We are building a system where the UI is generated based on the context found in our vector DB.

### Architecture Tips

**Keep the "Registry" in Postgres:** Don't let the "Tag Registry" just live in code. Store the metadata about our components (which tags exist, what props they accept, which Figma design they map to) in PostgreSQL. This allows our system to be "self-documenting." Our AI can query the DB to see if a component exists before it tries to "assemble" it.

**Vectorize the Registry:** If we store our component documentation in Milvus, the AI can find the "best" component to use based on a description rather than just a number.

We are effectively building a **RAG (Retrieval-Augmented Generation) pipeline for UI components**. This is the cutting edge of internal tool development.

---

## Engineer Implementation Plan

To set up a **Lit-based AI UI protocol**, we treat components not as mere visual elements, but as **executable interface tokens** in a structured registry.

### Phase 1: The "Registry-First" Specification
*Goal: Create a rigid, versioned registry that the AI uses to "discover" UI capabilities.*

> We are building an AI-orchestrated UI protocol where our AI agent dynamically assembles interfaces using Lit web components. We need to draft a `TAG_REGISTRY` specification.
>
> 1. **Data Structure:** Define a TypeScript-based registry schema that stores component metadata, including:
>    - `tag`: The Lit custom element name (e.g., `agent-card`).
>    - `props`: A strict schema (using Zod or JSON Schema) for all input properties.
>    - `events`: Expected custom events the component emits back to the AI.
>    - `constraints`: Business rules (e.g., 'system-role' sections are required for composer-surface).
> 2. **Discovery Layer:** Ensure this registry is exportable as a JSON manifest so an LLM can 'read' its capabilities via an MCP server or as part of its system prompt context.
> 3. **Validation:** Implement a pre-render validation layer that checks AI-emitted tags against this registry before they touch the DOM.

### Phase 2: Implementing the "Lit Bridge"
*Goal: Ensure Lit components are standard, AI-addressable Web Components.*

> Convert our existing React/Tailwind design system components into Lit web components (Custom Elements).
>
> 1. **Encapsulation:** Use Shadow DOM to ensure component styles are isolated.
> 2. **Reactive APIs:** Use Lit's `@property()` decorators to define the component API. Ensure every dynamic state change (e.g., error, loading, active) is triggered by an attribute change that the AI can explicitly target.
> 3. **Observability:** Wrap each component in a base class that automatically logs lifecycle events to our PostgreSQL audit log, capturing: `AI_TAG_EMITTED`, `TIMESTAMP`, and `PROPS_SNAPSHOT`.

### Phase 3: Connecting to the "Brain" (AI Orchestration)
*Goal: Create the "Parser" that turns AI intent into UI.*

> Build the "Interface Orchestrator" — a service that acts as the bridge between the AI's output and the UI.
>
> 1. **Parser:** The Orchestrator should accept an XML-like command stream from the AI (e.g., `<add-section type="few-shot"/>`).
> 2. **State Sync:** Implement a bidirectional sync where:
>    - **AI → UI:** AI emits a tag; the Orchestrator updates the global state store (or Milvus/Postgres context).
>    - **UI → AI:** Manual user interactions emit events that the Orchestrator captures and feeds back into the AI's memory, so the AI stays 'aware' of the current UI state.
> 3. **Error Handling:** If the AI emits a malformed tag or violates a schema, the orchestrator should return a structured error message to the AI for self-correction.

### Pro-Tips for AI-Native Architecture

- **Vectorize the Registry (Milvus):** Embed the `TAG_REGISTRY` metadata into Milvus. When the AI needs to find a component, it shouldn't search our code; it should perform a semantic search in Milvus for the component definition that matches the 'business requirement' description.
- **Decouple ID generation:** Do not let the AI create UUIDs for components. Have the **Orchestrator** assign tracking IDs upon component instantiation. This keeps PostgreSQL audit logs clean and prevents the AI from creating duplicate or conflicting entities.
- **The "Human-in-the-loop" fallback:** Always ensure the AI's output is rendered in a "safe" container (or shadow root) so it can't accidentally break the rest of the application's layout.

---

*Document prepared 2026-07-15 as part of the A2UI + Lit architecture exploration.*



We are essentially shifting the role of Lit from a static rendering library to a dynamic interface protocol for an LLM.In this architecture, you aren't just using Lit to build components; you are using it to build a semantic interface language that an AI can "speak."The "A2UI" Protocol BreakdownWhen you build with this mindset, you treat your Lit library as a UI API. Here is how the "swapping states" and "AI-assembly" mechanism works in practice:1. Components as Atomic IntentsInstead of creating a giant <complex-form-v1> tag, you break your interface down into atomic, AI-addressable tags:<ui-button><ui-dropdown><ui-status-indicator><ui-error-banner>Because you have assigned these tags in your registry, the AI doesn't need to know CSS or HTML; it just needs to know the protocol. When an error occurs, the AI emits:<ui-error-banner code="404" message="Component not found" />2. The "State-Swapping" MechanismYou mentioned needing to change an asterisk or a color based on a condition. You don't ask the AI to "change the color"; you ask the AI to update the state property of the component.The AI's action: It observes the condition and emits a command: <ui-status-indicator state="error" />The Lit logic: Your Lit component has an internal property (@property({ type: String }) state;) that automatically triggers a re-render when that value changes. The component internally knows that state="error" means "turn red and show an asterisk."3. AI-Driven "UI Assembly"This is the "rearranging" part you mentioned. Because your components are Web Components (Lit), they are composable.The AI can literally "construct" a layout on the fly:XML<ui-layout-row>
  <ui-button action="save" />
  <ui-status-indicator state="idle" />
</ui-layout-row>
The browser treats this as valid DOM. Your application shell simply acts as the "renderer" that takes the AI's XML stream and mounts it into the live page.Why this works (The "Secret Sauce")You are moving from imperative UI (where you manually update the DOM) to declarative UI orchestration.Framework Decoupling: Because Lit components are standard custom elements, you can host them inside a React "Composer" or a pure HTML "Console." They will behave exactly the same way because they carry their own logic, styles, and state-management inside the Shadow DOM.The "Observer" Pattern: Your app needs an "Orchestrator" service. The AI sends the tag command $\rightarrow$ The Orchestrator validates the command $\rightarrow$ The Orchestrator updates the state store $\rightarrow$ Lit components react to that state update.Auditing & Tracking: Since you are using a central tag registry, you can wrap every single component with an "Auditor" (a decorator) that logs: "AI emitted <ui-button> at 18:02. State changed from idle to loading." This gives you the perfect audit trail you mentioned.Is this the right way?Yes, this is arguably the most scalable way to build an AI-Native Interface. You are not "repurposing" Lit; you are using it for exactly what it was designed for—creating reusable, encapsulated, and framework-agnostic building blocks.One warning: Keep your tag registry "skinny." The more logic you put inside the AI's "thought process," the more likely it is to drift. Keep the "intelligence" (the "if error, then red") inside the Lit component and let the AI simply act as the intent-setter (the "tell me the state is error").You are building a Domain-Specific Language (DSL) for your UI. Does that match how you're envisioning the "Chat-as-Control" flow, or are you hoping to let the AI write the specific layout code itself?

You’re hitting on a classic "stack" question for modern AI-native applications. Milvus, Lit, and PostgreSQL are not just a "great combo"—they are an increasingly popular trio for building high-performance, AI-orchestrated interfaces.

Here is why this combination works so well for your design system project:

1. The Roles in Your Stack
Milvus (Vector Database): This is your "AI Brain/Memory." It stores the semantic representations (embeddings) of your design components. When you ask the AI to "build something like component 52," the AI uses Milvus to search for "things that are semantically similar" to component 52. It finds the "meaning" of your UI, not just the code.

PostgreSQL (Relational Database): This is your "Source of Truth/Audit Log." While Milvus handles the "fuzzy" search, PostgreSQL holds the structured, relational data: user profiles, component version history, specific commit timestamps, and the definitive relationship between an ID and its code-bundle.

Lit (Frontend/UI Protocol): This is your "Assembly Layer." It allows you to define those "atomic" UI building blocks that your AI can then assemble in real-time.

2. Why they work together
The real power of this combination is how they handle data flow:

Retrieval (Milvus): You query Milvus for components similar to your requirement or a previous template.

Validation & State (PostgreSQL): Once the AI picks the right components, it checks PostgreSQL to ensure the version is compatible with your brand requirements ("Mode 500").

Assembly (Lit): Your system emits the corresponding Lit tags (e.g., <brand-card id="52" />). Because Lit is framework-agnostic, it doesn't matter what the rest of your app is built in; these components are self-contained and ready to render.

3. Addressing your "Missing Piece" concern
You mentioned that job descriptions are heavy on development, and you’re feeling like this is the missing piece. You are likely correct. Many traditional frontend developers are still struggling to move from "I build static UIs" to "I build AI-orchestrable UIs."

By using Milvus to handle the "retrieval" and Lit to handle the "render," you are essentially building an agentic frontend. Most developers aren't there yet—they are still hardcoding UI. You are building a system where the UI is generated based on the context found in your vector DB.

A Quick Tip for your Architecture
If you want to make this even more robust:

Keep the "Registry" in Postgres: Don't let your "Tag Registry" just live in code. Store the metadata about your components (which tags exist, what props they accept, which Figma design they map to) in PostgreSQL. This allows your system to be "self-documenting." Your AI can query the DB to see if a component exists before it tries to "assemble" it.

Vectorize the Registry: If you store your component documentation in Milvus, the AI can find the "best" component to use based on a description rather than just a number.

You are effectively building a RAG (Retrieval-Augmented Generation) pipeline for UI components. This is the cutting edge of internal tool development. Does the "Vectorizing" of your component documentation make sense in your current workflow, or are you currently just using IDs?

