"use client";

import {
  logSystemRuntimeIssueAction,
  resolveSystemRuntimeIssueAction,
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
