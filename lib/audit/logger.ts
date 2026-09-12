import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditEntry {
  organizationId: string;
  userId?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "VOID" | "REFUND" | "VERIFY" | "LOGIN" | "LOGOUT" | "VIEW" | "DOWNLOAD" | "PRINT";
  module: "BILLING" | "PATIENT" | "PHARMACY" | "LAB" | "IPD" | "IAM" | "HR" | "APPOINTMENT" | "DOCUMENT";
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Records an immutable audit log entry in the PostgreSQL audit_logs vault.
 */
export async function recordAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      organization_id: entry.organizationId,
      user_id: entry.userId || null,
      action: entry.action,
      module: entry.module,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      old_values: entry.oldValues || null,
      new_values: entry.newValues || null,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
    });
  } catch (err) {
    // Log silently to avoid breaking primary transaction while ensuring server trace
    console.error("[AUDIT VAULT LOG FAILURE]", err);
  }
}
