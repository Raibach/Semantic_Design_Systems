/**
 * ClipboardPlugin — pastes as plain text by default. Shift+V preserves HTML formatting.
 * Extracted from MyStoryEditor.tsx.
 */
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';

export function ClipboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handlePaste = (event: Event) => {
      const clipboardEvent = event as ClipboardEvent;
      const clipboardData = clipboardEvent.clipboardData;
      if (!clipboardData) return;
      const text = clipboardData.getData('text/plain');
      if (!text) return;

      const html = clipboardData.getData('text/html');
      const isShiftPressed = (clipboardEvent as any).shiftKey || false;
      if (html && !isShiftPressed) return; // allow formatted paste

      clipboardEvent.preventDefault();
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(text);
        }
      });
    };

    const el = editor.getRootElement();
    if (el) {
      el.addEventListener('paste', handlePaste);
      return () => el.removeEventListener('paste', handlePaste);
    }
  }, [editor]);

  return null;
}
