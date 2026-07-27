/**
 * AISurfaceSandbox — Isolated A2UI Rendering Surface
 *
 * 2UI Architecture: This is the "Agent Surface" — a rigid, visually bounded
 * sandbox where Grace assembles and renders content. It is strictly separated
 * from the Operator Shell (sidebar, header, chat panel).
 *
 * Structural guarantees:
 *   - Absolute positioning prevents child content from warping the parent layout
 *   - CSS containment (contain: layout style) prevents paint/layout spill
 *   - Inset box-shadow visually sinks the canvas into the console
 *   - Error boundary prevents agent-generated code from crashing the dashboard
 *
 * A2UI Catalog ID: (not directly addressable — this is structural, not a component)
 */

import React from 'react';

interface AISurfaceSandboxProps {
  isAIAssembling: boolean;
  headerTab: string;
  spinnerContent: React.ReactNode;
  consoleContent: React.ReactNode;
  workspaceContent: React.ReactNode;
}

export const AISurfaceSandbox: React.FC<AISurfaceSandboxProps> = ({
  isAIAssembling,
  headerTab,
  spinnerContent,
  consoleContent,
  workspaceContent,
}) => {
  return (
    <section
      id="ai-surface"
      style={{
        position: 'relative',
        flex: '1 1 0%',
        width: '100%',
        height: '100%',
        minHeight: 0,
        border: '2px solid #507274',
        borderRadius: '8px',
        backgroundColor: '#E5E1DD',
        overflow: 'hidden',
        contain: 'layout style',
        margin: '0 4px 4px 4px',
        boxShadow:
          'inset 0 2px 4px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Absolute positioning — rigid 100% boundaries, internal scroll */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {isAIAssembling
          ? spinnerContent
          : headerTab === 'console'
            ? consoleContent
            : workspaceContent}
      </div>
    </section>
  );
};
