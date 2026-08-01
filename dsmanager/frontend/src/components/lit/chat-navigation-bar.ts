/**
 * <chat-navigation-bar> — Lit A2UI web component
 *
 * Right column navigation bar with three tabs (Chat, Trace, Tools) and a
 * drag-to-resize gripper. Replaces the React SidebarNavigation + NavigationButton
 * components. Registered as a custom element for A2UI surface assembly.
 *
 * Features:
 *   - 3 tabs with inline SVG icons and labels
 *   - Active tab: yellow highlight (#FCCD3D), 77px height, icon shifts down
 *   - Gripper: drag handle at bottom dispatches right-column-drag-* events
 *   - Logo slot: <slot name="logo"> for AI-assigned branding
 *   - Collapse/expand: clicking active tab toggles collapsed state
 *   - CustomEvents: tab-change, collapse-toggle
 *
 * A2UI Catalog ID: chat-navigation-bar
 * Framework: Lit 3.x — no decorators, static properties + customElements.define()
 */

import { LitElement, html, css } from 'lit';

// ═══════════════════════════════════════════════════════════════════════════════
// Types — exported for React consumers (InteractiveChatInterface.tsx)
// ═══════════════════════════════════════════════════════════════════════════════

/** Valid tab identifiers. */
export type TabId = 'chat' | 'trace' | 'tools' | 'evaluation' | 'variables' | 'metadata';

/** Detail payload for the 'tab-change' CustomEvent. */
export interface TabChangeEventDetail {
  tab: TabId;
}

/** Detail payload for the 'collapse-toggle' CustomEvent. */
export interface CollapseToggleEventDetail {
  collapsed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab definition — icon, label, and tooltip
// ═══════════════════════════════════════════════════════════════════════════════

interface TabDef {
  id: TabId;
  label: string;
  tooltip: string;
  /** Inline SVG path for the tab icon (viewBox 0 0 22.75 21.8752) */
  svgPath: string;
}

const TABS: TabDef[] = [
  {
    id: 'chat',
    label: 'Chat',
    tooltip: 'Chat with Grace',
    // Speech bubble / branching chat icon
    svgPath: 'M20.3125 13.2813C21.6566 13.2813 22.75 12.2299 22.75 10.9375C22.75 9.6451 21.6566 8.5937 20.3125 8.5937C19.2546 8.5937 18.3612 9.2488 18.0247 10.1563H13.3364L19.2683 4.4525C19.586 4.59898 19.9374 4.6875 20.3125 4.6875C21.6566 4.6875 22.75 3.63617 22.75 2.34375C22.75 1.05133 21.6566 0 20.3125 0C18.9684 0 17.875 1.05133 17.875 2.34375C17.875 2.70461 17.9672 3.04219 18.1192 3.34781L11.375 9.8328V4.68758C11.375 3.82625 12.1038 3.12508 13 3.12508H14.625V1.56258H13C12.0248 1.56258 11.1588 1.98641 10.5625 2.6425C9.9662 1.98641 9.1002 1.56258 8.125 1.56258H7.3125C3.28055 1.56258 0 4.71656 0 8.5938V13.2813C0 17.1586 3.28055 20.3126 7.3125 20.3126H8.125C9.1002 20.3126 9.9662 19.8887 10.5625 19.2327C11.1588 19.8887 12.0248 20.3126 13 20.3126H14.625V18.7501H13C12.1038 18.7501 11.375 18.0489 11.375 17.1876V12.0423L18.1192 18.5273C17.9672 18.8329 17.875 19.1705 17.875 19.5314C17.875 20.8238 18.9684 21.8752 20.3125 21.8752C21.6566 21.8752 22.75 20.8238 22.75 19.5314C22.75 18.239 21.6566 17.1877 20.3125 17.1877C19.9374 17.1877 19.5861 17.2762 19.2683 17.4227L13.3364 11.7189H18.0247C18.3612 12.6264 19.2546 13.2813 20.3125 13.2813Z',
  },
  {
    id: 'trace',
    label: 'Trace',
    tooltip: 'Execution trace and evaluation',
    // Branching tree / execution flow icon
    svgPath: 'M23.07 15.6777V4.11016C24.0271 3.81716 24.7178 3.04006 24.7178 2.12013C24.7178 0.951022 23.6091 0 22.2461 0C20.883 0 19.7742 0.951022 19.7742 2.12013C19.7742 2.39688 19.8406 2.6595 19.9533 2.90176L12.3589 8.60167L4.76457 2.90204C4.87736 2.65943 4.94356 2.39688 4.94356 2.12013C4.94356 0.951022 3.83479 0 2.47179 0C1.10877 0 0 0.951022 0 2.12013C0 3.04013 0.690785 3.81723 1.64785 4.10981V15.678C0.690785 15.9707 0 16.7478 0 17.6677C0 18.8368 1.10877 19.7878 2.47179 19.7878C3.83479 19.7878 4.94356 18.8368 4.94356 17.6677C4.94356 17.1967 4.75757 16.7653 4.45317 16.413L8.84758 13.1148L10.7957 16.0389C10.2456 16.4282 9.88716 17.0096 9.88716 17.6677C9.88716 18.8368 10.9959 19.7878 12.3589 19.7878C13.722 19.7878 14.8306 18.8368 14.8306 17.6677C14.8306 17.0096 14.4721 16.4282 13.9221 16.0389L15.8702 13.1148L20.2646 16.413C19.9603 16.7653 19.7742 17.1967 19.7742 17.6677C19.7742 18.8368 20.883 19.7878 22.2461 19.7878C23.6091 19.7878 24.7178 18.8368 24.7178 17.6677C24.7178 16.7478 24.0271 15.9707 23.07 15.6777Z',
  },
  {
    id: 'tools',
    label: 'Tools',
    tooltip: 'Tool registry and usage',
    // Wrench / tools icon
    svgPath: 'M20.3125 13.2813C21.6566 13.2813 22.75 12.2299 22.75 10.9375C22.75 9.6451 21.6566 8.5937 20.3125 8.5937C19.2546 8.5937 18.3612 9.2488 18.0247 10.1563H13.3364L19.2683 4.4525C19.586 4.59898 19.9374 4.6875 20.3125 4.6875C21.6566 4.6875 22.75 3.63617 22.75 2.34375C22.75 1.05133 21.6566 0 20.3125 0C18.9684 0 17.875 1.05133 17.875 2.34375C17.875 2.70461 17.9672 3.04219 18.1192 3.34781L11.375 9.8328V4.68758C11.375 3.82625 12.1038 3.12508 13 3.12508H14.625V1.56258H13C12.0248 1.56258 11.1588 1.98641 10.5625 2.6425C9.9662 1.98641 9.1002 1.56258 8.125 1.56258H7.3125C3.28055 1.56258 0 4.71656 0 8.5938V13.2813C0 17.1586 3.28055 20.3126 7.3125 20.3126H8.125C9.1002 20.3126 9.9662 19.8887 10.5625 19.2327C11.1588 19.8887 12.0248 20.3126 13 20.3126H14.625V18.7501H13C12.1038 18.7501 11.375 18.0489 11.375 17.1876V12.0423L18.1192 18.5273C17.9672 18.8329 17.875 19.1705 17.875 19.5314C17.875 20.8238 18.9684 21.8752 20.3125 21.8752C21.6566 21.8752 22.75 20.8238 22.75 19.5314C22.75 18.239 21.6566 17.1877 20.3125 17.1877C19.9374 17.1877 19.5861 17.2762 19.2683 17.4227L13.3364 11.7189H18.0247C18.3612 12.6264 19.2546 13.2813 20.3125 13.2813Z',
  },
  {
    id: 'evaluation',
    label: 'Evaluate',
    tooltip: 'A/B testing and model comparison',
    // Bar chart / evaluation icon
    svgPath: 'M4 22H2V10H4V22ZM20.5 22H18.5V2H20.5V22ZM12.25 22H10.25V6H12.25V22Z',
  },
  {
    id: 'variables',
    label: 'Variables',
    tooltip: 'Design system variables and tokens',
    // Braces / variables icon
    svgPath: 'M9.4 22C7.6 22 6.4 21.2 5.6 19.5C5.3 18.8 5 18.2 4.5 17.7C4 17.2 3.5 16.9 2.8 16.7L2 16.4V14.4L3.2 14.7C4.3 15 5.2 15.6 5.9 16.4C6.6 17.2 7.1 18.1 7.5 19.1C7.9 19.9 8.3 20.2 9.4 20.2H10V22H9.4ZM14.6 22C12.8 22 11.6 21.2 10.8 19.5C10.5 18.8 10.2 18.2 9.7 17.7C9.2 17.2 8.7 16.9 8 16.7L7.2 16.4V14.4L8.4 14.7C9.5 15 10.4 15.6 11.1 16.4C11.8 17.2 12.3 18.1 12.7 19.1C13.1 19.9 13.5 20.2 14.6 20.2H15.2V22H14.6ZM5.5 11H18.5V9H5.5V11ZM5.5 7H18.5V5H5.5V7Z',
  },
  {
    id: 'metadata',
    label: 'Metadata',
    tooltip: 'Cost, compliance, and governance data',
    // Document / metadata icon
    svgPath: 'M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export class ChatNavigationBar extends LitElement {
  // ── Reactive properties (static getter — no decorators) ──────────────────
  static properties = {
    activeTab: { type: String, attribute: 'active-tab' },
    collapsed: { type: Boolean },
    allowedTabs: { type: String, attribute: 'allowed-tabs' },
  };

  // ── Defaults ─────────────────────────────────────────────────────────────
  activeTab: TabId = 'chat';
  collapsed: boolean = false;
  /**
   * Comma-separated list of tab IDs to show, filtered by the user's
   * departmental role. Set by InteractiveChatInterface from the
   * /api/ai/role-capabilities response.
   * If unset, all tabs are shown (backwards-compatible dev default).
   */
  allowedTabs: string = '';

  // ── Drag state (not reactive — no re-render needed) ──────────────────────
  private _isDragging: boolean = false;
  private _dragStartX: number = 0;
  private _previousTab: TabId | '' = '';

  // ── Shadow DOM styles — pixel-identical to original compiled component ──
  static styles = css`
    :host {
      display: block;
      height: 100%;
      width: 75px;
      flex-shrink: 0;
    }

    .sb {
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      width: 75px;
      border-radius: 10px 0px 0px 10px;
      box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.25);
      background-image: linear-gradient(
          90deg,
          rgba(0, 0, 0, 0.2) 0%,
          rgba(0, 0, 0, 0.2) 100%
        ),
        linear-gradient(
          193.083deg,
          rgb(28, 47, 78) 27.022%,
          rgb(18, 66, 126) 38.117%,
          rgb(13, 48, 91) 98.965%
        );
      overflow: hidden;
    }

    /* ── Logo section ─────────────────────────────────────────────────── */
    .lo {
      display: flex;
      flex-direction: column;
      height: 66px;
      width: 100%;
      overflow: clip;
      flex-shrink: 0;
      align-items: flex-start;
    }
    .lc {
      height: 65.984px;
      width: 100%;
      position: relative;
      flex-shrink: 0;
    }
    .lp {
      position: absolute;
      inset: 0;
      background: rgb(55, 65, 81);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      font-family: 'Inter', sans-serif;
    }
    ::slotted(img) {
      position: absolute;
      inset: 0;
      max-width: none;
      object-fit: cover;
      pointer-events: none;
      width: 100%;
      height: 100%;
    }

    /* ── Tab button ───────────────────────────────────────────────────── */
    .nb {
      position: relative;
      flex-shrink: 0;
      width: 100%;
      height: 67px;
      transition: background-color 0.2s, height 0.2s;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
    }
    .nb:hover {
      background: rgb(252, 205, 61);
      height: 77px;
    }
    .na {
      background: rgb(252, 205, 61);
      height: 77px;
    }

    /* ── Icon wrapper ─────────────────────────────────────────────────── */
    .ni {
      position: absolute;
      height: 47px;
      left: 7.42px;
      top: 10px;
      width: 67.58px;
      transition: top 0.2s;
    }
    .ns,
    .nb:hover .ni,
    .na .ni {
      top: 15px;
    }
    .iw {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      left: 17px;
      top: 1px;
      width: 26px;
    }
    .ic {
      height: 25px;
      overflow: clip;
      width: 100%;
      position: relative;
      flex-shrink: 0;
    }

    /* ── SVG layers ───────────────────────────────────────────────────── */
    .nm {
      position: absolute;
      inset: 0;
      mix-blend-mode: multiply;
      display: block;
      width: 100%;
      height: 100%;
    }
    .nsv {
      position: absolute;
      inset: 6.25%;
      display: block;
      width: 87.5%;
      height: 87.5%;
    }

    /* ── Label ────────────────────────────────────────────────────────── */
    .lw {
      position: absolute;
      display: flex;
      flex-direction: column;
      height: 16px;
      align-items: flex-start;
      justify-content: center;
      left: 0;
      top: 31px;
      width: 100%;
      transition: top 0.2s;
    }
    .ls,
    .nb:hover .lw,
    .na .lw {
      top: 33px;
    }
    .lt {
      height: 20px;
      position: relative;
      flex-shrink: 0;
      width: 100%;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-style: normal;
      font-size: 13px;
      line-height: 20px;
      text-align: center;
      white-space: nowrap;
      color: rgb(78, 207, 213);
      display: block;
    }
    .nb:not(:hover):not(.na) .lt {
      font-weight: 500;
    }

    /* ── Tooltip ──────────────────────────────────────────────────────── */
    .tt {
      position: absolute;
      left: 100%;
      margin-left: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: rgb(188, 203, 206);
      color: #000;
      padding: 8px 12px;
      border-radius: 4px;
      box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.25);
      white-space: nowrap;
      font-size: 10pt;
      font-family: 'Inter', sans-serif;
      font-weight: 400;
      z-index: 50;
    }
    .ta {
      position: absolute;
      right: 100%;
      top: 50%;
      transform: translateY(-50%);
      width: 0;
      height: 0;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      border-right: 4px solid rgb(188, 203, 206);
    }

    /* ── Gripper (drag-to-resize handle) ──────────────────────────────── */
    .gb {
      position: relative;
      flex-shrink: 0;
      width: 100%;
      margin-top: auto;
      cursor: col-resize;
      border: none;
      background: none;
      padding: 0;
      border-radius: 4px;
      /* No transition on background-color - prevents jerky motion during drag */
    }
    .gb:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .ga {
      background: rgba(255, 255, 255, 0.1);
    }
    .gfr {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    .gpc {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 8px 3px;
      width: 100%;
      position: relative;
    }
    .gsh {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      flex-shrink: 0;
    }
    .gro {
      flex: 0 0 auto;
      transform: rotate(180deg);
    }
    .gco {
      height: 54px;
      position: relative;
      width: 24px;
    }
    .grt,
    .grb {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      left: 1px;
      width: 24px;
      height: 24px;
    }
    .grt {
      top: 25px;
    }
    .grb {
      top: 13px;
    }
    .gri {
      transform: rotate(-90deg);
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      width: 24px;
      height: 24px;
    }
    .grc {
      height: 24px;
      overflow: clip;
      width: 100%;
      position: relative;
      flex-shrink: 0;
    }
    .gdl {
      inset: 45.83% 20.83% 45.83% 45.83%;
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gdr {
      inset: 45.83% 20.83% 45.83% 70.83%;
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gds {
      position: absolute;
      inset: 45.83%;
    }
    .gdi {
      position: absolute;
      inset: -50%;
    }
    .gdsv {
      display: block;
      width: 100%;
      height: 100%;
    }
  `;

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('mousedown', this._onGripperMouseDown as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('mousedown', this._onGripperMouseDown as EventListener);
    document.removeEventListener('mousemove', this._onGripperMouseMove);
    document.removeEventListener('mouseup', this._onGripperMouseUp);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tab click handler
  // ═══════════════════════════════════════════════════════════════════════════

  private _handleTabClick(tabId: TabId) {
    // If clicking the already-active tab: toggle collapse
    if (tabId === this.activeTab && !this.collapsed) {
      this.collapsed = true;
      this._previousTab = this.activeTab;
      this.activeTab = '' as TabId;
      this.dispatchEvent(
        new CustomEvent<CollapseToggleEventDetail>('collapse-toggle', {
          detail: { collapsed: true },
          bubbles: true,
          composed: true,
        })
      );
      this.dispatchEvent(
        new CustomEvent<TabChangeEventDetail>('tab-change', {
          detail: { tab: '' as TabId },
          bubbles: true,
          composed: true,
        })
      );
      return;
    }

    // If collapsed: expand to the clicked tab
    if (this.collapsed) {
      this.collapsed = false;
    }

    // Set the active tab
    const prev = this.activeTab;
    this.activeTab = tabId;

    // Dispatch events
    this.dispatchEvent(
      new CustomEvent<TabChangeEventDetail>('tab-change', {
        detail: { tab: tabId },
        bubbles: true,
        composed: true,
      })
    );

    if (this.collapsed === false && (prev as string) === '') {
      this.dispatchEvent(
        new CustomEvent<CollapseToggleEventDetail>('collapse-toggle', {
          detail: { collapsed: false },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Gripper drag handlers
  // ═══════════════════════════════════════════════════════════════════════════

  private _onGripperMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.gb')) return;

    this._isDragging = true;
    this._dragStartX = e.clientX;

    const gripper = this.shadowRoot?.querySelector('.gb');
    gripper?.classList.add('ga');

    this.dispatchEvent(
      new CustomEvent('right-column-drag-start', {
        detail: { clientX: e.clientX },
        bubbles: true,
        composed: true,
      })
    );

    document.addEventListener('mousemove', this._onGripperMouseMove);
    document.addEventListener('mouseup', this._onGripperMouseUp);
    e.preventDefault();
  };

  private _onGripperMouseMove = (e: MouseEvent) => {
    if (!this._isDragging) return;
    const deltaX = this._dragStartX - e.clientX;

    this.dispatchEvent(
      new CustomEvent('right-column-drag-move', {
        detail: { clientX: e.clientX, deltaX },
        bubbles: true,
        composed: true,
      })
    );
  };

  private _onGripperMouseUp = () => {
    this._isDragging = false;

    const gripper = this.shadowRoot?.querySelector('.gb');
    gripper?.classList.remove('ga');

    this.dispatchEvent(
      new CustomEvent('right-column-drag-end', {
        bubbles: true,
        composed: true,
      })
    );

    document.removeEventListener('mousemove', this._onGripperMouseMove);
    document.removeEventListener('mouseup', this._onGripperMouseUp);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  render() {
    const currentTab = this.activeTab;

    // Filter tabs by role — if allowedTabs is set, only show those.
    // If unset (dev mode / no role), show all (backwards-compatible).
    const visibleTabs = this.allowedTabs
      ? TABS.filter(tab => this.allowedTabs.split(',').includes(tab.id))
      : TABS;

    return html`
      <div class="sb">
        <!-- Logo -->
        <div class="lo">
          <div class="lc">
            <slot name="logo">
              <div class="lp">LOGO</div>
            </slot>
          </div>
        </div>

        <!-- Tab buttons (role-filtered) -->
        ${visibleTabs.map(
          (tab) => html`
            <button
              type="button"
              class="nb ${currentTab === tab.id ? 'na' : ''}"
              @click=${() => this._handleTabClick(tab.id)}
              title="${tab.tooltip}"
            >
              <div class="ni ${currentTab === tab.id ? 'ns' : ''}">
                <div class="iw">
                  <div class="ic">
                    <!-- Monochrome mask layer -->
                    <svg class="nm" fill="none" viewBox="0 0 26 25">
                      <path d="M26 0H0V25H26V0Z" fill="white" fill-opacity="0.01" />
                    </svg>
                    <!-- Colored icon -->
                    <svg class="nsv" fill="none" viewBox="0 0 22.75 21.8752">
                      <path fill="#4ECFD5" d="${tab.svgPath}" />
                    </svg>
                  </div>
                </div>
                <div class="lw ${currentTab === tab.id ? 'ls' : ''}">
                  <span class="lt">${tab.label}</span>
                </div>
              </div>
            </button>
          `
        )}

        <!-- Gripper (drag-to-resize handle) -->
        <button
          type="button"
          class="gb"
          aria-label="Drag to resize right column"
          title="Drag to resize · Double-click to snap to center"
        >
          <div class="gfr">
            <div class="gpc">
              <div class="gsh">
                <div class="gro">
                  <div class="gco">
                    <!-- Top grip dots -->
                    <div class="grt">
                      <div class="gri">
                        <div class="grc">
                          <div class="gdl">
                            <div class="gds">
                              <div class="gdi">
                                <svg class="gdsv" fill="none" viewBox="0 0 4 4">
                                  <path
                                    stroke="white"
                                    stroke-linecap="round"
                                    stroke-width="2"
                                    d="M2 3C2.55228 3 3 2.55228 3 2C3 1.44772 2.55228 1 2 1C1.44772 1 1 1.44772 1 2C1 2.55228 1.44772 3 2 3Z"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                          <div class="gdr">
                            <div class="gds">
                              <div class="gdi">
                                <svg class="gdsv" fill="none" viewBox="0 0 4 4">
                                  <path
                                    stroke="white"
                                    stroke-linecap="round"
                                    stroke-width="2"
                                    d="M2 3C2.55228 3 3 2.55228 3 2C3 1.44772 2.55228 1 2 1C1.44772 1 1 1.44772 1 2C1 2.55228 1.44772 3 2 3Z"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- Bottom grip dots -->
                    <div class="grb">
                      <div class="gri">
                        <div class="grc">
                          <div class="gdl">
                            <div class="gds">
                              <div class="gdi">
                                <svg class="gdsv" fill="none" viewBox="0 0 4 4">
                                  <path
                                    stroke="white"
                                    stroke-linecap="round"
                                    stroke-width="2"
                                    d="M2 3C2.55228 3 3 2.55228 3 2C3 1.44772 2.55228 1 2 1C1.44772 1 1 1.44772 1 2C1 2.55228 1.44772 3 2 3Z"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                          <div class="gdr">
                            <div class="gds">
                              <div class="gdi">
                                <svg class="gdsv" fill="none" viewBox="0 0 4 4">
                                  <path
                                    stroke="white"
                                    stroke-linecap="round"
                                    stroke-width="2"
                                    d="M2 3C2.55228 3 3 2.55228 3 2C3 1.44772 2.55228 1 2 1C1.44772 1 1 1.44772 1 2C1 2.55228 1.44772 3 2 3Z"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </button>
      </div>
    `;
  }
}

// ── Register custom element ──────────────────────────────────────────────────
customElements.define('chat-navigation-bar', ChatNavigationBar);

// ── JSX type declaration for React/TypeScript consumers ─────────────────────
declare global {
  interface HTMLElementTagNameMap {
    'chat-navigation-bar': ChatNavigationBar;
  }
}

// Extend JSX intrinsic elements so <chat-navigation-bar> is recognized in TSX
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'chat-navigation-bar': React.DetailedHTMLProps<
        React.HTMLAttributes<ChatNavigationBar> & {
          'active-tab'?: TabId | '';
          collapsed?: 'true' | 'false';
          'allowed-tabs'?: string;
          ref?: React.Ref<ChatNavigationBar>;
        },
        ChatNavigationBar
      >;
    }
  }
}
