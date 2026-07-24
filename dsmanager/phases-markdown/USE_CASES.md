import { Meta } from '@storybook/addon-docs/blocks';

<Meta title="Docs/Use Cases" />

# Use Cases — Raibach Design System Lifecycle Management

> *How the three-column prompt surface serves real human workflows.*

---

## 1. Form Fill — AI Completes Web Forms

**The prompt is the instructions for what the AI does with the form.**

A user opens a Form Fill prompt. In the Tool Call section, they paste one or more URLs — a LinkedIn job application, a tax form, an insurance claim. The System Role tells the AI: "Target form fields by label, insert stored user profile data, skip fields you're uncertain about."

**Flow:**

1. **Load** — User opens the Form Fill prompt, pastes URL(s) into Tool Call
2. **Run** — AI loads the form in the third column iframe, begins filling fields one by one
3. **Collapse** — User collapses the left column — they don't need to watch the prompt, they watch the form fill itself
4. **Chat** — User works with the AI assistant on the right, confirming or adjusting as fields populate
5. **Error** — A required field wasn't marked on the website. The AI can't fill it
6. **Recover** — User slides the left column open. Chatbot has already flagged the error: *"Field 'Employer Reference Number' is required but not marked. I can't proceed."*
7. **Edit Prompt** — User adds a Tool Call exception: "If field is unmarked but required, prompt me for manual entry"
8. **Rerun** — AI re-executes, now pausing at problem fields and asking via chat for manual input
9. **Confirm & Submit** — User reviews a diff: what was filled vs. what was skipped. Confirms. AI clicks Submit

**Why the prompt matters here:** Without the prompt, you have a chatbot guessing at forms. With the prompt, you have a reusable, versioned, auditable instruction set that works across any form URL.

**Variations:** Tax forms, insurance applications, job applications, contact forms, onboarding paperwork, medical intake forms.

---

## 2. Grocery Order — AI-Managed Household Inventory

**The prompt is a recurring household agent.**

A user builds a prompt that connects to H-E-B's inventory API. Every month, they open it, adjust constraints, rerun, and their order is placed. The prompt stores preferences, dietary restrictions, budget limits, and historical corrections.

**Flow:**

1. **Open** — User opens their "Monthly H-E-B Order" prompt session
2. **Review** — AI has already analyzed last month's order against current inventory and pricing
3. **Adjust** — User types in constraints: "Only items on my request list. Notify me before ordering substitutions."
4. **Run** — AI generates the order, showing a line-item diff against last month
5. **Trace Error** — Gnocchi was substituted for dumplings. User clicks Trace tab, finds the moment the substitution happened, flags it
6. **Fix** — User adds constraint: "Never substitute gnocchi." Reruns
7. **Recur** — Next month, same prompt, smarter constraints, zero errors
8. **Plugin** — H-E-B API integration handles fulfillment. User drives by and picks up

**Why the prompt matters:** It's not a shopping list. It's a living agent that gets smarter every month, with full traceability for every decision.

---

## 3. Schematic Update — Field Technician Workflow

**The prompt replaces an enterprise software deployment.**

A solar panel technician in the field needs to swap a GE panel for a Vektron model in a wiring schematic. They open the prompt on a tablet, enter the model numbers, and the AI regenerates the schematic with updated specifications.

**Flow:**

1. **Open** — Technician opens "Solar Panel Swap" prompt on a tablet
2. **Input** — Enters: GE Model X → Vektron Model Y
3. **Run** — AI generates updated schematic in the third column canvas
4. **Full Screen** — Technician collapses left and right columns — the schematic fills the entire tablet screen
5. **Touch** — Interface auto-detects tablet mode. Touch gestures work for zoom, pan, annotate
6. **Export** — Technician exports the new schematic as PDF, emails to the home office
7. **Version** — Prompt session saves the swap as a new version. Next technician in the field can reference this exact swap

**Why the prompt matters:** The prompt is the standard operating procedure. It ensures every technician performs the swap the same way, with the same constraints, generating the same quality output from any location.

---

## 4. Dietary Plan — AI-Assisted Therapy to Action

**The prompt bridges conversation to structured action.**

A user is in a cognitive behavioral therapy session via the chat interface. The therapist helps them identify dietary changes to improve depression. The therapist populates the prompt with the plan, the user reviews and runs it, and the output connects to real-world fulfillment.

**Flow:**

1. **Chat Only** — Left and third columns collapsed. Pure chat interface for therapy conversation
2. **Plan** — Therapist and user collaboratively build a dietary plan in the chat
3. **Populate** — Therapist says "Let me put this into a structured plan." AI populates the prompt sections from the conversation: System Role = dietary guidelines, User Role = patient preferences, Constraints = allergies and budget
4. **Expand** — User expands the left column to review what the therapist put in
5. **Run** — User clicks RUN. AI generates a complete dietary plan with meal suggestions, shopping list, and nutritional breakdown
6. **Act** — Output appears in third column. User exports as PDF, emails to themselves, or sends directly to H-E-B for fulfillment
7. **Reference** — The prompt session is saved. User can revisit, adjust, rerun any time

**Why the prompt matters:** It captures the structured output of an unstructured conversation. The therapist doesn't need to write a formal plan — the AI assembles it from the chat and the prompt template.

---

## 5. Cost-Saving Prompt — Marketplace Discovery & Fork

**The prompt is a portable, purchasable asset.**

A user searches the marketplace for "gas savings" and finds a prompt with a 4.8-star rating and 10,000+ users. The prompt optimizes fuel purchases based on route analysis, gas station pricing APIs, and vehicle efficiency data. The user buys it for $5, personalizes it with their vehicle and route, and saves $500/year.

**Flow:**

1. **Discover** — User browses marketplace, finds "RouteOptimizer: Save on Gas" by @efficient_dad
2. **Preview** — Sees the prompt's rating (4.8), user count (10k+), and verified savings data
3. **Purchase** — Pays $5. Prompt is forked to their library. @efficient_dad gets $4.50, the platform gets $0.50
4. **Personalize** — User opens the prompt, modifies Tool Call with their vehicle's fuel efficiency and regular route
5. **Run** — AI analyzes routes against real-time gas pricing, outputs optimal fill-up locations and timing
6. **Improve** — User notices the prompt doesn't account for seasonal tire pressure changes. Adds a Few Shot example. Reruns. Better results
7. **Republish** — User publishes their improved version as a fork. Original author gets royalty on every sale of the fork

**Why the prompt matters:** It's data dignity in practice. @efficient_dad's year of optimization work becomes a $5 asset that earns perpetually. The marketplace self-regulates through ratings and verified outcomes.

---

## 6. Executive Report — From Transcript to Presentation

**The prompt turns raw meeting output into a board-ready deck.**

A CEO has a 90-minute strategy meeting transcript. They open the "Executive Report" prompt, paste the transcript into Tool Call, and run. The AI generates a presentation-ready document with executive summary, key decisions, action items, and supporting data.

**Flow:**

1. **Paste** — CEO pastes transcript into Tool Call
2. **Run** — AI processes in the third column: extracts decisions, identifies action items, flags contradictions
3. **Format** — Output renders as a formatted document with sections, tables, and bullet points
4. **Edit** — CEO edits the output directly in the third column textarea
5. **Export** — Saves as PDF, prints, or emails to the board
6. **Version** — Prompt session saved. Next meeting transcript gets the same treatment with the same prompt

**Why the prompt matters:** The System Role encodes the CEO's communication style, preferred format, and organizational priorities. Every report is consistent, regardless of who runs the prompt or which meeting it processes.

---

## Universal Pattern

Every use case follows the same structure:

```
OPEN PROMPT → ADJUST CONSTRAINTS → RUN → REVIEW OUTPUT → TRACE ERRORS → FIX → RERUN → ACT
```

The columns adapt to the moment:
- **All three open** — building and running
- **Left collapsed** — focused on output, assistant guides
- **Left + Right collapsed** — full-screen output (touch, schematic, reading)
- **Right only** — pure conversation, prompt hidden

The prompt is never disposable. It's a persistent, versioned, shareable instruction set that improves with every run.
