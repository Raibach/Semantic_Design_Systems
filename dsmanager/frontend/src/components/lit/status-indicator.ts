import { LitElement, html, css } from 'lit';

/**
 * <status-indicator> — Lit custom element
 *
 * Tag registry entry:
 *   tag: "status-indicator"
 *   props: { state: idle|loading|success|error|warning, message?: string }
 *
 * The AI emits: <status-indicator state="error" message="Something broke" />
 * The component knows: state="error" → red dot + asterisk
 */

type IndicatorState = 'idle' | 'loading' | 'success' | 'error' | 'warning';

export class StatusIndicator extends LitElement {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      padding: 4px 12px;
      border-radius: 6px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .message {
      color: inherit;
    }
    :host([state="idle"]) { color: #6b7280; background: #f3f4f6; }
    :host([state="idle"]) .dot { background: #9ca3af; }
    :host([state="loading"]) { color: #1d4ed8; background: #dbeafe; }
    :host([state="loading"]) .dot { background: #3b82f6; animation: pulse 1s infinite; }
    :host([state="success"]) { color: #166534; background: #dcfce7; }
    :host([state="success"]) .dot { background: #22c55e; }
    :host([state="error"]) { color: #991b1b; background: #fee2e2; }
    :host([state="error"]) .dot { background: #ef4444; }
    :host([state="warning"]) { color: #92400e; background: #fef3c7; }
    :host([state="warning"]) .dot { background: #f59e0b; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;

  static properties = {
    state: { type: String, reflect: true },
    message: { type: String },
  };

  state: IndicatorState = 'idle';
  message = '';

  render() {
    return html`
      <span class="dot"></span>
      ${this.message ? html`<span class="message">${this.message}</span>` : ''}
    `;
  }
}

customElements.define('status-indicator', StatusIndicator);

declare global {
  interface HTMLElementTagNameMap {
    'status-indicator': StatusIndicator;
  }
}
