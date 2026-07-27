import * as React from 'react';

interface MarkdownRendererProps {
  text: string;
  className?: string;
}

function MarkdownRenderer({ text, className = '' }: MarkdownRendererProps) {
  if (!text) return null;

  // Split text into lines for processing
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let currentList: JSX.Element[] = [];
  let listLevel = 0;
  let listType: 'ul' | 'ol' | null = null;
  let key = 0;
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      elements.push(
        <pre key={`codeblock-${key++}`} className="bg-gray-900 text-gray-100 rounded-lg p-4 my-3 overflow-x-auto text-sm font-mono leading-relaxed">
          {codeBlockLang && (
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 -mt-1">{codeBlockLang}</div>
          )}
          <code>{codeBlockLines.join('\n')}</code>
        </pre>
      );
      codeBlockLines = [];
      codeBlockLang = '';
    }
  };

  const flushList = () => {
    if (currentList.length > 0) {
      const ListTag = listType === 'ol' ? 'ol' : 'ul';
      const listStyle = listType === 'ol' ? 'list-decimal' : 'list-disc';
      elements.push(
        <ListTag key={`list-${key++}`} className={`${listStyle} ml-4 space-y-1 my-2`}>
          {currentList}
        </ListTag>
      );
      currentList = [];
      listLevel = 0;
      listType = null;
    }
  };

  const parseInlineMarkdown = (line: string): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = [];
    const remaining = line;
    let lastIndex = 0;
    let partKey = 0;

    // Process bold (**text** or __text__)
    const boldRegex = /(\*\*|__)([^*_\n]+?)\1/g;
    let match;
    const matches: Array<{ type: string; match: RegExpMatchArray; index: number }> = [];

    while ((match = boldRegex.exec(remaining)) !== null) {
      matches.push({ type: 'bold', match, index: match.index });
    }

    // Process italic (*text* or _text_) - but not part of bold
    const italicRegex = /(?<!\*)\*([^*\n]+?)\*(?!\*)|(?<!_)_([^_\n]+?)_(?!_)/g;
    while ((match = italicRegex.exec(remaining)) !== null) {
      // Check if it's not part of a bold match
      const isBold = matches.some(m => 
        m.type === 'bold' && 
        m.index <= match.index && 
        m.index + m.match[0].length >= match.index + match[0].length
      );
      if (!isBold) {
        matches.push({ type: 'italic', match, index: match.index });
      }
    }

    // Process code (`text`)
    const codeRegex = /`([^`]+)`/g;
    while ((match = codeRegex.exec(remaining)) !== null) {
      matches.push({ type: 'code', match, index: match.index });
    }

    // Sort matches by index
    matches.sort((a, b) => a.index - b.index);

    // Filter overlapping matches (prioritize code > bold > italic)
    const filtered: typeof matches = [];
    for (const m of matches) {
      const end = m.index + m.match[0].length;
      const overlaps = filtered.some(f => {
        const fEnd = f.index + f.match[0].length;
        return m.index < fEnd && end > f.index;
      });
      if (!overlaps) {
        filtered.push(m);
      }
    }

    // Build parts
    for (const m of filtered) {
      // Add text before match
      if (m.index > lastIndex) {
        const before = remaining.substring(lastIndex, m.index);
        if (before) parts.push(before);
      }

      // Add formatted element
      if (m.type === 'bold') {
        parts.push(
          <strong key={`bold-${partKey++}`} className="font-bold">
            {m.match[2]}
          </strong>
        );
      } else if (m.type === 'italic') {
        parts.push(
          <em key={`italic-${partKey++}`} className="italic">
            {m.match[1] || m.match[2]}
          </em>
        );
      } else if (m.type === 'code') {
        parts.push(
          <code key={`code-${partKey++}`} className="bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            {m.match[1]}
          </code>
        );
      }

      lastIndex = m.index + m.match[0].length;
    }

    // Add remaining text
    if (lastIndex < remaining.length) {
      parts.push(remaining.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [line];
  };

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    // Fenced code block start/end
    const fenceMatch = trimmed.match(/^```(\w*)$/);
    if (fenceMatch) {
      if (inCodeBlock) {
        // Closing fence
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        // Opening fence
        flushList();
        inCodeBlock = true;
        codeBlockLang = fenceMatch[1];
        codeBlockLines = [];
      }
      return;
    }

    // Inside a code block — collect lines verbatim
    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
    }

    // Headers
    if (trimmed.match(/^#{1,6}\s/)) {
      flushList();
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const content = trimmed.replace(/^#+\s/, '');
      const Tag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
      const sizeClass = level === 1 ? 'text-2xl' : level === 2 ? 'text-xl' : level === 3 ? 'text-lg' : 'text-base';
      elements.push(
        <Tag key={`header-${key++}`} className={`${sizeClass} font-bold mt-4 mb-2`}>
          {parseInlineMarkdown(content)}
        </Tag>
      );
      return;
    }

    // List items (support *, +, - and numbered) with nested support
    // Allow mixed markers (* and +) to be treated as the same list type for nesting
    const listMatch = trimmed.match(/^(\*|\+|-|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const marker = listMatch[1];
      const content = listMatch[2];
      const isOrdered = /^\d+\./.test(marker);
      // Calculate nesting level based on indentation (2 spaces or 1 tab per level)
      const currentLevel = Math.floor(indent / 2);
      
      // For unordered lists, treat *, +, and - as the same type to allow nesting
      // Only flush if changing between ordered/unordered or changing nesting level significantly
      const needsFlush = listType === null || 
          (isOrdered && listType !== 'ol') || 
          (!isOrdered && listType === 'ol') ||
          (currentLevel < listLevel); // Only flush if going to a lower level
      
      if (needsFlush) {
        flushList();
        listType = isOrdered ? 'ol' : 'ul';
        listLevel = currentLevel;
      } else if (currentLevel > listLevel) {
        // Starting a nested list - keep the same list type but update level
        listLevel = currentLevel;
      }

      currentList.push(
        <li key={`list-item-${key++}`} className="text-sm" style={{ paddingLeft: currentLevel > 0 ? `${currentLevel * 0.5}rem` : '0' }}>
          {parseInlineMarkdown(content)}
        </li>
      );
      return;
    }

    // Empty line - flush list
    if (trimmed === '') {
      flushList();
      if (lineIndex < lines.length - 1) {
        elements.push(<br key={`br-${key++}`} />);
      }
      return;
    }

    // Regular paragraph
    flushList();
    const inlineParts = parseInlineMarkdown(line);
    elements.push(
      <p key={`p-${key++}`} className="mb-2">
        {inlineParts}
      </p>
    );
  });

  // Flush any remaining code block or list
  flushCodeBlock();
  flushList();

  return (
    <div className={className}>
      {elements.length > 0 ? elements : <div>{text}</div>}
    </div>
  );
}

export default MarkdownRenderer;

