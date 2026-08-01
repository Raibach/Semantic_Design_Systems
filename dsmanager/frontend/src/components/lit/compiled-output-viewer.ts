/**
 * <compiled-output-viewer> — Lit port of MiddleColumnSlot output logic
 *
 * Displays streamed/compiled prompt output for composer surfaces.
 * Receives content via property (from updateDataModel /session/middle_column/compiled_output).
 *
 * Features (v1):
 *   - Raw vs rendered toggle
 *   - Copy to clipboard
 *   - Regenerate / Clear buttons (dispatch events)
 *   - Status + model + token display
 *   - Auto-scroll during streaming
 *
 * Events:
 *   copy-output, regenerate-requested, clear-output
 */

import { LitElement, html, css } from 'lit';

export class CompiledOutputViewer extends LitElement {
  static properties = {
    content: { type: String },
    status: { type: String },
    model: { type: String },
    tokens: { type: Number },
    isRunning: { type: Boolean, attribute: 'is-running' },
    sessionId: { type: String, attribute: 'session-id' },
    viewMode: { type: String, state: true },
  };

  content = '';
  status = 'empty';
  model = '';
  tokens = 0;
  isRunning = false;
  sessionId: string | null = null;
  viewMode: 'rendered' | 'raw' = 'rendered';

  private _prevContent = '';

  updated(changed: Map<string, unknown>): void {
    if (changed.has('content') && this.isRunning) {
      // auto-scroll during streaming
      const el = this.shadowRoot?.querySelector('.output') as HTMLElement | null;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  private _copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(this.content || '');
      this.dispatchEvent(new CustomEvent('copy-output', { bubbles: true, composed: true }));
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = this.content || '';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.dispatchEvent(new CustomEvent('copy-output', { bubbles: true, composed: true }));
    }
  };

  private _regenerate = (): void => {
    this.dispatchEvent(new CustomEvent('regenerate-requested', {
      bubbles: true,
      composed: true,
      detail: { model: this.model },
    }));
  };

  private _clear = (): void => {
    this.dispatchEvent(new CustomEvent('clear-output', { bubbles: true, composed: true }));
  };

  private _toggleView = (): void => {
    this.viewMode = this.viewMode === 'rendered' ? 'raw' : 'rendered';
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: #fff;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      font-size: 11px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .meta {
      display: flex;
      gap: 8px;
      color: #6b7280;
    }
    .actions button {
      font-size: 10px;
      padding: 2px 8px;
      margin-left: 4px;
      border: 1px solid #d1d5db;
      background: #fff;
      border-radius: 4px;
      cursor: pointer;
    }
    .actions button:hover { background: #f3f4f6; }
    .output {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      background: #fff;
    }
    .raw {
      background: #0f172a;
      color: #e2e8f0;
    }
    .status {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      background: #e5e7eb;
    }
    .status.running { background: #dbeafe; color: #1e40af; }
  `;

  render() {
    const display = this.viewMode === 'raw'
      ? html`<pre class="output raw">${this.content || '(no output yet)'}</pre>`
      : html`<div class="output">${this.content || '(no output yet)'}</div>`;

    return html`
      <div class="header">
        <div class="meta">
          <span>${this.model || '—'}</span>
          <span>${this.tokens || 0} tokens</span>
          <span class="status ${this.isRunning ? 'running' : ''}">${this.status}</span>
        </div>
        <div class="actions">
          <button @click=${this._toggleView}>${this.viewMode === 'raw' ? 'Rendered' : 'Raw'}</button>
          <button @click=${this._copy}>Copy</button>
          <button @click=${this._regenerate} ?disabled=${this.isRunning}>Regenerate</button>
          <button @click=${this._clear}>Clear</button>
        </div>
      </div>
      ${display}
    `;
  }
}

customElements.define('compiled-output-viewer', CompiledOutputViewer);

declare global {
  interface HTMLElementTagNameMap {
    'compiled-output-viewer': CompiledOutputViewer;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'compiled-output-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<CompiledOutputViewer> & {
          content?: string;
          status?: string;
          model?: string;
          tokens?: number;
          'is-running'?: '' | boolean;
          'session-id'?: string;
        },
        CompiledOutputViewer
      >;
    }
  }
}