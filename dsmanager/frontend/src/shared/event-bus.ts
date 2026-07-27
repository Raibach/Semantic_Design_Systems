/**
 * A2UI Event Bus — Frontend command channel between AI backend and UI.
 *
 * The AI backend (grace_gui.py) emits JSON commands that land here.
 * Components listen for commands matching their registered tags.
 * The Gatekeeper (tag-registry.ts) validates before execution.
 */

import type { AiCommand, GatekeeperResult } from './tag-registry';
import { validateTag } from './tag-registry';

type CommandHandler = (command: AiCommand) => void;

class EventBus {
  private handlers = new Map<string, Set<CommandHandler>>();
  private auditLog: AiCommand[] = [];

  /** Emit a command from the AI backend. Validates, logs, dispatches. */
  emit(command: AiCommand): GatekeeperResult {
    const result = validateTag(command);

    // Log to audit trail (in-memory; Phase 4 pipes to PostgreSQL)
    this.auditLog.push({
      ...command,
      timestamp: command.timestamp || new Date().toISOString(),
    });

    if (!result.valid || !result.tag) {
      console.warn('[EventBus] Blocked invalid command:', result.error, command);
      window.dispatchEvent(
        new CustomEvent('ai-command-blocked', { detail: { command, error: result.error } })
      );
      return result;
    }

    // Dispatch to registered handlers for this tag
    const tagHandlers = this.handlers.get(result.tag);
    if (tagHandlers) {
      tagHandlers.forEach((handler) => {
        try {
          handler(command);
        } catch (err) {
          console.error(`[EventBus] Handler error for tag "${result.tag}":`, err);
        }
      });
    }

    // Also fire a global DOM event for any listener
    window.dispatchEvent(
      new CustomEvent('ai-command', { detail: command })
    );

    return result;
  }

  /** Register a handler for a specific tag. Returns unsubscribe function. */
  on(tag: string, handler: CommandHandler): () => void {
    if (!this.handlers.has(tag)) {
      this.handlers.set(tag, new Set());
    }
    this.handlers.get(tag)!.add(handler);

    return () => {
      this.handlers.get(tag)?.delete(handler);
    };
  }

  /** Listen to ALL commands (global listener). Returns unsubscribe. */
  onAny(handler: CommandHandler): () => void {
    const wrapper = (e: Event) => {
      handler((e as CustomEvent<AiCommand>).detail);
    };
    window.addEventListener('ai-command', wrapper);
    return () => window.removeEventListener('ai-command', wrapper);
  }

  /** Get the full audit log (reset on page unload; Phase 4 persists to DB). */
  getAuditLog(): ReadonlyArray<AiCommand> {
    return this.auditLog;
  }

  /** Clear the in-memory audit log. */
  clearAuditLog(): void {
    this.auditLog = [];
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Re-export types
export type { AiCommand, GatekeeperResult };
