import { createClient } from "@/lib/supabase/client";
import { requirePermission, hasPermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { getDhakaDateString } from "@/lib/datetime";
import { normalizeBDPhone } from "@/lib/patient/phone";
import {
  reportSystemRuntimeIncident,
  resolveSystemRuntimeIncident,
} from "@/lib/diagnostics/troubleshooter";
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
        patients (id, patient_code, full_name, phone, gender, address, age, age_months, age_days, dob, blood_group),
        referral_agents (id, agent_code, full_name, agent_type, phone, commission_rate_percent, is_commission_eligible)
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.patientId) {
      query = query.eq("patient_id", params.patientId);
    }
    if (params?.status && params.status !== "ALL") {
      if (params.status === "DUE") {
        query = query.in("status", ["PARTIAL", "UNPAID"]).gt("due_amount", 0);
      } else {
        query = query.eq("status", params.status);
      }
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
      referral_agent_id?: string | null;
      referral_agents?: {
        id: string;
        agent_code: string;
        full_name: string;
        agent_type?: string;
        phone?: string;
        commission_rate_percent?: number;
        is_commission_eligible?: boolean;
      } | null;
      invoice_items?: InvoiceItemRecord[];
      payments?: PaymentRecord[];
      refunds?: RefundRecord[];
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        phone: string;
        gender?: string;
        address?: string;
        age?: number;
        age_months?: number;
        age_days?: number;
        dob?: string;
        blood_group?: string;
      } | null;
    }

    const invoices: InvoiceRecord[] = ((data || []) as unknown as InvoiceDbRow[]).map((r) => ({
      ...r,
      items: r.invoice_items || [],
      payments: r.payments || [],
      refunds: r.refunds || [],
      patient: r.patients || undefined,
      referral_agent_id: r.referral_agent_id || null,
      referral_agent: r.referral_agents || null,
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

    // Verify patient and enforce mandatory demographic invariants (Name, UHID, Phone, Address, Age)
    const { data: patient } = await supabase
      .from("patients")
      .select("id, patient_code, full_name, phone, gender, address, age, age_months, age_days, dob, blood_group")
      .eq("id", params.patientId)
      .eq("organization_id", session.organizationId)
      .single();

    if (!patient) {
      return { success: false, error: "Patient record not found." };
    }

    if (!patient.full_name || patient.full_name.trim().length < 2) {
      return { success: false, error: "Patient name is mandatory for billing." };
    }
    if (!patient.patient_code) {
      return { success: false, error: "Patient UHID is mandatory for billing." };
    }
    if (!patient.phone) {
      return { success: false, error: "Patient contact number is mandatory for billing." };
    }
    // Address and Age are recommended; if missing, use graceful defaults so emergency/OPD billing is never blocked
    if (!patient.address || patient.address.trim().length < 2) {
      // Non-blocking fallback for rapid counter billing
      patient.address = "Hospital Counter / Walk-in";
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

    const createdInvoiceId = rpcRes.invoice_id;

    // Fetch full saved invoice with joined items and payments
    const { data: invRow } = await supabase
      .from("invoices")
      .select(`
        *,
        invoice_items (*),
        payments (*)
      `)
      .eq("id", createdInvoiceId)
      .single();

    // Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "BILLING",
      entityType: "invoice",
      entityId: createdInvoiceId,
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
      id: createdInvoiceId,
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
    const canCollect =
      (await hasPermission("billing.collect")) ||
      (await hasPermission("billing.create")) ||
      (await hasPermission("billing.manage"));
    if (!canCollect) {
      await requirePermission("billing.collect");
    }
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

    let targetPatientId = params.patientId.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetPatientId);
    if (!isUuid) {
      const sanitized = targetPatientId.replace(/[,().%"']/g, "").trim();
      const normPhone = normalizeBDPhone(sanitized);
      const { data: pRec } = await supabase
        .from("patients")
        .select("id")
        .eq("organization_id", session.organizationId)
        .eq("is_deleted", false)
        .or(`patient_code.eq.${sanitized},registration_serial.eq.${sanitized},phone.eq.${sanitized},normalized_phone.eq.${normPhone}`)
        .limit(1)
        .maybeSingle();

      if (pRec?.id) {
        targetPatientId = pRec.id;
      }
    }

    const { data, error } = await supabase.rpc("get_episode_billing_overview", {
      p_org_id: session.organizationId,
      p_patient_id: targetPatientId,
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

    const rawLines = (result.lines || []).map((line) => ({
      reference_id: String(line.reference_id),
      charge_id: line.charge_id || null,
      is_custom_charge: !!line.is_custom_charge,
      service_category: String(line.service_category),
      item_name: String(line.item_name),
      unit_price: Number(line.unit_price || 0),
      quantity: Number(line.quantity || 0),
      total_price: Number(line.total_price || 0),
      started_at: line.started_at || undefined,
    }));

    const isIpdCase =
      (result.encounters || []).some((e) => /ipd|inpatient|admission/i.test(e.visit_type || "")) ||
      (result.resources || []).length > 0 ||
      (result.critical_care || []).length > 0 ||
      rawLines.some((l) => /bed|cabin|ward|ipd|ccu|icu/i.test(l.item_name));

    if (isIpdCase) {
      const hasAdmFee = rawLines.some(
        (l) => l.service_category === "ADMISSION" || /admission\s*fee|ভর্তি\s*ফি/i.test(l.item_name)
      );
      if (!hasAdmFee) {
        rawLines.unshift({
          reference_id: `ipd-adm-fee-${targetPatientId}`,
          charge_id: null,
          is_custom_charge: true,
          service_category: "ADMISSION",
          item_name: "IPD Admission Fee (ভর্তি ফি - এককালীন)",
          unit_price: 300,
          quantity: 1,
          total_price: 300,
          started_at: new Date().toISOString(),
        });
      }

      const hasSvcCharge = rawLines.some(
        (l) => l.service_category === "SERVICE_CHARGE" || /service\s*charge|সেবা\s*চার্জ|সার্ভিস\s*চার্জ/i.test(l.item_name)
      );
      if (!hasSvcCharge) {
        const ipdEnc = (result.encounters || []).find((e) => /ipd|inpatient|admission/i.test(e.visit_type || ""));
        const admitMs = ipdEnc?.admitted_at
          ? new Date(ipdEnc.admitted_at).getTime()
          : (result.resources && result.resources.length > 0 ? new Date(result.resources[0].assigned_at).getTime() : Date.now());
        const stayDays = Math.max(1, Math.ceil((Date.now() - admitMs) / (1000 * 60 * 60 * 24)));
        rawLines.push({
          reference_id: `ipd-svc-charge-${targetPatientId}`,
          charge_id: null,
          is_custom_charge: true,
          service_category: "SERVICE_CHARGE",
          item_name: `IPD Daily Service Charge (দৈনিক সেবা চার্জ - ৳৫০০/দিন × ${stayDays} দিন)`,
          unit_price: 500,
          quantity: stayDays,
          total_price: 500 * stayDays,
          started_at: ipdEnc?.admitted_at || new Date().toISOString(),
        });
      }
    }

    const calculatedTotal = rawLines.reduce((acc, l) => acc + (Number(l.total_price) || 0), 0);
    const effTotal = Math.max(Number(result.total || 0), calculatedTotal);
    const prevPaidAmount = Number(result.previous_paid || 0);
    const effEpisodeDue = Math.max(0, effTotal - prevPaidAmount);

    return {
      success: true,
      data: {
        episodeId: resolvedEpisodeId || undefined,
        episodeNumber: resolvedEpisodeNumber || undefined,
        primaryVisitId: result.primary_visit_id || undefined,
        lines: rawLines,
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
        total: effTotal,
        admissionDiscountAmount: Number(result.admission_discount_amount || 0),
        admissionDiscountReason: result.admission_discount_reason || null,
        referralAgentId: result.referral_agent_id || null,
        previousInvoiced: Number(result.previous_invoiced || 0),
        previousPaid: prevPaidAmount,
        previousDue: Number(result.previous_due || 0),
        episodeInvoiced: Number(result.episode_invoiced || 0),
        episodePaid: Number(result.episode_paid || 0),
        episodeDue: effEpisodeDue,
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

export interface HospitalServiceTariffRecord {
  id: string;
  organization_id: string;
  service_code: string;
  service_name: string;
  category: string;
  price: number;
  unit: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getHospitalServiceTariffsAction(params?: {
  category?: string;
  isActive?: boolean;
}): Promise<ActionResult<{ tariffs: HospitalServiceTariffRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("hospital_service_tariffs")
      .select("*")
      .or(`organization_id.eq.${session.organizationId},organization_id.is.null`)
      .order("category", { ascending: true })
      .order("service_name", { ascending: true });

    if (params?.category && params.category !== "ALL") {
      query = query.eq("category", params.category);
    }
    if (params?.isActive !== undefined) {
      query = query.eq("is_active", params.isActive);
    }

    const { data: initialData, error } = await query;
    let data = initialData;

    if (!data || data.length === 0) {
      const fallback = await supabase
        .from("hospital_service_tariffs")
        .select("*")
        .eq("organization_id", "a0000000-0000-0000-0000-000000000001")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("service_name", { ascending: true });
      if (fallback.data && fallback.data.length > 0) {
        data = fallback.data;
      }
    }

    if (error && (!data || data.length === 0)) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { tariffs: (data || []) as HospitalServiceTariffRecord[] } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Error loading service tariffs" };
  }
}

export async function saveHospitalServiceTariffAction(params: {
  id?: string;
  serviceCode: string;
  serviceName: string;
  category: string;
  price: number;
  unit?: string;
  description?: string;
  isActive?: boolean;
}): Promise<ActionResult<{ tariff: HospitalServiceTariffRecord }>> {
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
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("save_hospital_service_tariff_atomic", {
      p_org_id: session.organizationId,
      p_id: params.id || null,
      p_service_code: params.serviceCode.trim().toUpperCase(),
      p_service_name: params.serviceName.trim(),
      p_category: params.category.trim().toUpperCase(),
      p_price: Math.max(0, params.price),
      p_unit: params.unit?.trim() || "Per Service",
      p_description: params.description?.trim() || null,
      p_is_active: params.isActive ?? true,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || "Failed to save hospital service tariff." };
    }

    const tariffId = (rpcRes as { id?: string })?.id || params.id;
    const { data: tariffRow } = await supabase
      .from("hospital_service_tariffs")
      .select("*")
      .eq("id", tariffId)
      .eq("organization_id", session.organizationId)
      .single();

    return { success: true, data: { tariff: (tariffRow || rpcRes) as HospitalServiceTariffRecord } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Error saving service tariff" };
  }
}

/**
 * 15. Check Cashier Bill Edit Authorization Status
 */
export async function getCashierAuthorizationStatusAction(): Promise<
  ActionResult<{ cashierCanEditBills: boolean }>
> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organization_settings")
      .select("cashier_can_edit_bills")
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (error) {
      return { success: true, data: { cashierCanEditBills: false } };
    }

    return {
      success: true,
      data: { cashierCanEditBills: Boolean(data?.cashier_can_edit_bills) },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load cashier status";
    return { success: false, error: msg };
  }
}

/**
 * 16. Toggle Cashier Bill Edit Authorization (Super Admin Exclusive)
 */
export async function toggleCashierEditAuthorizationAction(params: {
  allowCashierEdit: boolean;
}): Promise<ActionResult<{ cashierCanEditBills: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  // Strict check: Only Super Admin can grant Cashier authorization
  const isSuperAdmin = session.roles.includes("super_admin");
  if (!isSuperAdmin) {
    return {
      success: false,
      error: "403 Forbidden: Only Super Admin can authorize cashier bill editing.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("organization_settings")
      .update({
        cashier_can_edit_bills: params.allowCashierEdit,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "BILLING",
      entityType: "organization_settings",
      entityId: session.organizationId,
      newValues: { cashier_can_edit_bills: params.allowCashierEdit },
    });

    return {
      success: true,
      data: { cashierCanEditBills: params.allowCashierEdit },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update cashier authorization";
    return { success: false, error: msg };
  }
}

/**
 * 17. Edit Existing Invoice (Register, Receptionist, Admin, or Authorized Cashier)
 */
export async function editInvoiceAction(params: {
  invoiceId: string;
  items: Array<{
    category: InvoiceItemRecord["service_category"];
    itemName: string;
    unitPrice: number;
    quantity: number;
    referenceId?: string;
  }>;
  discountAmount?: number;
  discountReason?: string;
  taxAmount?: number;
  referralAgentId?: string | null;
  notes?: string;
}): Promise<ActionResult<{ success: boolean; subtotal: number; grandTotal: number; dueAmount: number }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  // Strict RBAC authorization validation: Super Admin and Hospital Admin bypass.
  // All other front-desk roles (cashier, receptionist, staff) REQUIRE both billing.edit permission
  // AND the cashierCanEditBills toggle MUST be explicitly enabled by Super Admin.
  const isSuperAdmin = session.roles.some((r) =>
    ["super_admin", "admin", "hospital_admin"].includes(String(r).toLowerCase())
  );
  const hasEditPerm = session.permissions.includes("billing.edit");

  if (!isSuperAdmin) {
    if (!hasEditPerm) {
      const errorMsg =
        "403 Forbidden: ইনভয়েস বিল এডিট করার অনুমতি নেই (Missing billing.edit permission). শুধুমাত্র অনুমোদিত স্টাফ বা সুপার অ্যাডমিন বিল এডিট করতে পারেন।";
      await reportSystemRuntimeIncident({
        organizationId: session.organizationId,
        module: "Patient Billing",
        location: "lib/billing/actions.ts:editInvoiceAction",
        severity: "WARNING",
        errorCode: "INSUFFICIENT_PERMISSION",
        title: "অননুমোদিত বিল এডিটের চেষ্টা (Unauthorized Bill Edit Attempt)",
        reason: errorMsg,
        recommendation: "সুপার অ্যাডমিন একাউন্ট থেকে সেটিংস RBAC ম্যাট্রিক্সে এই রোলের জন্য billing.edit পারমিশন সক্রিয় করুন।",
      });
      return {
        success: false,
        error: errorMsg,
      };
    }

    const authStatus = await getCashierAuthorizationStatusAction();
    if (!authStatus.success || !authStatus.data?.cashierCanEditBills) {
      return {
        success: false,
        error:
          "403 Forbidden: রিসেপশন ও ক্যাশিয়ারদের বিল এডিট করার সাময়িক অনুমতি বর্তমানে বন্ধ রয়েছে (Receptionist & Cashier bill editing is restricted by Super Admin).",
      };
    }
  }

  if (!params.items || params.items.length === 0) {
    return { success: false, error: "Invoice must contain at least one item." };
  }

  try {
    const supabase = await createClient();

    // Map items to JSON payload
    const formattedItems = params.items.map((it) => ({
      category: it.category,
      reference_id: it.referenceId || null,
      item_name: it.itemName.trim(),
      unit_price: Math.max(0, it.unitPrice),
      quantity: Math.max(0.01, it.quantity),
      total_price: Math.max(0, Math.round(it.unitPrice * it.quantity * 100) / 100),
    }));

    let pReferralAgentId: string | null = null;
    if (params.referralAgentId !== undefined) {
      if (
        !params.referralAgentId ||
        params.referralAgentId === "00000000-0000-0000-0000-000000000000" ||
        params.referralAgentId.toLowerCase() === "none"
      ) {
        pReferralAgentId = "00000000-0000-0000-0000-000000000000";
      } else {
        pReferralAgentId = params.referralAgentId;
      }
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("update_invoice_atomic", {
      p_org_id: session.organizationId,
      p_invoice_id: params.invoiceId,
      p_user_id: session.userId,
      p_items: formattedItems,
      p_discount_amount: Math.max(0, params.discountAmount || 0),
      p_discount_reason: params.discountReason?.trim() || "Bill edited by authorized staff",
      p_tax_amount: Math.max(0, params.taxAmount || 0),
      p_referral_agent_id: pReferralAgentId,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message };
    }

    const res = rpcRes as {
      success?: boolean;
      subtotal?: number;
      grand_total?: number;
      due_amount?: number;
      error?: string;
    };

    if (res && res.success === false) {
      return { success: false, error: res.error || "Failed to update invoice." };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "BILLING",
      entityType: "invoice",
      entityId: params.invoiceId,
      newValues: {
        itemCount: params.items.length,
        discountAmount: params.discountAmount,
        referralAgentId: params.referralAgentId,
        notes: params.notes,
      },
    });

    // Anti-fraud notification for Super Admin
    try {
      const invNum = (res as { invoice_number?: string })?.invoice_number || params.invoiceId.slice(0, 8);
      await reportSystemRuntimeIncident({
        organizationId: session.organizationId,
        module: "Patient Billing Audit",
        location: `invoices/${params.invoiceId}`,
        severity: "INFO",
        errorCode: "INVOICE_MODIFIED",
        title: `রিসিপশন কর্তৃক ইনভয়েস সংশোধন (Invoice #${invNum})`,
        reason: `স্টাফ ${session.profile?.full_name || session.email} (${session.roles[0] || "staff"}) ইনভয়েস সংশোধন করেছেন। কারণ: ${params.discountReason || params.notes || "Bill modified"}`,
        recommendation: "সুপার অ্যাডমিন অডিট হিস্টোরি থেকে পূর্বের ও বর্তমান আইটেম তালিকা যাচাই করতে পারেন।",
        details: {
          invoiceId: params.invoiceId,
          editedBy: session.userId,
          itemCount: params.items.length,
          discountAmount: params.discountAmount,
          referralAgentId: params.referralAgentId,
          notes: params.notes,
        },
      });
    } catch {}

    return {
      success: true,
      data: {
        success: true,
        subtotal: Number(res.subtotal || 0),
        grandTotal: Number(res.grand_total || 0),
        dueAmount: Number(res.due_amount || 0),
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update invoice";
    return { success: false, error: msg };
  }
}

/**
 * 18. Delete Invoice (Super Admin Exclusive Action)
 */
export async function deleteInvoiceAction(params: {
  invoiceId: string;
  reason?: string;
  permanentPurge?: boolean;
}): Promise<ActionResult<{ success: boolean; mode: string; message: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  // Strict enforcement: Super Admin or Hospital Admin can delete bills from the system!
  const isSuperAdmin =
    session.roles.includes("super_admin") ||
    session.roles.includes("admin") ||
    session.roles.includes("hospital_administrator");
  if (!isSuperAdmin) {
    const errorMsg = "403 Forbidden: Only Hospital Administrator or Super Admin can delete bills from the hospital system.";
    await reportSystemRuntimeIncident({
      organizationId: session.organizationId,
      module: "Patient Billing",
      location: "lib/billing/actions.ts:deleteInvoiceAction",
      severity: "WARNING",
      errorCode: "INSUFFICIENT_PRIVILEGE",
      title: "অননুমোদিত বিল মোছার চেষ্টা (Unauthorized Invoice Deletion Attempt)",
      reason: errorMsg,
      recommendation: "সুপার অ্যাডমিন বা হাসপাতাল অ্যাডমিন প্রিভিলেজ নিয়ে চেষ্টা করুন।",
    });
    return {
      success: false,
      error: errorMsg,
    };
  }

  try {
    const supabase = await createClient();

    const purgeReason = params.reason?.trim();
    if (!purgeReason) {
      return {
        success: false,
        error: "Deletion reason is mandatory and cannot be empty.",
      };
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("delete_invoice_super_admin_atomic", {
      p_org_id: session.organizationId,
      p_invoice_id: params.invoiceId,
      p_admin_id: session.userId,
      p_reason: purgeReason,
      p_permanent_purge: Boolean(params.permanentPurge),
    });

    if (rpcErr) {
      const msg = rpcErr.message?.includes("Immutable Journal Error")
        ? "ইনভয়েসের সাথে সংশ্লিষ্ট জার্নাল এন্ট্রি থাকায় ডিলিট করা যায়নি। অনুগ্রহ করে লেটেস্ট ডাটাবেজ মাইগ্রেশন প্রয়োগ করুন (Cannot delete posted journal entry)."
        : rpcErr.message;
      await reportSystemRuntimeIncident({
        organizationId: session.organizationId,
        module: "Patient Billing",
        location: "public.delete_invoice_super_admin_atomic",
        severity: "CRITICAL",
        errorCode: "INVOICE_PURGE_RPC_ERROR",
        title: "বিল মোছার সময় ডাটাবেজ ত্রুটি (Invoice Deletion Failed)",
        reason: msg || "ইনভয়েস বা সংশ্লিষ্ট রেকর্ড প্রক্রিয়াকরণে সমস্যা হয়েছে।",
        recommendation: "ইনভয়েসের সাথে সংযুক্ত জার্নাল বা পেমেন্ট স্ট্যাটাস পরীক্ষা করুন অথবা ভয়েড বিকল্পটি ব্যবহার করুন।",
      });
      return { success: false, error: msg };
    }

    const res = rpcRes as {
      success?: boolean;
      mode?: string;
      message?: string;
      error?: string;
    };

    if (res && res.success === false) {
      const msg = res.error || "Failed to delete invoice.";
      if (res.mode === "ALREADY_PURGED" || msg.includes("already been permanently purged")) {
        await resolveSystemRuntimeIncident({
          organizationId: session.organizationId,
          module: "Patient Billing",
        });
        return {
          success: true,
          data: {
            success: true,
            mode: "ALREADY_PURGED",
            message: msg,
          },
        };
      }
      await reportSystemRuntimeIncident({
        organizationId: session.organizationId,
        module: "Patient Billing",
        location: "public.delete_invoice_super_admin_atomic",
        severity: "CRITICAL",
        errorCode: "INVOICE_PURGE_REJECTED",
        title: "ইনভয়েস ডিলিট বাতিল হয়েছে (Invoice Purge Rejected)",
        reason: msg,
        recommendation: "ইনভয়েসের বর্তমান স্ট্যাটাস ও কালেকশন রেকর্ড যাচাই করুন।",
      });
      return { success: false, error: msg };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "DELETE",
      module: "BILLING",
      entityType: "invoice",
      entityId: params.invoiceId,
      newValues: {
        reason: params.reason,
        mode: res.mode,
      },
    });

    // Auto-resolve any previous billing incidents upon successful resolution
    await resolveSystemRuntimeIncident({
      organizationId: session.organizationId,
      module: "Patient Billing",
    });

    return {
      success: true,
      data: {
        success: true,
        mode: res.mode || "DELETED",
        message: res.message || "Invoice deleted successfully.",
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete invoice";
    await reportSystemRuntimeIncident({
      organizationId: session.organizationId,
      module: "Patient Billing",
      location: "lib/billing/actions.ts:deleteInvoiceAction",
      severity: "CRITICAL",
      errorCode: "ACTION_EXCEPTION",
      title: "ইনভয়েস ডিলিট প্রক্রিয়ায় অপ্রত্যাশিত ত্রুটি",
      reason: msg,
      recommendation: "পুনরায় চেষ্টা করুন অথবা অ্যান্টিগ্র্যাভিটি দিয়ে লগ পরীক্ষা করুন।",
    });
    return { success: false, error: msg };
  }
}





export interface InvoiceEditHistoryRecord {
  id: string;
  organization_id: string;
  invoice_id: string;
  invoice_number: string;
  edited_by_user_id: string;
  edited_by_name: string;
  edited_by_role: string;
  edit_reason: string;
  previous_subtotal: number;
  new_subtotal: number;
  previous_discount: number;
  new_discount: number;
  previous_grand_total: number;
  new_grand_total: number;
  previous_items: Array<{
    service_category: string;
    item_name: string;
    unit_price: number;
    quantity: number;
    total_price: number;
  }>;
  new_items: Array<{
    service_category: string;
    item_name: string;
    unit_price: number;
    quantity: number;
    total_price: number;
  }>;
  changes_summary?: string;
  created_at: string;
}

export async function getInvoiceEditHistoryAction(invoiceId: string): Promise<ActionResult<InvoiceEditHistoryRecord[]>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invoice_edit_history")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[getInvoiceEditHistoryAction] query error:", error.message);
      return { success: true, data: [] };
    }

    return { success: true, data: (data as unknown as InvoiceEditHistoryRecord[]) || [] };
  } catch (err: unknown) {
    console.error("[getInvoiceEditHistoryAction] error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load invoice edit history." };
  }
}
