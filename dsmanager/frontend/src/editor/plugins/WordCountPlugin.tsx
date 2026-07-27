/**
 * WordCountPlugin — tracks word and character counts from the editor.
 * Extracted from MyStoryEditor.tsx.
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';

export function WordCountPlugin({
  setWordCount,
  setCharCount,
}: {
  setWordCount: (count: number) => void;
  setCharCount: (count: number) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const text = $getRoot().getTextContent();
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
        setCharCount(text.length);
      });
    });
  }, [editor, setWordCount, setCharCount]);

  return null;
}
