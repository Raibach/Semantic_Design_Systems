// Minimal stub for parse5 - provides just enough for react-render-html to work
// Used by @storybook/addon-comments → react-render-html → parse5

export function parse(html, options) {
  return { childNodes: [], nodeName: '#document' };
}

export function parseFragment(html, options) {
  return { childNodes: [], nodeName: '#document-fragment' };
}

export function serialize(node) {
  return '';
}

export class Parser {
  constructor() {}
  parse() { return { childNodes: [] }; }
}

export class SAXParser {
  constructor() {}
  parse() { return { childNodes: [] }; }
}

export class Serializer {
  constructor() {}
  serialize() { return ''; }
}

export const treeAdapters = {
  default: {
    createDocument: () => ({ childNodes: [], nodeName: '#document' }),
    createDocumentFragment: () => ({ childNodes: [], nodeName: '#document-fragment' }),
    createElement: () => ({ childNodes: [], nodeName: 'div', attrs: [] }),
    createCommentNode: () => ({ nodeName: '#comment', data: '' }),
    appendChild: () => {},
    insertBefore: () => {},
    setTemplateContent: () => {},
    getTemplateContent: () => null,
    setDocumentType: () => {},
    setDocumentMode: () => {},
    getDocumentMode: () => 'no-quirks',
    detachNode: () => {},
    insertText: () => {},
    insertTextBefore: () => {},
    adoptAttributes: () => {},
    getFirstChild: () => null,
    getChildNodes: () => [],
    getParentNode: () => null,
    getAttrList: () => [],
    getTagName: () => '',
    getNamespaceURI: () => '',
    getTextNodeContent: () => '',
    getCommentNodeContent: () => '',
    setTextNodeContent: () => {},
    isElementNode: () => false,
    isTextNode: () => false,
    isCommentNode: () => false,
  }
};

export default { parse, parseFragment, serialize, Parser, SAXParser, Serializer, treeAdapters };
