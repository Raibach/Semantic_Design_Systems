import { API_BASE } from "@/shared/apiHelper";
/**
 * TraceFeed — Live Telemetry Feed for the Right Column Trace Tab
 *
 * Displays a real-time stream of:
 *   - Execution logs (from logger.ts subscribers)
 *   - API call breadcrumbs (from apiInsights.ts)
 *   - Sentry breadcrumbs (polled from Sentry scope)
 *   - Timestamps for every event
 *
 * Compact design fits the 350px right column. Auto-scrolls to newest.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as Sentry from "@sentry/react";
import { logger, type LogEntry } from "@/lib/logger";
import { Activity, Wifi, AlertTriangle, Clock, Zap } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface TraceEntry {
  id: string;
  timestamp: number;
  type: "log" | "api" | "breadcrumb" | "system";
  level: "debug" | "info" | "warning" | "error" | "fatal";
  message: string;
  detail?: string;
}

interface Breadcrumb {
  category: string;
  message: string;
  level: string;
  timestamp: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 100;
const POLL_INTERVAL = 2000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelStyles(level: string): string {
  switch (level) {
    case "error":
    case "fatal":
      return "border-l-red-500 bg-red-50/50";
    case "warn":
    case "warning":
      return "border-l-amber-400 bg-amber-50/50";
    case "info":
      return "border-l-blue-400 bg-blue-50/30";
    case "debug":
      return "border-l-gray-300 bg-gray-50/30";
    default:
      return "border-l-gray-200";
  }
}

function typeIcon(type: string) {
  switch (type) {
    case "api":
      return <Wifi className="h-3 w-3 text-blue-500 shrink-0" />;
    case "breadcrumb":
      return <Zap className="h-3 w-3 text-purple-500 shrink-0" />;
    case "system":
      return <Activity className="h-3 w-3 text-emerald-500 shrink-0" />;
    default:
      return <Clock className="h-3 w-3 text-gray-400 shrink-0" />;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function TraceFeed() {
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  const [breadcrumbCount, setBreadcrumbCount] = useState(0);
  const [logCount, setLogCount] = useState(0);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const entryIdRef = useRef(0);

  // ── Subscribe to logger stream ──────────────────────────────────────────
  useEffect(() => {
    const unsub = logger.subscribe((logEntry: LogEntry) => {
      entryIdRef.current += 1;
      const entry: TraceEntry = {
        id: `log-${entryIdRef.current}`,
        timestamp: logEntry.timestamp,
        type: "log",
        level: logEntry.level === "warn" ? "warning" : logEntry.level as TraceEntry["level"],
        message: logEntry.message,
        detail: logEntry.data ? JSON.stringify(logEntry.data).slice(0, 120) : undefined,
      };

      setEntries((prev) => {
        const next = [entry, ...prev];
        return next.slice(0, MAX_ENTRIES);
      });
      setLogCount((c) => c + 1);
    });
    return unsub;
  }, []);

  // ── Poll Sentry breadcrumbs ─────────────────────────────────────────────
  useEffect(() => {
    const poll = () => {
      try {
        const scope = Sentry.getGlobalScope();
        if (!scope) return;
        const scopeData = (scope as unknown as { _breadcrumbs?: Breadcrumb[] })._breadcrumbs;
        if (scopeData && scopeData.length > 0) {
          const latest = scopeData[scopeData.length - 1];
          // Check if we already have this breadcrumb
          setEntries((prev) => {
            const exists = prev.some(
              (e) => e.type === "breadcrumb" && e.timestamp === latest.timestamp * 1000
            );
            if (exists) return prev;

            entryIdRef.current += 1;
            const entry: TraceEntry = {
              id: `bc-${entryIdRef.current}`,
              timestamp: latest.timestamp * 1000,
              type: "breadcrumb",
              level: (latest.level === "warn" ? "warning" : latest.level) as TraceEntry["level"],
              message: `[${latest.category}] ${latest.message}`,
            };
            const next = [entry, ...prev];
            return next.slice(0, MAX_ENTRIES);
          });
          setBreadcrumbCount(scopeData.length);
        }
      } catch {
        // Sentry internals may change
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // ── Listen for prompt execution events ─────────────────────────────────
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        model: string;
        duration: number;
        ttft: number;
        outputLength: number;
        timestamp: number;
      }>).detail;

      entryIdRef.current += 1;
      const entry: TraceEntry = {
        id: `perf-${entryIdRef.current}`,
        timestamp: detail.timestamp,
        type: "system",
        level: "info",
        message: `⚡ Prompt executed — ${detail.model}`,
        detail: `${detail.duration}ms total · ${detail.ttft}ms TTFT · ${detail.outputLength} chars output`,
      };
      setEntries((prev) => {
        const next = [entry, ...prev];
        return next.slice(0, MAX_ENTRIES);
      });
    };
    window.addEventListener("prompt-executed", handler);
    return () => window.removeEventListener("prompt-executed", handler);
  }, []);

  // ── API call listener ───────────────────────────────────────────────────
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const start = performance.now();
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : "unknown";
      try {
        const response = await originalFetch.apply(this, args);
        const duration = Math.round(performance.now() - start);

        // Only track API calls
        if (url.includes(`${API_BASE}/`)) {
          entryIdRef.current += 1;
          const isError = !response.ok;
          const entry: TraceEntry = {
            id: `api-${entryIdRef.current}`,
            timestamp: Date.now(),
            type: "api",
            level: isError ? "error" : "info",
            message: `${isError ? "❌" : "✅"} ${response.status} ${url.split("?")[0]}`,
            detail: `${duration}ms${isError ? ` — ${response.statusText}` : ""}`,
          };
          setEntries((prev) => {
            const next = [entry, ...prev];
            return next.slice(0, MAX_ENTRIES);
          });
        }
        return response;
      } catch (err) {
        entryIdRef.current += 1;
        const entry: TraceEntry = {
          id: `api-${entryIdRef.current}`,
          timestamp: Date.now(),
          type: "api",
          level: "error",
          message: `🚫 NETWORK ${url.split("?")[0]}`,
          detail: err instanceof Error ? err.message : "Unknown error",
        };
        setEntries((prev) => {
          const next = [entry, ...prev];
          return next.slice(0, MAX_ENTRIES);
        });
        throw err;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  // ── Clear feed ──────────────────────────────────────────────────────────
  const clearFeed = useCallback(() => {
    setEntries([]);
    setLogCount(0);
    setBreadcrumbCount(0);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-500" />
          <span className="text-[13px] font-semibold text-gray-700 font-['Inter']">
            Live Trace
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span title="Log events">{logCount} logs</span>
          <span title="Sentry breadcrumbs">{breadcrumbCount} crumbs</span>
          <button
            onClick={clearFeed}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Clear feed"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Entry feed */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 p-4">
            <Activity className="h-6 w-6 opacity-30" />
            <p className="text-[12px] italic text-center">
              Telemetry feed active — events will appear here as you interact with the console.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`px-3 py-2 border-l-2 transition-colors ${levelStyles(entry.level)}`}
              >
                <div className="flex items-start gap-2">
                  {typeIcon(entry.type)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-gray-700 truncate">
                        {entry.message}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                    {entry.detail && (
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                        {entry.detail}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={feedEndRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-200 text-[10px] text-gray-400 flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Monitoring active
      </div>
    </div>
  );
}

export default TraceFeed;
