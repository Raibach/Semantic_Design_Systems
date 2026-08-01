/**
 * <ai-surface-sandbox> — Lit A2UI Web Component
 *
 * Port of the React AISurfaceSandbox into a Shadow DOM-isolated Lit element.
 * Provides a rigid, visually bounded rendering surface where Grace (the AI
 * agent) assembles and renders A2UI content. Strictly separated from the
 * Operator Shell (sidebar, header, chat panel) per 2UI architecture.
 *
 * Structural guarantees (verified via Playwright 2026-07-26):
 *   - :host applies flex: 1 1 0% + min-height: 0 as the flex child anchor
 *     in the parent flex row — the exact same role the React <section> played.
 *   - #ai-surface uses CSS contain: layout style as the visual boundary, with
 *     inset box-shadow sinking the canvas into the dashboard.
 *   - .viewport uses position: absolute + overflow: auto so content scrolls
 *     independently without warping the parent layout.
 *
 * Named slots:
 *   - slot="spinner"  — shown when is-ai-assembling is true
 *   - slot="console"  — shown when header-tab is "console"
 *   - slot="workspace"— shown for all other tab values (composer, evaluation, etc.)
 *
 * All three slots' content lives in the light DOM; the component conditionally
 * projects only the active slot into the Shadow DOM. Non-active content remains
 * mounted (preserving React state) but is not displayed.
 *
 * A2UI Catalog ID: ai-surface-sandbox
 * Framework: Lit 3.x — no decorators, static properties + customElements.define()
 */

import { LitElement, html, css } from 'lit';

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export class AISurfaceSandbox extends LitElement {
  // ── Reactive properties (static getter — no decorators) ──────────────────
  static properties = {
    /**
     * When true, the "spinner" slot is projected. The AI is assembling the
     * surface and no interactive content should be shown.
     * Lit Boolean converter: attribute present → true, absent → false.
     */
    isAIAssembling: { type: Boolean, attribute: 'is-ai-assembling' },

    /**
     * Which tab is active in the header. Controls which content slot is shown:
     *   "console"   → projects slot="console"
     *   any other   → projects slot="workspace"
     */
    headerTab: { type: String, attribute: 'header-tab' },

    /**
     * Internal error boundary state. NOT reflected as an attribute —
     * managed entirely inside the Shadow DOM. When true, the viewport
     * is replaced with an inline error panel.
     */
    _hasRuntimeError: { type: Boolean, state: true },

    /** Human-readable error summary for the inline panel. */
    _errorMessage: { type: String, state: true },

    /** Full stack trace for diagnostics. */
    _errorStack: { type: String, state: true },
  };

  // ── Defaults ─────────────────────────────────────────────────────────────
  isAIAssembling: boolean = false;
  headerTab: string = 'console';

  /** @internal — error boundary state */
  _hasRuntimeError: boolean = false;
  /** @internal — error message for inline display */
  _errorMessage: string = '';
  /** @internal — stack trace for inline display */
  _errorStack: string = '';

  // ── Lifecycle ────────────────────────────────────────────────────────────
  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('error', this._onSlotError as EventListener, true);
  }

  disconnectedCallback(): void {
    this.removeEventListener('error', this._onSlotError as EventListener, true);
    super.disconnectedCallback();
  }

  /** Catch errors bubbling up from slotted child elements. */
  private _onSlotError = (e: Event): void => {
    const errorEvent = e as ErrorEvent;
    this._hasRuntimeError = true;
    this._errorMessage = errorEvent.message || 'Unknown rendering error in slotted content';
    this._errorStack = errorEvent.error?.stack || '(no stack trace available)';
    e.stopPropagation(); // trap inside shadow — don't crash React shell
  };

  /** Reset the error boundary and request the React shell to re-mount content. */
  private _handleReset(): void {
    this._hasRuntimeError = false;
    this._errorMessage = '';
    this._errorStack = '';
    this.dispatchEvent(new CustomEvent('surface-error-reset', {
      bubbles: true,
      composed: true,
      detail: { timestamp: Date.now() },
    }));
  }

  // ── Shadow DOM styles — exact pixel-identical port + error panel styles ──
  static styles = css`
    /* ── :host acts as the flex child in the parent row layout ────────── */
    :host {
      display: flex;
      flex: 1 1 0%;
      min-height: 0;
    }

    /* ── Outer boundary — visual frame, containment, border ──────────── */
    #ai-surface {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 0;
      border: 2px solid #507274;
      border-radius: 8px;
      background-color: #e5e1dd;
      overflow: hidden;
      contain: layout style;
      margin: 0;
      box-shadow:
        inset 0 2px 4px rgba(0, 0, 0, 0.06),
        0 1px 2px rgba(0, 0, 0, 0.05);
    }

    /* ── Scroll viewport — absolute fill, overflow-x: hidden prevents
         unwanted horizontal scrollbars during splitter resize operations.
         Vertical overflow-y: auto allows content to scroll naturally. ── */
    .viewport {
      position: absolute;
      inset: 0;
      overflow-x: hidden;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    /* ── Slotted content fills the viewport.
         min-width: 0 is essential to prevent content from expanding
         the flex container horizontally during splitter resize.
         overflow-x: hidden clips horizontal overflow at this level. ── */
    ::slotted(*) {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      overflow-x: hidden;
    }

    /* ── Error boundary panel — high-visibility, loud, no soft fallbacks ── */
    .error-panel {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: #1a1a2e;
      color: #ff6b6b;
      padding: 24px;
      overflow: auto;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    .error-panel .error-label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 20px;
      font-weight: 800;
      color: #ff4444;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .error-panel .error-icon {
      width: 28px;
      height: 28px;
      background: #ff4444;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 18px;
      font-weight: 900;
      line-height: 1;
    }

    .error-panel .error-message {
      font-size: 15px;
      font-weight: 600;
      color: #ff8a80;
      margin-bottom: 20px;
      padding: 12px;
      background: rgba(255, 68, 68, 0.1);
      border-left: 3px solid #ff4444;
      border-radius: 0 6px 6px 0;
    }

    .error-panel .error-stack {
      flex: 1;
      min-height: 0;
      overflow: auto;
      background: #0d0d1a;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 16px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #e0e0e0;
      white-space: pre-wrap;
      word-break: break-all;
      margin-bottom: 20px;
    }

    .error-panel .error-actions {
      display: flex;
      gap: 12px;
      flex-shrink: 0;
    }

    .error-panel button {
      padding: 10px 24px;
      border: none;
      border-radius: 6px;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }

    .error-panel button:active {
      transform: scale(0.97);
    }

    .error-panel .btn-reset {
      background: #ff4444;
      color: #fff;
    }

    .error-panel .btn-reset:hover {
      background: #cc0000;
    }

    .error-panel .error-hint {
      margin-top: 12px;
      font-size: 11px;
      color: #666;
      font-style: italic;
    }
  `;

  // ── Render ───────────────────────────────────────────────────────────────
  // HONEST STATUS (2026-08-01):
  // This viewport routes to exactly 3 slots: console | workspace | spinner.
  // The AI decides WHAT fills those slots (prompt blocks, data, chat messages)
  // but cannot change the slot contract itself. Per owner design, the prompt
  // layout has slots with pre-ordered locations for modules — slots are the
  // layout contract, blocks are the content the AI controls.
  render() {
    // Runtime error boundary (template compilation failures)
    if (this._hasRuntimeError) {
      return html`
        <section id="ai-surface">
          <div class="error-panel">
            <div class="error-label">
              <span class="error-icon">!</span>
              A2UI Surface Runtime Error
            </div>
            <div class="error-message">${this._errorMessage || 'Unknown error'}</div>
            <div class="error-stack">${this._errorStack || 'No stack trace captured.'}</div>
            <div class="error-actions">
              <button class="btn-reset" @click=${this._handleReset}>Force Reset Viewport</button>
            </div>
            <div class="error-hint">
              This error was trapped inside the Lit Shadow DOM boundary.
              The operator shell (sidebar, header, chat panel) is unaffected.
            </div>
          </div>
        </section>
      `;
    }

    // Normal rendering — project the active slot into the viewport
    // HONEST STATUS (2026-08-01): Slot routing is FIXED: console | workspace | spinner.
    // The AI controls WHAT fills the slots (which prompt blocks, which data),
    // but it cannot create new slot names or change the routing logic.
    // The slot contract (left=prompt-section-editor, middle=compiled-output-viewer,
    // right=chat-panel) is the layout framework — pre-ordered locations for modules.
    // This is correct per owner design: slots are the contract, blocks are the content.
    const activeSlot = this.isAIAssembling
      ? 'spinner'
      : this.headerTab === 'console'
        ? 'console'
        : 'workspace';

    try {
      return html`
        <section id="ai-surface">
          <div class="viewport">
            <slot name=${activeSlot}></slot>
          </div>
        </section>
      `;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this._hasRuntimeError = true;
      this._errorMessage = `Template compilation failed: ${error.message}`;
      this._errorStack = error.stack || '(no stack)';
      return html``;
    }
  }
}

// ── Register the custom element ─────────────────────────────────────────────
customElements.define('ai-surface-sandbox', AISurfaceSandbox);

// ── Extend JSX intrinsics for TypeScript recognition in React ───────────────
declare global {
  interface HTMLElementTagNameMap {
    'ai-surface-sandbox': AISurfaceSandbox;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ai-surface-sandbox': React.DetailedHTMLProps<
        React.HTMLAttributes<AISurfaceSandbox> & {
          'is-ai-assembling'?: '' | undefined;
          'header-tab'?: string;
          ref?: React.Ref<AISurfaceSandbox>;
        },
        AISurfaceSandbox
      >;
    }
  }
}
