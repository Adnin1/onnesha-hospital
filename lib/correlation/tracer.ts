/**
 * Request Correlation & Distributed Tracing for OHMS
 * Generates unique correlation IDs for clinical mutations and financial transactions.
 */

export function generateCorrelationId(prefix: string = "req"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

export interface TraceContext {
  correlationId: string;
  timestamp: string;
  operationName: string;
  actorUserId?: string | null;
  organizationId?: string | null;
}

export function createTraceContext(
  operationName: string,
  actorUserId?: string | null,
  organizationId?: string | null
): TraceContext {
  return {
    correlationId: generateCorrelationId(operationName.toLowerCase().replace(/[^a-z0-9]/g, "_")),
    timestamp: new Date().toISOString(),
    operationName,
    actorUserId: actorUserId || null,
    organizationId: organizationId || null,
  };
}
