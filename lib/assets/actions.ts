import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { PERMISSIONS } from "@/lib/permissions";

export type AssetCategory =
  | "MEDICAL_EQUIPMENT"
  | "DIAGNOSTIC_MACHINE"
  | "IT_HARDWARE"
  | "FURNITURE"
  | "VEHICLE"
  | "FACILITY";

export type AssetStatus = "ACTIVE" | "MAINTENANCE" | "DEPRECIATED" | "DISPOSED";

export interface HospitalAssetRecord {
  id: string;
  organization_id: string;
  asset_code: string;
  asset_name: string;
  category: AssetCategory;
  serial_number?: string | null;
  department_id?: string | null;
  purchase_date: string;
  purchase_cost: number;
  current_value: number;
  location?: string | null;
  status: AssetStatus;
  created_at: string;
}

export interface AssetMaintenanceRecord {
  id: string;
  organization_id: string;
  asset_id: string;
  maintenance_date: string;
  cost: number;
  performed_by?: string | null;
  notes: string;
  next_service_date?: string | null;
  created_at: string;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Fetch Hospital Assets
 */
export async function getHospitalAssetsAction(params?: {
  category?: string;
  status?: string;
  limit?: number;
}): Promise<ActionResult<{ assets: HospitalAssetRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("hospital_assets")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.category && params.category !== "ALL") {
      query = query.eq("category", params.category);
    }
    if (params?.status && params.status !== "ALL") {
      query = query.eq("status", params.status);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { assets: (data as HospitalAssetRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch hospital assets";
    return { success: false, error: msg };
  }
}

/**
 * 2. Create a new Hospital Asset
 */
export async function createHospitalAssetAction(input: {
  asset_code: string;
  asset_name: string;
  category: AssetCategory;
  serial_number?: string;
  department_id?: string;
  purchase_date?: string;
  purchase_cost: number;
  current_value?: number;
  location?: string;
}): Promise<ActionResult<{ asset: HospitalAssetRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.ASSETS_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient assets management permissions";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const purchaseCost = Math.max(0, input.purchase_cost);
    const currentValue = input.current_value !== undefined ? Math.max(0, input.current_value) : purchaseCost;

    const { data, error } = await supabase
      .from("hospital_assets")
      .insert({
        organization_id: session.organizationId,
        asset_code: input.asset_code.trim(),
        asset_name: input.asset_name.trim(),
        category: input.category,
        serial_number: input.serial_number?.trim() || null,
        department_id: input.department_id || null,
        purchase_date: input.purchase_date || new Date().toISOString().split("T")[0],
        purchase_cost: purchaseCost,
        current_value: currentValue,
        location: input.location?.trim() || null,
        status: "ACTIVE",
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "ASSETS",
      entityType: "hospital_assets",
      entityId: data.id,
      newValues: { asset_code: data.asset_code, asset_name: data.asset_name, cost: purchaseCost },
    });

    return { success: true, data: { asset: data as HospitalAssetRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create hospital asset";
    return { success: false, error: msg };
  }
}

/**
 * 3. Fetch Asset Maintenance Logs
 */
export async function getAssetMaintenanceLogsAction(params?: {
  asset_id?: string;
  limit?: number;
}): Promise<ActionResult<{ logs: AssetMaintenanceRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("asset_maintenance_logs")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("maintenance_date", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.asset_id) {
      query = query.eq("asset_id", params.asset_id);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { logs: (data as AssetMaintenanceRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch asset maintenance logs";
    return { success: false, error: msg };
  }
}

/**
 * 4. Create Asset Maintenance Log
 */
export async function createAssetMaintenanceLogAction(input: {
  asset_id: string;
  maintenance_date?: string;
  cost: number;
  performed_by?: string;
  notes: string;
  next_service_date?: string;
}): Promise<ActionResult<{ log: AssetMaintenanceRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.ASSETS_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient assets management permissions";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("asset_maintenance_logs")
      .insert({
        organization_id: session.organizationId,
        asset_id: input.asset_id,
        maintenance_date: input.maintenance_date || new Date().toISOString().split("T")[0],
        cost: Math.max(0, input.cost),
        performed_by: input.performed_by?.trim() || null,
        notes: input.notes.trim(),
        next_service_date: input.next_service_date || null,
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "ASSETS",
      entityType: "asset_maintenance_logs",
      entityId: data.id,
      newValues: { asset_id: input.asset_id, cost: input.cost },
    });

    return { success: true, data: { log: data as AssetMaintenanceRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record asset maintenance";
    return { success: false, error: msg };
  }
}

/**
 * 4. Record Asset Depreciation & Auto-Post to General Ledger
 */
export async function recordAssetDepreciationAction(input: {
  assetId: string;
  depreciationAmount: number;
  notes?: string;
}): Promise<ActionResult<{ asset_id: string; depreciation_amount: number; new_current_value: number; journal_entry_number: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.ASSETS_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient assets management permissions";
    return { success: false, error: msg };
  }

  if (input.depreciationAmount <= 0) {
    return { success: false, error: "Depreciation amount must be greater than zero." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_asset_depreciation_to_gl_atomic", {
      p_org_id: session.organizationId,
      p_asset_id: input.assetId,
      p_depreciation_amount: input.depreciationAmount,
      p_notes: input.notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as {
      asset_id: string;
      depreciation_amount: number;
      new_current_value: number;
      journal_entry: { entry_number: string };
    };

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "UPDATE",
      module: "ASSETS",
      entityType: "hospital_assets",
      entityId: input.assetId,
      newValues: { depreciation_amount: input.depreciationAmount, new_current_value: payload.new_current_value },
    });

    return {
      success: true,
      data: {
        asset_id: payload.asset_id,
        depreciation_amount: payload.depreciation_amount,
        new_current_value: payload.new_current_value,
        journal_entry_number: payload.journal_entry?.entry_number || "",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record asset depreciation";
    return { success: false, error: msg };
  }
}
