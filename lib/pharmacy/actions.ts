import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  MedicineRecord,
  MedicineBatchRecord,
  StockTransactionRecord,
  PharmacySaleRecord,
} from "@/types/pharmacy";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Fetch Pharmacy Medicine Catalog with Batches and Live Stock
 */
export async function getPharmacyInventoryAction(): Promise<
  ActionResult<{ medicines: MedicineRecord[]; lowStockCount: number }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();

    // 1. Fetch medicines with generics and batches
    const { data: meds, error: medsErr } = await supabase
      .from("medicines")
      .select(`
        *,
        medicine_generics (id, generic_name),
        medicine_batches (*)
      `)
      .eq("organization_id", session.organizationId)
      .order("brand_name", { ascending: true });

    if (medsErr) {
      return { success: false, error: medsErr.message };
    }

    interface MedRow {
      id: string;
      organization_id: string;
      brand_name: string;
      dosage_form: string;
      strength: string;
      manufacturer: string;
      unit_type: string;
      min_stock_alert: number;
      is_active: boolean;
      created_at?: string;
      medicine_generics?: { id: string; generic_name: string } | null;
      medicine_batches?: MedicineBatchRecord[];
    }

    let lowStockCount = 0;

    const list: MedicineRecord[] = ((meds || []) as unknown as MedRow[]).map((m) => {
      const batches = m.medicine_batches || [];
      const totalStock = batches.reduce((sum, b) => sum + (b.current_stock || 0), 0);
      if (totalStock <= m.min_stock_alert) {
        lowStockCount++;
      }

      return {
        id: m.id,
        organization_id: m.organization_id,
        brand_name: m.brand_name,
        dosage_form: m.dosage_form,
        strength: m.strength,
        manufacturer: m.manufacturer,
        unit_type: m.unit_type,
        min_stock_alert: m.min_stock_alert,
        is_active: m.is_active,
        generic_name: m.medicine_generics?.generic_name,
        created_at: m.created_at,
        total_stock: totalStock,
        batches,
      };
    });

    return { success: true, data: { medicines: list, lowStockCount } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load pharmacy inventory";
    return { success: false, error: msg };
  }
}

/**
 * 2. Add New Medicine Brand to Catalog
 */
export async function createMedicineAction(params: {
  brandName: string;
  genericName?: string;
  dosageForm: string;
  strength: string;
  manufacturer: string;
  unitType?: string;
  minStockAlert?: number;
}): Promise<ActionResult<{ medicine: MedicineRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("pharmacy.manage");
  } catch {
    return { success: false, error: "403 Forbidden: pharmacy.manage required" };
  }

  try {
    const supabase = await createClient();

    let genericId: string | null = null;
    if (params.genericName?.trim()) {
      const { data: gen } = await supabase
        .from("medicine_generics")
        .select("id")
        .eq("generic_name", params.genericName.trim())
        .maybeSingle();

      if (gen) {
        genericId = gen.id;
      } else {
        const { data: newGen } = await supabase
          .from("medicine_generics")
          .insert({ generic_name: params.genericName.trim() })
          .select()
          .single();
        if (newGen) genericId = newGen.id;
      }
    }

    const { data: med, error } = await supabase
      .from("medicines")
      .insert({
        organization_id: session.organizationId,
        generic_id: genericId,
        brand_name: params.brandName,
        dosage_form: params.dosageForm,
        strength: params.strength,
        manufacturer: params.manufacturer,
        unit_type: params.unitType || "PIECE",
        min_stock_alert: params.minStockAlert || 50,
      })
      .select()
      .single();

    if (error || !med) {
      return { success: false, error: error?.message || "Failed to create medicine" };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "PHARMACY",
      entityType: "medicine",
      entityId: med.id,
      newValues: {
        brandName: params.brandName,
        dosageForm: params.dosageForm,
        strength: params.strength,
      },
    });

    const newRecord: MedicineRecord = {
      ...med,
      generic_name: params.genericName,
      total_stock: 0,
      batches: [],
    };

    return { success: true, data: { medicine: newRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create medicine";
    return { success: false, error: msg };
  }
}

/**
 * 3. Receive / Register New Medicine Batch with Opening Stock
 */
export async function createMedicineBatchAction(params: {
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  purchaseRate: number;
  mrp: number;
  quantity: number;
}): Promise<ActionResult<{ batch: MedicineBatchRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("pharmacy.manage");
  } catch {
    return { success: false, error: "403 Forbidden: pharmacy.manage required" };
  }

  if (params.quantity <= 0) {
    return { success: false, error: "Quantity must be greater than zero." };
  }

  try {
    const supabase = await createClient();

    // 1. Insert Batch
    const { data: batch, error: batchErr } = await supabase
      .from("medicine_batches")
      .insert({
        organization_id: session.organizationId,
        medicine_id: params.medicineId,
        batch_number: params.batchNumber,
        expiry_date: params.expiryDate,
        purchase_rate: params.purchaseRate,
        mrp: params.mrp,
        current_stock: params.quantity,
      })
      .select()
      .single();

    if (batchErr || !batch) {
      return { success: false, error: batchErr?.message || "Failed to create batch" };
    }

    // 2. Insert Stock Transaction (PURCHASE)
    await supabase.from("stock_transactions").insert({
      organization_id: session.organizationId,
      batch_id: batch.id,
      transaction_type: "PURCHASE",
      quantity_in: params.quantity,
      quantity_out: 0,
      running_balance: params.quantity,
      notes: `Batch receiving ${params.batchNumber}`,
      created_by: session.userId,
    });

    // 3. Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "PHARMACY",
      entityType: "medicine_batch",
      entityId: batch.id,
      newValues: {
        batchNumber: params.batchNumber,
        quantity: params.quantity,
        mrp: params.mrp,
      },
    });

    return { success: true, data: { batch } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to receive batch";
    return { success: false, error: msg };
  }
}

/**
 * 4. Dispense Medicine / POS Pharmacy Sale with FIFO Stock Deduction
 */
export async function dispensePharmacySaleAction(params: {
  batchId: string;
  quantity: number;
  patientId?: string;
  prescriptionId?: string;
}): Promise<ActionResult<{ sale: PharmacySaleRecord; remainingStock: number }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("pharmacy.dispense");
  } catch {
    return { success: false, error: "403 Forbidden: pharmacy.dispense required" };
  }

  if (params.quantity <= 0) {
    return { success: false, error: "Dispense quantity must be greater than zero." };
  }

  try {
    const supabase = await createClient();

    // 1. Check Batch Stock
    const { data: batch } = await supabase
      .from("medicine_batches")
      .select("id, current_stock, mrp, batch_number")
      .eq("id", params.batchId)
      .single();

    if (!batch) {
      return { success: false, error: "Batch not found." };
    }

    if (batch.current_stock < params.quantity) {
      return {
        success: false,
        error: `Insufficient stock in batch ${batch.batch_number}. Available: ${batch.current_stock}.`,
      };
    }

    const newStock = batch.current_stock - params.quantity;
    const totalAmount = Number((batch.mrp * params.quantity).toFixed(2));
    const saleNumber = `PH-SL-${Date.now().toString().slice(-6)}`;

    // 2. Deduct Batch Stock
    await supabase
      .from("medicine_batches")
      .update({ current_stock: newStock })
      .eq("id", batch.id);

    // 3. Record Pharmacy Sale
    const { data: sale, error: saleErr } = await supabase
      .from("pharmacy_sales")
      .insert({
        organization_id: session.organizationId,
        sale_number: saleNumber,
        patient_id: params.patientId || null,
        prescription_id: params.prescriptionId || null,
        total_amount: totalAmount,
        sold_by: session.userId,
      })
      .select()
      .single();

    if (saleErr || !sale) {
      return { success: false, error: saleErr?.message || "Failed to record pharmacy sale" };
    }

    // 4. Record Double-Entry Stock Ledger
    await supabase.from("stock_transactions").insert({
      organization_id: session.organizationId,
      batch_id: batch.id,
      transaction_type: "SALE",
      quantity_in: 0,
      quantity_out: params.quantity,
      running_balance: newStock,
      reference_id: sale.id,
      notes: `Sale ${saleNumber} dispensed`,
      created_by: session.userId,
    });

    // 5. Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "PHARMACY",
      entityType: "pharmacy_sale",
      entityId: sale.id,
      newValues: {
        saleNumber,
        batchId: batch.id,
        quantity: params.quantity,
        totalAmount,
      },
    });

    return {
      success: true,
      data: {
        sale,
        remainingStock: newStock,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Pharmacy dispensation failed";
    return { success: false, error: msg };
  }
}

/**
 * 5. Fetch Stock Transactions Ledger
 */
export async function getStockTransactionsAction(
  limit: number = 30
): Promise<ActionResult<{ transactions: StockTransactionRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("stock_transactions")
      .select(`
        *,
        medicine_batches (
          batch_number,
          expiry_date,
          mrp,
          medicines (brand_name, dosage_form, strength)
        )
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    interface TxRow {
      id: string;
      organization_id: string;
      batch_id: string;
      transaction_type: "PURCHASE" | "SALE" | "SALE_RETURN" | "SUPPLIER_RETURN" | "DAMAGE" | "EXPIRED" | "ADJUSTMENT";
      quantity_in: number;
      quantity_out: number;
      running_balance: number;
      reference_id?: string | null;
      notes?: string | null;
      created_by?: string | null;
      created_at: string;
      medicine_batches?: {
        batch_number: string;
        expiry_date: string;
        mrp: number;
        medicines?: {
          brand_name: string;
          dosage_form: string;
          strength: string;
        } | null;
      } | null;
    }

    const transactions: StockTransactionRecord[] = ((data || []) as unknown as TxRow[]).map((t) => ({
      ...t,
      batch: t.medicine_batches
        ? {
            batch_number: t.medicine_batches.batch_number,
            expiry_date: t.medicine_batches.expiry_date,
            mrp: t.medicine_batches.mrp,
            medicine: t.medicine_batches.medicines || undefined,
          }
        : undefined,
    }));

    return { success: true, data: { transactions } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load stock ledger";
    return { success: false, error: msg };
  }
}
