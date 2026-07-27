import {
  TextNode,
  EditorConfig,
  LexicalNode,
  Spread,
  SerializedTextNode,
  $applyNodeReplacement,
  NodeKey,
} from 'lexical';

// Custom Highlight Node for Grace editing
export type SerializedHighlightNode = Spread<
  {
    highlightId: string;
  },
  SerializedTextNode
>;

export class HighlightNode extends TextNode {
  __highlightId: string;

  static getType(): string {
    return 'highlight';
  }

  static clone(node: HighlightNode): HighlightNode {
    return new HighlightNode(node.__text, node.__highlightId, node.__key);
  }

  constructor(text: string, highlightId: string, key?: NodeKey) {
    super(text, key);
    this.__highlightId = highlightId;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    element.style.backgroundColor = '#d4a017'; // darker gold instead of bright yellow
    element.style.color = '#1a1a1a'; // dark text for readability
    element.style.padding = '2px 0';
    element.style.borderRadius = '2px';
    element.dataset.highlightId = this.__highlightId;
    element.className = 'grace-highlight';
    return element;
  }

  updateDOM(
    prevNode: TextNode,
    dom: HTMLElement,
    config: EditorConfig
  ): boolean {
    const isUpdated = super.updateDOM(prevNode as this, dom, config);
    if ($isHighlightNode(prevNode) && prevNode.__highlightId !== this.__highlightId) {
      dom.dataset.highlightId = this.__highlightId;
    }
    // Ensure highlight styles are always applied
    dom.style.backgroundColor = '#d4a017'; // darker gold instead of bright yellow
    dom.style.color = '#1a1a1a'; // dark text for readability
    dom.style.padding = '2px 0';
    dom.style.borderRadius = '2px';
    dom.className = 'grace-highlight';
    return isUpdated;
  }

  static importJSON(serializedNode: SerializedHighlightNode): HighlightNode {
    const node = $createHighlightNode(
      serializedNode.text,
      serializedNode.highlightId
    );
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  exportJSON(): SerializedHighlightNode {
    return {
      ...super.exportJSON(),
      highlightId: this.__highlightId,
      type: 'highlight',
      version: 1,
    };
  }

  getHighlightId(): string {
    return this.__highlightId;
  }

  setHighlightId(id: string): void {
    const writable = this.getWritable();
    writable.__highlightId = id;
  }
}

export function $createHighlightNode(text: string, highlightId: string): HighlightNode {
  return $applyNodeReplacement(new HighlightNode(text, highlightId));
}

export function $isHighlightNode(
  node: LexicalNode | null | undefined
): node is HighlightNode {
  return node instanceof HighlightNode;
}
