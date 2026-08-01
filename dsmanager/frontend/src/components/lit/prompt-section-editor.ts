/**
 * <prompt-section-editor> — Vanilla Web Component (plain HTML + CSS + JS)
 *
 * NO Lit. NO TypeScript decorators or special syntax required.
 * The AI can emit this tag directly. Humans can copy the source and style it.
 *
 * Preserved contract (exact same behavior as the previous rich implementation):
 * - Role types: System, User, Tool, Agent, Few Shot, Context, Constraints + custom (with icons)
 * - Per-section collapse/expand + left rail (number)
 * - Drag to reorder + ↑ ↓ buttons
 * - Add / Remove sections
 * - Auto-resizing textareas (on input + after structural changes)
 * - data-section-container, data-section-name, data-tag="prompt-section"
 * - Window events CONSUMED (AI can drive it):
 *     set-left-column-text   { content, target }
 *     force-set-section      { sectionName, content }
 *     add-prompt-role        { roleName, placeholder? }
 *     remove-prompt-role     { roleName }
 * - Events EMITTED:
 *     section-update, section-add, section-remove, section-reorder
 *     run-requested   { sections }
 *     save-requested  { sections }
 * - Normalizes any DB shape: name | section | role | type  →  name
 * - Properties: sections (array), session-id, is-running
 * - Can be used from React (via ref + .sections = [...] or attributes)
 * - Can be emitted by AI as pure HTML:
 *     <prompt-section-editor sections='[{"name":"System","content":"...","type":"system"}]'></prompt-section-editor>
 *
 * Styling: All CSS is inside the component (shadow DOM). You can later extract
 * the <style> block and theme it to match your design tokens.
 */

export interface PromptSection {
  name: string;
  content: string;
  type?: string;
  position?: number;
  visible?: boolean;
}

class PromptSectionEditor extends HTMLElement {
  private _sections: PromptSection[] = [];
  private _sessionId: string | null = null;
  private _isRunning = false;
  private _dragIndex: number | null = null;
  private _collapsed = new Set<number>();

  static get observedAttributes() {
    return ['session-id', 'is-running'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // Support initial sections via attribute (JSON) for pure HTML/AI emission
    if (this.hasAttribute('sections')) {
      try {
        const raw = JSON.parse(this.getAttribute('sections') || '[]');
        if (Array.isArray(raw)) {
          this._sections = raw.map((s: any) => this._normalizeSection(s));
        }
      } catch {}
    }

    // Seed real default sections (Figma-matched) so left column is never empty "0 sections"
    if (this._sections.length === 0) {
      this._sections = [
        { name: 'System', content: 'You are an expert in semantic design systems and A2UI protocol.', type: 'system' },
        { name: 'User', content: '', type: 'user' },
        { name: 'Constraints', content: 'Match Figma specs exactly: Inter SemiBold 16px, 25px line-height, #000 text, double-shadow rounded-6 cards.', type: 'constraints' }
      ];
    }

    this._render();

    window.addEventListener('set-left-column-text', this._onSetText as EventListener);
    window.addEventListener('force-set-section', this._onForceSet as EventListener);
    window.addEventListener('add-prompt-role', this._onAddRole as EventListener);
    window.addEventListener('remove-prompt-role', this._onRemoveRole as EventListener);
  }

  disconnectedCallback() {
    window.removeEventListener('set-left-column-text', this._onSetText as EventListener);
    window.removeEventListener('force-set-section', this._onForceSet as EventListener);
    window.removeEventListener('add-prompt-role', this._onAddRole as EventListener);
    window.removeEventListener('remove-prompt-role', this._onRemoveRole as EventListener);
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (name === 'session-id') {
      this._sessionId = newValue;
    }
    if (name === 'is-running') {
      this._isRunning = newValue === '' || newValue === 'true';
    }
    this._render();
  }

  // Public API — React host and AI can use these
  set sections(value: any) {
    if (Array.isArray(value)) {
      this._sections = value.map((s: any) => this._normalizeSection(s));
    } else {
      this._sections = [];
    }
    this._render();
  }

  get sections(): PromptSection[] {
    return [...this._sections];
  }

  set sessionId(val: string | null) {
    this._sessionId = val;
    if (val) this.setAttribute('session-id', val);
    else this.removeAttribute('session-id');
  }
  get sessionId() { return this._sessionId; }

  set isRunning(val: boolean) {
    this._isRunning = !!val;
    if (val) this.setAttribute('is-running', '');
    else this.removeAttribute('is-running');
    this._render();
  }
  get isRunning() { return this._isRunning; }

  private _normalizeSection(s: any): PromptSection {
    if (!s || typeof s !== 'object') return { name: 'Section', content: '' };
    return {
      name: s.name || s.section || s.role || s.type || 'Section',
      content: s.content || '',
      type: s.type || s.role || s.name || 'custom',
      position: typeof s.position === 'number' ? s.position : undefined,
      visible: s.visible !== false,
    };
  }

  private _getName(s: any): string {
    if (!s || typeof s !== 'object') return 'Section';
    return s.name || s.section || s.role || s.type || 'Section';
  }

  private _getType(s: any): string {
    if (!s || typeof s !== 'object') return 'custom';
    return s.type || s.role || s.name || 'custom';
  }

  private _render() {
    if (!this.shadowRoot) return;

    // Snapshot current textarea values so we don't lose typing when we re-render for collapse/move/etc.
    this.shadowRoot.querySelectorAll('textarea[data-index]').forEach((ta) => {
      const idx = parseInt((ta as HTMLElement).getAttribute('data-index') || '-1', 10);
      if (idx >= 0 && this._sections[idx]) {
        this._sections[idx] = { ...this._sections[idx], content: (ta as HTMLTextAreaElement).value };
      }
    });

    const css = `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: #fff;
        border-right: 1px solid #e5e7eb;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .header {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 600;
        color: #374151;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    .section {
      margin: 8px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #fff;
      box-shadow: -4px -4px 10px 0px rgba(0,0,0,0.15), 4px 4px 10px 0px rgba(0,0,0,0.15);
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      font-size: 18px;
      font-weight: 700;
      color: #171717;
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      cursor: grab;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .section-header:active { cursor: grabbing; }
    .left-rail {
      width: 28px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 6px;
      color: #9ca3af;
      font-size: 10px;
    }
    textarea {
      width: 100%;
      min-height: 72px;
      padding: 12px;
      border: none;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 600;
      font-size: 16px;
      line-height: 25px;
      color: #000;
      resize: vertical;
      background: #fff;
    }
      .controls {
        display: flex;
        gap: 4px;
        padding: 4px 8px;
      }
      button {
        font-size: 10px;
        padding: 2px 6px;
        border: 1px solid #d1d5db;
        background: #fff;
        border-radius: 4px;
        cursor: pointer;
      }
      button:hover { background: #f3f4f6; }
      .footer {
        padding: 8px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
      }
      .collapse-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px;
        font-size: 12px;
      }
      .role-icon {
        margin-right: 6px;
      }
    `;

    // Proper escaping so user content with < & > " ' does not break the rendered HTML
    const escapeAttr = (s: string) => String(s || '')
      .replace(/&/g, '&')
      .replace(/"/g, '"')
      .replace(/'/g, '&#39;')
      .replace(/</g, '<')
      .replace(/>/g, '>');

    const escapeText = (s: string) => String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>');

    const sectionsHtml = (this._sections || [])
      .filter((sec: any) => sec && typeof sec === 'object')
      .map((sec, i) => {
        const name = this._getName(sec);
        const type = this._getType(sec);
        const isCollapsed = this._collapsed.has(i);
        const t = String(type || 'custom').toLowerCase();
        const icon = t.includes('system') ? '⚡' :
                     t.includes('agent') ? '🗄️' :
                     t.includes('tool') ? '🔧' : '📝';
        const displayName = String(name || 'Section');
        const safeDisplayAttr = escapeAttr(displayName);
        const safeDisplayText = escapeText(displayName);
        const safeContent = escapeText(sec.content || '');
        const safePlaceholder = escapeAttr(`Enter ${displayName.toLowerCase()} content...`);

        return `
          <div class="section"
               data-index="${i}"
               draggable="true"
               data-section-container
               data-section-name="${safeDisplayAttr}"
               data-tag="prompt-section">
            <div class="section-header">
              <span>
                <span class="role-icon">${icon}</span>
                ${safeDisplayText}
              </span>
              <div>
                <button class="collapse-btn" data-action="toggle" data-index="${i}">${isCollapsed ? '▶' : '▼'}</button>
                <button data-action="up" data-index="${i}">↑</button>
                <button data-action="down" data-index="${i}">↓</button>
                <button data-action="remove" data-index="${i}">✕</button>
              </div>
            </div>
            <div style="display:flex;">
              <div class="left-rail">
                <span>${i + 1}</span>
              </div>
              <textarea
                data-index="${i}"
                data-section-name="${safeDisplayAttr}"
                placeholder="${safePlaceholder}"
                style="display: ${isCollapsed ? 'none' : 'block'};"
              >${safeContent}</textarea>
            </div>
          </div>
        `;
      }).join('');

    this.shadowRoot.innerHTML = `
      <style>${css}</style>
      <div class="header">
        <span>Prompt Sections</span>
        <span style="font-size:10px; color:#9ca3af;">${this._sections.length} sections</span>
      </div>
      ${sectionsHtml}
      <!-- Internal footer removed — bottom control bar is now the Figma-specified <control-bar> 
           rendered by WritingAreaIndex inside the left column flex wrapper.
           Run / Save are triggered exclusively via the bar's save-click / run-click events,
           which are wired to the existing CRUD paths (handleSavePromptRef + run-requested dispatch).
           This keeps the visual design exactly as the wireframe while preserving all paid save/run/version logic. -->
    `;

    this._attachListeners();
  }

  private _attachListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    // Event delegation for buttons
    root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      const idxAttr = btn.getAttribute('data-index');
      const idx = idxAttr !== null ? parseInt(idxAttr, 10) : -1;

      if (action === 'add') this._addSection();
      else if (action === 'run') this._requestRun();
      else if (action === 'save') this._requestSave();
      else if (action === 'toggle' && idx >= 0) this._toggleCollapse(idx);
      else if (action === 'up' && idx >= 0) this._moveSection(idx, idx - 1);
      else if (action === 'down' && idx >= 0) this._moveSection(idx, idx + 1);
      else if (action === 'remove' && idx >= 0) this._removeSection(idx);
    });

    // Live content sync + auto-resize (no full re-render while typing)
    root.addEventListener('input', (e) => {
      const ta = e.target as HTMLTextAreaElement;
      if (!ta || ta.tagName !== 'TEXTAREA') return;
      const idxAttr = ta.getAttribute('data-index');
      const idx = idxAttr !== null ? parseInt(idxAttr, 10) : -1;
      if (idx < 0 || !this._sections[idx]) return;

      this._sections[idx] = { ...this._sections[idx], content: ta.value };
      this._emitUpdate(idx);
      this._adjustHeight(ta);
    });

    // Drag & drop
    root.querySelectorAll('.section').forEach((el, i) => {
      const sec = el as HTMLElement;
      sec.addEventListener('dragstart', (ev) => {
        this._dragIndex = i;
        ev.dataTransfer?.setData('text/plain', String(i));
      });
      sec.addEventListener('dragover', (ev) => ev.preventDefault());
      sec.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const fromStr = ev.dataTransfer?.getData('text/plain');
        const from = fromStr ? parseInt(fromStr, 10) : this._dragIndex;
        if (from != null && from !== i) {
          this._moveSection(from, i);
        }
        this._dragIndex = null;
      });
    });

    // Initial auto-size for visible textareas
    root.querySelectorAll('textarea').forEach((ta) => {
      this._adjustHeight(ta as HTMLTextAreaElement);
    });
  }

  // ── Core behaviors ─────────────────────────────────────────────────────────

  private _emitUpdate(index: number) {
    this.dispatchEvent(new CustomEvent('section-update', {
      bubbles: true,
      composed: true,
      detail: { index, section: this._sections[index] },
    }));
  }

  private _updateContent(index: number, value: string) {
    if (!this._sections[index]) return;
    this._sections[index] = { ...this._sections[index], content: value };
    this._emitUpdate(index);
  }

  private _removeSection(index: number) {
    const removed = this._sections[index];
    this._sections.splice(index, 1);
    this._collapsed.delete(index);
    this.dispatchEvent(new CustomEvent('section-remove', {
      bubbles: true,
      composed: true,
      detail: { index, name: this._getName(removed) },
    }));
    this._render();
  }

  private _addSection() {
    const name = `Custom Role ${this._sections.length + 1}`;
    const newSection: PromptSection = { name, content: '', type: 'custom', position: this._sections.length };
    this._sections.push(newSection);
    this.dispatchEvent(new CustomEvent('section-add', {
      bubbles: true,
      composed: true,
      detail: { section: newSection },
    }));
    this._render();
  }

  private _moveSection(from: number, to: number) {
    if (to < 0 || to >= this._sections.length) return;
    const [item] = this._sections.splice(from, 1);
    this._sections.splice(to, 0, item);
    this.dispatchEvent(new CustomEvent('section-reorder', {
      bubbles: true,
      composed: true,
      detail: { from, to },
    }));
    this._render();
  }

  private _toggleCollapse(index: number) {
    if (this._collapsed.has(index)) {
      this._collapsed.delete(index);
    } else {
      this._collapsed.add(index);
    }
    this._render();
  }

  private _requestRun() {
    this.dispatchEvent(new CustomEvent('run-requested', {
      bubbles: true,
      composed: true,
      detail: { sections: this._sections },
    }));
  }

  private _requestSave() {
    this.dispatchEvent(new CustomEvent('save-requested', {
      bubbles: true,
      composed: true,
      detail: { sections: this._sections },
    }));
  }

  private _adjustHeight(ta: HTMLTextAreaElement | null) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(50, ta.scrollHeight) + 'px';
  }

  // ── AI / external event surface ────────────────────────────────────────────

  private _onSetText = (e: Event) => {
    const { content, target } = (e as CustomEvent).detail || {};
    if (!target || content === undefined) return;
    const idx = this._sections.findIndex(s => this._getName(s).toLowerCase() === String(target).toLowerCase());
    if (idx >= 0) {
      this._sections[idx] = { ...this._sections[idx], content };
      this._emitUpdate(idx);
      this._render();
    }
  };

  private _onForceSet = (e: Event) => {
    const { sectionName, content } = (e as CustomEvent).detail || {};
    if (!sectionName || content === undefined) return;
    const idx = this._sections.findIndex(s => this._getName(s) === sectionName);
    if (idx >= 0) {
      this._sections[idx] = { ...this._sections[idx], content };
      this._emitUpdate(idx);
      this._render();
    }
  };

  private _onAddRole = (e: Event) => {
    const { roleName, placeholder } = (e as CustomEvent).detail || {};
    if (!roleName) return;
    const newSec: PromptSection = { name: roleName, content: placeholder || '', type: roleName, position: this._sections.length };
    this._sections.push(newSec);
    this.dispatchEvent(new CustomEvent('section-add', { bubbles: true, composed: true, detail: { section: newSec } }));
    this._render();
  };

  private _onRemoveRole = (e: Event) => {
    const { roleName } = (e as CustomEvent).detail || {};
    if (!roleName) return;
    const idx = this._sections.findIndex(s => this._getName(s) === roleName);
    if (idx >= 0) {
      this._removeSection(idx);
    }
  };
}

customElements.define('prompt-section-editor', PromptSectionEditor);

// Keep the same global declarations so React JSX and TypeScript tooling still recognize the tag
declare global {
  interface HTMLElementTagNameMap {
    'prompt-section-editor': PromptSectionEditor;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'prompt-section-editor': React.DetailedHTMLProps<
        React.HTMLAttributes<PromptSectionEditor> & {
          sections?: any;
          'session-id'?: string;
          'is-running'?: '' | boolean;
        },
        PromptSectionEditor
      >;
    }
  }
}