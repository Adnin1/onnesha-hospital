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
  referralAgentId?: string;
  referralCommissionRate?: number;
  noReferral?: boolean;
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

    const effectiveReferralAgentId = params.noReferral
      ? "00000000-0000-0000-0000-000000000000"
      : params.referralAgentId || null;

    const rpcPayload: Record<string, unknown> = {
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
    };

    if (effectiveReferralAgentId) {
      rpcPayload.p_referral_agent_id = effectiveReferralAgentId;
    }
    if (params.referralCommissionRate !== undefined && params.referralCommissionRate !== null) {
      rpcPayload.p_referral_commission_rate = params.referralCommissionRate;
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_invoice_and_post_gl_atomic", rpcPayload);

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
  charge_id?: string | null;
  is_custom_charge?: boolean;
  service_category: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
  started_at?: string;
}

export interface EpisodeEncounterHistory {
  id: string;
  visit_number?: string | null;
  visit_type: string;
  status: string;
  admitted_at: string;
  discharged_at?: string | null;
  doctor_name?: string | null;
  department_name?: string | null;
  chief_complaint?: string | null;
  opd_fee_snapshot?: number;
}

export interface EpisodeResourceHistory {
  id: string;
  resource_type: "BED" | "CABIN";
  resource_number?: string | null;
  ward_name?: string | null;
  assigned_at: string;
  vacated_at?: string | null;
  status: string;
  daily_charge: number;
}

export interface EpisodeCriticalCareHistory {
  id: string;
  unit_name?: string | null;
  unit_type?: string | null;
  bed_number: string;
  admission_time: string;
  discharge_time?: string | null;
  status: string;
  daily_charge: number;
  ventilator_required: boolean;
  doctor_name?: string | null;
  initial_diagnosis?: string | null;
}

export interface EpisodeInvoiceHistory {
  id: string;
  invoice_number: string;
  created_at: string;
  grand_total: number;
  paid_amount: number;
  due_amount: number;
  status: string;
  is_episode_settlement: boolean;
  items: Array<{
    service_category: string;
    item_name: string;
    unit_price: number;
    quantity: number;
    total_price: number;
    reference_id?: string | null;
  }>;
  payments: Array<{
    receipt_number: string;
    amount: number;
    payment_method: string;
    payment_date: string;
  }>;
}

export interface EpisodeWaivedItem {
  id: string;
  reference_id: string;
  service_category: string;
  item_name: string;
  waived_amount: number;
  waiver_reason: string;
  waived_by: string;
  waived_by_name: string;
  created_at: string;
  status: string;
}

export interface EpisodeBillingPreviewData {
  episodeId?: string;
  episodeNumber?: string;
  primaryVisitId?: string;
  lines: EpisodeBillingLine[];
  waived_items: EpisodeWaivedItem[];
  encounters: EpisodeEncounterHistory[];
  resources: EpisodeResourceHistory[];
  criticalCare: EpisodeCriticalCareHistory[];
  invoiceHistory: EpisodeInvoiceHistory[];
  total: number;
  admissionDiscountAmount: number;
  admissionDiscountReason?: string | null;
  referralAgentId?: string | null;
  previousInvoiced: number;
  previousPaid: number;
  previousDue: number;
  episodeInvoiced: number;
  episodePaid: number;
  episodeDue: number;
  lifetimeInvoiced: number;
  lifetimePaid: number;
  lifetimeDue: number;
}

export async function getEpisodeBillingPreviewAction(params: {
  patientId: string;
  episodeId?: string;
}): Promise<ActionResult<EpisodeBillingPreviewData>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) return { success: false, error: "401 Unauthorized" };

  try {
    await requirePermission("billing.view");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.view required" };
  }

  if (!params.patientId) return { success: false, error: "Patient ID is required." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_episode_billing_overview", {
      p_org_id: session.organizationId,
      p_patient_id: params.patientId,
      p_episode_id: params.episodeId || null,
      p_as_of: new Date().toISOString(),
    });

    if (error) return { success: false, error: error.message };

    const result = data as {
      success?: boolean;
      episode_id?: string | null;
      episode_number?: string | null;
      primary_visit_id?: string | null;
      lines?: EpisodeBillingLine[];
      waived_items?: Array<{
        id: string;
        reference_id: string;
        service_category: string;
        item_name: string;
        waived_amount: number;
        waiver_reason: string;
        waived_by: string;
        waived_by_name: string;
        created_at: string;
        status: string;
      }>;
      encounters?: EpisodeEncounterHistory[];
      resources?: EpisodeResourceHistory[];
      critical_care?: EpisodeCriticalCareHistory[];
      invoice_history?: EpisodeInvoiceHistory[];
      total?: number;
      admission_discount_amount?: number;
      admission_discount_reason?: string | null;
      referral_agent_id?: string | null;
      previous_invoiced?: number;
      previous_paid?: number;
      previous_due?: number;
      episode_invoiced?: number;
      episode_paid?: number;
      episode_due?: number;
      lifetime_invoiced?: number;
      lifetime_paid?: number;
      lifetime_due?: number;
      error?: string;
    };

    const rawEpisode = (result as { episode?: { id?: string; episode_number?: string } })?.episode;
    const resolvedEpisodeId = result?.episode_id || rawEpisode?.id;
    const resolvedEpisodeNumber = result?.episode_number || rawEpisode?.episode_number;

    const isSuccess = result?.success !== false && (result?.success === true || Array.isArray(result?.lines));
    if (!isSuccess) {
      return { success: false, error: result?.error || "Unable to calculate episode billing preview." };
    }

    return {
      success: true,
      data: {
        episodeId: resolvedEpisodeId || undefined,
        episodeNumber: resolvedEpisodeNumber || undefined,
        primaryVisitId: result.primary_visit_id || undefined,
        lines: (result.lines || []).map((line) => ({
          reference_id: String(line.reference_id),
          charge_id: line.charge_id || null,
          is_custom_charge: !!line.is_custom_charge,
          service_category: String(line.service_category),
          item_name: String(line.item_name),
          unit_price: Number(line.unit_price || 0),
          quantity: Number(line.quantity || 0),
          total_price: Number(line.total_price || 0),
          started_at: line.started_at || undefined,
        })),
        waived_items: (result.waived_items || []).map((item) => ({
          id: String(item.id),
          reference_id: String(item.reference_id),
          service_category: String(item.service_category),
          item_name: String(item.item_name),
          waived_amount: Number(item.waived_amount || 0),
          waiver_reason: String(item.waiver_reason || ""),
          waived_by: String(item.waived_by),
          waived_by_name: String(item.waived_by_name || "Staff Member"),
          created_at: String(item.created_at),
          status: String(item.status || "ACTIVE"),
        })),
        encounters: (result.encounters || []).map((item) => ({
          ...item,
          admitted_at: String(item.admitted_at),
          discharged_at: item.discharged_at || null,
          opd_fee_snapshot: Number(item.opd_fee_snapshot || 0),
        })),
        resources: (result.resources || []).map((item) => ({
          ...item,
          assigned_at: String(item.assigned_at),
          vacated_at: item.vacated_at || null,
          daily_charge: Number(item.daily_charge || 0),
        })),
        criticalCare: (result.critical_care || []).map((item) => ({
          ...item,
          admission_time: String(item.admission_time),
          discharge_time: item.discharge_time || null,
          daily_charge: Number(item.daily_charge || 0),
          ventilator_required: Boolean(item.ventilator_required),
        })),
        invoiceHistory: result.invoice_history || [],
        total: Number(result.total || 0),
        admissionDiscountAmount: Number(result.admission_discount_amount || 0),
        admissionDiscountReason: result.admission_discount_reason || null,
        referralAgentId: result.referral_agent_id || null,
        previousInvoiced: Number(result.previous_invoiced || 0),
        previousPaid: Number(result.previous_paid || 0),
        previousDue: Number(result.previous_due || 0),
        episodeInvoiced: Number(result.episode_invoiced || 0),
        episodePaid: Number(result.episode_paid || 0),
        episodeDue: Number(result.episode_due || 0),
        lifetimeInvoiced: Number(result.lifetime_invoiced ?? result.previous_invoiced ?? 0),
        lifetimePaid: Number(result.lifetime_paid ?? result.previous_paid ?? 0),
        lifetimeDue: Number(result.lifetime_due ?? result.previous_due ?? 0),
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Episode billing preview failed." };
  }
}

export async function addEpisodeServiceChargeAction(params: {
  patientId: string;
  episodeId: string;
  category: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}): Promise<ActionResult<{ chargeId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("billing.manage");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.manage required" };
  }

  if (!params.itemName?.trim()) {
    return { success: false, error: "Service or item name is required." };
  }

  if (params.quantity <= 0) {
    return { success: false, error: "Quantity must be greater than zero." };
  }

  if (params.unitPrice < 0) {
    return { success: false, error: "Unit price cannot be negative." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("add_episode_service_charge_atomic", {
      p_org_id: session.organizationId,
      p_episode_id: params.episodeId,
      p_patient_id: params.patientId,
      p_category: params.category,
      p_item_name: params.itemName.trim(),
      p_quantity: Number(params.quantity),
      p_unit_price: Number(params.unitPrice),
      p_notes: params.notes?.trim() || null,
    });

    if (error) return { success: false, error: error.message };

    const res = data as { success?: boolean; charge_id?: string; error?: string };
    if (!res?.success || !res?.charge_id) {
      return { success: false, error: res?.error || "Failed to add unbilled service charge." };
    }

    return { success: true, data: { chargeId: res.charge_id } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to add unbilled service charge." };
  }
}

export async function editEpisodeServiceChargeAction(params: {
  chargeId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}): Promise<ActionResult<{ chargeId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("billing.manage");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.manage required" };
  }

  if (!params.itemName?.trim()) {
    return { success: false, error: "Service or item name is required." };
  }

  if (params.quantity <= 0) {
    return { success: false, error: "Quantity must be greater than zero." };
  }

  if (params.unitPrice < 0) {
    return { success: false, error: "Unit price cannot be negative." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("edit_episode_service_charge_atomic", {
      p_org_id: session.organizationId,
      p_charge_id: params.chargeId,
      p_item_name: params.itemName.trim(),
      p_quantity: Number(params.quantity),
      p_unit_price: Number(params.unitPrice),
      p_notes: params.notes?.trim() || null,
    });

    if (error) return { success: false, error: error.message };

    const res = data as { success?: boolean; charge_id?: string; error?: string };
    if (!res?.success) {
      return { success: false, error: res?.error || "Failed to edit unbilled service charge." };
    }

    return { success: true, data: { chargeId: res.charge_id || params.chargeId } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to edit unbilled service charge." };
  }
}

export async function deleteEpisodeServiceChargeAction(params: {
  chargeId: string;
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

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_episode_service_charge_atomic", {
      p_org_id: session.organizationId,
      p_charge_id: params.chargeId,
    });

    if (error) return { success: false, error: error.message };

    const res = data as { success?: boolean; error?: string };
    if (!res?.success) {
      return { success: false, error: res?.error || "Failed to remove unbilled service charge." };
    }

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to remove unbilled service charge." };
  }
}

export async function prepareEpisodeSettlementAction(params: {
  patientId: string;
  episodeId: string;
  discountAmount?: number;
  discountReason?: string;
  initialPaymentAmount?: number;
  paymentMethod?: PaymentRecord["payment_method"];
  referralAgentId?: string;
  notes?: string;
  excludedReferenceIds?: string[];
}): Promise<ActionResult<{
  invoiceId?: string;
  invoiceNumber?: string;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  status: string;
}>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) return { success: false, error: "401 Unauthorized" };

  try {
    await requirePermission("billing.manage");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.manage required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_episode_settlement_invoice_atomic_v2", {
      p_org_id: session.organizationId,
      p_patient_id: params.patientId,
      p_episode_id: params.episodeId,
      p_cashier_id: session.userId,
      p_discount_amount: Number(params.discountAmount || 0),
      p_discount_reason: params.discountReason?.trim() || null,
      p_initial_payment_amount: Number(params.initialPaymentAmount || 0),
      p_payment_method: params.paymentMethod || "CASH",
      p_referral_agent_id: params.referralAgentId || null,
      p_notes: params.notes?.trim() || null,
      p_excluded_reference_ids: params.excludedReferenceIds && params.excludedReferenceIds.length > 0
        ? params.excludedReferenceIds
        : [],
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
  if (!session.userId || !session.organizationId) return { success: false, error: "401 Unauthorized" };

  const canDischarge =
    (await requirePermission("ipd.discharge").then(() => true).catch(() => false)) ||
    (await requirePermission("ipd.manage").then(() => true).catch(() => false)) ||
    (await requirePermission("billing.manage").then(() => true).catch(() => false));

  if (!canDischarge) return { success: false, error: "403 Forbidden: Discharge permission required." };
  if (!params.finalDiagnosis?.trim()) return { success: false, error: "Final diagnosis is required before discharge." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("complete_episode_discharge_atomic_v2", {
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
      if (message.includes("UNBILLED_EPISODE_CHARGES")) {
        return { success: false, error: "New unbilled charges were detected. Prepare the final settlement again before discharge." };
      }
      if (message.includes("EPISODE_PAYMENT_DUE")) {
        return { success: false, error: "Episode has an outstanding balance. Collect payment before discharge." };
      }
      return { success: false, error: message };
    }

    const result = data as { success?: boolean; episode_id?: string; discharged_at?: string; error?: string };
    if (!result?.success) return { success: false, error: result?.error || "Episode discharge could not be completed." };

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
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

export async function waiveEpisodeServiceAction(params: {
  patientId: string;
  episodeId: string;
  referenceId: string;
  serviceCategory: string;
  itemName: string;
  waivedAmount: number;
  waiverReason: string;
}): Promise<ActionResult<{ waiverId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) return { success: false, error: "401 Unauthorized" };

  try {
    await requirePermission("billing.manage");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.manage required" };
  }

  const cleanReason = params.waiverReason?.trim() || "";
  if (cleanReason.length < 3) {
    return { success: false, error: "A waiver reason of at least 3 characters is required." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("waive_episode_service_atomic", {
      p_org_id: session.organizationId,
      p_patient_id: params.patientId,
      p_episode_id: params.episodeId,
      p_reference_id: params.referenceId,
      p_service_category: params.serviceCategory,
      p_item_name: params.itemName.trim(),
      p_waived_amount: Number(params.waivedAmount),
      p_waiver_reason: cleanReason,
    });

    if (error) return { success: false, error: error.message };

    const res = data as { success?: boolean; waiver_id?: string; error?: string };
    if (!res?.success || !res?.waiver_id) {
      return { success: false, error: res?.error || "Failed to permanently waive service charge." };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "BILLING",
      entityType: "episode_service_waivers",
      entityId: res.waiver_id,
      newValues: {
        episode_id: params.episodeId,
        patient_id: params.patientId,
        reference_id: params.referenceId,
        item_name: params.itemName,
        waived_amount: params.waivedAmount,
        waiver_reason: cleanReason,
      },
    });

    return { success: true, data: { waiverId: res.waiver_id } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to permanently waive service charge." };
  }
}

export async function restoreEpisodeServiceWaiverAction(params: {
  waiverId: string;
  restorationReason?: string;
}): Promise<ActionResult<{ success: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) return { success: false, error: "401 Unauthorized" };

  try {
    await requirePermission("billing.manage");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: billing.manage required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("restore_episode_service_waiver_atomic", {
      p_org_id: session.organizationId,
      p_waiver_id: params.waiverId,
      p_restoration_reason: params.restorationReason?.trim() || null,
    });

    if (error) return { success: false, error: error.message };

    const res = data as { success?: boolean; error?: string };
    if (!res?.success) {
      return { success: false, error: res?.error || "Failed to restore waived service charge." };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "BILLING",
      entityType: "episode_service_waivers",
      entityId: params.waiverId,
      newValues: {
        status: "RESTORED",
        restoration_reason: params.restorationReason?.trim() || null,
      },
    });

    return { success: true, data: { success: true } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to restore waived service charge." };
  }
}

