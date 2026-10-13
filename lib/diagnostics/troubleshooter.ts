"use client";

import {
  logSystemRuntimeIssueAction,
  resolveSystemRuntimeIssueAction,
  type SystemHealthIssue,
} from "./actions";
import { getCurrentUserSession } from "@/lib/auth/session";

export interface ReportIncidentParams {
  organizationId: string;
  module: string;
  location: string;
  severity?: "CRITICAL" | "WARNING" | "INFO";
  errorCode?: string;
  title: string;
  reason: string;
  recommendation: string;
  details?: Record<string, unknown>;
}

/**
 * Reports a runtime operational error or database failure.
 * 1. Persists incident to PostgreSQL system_health_issues_log.
 * 2. Emits a real-time DOM event so the UI banner immediately reflects the problem.
 */
function sanitizeIncidentText(value: unknown, maxLength = 500): string {
  return String(value ?? "Unknown error")
    .replace(/https?:\/\/\S+/gi, "[URL_REDACTED]")
    .replace(/\b(access_token|refresh_token|service_role|api[_-]?key|password|secret|authorization)\b\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[TOKEN_REDACTED]")
    .slice(0, maxLength);
}

export async function reportSystemRuntimeIncident(
  params: ReportIncidentParams
): Promise<string | null> {
  const ephemeralId = "ephemeral-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const eventPayload: Partial<SystemHealthIssue> = {
    id: ephemeralId,
    module: sanitizeIncidentText(params.module, 120),
    location: sanitizeIncidentText(params.location, 240),
    severity: params.severity || "CRITICAL",
    title: sanitizeIncidentText(params.title, 240),
    reason: sanitizeIncidentText(params.reason, 900),
    recommendation: sanitizeIncidentText(params.recommendation, 500),
    timestamp: new Date().toISOString(),
  };

  // Alert immediately in the active browser before waiting for the database write.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("system-health-incident-reported", { detail: eventPayload }));
  }

  // The write action independently revalidates user and active-organization scope.
  const issueId = await logSystemRuntimeIssueAction({
    organizationId: params.organizationId,
    module: eventPayload.module || "UNKNOWN_MODULE",
    location: eventPayload.location || "UNKNOWN_LOCATION",
    severity: eventPayload.severity || "CRITICAL",
    errorCode: sanitizeIncidentText(params.errorCode || "RUNTIME_ERROR", 100),
    title: eventPayload.title || "System operation failed",
    reason: eventPayload.reason || "An operation failed; the reason could not be safely extracted.",
    recommendation: eventPayload.recommendation || "Inspect the affected workflow and diagnostic logs.",
    details: sanitizeIncidentDetails(params.details || {}),
  });

  if (issueId && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("system-health-incident-persisted", {
      detail: { ephemeralId, issueId },
    }));
  }

  return issueId;
}

function sanitizeIncidentDetails(input: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  const allowedKeys = new Set([
    "error_code", "operation", "pathname", "error_kind", "captured_at",
    "occurred_at", "expense_id", "resource_type", "http_status", "rpc_name",
  ]);

  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.toLowerCase();
    if (!allowedKeys.has(normalizedKey)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      safe[normalizedKey] = value;
    } else if (typeof value === "string") {
      safe[normalizedKey] = sanitizeIncidentText(value, 240);
    }
  }

  return safe;
}

/**
 * Resolves an active incident in the database and notifies the UI banner.
 */
export async function resolveSystemRuntimeIncident(params: {
  organizationId: string;
  module?: string;
  issueId?: string;
}): Promise<number> {
  const count = await resolveSystemRuntimeIssueAction(params);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("system-health-incident-resolved", {
        detail: params,
      })
    );
  }

  return count;
}

/**
 * Installs global error and unhandled rejection listeners in the browser.
 * Catches any unexpected client-side exception or failed asynchronous mutation,
 * immediately localizing the file/route and notifying the troubleshooter alert engine.
 */
let globalMonitoringRefCount = 0;
let globalMonitoringCleanup: (() => void) | null = null;

/**
 * Installs a single shared browser-error monitor, even when the header badge and
 * page banner both mount. It resolves the user's active organization per event;
 * it never uses a hardcoded hospital ID or client-provided tenant as authority.
 */
export function setupGlobalErrorMonitoring(): () => void {
  if (typeof window === "undefined") return () => {};

  globalMonitoringRefCount += 1;

  if (!globalMonitoringCleanup) {
    const recentlyReported = new Map<string, number>();
    let windowStartedAt = Date.now();
    let reportsThisWindow = 0;

    const report = async (
      kind: "UNCAUGHT_BROWSER_ERROR" | "UNHANDLED_PROMISE_REJECTION",
      location: string,
      rawReason: unknown,
      line?: number,
      column?: number
    ) => {
      const now = Date.now();
      if (now - windowStartedAt >= 60_000) {
        windowStartedAt = now;
        reportsThisWindow = 0;
      }
      if (reportsThisWindow >= 5) return;

      const reason = sanitizeIncidentText(rawReason, 500);
      if (/ResizeObserver loop|AbortError|The user aborted a request/i.test(reason)) return;

      const route = window.location.pathname || "/";
      const normalizedLocation = sanitizeIncidentText(location || route, 240);
      const dedupeKey = kind + ":" + route + ":" + reason;
      const lastReportedAt = recentlyReported.get(dedupeKey) || 0;
      if (now - lastReportedAt < 60_000) return;
      recentlyReported.set(dedupeKey, now);
      reportsThisWindow += 1;

      try {
        const session = await getCurrentUserSession(true);
        if (!session.userId || !session.organizationId) {
          // Keep the failure visible locally. Do not write against a guessed tenant.
          window.dispatchEvent(new CustomEvent("system-health-incident-reported", {
            detail: {
              id: "ephemeral-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
              severity: "WARNING",
              module: "BROWSER_RUNTIME",
              location: normalizedLocation,
              title: "Browser error captured; active hospital organization is unavailable",
              reason,
              recommendation: "Restore the authenticated hospital session and rerun diagnostics; the incident was not written to any tenant.",
              timestamp: new Date().toISOString(),
            } satisfies Partial<SystemHealthIssue>,
          }));
          return;
        }

        await reportSystemRuntimeIncident({
          organizationId: session.organizationId,
          module: "BROWSER_RUNTIME",
          location: line ? normalizedLocation + ":" + line + (column ? ":" + column : "") : normalizedLocation,
          severity: "WARNING",
          errorCode: kind,
          title: kind === "UNCAUGHT_BROWSER_ERROR"
            ? "ব্রাউজার রানটাইম ত্রুটি (Uncaught Client Error)"
            : "অমীমাংসিত অ্যাসিঙ্ক্রোনাস ত্রুটি (Unhandled Promise Rejection)",
          reason,
          recommendation: "Affected route-টি পরীক্ষা করুন, diagnostic incident দেখুন, তারপর code/database cause ঠিক করে rescan করুন।",
          details: {
            pathname: route,
            error_kind: kind,
            captured_at: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("[OHMS Diagnostics] Browser error could not be reported:", error instanceof Error ? error.message : "Unknown error");
      }
    };

    const errorHandler = (event: ErrorEvent) => {
      const fileTail = event.filename ? event.filename.split("/").slice(-2).join("/") : window.location.pathname;
      const location = sanitizeIncidentText(fileTail, 240);
      const reason = event.message?.includes("Script error")
        ? "Browser reported a script error but cross-origin browser policy masked its details."
        : event.message || event.error?.message || "Unknown uncaught browser error";
      void report("UNCAUGHT_BROWSER_ERROR", location, reason, event.lineno, event.colno);
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
      if (!reason) return;
      void report("UNHANDLED_PROMISE_REJECTION", "Promise rejection at " + (window.location.pathname || "/"), reason);
    };

    window.addEventListener("error", errorHandler);
    window.addEventListener("unhandledrejection", rejectionHandler);

    globalMonitoringCleanup = () => {
      window.removeEventListener("error", errorHandler);
      window.removeEventListener("unhandledrejection", rejectionHandler);
      globalMonitoringCleanup = null;
    };
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    globalMonitoringRefCount = Math.max(0, globalMonitoringRefCount - 1);
    if (globalMonitoringRefCount === 0) globalMonitoringCleanup?.();
  };
}
