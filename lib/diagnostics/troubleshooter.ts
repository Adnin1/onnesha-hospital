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
  const ephemeralId = "ephemeral-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const eventPayload: Partial<SystemHealthIssue> = {
    id: ephemeralId,
    module: params.module,
    location: params.location,
    severity: params.severity || "CRITICAL",
    title: params.title,
    reason: params.reason,
    recommendation: params.recommendation,
    timestamp: new Date().toISOString(),
  };

  // Show the event immediately even if the database logger is currently unavailable.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("system-health-incident-reported", {
        detail: eventPayload,
      })
    );
  }

  // Persist to Supabase database; the health UI keeps the local incident until this succeeds.
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

  if (issueId && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("system-health-incident-persisted", {
        detail: { ephemeralId, issueId },
      })
    );
  }

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
