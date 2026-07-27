/**
 * Sentry Initialization — Prompt Composer Console
 * ================================================
 * ENTERPRISE PRODUCTION CONFIGURATION
 *
 * Initializes Sentry ONLY in production/staging environments.
 * DSN and sampling rates are driven exclusively by environment variables.
 * Fails loudly if required vars are missing in production.
 *
 * Imported FIRST in main.tsx — must execute before any app code.
 */
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

// ── Environment constants ────────────────────────────────────────────────────
const MODE = import.meta.env.MODE as string;
const IS_PRODUCTION = MODE === "production";
const IS_DEVELOPMENT = MODE === "development";

// ── Required production variables — warn if missing, skip Sentry ──────────────
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || "";
const SENTRY_DSN_VALID = SENTRY_DSN && SENTRY_DSN.startsWith("https://");

if (IS_PRODUCTION && !SENTRY_DSN) {
  console.warn(
    "[Sentry] VITE_SENTRY_DSN is not set. Sentry error reporting is disabled. " +
      "Add VITE_SENTRY_DSN to your .env.production file to enable.",
  );
}

// ── Configurable sampling (production-safe defaults) ─────────────────────────
const parseEnvFloat = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const TRACES_SAMPLE_RATE = parseEnvFloat(
  import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
  IS_PRODUCTION ? 0.1 : 1.0,
);
const PROFILES_SAMPLE_RATE = parseEnvFloat(
  import.meta.env.VITE_SENTRY_PROFILES_SAMPLE_RATE,
  IS_PRODUCTION ? 0.1 : 1.0,
);
const REPLAYS_SESSION_RATE = parseEnvFloat(
  import.meta.env.VITE_SENTRY_REPLAYS_SESSION_RATE,
  IS_PRODUCTION ? 0.1 : 1.0,
);

// ── DSN format validation ────────────────────────────────────────────────────
const validateDsn = (dsn: string): boolean => {
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" && url.hostname.includes("sentry.io");
  } catch {
    return false;
  }
};

// ── Initialize ───────────────────────────────────────────────────────────────
const initSentry = (): boolean => {
  // In development, skip silently — Sentry noise is counterproductive
  if (IS_DEVELOPMENT) {
    console.log("[sentry] Skipped — development environment");
    return false;
  }

  // Production / staging — DSN is mandatory
  if (!SENTRY_DSN) {
    console.error("[sentry] FATAL: No DSN configured. Sentry disabled.");
    return false;
  }

  if (!validateDsn(SENTRY_DSN)) {
    console.error(
      "[sentry] FATAL: Invalid DSN format. Expected https://xxx@xxx.ingest.sentry.io/xxx. Got:",
      SENTRY_DSN.slice(0, 30) + "...",
    );
    return false;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,

      environment: MODE,
      enabled: true,
      release:
        import.meta.env.VITE_RELEASE_VERSION ||
        import.meta.env.VITE_APP_VERSION ||
        undefined,
      debug: false, // NEVER enable debug in production

      // ── Sampling (production-optimized) ─────────────────────────────────
      tracesSampleRate: TRACES_SAMPLE_RATE,
      profilesSampleRate: PROFILES_SAMPLE_RATE,
      replaysSessionSampleRate: REPLAYS_SESSION_RATE,
      replaysOnErrorSampleRate: 1.0, // Always capture replays on error
      enableLogs: true,

      // ── AI Agent Monitoring ────────────────────────────────────────────
      dataCollection: {
        genAI: { inputs: false, outputs: false },
      },

      // ── Distributed tracing ─────────────────────────────────────────────
      tracePropagationTargets: [
        "localhost",
        "127.0.0.1",
        "prompt-portal-prod.raibach.net",
        /^\/api\//,
      ],

      // ── Integrations ────────────────────────────────────────────────────
      integrations: [
        // React Router v6 — parameterized route names for transaction grouping
        Sentry.reactRouterV6BrowserTracingIntegration({
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),

        // Browser JS profiling — requires Document-Policy: js-profiling header
        // Disabled until SiteGround Apache config adds: Header set Document-Policy "js-profiling"
        // Sentry.browserProfilingIntegration(),

        // Session replay — masks password inputs
        Sentry.replayIntegration({
          maskAllText: false,
          maskAllInputs: true,
          blockAllMedia: false,
          mask: [".sentry-mask", "input[type='password']"],
        }),

        // Console breadcrumbs — capture error/warn to Sentry timeline
        Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),

        // HTTP client breadcrumbs + automatic fetch/XHR instrumentation
        Sentry.browserTracingIntegration({
          enableHTTPTimings: true,
        }),

        // Extra context on errors
        Sentry.extraErrorDataIntegration({ depth: 4 }),
      ],

      // ── Data scrubbing ──────────────────────────────────────────────────
      beforeSend(event, hint) {
        const error = hint.originalException;

        // Filter ResizeObserver noise
        if (error instanceof Error) {
          const msg = error.message || "";
          if (
            msg.includes("ResizeObserver") ||
            msg.includes("loop completed with undelivered")
          ) {
            return null;
          }
        }

        // Strip sensitive headers
        if (event.request?.headers) {
          delete event.request.headers["Authorization"];
          delete event.request.headers["Cookie"];
        }

        // JSON payload size guard
        const payload = JSON.stringify(event);
        if (payload.length > 200_000) {
          console.warn(
            "[sentry] Event payload exceeds 200KB — dropping to avoid rejection.",
          );
          return null;
        }

        return event;
      },

      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "Network request failed", // Generic network errors — already handled
      ],

      denyUrls: [
        // Chrome extensions
        /extensions\//i,
        /^chrome:\/\//i,
        /^chrome-extension:\/\//i,
      ],
    });

    if (IS_DEVELOPMENT) {
      console.log(
        `[sentry] Initialised | env=${MODE} | traces=${TRACES_SAMPLE_RATE} | ` +
          `profiles=${PROFILES_SAMPLE_RATE} | replays=${REPLAYS_SESSION_RATE}`,
      );
    }

    // Expose for runtime verification
    (window as any).__SENTRY_INITIALIZED__ = true;
    return true;
  } catch (err) {
    console.error("[sentry] CRITICAL: Initialization failed:", err);
    (window as any).__SENTRY_INIT_FAILED__ = true;
    return false;
  }
};

// ── Execute ──────────────────────────────────────────────────────────────────
const sentryReady = initSentry();

// ── Named export for runtime checks ──────────────────────────────────────────
export const isSentryReady = (): boolean =>
  sentryReady && !!(window as any).__SENTRY_INITIALIZED__;

export default Sentry;
