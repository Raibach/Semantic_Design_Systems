import React, { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ResponsivePromptBuilder } from './ResponsivePromptBuilder';
import { ErrorBoundary } from './ErrorBoundary';

export function ResponsivePromptBuilderWithDnD() {
  const [dndError, setDndError] = useState(false);

  useEffect(() => {
    // Check if we're in Figma's environment by detecting their webpack artifacts
    const isFigmaEnv = window.location.href.includes('figma.com');
    if (isFigmaEnv) {
      // In Figma, we might have issues with DnD, so catch errors
      window.addEventListener('error', (e) => {
        if (e.message && e.message.includes('Unknown runtime error')) {
          setDndError(true);
          e.preventDefault();
        }
      });
    }
  }, []);

  // If DnD causes errors, render without it
  if (dndError) {
    return <ResponsivePromptBuilder />;
  }

  try {
    return (
      <div className="h-full w-full flex flex-col">
        <ErrorBoundary fallback={<ResponsivePromptBuilder />}>
          <DndProvider backend={HTML5Backend}>
            <ResponsivePromptBuilder />
          </DndProvider>
        </ErrorBoundary>
      </div>
    );
  } catch (error) {
    console.error('DnD initialization error:', error);
    return <ResponsivePromptBuilder />;
  }
}
