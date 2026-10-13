"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";

export interface SystemHealthIssue {
  id: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  module: string;
  location: string;
  title: string;
  reason: string;
  recommendation: string;
  timestamp: string;
}

export interface SystemHealthDiagnosticResult {
  is_healthy: boolean;
  health_score: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  total_issues: number;
  checked_at: string;
  organization_id: string | null;
  issues: SystemHealthIssue[];
  passed_checks: string[];
  error?: string | null;
}

/**
 * Executes the authoritative PostgreSQL diagnostic engine to detect
 * any application, ledger, bed, referral, invoice, or schema anomalies.
 */
function diagnosticUnavailable(
  title: string,
  reason: string,
  organizationId: string | null,
  errorCode: string
): SystemHealthDiagnosticResult {
  return {
    is_healthy: false,
    health_score: 0,
    critical_count: 0,
    warning_count: 1,
    info_count: 0,
    total_issues: 1,
    checked_at: new Date().toISOString(),
    organization_id: organizationId,
    issues: [{
      id: errorCode,
      severity: "WARNING",
      module: "সিস্টেম ডায়াগনস্টিক ও মনিটরিং",
      location: "lib/diagnostics/actions.ts:getSystemHealthDiagnosticsAction",
      title,
      reason,
      recommendation: "সিস্টেম ও ডেটাবেজ সংযোগ, RPC permissions এবং active organization যাচাই করুন।",
      timestamp: new Date().toISOString(),
    }],
    passed_checks: [],
    error: reason,
  };
}

/**
 * Reads diagnostics only for the authenticated user's active organization.
 * Missing, malformed or failed diagnostics are never interpreted as healthy.
 * Database-side authorization is enforced by check_system_health_diagnostics_for_current_org.
 */
export async function getSystemHealthDiagnosticsAction(
  organizationId?: string
): Promise<SystemHealthDiagnosticResult> {
  let activeOrganizationId: string | null = null;
  try {
    const session = await getCurrentUserSession(true);
    activeOrganizationId = session.organizationId;

    if (!session.userId || !activeOrganizationId) {
      return diagnosticUnavailable(
        "সিস্টেম হেলথ চেক চালানোর জন্য authenticated organization পাওয়া যায়নি",
        "No authenticated user or active organization is available; health is UNKNOWN, not healthy.",
        null,
        "DIAGNOSTIC_AUTH_CONTEXT_MISSING"
      );
    }

    if (organizationId && organizationId !== activeOrganizationId) {
      return diagnosticUnavailable(
        "অবৈধ organization scope সনাক্ত",
        "The requested diagnostic organization does not match the authenticated active organization.",
        activeOrganizationId,
        "DIAGNOSTIC_ORG_SCOPE_MISMATCH"
      );
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("check_system_health_diagnostics_for_current_org");

    if (error) {
      console.error("[HealthDiagnostics] RPC execution error:", error.code || "UNKNOWN");
      return diagnosticUnavailable(
        "সিস্টেম ডায়াগনস্টিক পরীক্ষা চালানো যায়নি",
        `Health RPC failed (${error.code || "UNKNOWN"}): ${error.message || "No database error message returned"}`,
        activeOrganizationId,
        "RPC_DIAGNOSTIC_FAILURE"
      );
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return diagnosticUnavailable(
        "ডায়াগনস্টিক সিস্টেম থেকে বৈধ ফলাফল পাওয়া যায়নি",
        "The diagnostic RPC returned an empty or malformed response. The system health state cannot be confirmed.",
        activeOrganizationId,
        "DIAGNOSTIC_EMPTY_RESPONSE"
      );
    }

    const res = data as Partial<SystemHealthDiagnosticResult>;
    if (
      typeof res.is_healthy !== "boolean" ||
      typeof res.health_score !== "number" ||
      typeof res.total_issues !== "number" ||
      !Array.isArray(res.issues) ||
      !Array.isArray(res.passed_checks)
    ) {
      return diagnosticUnavailable(
        "ডায়াগনস্টিক ফলাফলের গঠন সঠিক নয়",
        "The diagnostic RPC response did not contain all required health fields.",
        activeOrganizationId,
        "DIAGNOSTIC_INVALID_RESPONSE"
      );
    }

    return {
      is_healthy: res.is_healthy,
      health_score: Math.max(0, Math.min(100, res.health_score)),
      critical_count: Number(res.critical_count || 0),
      warning_count: Number(res.warning_count || 0),
      info_count: Number(res.info_count || 0),
      total_issues: Number(res.total_issues || 0),
      checked_at: res.checked_at || new Date().toISOString(),
      organization_id: activeOrganizationId,
      issues: res.issues as SystemHealthIssue[],
      passed_checks: res.passed_checks as string[],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[HealthDiagnostics] Action caught exception:", message);
    return diagnosticUnavailable(
      "সিস্টেম ডায়াগনস্টিক সার্ভিসে ত্রুটি",
      message,
      activeOrganizationId,
      "DIAGNOSTIC_ACTION_EXCEPTION"
    );
  }
}

/**
 * Logs a runtime system error or operational failure to the PostgreSQL
 * system_health_issues_log table so it immediately triggers the alert engine.
 */
export async function logSystemRuntimeIssueAction(payload: {
  organizationId: string;
  module: string;
  location: string;
  severity?: "CRITICAL" | "WARNING" | "INFO";
  errorCode?: string;
  title: string;
  reason: string;
  recommendation: string;
  details?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const session = await getCurrentUserSession(true);
    if (!session.userId || !session.organizationId || session.organizationId !== payload.organizationId) {
      console.warn("[HealthDiagnostics] Runtime issue was not persisted because active organization authorization was unavailable.");
      return null;
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("log_system_runtime_issue", {
      p_org_id: payload.organizationId,
      p_module: payload.module,
      p_location: payload.location,
      p_severity: payload.severity || "CRITICAL",
      p_error_code: payload.errorCode || "RUNTIME_ERROR",
      p_title: payload.title,
      p_reason: payload.reason,
      p_recommendation: payload.recommendation,
      p_details: payload.details || {},
    });
    if (error) {
      console.error("[HealthDiagnostics] Failed to log runtime issue:", error);
      return null;
    }
    return data as string;
  } catch (err) {
    console.error("[HealthDiagnostics] logSystemRuntimeIssue exception:", err);
    return null;
  }
}

/**
 * Resolves one or all active runtime issues for a specific module or ID.
 */
export async function resolveSystemRuntimeIssueAction(payload: {
  organizationId: string;
  module?: string;
  issueId?: string;
}): Promise<number> {
  try {
    const session = await getCurrentUserSession(true);
    if (!session.userId || !session.organizationId || session.organizationId !== payload.organizationId) {
      console.warn("[HealthDiagnostics] Runtime issue was not resolved because active organization authorization was unavailable.");
      return 0;
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("resolve_system_runtime_issue", {
      p_org_id: payload.organizationId,
      p_module: payload.module || null,
      p_issue_id: payload.issueId || null,
    });
    if (error) {
      console.error("[HealthDiagnostics] Failed to resolve runtime issue:", error);
      return 0;
    }
    return Number(data || 0);
  } catch (err) {
    console.error("[HealthDiagnostics] resolveSystemRuntimeIssue exception:", err);
    return 0;
  }
}
