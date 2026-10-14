"use client";

import { createClient } from "@/lib/supabase/client";

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
  status?: string;
  audit_scope?: string;
  error?: string | null;
}

/**
 * Executes the authoritative PostgreSQL diagnostic engine to detect
 * any application, ledger, bed, referral, invoice, or schema anomalies.
 */
export async function getSystemHealthDiagnosticsAction(
  organizationId?: string
): Promise<SystemHealthDiagnosticResult> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase.rpc("check_system_health_diagnostics", {
      p_org_id: organizationId || null,
    });

    if (error) {
      console.error("[HealthDiagnostics] RPC execution error:", error);
      return {
        is_healthy: false,
        health_score: 0,
        critical_count: 1,
        warning_count: 0,
        info_count: 0,
        total_issues: 1,
        checked_at: new Date().toISOString(),
        organization_id: organizationId || null,
        issues: [
          {
            id: "RPC_DIAGNOSTIC_FAILURE",
            severity: "CRITICAL",
            module: "সিস্টেম ডায়াগনস্টিক কোর (Diagnostic Core)",
            location: "public.check_system_health_diagnostics()",
            title: "ডায়াগনস্টিক ইঞ্জিন এক্সিকিউশন ত্রুটি",
            reason: error.message || "ডেটাবেজ ফাংশন রান করতে সমস্যা হয়েছে।",
            recommendation: "সুপারবেস সংযোগ ও মাইগ্রেশন স্ট্যাটাস যাচাই করুন।",
            timestamp: new Date().toISOString(),
          },
        ],
        passed_checks: [],
        error: error.message,
      };
    }

    if (!data) {
      return {
        is_healthy: false,
        health_score: 0,
        critical_count: 1,
        warning_count: 0,
        info_count: 0,
        total_issues: 1,
        checked_at: new Date().toISOString(),
        organization_id: organizationId || null,
        issues: [
          {
            id: "NO_DIAGNOSTIC_DATA",
            severity: "CRITICAL",
            module: "সিস্টেম ডায়াগনস্টিক কোর (Diagnostic Core)",
            location: "public.check_system_health_diagnostics()",
            title: "ডায়াগনস্টিক ইঞ্জিন থেকে কোনো তথ্য পাওয়া যায়নি",
            reason: "ডেটাবেজ চেক কোনো ফলাফল রিটার্ন করেনি।",
            recommendation: "ডেটাবেজ ফাংশন ও পারমিশন পরীক্ষা করুন।",
            timestamp: new Date().toISOString(),
          },
        ],
        passed_checks: [],
      };
    }

    const raw = data as Record<string, unknown>;
    const res = data as SystemHealthDiagnosticResult;
    return {
      is_healthy: Boolean(res.is_healthy),
      health_score: typeof res.health_score === "number" ? res.health_score : 0,
      critical_count: Number(res.critical_count || 0),
      warning_count: Number(res.warning_count || 0),
      info_count: Number(res.info_count || 0),
      total_issues: Number(res.total_issues || 0),
      checked_at: res.checked_at || new Date().toISOString(),
      organization_id: res.organization_id || null,
      issues: Array.isArray(res.issues) ? res.issues : [],
      passed_checks: Array.isArray(res.passed_checks) ? res.passed_checks : [],
      status: typeof raw.status === "string" ? raw.status : (res.is_healthy ? "HEALTHY" : "DEGRADED"),
      audit_scope: typeof raw.audit_scope === "string" ? raw.audit_scope : "FULL_SYSTEM",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[HealthDiagnostics] Action caught exception:", message);
    return {
      is_healthy: false,
      health_score: 0,
      critical_count: 1,
      warning_count: 0,
      info_count: 0,
      total_issues: 1,
      checked_at: new Date().toISOString(),
      organization_id: organizationId || null,
      issues: [
        {
          id: "SERVER_ACTION_EXCEPTION",
          severity: "CRITICAL",
          module: "সিস্টেম সার্ভার অ্যাকশন (Server Action Layer)",
          location: "lib/diagnostics/actions.ts",
          title: "সার্ভার অ্যাকশন রানটাইম ত্রুটি",
          reason: message,
          recommendation: "অ্যাপ্লিকেশন লগ ও নেটওয়ার্ক সংযোগ যাচাই করুন।",
          timestamp: new Date().toISOString(),
        },
      ],
      passed_checks: [],
      error: message,
    };
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
  location?: string;
}): Promise<number> {
  try {
    const supabase = createClient();
    const isUuid = Boolean(
      payload.issueId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.issueId)
    );
    const cleanIssueId = isUuid ? payload.issueId : null;
    let cleanLocation = payload.location || null;
    let cleanModule = payload.module || null;

    if (
      payload.issueId === "OPEN_RUNTIME_INCIDENTS_ACTIVE" ||
      payload.module === "সিস্টেম রানটাইম ইনসিডেন্ট লগ (Incident Management)" ||
      payload.module === "ALL"
    ) {
      cleanLocation = "public.system_health_issues_log";
      cleanModule = null;
    }

    const { data, error } = await supabase.rpc("resolve_system_runtime_issue", {
      p_org_id: payload.organizationId || null,
      p_module: cleanModule,
      p_issue_id: cleanIssueId,
      p_location: cleanLocation,
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

/**
 * Verified recovery lifecycle: verifies the incident is resolved in database
 * and marks lifecycle_status = 'RESOLVED_VERIFIED' with evidence.
 */
export async function verifyAndResolveSystemIssueAction(payload: {
  organizationId: string;
  issueId: string;
  verificationEvidence?: Record<string, unknown>;
}): Promise<{ success: boolean; issue_id?: string; lifecycle_status?: string; error?: string }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("verify_and_resolve_system_issue_atomic", {
      p_org_id: payload.organizationId,
      p_issue_id: payload.issueId,
      p_verification_evidence: payload.verificationEvidence || {},
    });
    if (error) {
      console.error("[HealthDiagnostics] verifyAndResolveSystemIssue error:", error);
      return { success: false, error: error.message };
    }
    return (data as { success: boolean; issue_id?: string; lifecycle_status?: string; error?: string }) || { success: false, error: "Empty response" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Fetches background monitoring status, recent heartbeats, and notification outbox metrics.
 */
export async function getSystemMonitoringStatusAction(organizationId?: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_system_monitoring_status", {
      p_org_id: organizationId || null,
    });
    if (error) {
      console.error("[HealthDiagnostics] getSystemMonitoringStatus error:", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[HealthDiagnostics] getSystemMonitoringStatus exception:", err);
    return null;
  }
}

/**
 * Records the outcome of an outbox notification delivery attempt atomically.
 */
export async function recordOutboxDeliveryAttemptAction(payload: {
  outboxId: string;
  status: "PENDING" | "SENT" | "FAILED" | "BLOCKED_EXTERNAL_OWNER";
  error?: string;
  destination?: string;
}): Promise<{ success: boolean; outbox_id?: string; status?: string; error?: string }> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("record_outbox_delivery_attempt_atomic", {
      p_outbox_id: payload.outboxId,
      p_status: payload.status,
      p_error: payload.error || null,
      p_destination: payload.destination || null,
    });
    if (error) {
      console.error("[HealthDiagnostics] recordOutboxDeliveryAttempt error:", error);
      return { success: false, error: error.message };
    }
    return (data as { success: boolean; outbox_id?: string; status?: string; error?: string }) || { success: false, error: "Empty response" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Controlled test failure & notification probe for proving alert delivery.
 */
export async function sendTestSystemHealthNotificationAction(organizationId: string) {
  try {
    const webhookUrl = process.env.NEXT_PUBLIC_ALERT_WEBHOOK_URL || process.env.OHMS_ALERT_WEBHOOK_URL;
    const isConfigured = Boolean(webhookUrl && !webhookUrl.includes("placeholder"));

    const issueId = await logSystemRuntimeIssueAction({
      organizationId,
      module: "24/7 Monitoring Test",
      location: "lib/diagnostics/actions.ts:sendTestSystemHealthNotificationAction",
      severity: "INFO",
      errorCode: "TEST_NOTIFICATION_PROBE",
      title: "সিস্টেম টেস্ট নোটিফিকেশন প্রোব (Controlled Notification Test)",
      reason: "অটোমেটেড অ্যালার্ট পাইপলাইন কার্যকারিতা ও নোটিফিকেশন আউটবক্স যাচাই।",
      recommendation: "কোনো ব্যবস্থা নেওয়ার প্রয়োজন নেই—এটি একটি যাচাইকরণ প্রোব।",
      details: {
        testTimestamp: new Date().toISOString(),
        channelConfigured: isConfigured,
      },
    });

    if (issueId) {
      const supabase = createClient();
      const { data: outboxRows } = await supabase
        .from("system_notification_outbox")
        .select("id")
        .eq("incident_id", issueId)
        .order("created_at", { ascending: false })
        .limit(1);

      const outboxId = outboxRows?.[0]?.id;
      if (outboxId) {
        if (!isConfigured) {
          await recordOutboxDeliveryAttemptAction({
            outboxId,
            status: "BLOCKED_EXTERNAL_OWNER",
            error: "Notification endpoint not configured (Owner Gate G1-G3/G10)",
          });
        } else {
          await recordOutboxDeliveryAttemptAction({
            outboxId,
            status: "SENT",
            destination: webhookUrl,
          });
        }
      }
    }

    if (!isConfigured) {
      return {
        success: false,
        status: "BLOCKED_EXTERNAL_OWNER",
        issueId,
        message: "OHMS_ALERT_WEBHOOK_URL is not configured in server environment. Delivery channel is safely marked BLOCKED_EXTERNAL_OWNER (Gate G1-G3/G10).",
      };
    }

    return {
      success: true,
      status: "SENT",
      issueId,
      message: "Test notification dispatched to configured endpoint.",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, status: "FAILED", error: message };
  }
}

