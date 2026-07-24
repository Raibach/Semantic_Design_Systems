# Changelog — Raibach Design System Lifecycle Management

Built by **John Holt, Raibach Interactive Design Studio** 

# Version History

## 2026-07-19: Platform Migration & Infrastructure Overhaul

### Major Changes
- **Migrated from SiteGround to Northflank** - Left shared hosting due to process limits, no restart capability, and 24-hour support delays
- **Set up containerized deployments** - Both backend (Python FastAPI) and WordPress now run in Docker containers on Northflank
- **Fixed database persistence** - Removed blocking UI spinners, implemented proper loading states with "Loading your prompt sessions from database..." message
- **Security improvements** - Removed WordPress files containing passwords from main Git repository, moved to separate private repo

### Technical Improvements
- Fixed Python buildpack detection by adding requirements.txt to repository root
- Updated numpy version from 1.24.3 to >=1.26.0 for Python 3.11 compatibility
- Added sentry-sdk[fastapi]==2.3.1 for error tracking
- Configured Northflank environment variables for database connections (NF_RAIBACH_DATA_* vars)
- Created MySQL 8.4 database on Northflank for WordPress hosting

### Repository Cleanup
- Created `testing/` folder to organize test scripts and backup files
- Moved all test*.py and test*.js files to testing directory
- Cleaned up root directory for professional presentation
- Maintained documentation in Storybook for client access

### WordPress Migration
- Created separate Git repository "interactive" for WordPress deployment
- Set up MySQL database with proper credentials
- Configured wp-config.php with environment variable support
- Added debug mode for troubleshooting database connections

### Frontend Improvements
- Added proper loading spinner during initial data fetch
- Fixed TypeScript compilation errors (conversationHistory vs conversationId)
- Improved error handling and user feedback

### Infrastructure Setup
- PostgreSQL for main application data
- MySQL 8.4 for WordPress
- Automated deployments via GitHub push
- Secret management via Northflank secret groups

### Status
- Backend: ✅ Running on Northflank
- Frontend: ✅ Deployed with loading states fixed
- WordPress: 🔄 Database import pending
- Documentation: ✅ Organized in Storybook

---

## 0.4.2 — 2026-07-17

### Fixed
- **AI section overwrite guard removed:** `AutoResizeTextarea` in `ResponsivePromptBuilder.tsx` (line 662) had a guard blocking non-empty textareas — AI XML tags (`<update_agent>`, `<update_user>`, etc.) could not overwrite existing content. Removed. AI now has full write access to all prompt sections.
- **DB connection pool exhaustion:** Pool max_conn increased from 15 → 25. Pool connection leaks traced — `conversation_api.py` methods now correctly return connections via `finally` blocks. Backend no longer 503s under concurrent save/load.
- **Storybook 404 on production:** `storybook-static/` never deployed to SiteGround. `deploy-prod.sh` updated with `build_storybook()` + `deploy_storybook()` functions. Storybook now live at `prompt-portal-prod.raibach.net/storybook/`.
- **Duplicate `projectId` line** in `LexicalEditor.tsx` causing esbuild parse error — removed duplicate.
- **Console agent cards category:** Hardcoded `"Agentic Flow"` — eliminated duplicate title rendering where `detectCategory()` was echoing the title.

### Added
- **Lexical Editor module extraction:** `grace-editor/frontend/src/editor/` — 10-file modular package. `MyStoryEditor.tsx` reduced from 5,336 → 5,029 lines. New `LexicalEditor` component with `useImperativeHandle` exposing 22 commands.
- **A2UI editor tag vocabulary:** 24 tags in `editor-commands.ts` — `load_tool`, `close_tool`, `set_content`, `format_text`, `format_block`, `format_align`, `format_font`, `clear_formatting`, `insert_table`, `insert_link`, `insert_horizontal_rule`, `insert_code_block`, `insert_image`, `undo`, `redo`, `toggle_code_view`, `toggle_lock`, `export`, `check_writing`, `apply_suggestion`, `dismiss_suggestion`, `start_dictation`, `stop_dictation`.
- **LexicalEditor wired into MiddleColumnSlot:** `activeTool` state swaps between `"output"` (default) and `"lexical-editor"`. AI sends `<load_tool name="lexical-editor"/>` → editor renders in third column. `<close_tool/>` returns to output view. `ai-command` event listener bridges A2UI tags to editor ref.
- **Editor plugins extracted:** `ContentTrackingPlugin`, `ClipboardPlugin`, `WordCountPlugin`, `EditorInstancePlugin`, `ClearSuggestionsPlugin` — all importable from `@/editor/plugins`.
- **`useEditorFormatting` hook:** 188-line hook extracting all formatText, formatBlock, formatAlign, undo/redo handlers from ToolbarPlugin.
- **`lexical-theme.ts`:** 68-line standalone Playground theme config.
- **Storybook Docs Editor prompt template:** System Role + User Role + Context (12 MDX file listings) + Constraints ready for app import.
- **`editor-commands.ts`:** Typed `EditorCommandProps` interface for all 24 tags.

### Changed
- `DatabasePoolManager.__init__` — `max_conn` now supports `DATABASE_POOL_MAX_CONN` env var override.
- `MiddleColumnSlot` — `InjectedContent` type extended with `{ type: "lexical-editor"; content?: string }`.
- `deploy-prod.sh` — added `--skip-storybook` flag.
- `LexicalEditor` component — accepts `children` prop rendered inside `LexicalComposer` for toolbar injection.

### Database
- No schema changes. Pool configuration only.

### Docs Updated
- `CHANGELOG.md` — this entry.
- **`GET /api/prompt-sessions` UUID crash:** Invalid `X-User-ID` header no longer causes 500 — returns empty array with UUID validation.
- **Two-click navigation bug:** `initialTab` now checks `window.location.pathname` so composer renders on first click from console.
- **Restart script:** Fixed `PROJECT_ROOT` path (was `scripts/` instead of project root). Frontend now uses `npm run dev` instead of raw `npx vite`.

### Changed
- **BrowserRouter** replaces HashRouter — clean URLs (`/prompts/{uuid}`), no `#/` hack.
- **Toast styling:** Light green background (`#e6f2ef`), centered, larger, opaque — no more white-on-white.
- **"Composer" button** in card area → labeled "Create New".
- **`isCreatingNewPromptRef`** dead code stripped — was written but never read.
- **`error-suppression.ts`** deleted — was globally overriding `console.error`/`console.warn`.
- **`systemDiagnostics.ts`** console overrides removed.
- All `.catch(() => {})` replaced with `console.error` or `Sentry.captureException`.
- **Sentry** now wired to all conversation operations with context tags.
- **`conversationStorage.ts`** switched from `errorLogger` (localStorage) to centralized `logger` → DebugPanel visibility.

### Database
- `prompt_sessions.project_id` column added (FK → `projects`)
- Index on `prompt_sessions.category`
- Duplicate `conversation_messages` indexes dropped
- UI tab tags inserted: `general`, `trace`, `tools`, `variables`

### Docs Updated
- `CHANGELOG.md` — this entry
- `grace_gui.py` — system prompt rewritten: AI identity as prompt engineering expert, XML tag instructions always appended, optimization advisor with action buttons

### Architecture — Section Governance Philosophy
Prompt sections are **not** prompt engineering orthodoxy. They are **governance controls** — a way for the user to track, monitor, and constrain the prompt. Design principles:
- **Blocks, not raw text.** Every section is a properly populated field with headers and controls the user can interact with — not markdown with asterisks and hashtags. Raw markdown is intimidating and non-deterministic.
- **Hardcoded interaction patterns.** Users can't do whatever they want with sections. Each section type has strict, deterministic controls. This is intentional — flexibility comes from section types, not freeform editing.
- **AI as expert, user as domain owner.** The AI decides which section type to use and what content belongs where. The user provides objectives and ideas. The AI structures them.
- **Tags are the interface.** The AI communicates with sections exclusively through XML tags (`<update_agent>`, `<add_role>`, etc.). No natural language descriptions — direct manipulation.

### Known Gap — AI Section Creation
AI-created sections via `<add_role>` use raw `innerHTML` DOM injection in `PromptWorkspace.tsx` (lines 65–90), not React `AutoResizeTextarea` components. This means AI-created sections lack proper controls, auto-resize, and React state integration. Migrating section creation to React state management is the next architectural priority.

## 0.4.0-alpha — 2026-07-14

### Added
- A2UI Control Surface plan — four-phase roadmap for AI-driven workspace
- Phase 1: Session-scoped conversations (`externalConversationId` auto-load)
- Phase 2: AI control tags (`<switch_tab>`, `<run_prompt/>`, `<show_version>`, `<eval_grounding>`)
- Section CRUD listeners (`add-prompt-role`, `remove-prompt-role`) in PromptWorkspace
- Grounding metrics panel in Trace tab (5 evaluation bars, drift warning, Healthy/Drifting toggle)
- Chat tab now defaults open with most recent conversation auto-loaded
- `api_core.py` — breaks circular imports between main.py and routers

### Fixed
- Production site: restored `index.html` and assets after deployment wipe
- Production backend: resolved circular imports in router files
- Router directory moved to correct location (`backend/routers/`)

### Changed
- Right column sidebar defaults to Chat tab (was Trace)
- `README.md` → `phases/README.md` as product package index
- Architecture docs consolidated under `READ-ME/`

## 0.3.0 — 2026-07-13

### Added
- Router split: `main.py` refactored into 8 router files
- Sentry AI monitoring integration
- Session handling and overlay UX improvements
- CI deploy order fix (assets first, index.html last)
