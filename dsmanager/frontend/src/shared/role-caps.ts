/**
 * ROLE-TO-CAPABILITY MATRIX — Single source of truth for multi-role access
 *
 * This file answers one question: "When a user with role X opens a prompt
 * package, what do they see and what can they do?"
 *
 * ──────────────────────────────────────────────────────────────────────────
 * TWO DIMENSIONS OF ACCESS
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 1. SESSION PERMISSIONS (session_permissions.role)
 *    Controls what you can DO with a specific prompt package.
 *    Values: owner | editor | viewer
 *    This is per-package — Agnes might be owner of accounting prompts
 *    but viewer on the design system prompts.
 *
 * 2. DEPARTMENTAL ROLE (users.prompt_role)
 *    Controls what you SEE — which tabs, which tools, which data views.
 *    Values: governance | ux-design | research | product | basic
 *    This is per-user — it follows you across all packages.
 *
 * Example: Agnes in Accounting has prompt_role='basic'. She opens a
 * prompt package where she's 'viewer'. She sees: the prompt content
 * (read-only), the chat tab. She does NOT see: trace, tools, cost data,
 * version history, governance metrics.
 *
 * Example: A Director has prompt_role='governance'. She opens the same
 * prompt package where she's 'viewer'. She sees: trace tab with cost
 * metrics, hallucination rates, change history, usage data. She does
 * NOT see: the prompt builder, the editor tools.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE FOUR DEPARTMENTAL PERSONAS (+ basic)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * GOVERNANCE — Corporate director, compliance officer, department head
 *   "How much did this prompt cost the company? What did Agnes change?
 *    Is the AI hallucinating? What's the ROI?"
 *   Sees: Cost per invocation, change history, hallucination rates,
 *         cross-departmental usage, data dignity ledger, audit logs.
 *   Does NOT see: The prompt builder. They're observing, not authoring.
 *
 * UX DESIGN — Design system manager, component librarian
 *   "How are the components performing? Which ones get used most?
 *    Is the design system being followed?"
 *   Sees: Component usage metrics, Figma spec compliance, A/B test
 *         results, design system library management tools.
 *   Uses: The tool to manage their design system components.
 *
 * RESEARCH — Researcher, analyst, synthesizer
 *   "I need to synthesize my discovery notes into a structured output.
 *    Can I query a different prompt and cross-reference?"
 *   Sees: Writing tools, research synthesis, training data quality,
 *         feedback patterns, export capabilities.
 *   Uses: The editor for synthesis work, with check-writing and export.
 *
 * PRODUCT — Product manager, product designer
 *   "I want to assemble wireframes using approved design system
 *    components and explore concepts for the business."
 *   Sees: Layout tools, wireframe assembly, ideation surface,
 *         version comparisons, compiled output.
 *   Uses: The full composer with layout-row/layout-col, prompt builder.
 *
 * BASIC — Agnes in Accounting, most users
 *   "I just need to run this prompt and get my answer."
 *   Sees: The prompt content (read-only if viewer), the chat tab.
 *   Does NOT see: Trace, tools, cost data, governance metrics.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HOW THIS FILE IS CONSUMED
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Frontend: InteractiveChatInterface.tsx reads the tab list to decide
 *   which tabs to render in <chat-navigation-bar>.
 *
 * Backend: role_caps.py reads the tag list to filter the AI manifest
 *   sent to the LLM. The AI literally cannot emit tags the user's role
 *   doesn't permit — they're not in the system prompt.
 *
 * Figma: This file is the specification for the persona-based design
 *   work. Each role's tab list and tag list defines what screens to
 *   design.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Departmental roles — stored in users.prompt_role, drives what you SEE */
export type DepartmentalRole =
  | 'governance'
  | 'ux-design'
  | 'research'
  | 'product'
  | 'basic';

/** Session-level permissions — stored in session_permissions.role, drives what you can DO */
export type SessionPermission = 'owner' | 'editor' | 'viewer';

/** Right-column tab IDs. Extends the existing TabId from chat-navigation-bar. */
export type CapabilityTab = 'chat' | 'trace' | 'tools' | 'evaluation' | 'variables' | 'metadata';

/** AI tag names from tag-registry.ts that the role is permitted to use. */
export type CapabilityTag = string;

/** Governance data tables the role is permitted to query. */
export type GovernanceTable =
  | 'grace_decisions'
  | 'grace_context'
  | 'grace_health_metrics'
  | 'audit_logs'
  | 'prompt_history'
  | 'prompt_versions'
  | 'prompt_feedback'
  | 'prompt_ratings'
  | 'usage_metrics'
  | 'memory_provenance'
  | 'data_dignity_ledger'
  | 'prompt_artifacts'
  | 'prompt_comments'
  | 'prompt_shares'
  | 'training_data'
  | 'figma_specs'
  | 'tag_definitions';

/** Complete capability set for a departmental role. */
export interface RoleCapability {
  /** Human-readable role name for UI labels */
  label: string;
  /** One-line description of who this role is */
  persona: string;
  /** The question this role asks when they open a prompt package */
  drivingQuestion: string;
  /** Tabs visible in the right-column navigation bar */
  tabs: CapabilityTab[];
  /** AI playground tags this role can emit (filtered manifest) */
  allowedTags: CapabilityTag[];
  /** Governance tables this role can query (row-level: session-scoped) */
  governanceTables: GovernanceTable[];
  /** Whether this role can author/edit prompt content */
  canAuthor: boolean;
  /** Whether this role sees cost/financial data */
  seesCostData: boolean;
  /** Whether this role sees AI decision traces (reasoning, confidence, overrides) */
  seesDecisionTrace: boolean;
  /** Whether this role sees hallucination/quality metrics */
  seesQualityMetrics: boolean;
  /** Whether this role sees cross-departmental usage patterns */
  seesCrossDepartmentalData: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE MATRIX
// ═══════════════════════════════════════════════════════════════════════════════

export const ROLE_CAPABILITIES: Record<DepartmentalRole, RoleCapability> = {
  // ── GOVERNANCE ──────────────────────────────────────────────────────────────
  governance: {
    label: 'Governance',
    persona: 'Corporate director, compliance officer, department head',
    drivingQuestion: 'How much did this prompt cost the company, and is the AI behaving safely?',
    tabs: ['trace', 'metadata'],
    allowedTags: [
      'version-trace',
      'status-indicator',
      'error-banner',
      'dynamic-button',
      // PLANNED (not yet in tag-registry):
      // 'cost-dashboard', 'audit-log-view', 'hallucination-report',
    ],
    governanceTables: [
      'grace_decisions',
      'grace_health_metrics',
      'audit_logs',
      'usage_metrics',
      'data_dignity_ledger',
      'prompt_history',
      'memory_provenance',
    ],
    canAuthor: false,
    seesCostData: true,
    seesDecisionTrace: true,
    seesQualityMetrics: true,
    seesCrossDepartmentalData: true,
  },

  // ── UX DESIGN ───────────────────────────────────────────────────────────────
  'ux-design': {
    label: 'UX Design',
    persona: 'Design system manager, component librarian',
    drivingQuestion: 'How are the components performing, and is the design system being followed?',
    tabs: ['chat', 'trace', 'tools', 'variables'],
    allowedTags: [
      'prompt-section-editor',
      'compiled-output-viewer',
      'workspace-layout',
      'toggle_code_view',
      'output-panel',
      'version-trace',
      'status-indicator',
      'error-banner',
      'dynamic-button',
      // PLANNED:
      // 'figma-spec', 'component-catalog', 'ab-test-result',
    ],
    governanceTables: [
      'prompt_versions',
      'prompt_artifacts',
      'prompt_feedback',
      'prompt_ratings',
      'figma_specs',
      'tag_definitions',
    ],
    canAuthor: true,
    seesCostData: false,
    seesDecisionTrace: false,
    seesQualityMetrics: true,
    seesCrossDepartmentalData: false,
  },

  // ── RESEARCH ────────────────────────────────────────────────────────────────
  research: {
    label: 'Research',
    persona: 'Researcher, analyst, synthesizer',
    drivingQuestion: 'Can I synthesize my discovery notes and cross-reference other prompts?',
    tabs: ['chat', 'trace', 'evaluation'],
    allowedTags: [
      'load_tool',
      'close_tool',
      'set_content',
      'insert_text',
      'append_text',
      'format_text',
      'format_block',
      'format_align',
      'format_font',
      'clear_formatting',
      'insert_table',
      'insert_link',
      'insert_horizontal_rule',
      'insert_code_block',
      'insert_image',
      'undo',
      'redo',
      'toggle_code_view',
      'toggle_lock',
      'export',
      'check_writing',
      'apply_suggestion',
      'dismiss_suggestion',
      'start_dictation',
      'stop_dictation',
      'status-indicator',
      'error-banner',
      'dynamic-button',
    ],
    governanceTables: [
      'training_data',
      'prompt_feedback',
      'prompt_comments',
      'prompt_versions',
    ],
    canAuthor: true,
    seesCostData: false,
    seesDecisionTrace: false,
    seesQualityMetrics: true,
    seesCrossDepartmentalData: false,
  },

  // ── PRODUCT ─────────────────────────────────────────────────────────────────
  product: {
    label: 'Product',
    persona: 'Product manager, product designer',
    drivingQuestion: 'Can I assemble wireframes using approved design system components for ideation?',
    tabs: ['chat', 'trace', 'tools'],
    allowedTags: [
      'prompt-section',
      'save-button',
      'run-button',
      'output-panel',
      'version-trace',
      'layout-row',
      'layout-col',
      'prompt-section-editor',
      'compiled-output-viewer',
      'workspace-layout',
      'chat-panel',
      'status-indicator',
      'error-banner',
      'dynamic-button',
    ],
    governanceTables: [
      'prompt_versions',
      'prompt_artifacts',
      'prompt_feedback',
      'prompt_ratings',
      'prompt_history',
    ],
    canAuthor: true,
    seesCostData: false,
    seesDecisionTrace: true,
    seesQualityMetrics: false,
    seesCrossDepartmentalData: false,
  },

  // ── BASIC ───────────────────────────────────────────────────────────────────
  basic: {
    label: 'User',
    persona: 'Agnes in Accounting — most users who just run the prompt',
    drivingQuestion: 'I just need to run this prompt and get my answer.',
    tabs: ['chat'],
    allowedTags: [
      'chat-panel',
      'status-indicator',
      'error-banner',
    ],
    governanceTables: [],
    canAuthor: false,
    seesCostData: false,
    seesDecisionTrace: false,
    seesQualityMetrics: false,
    seesCrossDepartmentalData: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESSORS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get the capability set for a departmental role. Falls back to 'basic'. */
export function getRoleCapabilities(role: string | null | undefined): RoleCapability {
  if (role && role in ROLE_CAPABILITIES) {
    return ROLE_CAPABILITIES[role as DepartmentalRole];
  }
  return ROLE_CAPABILITIES.basic;
}

/** Get the list of visible tabs for a role. */
export function getTabsForRole(role: string | null | undefined): CapabilityTab[] {
  return getRoleCapabilities(role).tabs;
}

/** Get the list of allowed AI tags for a role. */
export function getTagsForRole(role: string | null | undefined): CapabilityTag[] {
  return getRoleCapabilities(role).allowedTags;
}

/** Check if a role can see a specific tab. */
export function roleCanSeeTab(role: string | null | undefined, tab: CapabilityTab): boolean {
  return getTabsForRole(role).includes(tab);
}

/** Check if a role can use a specific AI tag. */
export function roleCanUseTag(role: string | null | undefined, tag: string): boolean {
  return getTagsForRole(role).includes(tag);
}

/** Check if a role can author/edit prompt content. */
export function roleCanAuthor(role: string | null | undefined): boolean {
  return getRoleCapabilities(role).canAuthor;
}

/** All valid departmental roles (for UI dropdowns, validation, etc.) */
export const ALL_DEPARTMENTAL_ROLES: DepartmentalRole[] = [
  'governance',
  'ux-design',
  'research',
  'product',
  'basic',
];

/**
 * Export the full matrix as JSON for the Python backend.
 * The backend calls getRoleManifest() to get the same data without
 * duplicating the mapping in Python.
 */
export function getRoleManifest(): string {
  return JSON.stringify(ROLE_CAPABILITIES, null, 2);
}
