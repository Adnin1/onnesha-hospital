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

import {
  type ClientNoiseClassification,
  classifyClientRuntimeNoise,
} from "./noise-classifier";

export {
  type ClientNoiseClassification,
  classifyClientRuntimeNoise,
};

/**
 * Reports a runtime operational error or database failure.
 * 1. Drops extension noise immediately (never emitted to UI or DB).
 * 2. Persists genuine first-party incident to PostgreSQL system_health_issues_log.
 * 3. Emits a real-time DOM event so the UI banner immediately reflects genuine issues.
 */
export async function reportSystemRuntimeIncident(
  params: ReportIncidentParams
): Promise<string | null> {
  const noise = classifyClientRuntimeNoise({
    message: `${params.title} ${params.reason}`,
    stack: typeof params.details?.stack === "string" ? params.details.stack : undefined,
  });

  if (noise.isNoise) {
    // Drop extension/browser noise immediately; never emit to UI or persist to DB
    return null;
  }

  // Fire immediate client-side custom event so user sees alert right away
  if (typeof window !== "undefined") {
    const eventPayload: Partial<SystemHealthIssue> = {
      id: "ephemeral-" + Date.now(),
      module: params.module,
      location: params.location,
      severity: params.severity || "WARNING",
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
    severity: params.severity || "WARNING",
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
// Deduplication cache: fingerprint -> { count: number, lastSeen: number }
const errorDeduplicationMap = new Map<string, { count: number; lastSeen: number }>();
const DEDUP_WINDOW_MS = 10000;

/**
 * Classifies an incoming client-side runtime error into CRITICAL, WARNING, or IGNORE.
 * - IGNORE taxonomy: resizeobserver, chrome-extension://, moz-extension://, external channel noise.
 * - CRITICAL: financial_invariants, double-entry, pgrst301, auth corruption, RLS violations, cross_tenant leaks.
 * - WARNING: first-party application exceptions.
 */
export function classifyRuntimeError(params: string | { message?: string; filename?: string; stack?: string }): {
  severity: "CRITICAL" | "WARNING" | "IGNORE";
  isFinancialOrSecurity: boolean;
  classification?: "CLIENT_EXTENSION_NOISE" | "BENIGN_BROWSER_EVENT" | "APPLICATION_ERROR";
} {
  const normParams = typeof params === "string" ? { message: params } : params;
  const noise = classifyClientRuntimeNoise(normParams);

  if (noise.isNoise) {
    return {
      severity: "IGNORE",
      isFinancialOrSecurity: false,
      classification: noise.classification,
    };
  }

  const lower = ((normParams.message || "") + " " + (normParams.stack || "")).toLowerCase();

  // 1. CRITICAL: financial integrity, double-entry, RLS policies, auth corruption
  if (
    lower.includes("pgrst301") ||
    lower.includes("pgrst116") ||
    lower.includes("jwt expired") ||
    lower.includes("token expired") ||
    lower.includes("unauthorized") ||
    lower.includes("financial_invariants") ||
    lower.includes("trial_balance") ||
    lower.includes("double_entry") ||
    lower.includes("ledger_inbalance") ||
    lower.includes("rls violation") ||
    lower.includes("row-level security") ||
    lower.includes("cross_tenant")
  ) {
    return { severity: "CRITICAL", isFinancialOrSecurity: true, classification: "APPLICATION_ERROR" };
  }

  // 2. Default to WARNING for standard client-side exceptions
  return { severity: "WARNING", isFinancialOrSecurity: false, classification: "APPLICATION_ERROR" };
}

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

  /**
   * Autonomous self-healing trigger.
   * Note: Dispatches recovery attempt; verified RESOLVED_AUTO_HEALED transitions require authoritative backend proof.
   */
  const triggerAutonomousHealing = async (
    module: string,
    reason: string,
    errorCode: string,
    orgId: string
  ) => {
    let actionTaken = "স্বয়ংক্রিয় সেফটি ট্র্যাপ সক্রিয় করে স্টেট পুনরুদ্ধার প্রচেষ্টা চালানো হয়েছে";

    if (reason.includes("JWT") || reason.includes("token") || reason.includes("PGRST301") || reason.includes("401")) {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const client = createClient();
        await client.auth.refreshSession();
        actionTaken = "সেশন টোকেন নবায়ন প্রচেষ্টা সম্পন্ন হয়েছে (Session Refresh Attempted)";
      } catch {
        actionTaken = "নিরাপদ অথ স্টেট পুনরায় সিঙ্ক করার চেষ্টা হয়েছে";
      }
    } else if (reason.includes("QuotaExceeded") || reason.includes("quota") || reason.includes("localStorage")) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("ohms_temp_") || k.startsWith("ohms_cache_"))) {
            localStorage.removeItem(k);
          }
        }
        actionTaken = "অপ্রয়োজনীয় ক্যাশ ক্লিয়ার করে স্টোরেজ মুক্ত করার চেষ্টা করা হয়েছে";
      } catch {
        actionTaken = "লোকাল স্টোরেজ রিসেট করার চেষ্টা হয়েছে";
      }
    } else if (reason.includes("Failed to fetch") || reason.includes("NetworkError") || (typeof navigator !== "undefined" && !navigator.onLine)) {
      actionTaken = "অফলাইন রেজিলিয়েন্স বাফার সক্রিয় করা হয়েছে (Offline Resilience Active)";
    }

    if (typeof window !== "undefined") {
      // Dispatches RECOVERY_ATTEMPTED without asserting verified resolution
      window.dispatchEvent(
        new CustomEvent("system-health-recovery-attempted", {
          detail: {
            organizationId: orgId,
            module: module,
            status: "RECOVERY_ATTEMPTED",
            action: actionTaken,
            timestamp: new Date().toISOString(),
          },
        })
      );

      fetch("/api/security-telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "RECOVERY_ATTEMPTED",
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
    const filename = event.filename || "";
    const stack = event.error?.stack || "";

    const classification = classifyRuntimeError({
      message: msg,
      filename: filename,
      stack: stack,
    });

    if (classification.severity === "IGNORE") {
      // Confirmed browser extension noise: drop silently, NO db log, NO score drop
      return;
    }

    const location = `${filename ? filename.split("/").slice(-2).join("/") : window.location.pathname}:${event.lineno || 0}`;
    const fingerprint = `${location}:${msg.slice(0, 80)}`;
    const now = Date.now();
    const existing = errorDeduplicationMap.get(fingerprint);

    if (existing && now - existing.lastSeen < DEDUP_WINDOW_MS) {
      existing.count += 1;
      existing.lastSeen = now;
      return; // Deduplicated within debounce window
    }
    errorDeduplicationMap.set(fingerprint, { count: 1, lastSeen: now });

    const orgId = resolveOrgId();
    const reason = msg || "অপ্রত্যাশিত ক্লায়েন্ট সাইড ত্রুটি সনাক্ত হয়েছে।";

    void reportSystemRuntimeIncident({
      organizationId: orgId,
      module: window.location.pathname || "Frontend UI",
      location: location,
      severity: classification.severity,
      errorCode: "UNCAUGHT_BROWSER_ERROR",
      title: classification.severity === "CRITICAL"
        ? "গুরুত্বপূর্ণ রানটাইম ত্রুটি (Critical Runtime Error)"
        : "ব্রাউজার রানটাইম সতর্কতা (Client Runtime Warning)",
      reason: reason,
      recommendation: "ত্রুটির উৎস পরীক্ষা করুন ও সমাধান নিশ্চিত করুন।",
      details: { stack: stack?.slice(0, 300) },
    });

    void triggerAutonomousHealing(
      window.location.pathname || "Frontend UI",
      reason,
      "UNCAUGHT_BROWSER_ERROR",
      orgId
    );
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const reasonText = event.reason instanceof Error ? event.reason.message : String(event.reason || "");
    const stackText = event.reason instanceof Error ? event.reason.stack : "";

    const classification = classifyRuntimeError({
      message: reasonText,
      stack: stackText,
    });

    if (classification.severity === "IGNORE") {
      // Confirmed browser extension rejection: drop silently, NO db log, NO score drop
      return;
    }

    const location = `Promise Rejection at ${window.location.pathname}`;
    const fingerprint = `${location}:${reasonText.slice(0, 80)}`;
    const now = Date.now();
    const existing = errorDeduplicationMap.get(fingerprint);

    if (existing && now - existing.lastSeen < DEDUP_WINDOW_MS) {
      existing.count += 1;
      existing.lastSeen = now;
      return; // Deduplicated within debounce window
    }
    errorDeduplicationMap.set(fingerprint, { count: 1, lastSeen: now });

    const orgId = resolveOrgId();

    void reportSystemRuntimeIncident({
      organizationId: orgId,
      module: window.location.pathname || "Frontend UI",
      location: location,
      severity: classification.severity,
      errorCode: "UNHANDLED_PROMISE_REJECTION",
      title: classification.severity === "CRITICAL"
        ? "গুরুত্বপূর্ণ প্রমিজ ত্রুটি (Critical Promise Rejection)"
        : "অমীমাংসিত প্রমিজ সতর্কতা (Unhandled Promise Rejection)",
      reason: reasonText,
      recommendation: "অ্যাসিঙ্ক অপারেশনের রুটিনের ত্রুটি হ্যান্ডলার পরীক্ষা করুন।",
      details: { stack: stackText?.slice(0, 300) },
    });

    void triggerAutonomousHealing(
      window.location.pathname || "Frontend UI",
      reasonText,
      "UNHANDLED_PROMISE_REJECTION",
      orgId
    );
  };

  window.addEventListener("error", errorHandler);
  window.addEventListener("unhandledrejection", rejectionHandler);

  return () => {
    window.removeEventListener("error", errorHandler);
    window.removeEventListener("unhandledrejection", rejectionHandler);
    globalMonitoringInstalled = false;
  };
}
