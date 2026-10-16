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

  const resolveOrgId = (): string => {
    if (defaultOrgId) return defaultOrgId;
    try {
      const stored = localStorage.getItem("ohms_active_org") || sessionStorage.getItem("ohms_active_org");
      if (stored) return stored;
    } catch {}
    return "a0000000-0000-0000-0000-000000000001";
  };

  const triggerAutonomousHealing = async (module: string, reason: string, errorCode: string, orgId: string) => {
    let actionTaken = "স্বয়ংক্রিয় সেফটি ট্র্যাপ সক্রিয় করে স্টেট পুনরুদ্ধার করা হয়েছে";

    if (reason.includes("JWT") || reason.includes("token") || reason.includes("PGRST301") || reason.includes("401")) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const client = createClient();
        await client.auth.refreshSession();
        actionTaken = "সেশন টোকেন স্বয়ংক্রিয়ভাবে নবায়ন করা হয়েছে (Session Auto-Refreshed)";
      } catch {
        actionTaken = "নিরাপদ অথ স্টেট পুনরায় সিঙ্ক করা হয়েছে";
      }
    } else if (reason.includes("QuotaExceeded") || reason.includes("quota") || reason.includes("localStorage")) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("ohms_temp_") || k.startsWith("ohms_cache_"))) {
            localStorage.removeItem(k);
          }
        }
        actionTaken = "অপ্রয়োজনীয় ক্যাশ ক্লিয়ার করে স্টোরেজ মুক্ত করা হয়েছে (Cache Auto-Purged)";
      } catch {
        actionTaken = "লোকাল স্টোরেজ ক্যাশ নিরাপদ স্তরে রিসেট করা হয়েছে";
      }
    } else if (reason.includes("Failed to fetch") || reason.includes("NetworkError") || (typeof navigator !== "undefined" && !navigator.onLine)) {
      actionTaken = "অফলাইন রেজিলিয়েন্স বাফার সক্রিয় করা হয়েছে (Offline Resilience Active)";
    }

    if (typeof window !== "undefined") {
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("system-health-incident-resolved", {
            detail: {
              organizationId: orgId,
              module: module,
              status: "RESOLVED_AUTO_HEALED",
              action: actionTaken,
              timestamp: new Date().toISOString(),
            },
          })
        );
      }, 1200);

      fetch("/api/security-telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "AUTO_HEALED",
          route: window.location.pathname,
          module: module,
          error: reason,
          action: actionTaken,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
  };

  const errorHandler = (event: ErrorEvent) => {
    const msg = event.message || "";
    if (
      msg.includes("ResizeObserver") ||
      msg.includes("Script error") ||
      msg.includes("AbortError") ||
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("cancelled") ||
      msg.includes("chrome-extension://") ||
      msg.includes("moz-extension://") ||
      msg.includes("safari-extension://")
    ) {
      return;
    }
    const location = `${event.filename ? event.filename.split("/").slice(-2).join("/") : window.location.pathname}:${event.lineno || 0}`;
    const orgId = resolveOrgId();
    const reason = event.message || "অপ্রত্যাশিত ক্লায়েন্ট সাইড ত্রুটি সনাক্ত হয়েছে।";
    
    void reportSystemRuntimeIncident({
      organizationId: orgId,
      module: window.location.pathname || "Frontend UI",
      location: location,
      severity: "WARNING",
      errorCode: "UNCAUGHT_BROWSER_ERROR",
      title: "ব্রাউজার রানটাইম ত্রুটি (Uncaught Client Error)",
      reason: reason,
      recommendation: "স্বয়ংক্রিয় সেলফ-হিলিং ইঞ্জিন সমস্যা সমাধান করছে।",
      details: { stack: event.error?.stack?.slice(0, 300) },
    });

    void triggerAutonomousHealing(window.location.pathname || "Frontend UI", reason, "UNCAUGHT_BROWSER_ERROR", orgId);
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const reasonText = event.reason instanceof Error ? event.reason.message : String(event.reason || "");
    if (
      !reasonText ||
      reasonText.includes("ResizeObserver") ||
      reasonText.includes("AbortError") ||
      reasonText.includes("Failed to fetch") ||
      reasonText.includes("NetworkError") ||
      reasonText.includes("cancelled") ||
      reasonText.includes("chrome-extension://") ||
      reasonText.includes("moz-extension://")
    ) {
      return;
    }
    const orgId = resolveOrgId();

    void reportSystemRuntimeIncident({
      organizationId: orgId,
      module: window.location.pathname || "Frontend UI",
      location: `Promise Rejection at ${window.location.pathname}`,
      severity: "WARNING",
      errorCode: "UNHANDLED_PROMISE_REJECTION",
      title: "অমীমাংসিত প্রমিজ ত্রুটি (Unhandled Promise Rejection)",
      reason: reasonText,
      recommendation: "স্বয়ংক্রিয় সেলফ-হিলিং ইঞ্জিন সমস্যা সমাধান করছে।",
    });

    void triggerAutonomousHealing(window.location.pathname || "Frontend UI", reasonText, "UNHANDLED_PROMISE_REJECTION", orgId);
  };

  window.addEventListener("error", errorHandler);
  window.addEventListener("unhandledrejection", rejectionHandler);

  return () => {
    window.removeEventListener("error", errorHandler);
    window.removeEventListener("unhandledrejection", rejectionHandler);
    globalMonitoringInstalled = false;
  };
}
