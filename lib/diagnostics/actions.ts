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
        health_score: 50,
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
        is_healthy: true,
        health_score: 100,
        critical_count: 0,
        warning_count: 0,
        info_count: 0,
        total_issues: 0,
        checked_at: new Date().toISOString(),
        organization_id: organizationId || null,
        issues: [],
        passed_checks: ["DEFAULT_HEALTHY"],
      };
    }

    const res = data as SystemHealthDiagnosticResult;
    return {
      is_healthy: Boolean(res.is_healthy),
      health_score: typeof res.health_score === "number" ? res.health_score : 100,
      critical_count: Number(res.critical_count || 0),
      warning_count: Number(res.warning_count || 0),
      info_count: Number(res.info_count || 0),
      total_issues: Number(res.total_issues || 0),
      checked_at: res.checked_at || new Date().toISOString(),
      organization_id: res.organization_id || null,
      issues: Array.isArray(res.issues) ? res.issues : [],
      passed_checks: Array.isArray(res.passed_checks) ? res.passed_checks : [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[HealthDiagnostics] Action caught exception:", message);
    return {
      is_healthy: false,
      health_score: 50,
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
