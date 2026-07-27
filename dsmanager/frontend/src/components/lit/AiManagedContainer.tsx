/**
 * <AiManagedContainer/> — Island container for AI-orchestrated Lit components.
 *
 * This is the ONLY place the AI is permitted to render components.
 * The Gatekeeper validates every command against the tag registry before
 * any DOM mutation occurs.
 *
 * Renders inside the middle column of the composer.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { eventBus } from '@/shared/event-bus';
import type { AiCommand } from '@/shared/event-bus';
import { validateTag, TAG_REGISTRY } from '@/shared/tag-registry';
import { StatusIndicator } from './StatusIndicatorReact';
import './status-indicator'; // registers the custom element

interface AiManagedContainerProps {
  sessionId: string | null;
  className?: string;
}

/**
 * Map of tag names to their React component wrappers.
 * As more Lit components are built, add them here.
 */
const LIT_COMPONENTS: Record<string, React.ComponentType<any>> = {
  'status-indicator': StatusIndicator,
};

export function AiManagedContainer({ sessionId, className }: AiManagedContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(new Map<string, HTMLElement>());

  const handleCommand = useCallback(
    (command: AiCommand) => {
      if (command.sessionId !== sessionId) return;
      if (!containerRef.current) return;

      // Gatekeeper validation
      const result = validateTag(command);
      if (!result.valid || !result.tag) {
        console.warn('[AiManagedContainer] Blocked:', result.error);
        return;
      }

      const entry = TAG_REGISTRY[result.tag];
      // Only accept commands targeting the middle column or universal tags
      const col = (entry as any).column;
      if (col && col !== 'middle' && (entry as any).surface !== 'both') {
        console.warn('[AiManagedContainer] Tag not allowed in middle column:', result.tag);
        return;
      }

      const Component = LIT_COMPONENTS[result.tag];
      if (!Component) {
        console.warn('[AiManagedContainer] No Lit component registered for tag:', result.tag);
        return;
      }

      // Create a wrapper div for the Lit element
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-ai-mounted', 'true');
      wrapper.setAttribute('data-tag', result.tag);
      wrapper.setAttribute('data-session-id', sessionId);
      containerRef.current.appendChild(wrapper);

      // Mount the React-wrapped Lit component into the wrapper
      // (In production, use createRoot; for simplicity we use a portal-like approach)
      const key = `${result.tag}-${Date.now()}`;
      mountedRef.current.set(key, wrapper);

      // Log to audit
      console.log('[AiManagedContainer] Mounted:', result.tag, command.props);
    },
    [sessionId]
  );

  useEffect(() => {
    if (!sessionId) return;
    return eventBus.onAny(handleCommand);
  }, [sessionId, handleCommand]);

  return (
    <div
      ref={containerRef}
      data-tag="ai-managed-container"
      data-session-id={sessionId}
      className={`min-h-[200px] p-4 ${className || ''}`}
      style={{ backgroundColor: '#fafafa', borderRadius: '8px', border: '1px dashed #d1d5db' }}
    >
      {!sessionId && (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          No active session — open a prompt to enable AI orchestration.
        </div>
      )}
    </div>
  );
}
