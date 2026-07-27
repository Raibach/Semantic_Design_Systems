/**
 * EditorInstancePlugin — captures the Lexical editor instance for imperative access.
 * Extracted from MyStoryEditor.tsx.
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { LexicalEditor } from 'lexical';

export function EditorInstancePlugin({
  onEditorReady,
}: {
  onEditorReady: (editor: LexicalEditor) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onEditorReady(editor);
  }, [editor, onEditorReady]);

  return null;
}
