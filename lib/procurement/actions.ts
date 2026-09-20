import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { PERMISSIONS } from "@/lib/permissions";

export interface PurchaseRequisitionItem {
  id?: string;
  requisition_id?: string;
  item_name: string;
  item_category: string;
  quantity: number;
  estimated_unit_cost: number;
}

export interface PurchaseRequisitionRecord {
  id: string;
  organization_id: string;
  requisition_number: string;
  department_id?: string | null;
  requested_by?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CONVERTED_TO_PO";
  priority: "LOW" | "NORMAL" | "URGENT" | "EMERGENCY";
  notes?: string | null;
  created_at: string;
  items?: PurchaseRequisitionItem[];
}

export interface GoodsReceiptItem {
  id?: string;
  grn_id?: string;
  item_name: string;
  quantity_received: number;
  unit_cost: number;
  total_cost: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export interface GoodsReceiptNoteRecord {
  id: string;
  organization_id: string;
  grn_number: string;
  purchase_order_id?: string | null;
  supplier_id?: string | null;
  received_by?: string | null;
  received_at: string;
  status: "DRAFT" | "VERIFIED" | "DISCREPANCY";
  total_received_cost: number;
  notes?: string | null;
  created_at: string;
  items?: GoodsReceiptItem[];
}

export interface WarehouseRecord {
  id: string;
  organization_id: string;
  warehouse_code: string;
  warehouse_name: string;
  location?: string | null;
  manager_id?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Fetch Purchase Requisitions with line items
 */
export async function getPurchaseRequisitionsAction(params?: {
  status?: string;
  limit?: number;
}): Promise<ActionResult<{ requisitions: PurchaseRequisitionRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("purchase_requisitions")
      .select(`
        *,
        items:purchase_requisition_items (*)
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.status && params.status !== "ALL") {
      query = query.eq("status", params.status);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { requisitions: (data as PurchaseRequisitionRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch purchase requisitions";
    return { success: false, error: msg };
  }
}

/**
 * 2. Create Purchase Requisition with line items
 */
export async function createPurchaseRequisitionAction(input: {
  requisition_number: string;
  department_id?: string;
  priority?: "LOW" | "NORMAL" | "URGENT" | "EMERGENCY";
  notes?: string;
  items: { item_name: string; item_category?: string; quantity: number; estimated_unit_cost: number }[];
}): Promise<ActionResult<{ requisition: PurchaseRequisitionRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient procurement permissions";
    return { success: false, error: msg };
  }

  if (!input.items || input.items.length === 0) {
    return { success: false, error: "Requisition must contain at least one item" };
  }

  try {
    const supabase = await createClient();

    // 1. Insert header
    const { data: header, error: headerErr } = await supabase
      .from("purchase_requisitions")
      .insert({
        organization_id: session.organizationId,
        requisition_number: input.requisition_number.trim(),
        department_id: input.department_id || null,
        requested_by: session.userId,
        priority: input.priority || "NORMAL",
        status: "PENDING",
        notes: input.notes?.trim() || null,
      })
      .select("*")
      .single();

    if (headerErr) {
      return { success: false, error: headerErr.message };
    }

    // 2. Insert items
    const itemRows = input.items.map((item) => ({
      requisition_id: header.id,
      item_name: item.item_name.trim(),
      item_category: item.item_category || "CONSUMABLE",
      quantity: Math.max(1, Math.floor(item.quantity)),
      estimated_unit_cost: Math.max(0, item.estimated_unit_cost),
    }));

    const { data: savedItems, error: itemErr } = await supabase
      .from("purchase_requisition_items")
      .insert(itemRows)
      .select("*");

    if (itemErr) {
      return { success: false, error: itemErr.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "PROCUREMENT",
      entityType: "purchase_requisitions",
      entityId: header.id,
      newValues: { requisition_number: header.requisition_number, items_count: itemRows.length },
    });

    const result: PurchaseRequisitionRecord = {
      ...header,
      items: savedItems as PurchaseRequisitionItem[],
    };

    return { success: true, data: { requisition: result } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create purchase requisition";
    return { success: false, error: msg };
  }
}

/**
 * 3. Fetch Goods Receipt Notes (GRN)
 */
export async function getGoodsReceiptNotesAction(params?: {
  limit?: number;
}): Promise<ActionResult<{ grns: GoodsReceiptNoteRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("goods_receipt_notes")
      .select(`
        *,
        items:goods_receipt_items (*)
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 50);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { grns: (data as GoodsReceiptNoteRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch Goods Receipt Notes";
    return { success: false, error: msg };
  }
}

/**
 * 4. Create Goods Receipt Note (GRN)
 */
export async function createGoodsReceiptNoteAction(input: {
  grn_number: string;
  purchase_order_id?: string;
  supplier_id?: string;
  notes?: string;
  items: {
    item_name: string;
    quantity_received: number;
    unit_cost: number;
    batch_number?: string;
    expiry_date?: string;
  }[];
}): Promise<ActionResult<{ grn: GoodsReceiptNoteRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient procurement permissions";
    return { success: false, error: msg };
  }

  if (!input.items || input.items.length === 0) {
    return { success: false, error: "GRN must contain at least one item" };
  }

  const totalCost = input.items.reduce((acc, item) => acc + item.quantity_received * item.unit_cost, 0);

  try {
    const supabase = await createClient();
    const { data: header, error: headerErr } = await supabase
      .from("goods_receipt_notes")
      .insert({
        organization_id: session.organizationId,
        grn_number: input.grn_number.trim(),
        purchase_order_id: input.purchase_order_id || null,
        supplier_id: input.supplier_id || null,
        received_by: session.userId,
        status: "VERIFIED",
        total_received_cost: totalCost,
        notes: input.notes?.trim() || null,
      })
      .select("*")
      .single();

    if (headerErr) {
      return { success: false, error: headerErr.message };
    }

    const itemRows = input.items.map((item) => ({
      grn_id: header.id,
      item_name: item.item_name.trim(),
      quantity_received: item.quantity_received,
      unit_cost: item.unit_cost,
      total_cost: item.quantity_received * item.unit_cost,
      batch_number: item.batch_number || null,
      expiry_date: item.expiry_date || null,
    }));

    const { data: savedItems, error: itemErr } = await supabase
      .from("goods_receipt_items")
      .insert(itemRows)
      .select("*");

    if (itemErr) {
      return { success: false, error: itemErr.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "PROCUREMENT",
      entityType: "goods_receipt_notes",
      entityId: header.id,
      newValues: { grn_number: header.grn_number, total_received_cost: totalCost },
    });

    const result: GoodsReceiptNoteRecord = {
      ...header,
      items: savedItems as GoodsReceiptItem[],
    };

    return { success: true, data: { grn: result } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create Goods Receipt Note";
    return { success: false, error: msg };
  }
}

/**
 * 5. Fetch Warehouses
 */
export async function getWarehousesAction(): Promise<ActionResult<{ warehouses: WarehouseRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("warehouses")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("warehouse_code", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { warehouses: (data as WarehouseRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch warehouses";
    return { success: false, error: msg };
  }
}
