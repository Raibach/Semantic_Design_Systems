import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// A2UI TAG REGISTRY — Single source of truth for AI-addressable components
//
// Every component the AI can emit, modify, or query must be registered here.
// The registry serves three purposes:
//   1. Type-safe validation of AI commands before DOM injection (Gatekeeper)
//   2. JSON manifest export for the Python backend's system prompt
//   3. Audit trail — every tag interaction is logged with this schema
//
// Do NOT add props or events the AI shouldn't touch.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Base schema shared by all registry entries ────────────────────────────────
export const RegistryMetaSchema = z.object({
  tag: z.string(),
  surface: z.enum(['console', 'composer', 'both']),
  column: z.enum(['left', 'middle', 'right', 'console']).optional(),
  description: z.string(),
  constraints: z.array(z.string()).optional(),
});

export type RegistryMeta = z.infer<typeof RegistryMetaSchema>;

// ── COMPOSER — Left Column (Prompt Builder) ──────────────────────────────────

export const PromptSectionSchema = z.object({
  tag: z.literal('prompt-section'),
  props: z.object({
    type: z.enum(['system-role', 'user-role', 'tool-call', 'few-shot', 'constraints']),
    content: z.string(),
    order: z.number(),
    state: z.enum(['idle', 'editing', 'saving', 'error']).default('idle'),
  }),
  events: z.tuple([
    z.literal('section-update'),
    z.literal('section-remove'),
    z.literal('section-reorder'),
  ]),
  surface: z.literal('composer'),
  column: z.literal('left'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const SaveButtonSchema = z.object({
  tag: z.literal('save-button'),
  props: z.object({
    state: z.enum(['idle', 'saving', 'saved', 'error']).default('idle'),
    label: z.string().default('Save'),
  }),
  events: z.tuple([z.literal('save-click')]),
  surface: z.literal('composer'),
  column: z.literal('left'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const RunButtonSchema = z.object({
  tag: z.literal('run-button'),
  props: z.object({
    state: z.enum(['idle', 'running', 'complete', 'error']).default('idle'),
    label: z.string().default('Run'),
  }),
  events: z.tuple([z.literal('run-click')]),
  surface: z.literal('composer'),
  column: z.literal('left'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── COMPOSER — Middle Column (Output & Trace) ────────────────────────────────

export const OutputPanelSchema = z.object({
  tag: z.literal('output-panel'),
  props: z.object({
    content: z.string(),
    status: z.enum(['empty', 'streaming', 'complete', 'error']).default('empty'),
    model: z.string().optional(),
    tokens: z.number().optional(),
  }),
  events: z.tuple([z.literal('copy-output')]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const VersionTraceSchema = z.object({
  tag: z.literal('version-trace'),
  props: z.object({
    sessionId: z.string().uuid(),
    activeVersion: z.number().optional(),
    versions: z.array(z.object({
      version: z.number(),
      timestamp: z.string(),
      summary: z.string(),
    })).optional(),
  }),
  events: z.tuple([z.literal('version-select'), z.literal('version-compare')]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const LayoutRowSchema = z.object({
  tag: z.literal('layout-row'),
  props: z.object({
    gap: z.number().default(16),
    align: z.enum(['start', 'center', 'end', 'stretch']).default('start'),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const LayoutColSchema = z.object({
  tag: z.literal('layout-col'),
  props: z.object({
    gap: z.number().default(16),
    align: z.enum(['start', 'center', 'end', 'stretch']).default('start'),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── COMPOSER — Right Column (Chat) ───────────────────────────────────────────

export const ChatPanelSchema = z.object({
  tag: z.literal('chat-panel'),
  props: z.object({
    conversationId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    state: z.enum(['idle', 'streaming', 'error']).default('idle'),
  }),
  events: z.tuple([z.literal('message-sent'), z.literal('command-received')]),
  surface: z.literal('both'),
  column: z.literal('right'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── CONSOLE — Homepage Grid ──────────────────────────────────────────────────

export const AgentCardSchema = z.object({
  tag: z.literal('agent-card'),
  props: z.object({
    id: z.string().uuid(),
    title: z.string(),
    category: z.string().optional(),
    status: z.enum(['active', 'archived', 'draft']).default('active'),
    version: z.number().default(1),
    likes: z.number().default(0),
    state: z.enum(['idle', 'loading', 'error']).default('idle'),
  }),
  events: z.tuple([z.literal('card-open'), z.literal('card-delete'), z.literal('card-archive')]),
  surface: z.literal('console'),
  column: z.literal('console'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const FeaturedCardSchema = z.object({
  tag: z.literal('featured-card'),
  props: z.object({
    subtitle: z.string(),
    headline: z.string(),
    teamHandle: z.string().optional(),
    teamName: z.string().optional(),
  }),
  events: z.tuple([z.literal('featured-click')]),
  surface: z.literal('console'),
  column: z.literal('console'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const FilterPillSchema = z.object({
  tag: z.literal('filter-pill'),
  props: z.object({
    category: z.string(),
    label: z.string(),
    active: z.boolean().default(false),
  }),
  events: z.tuple([z.literal('filter-toggle')]),
  surface: z.literal('console'),
  column: z.literal('console'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const SearchBarSchema = z.object({
  tag: z.literal('search-bar'),
  props: z.object({
    placeholder: z.string().default('Search…'),
    value: z.string().default(''),
    state: z.enum(['idle', 'searching', 'complete']).default('idle'),
  }),
  events: z.tuple([z.literal('search-change'), z.literal('search-submit')]),
  surface: z.literal('console'),
  column: z.literal('console'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── UNIVERSAL — Any Column/Surface ───────────────────────────────────────────

export const StatusIndicatorSchema = z.object({
  tag: z.literal('status-indicator'),
  props: z.object({
    state: z.enum(['idle', 'loading', 'success', 'error', 'warning']),
    message: z.string().optional(),
  }),
  events: z.tuple([]),
  surface: z.literal('both'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const ErrorBannerSchema = z.object({
  tag: z.literal('error-banner'),
  props: z.object({
    code: z.string().optional(),
    message: z.string(),
    retry: z.boolean().default(false),
  }),
  events: z.tuple([z.literal('error-dismiss'), z.literal('error-retry')]),
  surface: z.literal('both'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── STRUCTURAL — Sandbox Viewport (P5: registered 2026-07-26) ───────────────

export const AiSurfaceSandboxSchema = z.object({
  tag: z.literal('ai-surface-sandbox'),
  props: z.object({
    'is-ai-assembling': z.boolean().default(false),
    'header-tab': z.enum(['console', 'composer', 'evaluation', 'variables', 'metadata']).default('console'),
  }),
  events: z.tuple([]),
  surface: z.literal('both'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const DynamicButtonSchema = z.object({
  tag: z.literal('dynamic-button'),
  props: z.object({
    label: z.string(),
    action: z.string(),
    variant: z.enum(['primary', 'secondary', 'danger', 'ghost']).default('primary'),
    state: z.enum(['idle', 'loading', 'success', 'error']).default('idle'),
    disabled: z.boolean().default(false),
  }),
  events: z.tuple([z.literal('button-click')]),
  surface: z.literal('both'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── COMPOSER — Middle Column — Lexical Editor Tool ──────────────────────────

export const LoadToolSchema = z.object({
  tag: z.literal('load_tool'),
  props: z.object({
    name: z.enum(['lexical-editor']),
    content: z.string().optional(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const CloseToolSchema = z.object({
  tag: z.literal('close_tool'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── Editor Content Tags ─────────────────────────────────────────────────────

export const SetContentSchema = z.object({
  tag: z.literal('set_content'),
  props: z.object({
    content: z.string(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const InsertTextSchema = z.object({
  tag: z.literal('insert_text'),
  props: z.object({
    text: z.string(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const AppendTextSchema = z.object({
  tag: z.literal('append_text'),
  props: z.object({
    text: z.string(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── Editor Formatting Tags ──────────────────────────────────────────────────

export const FormatTextSchema = z.object({
  tag: z.literal('format_text'),
  props: z.object({
    type: z.enum(['bold', 'italic', 'underline', 'strikethrough', 'code']),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const FormatBlockSchema = z.object({
  tag: z.literal('format_block'),
  props: z.object({
    type: z.enum(['h1', 'h2', 'h3', 'paragraph', 'quote', 'code', 'ul', 'ol', 'checklist']),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const FormatAlignSchema = z.object({
  tag: z.literal('format_align'),
  props: z.object({
    type: z.enum(['left', 'center', 'right', 'justify']),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const FormatFontSchema = z.object({
  tag: z.literal('format_font'),
  props: z.object({
    family: z.string().optional(),
    size: z.string().optional(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const ClearFormattingSchema = z.object({
  tag: z.literal('clear_formatting'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── Editor Insert Tags ──────────────────────────────────────────────────────

export const InsertTableSchema = z.object({
  tag: z.literal('insert_table'),
  props: z.object({
    rows: z.coerce.number().default(3),
    cols: z.coerce.number().default(3),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const InsertLinkSchema = z.object({
  tag: z.literal('insert_link'),
  props: z.object({
    url: z.string(),
    text: z.string().optional(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const InsertHorizontalRuleSchema = z.object({
  tag: z.literal('insert_horizontal_rule'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const InsertCodeBlockSchema = z.object({
  tag: z.literal('insert_code_block'),
  props: z.object({
    language: z.string().optional(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const InsertImageSchema = z.object({
  tag: z.literal('insert_image'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── Editor Navigation Tags ──────────────────────────────────────────────────

export const UndoSchema = z.object({
  tag: z.literal('undo'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const RedoSchema = z.object({
  tag: z.literal('redo'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── Editor View Control Tags ────────────────────────────────────────────────

export const ToggleCodeViewSchema = z.object({
  tag: z.literal('toggle_code_view'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const ToggleLockSchema = z.object({
  tag: z.literal('toggle_lock'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const ExportDocSchema = z.object({
  tag: z.literal('export'),
  props: z.object({
    format: z.enum(['markdown', 'html', 'text']).default('markdown'),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── Editor AI-Assisted Tags ─────────────────────────────────────────────────

export const CheckWritingSchema = z.object({
  tag: z.literal('check_writing'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const ApplySuggestionSchema = z.object({
  tag: z.literal('apply_suggestion'),
  props: z.object({
    id: z.string(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const DismissSuggestionSchema = z.object({
  tag: z.literal('dismiss_suggestion'),
  props: z.object({
    id: z.string(),
  }),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ── Editor Speech Tags ──────────────────────────────────────────────────────

export const StartDictationSchema = z.object({
  tag: z.literal('start_dictation'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

export const StopDictationSchema = z.object({
  tag: z.literal('stop_dictation'),
  props: z.object({}),
  events: z.tuple([]),
  surface: z.literal('composer'),
  column: z.literal('middle'),
  description: z.string(),
  constraints: z.array(z.string()),
});

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY — Master map of every AI-addressable tag
// ═══════════════════════════════════════════════════════════════════════════════

export const TAG_REGISTRY = {
  // Composer — Left Column
  'prompt-section': {
    tag: 'prompt-section',
    surface: 'composer',
    column: 'left',
    description: 'A prompt builder section — System Role, User Role, Tool Call, Few Shot, or Constraints.',
    props: {
      type: { type: 'enum', values: ['system-role', 'user-role', 'tool-call', 'few-shot', 'constraints'] },
      content: { type: 'string' },
      order: { type: 'number' },
      state: { type: 'enum', values: ['idle', 'editing', 'saving', 'error'], default: 'idle' },
    },
    events: ['section-update', 'section-remove', 'section-reorder'],
    constraints: ['type=system-role is required before Run'],
  },
  'save-button': {
    tag: 'save-button',
    surface: 'composer',
    column: 'left',
    description: 'Save the current prompt session as a new version.',
    props: {
      state: { type: 'enum', values: ['idle', 'saving', 'saved', 'error'], default: 'idle' },
      label: { type: 'string', default: 'Save' },
    },
    events: ['save-click'],
    constraints: ['cannot save while Run is in progress'],
  },
  'run-button': {
    tag: 'run-button',
    surface: 'composer',
    column: 'left',
    description: 'Execute the prompt pipeline and stream output.',
    props: {
      state: { type: 'enum', values: ['idle', 'running', 'complete', 'error'], default: 'idle' },
      label: { type: 'string', default: 'Run' },
    },
    events: ['run-click'],
    constraints: ['system-role section must exist before Run'],
  },

  // Composer — Middle Column
  'output-panel': {
    tag: 'output-panel',
    surface: 'composer',
    column: 'middle',
    description: 'Displays compiled/streamed output from the Run pipeline.',
    props: {
      content: { type: 'string' },
      status: { type: 'enum', values: ['empty', 'streaming', 'complete', 'error'], default: 'empty' },
      model: { type: 'string', optional: true },
      tokens: { type: 'number', optional: true },
    },
    events: ['copy-output'],
    constraints: [],
  },
  'version-trace': {
    tag: 'version-trace',
    surface: 'composer',
    column: 'middle',
    description: 'Version timeline and audit trail for the session.',
    props: {
      sessionId: { type: 'string', format: 'uuid' },
      activeVersion: { type: 'number', optional: true },
    },
    events: ['version-select', 'version-compare'],
    constraints: ['sessionId must match current session'],
  },
  'layout-row': {
    tag: 'layout-row',
    surface: 'composer',
    column: 'middle',
    description: 'Horizontal flex container for AI-assembled layouts.',
    props: {
      gap: { type: 'number', default: 16 },
      align: { type: 'enum', values: ['start', 'center', 'end', 'stretch'], default: 'start' },
    },
    events: [],
    constraints: ['only allowed inside AiManagedContainer'],
  },
  'layout-col': {
    tag: 'layout-col',
    surface: 'composer',
    column: 'middle',
    description: 'Vertical flex container for AI-assembled layouts.',
    props: {
      gap: { type: 'number', default: 16 },
      align: { type: 'enum', values: ['start', 'center', 'end', 'stretch'], default: 'start' },
    },
    events: [],
    constraints: ['only allowed inside AiManagedContainer'],
  },

  // Composer — Right Column / Both
  'chat-panel': {
    tag: 'chat-panel',
    surface: 'both',
    column: 'right',
    description: 'AI conversation interface. Shared between Console and Composer.',
    props: {
      conversationId: { type: 'string', format: 'uuid', optional: true },
      sessionId: { type: 'string', format: 'uuid', optional: true },
      state: { type: 'enum', values: ['idle', 'streaming', 'error'], default: 'idle' },
    },
    events: ['message-sent', 'command-received'],
    constraints: [],
  },

  // Console — Homepage Grid
  'agent-card': {
    tag: 'agent-card',
    surface: 'console',
    column: 'console',
    description: 'A prompt session card in the console grid.',
    props: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      category: { type: 'string', optional: true },
      status: { type: 'enum', values: ['active', 'archived', 'draft'], default: 'active' },
      version: { type: 'number', default: 1 },
      likes: { type: 'number', default: 0 },
      state: { type: 'enum', values: ['idle', 'loading', 'error'], default: 'idle' },
    },
    events: ['card-open', 'card-delete', 'card-archive'],
    constraints: ['id must be a valid session UUID'],
  },
  'featured-card': {
    tag: 'featured-card',
    surface: 'console',
    column: 'console',
    description: 'Hero/featured card at the top of the console grid.',
    props: {
      subtitle: { type: 'string' },
      headline: { type: 'string' },
      teamHandle: { type: 'string', optional: true },
      teamName: { type: 'string', optional: true },
    },
    events: ['featured-click'],
    constraints: [],
  },
  'filter-pill': {
    tag: 'filter-pill',
    surface: 'console',
    column: 'console',
    description: 'A toggleable filter pill in the console toolbar.',
    props: {
      category: { type: 'string' },
      label: { type: 'string' },
      active: { type: 'boolean', default: false },
    },
    events: ['filter-toggle'],
    constraints: [],
  },
  'search-bar': {
    tag: 'search-bar',
    surface: 'console',
    column: 'console',
    description: 'Text search input for filtering console cards.',
    props: {
      placeholder: { type: 'string', default: 'Search…' },
      value: { type: 'string', default: '' },
      state: { type: 'enum', values: ['idle', 'searching', 'complete'], default: 'idle' },
    },
    events: ['search-change', 'search-submit'],
    constraints: [],
  },

  // Structural — Sandbox Viewport
  'ai-surface-sandbox': {
    tag: 'ai-surface-sandbox',
    surface: 'both',
    description: 'Shadow DOM-isolated A2UI rendering sandbox. Structural viewport that wraps console/composer content. AI must NOT render child components outside the named slots.',
    props: {
      'is-ai-assembling': { type: 'boolean', default: false },
      'header-tab': { type: 'enum', values: ['console', 'composer', 'evaluation', 'variables', 'metadata'], default: 'console' },
    },
    events: [],
    constraints: [
      'AI must not render child components outside named slots',
      'Only one slot is visible at a time — controlled by is-ai-assembling and header-tab',
      'Named slots: spinner, console, workspace',
    ],
  },

  // Universal
  'status-indicator': {
    tag: 'status-indicator',
    surface: 'both',
    description: 'Inline status dot/badge — loading, success, error, warning.',
    props: {
      state: { type: 'enum', values: ['idle', 'loading', 'success', 'error', 'warning'] },
      message: { type: 'string', optional: true },
    },
    events: [],
    constraints: [],
  },
  'error-banner': {
    tag: 'error-banner',
    surface: 'both',
    description: 'Inline error banner with optional retry.',
    props: {
      code: { type: 'string', optional: true },
      message: { type: 'string' },
      retry: { type: 'boolean', default: false },
    },
    events: ['error-dismiss', 'error-retry'],
    constraints: [],
  },
  'dynamic-button': {
    tag: 'dynamic-button',
    surface: 'both',
    description: 'AI-generated action button. Label, action, and variant set by AI.',
    props: {
      label: { type: 'string' },
      action: { type: 'string' },
      variant: { type: 'enum', values: ['primary', 'secondary', 'danger', 'ghost'], default: 'primary' },
      state: { type: 'enum', values: ['idle', 'loading', 'success', 'error'], default: 'idle' },
      disabled: { type: 'boolean', default: false },
    },
    events: ['button-click'],
    constraints: ['action must be a registered command'],
  },

  // ── Lexical Editor — Lifecycle ───────────────────────────────────────────
  'load_tool': {
    tag: 'load_tool',
    surface: 'composer',
    column: 'middle',
    description: 'Load a tool into the third column. Currently supports lexical-editor.',
    props: {
      name: { type: 'enum', values: ['lexical-editor'] },
      content: { type: 'string', optional: true },
    },
    events: [],
    constraints: ['name must be a registered tool'],
  },
  'close_tool': {
    tag: 'close_tool',
    surface: 'composer',
    column: 'middle',
    description: 'Close the active tool and return to output view.',
    props: {},
    events: [],
    constraints: [],
  },

  // ── Lexical Editor — Content ─────────────────────────────────────────────
  'set_content': {
    tag: 'set_content',
    surface: 'composer',
    column: 'middle',
    description: 'Replace the entire editor content with new text.',
    props: {
      content: { type: 'string' },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'insert_text': {
    tag: 'insert_text',
    surface: 'composer',
    column: 'middle',
    description: 'Insert text at the current cursor position.',
    props: {
      text: { type: 'string' },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'append_text': {
    tag: 'append_text',
    surface: 'composer',
    column: 'middle',
    description: 'Append text to the end of the document.',
    props: {
      text: { type: 'string' },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },

  // ── Lexical Editor — Formatting ──────────────────────────────────────────
  'format_text': {
    tag: 'format_text',
    surface: 'composer',
    column: 'middle',
    description: 'Apply inline text formatting to selection.',
    props: {
      type: { type: 'enum', values: ['bold', 'italic', 'underline', 'strikethrough', 'code'] },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'format_block': {
    tag: 'format_block',
    surface: 'composer',
    column: 'middle',
    description: 'Convert the current block to a heading, paragraph, quote, code block, or list.',
    props: {
      type: { type: 'enum', values: ['h1', 'h2', 'h3', 'paragraph', 'quote', 'code', 'ul', 'ol', 'checklist'] },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'format_align': {
    tag: 'format_align',
    surface: 'composer',
    column: 'middle',
    description: 'Set text alignment.',
    props: {
      type: { type: 'enum', values: ['left', 'center', 'right', 'justify'] },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'format_font': {
    tag: 'format_font',
    surface: 'composer',
    column: 'middle',
    description: 'Change font family or size.',
    props: {
      family: { type: 'string', optional: true },
      size: { type: 'string', optional: true },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'clear_formatting': {
    tag: 'clear_formatting',
    surface: 'composer',
    column: 'middle',
    description: 'Remove all formatting from the current selection.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },

  // ── Lexical Editor — Insert ──────────────────────────────────────────────
  'insert_table': {
    tag: 'insert_table',
    surface: 'composer',
    column: 'middle',
    description: 'Insert a table with the specified rows and columns.',
    props: {
      rows: { type: 'number', default: 3 },
      cols: { type: 'number', default: 3 },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'insert_link': {
    tag: 'insert_link',
    surface: 'composer',
    column: 'middle',
    description: 'Insert a hyperlink.',
    props: {
      url: { type: 'string' },
      text: { type: 'string', optional: true },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'insert_horizontal_rule': {
    tag: 'insert_horizontal_rule',
    surface: 'composer',
    column: 'middle',
    description: 'Insert a horizontal divider line.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'insert_code_block': {
    tag: 'insert_code_block',
    surface: 'composer',
    column: 'middle',
    description: 'Insert a syntax-highlighted code block.',
    props: {
      language: { type: 'string', optional: true },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'insert_image': {
    tag: 'insert_image',
    surface: 'composer',
    column: 'middle',
    description: 'Trigger image upload dialog.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },

  // ── Lexical Editor — Navigation ──────────────────────────────────────────
  'undo': {
    tag: 'undo',
    surface: 'composer',
    column: 'middle',
    description: 'Undo the last edit.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'redo': {
    tag: 'redo',
    surface: 'composer',
    column: 'middle',
    description: 'Redo the last undone edit.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },

  // ── Lexical Editor — View Control ────────────────────────────────────────
  'toggle_code_view': {
    tag: 'toggle_code_view',
    surface: 'composer',
    column: 'middle',
    description: 'Toggle between rich text and code view.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'toggle_lock': {
    tag: 'toggle_lock',
    surface: 'composer',
    column: 'middle',
    description: 'Toggle editor read-only lock.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'export': {
    tag: 'export',
    surface: 'composer',
    column: 'middle',
    description: 'Export document in the specified format.',
    props: {
      format: { type: 'enum', values: ['markdown', 'html', 'text'], default: 'markdown' },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },

  // ── Lexical Editor — AI-Assisted ─────────────────────────────────────────
  'check_writing': {
    tag: 'check_writing',
    surface: 'composer',
    column: 'middle',
    description: 'Run grammar and style check on the document.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'apply_suggestion': {
    tag: 'apply_suggestion',
    surface: 'composer',
    column: 'middle',
    description: 'Accept a writing suggestion by ID.',
    props: {
      id: { type: 'string' },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'dismiss_suggestion': {
    tag: 'dismiss_suggestion',
    surface: 'composer',
    column: 'middle',
    description: 'Reject a writing suggestion by ID.',
    props: {
      id: { type: 'string' },
    },
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },

  // ── Lexical Editor — Speech ──────────────────────────────────────────────
  'start_dictation': {
    tag: 'start_dictation',
    surface: 'composer',
    column: 'middle',
    description: 'Start speech-to-text dictation.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
  'stop_dictation': {
    tag: 'stop_dictation',
    surface: 'composer',
    column: 'middle',
    description: 'Stop speech-to-text dictation.',
    props: {},
    events: [],
    constraints: ['requires lexical-editor to be loaded'],
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// DERIVED TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type TagName = keyof typeof TAG_REGISTRY;
export type TagEntry = (typeof TAG_REGISTRY)[TagName];

/** Tags the AI is permitted to emit inside the island (composer surface) */
export const AI_PLAYGROUND_TAGS: TagName[] = [
  // Composer — Left Column
  'prompt-section',
  'save-button',
  'run-button',
  // Composer — Middle Column
  'output-panel',
  'version-trace',
  'layout-row',
  'layout-col',
  // Lexical Editor — Lifecycle
  'load_tool',
  'close_tool',
  // Lexical Editor — Content
  'set_content',
  'insert_text',
  'append_text',
  // Lexical Editor — Formatting
  'format_text',
  'format_block',
  'format_align',
  'format_font',
  'clear_formatting',
  // Lexical Editor — Insert
  'insert_table',
  'insert_link',
  'insert_horizontal_rule',
  'insert_code_block',
  'insert_image',
  // Lexical Editor — Navigation
  'undo',
  'redo',
  // Lexical Editor — View Control
  'toggle_code_view',
  'toggle_lock',
  'export',
  // Lexical Editor — AI-Assisted
  'check_writing',
  'apply_suggestion',
  'dismiss_suggestion',
  // Lexical Editor — Speech
  'start_dictation',
  'stop_dictation',
  // Shared
  'chat-panel',
  'status-indicator',
  'error-banner',
  'dynamic-button',
];

/** Tags belonging to the shell — AI must never touch these */
export const SHELL_TAGS: TagName[] = [
  'ai-surface-sandbox',  // P5: structural viewport — React shell owns this frame
  'agent-card',
  'featured-card',
  'filter-pill',
  'search-bar',
];

/** Tags shared between both surfaces */
export const SHARED_TAGS: TagName[] = [
  'chat-panel',
  'status-indicator',
  'error-banner',
  'dynamic-button',
];

// ═══════════════════════════════════════════════════════════════════════════════
// JSON MANIFEST — for Python backend / AI system prompt
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the full tag registry as a JSON manifest string.
 * The Python backend loads this to include in the AI's system prompt.
 */
export function getTagManifest(): string {
  return JSON.stringify(TAG_REGISTRY, null, 2);
}

/**
 * Returns only the AI playground tags as a JSON manifest.
 * This is the subset the AI is actually allowed to emit.
 */
export function getAiPlaygroundManifest(): string {
  const playground: Record<string, unknown> = {};
  for (const tag of AI_PLAYGROUND_TAGS) {
    playground[tag] = TAG_REGISTRY[tag];
  }
  return JSON.stringify(playground, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GATEKEEPER — validates AI commands before DOM injection
// ═══════════════════════════════════════════════════════════════════════════════

export interface AiCommand {
  sessionId: string;
  command: string;
  tag: string;
  props?: Record<string, unknown>;
  timestamp: string;
}

export interface GatekeeperResult {
  valid: boolean;
  tag?: TagName;
  error?: string;
}

/**
 * Validates an AI-emitted command against the registry.
 * Returns { valid: true, tag } on success, or { valid: false, error } on failure.
 */
export function validateTag(command: AiCommand): GatekeeperResult {
  const tagName = command.tag as TagName;

  if (!(tagName in TAG_REGISTRY)) {
    return { valid: false, error: `Unknown tag: "${command.tag}". Not in registry.` };
  }

  if (!AI_PLAYGROUND_TAGS.includes(tagName)) {
    return {
      valid: false,
      error: `Tag "${command.tag}" is a shell component. AI cannot manipulate shell elements.`,
    };
  }

  const entry = TAG_REGISTRY[tagName];

  // Validate required props exist
  if (command.props) {
    for (const [key, def] of Object.entries(entry.props)) {
      const propDef = def as { type: string; optional?: boolean };
      if (!propDef.optional && !(key in command.props)) {
        return {
          valid: false,
          error: `Missing required prop "${key}" for tag "${command.tag}".`,
        };
      }
    }
  }

  return { valid: true, tag: tagName };
}
