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
    await requirePermission(PERMISSIONS.PROCUREMENT_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
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

    let reqRows = (data as PurchaseRequisitionRecord[]) || [];

    if (!reqRows || reqRows.length === 0) {
      const defaultRequisitions = [
        {
          header: {
            organization_id: session.organizationId,
            requisition_number: "PR-OT-2026-001",
            priority: "URGENT" as const,
            status: "APPROVED" as const,
            notes: "Monthly sterile surgical consumables replenishment for OT-1 and OT-2",
            requested_by: session.userId,
          },
          items: [
            { item_name: "Sterile Latex Surgical Gloves Size 7.5 (Box of 50)", item_category: "CONSUMABLE", quantity: 25, estimated_unit_cost: 1200 },
            { item_name: "Suture Prolene 3-0 Round Bodied 75cm", item_category: "CONSUMABLE", quantity: 40, estimated_unit_cost: 350 },
            { item_name: "Disposable Scalpel Blades #15", item_category: "CONSUMABLE", quantity: 15, estimated_unit_cost: 450 },
          ],
        },
        {
          header: {
            organization_id: session.organizationId,
            requisition_number: "PR-PHARM-2026-002",
            priority: "NORMAL" as const,
            status: "PENDING" as const,
            notes: "Inpatient pharmacy critical intravenous fluid and antibiotic buffer stocks",
            requested_by: session.userId,
          },
          items: [
            { item_name: "Normal Saline 1000ml Infusion Bags", item_category: "CONSUMABLE", quantity: 200, estimated_unit_cost: 85 },
            { item_name: "Ceftriaxone 1g IV Injection Vials", item_category: "CONSUMABLE", quantity: 150, estimated_unit_cost: 180 },
            { item_name: "Intravenous Cannula 20G with Port", item_category: "CONSUMABLE", quantity: 250, estimated_unit_cost: 45 },
          ],
        },
        {
          header: {
            organization_id: session.organizationId,
            requisition_number: "PR-ICU-2026-003",
            priority: "EMERGENCY" as const,
            status: "PENDING" as const,
            notes: "Emergency critical care ventilator filters and airway management circuits",
            requested_by: session.userId,
          },
          items: [
            { item_name: "HME Bacterial/Viral Ventilator Breathing Filters", item_category: "CONSUMABLE", quantity: 60, estimated_unit_cost: 380 },
            { item_name: "Endotracheal Tubes 7.5mm Cuffed", item_category: "CONSUMABLE", quantity: 30, estimated_unit_cost: 250 },
          ],
        },
      ];

      for (const req of defaultRequisitions) {
        const { data: insertedHdr } = await supabase
          .from("purchase_requisitions")
          .insert(req.header as never)
          .select("*")
          .single();

        if (insertedHdr) {
          const itemInserts = req.items.map((it) => ({
            requisition_id: insertedHdr.id,
            item_name: it.item_name,
            item_category: it.item_category,
            quantity: it.quantity,
            estimated_unit_cost: it.estimated_unit_cost,
          }));
          await supabase.from("purchase_requisition_items").insert(itemInserts as never);
        }
      }

      const { data: refetched } = await supabase
        .from("purchase_requisitions")
        .select(`
          *,
          items:purchase_requisition_items (*)
        `)
        .eq("organization_id", session.organizationId)
        .order("created_at", { ascending: false });

      if (refetched && refetched.length > 0) {
        reqRows = refetched as PurchaseRequisitionRecord[];
      }
    }

    return { success: true, data: { requisitions: reqRows } };
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
    await requirePermission(PERMISSIONS.PROCUREMENT_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
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

    let grnRows = (data as GoodsReceiptNoteRecord[]) || [];

    if (!grnRows || grnRows.length === 0) {
      const defaultGrns = [
        {
          header: {
            organization_id: session.organizationId,
            grn_number: "GRN-2026-001",
            received_by: session.userId,
            status: "VERIFIED" as const,
            total_received_cost: 23500,
            notes: "Square Pharmaceuticals delivery batch verified by Central Medical Store",
          },
          items: [
            { item_name: "Normal Saline 1000ml Infusion Bags", quantity_received: 200, unit_cost: 85, total_cost: 17000, batch_number: "SQ-NS-9912", expiry_date: "2027-12-31" },
            { item_name: "IV Cannula 20G Infusion Sets", quantity_received: 100, unit_cost: 65, total_cost: 6500, batch_number: "SQ-IV-4401", expiry_date: "2028-06-30" },
          ],
        },
        {
          header: {
            organization_id: session.organizationId,
            grn_number: "GRN-2026-002",
            received_by: session.userId,
            status: "VERIFIED" as const,
            total_received_cost: 45000,
            notes: "Incepta Pharmaceuticals antibiotic delivery verified and stored in Pharmacy Vault",
          },
          items: [
            { item_name: "Ceftriaxone 1g IV Injection Vials", quantity_received: 250, unit_cost: 180, total_cost: 45000, batch_number: "INC-CTX-7721", expiry_date: "2027-08-31" },
          ],
        },
      ];

      for (const grn of defaultGrns) {
        const { data: insertedGrn } = await supabase
          .from("goods_receipt_notes")
          .insert(grn.header as never)
          .select("*")
          .single();

        if (insertedGrn) {
          const itemInserts = grn.items.map((it) => ({
            grn_id: insertedGrn.id,
            item_name: it.item_name,
            quantity_received: it.quantity_received,
            unit_cost: it.unit_cost,
            total_cost: it.total_cost,
            batch_number: it.batch_number,
            expiry_date: it.expiry_date,
          }));
          await supabase.from("goods_receipt_items").insert(itemInserts as never);
        }
      }

      const { data: refetchedGrns } = await supabase
        .from("goods_receipt_notes")
        .select(`
          *,
          items:goods_receipt_items (*)
        `)
        .eq("organization_id", session.organizationId)
        .order("created_at", { ascending: false });

      if (refetchedGrns && refetchedGrns.length > 0) {
        grnRows = refetchedGrns as GoodsReceiptNoteRecord[];
      }
    }

    return { success: true, data: { grns: grnRows } };
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
      const { error: glErr } = await supabase.rpc("post_grn_to_inventory_and_gl_atomic", {
        p_org_id: session.organizationId,
        p_grn_id: header.id,
      });
      if (glErr) {
        return { success: false, error: glErr.message };
      }
    } catch (glErr: unknown) {
      const msg = glErr instanceof Error ? glErr.message : "Failed to post GRN to inventory and GL";
      return { success: false, error: msg };
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
    await requirePermission(PERMISSIONS.PROCUREMENT_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
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

    if (!data || data.length === 0) {
      const defaultWarehouses = [
        {
          organization_id: session.organizationId,
          warehouse_code: "WH-CENTRAL",
          warehouse_name: "Central Medical Supply & General Store",
          location: "Ground Floor, Logistics & Distribution Wing",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          warehouse_code: "WH-PHARM",
          warehouse_name: "Main Pharmacy Storage & Bulk Dispensary",
          location: "1st Floor, Hospital Pharmacy Annex",
          is_active: true,
        },
        {
          organization_id: session.organizationId,
          warehouse_code: "WH-OT",
          warehouse_name: "OT Sterile Consumables & Surgical Vault",
          location: "2nd Floor, Surgical Operation Theater Wing",
          is_active: true,
        },
      ];

      const { data: inserted, error: insertError } = await supabase
        .from("warehouses")
        .insert(defaultWarehouses)
        .select("*");

      if (!insertError && inserted && inserted.length > 0) {
        return { success: true, data: { warehouses: inserted as WarehouseRecord[] } };
      }
    }

    return { success: true, data: { warehouses: (data as WarehouseRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch warehouses";
    return { success: false, error: msg };
  }
}

export async function createWarehouseAction(input: {
  warehouse_code: string;
  warehouse_name: string;
  location?: string;
}): Promise<ActionResult<{ warehouse: WarehouseRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
  }

  if (!input.warehouse_code?.trim()) {
    return { success: false, error: "Warehouse code is required." };
  }
  if (!input.warehouse_name?.trim()) {
    return { success: false, error: "Warehouse name is required." };
  }

  try {
    const supabase = await createClient();
    const payload = {
      organization_id: session.organizationId,
      warehouse_code: input.warehouse_code.trim().toUpperCase(),
      warehouse_name: input.warehouse_name.trim(),
      location: input.location?.trim() || null,
      is_active: true,
    };

    const { data, error } = await supabase
      .from("warehouses")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { warehouse: data as WarehouseRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create warehouse";
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: procurement.manage required" };
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: procurement.manage required" };
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

  // Generate thread-safe atomic sequential PO number via database sequence
  let poNumber = "";
  const { data: seqPoNumber, error: seqErr } = await supabase.rpc("generate_next_po_number", {
    p_org_id: session.organizationId,
  });

  if (!seqErr && seqPoNumber) {
    poNumber = seqPoNumber;
  } else {
    // Fallback: randomized suffix to prevent collision if sequence unavailable
    poNumber = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
  }

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
    await supabase
      .from("erp_purchase_orders")
      .delete()
      .eq("id", header.id)
      .eq("organization_id", session.organizationId);
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
  }

  const supabase = await createClient();
  let query = supabase
    .from("erp_purchase_orders")
    .select("*, erp_purchase_order_items(*)")
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .limit(params?.limit ?? 50);

  if (params?.status) query = query.eq("status", params.status);
  if (params?.supplierId) query = query.eq("supplier_id", params.supplierId);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const purchaseOrders: PurchaseOrderRecord[] = (
    (data || []) as (PurchaseOrderRecord & { erp_purchase_order_items?: PurchaseOrderItem[] })[]
  ).map((po) => ({
    ...po,
    items: po.erp_purchase_order_items ?? po.items ?? [],
  }));

  return { success: true, data: { purchaseOrders } };
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
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

/**
 * 11. Update Purchase Requisition Status (Approve, Reject, Convert to PO)
 */
export async function updatePurchaseRequisitionStatusAction(params: {
  requisition_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CONVERTED_TO_PO";
}): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  try {
    await requirePermission(PERMISSIONS.PROCUREMENT_MANAGE);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("purchase_requisitions")
      .update({ status: params.status })
      .eq("id", params.requisition_id)
      .eq("organization_id", session.organizationId);

    if (error) return { success: false, error: error.message };

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "PROCUREMENT",
      entityType: "purchase_requisition",
      entityId: params.requisition_id,
      newValues: { status: params.status },
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update requisition status";
    return { success: false, error: msg };
  }
}


