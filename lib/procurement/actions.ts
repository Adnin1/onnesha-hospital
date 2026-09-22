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

    // ERP General Ledger Integration: Automatically post GRN to Inventory and Supplier Payable GL
    try {
      await supabase.rpc("post_grn_to_inventory_and_gl_atomic", {
        p_org_id: session.organizationId,
        p_grn_id: header.id,
      });
    } catch (glErr) {
      console.warn("ERP GRN GL auto-posting notice:", glErr);
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// Supplier Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplierRecord {
  id: string;
  organization_id: string;
  supplier_code: string;
  company_name: string;
  contact_person?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  trade_license?: string | null;
  tin_vat?: string | null;
  payment_terms_days: number;
  is_active: boolean;
  created_at: string;
}

export interface PurchaseOrderItem {
  id?: string;
  po_id?: string;
  item_name: string;
  item_category: string;
  quantity_ordered: number;
  unit_price: number;
  total_price: number;
}

export interface PurchaseOrderRecord {
  id: string;
  organization_id: string;
  po_number: string;
  supplier_id: string;
  requisition_id?: string | null;
  status: "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "FULLY_RECEIVED" | "CANCELLED";
  order_date: string;
  expected_delivery_date?: string | null;
  total_amount: number;
  notes?: string | null;
  created_at: string;
  items?: PurchaseOrderItem[];
}

export interface SupplierInvoiceRecord {
  id: string;
  organization_id: string;
  supplier_invoice_number: string;
  supplier_id: string;
  purchase_order_id?: string | null;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: "PENDING" | "POSTED" | "PAID" | "DISPUTED" | "CANCELLED";
  created_at: string;
}

/**
 * 6. Fetch Suppliers Register
 */
export async function getSuppliersAction(params?: {
  isActive?: boolean;
}): Promise<ActionResult<{ suppliers: SupplierRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_VIEW);
  } catch {
    return { success: false, error: "403 Forbidden" };
  }

  const supabase = await createClient();
  let query = supabase
    .from("suppliers")
    .select("*")
    .eq("organization_id", session.organizationId)
    .order("supplier_code", { ascending: true });

  if (params?.isActive !== undefined) {
    query = query.eq("is_active", params.isActive);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  return { success: true, data: { suppliers: (data as SupplierRecord[]) || [] } };
}

/**
 * 7. Register New Supplier
 */
export async function createSupplierAction(input: {
  companyName: string;
  phone: string;
  email?: string;
  contactPerson?: string;
  address?: string;
  tradeLicense?: string;
  tinVat?: string;
  paymentTermsDays?: number;
}): Promise<ActionResult<{ supplier: SupplierRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
  } catch {
    return { success: false, error: "403 Forbidden: procurement.manage required" };
  }

  if (!input.companyName?.trim() || !input.phone?.trim()) {
    return { success: false, error: "companyName and phone are required" };
  }

  const supabase = await createClient();

  // Generate sequential supplier code
  const { count } = await supabase
    .from("suppliers")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", session.organizationId);

  const supplierCode = `SUP-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: session.organizationId,
      supplier_code: supplierCode,
      company_name: input.companyName.trim(),
      contact_person: input.contactPerson ?? null,
      phone: input.phone.trim(),
      email: input.email ?? null,
      address: input.address ?? null,
      trade_license: input.tradeLicense ?? null,
      tin_vat: input.tinVat ?? null,
      payment_terms_days: input.paymentTermsDays ?? 30,
      is_active: true,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  await recordAuditLog({
    organizationId: session.organizationId,
    userId: session.userId || undefined,
    action: "CREATE",
    module: "PROCUREMENT",
    entityType: "supplier",
    entityId: data.id,
    newValues: { supplier_code: supplierCode, company_name: input.companyName },
  });

  return { success: true, data: { supplier: data as SupplierRecord } };
}

/**
 * 8. Create Purchase Order with line items
 */
export async function createPurchaseOrderAction(input: {
  supplierId: string;
  requisitionId?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  items: Array<{
    itemName: string;
    itemCategory: string;
    quantityOrdered: number;
    unitPrice: number;
  }>;
}): Promise<ActionResult<{ purchaseOrder: PurchaseOrderRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
  } catch {
    return { success: false, error: "403 Forbidden: procurement.manage required" };
  }

  if (!input.supplierId) return { success: false, error: "supplierId is required" };
  if (!input.items?.length) return { success: false, error: "At least one item is required" };

  for (const item of input.items) {
    if (!item.itemName?.trim()) return { success: false, error: "Each item must have itemName" };
    if (item.quantityOrdered <= 0) return { success: false, error: "quantityOrdered must be > 0" };
    if (item.unitPrice < 0) return { success: false, error: "unitPrice must be >= 0" };
  }

  const supabase = await createClient();

  // Verify supplier belongs to this org
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", input.supplierId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!supplier) return { success: false, error: "Supplier not found in this organization" };

  // Generate sequential PO number
  const { count } = await supabase
    .from("erp_purchase_orders")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", session.organizationId);

  const poNumber = `PO-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(5, "0")}`;
  const totalAmount = input.items.reduce(
    (sum, item) => sum + item.quantityOrdered * item.unitPrice,
    0
  );

  const { data: header, error: poErr } = await supabase
    .from("erp_purchase_orders")
    .insert({
      organization_id: session.organizationId,
      po_number: poNumber,
      supplier_id: input.supplierId,
      requisition_id: input.requisitionId ?? null,
      status: "DRAFT",
      order_date: input.orderDate ?? new Date().toISOString().split("T")[0],
      expected_delivery_date: input.expectedDeliveryDate ?? null,
      total_amount: totalAmount,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (poErr) return { success: false, error: poErr.message };

  const lineInserts = input.items.map((item) => ({
    organization_id: session.organizationId as string,
    po_id: header.id,
    item_name: item.itemName.trim(),
    item_category: item.itemCategory,
    quantity_ordered: item.quantityOrdered,
    unit_price: item.unitPrice,
    total_price: Number((item.quantityOrdered * item.unitPrice).toFixed(2)),
    quantity_received: 0,
  }));

  const { error: lineErr } = await supabase.from("erp_purchase_order_items").insert(lineInserts);
  if (lineErr) {
    await supabase.from("erp_purchase_orders").delete().eq("id", header.id);
    return { success: false, error: `PO line insert failed: ${lineErr.message}` };
  }

  await recordAuditLog({
    organizationId: session.organizationId,
    userId: session.userId || undefined,
    action: "CREATE",
    module: "PROCUREMENT",
    entityType: "purchase_order",
    entityId: header.id,
    newValues: { po_number: poNumber, supplier_id: input.supplierId, total_amount: totalAmount },
  });

  return {
    success: true,
    data: { purchaseOrder: { ...header, items: lineInserts } as unknown as PurchaseOrderRecord },
  };
}

/**
 * 9. Fetch Purchase Orders
 */
export async function getPurchaseOrdersAction(params?: {
  status?: string;
  supplierId?: string;
  limit?: number;
}): Promise<ActionResult<{ purchaseOrders: PurchaseOrderRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_VIEW);
  } catch {
    return { success: false, error: "403 Forbidden" };
  }

  const supabase = await createClient();
  let query = supabase
    .from("erp_purchase_orders")
    .select("*, purchase_order_items(*)")
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .limit(params?.limit ?? 50);

  if (params?.status) query = query.eq("status", params.status);
  if (params?.supplierId) query = query.eq("supplier_id", params.supplierId);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  return { success: true, data: { purchaseOrders: (data as unknown as PurchaseOrderRecord[]) || [] } };
}

/**
 * 10. Fetch Supplier Invoices (AP Aging source)
 */
export async function getSupplierInvoicesAction(params?: {
  status?: string;
  supplierId?: string;
  limit?: number;
}): Promise<ActionResult<{ invoices: SupplierInvoiceRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_VIEW);
  } catch {
    return { success: false, error: "403 Forbidden" };
  }

  const supabase = await createClient();
  let query = supabase
    .from("supplier_invoices")
    .select("*")
    .eq("organization_id", session.organizationId)
    .order("invoice_date", { ascending: false })
    .limit(params?.limit ?? 100);

  if (params?.status) query = query.eq("status", params.status);
  if (params?.supplierId) query = query.eq("supplier_id", params.supplierId);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  return { success: true, data: { invoices: (data as SupplierInvoiceRecord[]) || [] } };
}


