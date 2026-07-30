/**
 * <agent-card-element> — Lit web component: the A2UI console card.
 *
 * BASE TEMPLATE: Static CSS extracted from Figma node 40000717:17091.
 * This is the foundational card structure. All cards render this immediately.
 *
 * CATEGORY THEMING: Dynamic colors from PostgreSQL (categories table).
 * When a category is assigned, category-color/category-title-color/category-text-color
 * are applied as CSS custom properties.
 *
 * DESIGN UPDATES: When Figma changes, run:
 *   node frontend/scripts/sync-figma-card.mjs
 *   cd frontend && npm run build
 * This regenerates the static CSS from the Figma spec.
 *
 * Figma node: 40000717:17091 ("console-card")
 * File key: 20UPR2KQMsbAxlo5NJb1se
 */

import { LitElement, html, css } from 'lit';
import { getImageAlt, isImageDecorative } from './a2ui-image-catalog';
import cardBgDesignSystem from '@/assets/5e6d8c1ff1f88eac724c57dccba01dde4c5a1bba.png';

// ── Component ──────────────────────────────────────────────────────────────

export class AgentCardElement extends LitElement {
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
    avatarUrl: { type: String, attribute: 'avatar-url' },
    categoryColor: { type: String, attribute: 'category-color' },
    categoryTitleColor: { type: String, attribute: 'category-title-color' },
    categoryTextColor: { type: String, attribute: 'category-text-color' },
  };

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
  avatarUrl: string = '';
  categoryColor: string = '';
  categoryTitleColor: string = '';
  categoryTextColor: string = '';

  // ── BASE TEMPLATE — static CSS from Figma node 40000717:17091 ────────────
  // This is the foundational card structure. All cards render this immediately.
  // When Figma design changes, run: node scripts/sync-figma-card.mjs
  static styles = css`
    /* Reset */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host {
      display: block;
      width: 276px;
      height: 372px;
    }

    /* Base card — neutral gray when no category assigned */
    .card {
      position: relative;
      width: 276px;
      height: 372px;
      background: var(--card-bg, #1B898D);
      border: 1px solid #FFFFFF;
      border-radius: 10px;
      box-shadow:
        4px 4px 10px 0px rgba(0, 0, 0, 0.15),
        -4px -4px 5px 0px rgba(0, 0, 0, 0.1);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
      line-height: 0;
    }

    /* ── card-header — 54px ─────────────────────────────────────────────── */
    .card-header {
      flex: 0 0 54px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      padding: 3px 0;
    }
    .card-logo {
      flex: 0 0 39px;
      width: 39px;
      height: 35px;
    }
    .card-logo svg {
      display: block;
      width: 39px;
      height: 35px;
    }
    .header-text {
      flex: 1 1 auto;
      width: 199px;
      height: 48px;
      display: flex;
      flex-direction: column;
    }
    .model-indicator {
      flex: 0 0 19px;
      font-weight: 700;
      font-size: 12px;
      line-height: 14.5227px;
      color: #FFFFFF;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .category {
      flex: 0 0 29px;
      display: flex;
      align-items: center;
      font-weight: 700;
      font-size: 14px;
      line-height: 16.9432px;
      color: var(--card-title-color, #F6C031);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    /* ── card-content — 201px ───────────────────────────────────────────── */
    .card-content {
      flex: 0 0 201px;
      display: flex;
      flex-direction: column;
      gap: 9px;
      overflow: hidden;
    }
    .card-title {
      flex: 0 0 auto;
      min-height: 26px;
      max-height: 52px;
      font-weight: 700;
      font-size: 18px;
      line-height: 26px;
      color: var(--card-text-color, #FFFFFF);
      overflow: hidden;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .card-description {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .desc-text {
      flex: 0 1 124px;
      font-weight: 600;
      font-size: 13px;
      line-height: 20px;
      color: var(--card-text-color, #FFFFFF);
      overflow: hidden;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 6;
      -webkit-box-orient: vertical;
    }
    .desc-label {
      font-weight: 400;
      font-size: 12px;
    }
    .desc-line-wrap {
      flex: 0 0 auto;
      padding: 0 3px;
    }
    .desc-line {
      width: 100%;
      height: 0;
      border-top: 1px solid #FFFFFF;
    }

    /* ── author-section — 39px ──────────────────────────────────────────── */
    .author-section {
      flex: 0 0 39px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
    }
    .author-avatar {
      flex: 0 0 41px;
      width: 41px;
      height: 39px;
      border-radius: 200px;
      box-shadow: 0 0 0 1px #FFFFFF;
      overflow: hidden;
    }
    .author-avatar img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: fill;
    }
    .author-meta {
      flex: 1 1 auto;
      width: 204px;
      height: 39px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      overflow: hidden;
    }
    .author-username {
      flex: 0 0 20px;
      font-weight: 600;
      font-size: 13px;
      line-height: 20px;
      color: #00437C;
      text-decoration: underline;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .author-role {
      flex: 0 0 17px;
      font-weight: 500;
      font-size: 12px;
      line-height: 16px;
      color: #FFFFFF;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    /* ── footer-details — 28px ──────────────────────────────────────────── */
    .footer-details {
      flex: 0 0 28px;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 5px;
    }
    .version-pill {
      flex: 0 0 164px;
      width: 164px;
      height: 28px;
      border: 1px solid #FFFFFF;
      border-radius: 8px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 5px;
      overflow: hidden;
    }
    .version-text {
      flex: 0 0 81px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      font-weight: 500;
      font-size: 14px;
      line-height: 16.9432px;
      color: #FFFFFF;
      white-space: nowrap;
      overflow: hidden;
    }
    .status-text {
      flex: 0 0 78px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      font-weight: 700;
      font-size: 14px;
      line-height: 16.9432px;
      color: #672223;
      white-space: nowrap;
      overflow: hidden;
    }
    .likes {
      flex: 0 0 84px;
      width: 84px;
      height: 28px;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
    }
    .like-count {
      font-weight: 700;
      font-size: 13px;
      line-height: 20px;
      color: #FFFFFF;
      text-align: right;
      white-space: nowrap;
    }
    .favorite {
      flex: 0 0 30px;
      width: 30px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .favorite svg {
      display: block;
      width: 30px;
      height: 28px;
    }
  `;

  private _validateColor(val: string): string {
    if (!val) return '';
    const s = new Option().style;
    s.color = '';
    s.color = val;
    // If browser accepts it, s.color will be a normalized value
    // If not, it remains empty — fall back to safe default
    return s.color ? val : '';
  }

  render() {
    const v = this.version ?? 1;
    const safeStatus = this.status || 'Active';
    const likeCount = this.likes ?? 0;
    const avatarSrc = this.avatarUrl || cardBgDesignSystem;

    // Category colors — validated, invalid values throw
    const safeColor = this.categoryColor ? this._validateColor(this.categoryColor) : '';
    const safeTitleColor = this.categoryTitleColor ? this._validateColor(this.categoryTitleColor) : '';
    const safeTextColor = this.categoryTextColor ? this._validateColor(this.categoryTextColor) : '';

    return html`
      <div class="card" data-tag="agent-card" data-node-id="40000717:17091"
           style="${safeColor ? `--card-bg: ${safeColor};` : ''}
                  ${safeTitleColor ? `--card-title-color: ${safeTitleColor};` : ''}
                  ${safeTextColor ? `--card-text-color: ${safeTextColor};` : ''}">

        <!-- card-header -->
        <div class="card-header">
          <div class="card-logo">
            <svg viewBox="0 0 39 35" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="18.5" cy="18.5" r="6.5" fill="#FCCD3D"/>
              <path d="M28 28C29.283 28 30 28.8345 30 29.5C30 30.1655 29.283 31 28 31C26.717 31 26 30.1655 26 29.5C26 28.8345 26.717 28 28 28Z" stroke="#FCCD3D" stroke-width="2"/>
              <circle cx="30" cy="7" r="5" fill="#FCCD3D"/>
              <circle cx="8" cy="8" r="4" fill="#FCCD3D"/>
              <circle cx="8" cy="29" r="6" fill="#FCCD3D"/>
              <path d="M29.1807 29.4248L28.3994 30.0498L27.6191 30.6738L23.2646 25.2314C23.8121 24.8433 24.3097 24.3908 24.7471 23.8838L29.1807 29.4248ZM12.0029 23.582C12.4155 24.1087 12.8904 24.5835 13.417 24.9961L10.957 27.457L9.54297 26.043L12.0029 23.582ZM13.417 12.0029C12.8904 12.4155 12.4155 12.8904 12.0029 13.417L7.89258 9.30664L9.30664 7.89258L13.417 12.0029ZM27.457 10.957L24.9961 13.417C24.5835 12.8904 24.1087 12.4155 23.582 12.0029L26.043 9.54297L27.457 10.957Z" fill="#FCCD3D"/>
            </svg>
          </div>
          <div class="header-text">
            <div class="model-indicator">${this.modelName}</div>
            <div class="category">${this.category}</div>
          </div>
        </div>

        <!-- card-content -->
        <div class="card-content">
          <div class="card-title">${this.title}</div>
          <div class="card-description">
            <div class="desc-text"><span class="desc-label">##PROMPT##&nbsp;&nbsp;</span>${this.description}</div>
            <div class="desc-line-wrap"><div class="desc-line"></div></div>
          </div>
        </div>

        <!-- author-section -->
        <div class="author-section">
          <div class="author-avatar">
            <img src="${avatarSrc}" alt="${getImageAlt('card-bg-design-system')}" ?aria-hidden="${isImageDecorative('card-bg-design-system')}" loading="lazy" data-a2ui-id="card-avatar" @error=${() => { throw new Error('[agent-card] Avatar load failed'); }} />
          </div>
          <div class="author-meta">
            <div class="author-username">${this.username ? '@' + this.username : ''}</div>
            <div class="author-role">${this.teamName}</div>
          </div>
        </div>

        <!-- footer-details -->
        <div class="footer-details">
          <div class="version-pill">
            <div class="version-text">Version ${Math.min(v, 99)} |</div>
            <div class="status-text">${safeStatus}</div>
          </div>
          <div class="likes">
            <div class="like-count">${likeCount}</div>
            <div class="favorite">
              <svg viewBox="0 0 30 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.87653 16.5008L14.3451 23.9258L14.3452 23.9258C14.6549 24.1974 14.8098 24.3332 14.9952 24.335H15.0048C15.1902 24.3332 15.3451 24.1974 15.6549 23.9258L24.1235 16.5008C26.6981 14.2435 27.0055 10.3459 24.8167 7.71281L24.6648 7.53011C22.1603 4.51724 17.3913 5.04596 15.6075 8.53425C15.3541 9.02979 14.6459 9.02979 14.3925 8.53425C12.6087 5.04596 7.83972 4.51724 5.33518 7.53011L5.18331 7.71281C2.99446 10.3459 3.30192 14.2435 5.87653 16.5008Z" stroke="#FFDE30" stroke-width="2"/>
                <path d="M5.87653 16.5008L14.3451 23.9258L14.3452 23.9258C14.6549 24.1974 14.8098 24.3332 14.9952 24.335H15.0048C15.1902 24.3332 15.3451 24.1974 15.6549 23.9258L24.1235 16.5008C26.6981 14.2435 27.0055 10.3459 24.8167 7.71281L24.6648 7.53011C22.1603 4.51724 17.3913 5.04596 15.6075 8.53425C15.3541 9.02979 14.6459 9.02979 14.3925 8.53425C12.6087 5.04596 7.83972 4.51724 5.33518 7.53011L5.18331 7.71281C2.99446 10.3459 3.30192 14.2435 5.87653 16.5008Z" stroke="white" stroke-width="2"/>
              </svg>
            </div>
          </div>
        </div>

      </div>
    `;
  }
}

customElements.define('agent-card-element', AgentCardElement);

declare global {
  interface HTMLElementTagNameMap {
    'agent-card-element': AgentCardElement;
  }
}