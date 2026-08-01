/**
 * <control-bar> — Lit A2UI Web Component
 *
 * Figma source: Wireframes v.4b — Left-column-ControlBar (node 40000761:261)
 *   Parent: controlBar (node 40000761:248)
 *
 * This component is the bottom control bar of the left column.
 * It is restricted to the left column — it does NOT span the full page.
 *
 * Layout (Figma node 40000761:248, 656×70px):
 *   [Version text]  ···  [↩️ Undo] [Save Template ⌘ S] [RUN ⌘ ⏎]
 *
 * Properties (HTML attributes):
 *   - version-text   (String)  — "Saved: My Prompt" or "Editing Version 1"
 *   - is-saving       (Boolean) — shows spinner on Save button when true
 *   - is-running      (Boolean) — shows spinner on Run button when true
 *   - save-shortcut   (String)  — keyboard shortcut label (default "⌘ S")
 *   - run-shortcut    (String)  — keyboard shortcut label (default "⌘ ⏎")
 *
 * CustomEvents (bubble: true, composed: true — cross Shadow DOM):
 *   - save-click      — fired when Save Template button is clicked
 *   - run-click       — fired when Run button is clicked
 *   - undo-click      — fired when Undo button is clicked
 *
 * No React handlers. No inline callbacks. All interaction → CustomEvents.
 *
 * A2UI Catalog ID: control-bar
 * Lit Component: <control-bar>
 * Figma Node: 40000761:261 ("Left-column-ControlBar")
 * Framework: Lit 3.x — no decorators, static properties + customElements.define()
 */

import { LitElement, html, css } from 'lit';

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export class ControlBar extends LitElement {
  static properties = {
    versionText: { type: String, attribute: 'version-text' },
    isSaving: { type: Boolean, attribute: 'is-saving' },
    isRunning: { type: Boolean, attribute: 'is-running' },
    saveShortcut: { type: String, attribute: 'save-shortcut' },
    runShortcut: { type: String, attribute: 'run-shortcut' },
  };

  versionText: string = 'Editing Version 1';
  isSaving: boolean = false;
  isRunning: boolean = false;
  saveShortcut: string = '⌘ S';
  runShortcut: string = '⌘ ⏎';

  // ── Figma-exact CSS — node 40000761:248 ──────────────────────────────────
  static styles = css`
    :host {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: space-between;
      /* Figma node 40000761:248: bg-[#b5ccce] px-[38px] py-[13px] */
      padding: 13px 38px;
      background: #B5CCCE;
      /* Figma: rounded-br-[10px] */
      border-radius: 0px 0px 10px 0px;
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      color: #4E68D2;
      /* Figma: 656×70 outer, minus padding = 656 × (70 - 13 - 13) = 656 × 44 inner */
      height: 70px;
      box-sizing: border-box;
      position: relative;
      width: 100%;
    }

    /* Figma: inner shadow on the bar */
    :host::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      box-shadow: inset 3px -4px 10px 0px rgba(0, 0, 0, 0.15),
                  inset 0px 4px 4px 0px rgba(0, 0, 0, 0.1);
    }

    /* ── Version text (node 40000761:249) ─────────────────────────────────── */
    .version {
      /* Figma: font-['Inter:Bold'] font-bold text-[#4e68d2] text-[16px] h-[34px] w-[153px] */
      font-weight: 700;
      font-size: 16px;
      color: #4E68D2;
      white-space: nowrap;
      line-height: 34px;
      width: 153px;
    }

    /* ── Actions container (node 40000761:264) ────────────────────────────── */
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
    }

    /* ── Shared button base ───────────────────────────────────────────────── */
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: 6px;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    /* ── Undo button (node 40000761:271 "undo-last-state-milivis") ───────── */
    .btn-undo {
      /* Figma: 36×36 circle, border 2px solid #A7A7A7, bg #E5E5E5 */
      width: 36px;
      height: 36px;
      padding: 0;
      border: 2px solid #A7A7A7;
      background: #E5E5E5;
      border-radius: 50%;
      /* Figma: ↩️ emoji text-[20px] text-[rgba(72,68,96,0.5)] font-bold */
      font-size: 20px;
      font-weight: 700;
      line-height: 1;
      color: rgba(72, 68, 96, 0.5);
      box-shadow: none;
    }

    .btn-undo:hover {
      background: #f3f4f6;
      border-color: #6b7280;
    }

    /* ── Save button (node 40000761:269 "Save prompt") ───────────────────── */
    .btn-save {
      /* Figma: bg-white, h-[43px], w-[204.437px], rounded-[6px] */
      background: #fff;
      color: #5a5a5a;
      border: none;
      /* Figma: text-[#5a5a5a] text-[16px] font-bold */
      font-size: 16px;
      font-weight: 700;
      height: 43px;
      width: 204px;
      /* Figma: button drop shadow */
      box-shadow: -4px -4px 10px 0px rgba(0, 0, 0, 0.15),
                   4px 4px 4px 0px rgba(0, 0, 0, 0.25);
    }

    .btn-save:hover {
      background: #f3f4f6;
    }

    .btn-save:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-save.saving {
      background: #e8f4f0;
      cursor: wait;
    }

    /* ── Run button (node 40000761:267 "enter-run") ──────────────────────── */
    .btn-run {
      /* Figma: bg-gradient-to-l from-[#f0b424] to-[#fed141], h-[43px], w-[142px] */
      background: linear-gradient(to left, #f0b424 0%, #fed141 100%);
      /* Figma: text-black text-[18px] font-extrabold */
      color: #000;
      border: none;
      font-size: 18px;
      font-weight: 800;
      height: 43px;
      width: 142px;
      /* Figma: button drop shadow */
      box-shadow: -4px -4px 10px 0px rgba(0, 0, 0, 0.15),
                   4px 4px 4px 0px rgba(0, 0, 0, 0.25);
    }

    .btn-run:hover {
      filter: brightness(1.08);
    }

    .btn-run:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .btn-run.running {
      background: linear-gradient(to left, #d4991f 0%, #e0b830 100%);
      cursor: wait;
    }

    .btn-run.running .spinner {
      border-color: rgba(0, 0, 0, 0.15);
      border-top-color: #000;
    }

    /* ── Shortcut labels ──────────────────────────────────────────────────── */
    /* Save shortcut (node 40000761:270): text-[#8b8b8b] */
    .shortcut {
      font-size: 16px;
      font-weight: 400;
      color: #8b8b8b;
    }

    /* Run shortcut (node 40000761:268): text-[#507274] font-medium */
    .shortcut-run {
      font-size: 14px;
      font-weight: 500;
      color: #507274;
    }

    /* ── Spinner (runtime state, not in Figma) ────────────────────────────── */
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 3px solid rgba(80, 114, 116, 0.25);
      border-top-color: #507274;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    .saving-text {
      color: #507274;
      font-weight: 600;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  // ── Event handlers ────────────────────────────────────────────────────────

  private _handleUndo() {
    this.dispatchEvent(new CustomEvent('undo-click', {
      bubbles: true,
      composed: true,
    }));
  }

  private _handleSave() {
    if (this.isSaving) return;
    this.dispatchEvent(new CustomEvent('save-click', {
      bubbles: true,
      composed: true,
    }));
  }

  private _handleRun() {
    if (this.isRunning) return;
    this.dispatchEvent(new CustomEvent('run-click', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div
        class="version"
        data-tag="control-bar-version"
        data-node-id="40000761:249"
      >${this.versionText}</div>
      <div class="actions" data-node-id="40000761:264">
        <!-- Undo button (node 40000761:271 "undo-last-state-milivis") -->
        <button
          class="btn-undo"
          @click=${this._handleUndo}
          title="Undo last state"
          data-node-id="40000761:271"
        >↩️</button>
        <!-- Save button (node 40000761:269 "Save prompt") -->
        <button
          class="btn-save ${this.isSaving ? 'saving' : ''}"
          ?disabled=${this.isSaving}
          @click=${this._handleSave}
          title="Save Template (${this.saveShortcut})"
          data-node-id="40000761:269"
        >
          ${this.isSaving
            ? html`<span class="spinner"></span> <span class="saving-text">Compiling...</span>`
            : html`Save Template <span class="shortcut">${this.saveShortcut}</span>`
          }
        </button>
        <!-- Run button (node 40000761:267 "enter-run") -->
        <button
          class="btn-run ${this.isRunning ? 'running' : ''}"
          ?disabled=${this.isRunning}
          @click=${this._handleRun}
          title="Run (${this.runShortcut})"
          data-node-id="40000761:267"
        >
          ${this.isRunning
            ? html`<span class="spinner"></span> <span class="saving-text" style="color:#000">Running...</span>`
            : html`RUN <span class="shortcut-run">${this.runShortcut}</span>`
          }
        </button>
      </div>
    `;
  }
}

customElements.define('control-bar', ControlBar);

declare global {
  interface HTMLElementTagNameMap {
    'control-bar': ControlBar;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'control-bar': React.DetailedHTMLProps<
        React.HTMLAttributes<ControlBar> & {
          'version-text'?: string;
          'is-saving'?: '' | undefined;
          'save-shortcut'?: string;
          'run-shortcut'?: string;
          ref?: React.Ref<ControlBar>;
        },
        ControlBar
      >;
    }
  }
}
