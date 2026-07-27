/**
 * AI Orchestrator — Bridges the chat's AI responses to the A2UI tag system.
 *
 * Usage in a React component:
 *   const { lastCommand } = useAiOrchestrator(sessionId);
 *
 * Listens for DOM mutations in the chat panel, extracts XML tags from
 * AI responses, validates them against the tag registry, and dispatches
 * validated commands through the event bus.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { eventBus } from './event-bus';
import type { AiCommand } from './event-bus';

interface OrchestratorOptions {
  sessionId: string | null;
  /** DOM element to observe for AI responses (defaults to chat container) */
  chatContainer?: HTMLElement | null;
}

/**
 * Regex to extract A2UI XML tags from AI response text.
 * Matches self-closing: <tag-name prop="value" />
 * and wrapped with content: <tag-name>content</tag-name>
 */
const SELF_CLOSING_PATTERN = /<([a-z][a-z0-9-]*)((?:\s+[a-z][a-z0-9-]*="[^"]*")*)\s*\/>/gi;
const WRAPPED_PATTERN = /<([a-z][a-z0-9-]*)((?:\s+[a-z][a-z0-9-]*="[^"]*")*)\s*>([\s\S]*?)<\/\1>/gi;

/**
 * Parse self-closing XML tag into AiCommand props.
 */
function parseSelfClosing(match: RegExpExecArray, sessionId: string): AiCommand | null {
  const tag = match[1];
  const rawAttrs = match[2];

  const props: Record<string, string> = {};
  const attrPattern = /([a-z][a-z0-9-]*)="([^"]*)"/gi;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrPattern.exec(rawAttrs)) !== null) {
    props[attrMatch[1]] = attrMatch[2];
  }

  return {
    sessionId,
    command: tag,
    tag,
    props,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Parse wrapped XML tag into AiCommand props.
 * Inner content becomes props.content (overridden by explicit content attribute).
 */
function parseWrapped(match: RegExpExecArray, sessionId: string): AiCommand | null {
  const tag = match[1];
  const rawAttrs = match[2];
  const innerContent = match[3]?.trim() || '';

  const props: Record<string, string> = {};
  const attrPattern = /([a-z][a-z0-9-]*)="([^"]*)"/gi;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrPattern.exec(rawAttrs)) !== null) {
    props[attrMatch[1]] = attrMatch[2];
  }

  // Inner content between tags becomes props.content if no explicit content attr
  if (innerContent && !props.content) {
    props.content = innerContent;
  }
  // For insert_text / append_text, inner content becomes props.text
  if (innerContent && !props.text) {
    props.text = innerContent;
  }

  return {
    sessionId,
    command: tag,
    tag,
    props,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract all AI commands from a text string.
 * Handles both self-closing and wrapped tag forms.
 */
export function extractCommands(text: string, sessionId: string): AiCommand[] {
  const commands: AiCommand[] = [];

  // Self-closing tags: <tag prop="value" />
  const scPattern = new RegExp(SELF_CLOSING_PATTERN);
  let scMatch: RegExpExecArray | null;
  while ((scMatch = scPattern.exec(text)) !== null) {
    const cmd = parseSelfClosing(scMatch, sessionId);
    if (cmd) commands.push(cmd);
  }

  // Wrapped tags: <tag>content</tag>
  const wPattern = new RegExp(WRAPPED_PATTERN);
  let wMatch: RegExpExecArray | null;
  while ((wMatch = wPattern.exec(text)) !== null) {
    const cmd = parseWrapped(wMatch, sessionId);
    if (cmd) commands.push(cmd);
  }

  return commands;
}

/**
 * React hook: observes AI chat responses and dispatches validated commands.
 */
export function useAiOrchestrator({ sessionId, chatContainer }: OrchestratorOptions) {
  const [lastCommand, setLastCommand] = useState<AiCommand | null>(null);
  const processedRef = useRef(new Set<string>());
  const observerRef = useRef<MutationObserver | null>(null);

  const processText = useCallback(
    (text: string) => {
      if (!sessionId) return;
      const commands = extractCommands(text, sessionId);
      for (const cmd of commands) {
        // Deduplicate: skip if we've already processed this exact command
        const key = `${cmd.tag}-${JSON.stringify(cmd.props)}`;
        if (processedRef.current.has(key)) continue;
        processedRef.current.add(key);

        const result = eventBus.emit(cmd);
        if (result.valid) {
          setLastCommand(cmd);
        }
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (!sessionId) return;

    const container = chatContainer || document.querySelector('[data-tag="chat-panel"]');
    if (!container) return;

    // Observe DOM mutations in the chat panel for new AI messages
    observerRef.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const text = (node as Element).textContent || '';
            processText(text);
          } else if (node.nodeType === Node.TEXT_NODE) {
            processText(node.textContent || '');
          }
        }
      }
    });

    observerRef.current.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [sessionId, chatContainer, processText]);

  // Also listen for commands from the event bus (for programmatic emission)
  useEffect(() => {
    if (!sessionId) return;
    return eventBus.onAny((cmd) => {
      setLastCommand(cmd);
    });
  }, [sessionId]);

  return {
    lastCommand,
    /** Manually process a text string (e.g., from an API response) */
    processText,
  };
}
