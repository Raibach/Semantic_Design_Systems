/**
 * <agent-card-element> — Lit web component implementing the four-slot agent card.
 *
 * Pixel-identical to the React DesignCard (PromptDashboardCanvas.tsx).
 * Same Figma spec: 278×359px, node 40000236:9156.
 *
 * Slot A (top-left 12px):  model name    e.g. "MS Copilot"
 * Slot B (top 14px bold):  category      e.g. "Design System"
 * Slot C (top-right badge): timestamp    e.g. "Today · 2:30 PM"
 * Slot D (desc 18px bold):  title        only location for title
 *
 * Props are passed as HTML attributes or .props object.
 * This is the "first Lit call" — no React in the render path.
 */

import { LitElement, html, css } from 'lit';
import { getImageAlt, getImageUrl, isImageDecorative } from './a2ui-image-catalog';
import cardBgDesignSystem from '@/assets/5e6d8c1ff1f88eac724c57dccba01dde4c5a1bba.png';
import cardImgDefault from '@/assets/a0c698671eb795bc84024e87ad7c0b231c53115c.png';
import moleculeLogo from '@/assets/Molecule_fill.svg';

// Decorators removed — Lit 3.x TC39 decorators conflict with TypeScript legacy
// decorator emit. Using static properties + customElements.define() instead,
// which needs zero tsconfig/decorator configuration.

// ── Assets resolved via A2UI image catalog (catalog IDs → Vite-bundled URLs) ─

// ── Category themes (exact match to React CARD_THEMES) ──────────────────────
interface CardTheme {
  label: string;
  fill: string;
  titleColor: string;
  textColor: string;
  modelName: string;
  showPromptLabel: boolean;
  isLightBg: boolean;
  bottomFill: string;
  bottomText: string;
}

const THEMES: Record<string, CardTheme> = {
  writing: {
    label: 'Writing', fill: '#658D1B', titleColor: '#fff', textColor: '#fff',
    modelName: 'DeepSeek', showPromptLabel: true, isLightBg: false,
    bottomFill: '#387386', bottomText: '#fff',
  },
  ds: {
    label: 'Design System', fill: '#10455F', titleColor: '#fb8d67', textColor: '#fff',
    modelName: 'MS Copilot', showPromptLabel: true, isLightBg: false,
    bottomFill: '#387386', bottomText: '#fff',
  },
  learning: {
    label: 'Learning Module', fill: '#589678', titleColor: '#f6c031', textColor: '#fff',
    modelName: 'Claude', showPromptLabel: false, isLightBg: false,
    bottomFill: '#387386', bottomText: '#fff',
  },
  graphics: {
    label: 'Graphics', fill: '#D3DF44', titleColor: '#484460', textColor: '#484460',
    modelName: 'GPT-4o', showPromptLabel: false, isLightBg: true,
    bottomFill: 'rgba(72,68,96,0.15)', bottomText: '#484460',
  },
  coding: {
    label: 'Coding', fill: '#D29207', titleColor: '#fff', textColor: '#fff',
    modelName: 'DeepSeek Coder', showPromptLabel: true, isLightBg: false,
    bottomFill: '#387386', bottomText: '#fff',
  },
};

function resolveTheme(category?: string): CardTheme {
  const cat = (category || '').toLowerCase();
  if (cat.includes('design') || cat.includes('ds') || cat.includes('figma')) return THEMES.ds;
  if (cat.includes('learn') || cat.includes('train') || cat.includes('module')) return THEMES.learning;
  if (cat.includes('graphic') || cat.includes('image') || cat.includes('visual')) return THEMES.graphics;
  if (cat.includes('writ') || cat.includes('text') || cat.includes('report') || cat.includes('doc')) return THEMES.writing;
  if (cat.includes('cod') || cat.includes('dev') || cat.includes('program') || cat.includes('engineer')) return THEMES.coding;
  return THEMES.ds;
}

// ── Relative timestamp formatter ─────────────────────────────────────────────
function formatRelativeTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays === 0) return `Today · ${timeStr}`;
  if (diffDays === 1) return `Yesterday · ${timeStr}`;
  if (diffDays < 7) return `Last week`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════════
export class AgentCardElement extends LitElement {
  // ── Reactive properties (static getter — no decorators needed) ────────────
  static properties = {
    id: { type: String },
    title: { type: String },
    category: { type: String },
    description: { type: String },
    username: { type: String },
    teamName: { type: String, attribute: 'team-name' },
    version: { type: Number },
    status: { type: String },
    likes: { type: Number },
    modelName: { type: String, attribute: 'model-name' },
    lastUsed: { type: String, attribute: 'last-used' },
    createdAt: { type: String, attribute: 'created-at' },
  };

  // ── Default values ──────────────────────────────────────────────────────
  id: string = '';
  title: string = '';
  category: string = '';
  description: string = '';
  username: string = '';
  teamName: string = '';
  version: number = 1;
  status: string = 'Active';
  likes: number = 0;
  modelName: string = '';
  lastUsed: string = '';
  createdAt: string = '';

  // ── Shadow DOM styles — all Tailwind classes translated to raw CSS ───────
  static styles = css`
    /* Reset — global CSS does NOT penetrate Shadow DOM */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host {
      display: block;
      width: 278px;
      height: 359px;
      padding: 0;
      margin: 0;
      line-height: 0;
      overflow: hidden;
    }

    .card {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0px 4px 4px 0px rgba(0,0,0,0.25);
      padding: 0;
      margin: 0;
      font-size: 0;
      line-height: 0;
    }

    .bg-svg {
      position: absolute;
      display: block;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    /* Slot A — Model name (React: top-[21px] + -translate-y-1/2 on 20px h) */
    .slot-a {
      position: absolute;
      left: 66.89px;
      top: 21px;
      width: 199px;
      height: 20px;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      font-weight: 500;
      font-size: 12px;
      line-height: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      word-break: break-word;
    }
    .slot-a-text {
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      line-height: normal;
    }

    /* Slot C — Timestamp badge */
    .slot-c {
      position: absolute;
      right: 12px;
      top: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 9px;
      letter-spacing: 0.05em;
      background: rgba(255,255,255,0.12);
    }

    /* Molecule overlay (DS only) */
    .molecule-overlay {
      position: absolute;
      left: 7px;
      top: 0;
      width: 57px;
      height: 54px;
      overflow: hidden;
      pointer-events: none;
    }
    .molecule-overlay img {
      position: absolute;
      height: 106%;
      left: 0;
      top: 0;
      width: 100%;
      max-width: none;
    }

    /* Molecule icon */
    .molecule-icon {
      position: absolute;
      left: 19px;
      top: 9px;
    }
    .molecule-icon img {
      width: 28px;
      height: 27px;
    }

    /* Slot B — Category (React: top-[38px] + -translate-y-1/2 on 36px h) */
    .slot-b {
      position: absolute;
      left: 64.89px;
      top: 38px;
      width: 199px;
      height: 36px;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      line-height: 0;
      overflow: hidden;
      word-break: break-word;
    }
    .slot-b-text {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      line-height: normal;
    }

    /* Slot D — Description area (React: top-[60px] h-[180px] leading-[0]) */
    .slot-d-area {
      position: absolute;
      left: 14.89px;
      top: 60px;
      width: 252px;
      height: 180px;
      font-weight: 400;
      font-size: 12px;
      line-height: 0;
      overflow: hidden;
      word-break: break-word;
    }
    .slot-d-title {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 18px;
      line-height: 22px;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .slot-d-desc {
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 13px;
      line-height: 20px;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* Bottom section — full height from 255px to card bottom, bar SVG is 56px */
    .bottom-section {
      position: absolute;
      left: 1.89px;
      top: 255px;
      right: 1.89px;
      bottom: 0;
    }
    .bottom-bar-svg {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 56px;
    }

    .bottom-team {
      position: absolute;
      left: 65.26px;
      top: 30px;
      width: 204px;
      height: 17px;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 12px;
      line-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bottom-level {
      position: absolute;
      right: 14px;
      top: 4px;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 13px;
      line-height: 20px;
      text-align: right;
      width: 75px;
    }
    .bottom-username {
      position: absolute;
      left: 65px;
      top: 6px;
      width: 189px;
      height: 20px;
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 13px;
      line-height: 20px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bottom-avatar {
      position: absolute;
      left: 16.26px;
      top: 8px;
      width: 39px;
      height: 38px;
    }
    .bottom-avatar img {
      display: block;
      width: 100%;
      height: 100%;
      max-width: none;
    }
    .bottom-favorite {
      position: absolute;
      left: 239px;
      top: 65px;
      width: 27px;
      height: 27px;
      overflow: hidden;
    }
    .bottom-version-badge {
      position: absolute;
      left: 7.89px;
      top: 52px;
      width: 160px;
      height: 45px;
      border-radius: 5px;
    }
    .bottom-version-pill {
      position: absolute;
      left: 0;
      top: 15px;
      width: 136px;
      height: 27px;
      border: 1px solid rgba(74,164,144,0.5);
      border-radius: 20px;
    }
    .bottom-version-text {
      position: absolute;
      left: 12px;
      top: 14px;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 14px;
      line-height: 28px;
      white-space: pre-wrap;
    }
    .bottom-version-status {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
    }
    .bottom-likes {
      position: absolute;
      right: 35px;
      top: 74px;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 13px;
      line-height: 20px;
      text-align: right;
      width: 70px;
      color: #fff;
    }
    .bottom-thumbs {
      position: absolute;
      left: 246.89px;
      top: 69px;
      width: 22px;
      height: 22px;
      overflow: hidden;
      color: rgba(255,255,255,0.7);
    }
    .bottom-thumbs svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
    }
  `;

  render() {
    const v = this.version ?? 1;
    const safeStatus = this.status || 'Active';
    const theme = resolveTheme(this.category);
    const displayModel = this.modelName || theme.modelName;
    const timestamp = formatRelativeTime(this.lastUsed || this.createdAt);
    const likeCount = this.likes ?? 0;
    const isDS = theme === THEMES.ds;

    return html`
      <div class="card" data-tag="agent-card" data-node-id="40000236:9156">
        <!-- Card background SVG -->
        <svg class="bg-svg" fill="none" viewBox="0 0 278.369 359" preserveAspectRatio="none">
          <path d="M10 0.25H268.369C273.754 0.25 278.119 4.61522 278.119 10V349C278.119 354.385 273.754 358.75 268.369 358.75H10C4.61523 358.75 0.25 354.385 0.25 349V10C0.250001 4.61522 4.61522 0.25 10 0.25Z"
                fill="${theme.fill}" stroke="#FFE9D4" stroke-width="0.5" />
        </svg>

        <!-- Slot A — Model name -->
        <div class="slot-a" style="color:${theme.textColor}"><span class="slot-a-text">${displayModel}</span></div>

        <!-- Slot C — Timestamp badge -->
        ${timestamp ? html`<div class="slot-c" style="color:${theme.textColor}">${timestamp}</div>` : ''}

        <!-- Molecule overlay (DS only) -->
        ${isDS ? html`
          <div class="molecule-overlay">
            <img src="${cardImgDefault}" alt="${getImageAlt('card-img-default')}" ?aria-hidden="${isImageDecorative('card-img-default')}" loading="lazy" data-a2ui-id="card-img-default" @error=${() => console.warn('[agent-card] Failed to load card-img-default')} />
          </div>
        ` : ''}

        <!-- Molecule icon -->
        <div class="molecule-icon">
          <img src="${moleculeLogo}" alt="${getImageAlt('molecule-logo')}" loading="lazy" data-a2ui-id="molecule-logo" @error=${() => console.warn('[agent-card] Failed to load molecule-logo')} />
        </div>

        <!-- Slot B — Category -->
        <div class="slot-b" style="color:${theme.titleColor}"><span class="slot-b-text">${this.category || theme.label}</span></div>

        <!-- Slot D — Description area with title (both line-clamped at 2 lines) -->
        <div class="slot-d-area" style="color:${theme.textColor}">
          <div class="slot-d-title" style="color:${theme.textColor}">${this.title}</div>
          ${this.description ? html`
            <span class="slot-d-desc" style="color:${theme.textColor}">${this.description}</span>
          ` : ''}
        </div>

        <!-- Bottom section -->
        <div class="bottom-section">
          <!-- Bottom background bar — 56px -->
          <svg class="bottom-bar-svg" fill="none" viewBox="0 0 274 56" preserveAspectRatio="none">
            <path d="M0 0H274V56H0V0Z" fill="${theme.bottomFill}" />
          </svg>

          <!-- Team name -->
          <div class="bottom-team" style="color:${theme.bottomText}">${this.teamName || ''}</div>

          <!-- LEVEL badge -->
          <div class="bottom-level" style="color:${theme.bottomText}">LEVEL ${Math.min(v, 99)}</div>

          <!-- @username -->
          <div class="bottom-username" style="color:${theme.bottomText}">${this.username ? '@' + this.username : ''}</div>

          <!-- Avatar -->
          <div class="bottom-avatar">
            <img src="${cardBgDesignSystem}" alt="${getImageAlt('card-bg-design-system')}" ?aria-hidden="${isImageDecorative('card-bg-design-system')}" loading="lazy" data-a2ui-id="card-bg-design-system" @error=${() => console.warn('[agent-card] Failed to load card-bg-design-system')} />
          </div>

          <!-- Favorite icon -->
          <div class="bottom-favorite">
            <div style="position:absolute;inset:0;background:rgba(255,255,255,0);mix-blend-mode:multiply;pointer-events:none"></div>
          </div>

          <!-- Version badge -->
          <div class="bottom-version-badge">
            <div class="bottom-version-pill"></div>
            <div class="bottom-version-text" style="color:${theme.bottomText}">
              v. ${v}  |  <span class="bottom-version-status" style="color:${theme.bottomText}">${safeStatus}</span>
            </div>
          </div>

          <!-- Like count -->
          <div class="bottom-likes">${likeCount}</div>

          <!-- Thumbs up -->
          <div class="bottom-thumbs">
            <svg viewBox="0 0 24 24">
              <path d="M2 9.75C2 9.33579 2.33579 9 2.75 9H5.5V20H2.75C2.33579 20 2 19.6642 2 19.25V9.75ZM7 20V9L13.1793 2.17058C13.4935 1.85639 14 2.07714 14 2.51452V7.5H20.2763C21.1626 7.5 21.831 8.29151 21.6835 9.16411L20.1835 18.1641C20.0698 18.8371 19.4852 19.3359 18.8024 19.3359H7Z" />
            </svg>
          </div>
        </div>
      </div>
    `;
  }
}

// Register the custom element (no decorator needed)
customElements.define('agent-card-element', AgentCardElement);

declare global {
  interface HTMLElementTagNameMap {
    'agent-card-element': AgentCardElement;
  }
}
