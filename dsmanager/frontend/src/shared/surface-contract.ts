/**
 * A2UI SURFACE CONTRACT — Single source of truth for React shell ↔ Lit surface boundary
 *
 * This file is the binding agent between three architectural layers:
 *
 *   Layer 1 — Lit Web Components (runtime Shadow DOM rendering)
 *     Each component declares its properties, slots, and events in its
 *     `static properties` block and `static styles` block. Those declarations
 *     are the *implementation truth*.
 *
 *   Layer 2 — Tag Registry (backend AI validation)
 *     `tag-registry.ts` holds Zod schemas that the Python backend uses to
 *     validate AI commands before DOM injection. Those schemas are the
 *     *validation truth*.
 *
 *   Layer 3 — React Shell (JSX attribute bindings)
 *     `WritingAreaIndex.tsx` passes state as HTML attributes (`is-ai-assembling`,
 *     `header-tab`) and React children as named slots. Those bindings are the
 *     *integration truth*.
 *
 * This file exports typed interfaces that ALL THREE layers import, ensuring
 * that a prop rename in a Lit component is caught at compile time everywhere.
 *
 * P6 — Created 2026-07-26 as part of the A2UI v0.9.1 Lit migration baseline.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Type Imports — Lit element classes for JSX ref typing
// ═══════════════════════════════════════════════════════════════════════════════

import type { AISurfaceSandbox } from '@/components/lit/ai-surface-sandbox';
import type { AgentCardElement } from '@/components/lit/agent-card-element';
import type { ChatNavigationBar, TabId } from '@/components/lit/chat-navigation-bar';
import type { StatusIndicator } from '@/components/lit/status-indicator';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ATTRIBUTE INTERFACES — What the React shell passes as HTML attributes
// ═══════════════════════════════════════════════════════════════════════════════

/** Attributes for <ai-surface-sandbox> — the structural viewport. */
export interface AiSurfaceSandboxAttrs {
  /** Lit Boolean: attribute present → true, absent → false. */
  'is-ai-assembling'?: '' | undefined;
  /** Controls which named slot is projected. */
  'header-tab'?: 'console' | 'composer' | 'evaluation' | 'variables' | 'metadata';
}

/** Attributes for <agent-card-element> — the four-slot console card. */
export interface AgentCardElementAttrs {
  id?: string;
  title?: string;
  category?: string;
  description?: string;
  username?: string;
  'team-name'?: string;
  version?: number;
  status?: string;
  likes?: number;
  'model-name'?: string;
  'last-used'?: string;
  'created-at'?: string;
  'avatar-url'?: string;
  'category-color'?: string;
  'category-title-color'?: string;
  'category-text-color'?: string;
}

/** Attributes for <chat-navigation-bar> — right-column tab bar + gripper. */
export interface ChatNavigationBarAttrs {
  'active-tab'?: TabId | '';
  collapsed?: 'true' | 'false';
}

/** Attributes for <status-indicator> — inline status dot. */
export interface StatusIndicatorAttrs {
  state?: 'idle' | 'loading' | 'success' | 'error' | 'warning';
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SLOT MAP — Named <slot> identifiers per component
// ═══════════════════════════════════════════════════════════════════════════════

/** Maps each Lit component tag to its declared named slot identifiers. */
export const SLOT_MAP: Record<string, readonly string[]> = {
  'ai-surface-sandbox': ['spinner', 'console', 'workspace'],
  'agent-card-element': [],   // no named slots — uses default slot for card content
  'chat-navigation-bar': ['logo'],
  'status-indicator': [],     // no named slots — uses default slot for message text
} as const;

/** Resolve the named slots for a given Lit component tag. */
export function resolveSlot(tag: string): readonly string[] {
  return SLOT_MAP[tag] ?? [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. COMPONENT MANIFEST — Registry of all Lit components in the repository
// ═══════════════════════════════════════════════════════════════════════════════

/** Status of a Lit component in the migration pipeline. */
export type MigrationStatus =
  | 'built'        // LitElement exists, compiles, not yet used in React shell
  | 'active'       // actively rendering in the React shell
  | 'planned'      // tag-registry schema exists, no LitElement yet
  ;

/** Single entry in the Lit component manifest. */
export interface LitComponentEntry {
  /** Custom element tag name (e.g. 'ai-surface-sandbox'). */
  tag: string;
  /** Source file relative to frontend/src. */
  file: string;
  /** Which A2UI surface this component belongs to. */
  surface: 'console' | 'composer' | 'both';
  /** Migration pipeline status. */
  status: MigrationStatus;
  /** Number of HTML attributes/properties. */
  propCount: number;
  /** Named slot identifiers. */
  slots: readonly string[];
  /** CustomEvent types emitted. */
  events: readonly string[];
}

/** Complete manifest of all Lit Web Components in the repository. */
export const LIT_COMPONENT_MANIFEST: readonly LitComponentEntry[] = [
  {
    tag: 'ai-surface-sandbox',
    file: 'components/lit/ai-surface-sandbox.ts',
    surface: 'both',
    status: 'active',
    propCount: 2,
    slots: SLOT_MAP['ai-surface-sandbox'],
    events: [],
  },
  {
    tag: 'agent-card-element',
    file: 'components/lit/agent-card-element.ts',
    surface: 'console',
    status: 'active',
    propCount: 16,
    slots: SLOT_MAP['agent-card-element'],
    events: [],
  },
  {
    tag: 'chat-navigation-bar',
    file: 'components/lit/chat-navigation-bar.ts',
    surface: 'both',
    status: 'active',
    propCount: 2,
    slots: SLOT_MAP['chat-navigation-bar'],
    events: ['tab-change', 'collapse-toggle', 'right-column-drag-start', 'right-column-drag-move', 'right-column-drag-end'],
  },
  {
    tag: 'status-indicator',
    file: 'components/lit/status-indicator.ts',
    surface: 'both',
    status: 'active',
    propCount: 2,
    slots: SLOT_MAP['status-indicator'],
    events: [],
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DERIVED EXPORTS — Programmatic accessors for tooling
// ═══════════════════════════════════════════════════════════════════════════════

/** All Lit custom element tag names (deduplicated). */
export const ALL_LIT_TAGS: readonly string[] =
  LIT_COMPONENT_MANIFEST.map(e => e.tag);

/** Lit components grouped by surface assignment. */
export const LIT_BY_SURFACE = {
  console: LIT_COMPONENT_MANIFEST.filter(e => e.surface === 'console' || e.surface === 'both'),
  composer: LIT_COMPONENT_MANIFEST.filter(e => e.surface === 'composer' || e.surface === 'both'),
} as const;

/** Lit components that are actively rendering in the React shell. */
export const ACTIVE_LIT_COMPONENTS: readonly LitComponentEntry[] =
  LIT_COMPONENT_MANIFEST.filter(e => e.status === 'active');

/** Lit components built but not yet wired into the React shell. */
export const PENDING_LIT_COMPONENTS: readonly LitComponentEntry[] =
  LIT_COMPONENT_MANIFEST.filter(e => e.status === 'built');

/** Resolve a Lit component entry by tag name. */
export function resolveComponent(tag: string): LitComponentEntry | undefined {
  return LIT_COMPONENT_MANIFEST.find(e => e.tag === tag);
}

/** Convert a Lit camelCase property name to its kebab-case HTML attribute name. */
export function resolveAttributeName(componentTag: string, propertyName: string): string {
  // Lit convention: camelCase → kebab-case
  // e.g. isAIAssembling → is-ai-assembling
  return propertyName.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. TYPE GUARDS — Runtime checks for tag validity
// ═══════════════════════════════════════════════════════════════════════════════

/** Check if a string is a registered Lit component tag name. */
export function isLitTag(tag: string): tag is typeof ALL_LIT_TAGS[number] {
  return (ALL_LIT_TAGS as readonly string[]).includes(tag);
}

/** Check if a slot name is valid for a given Lit component tag. */
export function isValidSlot(tag: string, slot: string): boolean {
  const entry = resolveComponent(tag);
  if (!entry) return false;
  return (entry.slots as readonly string[]).includes(slot);
}
