import { API_BASE } from "@/shared/apiHelper";
/**
 * Centralised Logger with Sentry Breadcrumbs
 *
 * Provides structured logging that simultaneously:
 *   1. Outputs to the browser console
 *   2. Drops a Sentry breadcrumb for session replay context
 *   3. Persists to localStorage via the existing ErrorLogger service
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error('API failed', { endpoint: '/api/users', status: 500 });
 *   logger.info('User clicked export', { format: 'pdf' });
 *   logger.warn('Slow render detected', { component: 'ConsolePage', ms: 3200 });
 */

import * as Sentry from "@sentry/react";
import { errorLogger } from "@/services/errorLogger";

// ── Types ────────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

type LogHandler = (entry: LogEntry) => void;

// ── Subscribers (for DebugPanel real-time feed) ──────────────────────────────

const subscribers = new Set<LogHandler>();

function notify(entry: LogEntry): void {
  for (const handler of subscribers) {
    try {
      handler(entry);
    } catch {
      // Never let a subscriber crash the logger
    }
  }
}

// ── Sentry breadcrumb level mapping ──────────────────────────────────────────

const SENTRY_LEVEL_MAP: Record<LogLevel, Sentry.SeverityLevel> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
  fatal: "fatal",
};

// ── Core logger ──────────────────────────────────────────────────────────────

function createLogEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
  return { level, message, data, timestamp: Date.now() };
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry = createLogEntry(level, message, data);

  // 1. Console output (with appropriate method)
  const consoleFn = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
    fatal: console.error,
  }[level];

  const prefix = `[${level.toUpperCase()}]`;
  if (data) {
    consoleFn(prefix, message, data);
  } else {
    consoleFn(prefix, message);
  }

  // 2. Sentry breadcrumb (context for session replays)
  Sentry.addBreadcrumb({
    category: "app",
    message: `${level}: ${message}`,
    level: SENTRY_LEVEL_MAP[level],
    data: data ?? {},
    timestamp: entry.timestamp / 1000, // Sentry expects seconds
  });

  // 3. Persist to local ErrorLogger for 'error' and 'fatal'
  if (level === "error" || level === "fatal") {
    errorLogger.logError("runtime", "error", message, data as Record<string, unknown>);
  }

  // 4. Notify subscribers (DebugPanel)
  notify(entry);
}

// ── Public API ───────────────────────────────────────────────────────────────

export const logger = {
  debug(message: string, data?: Record<string, unknown>) {
    log("debug", message, data);
  },

  info(message: string, data?: Record<string, unknown>) {
    log("info", message, data);
  },

  warn(message: string, data?: Record<string, unknown>) {
    log("warn", message, data);
  },

  error(message: string, data?: Record<string, unknown>) {
    log("error", message, data);
  },

  fatal(message: string, data?: Record<string, unknown>) {
    log("fatal", message, data);
  },

  // ── Specialised helpers ────────────────────────────────────────────────────

  /**
   * Log an API call failure with structured context.
   * Automatically adds a Sentry breadcrumb with the endpoint and status.
   */
  apiError(endpoint: string, status: number, message: string, requestBody?: unknown): void {
    log("error", `API ${status} on ${endpoint}: ${message}`, {
      endpoint,
      status,
      requestBody: requestBody ? JSON.stringify(requestBody).slice(0, 500) : undefined,
    });
  },

  /**
   * Log a user action for breadcrumb trails in session replay.
   */
  action(label: string, data?: Record<string, unknown>): void {
    Sentry.addBreadcrumb({
      category: "user-action",
      message: label,
      level: "info",
      data: data ?? {},
      timestamp: Date.now() / 1000,
    });
    notify(createLogEntry("info", `[ACTION] ${label}`, data));
  },

  /**
   * Log a navigation event.
   */
  navigation(from: string, to: string): void {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: `${from} → ${to}`,
      level: "info",
      data: { from, to },
      timestamp: Date.now() / 1000,
    });
  },

  /**
   * Set a tagged context on the current Sentry scope (survives across events).
   */
  setContext(key: string, value: Record<string, unknown>): void {
    Sentry.setContext(key, value);
  },

  /**
   * Set the current user on the Sentry scope (call after login).
   */
  setUser(id: string, email?: string, username?: string): void {
    Sentry.setUser({ id, email, username });
  },

  /**
   * Clear the current user (call on logout).
   */
  clearUser(): void {
    Sentry.setUser(null);
  },

  // ── Subscriber management (for DebugPanel) ─────────────────────────────────

  subscribe(handler: LogHandler): () => void {
    subscribers.add(handler);
    return () => {
      subscribers.delete(handler);
    };
  },

  get subscribers(): ReadonlySet<LogHandler> {
    return subscribers;
  },
};

// ── Global error capture ──

window.addEventListener(
  "error",
  (event: ErrorEvent) => {
    if (event.defaultPrevented) return;
    const msg = event.message || "";
    if (
      msg.includes("ResizeObserver") ||
      msg.includes("loop completed with undelivered")
    ) {
      return;
    }

    logger.error("Unhandled error", {
      message: msg,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  },
  { passive: true },
);

window.addEventListener(
  "unhandledrejection",
  (event: PromiseRejectionEvent) => {
    if (event.defaultPrevented) return;

    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);

    if (
      msg.includes("ResizeObserver") ||
      msg.includes("loop completed with undelivered")
    ) {
      return;
    }

    logger.error("Unhandled promise rejection", {
      message: msg,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  },
  { passive: true },
);

// ── Fetch interceptor — log all API calls with timing ────────────────────

const _originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method || "GET";
  const start = performance.now();

  // Only log calls to our own API (skip third-party, vite HMR, etc.)
  const shouldLog = url.includes(`${API_BASE}/`) && !url.includes("/@vite") && !url.includes("/@react-refresh");

  try {
    const response = await _originalFetch(input, init);
    const elapsed = Math.round(performance.now() - start);

    if (shouldLog) {
      if (response.ok) {
        logger.debug(`${method} ${url.split("?")[0]}`, { status: response.status, ms: elapsed });
      } else {
        logger.error(`${method} ${url.split("?")[0]} FAILED`, { status: response.status, ms: elapsed });
      }
    }

    return response;
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - start);

    if (shouldLog) {
      logger.error(`${method} ${url.split("?")[0]} NETWORK ERROR`, {
        error: err.message || "Network failure",
        ms: elapsed,
      });
    }

    throw err;
  }
};

// ── Console interception — capture ALL errors and warnings, filter nothing ─
// ⚠️  DISABLED: This creates infinite recursion because logger calls console.error,
// which then calls logger.error again. Keep original console as-is.

// const _origConsole = {
//   error: console.error.bind(console),
//   warn: console.warn.bind(console),
// };

// console.error = function (...args: any[]) {
//   _origConsole.error(...args);
//   const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
//   if (msg.trim()) {
//     logger.error(`[console] ${msg.slice(0, 500)}`);
//   }
// };

// console.warn = function (...args: any[]) {
//   _origConsole.warn(...args);
//   const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
//   if (msg.trim()) {
//     logger.warn(`[console] ${msg.slice(0, 500)}`);
//   }
// };
