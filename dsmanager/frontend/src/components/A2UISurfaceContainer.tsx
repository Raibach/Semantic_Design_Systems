/**
 * A2UI Surface Container
 * 
 * Fully AI-controllable output window for rendering:
 * - Custom Lit components (project cards, status indicators, etc.)
 * - Interactive elements (buttons, forms, tabs)
 * - Text content (with markdown rendering)
 * - Live data from agent operations
 * 
 * Primarily used in MiddleColumnSlot (third column) as the output window,
 * but can also be used in ResponsivePromptBuilder for left-column content injection.
 * 
 * The AI chat panel on the right sends commands through XML tags, which are
 * intercepted by the AI Orchestrator, validated, and rendered here via eventBus.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { eventBus } from '@/shared/event-bus';
import type { AiCommand } from '@/shared/event-bus';
import { validateTag } from '@/shared/tag-registry';
// TODO: Re-enable when Lit decorator transpilation is configured
// import './ProjectCardElement'; // Register Lit component

interface A2UISurfaceContainerProps {
  sessionId: string | null;
  className?: string;
  column?: 'left' | 'middle';
  /** Optional callback when AI mounts a component */
  onComponentMounted?: (tag: string, props: Record<string, any>) => void;
  /** Optional callback when AI removes a component */
  onComponentRemoved?: (tag: string) => void;
  /** Optional callback when surface is cleared */
  onSurfaceCleared?: () => void;
  /** Allow manual control of content */
  onContentChange?: (html: string) => void;
}

/**
 * A2UI Surface Container - Fully AI-controllable output window
 * 
 * INTEGRATION: Use in MiddleColumnSlot as the main output area:
 * ```tsx
 * <A2UISurfaceContainer 
 *   sessionId={session?.id} 
 *   column="middle"
 *   onComponentMounted={(tag, props) => console.log('AI rendered:', tag)}
 *   onSurfaceCleared={() => setCompiledOutput('')}
 * />
 * ```
 * 
 * AI CAN:
 * - Render custom components via <project-card-element id="..." name="..." />
 * - Inject HTML content via <set-html content="..." />
 * - Update text via <set-text content="..." />
 * - Clear output via <clear-surface />
 * - Add buttons via <add-button label="..." onclick="..." />
 * - Render live data, status indicators, forms, etc.
 * 
 * This gives agents full control over what users see in the output window.
 */
export function A2UISurfaceContainer({
  sessionId,
  className = '',
  column = 'middle',
  onComponentMounted,
  onComponentRemoved,
  onSurfaceCleared,
  onContentChange,
}: A2UISurfaceContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedComponentsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [isEmpty, setIsEmpty] = useState(true);

  const handleCommand = useCallback(
    (command: AiCommand) => {
      if (command.sessionId !== sessionId) return;
      if (!containerRef.current) return;

      // Validate tag against registry
      const result = validateTag(command);
      if (!result.valid || !result.tag) {
        console.warn(`[A2UISurfaceContainer] Blocked invalid tag: ${result.error}`);
        return;
      }

      setIsEmpty(false);

      // ── COMPONENT MOUNTING: Lit Elements ──
      if (command.command === 'add-project-card-element' || command.tag === 'project-card-element') {
        const componentId = `${result.tag}-${Date.now()}-${Math.random()}`;
        
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-ai-mounted', 'true');
        wrapper.setAttribute('data-tag', result.tag);
        wrapper.setAttribute('data-component-id', componentId);
        wrapper.setAttribute('data-session-id', sessionId);
        wrapper.className = 'mb-4 p-2';

        const element = document.createElement('project-card-element');
        if (command.props.id) element.setAttribute('id', String(command.props.id));
        if (command.props.name) element.setAttribute('name', String(command.props.name));
        if (command.props.description) element.setAttribute('description', String(command.props.description));

        wrapper.appendChild(element);
        containerRef.current.appendChild(wrapper);
        mountedComponentsRef.current.set(componentId, wrapper);

        onComponentMounted?.(result.tag, command.props);
        onContentChange?.(containerRef.current.innerHTML);
        console.log(`[A2UISurfaceContainer] Mounted ${result.tag}:`, command.props);
      }

      // ── HTML INJECTION: Set arbitrary HTML content ──
      if (command.tag === 'set-html' || command.command === 'set-html') {
        const html = String(command.props.content || '');
        if (containerRef.current) {
          containerRef.current.innerHTML = html;
          onContentChange?.(html);
          console.log('[A2UISurfaceContainer] Set HTML content');
        }
      }

      // ── TEXT INJECTION: Set text content ──
      if (command.tag === 'set-text' || command.command === 'set-text') {
        const text = String(command.props.content || '');
        if (containerRef.current) {
          containerRef.current.textContent = text;
          onContentChange?.(text);
          console.log('[A2UISurfaceContainer] Set text content');
        }
      }

      // ── BUTTON INJECTION: Add clickable button ──
      if (command.tag === 'add-button' || command.command === 'add-button') {
        const btn = document.createElement('button');
        btn.textContent = String(command.props.label || 'Click me');
        btn.className = 'px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors mb-2 mr-2';
        btn.onclick = () => {
          if (command.props.onclick) {
            try {
              // eslint-disable-next-line no-eval
              eval(String(command.props.onclick));
            } catch (e) {
              console.error('[A2UISurfaceContainer] Button onclick error:', e);
            }
          }
        };
        if (containerRef.current) {
          containerRef.current.appendChild(btn);
          onContentChange?.(containerRef.current.innerHTML);
          console.log('[A2UISurfaceContainer] Added button:', command.props.label);
        }
      }

      // ── APPEND CONTENT: Add HTML to existing content ──
      if (command.tag === 'append-html' || command.command === 'append-html') {
        const div = document.createElement('div');
        div.innerHTML = String(command.props.content || '');
        div.setAttribute('data-ai-appended', 'true');
        if (containerRef.current) {
          containerRef.current.appendChild(div);
          onContentChange?.(containerRef.current.innerHTML);
          console.log('[A2UISurfaceContainer] Appended HTML');
        }
      }

      // ── REMOVE COMPONENT ──
      if (command.tag === 'remove-component' || command.command === 'remove-component') {
        const componentId = String(command.props.id || '');
        const wrapper = mountedComponentsRef.current.get(componentId);
        if (wrapper) {
          wrapper.remove();
          mountedComponentsRef.current.delete(componentId);
          onComponentRemoved?.(result.tag);
          onContentChange?.(containerRef.current?.innerHTML || '');
          console.log('[A2UISurfaceContainer] Removed component:', componentId);
        }
      }

      // ── CLEAR SURFACE: Remove all AI-rendered content ──
      if (command.tag === 'clear-surface' || command.command === 'clear-surface') {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
        mountedComponentsRef.current.forEach((wrapper) => {
          wrapper.remove();
        });
        mountedComponentsRef.current.clear();
        setIsEmpty(true);
        onSurfaceCleared?.();
        onContentChange?.('');
        console.log('[A2UISurfaceContainer] Cleared all content');
      }
    },
    [sessionId, onComponentMounted, onComponentRemoved, onSurfaceCleared, onContentChange]
  );

  // Subscribe to ALL AI commands for this session
  useEffect(() => {
    if (!sessionId) return;
    return eventBus.onAny(handleCommand);
  }, [sessionId, handleCommand]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedComponentsRef.current.forEach((wrapper) => {
        wrapper.remove();
      });
      mountedComponentsRef.current.clear();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-a2ui-surface={column}
      data-session-id={sessionId || 'none'}
      className={`a2ui-surface-container overflow-auto ${className}`}
      style={{
        // Collapse entirely when empty — an idle surface must not reserve
        // space and push the real output content down.
        minHeight: isEmpty ? 0 : '100px',
        display: 'block',
        contain: 'layout style paint',
        padding: isEmpty ? 0 : '1rem',
      }}
    >
      {isEmpty && !sessionId && (
        <div className="flex items-center justify-center h-20 text-gray-400 text-sm opacity-50">
          Awaiting AI output...
        </div>
      )}
    </div>
  );
}
