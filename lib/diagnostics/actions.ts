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
  organizationId: string | null,
  id: string,
  title: string,
  reason: string
): SystemHealthDiagnosticResult {
  const timestamp = new Date().toISOString();
  return {
    is_healthy: false,
    health_score: 0,
    critical_count: 0,
    warning_count: 1,
    info_count: 0,
    total_issues: 1,
    checked_at: timestamp,
    organization_id: organizationId,
    issues: [{
      id,
      severity: "WARNING",
      module: "সিস্টেম ডায়াগনস্টিক ও মনিটরিং",
      location: "lib/diagnostics/actions.ts:getSystemHealthDiagnosticsAction",
      title,
      reason,
      recommendation: "সক্রিয় organization, Supabase সংযোগ, migration state এবং diagnostic RPC permissions পরীক্ষা করে পুনরায় scan চালান।",
      timestamp,
    }],
    passed_checks: [],
    error: reason,
  };
}

/**
 * Reads only the authenticated user's active organization.
 * Any missing, inaccessible, empty or malformed health response is UNKNOWN/degraded,
 * never an invented healthy score.
 */
export async function getSystemHealthDiagnosticsAction(
  requestedOrganizationId?: string
): Promise<SystemHealthDiagnosticResult> {
  let activeOrganizationId: string | null = null;

  try {
    const session = await getCurrentUserSession(true);
    activeOrganizationId = session.organizationId;

    if (!session.userId || !activeOrganizationId) {
      return diagnosticUnavailable(
        null,
        "DIAGNOSTIC_AUTH_CONTEXT_MISSING",
        "প্রাইভেট সিস্টেম পরীক্ষা চালানোর জন্য authenticated hospital session প্রয়োজন",
        "No authenticated user or active organization was resolved. Database health was not checked."
      );
    }

    if (requestedOrganizationId && requestedOrganizationId !== activeOrganizationId) {
      return diagnosticUnavailable(
        activeOrganizationId,
        "DIAGNOSTIC_ORG_SCOPE_MISMATCH",
        "অনুমোদিত organization-এর সঙ্গে অনুরোধের মিল নেই",
        "The requested organization did not match the authenticated user's active organization. No cross-tenant query was performed."
      );
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("check_system_health_diagnostics", {
      p_org_id: activeOrganizationId,
    });

    if (error) {
      const code = error.code || "UNKNOWN";
      const message = error.message || "No database error details were returned.";
      console.error("[HealthDiagnostics] RPC failed:", code, message);
      return diagnosticUnavailable(
        activeOrganizationId,
        "RPC_DIAGNOSTIC_FAILURE",
        "ডায়াগনস্টিক ইঞ্জিন পরীক্ষা চালাতে পারেনি",
        "Health RPC failed (" + code + "): " + message
      );
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return diagnosticUnavailable(
        activeOrganizationId,
        "DIAGNOSTIC_EMPTY_RESPONSE",
        "ডায়াগনস্টিক ইঞ্জিন থেকে কোনো বৈধ ফলাফল পাওয়া যায়নি",
        "The health RPC returned null or a non-object response. System health remains UNKNOWN."
      );
    }

    const result = data as Partial<SystemHealthDiagnosticResult>;
    if (
      typeof result.is_healthy !== "boolean" ||
      typeof result.health_score !== "number" ||
      !Number.isFinite(result.health_score) ||
      typeof result.total_issues !== "number" ||
      !Number.isFinite(result.total_issues) ||
      !Array.isArray(result.issues) ||
      !Array.isArray(result.passed_checks)
    ) {
      return diagnosticUnavailable(
        activeOrganizationId,
        "DIAGNOSTIC_INVALID_RESPONSE",
        "ডায়াগনস্টিক ফলাফলের data structure বৈধ নয়",
        "Required health fields were missing or malformed. System health cannot be confirmed."
      );
    }

    const issues = result.issues as SystemHealthIssue[];
    const reportedCount = Math.max(0, Math.trunc(result.total_issues));
    let totalIssues = Math.max(reportedCount, issues.length);
    let normalizedIssues = issues;
    let normalizedWarnings = Math.max(0, Number(result.warning_count) || 0);
    let score = Math.max(0, Math.min(100, Math.round(result.health_score)));

    // Defensive consistency rule: an unhealthy response with no reason is not a
    // trustworthy "100%" result. Surface the missing explanation as its own alert.
    if (
      totalIssues === 0 &&
      (
        result.is_healthy !== true ||
        score !== 100 ||
        result.passed_checks.length === 0
      )
    ) {
      const timestamp = result.checked_at || new Date().toISOString();
      normalizedIssues = [{
        id: "DIAGNOSTIC_RESULT_INCONSISTENT",
        severity: "WARNING",
        module: "সিস্টেম ডায়াগনস্টিক ও মনিটরিং",
        location: "public.check_system_health_diagnostics",
        title: "ডায়াগনস্টিক ফলাফলে অসামঞ্জস্য পাওয়া গেছে",
        reason: "কোনো issue report হয়নি, কিন্তু health flag, health score বা completed-check তালিকা healthy result-এর সঙ্গে মেলেনি। এই ফলাফলকে verified healthy হিসেবে ধরা যাবে না।",
        recommendation: "RPC implementation, issue aggregation, completed-check list এবং current database diagnostics যাচাই করুন।",
        timestamp,
      }];
      totalIssues = 1;
      normalizedWarnings += 1;
      score = 0;
    }

    return {
      is_healthy: result.is_healthy === true && totalIssues === 0 && normalizedIssues.length === 0,
      health_score: totalIssues > 0 ? Math.min(score, 99) : score,
      critical_count: Math.max(0, Number(result.critical_count) || 0),
      warning_count: normalizedWarnings,
      info_count: Math.max(0, Number(result.info_count) || 0),
      total_issues: totalIssues,
      checked_at: result.checked_at || new Date().toISOString(),
      organization_id: activeOrganizationId,
      issues: normalizedIssues,
      passed_checks: result.passed_checks as string[],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown diagnostic action exception";
    console.error("[HealthDiagnostics] Diagnostic action failed:", message);
    return diagnosticUnavailable(
      activeOrganizationId,
      "DIAGNOSTIC_ACTION_EXCEPTION",
      "ডায়াগনস্টিক সার্ভিসে অপ্রত্যাশিত ত্রুটি",
      message
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
      console.warn("[HealthDiagnostics] Incident write blocked: missing or mismatched active organization.");
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
      console.warn("[HealthDiagnostics] Incident resolution blocked: missing or mismatched active organization.");
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
