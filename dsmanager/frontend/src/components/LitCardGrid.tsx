/**
 * LitCardGrid — React host for AI-assembled Lit agent cards.
 *
 * Renders <agent-card-element> Lit web components from the AI's A2UI envelope.
 * No React card components — the AI assembles from the Lit catalog.
 */
import React, { useRef, useEffect } from 'react';

interface LitCardGridProps {
  cards: Array<{
    id: string;
    title: string;
    description?: string;
    category?: string;
    status?: string;
    version?: number;
    username?: string;
    teamName?: string;
    createdAt?: string;
    lastUsed?: string;
  }>;
  onOpenPrompt?: (id: string) => void;
}

export const LitCardGrid: React.FC<LitCardGridProps> = ({ cards, onOpenPrompt }) => {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // Clear previous cards
    grid.innerHTML = '';

    cards.forEach((card) => {
      const el = document.createElement('agent-card-element') as HTMLElement & {
        cardId?: string;
      };

      el.setAttribute('data-card-id', card.id);
      el.setAttribute('title', card.title || 'Untitled');
      if (card.description) el.setAttribute('description', card.description);
      if (card.category) el.setAttribute('category', card.category);
      if (card.status) el.setAttribute('status', card.status);
      if (card.version !== undefined) el.setAttribute('version', String(card.version));
      if (card.username) el.setAttribute('username', card.username);
      if (card.teamName) el.setAttribute('team-name', card.teamName);
      if (card.createdAt) el.setAttribute('created-at', card.createdAt);
      if (card.lastUsed) el.setAttribute('last-used', card.lastUsed);

      el.style.display = 'block';
      el.style.width = '278px';
      el.style.flexShrink = '0';
      el.style.cursor = 'pointer';

      if (onOpenPrompt) {
        el.addEventListener('click', () => onOpenPrompt(card.id));
      }

      grid.appendChild(el);
    });
  }, [cards, onOpenPrompt]);

  return (
    <div
      ref={gridRef}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '20px',
        justifyContent: 'center',
        padding: '20px',
        width: '100%',
      }}
    />
  );
};
