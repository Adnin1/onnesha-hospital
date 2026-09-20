import { createClient } from "@/lib/supabase/client";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";

export interface AuditEntry {
  organizationId: string;
  userId?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "VOID" | "REFUND" | "VERIFY" | "LOGIN" | "LOGOUT" | "VIEW" | "DOWNLOAD" | "PRINT" | "DISCOUNT";
  module: "BILLING" | "PATIENT" | "PHARMACY" | "LAB" | "IPD" | "IAM" | "HR" | "APPOINTMENT" | "DOCUMENT" | "CLINICAL" | "ACCOUNTING" | "PROCUREMENT" | "ASSETS" | "NURSING";
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogRecord {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_profile?: {
    full_name: string;
    email?: string;
  } | null;
}

/**
 * Persist an immutable audit entry. Audit persistence is fail-closed so a
 * sensitive mutation cannot report success when its forensic record failed.
 */
export async function recordAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const payload = {
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
    };

    const client = createClient();

    const { error } = await client.from("audit_logs").insert(payload);

    if (error) {
      throw new Error(`Audit log persistence failed: ${error.message}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown audit log persistence error";
    console.error("[AUDIT LOG FAILURE]", message);
    throw new Error(message);
  }
}

/**
 * Fetch audit trail logs with strict multi-tenant RLS and pagination.
 * Requires SETTINGS_AUDIT or SETTINGS_VIEW permission.
 */
export async function getAuditLogsAction(params?: {
  module?: string;
  action?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ success: boolean; data?: { logs: AuditLogRecord[]; total: number }; error?: string }> {
  try {
    await requirePermission(PERMISSIONS.SETTINGS_VIEW);
    const supabase = createClient();
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    let query = supabase
      .from("audit_logs")
      .select("id, organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (params?.module && params.module !== "ALL") {
      query = query.eq("module", params.module);
    }
    if (params?.action && params.action !== "ALL") {
      query = query.eq("action", params.action);
    }
    if (params?.search) {
      const sanitized = params.search.replace(/[,().%"']/g, "").trim();
      if (sanitized) {
        query = query.or(`entity_id.ilike.%${sanitized}%,entity_type.ilike.%${sanitized}%`);
      }
    }

    const { data, count, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        logs: (data as unknown as AuditLogRecord[]) || [],
        total: count || 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load audit trail logs",
    };
  }
}
