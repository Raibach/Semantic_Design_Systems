/**
 * <workspace-layout> — Lit resizable 3-column workspace (A2UI v0.9.1)
 *
 * Exact port of the resize/gripper/double-click collapse logic from
 * PromptWorkspace + ResizableSplitter.
 *
 * Named slots:
 *   - slot="left"   — prompt-section-editor
 *   - slot="middle" — compiled-output-viewer
 *   - slot="right"  — chat-panel (or other right column content)
 *
 * Properties (set by React shell or AI data model):
 *   left-width, right-width, is-third-open
 *
 * Events:
 *   resize-start, resize, resize-end, third-column-toggle
 *
 * The React shell (WritingAreaIndex) hosts this inside slot="workspace"
 * of ai-surface-sandbox and binds widths + data via refs/effects.
 */

import { LitElement, html, css } from 'lit';

export class WorkspaceLayout extends LitElement {
  static properties = {
    leftWidth: { type: Number, attribute: 'left-width' },
    rightWidth: { type: Number, attribute: 'right-width' },
    isThirdOpen: { type: Boolean, attribute: 'is-third-open' },
    showMiddle: { type: Boolean, attribute: 'show-middle' },
  };

  leftWidth = 320;
  rightWidth = 380;
  isThirdOpen = true;
  showMiddle = false; // default: composer starts as 2-column (prompt + chat) until Run produces output

  private _dragging: 'left' | 'right' | null = null;
  private _startX = 0;
  private _startW = 0;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('mousemove', this._onMouseMove as EventListener);
    document.addEventListener('mouseup', this._onMouseUp as EventListener);
    this._applyWidths();
  }

  disconnectedCallback(): void {
    document.removeEventListener('mousemove', this._onMouseMove as EventListener);
    document.removeEventListener('mouseup', this._onMouseUp as EventListener);
    super.disconnectedCallback();
  }

  private _applyWidths(): void {
    this.style.setProperty('--left-width', `${this.leftWidth}px`);
    this.style.setProperty('--right-width', `${this.rightWidth}px`);
    this.style.setProperty('--right-display', this.isThirdOpen ? 'block' : 'none');
    this.style.setProperty('--middle-display', this.showMiddle ? 'block' : 'none');
  }

  private _onGripDown = (side: 'left' | 'right', e: MouseEvent): void => {
    this._dragging = side;
    this._startX = e.clientX;
    this._startW = side === 'left' ? this.leftWidth : this.rightWidth;
    this.dispatchEvent(new CustomEvent('resize-start', { detail: { side } }));
    e.preventDefault();
  };

  private _onMouseMove = (e: MouseEvent): void => {
    if (!this._dragging) return;
    const delta = e.clientX - this._startX;

    if (this._dragging === 'left') {
      const w = Math.max(180, this._startW + delta);
      this.leftWidth = w;
      this.style.setProperty('--left-width', `${w}px`);
      this.dispatchEvent(new CustomEvent('resize', { detail: { side: 'left', width: w } }));
    } else {
      const w = Math.max(180, this._startW - delta);
      this.rightWidth = w;
      this.style.setProperty('--right-width', `${w}px`);
      this.dispatchEvent(new CustomEvent('resize', { detail: { side: 'right', width: w } }));
    }
  };

  private _onMouseUp = (): void => {
    if (this._dragging) {
      this.dispatchEvent(new CustomEvent('resize-end', {
        detail: { leftWidth: this.leftWidth, rightWidth: this.rightWidth },
      }));
    }
    this._dragging = null;
  };

  private _toggleThird = (): void => {
    this.isThirdOpen = !this.isThirdOpen;
    this.style.setProperty('--right-display', this.isThirdOpen ? 'block' : 'none');
    this.dispatchEvent(new CustomEvent('third-column-toggle', { detail: { open: this.isThirdOpen } }));
  };

  static styles = css`
    :host {
      display: flex;
      width: 100%;
      height: 100%;
      min-height: 0;
      --left-width: 320px;
      --right-width: 380px;
      --right-display: block;
    }

    .pane {
      overflow: auto;
      min-height: 0;
      min-width: 0;
    }

    .left {
      flex: 0 0 var(--left-width);
      min-width: 180px;
    }

    .middle {
      flex: 1 1 0%;
      min-width: 0;
      display: var(--middle-display, block);
    }

    .right {
      flex: 0 0 var(--right-width);
      min-width: 180px;
      max-width: 100%;
      display: var(--right-display);
      overflow: hidden;
    }

    .gripper {
      width: 5px;
      background: #d1d5db;
      cursor: col-resize;
      flex-shrink: 0;
      transition: background 0.1s;
    }
    .gripper:hover { background: #9ca3af; }
    .gripper:active { background: #6b7280; }
  `;

  render() {
    // When showMiddle is false (default for composer), render only 2 columns:
    // left (prompt sections, expands to fill) + gripper + right (narrow chat sidebar).
    // This matches IDE layout: main editor takes remaining space, chat is fixed/resizable sidebar.
    if (!this.showMiddle) {
      return html`
        <div class="pane left" style="flex: 1 1 0%;"><slot name="left"></slot></div>
        <div class="gripper" @mousedown=${(e: MouseEvent) => this._onGripDown('right', e)}></div>
        <div class="pane right" style="flex: 0 0 var(--right-width);"><slot name="right"></slot></div>
      `;
    }

    return html`
      <div class="pane left"><slot name="left"></slot></div>
      <div class="gripper" @mousedown=${(e: MouseEvent) => this._onGripDown('left', e)}></div>
      <div class="pane middle"><slot name="middle"></slot></div>
      <div class="gripper" @mousedown=${(e: MouseEvent) => this._onGripDown('right', e)} @dblclick=${this._toggleThird}></div>
      <div class="pane right"><slot name="right"></slot></div>
    `;
  }
}

customElements.define('workspace-layout', WorkspaceLayout);

declare global {
  interface HTMLElementTagNameMap {
    'workspace-layout': WorkspaceLayout;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'workspace-layout': React.DetailedHTMLProps<
        React.HTMLAttributes<WorkspaceLayout> & {
          'left-width'?: number | string;
          'right-width'?: number | string;
          'is-third-open'?: '' | boolean;
          'show-middle'?: '' | boolean;
        },
        WorkspaceLayout
      >;
    }
  }
}