import {
  TextNode,
  EditorConfig,
  LexicalNode,
  Spread,
  SerializedTextNode,
  $applyNodeReplacement,
  NodeKey,
} from 'lexical';
import type { Suggestion } from '@/types/suggestions';

// Custom Suggestion Node for inline grammar/style suggestions
export type SerializedSuggestionNode = Spread<
  {
    suggestionId: string;
    suggestionType: 'grammar' | 'style' | 'clarity' | 'word-choice' | 'structure';
    severity: 'error' | 'warning' | 'info';
  },
  SerializedTextNode
>;

export class SuggestionNode extends TextNode {
  __suggestionId: string;
  __suggestionType: 'grammar' | 'style' | 'clarity' | 'word-choice' | 'structure';
  __severity: 'error' | 'warning' | 'info';

  static getType(): string {
    return 'suggestion';
  }

  static clone(node: SuggestionNode): SuggestionNode {
    return new SuggestionNode(
      node.__text,
      node.__suggestionId,
      node.__suggestionType,
      node.__severity,
      node.__key
    );
  }

  constructor(
    text: string,
    suggestionId: string,
    suggestionType: 'grammar' | 'style' | 'clarity' | 'word-choice' | 'structure',
    severity: 'error' | 'warning' | 'info',
    key?: NodeKey
  ) {
    super(text, key);
    this.__suggestionId = suggestionId;
    this.__suggestionType = suggestionType;
    this.__severity = severity;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);

    // Apply wavy underline based on severity and type
    let underlineColor = '#3b82f6'; // blue for style/clarity

    if (this.__severity === 'error') {
      underlineColor = '#ef4444'; // red for errors
    } else if (this.__suggestionType === 'grammar') {
      underlineColor = '#f97316'; // orange for grammar
    }

    element.style.textDecoration = `underline wavy ${underlineColor}`;
    element.style.textDecorationThickness = '2px';
    element.style.textUnderlineOffset = '2px';
    element.style.cursor = 'pointer';
    element.dataset.suggestionId = this.__suggestionId;
    element.dataset.suggestionType = this.__suggestionType;
    element.dataset.severity = this.__severity;
    element.className = 'grace-suggestion';

    // Add click handler to open single suggestion modal
    element.addEventListener('click', () => {
      const event = new CustomEvent('suggestion-clicked', {
        detail: {
          suggestionId: this.__suggestionId,
          suggestionType: this.__suggestionType,
          severity: this.__severity,
        },
        bubbles: true,
      });
      element.dispatchEvent(event);
    });

    return element;
  }

  updateDOM(
    prevNode: TextNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    const isUpdated = super.updateDOM(prevNode as this, dom, config);
    if ($isSuggestionNode(prevNode)) {
      if (prevNode.__suggestionId !== this.__suggestionId) {
        dom.dataset.suggestionId = this.__suggestionId;
      }
      if (prevNode.__suggestionType !== this.__suggestionType) {
        dom.dataset.suggestionType = this.__suggestionType;
      }
      if (prevNode.__severity !== this.__severity) {
        dom.dataset.severity = this.__severity;
      }
    }
    return isUpdated;
  }

  static importJSON(serializedNode: SerializedSuggestionNode): SuggestionNode {
    const node = $createSuggestionNode(
      serializedNode.text,
      serializedNode.suggestionId,
      serializedNode.suggestionType,
      serializedNode.severity
    );
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  exportJSON(): SerializedSuggestionNode {
    return {
      ...super.exportJSON(),
      suggestionId: this.__suggestionId,
      suggestionType: this.__suggestionType,
      severity: this.__severity,
      type: 'suggestion',
      version: 1,
    };
  }

  getSuggestionId(): string {
    return this.__suggestionId;
  }

  getSuggestionType(): string {
    return this.__suggestionType;
  }

  getSeverity(): string {
    return this.__severity;
  }
}

export function $createSuggestionNode(
  text: string,
  suggestionId: string,
  suggestionType: 'grammar' | 'style' | 'clarity' | 'word-choice' | 'structure',
  severity: 'error' | 'warning' | 'info'
): SuggestionNode {
  return $applyNodeReplacement(
    new SuggestionNode(text, suggestionId, suggestionType, severity)
  );
}

export function $isSuggestionNode(
  node: LexicalNode | null | undefined
): node is SuggestionNode {
  return node instanceof SuggestionNode;
}
