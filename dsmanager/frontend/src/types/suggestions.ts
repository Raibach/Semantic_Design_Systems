/** A grammar/style suggestion applied to inline text. */
export interface Suggestion {
  id: string;
  type: 'grammar' | 'style' | 'clarity' | 'word-choice' | 'structure';
  severity: 'error' | 'warning' | 'info';
  message: string;
  replacement?: string;
}
