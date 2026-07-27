/**
 * LexicalEditor — Thin composable Lexical rich-text editor with A2UI command bridge.
 *
 * Composes all extracted plugins and exposes an imperative handle so the AI
 * (via eventBus + XML tags) can control every feature: formatting, insertion,
 * undo/redo, speech-to-text, code view, export, and writing checks.
 *
 * Props allow toolbar mode selection ('full' | 'minimal' | 'none') and readOnly.
 */
import { forwardRef, useImperativeHandle, useRef, useState, useCallback, useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import type { LexicalEditor as LexicalEditorType } from 'lexical';

import { lexicalTheme } from './lexical-theme';
import {
  ContentTrackingPlugin,
  ClipboardPlugin,
  WordCountPlugin,
  EditorInstancePlugin,
  ClearSuggestionsPlugin,
} from './plugins';
import { useEditorFormatting } from './hooks/useEditorFormatting';
// Note: ToolbarPlugin remains in components/ for backward compat; import dynamically or inline.

import { HighlightNode } from '@/nodes/HighlightNode';
import { SuggestionNode } from '@/nodes/SuggestionNode';
import '@/styles/PlaygroundEditorTheme.css';

// ── Types ──────────────────────────────────────────────────────────────

export interface LexicalEditorProps {
  /** Initial markdown or plain text content */
  initialContent?: string;
  /** Callback on every content change */
  onContentChange?: (content: string) => void;
  /** Toolbar mode: 'full' (default), 'minimal', or 'none' */
  toolbar?: 'full' | 'minimal' | 'none';
  /** Read-only mode */
  readOnly?: boolean;
  /** Min height for editor area */
  minHeight?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Light/dark mode */
  isLightMode?: boolean;
  /** Project ID for memory save */
  projectId?: string | null;
  /** Children rendered INSIDE LexicalComposer (for toolbar plugins, etc.) */
  children?: React.ReactNode;
}

/** Imperative methods the AI and parent components can call */
export interface LexicalEditorRef {
  // Content
  getContent: () => string;
  setContent: (content: string) => void;
  insertText: (text: string) => void;
  appendText: (text: string) => void;
  // Formatting
  formatText: (type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code') => void;
  formatBlock: (type: string) => void;
  formatAlign: (alignment: 'left' | 'center' | 'right' | 'justify') => void;
  formatFont: (family?: string, size?: string) => void;
  clearFormatting: () => void;
  // Insert
  insertTable: (rows?: number, cols?: number) => void;
  insertLink: (url: string, text?: string) => void;
  insertHorizontalRule: () => void;
  insertCodeBlock: (language?: string) => void;
  // Navigation
  undo: () => void;
  redo: () => void;
  // View
  toggleCodeView: () => void;
  toggleLock: () => void;
  exportDocument: (format: 'text' | 'markdown' | 'html') => void;
  // AI assisted
  checkWriting: () => Promise<void>;
  applySuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;
  // Speech
  startDictation: () => Promise<void>;
  stopDictation: () => void;
  // Raw editor access
  editor: LexicalEditorType | null;
}

// ── Initial Config ────────────────────────────────────────────────────

const defaultNodes = [
  HeadingNode, QuoteNode, ListNode, ListItemNode,
  CodeNode, CodeHighlightNode, TableNode, TableCellNode,
  TableRowNode, AutoLinkNode, LinkNode, HorizontalRuleNode,
  HighlightNode, SuggestionNode,
];

function createInitialConfig(namespace: string, readOnly: boolean) {
  return {
    namespace,
    theme: lexicalTheme,
    onError: (error: Error) => console.error('Lexical error:', error),
    nodes: defaultNodes,
    editable: !readOnly,
  };
}

// ── Component ─────────────────────────────────────────────────────────

const LexicalEditorImpl = (
  props: LexicalEditorProps,
  ref: React.ForwardedRef<LexicalEditorRef>,
) => {
  const {
    initialContent = '',
    onContentChange,
    toolbar = 'full',
    readOnly = false,
    minHeight = '300px',
    placeholder = 'Start writing...',
    isLightMode = false,
    projectId = null,
    children,
  } = props;

  const [editor, setEditor] = useState<LexicalEditorType | null>(null);
  const [showCodeView, setShowCodeView] = useState(false);
  const [codeContent, setCodeContent] = useState('');
  const [isLocked, setIsLocked] = useState(readOnly);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [checkedText, setCheckedText] = useState('');
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // ── Formatting hook ────────────────────────────────────────────
  // Note: useLexicalComposerContext requires being inside LexicalComposer,
  // so formatting is accessed via imperative handle, not this hook directly here.

  // ── Imperative Handle — AI Command Bridge ───────────────────────

  useImperativeHandle(ref, () => ({
    editor,
    getContent: () => {
      let text = '';
      editor?.getEditorState().read(() => { text = $getRoot().getTextContent(); });
      return text;
    },
    setContent: (content: string) => {
      editor?.update(() => {
        const root = $getRoot();
        root.clear();
        if (content.trim()) {
          const paras = content.split(/\n\s*\n/).filter(Boolean);
          paras.forEach((p) => {
            const node = $createParagraphNode();
            node.append($createTextNode(p.trim()));
            root.append(node);
          });
        }
      });
      onContentChange?.(content);
    },
    insertText: (text: string) => {
      editor?.update(() => {
        const root = $getRoot();
        const lastChild = root.getLastChild();
        if (lastChild) {
          (lastChild as import('lexical').ElementNode).append($createTextNode(text));
        } else {
          const p = $createParagraphNode();
          p.append($createTextNode(text));
          root.append(p);
        }
      });
    },
    appendText: (text: string) => {
      editor?.update(() => {
        const root = $getRoot();
        const p = $createParagraphNode();
        p.append($createTextNode(text));
        root.append(p);
      });
    },
    formatText: (type) => {
      editor?.focus();
      // Format handled by useEditorFormatting hook inside ToolbarPlugin
      window.dispatchEvent(new CustomEvent('editor-format-text', { detail: { type } }));
    },
    formatBlock: (type) => {
      window.dispatchEvent(new CustomEvent('editor-format-block', { detail: { type } }));
    },
    formatAlign: (alignment) => {
      window.dispatchEvent(new CustomEvent('editor-format-align', { detail: { type: alignment } }));
    },
    formatFont: (family, size) => {
      window.dispatchEvent(new CustomEvent('editor-format-font', { detail: { family, size } }));
    },
    clearFormatting: () => {
      window.dispatchEvent(new CustomEvent('editor-clear-formatting'));
    },
    insertTable: (_rows = 3, _cols = 3) => {
      editor?.focus();
      editor?.update(() => {
        const root = $getRoot();
        const p = $createParagraphNode();
        p.append($createTextNode(`[Table ${_rows}x${_cols} — use UI to insert]`));
        root.append(p);
      });
    },
    insertLink: (url, text) => {
      editor?.focus();
      // TOGGLE_LINK_COMMAND dispatched via ToolbarPlugin
      const displayText = text || url;
      editor?.update(() => {
        const root = $getRoot();
        const p = $createParagraphNode();
        p.append($createTextNode(`[${displayText}](${url})`));
        root.append(p);
      });
    },
    insertHorizontalRule: () => {
      window.dispatchEvent(new CustomEvent('editor-insert-hr'));
    },
    insertCodeBlock: (language) => {
      editor?.update(() => {
        const root = $getRoot();
        const p = $createParagraphNode();
        p.append($createTextNode(`\`\`\`${language || ''}\n\n\`\`\``));
        root.append(p);
      });
    },
    undo: () => {
      window.dispatchEvent(new CustomEvent('editor-undo'));
    },
    redo: () => {
      window.dispatchEvent(new CustomEvent('editor-redo'));
    },
    toggleCodeView: () => {
      if (!showCodeView) {
        let text = '';
        editor?.getEditorState().read(() => { text = $getRoot().getTextContent(); });
        setCodeContent(text);
      }
      setShowCodeView(!showCodeView);
    },
    toggleLock: () => {
      setIsLocked(!isLocked);
      editor?.setEditable(isLocked); // toggle to opposite of current
    },
    exportDocument: (format) => {
      let text = '';
      editor?.getEditorState().read(() => { text = $getRoot().getTextContent(); });
      const blob = new Blob([text], { type: format === 'html' ? 'text/html' : 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-${Date.now()}.${format === 'html' ? 'html' : format === 'markdown' ? 'md' : 'txt'}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    checkWriting: async () => {
      let text = '';
      editor?.getEditorState().read(() => { text = $getRoot().getTextContent(); });
      if (!text.trim()) return;
      setCheckedText(text);
      // Delegate to the existing suggestionService (imported where ToolbarPlugin lives)
      window.dispatchEvent(new CustomEvent('editor-check-writing', { detail: { text } }));
    },
    applySuggestion: (id) => {
      window.dispatchEvent(new CustomEvent('editor-apply-suggestion', { detail: { id } }));
    },
    dismissSuggestion: (id) => {
      window.dispatchEvent(new CustomEvent('editor-dismiss-suggestion', { detail: { id } }));
    },
    startDictation: async () => {
      window.dispatchEvent(new CustomEvent('editor-start-dictation'));
    },
    stopDictation: () => {
      window.dispatchEvent(new CustomEvent('editor-stop-dictation'));
    },
  }), [editor, showCodeView, isLocked, onContentChange]);

  // ── A2UI EventBus Wiring ───────────────────────────────────────
  // Listen for ai-command DOM events and map to editor ref methods.
  // This is the bridge between AI XML tags and the editor imperative API.
  useEffect(() => {
    const handleAiCommand = (e: Event) => {
      const { tag, props: p = {} } = (e as CustomEvent).detail || {};
      const ref2 = (ref as React.MutableRefObject<LexicalEditorRef | null>)?.current;
      if (!ref2) return;

      switch (tag) {
        case 'set_content':       ref2.setContent(p.content || ''); break;
        case 'insert_text':       ref2.insertText(p.text || ''); break;
        case 'append_text':       ref2.appendText(p.text || ''); break;
        case 'format_text':       ref2.formatText(p.type); break;
        case 'format_block':      ref2.formatBlock(p.type); break;
        case 'format_align':      ref2.formatAlign(p.type); break;
        case 'format_font':       ref2.formatFont(p.family, p.size); break;
        case 'clear_formatting':  ref2.clearFormatting(); break;
        case 'insert_table':      ref2.insertTable(p.rows, p.cols); break;
        case 'insert_link':       ref2.insertLink(p.url, p.text); break;
        case 'insert_horizontal_rule': ref2.insertHorizontalRule(); break;
        case 'insert_code_block': ref2.insertCodeBlock(p.language); break;
        case 'undo':              ref2.undo(); break;
        case 'redo':              ref2.redo(); break;
        case 'toggle_code_view':  ref2.toggleCodeView(); break;
        case 'toggle_lock':       ref2.toggleLock(); break;
        case 'export':            ref2.exportDocument(p.format); break;
        case 'check_writing':     ref2.checkWriting(); break;
        case 'apply_suggestion':  ref2.applySuggestion(p.id); break;
        case 'dismiss_suggestion':ref2.dismissSuggestion(p.id); break;
        case 'start_dictation':   ref2.startDictation(); break;
        case 'stop_dictation':    ref2.stopDictation(); break;
      }
    };
    window.addEventListener('ai-command', handleAiCommand);
    return () => window.removeEventListener('ai-command', handleAiCommand);
  }, [ref]);

  // ── Render ─────────────────────────────────────────────────────

  const initialConfig = createInitialConfig('LexicalEditor', isLocked || readOnly);

  return (
    <div
      ref={editorContainerRef}
      className="flex flex-col h-full"
      data-theme={isLightMode ? 'light' : 'dark'}
      style={{ backgroundColor: isLightMode ? '#fff' : '#121B2C' }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        {/* Core plugins */}
        <HistoryPlugin />
        <AutoFocusPlugin />
        <LinkPlugin />
        <ListPlugin />
        <MarkdownShortcutPlugin />
        <TabIndentationPlugin />
        <ClipboardPlugin />
        <EditorInstancePlugin onEditorReady={setEditor} />
        <ContentTrackingPlugin onContentChange={onContentChange} />
        <WordCountPlugin setWordCount={setWordCount} setCharCount={setCharCount} />
        <ClearSuggestionsPlugin checkedText={checkedText} onClearSuggestions={() => setCheckedText('')} />

        {/* Toolbar — rendered by parent via children prop, inside composer context */}
        {children}

        {/* Editor area */}
        {showCodeView ? (
          <div className="flex-1 p-4" style={{ minHeight }}>
            <textarea
              className="w-full h-full font-mono text-sm p-3 border rounded resize-none"
              style={{
                backgroundColor: isLightMode ? '#f9fafb' : '#1a1a2e',
                color: isLightMode ? '#111' : '#e5e7eb',
                borderColor: isLightMode ? '#d1d5db' : '#374151',
              }}
              value={codeContent}
              onChange={(e) => setCodeContent(e.target.value)}
              onBlur={() => {
                // Apply code changes back to editor on blur
                editor?.update(() => {
                  const root = $getRoot();
                  root.clear();
                  if (codeContent.trim()) {
                    const p = $createParagraphNode();
                    p.append($createTextNode(codeContent));
                    root.append(p);
                  }
                });
              }}
            />
          </div>
        ) : (
          <div className="flex-1 relative" style={{ minHeight }}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="editor-input h-full outline-none p-4"
                  style={{ minHeight, color: isLightMode ? '#111' : '#e5e7eb' }}
                />
              }
              placeholder={
                <div
                  className="absolute top-4 left-4 pointer-events-none select-none"
                  style={{ color: isLightMode ? '#9ca3af' : '#6b7280' }}
                >
                  {placeholder}
                </div>
              }
              ErrorBoundary={({ children }) => <>{children}</>}
            />
          </div>
        )}

        {/* Stats footer */}
        <div
          className="flex items-center justify-between px-3 py-1.5 text-xs border-t"
          style={{
            borderColor: isLightMode ? '#e5e7eb' : '#1f2937',
            color: isLightMode ? '#6b7280' : '#9ca3af',
          }}
        >
          <span>{wordCount} words · {charCount} chars</span>
          <span>{isLocked ? '🔒 Read-only' : '✏️ Editing'}</span>
        </div>
      </LexicalComposer>
    </div>
  );
};

export const LexicalEditor = forwardRef(LexicalEditorImpl);
LexicalEditor.displayName = 'LexicalEditor';
