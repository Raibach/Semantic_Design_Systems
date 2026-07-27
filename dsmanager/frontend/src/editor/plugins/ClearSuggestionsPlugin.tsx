/**
 * ClearSuggestionsPlugin — intelligently clears writing suggestions when the user
 * edits text beyond a similarity threshold. Prevents clearing during suggestion application.
 * Extracted from MyStoryEditor.tsx.
 */
import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import { $isSuggestionNode } from '@/nodes/SuggestionNode';

function calculateTextSimilarity(text1: string, text2: string): number {
  if (text1 === text2) return 1.0;
  if (text1.length === 0 || text2.length === 0) return 0.0;
  const maxLength = Math.max(text1.length, text2.length);
  const minLength = Math.min(text1.length, text2.length);
  if (minLength / maxLength < 0.5) return 0.0;
  let matches = 0;
  const shorter = text1.length < text2.length ? text1 : text2;
  const longer = text1.length >= text2.length ? text1 : text2;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  return matches / maxLength;
}

export function ClearSuggestionsPlugin({
  checkedText,
  onClearSuggestions,
}: {
  checkedText: string;
  onClearSuggestions: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const lastTextRef = useRef<string>('');
  const isApplyingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor || !checkedText) return;

    return editor.registerUpdateListener(({ editorState, dirtyLeaves }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        const hasSuggestionNodes = dirtyLeaves && dirtyLeaves.size > 0;
        if (hasSuggestionNodes) {
          editorState.read(() => {
            const allNodes = $getRoot().getAllTextNodes();
            const stillHasSuggestions = allNodes.some((node: any) => {
              try { return $isSuggestionNode(node); } catch { return false; }
            });
            if (stillHasSuggestions) {
              isApplyingRef.current = true;
              lastTextRef.current = $getRoot().getTextContent();
              return;
            }
          });
        }

        editorState.read(() => {
          const currentText = $getRoot().getTextContent();
          if (lastTextRef.current === currentText) {
            isApplyingRef.current = false;
            return;
          }
          if (lastTextRef.current && lastTextRef.current !== currentText && !isApplyingRef.current) {
            const lengthDiff = Math.abs(currentText.length - checkedText.length);
            const maxLen = Math.max(currentText.length, checkedText.length);
            const lengthChange = maxLen > 0 ? (lengthDiff / maxLen) * 100 : 0;
            const similarity = calculateTextSimilarity(currentText, checkedText);
            const isSmallChange = lengthChange <= 10 && similarity >= 0.7;
            if (!isSmallChange && (lengthChange > 10 || similarity < 0.7)) {
              onClearSuggestions();
            }
          }
          lastTextRef.current = currentText;
          isApplyingRef.current = false;
        });
      }, 500);
    });
  }, [editor, checkedText, onClearSuggestions]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return null;
}
