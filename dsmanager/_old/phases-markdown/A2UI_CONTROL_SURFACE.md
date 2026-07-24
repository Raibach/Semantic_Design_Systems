

AI controls all three columns — XML tags already inject content into sections (<update_agent>, <update_user>, etc.). Section CRUD listeners just added (<add_role>, <remove_role>).

Element-level ID layer — every section, run, and artifact needs a persistent UUID. Not user-visible. Infrastructure for the AI to target operations and the trace to track lineage. Not "tokens" — just IDs.

Autonomous loop — AI should iterate: RUN → evaluate groundedness → if < 90%, edit → re-RUN → converge → notify user.

# A2UI Control Surface — Foundation Layer

**TL;DR** — Wire the AI to fully control all three columns. Section CRUD is done. Session-scoped conversations are next. Then AI-driven tab switching, RUN triggering, and element-level ID tracking for the trace.

---

## Phase 1: Session-Scoped Chat *(critical — blocks everything else)*

Each prompt session owns its conversation. Opening a prompt loads ITS chat history, not the global most-recent.

- In `handleLoadPromptSession` (WritingAreaIndex.tsx): pass `conversationId` to InteractiveChatInterface
- InteractiveChatInterface: accept `initialConversationId` prop, auto-load it on mount
- On prompt switch: save current chat state, load new session's conversation

**Status**: ✅ Partial — `externalConversationId` already passed. Auto-loads on change. May need guard fix.

---

## Phase 2: AI Control Tags — Tab & RUN

Expand the XML tag system so the AI can navigate and execute:

- `<switch_tab>trace|variables|chat</switch_tab>` — switches right column tab
- `<run_prompt/>` — triggers execution
- `<show_version>N</show_version>` — loads a version in the variables tab
- `<eval_grounding/>` — evaluates current output against grounding metrics

**Status**: ✅ Done — `<switch_tab>`, `<run_prompt/>`, `<show_version>`, `<eval_grounding/>` all wired. `ai-run-prompt` listener added to PromptWorkspace.

---

## Phase 3: Element ID Layer

Every DOM element the AI touches gets a stable UUID attribute:

- `data-section-id` on every prompt section
- `data-run-id` on every execution output
- IDs persist across saves in `prompt_sessions.left_column_content` JSON
- Trace tab tracks changes per ID, not per text block

**Status**: Not started

---

## Phase 4: Autonomous Loop Foundation

AI can iterate without user intervention:

- Tag: `<loop_target>groundedness:0.9</loop_target>` sets goal
- After RUN → evaluate → compare to target → edit section → re-RUN
- On convergence: AI posts message, stops looping

**Status**: Not started

---

## Relevant Files

| File | Purpose |
|------|---------|
| `frontend/src/components/PromptWorkspace.tsx` | Section CRUD listeners (just added) |
| `frontend/src/components/InteractiveChatInterface.tsx` | Chat, tabs, tag processing |
| `frontend/src/pages/WritingAreaIndex.tsx` | Session loading, conversation scoping |
| `backend/grace_gui.py` | Tag interception and processing |
| `backend/main.py` | API routes, workspace context |

## Verification Checklist

- [ ] AI says "add a Constraints section" → section appears in left column
- [ ] Open prompt → its chat history loads, not a random conversation
- [ ] AI says "switch to trace tab" → trace tab opens
- [ ] AI says "run the prompt" → output appears in third column
- [ ] AI sets loop target → iterates until threshold met
- [ ] Trace tab shows per-element change history
