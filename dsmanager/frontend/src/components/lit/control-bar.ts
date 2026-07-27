/**
 * <control-bar> — Lit A2UI Web Component
 *
 * Port of the React ControlBar into a Shadow DOM-isolated Lit element.
 * Renders the bottom bar in PromptWorkspace with version text, Save Template,
 * and Run buttons. Dispatches CustomEvents for React shell integration.
 *
 * Properties (HTML attributes):
 *   - version-text   (String)  — "Saved: My Prompt" or "Editing Version 1"
 *   - is-saving       (Boolean) — shows spinner on Save button when true
 *   - save-shortcut   (String)  — keyboard shortcut label (default "⌘ S")
 *   - run-shortcut    (String)  — keyboard shortcut label (default "⌘ ⏎")
 *
 * CustomEvents (bubble: true, composed: true — cross Shadow DOM):
 *   - save-click      — fired when Save Template button is clicked
 *   - run-click       — fired when Run button is clicked
 *   - title-change    — fired when the title input changes, detail: { title: string }
 *
 * No React handlers. No inline callbacks. All interaction → CustomEvents.
 *
 * A2UI Catalog ID: control-bar
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
    saveShortcut: { type: String, attribute: 'save-shortcut' },
    runShortcut: { type: String, attribute: 'run-shortcut' },
  };

  versionText: string = 'Editing Version 1';
  isSaving: boolean = false;
  saveShortcut: string = '⌘ S';
  runShortcut: string = '⌘ ⏎';

  static styles = css`
    :host {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: linear-gradient(180deg, #f8f7f5 0%, #e5e1dd 100%);
      border-top: 1px solid #d4cfc9;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: #3d3d3d;
      min-height: 44px;
    }

    .version {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      font-size: 12px;
      color: #6b6b6b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 40%;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: 1px solid #c4bfb8;
      border-radius: 6px;
      background: #fff;
      color: #3d3d3d;
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
    }

    button:hover {
      background: #f0ede9;
      border-color: #a09890;
    }

    button:active {
      background: #e5e1dd;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-save {
      background: #507274;
      color: #fff;
      border-color: #3d5a5c;
    }

    .btn-save:hover {
      background: #3d5a5c;
    }

    .btn-save:disabled {
      background: #8a9fa0;
      border-color: #6e8586;
    }

    .btn-run {
      background: #4aa490;
      color: #fff;
      border-color: #3a8372;
    }

    .btn-run:hover {
      background: #3a8372;
    }

    .shortcut {
      font-size: 10px;
      opacity: 0.6;
      font-weight: 400;
    }

    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  private _handleSave() {
    if (this.isSaving) return;
    this.dispatchEvent(new CustomEvent('save-click', {
      bubbles: true,
      composed: true,
    }));
  }

  private _handleRun() {
    this.dispatchEvent(new CustomEvent('run-click', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="version">${this.versionText}</div>
      <div class="actions">
        <button
          class="btn-save"
          ?disabled=${this.isSaving}
          @click=${this._handleSave}
          title="Save Template (${this.saveShortcut})"
        >
          ${this.isSaving
            ? html`<span class="spinner"></span> Saving...`
            : html`Save Template <span class="shortcut">${this.saveShortcut}</span>`
          }
        </button>
        <button
          class="btn-run"
          @click=${this._handleRun}
          title="Run (${this.runShortcut})"
        >
          Run <span class="shortcut">${this.runShortcut}</span>
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
