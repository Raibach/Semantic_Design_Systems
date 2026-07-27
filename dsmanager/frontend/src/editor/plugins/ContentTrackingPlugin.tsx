/**
 * ContentTrackingPlugin — emits editor content changes to parent via callback.
 * Extracted from MyStoryEditor.tsx.
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';

export function ContentTrackingPlugin({
  onContentChange,
}: {
  onContentChange?: (content: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const captureInitialContent = () => {
      editor.getEditorState().read(() => {
        const text = $getRoot().getTextContent();
        if (text && onContentChange) onContentChange(text);
      });
    };
    const timeoutId = setTimeout(captureInitialContent, 0);
    return () => clearTimeout(timeoutId);
  }, [editor, onContentChange]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        if (onContentChange) {
          onContentChange($getRoot().getTextContent());
        }
      });
    });
  }, [editor, onContentChange]);

  return null;
}
