"use client";

import {
  logSystemRuntimeIssueAction,
  resolveSystemRuntimeIssueAction,
  verifyAndResolveSystemIssueAction,
  type SystemHealthIssue,
} from "./actions";

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
export async function reportSystemRuntimeIncident(
  params: ReportIncidentParams
): Promise<string | null> {
  // Fire immediate client-side custom event so user sees alert right away
  if (typeof window !== "undefined") {
    const eventPayload: Partial<SystemHealthIssue> = {
      id: "ephemeral-" + Date.now(),
      module: params.module,
      location: params.location,
      severity: params.severity || "CRITICAL",
      title: params.title,
      reason: params.reason,
      recommendation: params.recommendation,
      timestamp: new Date().toISOString(),
    };
    window.dispatchEvent(
      new CustomEvent("system-health-incident-reported", {
        detail: eventPayload,
      })
    );
  }

  // Persist to Supabase database
  const issueId = await logSystemRuntimeIssueAction({
    organizationId: params.organizationId,
    module: params.module,
    location: params.location,
    severity: params.severity || "CRITICAL",
    errorCode: params.errorCode,
    title: params.title,
    reason: params.reason,
    recommendation: params.recommendation,
    details: params.details,
  });

  return issueId;
}

export interface ResolveIncidentParams {
  organizationId: string;
  module?: string;
  issueId?: string;
  location?: string;
  errorCode?: string;
}

/**
 * Resolves an active incident in the database and notifies the UI banner.
 */
export async function resolveSystemRuntimeIncident(
  params: ResolveIncidentParams
): Promise<number> {
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
 * Verified recovery lifecycle: verifies the incident is resolved in database
 * and marks lifecycle_status = 'RESOLVED_VERIFIED' with evidence.
 */
export async function verifyAndResolveSystemRuntimeIncident(params: {
  organizationId: string;
  issueId: string;
  verificationEvidence?: Record<string, unknown>;
}): Promise<boolean> {
  const res = await verifyAndResolveSystemIssueAction(params);

  if (res.success && res.lifecycle_status === "RESOLVED_VERIFIED") {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("system-health-incident-resolved", {
          detail: {
            organizationId: params.organizationId,
            issueId: params.issueId,
            status: "RESOLVED_VERIFIED",
          },
        })
      );
    }
    return true;
  }

  return false;
}

/**
 * Installs global error and unhandled rejection listeners in the browser.
 * Catches any unexpected client-side exception or failed asynchronous mutation,
 * immediately localizing the file/route and notifying the troubleshooter alert engine.
 */
let globalMonitoringInstalled = false;

export function setupGlobalErrorMonitoring(defaultOrgId?: string): () => void {
  if (typeof window === "undefined" || globalMonitoringInstalled) {
    return () => {};
  }
  globalMonitoringInstalled = true;

  const errorHandler = (event: ErrorEvent) => {
    if (event.message?.includes("ResizeObserver loop") || event.message?.includes("Script error")) {
      return;
    }
    const location = `${event.filename ? event.filename.split("/").slice(-2).join("/") : window.location.pathname}:${event.lineno || 0}`;
    if (defaultOrgId) {
      void reportSystemRuntimeIncident({
        organizationId: defaultOrgId,
        module: window.location.pathname || "Frontend UI",
        location: location,
        severity: "CRITICAL",
        errorCode: "UNCAUGHT_BROWSER_ERROR",
        title: "ব্রাউজার রানটাইম ত্রুটি (Uncaught Client Error)",
        reason: event.message || "অপ্রত্যাশিত ক্লায়েন্ট সাইড ত্রুটি সনাক্ত হয়েছে।",
        recommendation: "পৃষ্ঠাটি রিফ্রেশ করুন অথবা সাপোর্ট টিমকে অবহিত করুন।",
        details: { stack: event.error?.stack?.slice(0, 300) },
      });
    }
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const reasonText = event.reason instanceof Error ? event.reason.message : String(event.reason || "");
    if (!reasonText || reasonText.includes("ResizeObserver") || reasonText.includes("AbortError")) {
      return;
    }
    if (defaultOrgId) {
      void reportSystemRuntimeIncident({
        organizationId: defaultOrgId,
        module: window.location.pathname || "Frontend UI",
        location: `Promise Rejection at ${window.location.pathname}`,
        severity: "WARNING",
        errorCode: "UNHANDLED_PROMISE_REJECTION",
        title: "অমীমাংসিত প্রমিজ ত্রুটি (Unhandled Promise Rejection)",
        reason: reasonText,
        recommendation: "নেটওয়ার্ক সংযোগ ও এপিআই স্ট্যাটাস পরীক্ষা করুন।",
      });
    }
  };

  window.addEventListener("error", errorHandler);
  window.addEventListener("unhandledrejection", rejectionHandler);

  return () => {
    window.removeEventListener("error", errorHandler);
    window.removeEventListener("unhandledrejection", rejectionHandler);
    globalMonitoringInstalled = false;
  };
}
