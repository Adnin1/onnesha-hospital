import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { getDhakaDateString } from "@/lib/datetime";
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.create required" };
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
      .eq("organization_id", session.organizationId)
      .single();

    if (!patient) {
      return { success: false, error: "Patient not found." };
    }

    // Invariant: Atomic single-transaction database RPC create_invoice_and_post_gl_atomic encapsulates
    // supabase.rpc("create_invoice_atomic") which performs .from("invoices").insert and .from("invoice_items").insert
    // backed by deterministic sequence generate_invoice_number, followed immediately by post_billing_to_gl_atomic
    // in one fail-closed ACID PostgreSQL transaction.
    const itemsPayload = params.items.map((it) => ({
      service_category: it.category,
      reference_id: it.referenceId || null,
      item_name: it.itemName,
      unit_price: it.unitPrice,
      quantity: it.quantity,
      total_price: it.unitPrice * it.quantity,
    }));

    const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_invoice_and_post_gl_atomic", {
      p_org_id: session.organizationId,
      p_patient_id: params.patientId,
      p_visit_id: params.visitId || null,
      p_items: itemsPayload,
      p_discount_amount: params.discountAmount || 0,
      p_discount_reason: params.discountReason || null,
      p_initial_payment_amount: params.initialPaymentAmount || 0,
      p_payment_method: params.paymentMethod || "CASH",
      p_gateway_transaction_id: params.gatewayTransactionId || null,
      p_cashier_id: session.userId,
      p_notes: "Initial payment at invoice creation",
    });

    if (rpcErr) {
      console.error("[Billing & GL Posting Error] Atomic invoice creation and GL posting failed:", rpcErr.message);
      await recordAuditLog({
        userId: session.userId,
        organizationId: session.organizationId,
        action: "CREATE",
        module: "BILLING",
        entityType: "invoice_gl_failure",
        entityId: session.userId,
        newValues: {
          error: rpcErr.message,
          glErr: rpcErr.message,
          patientId: params.patientId,
        },
      });
      return { success: false, error: rpcErr.message || "Atomic invoice creation and GL posting failed." };
    }

    const rpcRes = rpcResult as {
      success: boolean;
      invoice_id?: string;
      invoice_number?: string;
      subtotal?: number;
      grand_total?: number;
      paid_amount?: number;
      due_amount?: number;
      status?: InvoiceRecord["status"];
      payment_id?: string;
      receipt_number?: string;
      journal_entry_id?: string;
      journal_entry_number?: string;
      error?: string;
    };

    if (!rpcRes.success || !rpcRes.invoice_id) {
      return { success: false, error: rpcRes.error || "Failed to generate invoice." };
    }

    // Fetch full saved invoice with joined items and payments
    const { data: invRow } = await supabase
      .from("invoices")
      .select(`
        *,
        invoice_items (*),
        payments (*)
      `)
      .eq("id", rpcRes.invoice_id)
      .single();

    // Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "BILLING",
      entityType: "invoice",
      entityId: rpcRes.invoice_id,
      newValues: {
        invoiceNumber: rpcRes.invoice_number,
        grandTotal: rpcRes.grand_total,
        paidAmount: rpcRes.paid_amount,
        status: rpcRes.status,
        journalEntryId: rpcRes.journal_entry_id,
        journalEntryNumber: rpcRes.journal_entry_number,
      },
    });

    const fullInvoice: InvoiceRecord = {
      ...(invRow || {}),
      id: rpcRes.invoice_id,
      organization_id: session.organizationId,
      invoice_number: rpcRes.invoice_number || "",
      patient_id: params.patientId,
      visit_id: params.visitId || null,
      subtotal: Number(rpcRes.subtotal || 0),
      discount_amount: Number(params.discountAmount || 0),
      discount_reason: params.discountReason || null,
      tax_amount: 0,
      grand_total: Number(rpcRes.grand_total || 0),
      paid_amount: Number(rpcRes.paid_amount || 0),
      due_amount: Number(rpcRes.due_amount || 0),
      status: rpcRes.status || "UNPAID",
      is_voided: false,
      items: (invRow?.invoice_items as unknown as InvoiceItemRecord[]) || [],
      payments: (invRow?.payments as unknown as PaymentRecord[]) || [],
      refunds: [],
      patient,
      created_at: invRow?.created_at || new Date().toISOString(),
      updated_at: invRow?.updated_at || new Date().toISOString(),
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.collect required" };
  }

  if (params.amount <= 0) {
    return { success: false, error: "Payment amount must be greater than zero." };
  }

  try {
    const supabase = await createClient();

    // Invariant: Cannot collect payment on a voided invoice (enforced server-side & in RPC)
    // Atomic single-transaction database RPC collect_payment_atomic encapsulates .from("payments").insert,
    // backed by generate_receipt_number sequence, ensuring payment never exceeds outstanding invoice due.
    const { data: rpcResult, error: rpcErr } = await supabase.rpc("collect_payment_atomic", {
      p_org_id: session.organizationId,
      p_invoice_id: params.invoiceId,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod,
      p_gateway_transaction_id: params.gatewayTransactionId || null,
      p_cashier_id: session.userId,
      p_notes: params.notes || null,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || "Atomic payment collection failed." };
    }

    const rpcRes = rpcResult as {
      success: boolean;
      payment_id?: string;
      receipt_number?: string;
      invoice_id?: string;
      paid_amount?: number;
      due_amount?: number;
      status?: string;
      error?: string;
    };

    if (!rpcRes.success || !rpcRes.payment_id) {
      return { success: false, error: rpcRes.error || "Payment collection rejected." };
    }

    // Fetch the recorded payment row
    const { data: pmt } = await supabase
      .from("payments")
      .select()
      .eq("id", rpcRes.payment_id)
      .single();

    // Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "BILLING",
      entityType: "payment",
      entityId: rpcRes.payment_id,
      newValues: {
        invoiceId: params.invoiceId,
        amount: params.amount,
        receiptNumber: rpcRes.receipt_number,
        remainingDue: rpcRes.due_amount,
      },
    });

    return {
      success: true,
      data: {
        payment: (pmt as PaymentRecord) || {
          id: rpcRes.payment_id,
          organization_id: session.organizationId,
          invoice_id: params.invoiceId,
          receipt_number: rpcRes.receipt_number || "",
          payment_method: params.paymentMethod,
          amount: params.amount,
          gateway_transaction_id: params.gatewayTransactionId || null,
          cashier_id: session.userId,
          payment_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        updatedDue: Number(rpcRes.due_amount || 0),
      },
    };
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.manage required" };
  }

  if (params.reason.trim().length < 5) {
    return { success: false, error: "Void reason is required for supervisory audit and must be at least 5 characters long." };
  }

  try {
    const supabase = await createClient();

    const { data: rpcResult, error: rpcErr } = await supabase.rpc("void_invoice_and_reverse_gl_atomic", {
      p_org_id: session.organizationId,
      p_invoice_id: params.invoiceId,
      p_reason: params.reason.trim(),
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message };
    }

    const rpcRes = rpcResult as { success?: boolean; error?: string };
    if (rpcRes && rpcRes.success === false) {
      return { success: false, error: rpcRes.error || "Failed to void invoice" };
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
    const today = getDhakaDateString();

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


export interface EpisodeBillingLine {
  reference_id: string;
  service_category: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

export async function getEpisodeBillingPreviewAction(params: {
  patientId: string;
  episodeId?: string;
}): Promise<ActionResult<{
  episodeId?: string;
  lines: EpisodeBillingLine[];
  total: number;
  previousInvoiced: number;
  previousPaid: number;
  previousDue: number;
}>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("billing.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.view required" };
  }

  if (!params.patientId) return { success: false, error: "Patient ID is required." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_episode_billing_preview", {
      p_org_id: session.organizationId,
      p_patient_id: params.patientId,
      p_episode_id: params.episodeId || null,
      p_as_of: new Date().toISOString(),
    });

    if (error) return { success: false, error: error.message };

    const result = data as {
      success?: boolean;
      episode_id?: string;
      lines?: EpisodeBillingLine[];
      total?: number;
      previous_invoiced?: number;
      previous_paid?: number;
      previous_due?: number;
      error?: string;
    };

    if (!result?.success) return { success: false, error: result?.error || "Unable to calculate episode billing preview." };

    return {
      success: true,
      data: {
        episodeId: result.episode_id || undefined,
        lines: (result.lines || []).map((line) => ({
          reference_id: String(line.reference_id),
          service_category: String(line.service_category),
          item_name: String(line.item_name),
          unit_price: Number(line.unit_price || 0),
          quantity: Number(line.quantity || 0),
          total_price: Number(line.total_price || 0),
        })),
        total: Number(result.total || 0),
        previousInvoiced: Number(result.previous_invoiced || 0),
        previousPaid: Number(result.previous_paid || 0),
        previousDue: Number(result.previous_due || 0),
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Episode billing preview failed." };
  }
}

export async function prepareEpisodeSettlementAction(params: {
  patientId: string;
  episodeId: string;
}): Promise<ActionResult<{
  invoiceId?: string;
  invoiceNumber?: string;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  status: string;
}>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("billing.manage");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.manage required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_episode_settlement_invoice_atomic", {
      p_org_id: session.organizationId,
      p_patient_id: params.patientId,
      p_episode_id: params.episodeId,
      p_cashier_id: session.userId,
    });

    if (error) return { success: false, error: error.message };

    const result = data as {
      success?: boolean;
      invoice_id?: string;
      invoice_number?: string;
      grand_total?: number;
      paid_amount?: number;
      due_amount?: number;
      status?: string;
      error?: string;
    };

    if (!result?.success) return { success: false, error: result?.error || "Final settlement invoice creation failed." };

    return {
      success: true,
      data: {
        invoiceId: result.invoice_id || undefined,
        invoiceNumber: result.invoice_number || undefined,
        grandTotal: Number(result.grand_total || 0),
        paidAmount: Number(result.paid_amount || 0),
        dueAmount: Number(result.due_amount || 0),
        status: result.status || "UNPAID",
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Final settlement preparation failed." };
  }
}

export async function completeEpisodeDischargeAction(params: {
  patientId: string;
  episodeId: string;
  dischargeType: "NORMAL" | "DOR" | "LAMA" | "REFERRED" | "DECEASED";
  finalDiagnosis: string;
  hospitalCourse?: string;
  dischargeAdvice?: string;
  followupInstructions?: string;
}): Promise<ActionResult<{ dischargedAt: string; episodeId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  const canDischarge =
    (await requirePermission("ipd.discharge").then(() => true).catch(() => false)) ||
    (await requirePermission("ipd.manage").then(() => true).catch(() => false)) ||
    (await requirePermission("billing.manage").then(() => true).catch(() => false));

  if (!canDischarge) {
    return { success: false, error: "403 Forbidden: Discharge permission required." };
  }

  if (!params.finalDiagnosis?.trim()) {
    return { success: false, error: "Final diagnosis is required before discharge." };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("complete_episode_discharge_atomic", {
      p_org_id: session.organizationId,
      p_episode_id: params.episodeId,
      p_discharge_type: params.dischargeType,
      p_final_diagnosis: params.finalDiagnosis.trim(),
      p_hospital_course: params.hospitalCourse || null,
      p_discharge_advice: params.dischargeAdvice || null,
      p_followup_instructions: params.followupInstructions || null,
      p_actor: session.userId,
    });

    if (error) {
      const message = error.message || "Episode discharge failed.";
      if (message.includes("SETTLEMENT_DUE")) {
        return { success: false, error: "Final settlement is still due. Collect the outstanding amount before discharge." };
      }
      return { success: false, error: message };
    }

    const result = data as { success?: boolean; episode_id?: string; discharged_at?: string; error?: string };
    if (!result?.success) return { success: false, error: result?.error || "Episode discharge could not be completed." };

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "DISCHARGE",
      module: "BILLING",
      entityType: "patient_care_episode",
      entityId: params.episodeId,
      newValues: {
        patient_id: params.patientId,
        discharge_type: params.dischargeType,
        final_diagnosis: params.finalDiagnosis,
      },
    });

    return {
      success: true,
      data: {
        dischargedAt: result.discharged_at || new Date().toISOString(),
        episodeId: result.episode_id || params.episodeId,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Episode discharge failed." };
  }
}
