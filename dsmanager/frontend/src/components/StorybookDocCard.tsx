import React from 'react';
import { StorybookDoc } from '@/shared/storybookDocRegistry';
import { loadStorybookDoc } from '@/services/storybookDocLoader';

interface StorybookDocCardProps {
  doc: StorybookDoc;
  onOpen?: (doc: StorybookDoc, content: string) => void;
}

/**
 * Storybook Doc Card — Displays a markdown documentation file
 * as a card in the console, matching the DesignCard layout.
 * Click to load the doc into the Lexical Editor.
 */
export const StorybookDocCard: React.FC<StorybookDocCardProps> = ({ doc, onOpen }) => {
  const handleClick = () => {
    const content = loadStorybookDoc(doc.path);
    if (content && onOpen) {
      onOpen(doc, content);
    }
  };

  const categoryColors: Record<string, { fill: string; title: string; text: string }> = {
    Architecture: { fill: '#1B2F3A', title: '#A0C4D8', text: '#8EAFBF' },
    A2UI: { fill: '#1A3A2F', title: '#6DD4A0', text: '#5CB88A' },
    Pipeline: { fill: '#2F1A3A', title: '#C48DD4', text: '#A87CB8' },
    Features: { fill: '#3A2F1A', title: '#D4B06D', text: '#B8985C' },
  };

  const colors = categoryColors[doc.category] || categoryColors.Architecture;

  return (
    <div
      onClick={handleClick}
      data-tag="storybook-doc-card"
      className="h-[359px] w-[278px] rounded-[10px] relative overflow-hidden cursor-pointer transition-transform hover:scale-[1.02]"
      style={{ boxShadow: '0px 4px 4px 0px rgba(0,0,0,0.25)' }}
    >
      {/* Background */}
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 278.369 359">
        <path
          d="M10 0.25H268.369C273.754 0.25 278.119 4.61522 278.119 10V349C278.119 354.385 273.754 358.75 268.369 358.75H10C4.61523 358.75 0.25 354.385 0.25 349V10C0.250001 4.61522 4.61522 0.25 10 0.25Z"
          fill={colors.fill}
          stroke="#FFE9D4"
          strokeWidth="0.5"
        />
      </svg>

      {/* Category badge */}
      <div className="absolute left-4 top-4">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: colors.title }}
        >
          {doc.category}
        </span>
      </div>

      {/* Doc icon */}
      <div className="absolute left-4 top-14 text-2xl opacity-60">📄</div>

      {/* Title */}
      <div className="absolute left-4 top-[90px] right-4">
        <h3 className="text-[16px] font-bold leading-snug" style={{ color: colors.title, fontFamily: 'Inter, sans-serif' }}>
          {doc.title}
        </h3>
      </div>

      {/* Description */}
      <div className="absolute left-4 top-[140px] right-4">
        <p className="text-[12px] leading-relaxed opacity-70" style={{ color: colors.text, fontFamily: 'Inter, sans-serif' }}>
          {doc.description}
        </p>
      </div>

      {/* Bottom bar */}
      <div className="absolute left-0 bottom-0 w-full h-[56px]" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
        <div className="absolute left-4 bottom-4 flex items-center gap-2">
          <span className="text-[11px] opacity-60" style={{ color: colors.text }}>
            {doc.fileName}
          </span>
        </div>
        <div className="absolute right-4 bottom-4">
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: colors.title }}>
            MDX
          </span>
        </div>
      </div>
    </div>
  );
};
