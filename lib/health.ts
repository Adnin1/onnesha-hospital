/**
 * Onnesha Hospital Operational Health Subsystem
 * - Safe health checks for database, auth, notification outbox, and storage
 * - Strictly NO PHI, NID, patient names, or financial numbers in telemetry
 */

import {
  getPublicHealthCheck as coreGetPublicHealthCheck,
  checkSystemHealth as coreCheckSystemHealth,
  sanitizeErrorForTelemetry as coreSanitizeErrorForTelemetry,
} from "./health-core.mjs";

export interface SystemHealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: { status: "ok" | "error"; latencyMs?: number };
    auth: { status: "ok" | "error" };
    outbox: { status: "ok" | "error"; pendingCount?: number };
    storage: { status: "ok" };
  };
}

export function getPublicHealthCheck(): { status: "ok"; timestamp: string } {
  return coreGetPublicHealthCheck() as { status: "ok"; timestamp: string };
}

export async function checkSystemHealth(): Promise<SystemHealthStatus> {
  return coreCheckSystemHealth() as Promise<SystemHealthStatus>;
}

export function sanitizeErrorForTelemetry(error: unknown): { message: string; code?: string } {
  return coreSanitizeErrorForTelemetry(error);
}
