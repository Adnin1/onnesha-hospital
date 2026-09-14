import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  InvoiceRecord,
  InvoiceItemRecord,
  PaymentRecord,
  RefundRecord,
  CashRegisterSummary,
} from "@/types/billing";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Fetch Invoices with Items, Payments, and Patient Details
 */
export async function getInvoicesAction(params?: {
  patientId?: string;
  status?: string;
  limit?: number;
}): Promise<ActionResult<{ invoices: InvoiceRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("invoices")
      .select(`
        *,
        invoice_items (*),
        payments (*),
        refunds (*),
        patients (id, patient_code, full_name, phone, gender)
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.patientId) {
      query = query.eq("patient_id", params.patientId);
    }
    if (params?.status && params.status !== "ALL") {
      query = query.eq("status", params.status);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    interface InvoiceDbRow {
      id: string;
      organization_id: string;
      invoice_number: string;
      patient_id: string;
      visit_id?: string | null;
      subtotal: number;
      discount_amount: number;
      discount_reason?: string | null;
      tax_amount: number;
      grand_total: number;
      paid_amount: number;
      due_amount: number;
      status: "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED" | "VOID";
      is_voided: boolean;
      void_reason?: string | null;
      voided_by?: string | null;
      created_by?: string | null;
      created_at: string;
      updated_at: string;
      invoice_items?: InvoiceItemRecord[];
      payments?: PaymentRecord[];
      refunds?: RefundRecord[];
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        phone: string;
        gender?: string;
      } | null;
    }

    const invoices: InvoiceRecord[] = ((data || []) as unknown as InvoiceDbRow[]).map((r) => ({
      ...r,
      items: r.invoice_items || [],
      payments: r.payments || [],
      refunds: r.refunds || [],
      patient: r.patients || undefined,
    }));

    return { success: true, data: { invoices } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load invoices";
    return { success: false, error: msg };
  }
}

/**
 * 2. Create Invoice with Line Items & Immediate Payment Option
 */
export async function createInvoiceAction(params: {
  patientId: string;
  visitId?: string;
  items: Array<{
    category: InvoiceItemRecord["service_category"];
    itemName: string;
    unitPrice: number;
    quantity: number;
    referenceId?: string;
  }>;
  discountAmount?: number;
  discountReason?: string;
  initialPaymentAmount?: number;
  paymentMethod?: PaymentRecord["payment_method"];
  gatewayTransactionId?: string;
}): Promise<ActionResult<{ invoice: InvoiceRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("billing.create");
  } catch {
    return { success: false, error: "403 Forbidden: billing.create required" };
  }

  if (!params.items || params.items.length === 0) {
    return { success: false, error: "Invoice must contain at least one line item." };
  }

  try {
    const supabase = await createClient();

    // Verify patient
    const { data: patient } = await supabase
      .from("patients")
      .select("id, patient_code, full_name, phone, gender")
      .eq("id", params.patientId)
      .single();

    if (!patient) {
      return { success: false, error: "Patient not found." };
    }

    const subtotal = params.items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const discount = params.discountAmount || 0;
    const grandTotal = Math.max(0, subtotal - discount);
    const paid = Math.min(grandTotal, Math.max(0, params.initialPaymentAmount || 0));
    const due = Math.max(0, grandTotal - paid);

    let status: InvoiceRecord["status"] = "UNPAID";
    if (due === 0 && grandTotal > 0) {
      status = "PAID";
    } else if (paid > 0) {
      status = "PARTIAL";
    }

    const { data: invNumData, error: invNumErr } = await supabase.rpc("generate_invoice_number", {
      p_org_id: session.organizationId,
    });
    if (invNumErr || !invNumData) {
      return { success: false, error: invNumErr?.message || "Failed to generate sequence-backed invoice number." };
    }
    const invoiceNumber = invNumData as string;

    // 1. Insert Invoice Header
    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({
        organization_id: session.organizationId,
        invoice_number: invoiceNumber,
        patient_id: params.patientId,
        visit_id: params.visitId || null,
        subtotal,
        discount_amount: discount,
        discount_reason: params.discountReason || null,
        tax_amount: 0,
        grand_total: grandTotal,
        paid_amount: paid,
        due_amount: due,
        status,
        created_by: session.userId,
      })
      .select()
      .single();

    if (invErr || !inv) {
      return { success: false, error: invErr?.message || "Failed to create invoice" };
    }

    // 2. Insert Invoice Items
    const itemsToInsert = params.items.map((it) => ({
      invoice_id: inv.id,
      service_category: it.category,
      reference_id: it.referenceId || null,
      item_name: it.itemName,
      unit_price: it.unitPrice,
      quantity: it.quantity,
      total_price: it.unitPrice * it.quantity,
    }));

    const { data: savedItems } = await supabase
      .from("invoice_items")
      .insert(itemsToInsert)
      .select();

    // 3. Insert Initial Payment if collected
    const savedPayments: PaymentRecord[] = [];
    if (paid > 0) {
      const { data: rctNumData, error: rctNumErr } = await supabase.rpc("generate_receipt_number", {
        p_org_id: session.organizationId,
      });
      if (rctNumErr || !rctNumData) {
        return { success: false, error: rctNumErr?.message || "Failed to generate receipt number." };
      }
      const receiptNumber = rctNumData as string;
      const { data: pmt } = await supabase
        .from("payments")
        .insert({
          organization_id: session.organizationId,
          invoice_id: inv.id,
          receipt_number: receiptNumber,
          payment_method: params.paymentMethod || "CASH",
          amount: paid,
          gateway_transaction_id: params.gatewayTransactionId || null,
          cashier_id: session.userId,
          notes: "Initial payment at invoice creation",
        })
        .select()
        .single();

      if (pmt) {
        savedPayments.push(pmt as PaymentRecord);
      }
    }

    // 4. Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "BILLING",
      entityType: "invoice",
      entityId: inv.id,
      newValues: {
        invoiceNumber,
        grandTotal,
        paidAmount: paid,
        status,
      },
    });

    const fullInvoice: InvoiceRecord = {
      ...inv,
      items: (savedItems as unknown as InvoiceItemRecord[]) || [],
      payments: savedPayments,
      patient,
    };

    return { success: true, data: { invoice: fullInvoice } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate invoice";
    return { success: false, error: msg };
  }
}

/**
 * 3. Collect Payment against an existing invoice
 */
export async function collectPaymentAction(params: {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentRecord["payment_method"];
  gatewayTransactionId?: string;
  notes?: string;
}): Promise<ActionResult<{ payment: PaymentRecord; updatedDue: number }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("billing.collect");
  } catch {
    return { success: false, error: "403 Forbidden: billing.collect required" };
  }

  if (params.amount <= 0) {
    return { success: false, error: "Payment amount must be greater than zero." };
  }

  try {
    const supabase = await createClient();

    const { data: inv } = await supabase
      .from("invoices")
      .select("id, grand_total, paid_amount, due_amount, is_voided")
      .eq("id", params.invoiceId)
      .single();

    if (!inv) {
      return { success: false, error: "Invoice not found." };
    }

    if (inv.is_voided) {
      return { success: false, error: "Cannot collect payment on a voided invoice." };
    }

    if (params.amount > Number(inv.due_amount)) {
      return {
        success: false,
        error: `Payment amount (${params.amount}) exceeds outstanding invoice due (${inv.due_amount}). Overpayment is not permitted.`,
      };
    }

    const newPaid = Number(inv.paid_amount) + params.amount;
    const newDue = Math.max(0, Number(inv.grand_total) - newPaid);
    const newStatus: InvoiceRecord["status"] = newDue === 0 ? "PAID" : "PARTIAL";

    // 1. Insert Payment
    const { data: rctNumData, error: rctNumErr } = await supabase.rpc("generate_receipt_number", {
      p_org_id: session.organizationId,
    });
    if (rctNumErr || !rctNumData) {
      return { success: false, error: rctNumErr?.message || "Failed to generate receipt number." };
    }
    const receiptNumber = rctNumData as string;

    const { data: pmt, error: pmtErr } = await supabase
      .from("payments").insert({
        organization_id: session.organizationId,
        invoice_id: params.invoiceId,
        receipt_number: receiptNumber,
        payment_method: params.paymentMethod,
        amount: params.amount,
        gateway_transaction_id: params.gatewayTransactionId || null,
        cashier_id: session.userId,
        notes: params.notes || null,
      })
      .select()
      .single();

    if (pmtErr || !pmt) {
      return { success: false, error: pmtErr?.message || "Failed to record payment" };
    }

    // 2. Update Invoice
    await supabase
      .from("invoices")
      .update({
        paid_amount: newPaid,
        due_amount: newDue,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.invoiceId);

    // 3. Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "BILLING",
      entityType: "payment",
      entityId: pmt.id,
      newValues: {
        invoiceId: params.invoiceId,
        amount: params.amount,
        receiptNumber,
        remainingDue: newDue,
      },
    });

    return { success: true, data: { payment: pmt as PaymentRecord, updatedDue: newDue } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Payment collection failed";
    return { success: false, error: msg };
  }
}

/**
 * 4. Void Invoice (Supervisor Level Action)
 */
export async function voidInvoiceAction(params: {
  invoiceId: string;
  reason: string;
}): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("billing.manage");
  } catch {
    return { success: false, error: "403 Forbidden: billing.manage required" };
  }

  if (!params.reason.trim()) {
    return { success: false, error: "Void reason is required for supervisory audit." };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("invoices")
      .update({
        is_voided: true,
        status: "VOID",
        void_reason: params.reason,
        voided_by: session.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.invoiceId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "VOID",
      module: "BILLING",
      entityType: "invoice",
      entityId: params.invoiceId,
      newValues: { status: "VOID", voidReason: params.reason },
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to void invoice";
    return { success: false, error: msg };
  }
}

/**
 * 5. Cash Register / Daily Financial Summary
 */
export async function getCashRegisterSummaryAction(): Promise<
  ActionResult<{ summary: CashRegisterSummary }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];

    // Today's Payments
    const { data: payments } = await supabase
      .from("payments")
      .select("amount, payment_method")
      .eq("organization_id", session.organizationId)
      .gte("payment_date", `${today}T00:00:00.000Z`);

    // Today's Invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select("grand_total, is_voided")
      .eq("organization_id", session.organizationId)
      .gte("created_at", `${today}T00:00:00.000Z`);

    let todayCash = 0;
    let todayMfs = 0;
    let todayTotal = 0;

    (payments || []).forEach((p) => {
      const amt = Number(p.amount) || 0;
      todayTotal += amt;
      if (p.payment_method === "CASH") {
        todayCash += amt;
      } else {
        todayMfs += amt;
      }
    });

    const activeInvoices = (invoices || []).filter((i) => !i.is_voided);
    const todayInvoiced = activeInvoices.reduce((sum, i) => sum + (Number(i.grand_total) || 0), 0);

    return {
      success: true,
      data: {
        summary: {
          todayTotalInvoiced: todayInvoiced,
          todayCashCollected: todayCash,
          todayMfsCollected: todayMfs,
          todayTotalCollected: todayTotal,
          activeInvoiceCount: activeInvoices.length,
        },
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load cash register";
    return { success: false, error: msg };
  }
}
