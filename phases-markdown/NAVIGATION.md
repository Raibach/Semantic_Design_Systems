# Navigation Architecture

## Top-Level Navigation: Role-Based Lenses

The header navigation is not a page router. It is a **role-based lens system**. Each tab applies a different access layer over the same three-column workspace structure. The interface does not change — the data, permissions, and metrics do.

```
┌─────────────────────────────────────────────────────────┐
│  [Console]    [Composer]    [Evaluation]                │  ← Role lenses
├──────────┬────────────────────────┬────────────────────┤
│          │                        │                    │
│  Intent  │       Output           │   Audit & Trace    │
│  Panel   │       Surface          │   (Telemetry)      │
│          │                        │                    │
└──────────┴────────────────────────┴────────────────────┘
```

### Lens Definitions

| Lens | User | Purpose |
|---|---|---|
| **Console** | Everyone (role-tailored) | Discovery surface. Content is tailored to the user's profile and permissions. See [Console Views](#console-views) below. |
| **Composer** | Builders | Output-focused workspace. "Does this prompt produce what I need?" Freeform construction with immediate execution feedback. New sessions start blank and receive an ID on first save. |
| **Evaluation** | Auditors, QA, Governance | Every prompt in the system, scored, indexed, comparable. A compliance and performance lens. Users without evaluation permissions never see this tab. |

### Console Views

The Console is not a single page — it is a **permission-tailored homepage** that renders different content depending on the user's role. The three-column structure remains constant; the cards, dashboards, and data change.

| Role | Console View | Content |
|---|---|---|
| **Regular user** | Prompt discovery | Cards for available prompt packages, create new, recent activity |
| **Evaluator / SME** | Approval dashboard | Items pending approval, rejected items, items needing review, feedback queue. Approve or reject schematic diagrams, regulatory outputs, and field-generated content. |
| **Field worker** | Issue resolution | Schematic cards submitted for expert review, status tracking on submitted queries |
| **Administrator** | Governance overview | System-wide metrics, audit trail summaries, user activity, permission management |

**Current state:** Only the Regular user console is built. The Evaluator and Administrator views are documented but not yet implemented. When built, they will use the same three-column layout — the left panel for filtering/querying, the center for the approval/feedback surface, the right for audit and trace.

### Design Principles

1. **Same surface, different lens.** The three-column structure never changes. When a user switches from Console to Composer to Evaluation, they are not navigating to a new page — they are applying a different access layer to the same workspace.

2. **Permission-gated visibility.** Header tabs appear based on the user's role. A product manager building prompts may never see the Evaluation tab. A compliance officer may only see Console and Evaluation. The interface is the same; access is the difference.

3. **No pages.** There are no separate "pages" for different functions. The URL changes to reflect state (e.g., `/prompts/:id`), but the underlying layout is constant. Future versions will reduce the header to an even more minimal presence as users internalize the lens model.

4. **The header is transitional.** Current users expect a navigation bar because the web trained them to. As the three-column IDE pattern becomes standard, the header will recede. The left vertical menu and the right column tabs provide sufficient navigation for power users.

### Route Map

| Route | Lens | Behavior |
|---|---|---|
| `/` | Console | Dashboard with personalized prompt cards |
| `/prompts/new` | Composer | Blank session — no ID until saved |
| `/prompts/:id` | Composer | Loads a saved session with full version history |
| `/prompts` | Composer | Prompt index (list view) |
| `/evaluation` | Evaluation | Scored prompt index (future) |

### Session Lifecycle

1. User clicks **Composer** → new blank session at `/prompts/new`
2. User adds content to sections and clicks **Save** → session receives a UUID, URL updates to `/prompts/:id`
3. User leaves the composer → session state is preserved
4. Unsaved sessions expire after a configurable period (future)
5. Every save creates a new version with timestamp and user attribution
6. The audit trail is visible in the Trace tab of the right column

### Related Documentation

- [The Dynamic Semantic Canvas](./THE_DYNAMIC_SEMANTIC_CANVAS.md) — full architectural vision
- [Architecture 2026-07-07](./ARCHITECTURE_2026-07-07.md) — technical build details
- [Agent Package Architecture](./AGENT_PACKAGE_ARCHITECTURE.md) — prompt package structure
