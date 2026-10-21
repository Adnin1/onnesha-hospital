"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";
import {
  reportSystemRuntimeIncident,
  resolveSystemRuntimeIncident,
} from "@/lib/diagnostics/troubleshooter";

export interface ReferralAgent {
  id: string;
  organization_id?: string;
  agent_code: string;
  full_name: string;
  agent_type: "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF";
  phone: string;
  email?: string | null;
  address?: string | null;
  professional_registration_no?: string | null;
  commission_rate_percent: number;
  commission_rate_opd?: number;
  commission_rate_diag?: number;
  commission_rate_ipd?: number;
  total_commission_earned: number;
  total_commission_settled: number;
  is_commission_eligible: boolean;
  compliance_approved: boolean;
  bmdc_ethics_acknowledged?: boolean;
  compliance_notes?: string | null;
  notes?: string | null;
  is_active: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ReferralAttribution {
  id: string;
  organization_id: string;
  patient_id: string;
  visit_id?: string | null;
  referral_agent_id: string;
  referral_code_snapshot: string;
  referral_name_snapshot: string;
  assigned_by?: string | null;
  assigned_at: string;
  status: "ACTIVE" | "DISCHARGED" | "CANCELLED";
  notes?: string | null;
  created_at: string;
  patients?: {
    full_name: string;
    patient_code?: string;
    phone?: string;
  };
}

export interface ReferralCommission {
  id: string;
  organization_id: string;
  referral_agent_id: string;
  referral_attribution_id?: string | null;
  patient_id: string;
  visit_id?: string | null;
  invoice_id: string;
  referral_code_snapshot: string;
  referral_name_snapshot: string;
  billing_subtotal: number;
  discount_amount: number;
  commission_base_amount: number;
  commission_rate_percent: number;
  commission_amount: number;
  amount_paid: number;
  amount_pending: number;
  approval_status: "PENDING" | "APPROVED" | "REJECTED";
  settlement_status: "PENDING" | "PARTIAL" | "PAID" | "CANCELLED" | "REVERSED";
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  created_at: string;
  updated_at: string;
  invoices?: {
    invoice_number: string;
    grand_total: number;
    status: string;
  };
  patients?: {
    full_name: string;
    patient_code?: string;
  };
}

export interface ReferralSettlement {
  id: string;
  organization_id: string;
  settlement_number: string;
  referral_agent_id: string;
  patient_id?: string | null;
  patient_name?: string | null;
  patient_code?: string | null;
  patient_total_bill?: number | null;
  commission_rate_percent?: number | null;
  expense_id?: string | null;
  journal_entry_id?: string | null;
  settlement_date: string;
  gross_commission_selected: number;
  adjustment_amount: number;
  net_paid_amount: number;
  payment_method: "CASH" | "BANK_TRANSFER" | "BKASH" | "NAGAD" | "ROCKET" | "UPAY";
  transaction_reference?: string | null;
  paid_by?: string | null;
  approved_by?: string | null;
  status: "PENDING" | "PAID" | "CANCELLED" | "VOIDED";
  notes?: string | null;
  created_at: string;
  referral_agents?: {
    agent_code: string;
    full_name: string;
  };
}

export interface ReferralRateHistory {
  id: string;
  organization_id: string;
  referral_agent_id: string;
  old_rate: number;
  new_rate: number;
  effective_from: string;
  changed_by?: string | null;
  reason?: string | null;
  created_at: string;
}

export interface ReferralSummaryMetrics {
  totalAgents: number;
  activeAgents: number;
  totalReferredPatients: number;
  totalBilledBase: number;
  totalCommissionEarned: number;
  totalCommissionPending: number;
  totalCommissionSettled: number;
}

export interface PatientReferralServiceSummary {
  patientId: string;
  patientCode: string;
  fullName: string;
  phone: string;
  attributedAt: string;
  visitId?: string | null;
  totalBilled: number;
  invoicesCount: number;
  commissionRatePercent: number;
  commissionEarned: number;
  commissionPaid: number;
  commissionDue: number;
  commissionStatus: "PAID" | "PARTIAL" | "PENDING";
  lastPayoutDate?: string | null;
  services: Array<{
    name: string;
    category?: string;
    quantity: number;
    amount: number;
    invoiceNumber: string;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    grandTotal: number;
    status: string;
    createdAt: string;
  }>;
}

export interface PeriodicBillingStats {
  todayBilled: number;
  weekBilled: number;
  monthBilled: number;
  yearBilled: number;
  allTimeBilled: number;
  referredPatientsCount: number;
}

// -------------------------------------------------------------------------------------
// Actions
// -------------------------------------------------------------------------------------

export async function getReferralAgentsAction(): Promise<{
  success: boolean;
  data?: ReferralAgent[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canView = isSuperAdmin || session.permissions.includes("referral.view") || session.permissions.includes("referral.manage");
    if (!canView) {
      return { success: false, error: "403 Forbidden: Missing referral.view permission." };
    }

    const supabase = createClient();
    const [agentsRes, settlementsRes, expensesRes] = await Promise.all([
      supabase.from("referral_agents").select("*").is("archived_at", null).order("full_name", { ascending: true }),
      supabase.from("referral_commission_settlements").select("referral_agent_id, net_paid_amount"),
      supabase.from("expenses").select("amount, title, paid_to, status").not("status", "in", '("VOID","VOIDED")'),
    ]);

    if (agentsRes.error) {
      if (agentsRes.error.code === "42501" || agentsRes.error.message?.includes("policy") || agentsRes.error.message?.includes("permission")) {
        throw new Error("403 Forbidden: Management authority required to view full financial referral agent profiles. Use safe directory for non-financial intake.");
      }
      throw agentsRes.error;
    }

    const settlementsMap = new Map<string, number>();
    for (const s of (settlementsRes.data || [])) {
      if (s.referral_agent_id) {
        settlementsMap.set(s.referral_agent_id, (settlementsMap.get(s.referral_agent_id) || 0) + Number(s.net_paid_amount || 0));
      }
    }

    const expensesList = expensesRes.data || [];
    const agents = ((agentsRes.data as ReferralAgent[]) || []).map((agent) => {
      let settled = Number(agent.total_commission_settled || 0);
      const fromSettlements = settlementsMap.get(agent.id) || 0;
      if (fromSettlements > settled) settled = fromSettlements;

      const matchingExpenses = expensesList.filter((e) =>
        (e.title && (e.title.includes(agent.agent_code) || e.title.includes(agent.full_name))) ||
        (e.paid_to && e.paid_to.toLowerCase() === agent.full_name.toLowerCase())
      );
      const expenseSum = matchingExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      if (expenseSum > settled) settled = expenseSum;

      return {
        ...agent,
        total_commission_settled: settled,
      };
    });

    return { success: true, data: agents };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load referral agents";
    return { success: false, error: msg };
  }
}

export async function getReferralAgentByIdAction(agentId: string): Promise<{
  success: boolean;
  data?: {
    agent: ReferralAgent;
    commissions: ReferralCommission[];
    settlements: ReferralSettlement[];
    rateHistory: ReferralRateHistory[];
    attributions: ReferralAttribution[];
    patientServicesSummary: PatientReferralServiceSummary[];
    periodicBilling: PeriodicBillingStats;
  };
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    const { data: agent, error: aErr } = await supabase
      .from("referral_agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (aErr || !agent) {
      if (aErr?.code === "42501" || aErr?.message?.includes("policy") || aErr?.message?.includes("permission")) {
        throw new Error("403 Forbidden: Management authority required to view agent detail profile and financial ledger.");
      }
      throw aErr || new Error("Referral agent not found");
    }

    const [commissionsRes, settlementsRes, ratesRes, attribRes] = await Promise.all([
      supabase
        .from("referral_commissions")
        .select("*, invoices(invoice_number, grand_total, status), patients(full_name, patient_code)")
        .eq("referral_agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("referral_commission_settlements")
        .select("*")
        .eq("referral_agent_id", agentId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("referral_rate_history")
        .select("*")
        .eq("referral_agent_id", agentId)
        .order("created_at", { ascending: false }),
      supabase
        .from("patient_referral_attributions")
        .select("*, patients(full_name, patient_code, phone)")
        .eq("referral_agent_id", agentId)
        .order("assigned_at", { ascending: false })
        .limit(100),
    ]);

    const attributionsList = (attribRes.data as ReferralAttribution[]) || [];
    const commissionsList = (commissionsRes.data as ReferralCommission[]) || [];

    // Collect all attributed patient IDs
    const patientIdSet = new Set<string>();
    for (const a of attributionsList) {
      if (a.patient_id) patientIdSet.add(a.patient_id);
    }
    for (const c of commissionsList) {
      if (c.patient_id) patientIdSet.add(c.patient_id);
    }
    const patientIds = Array.from(patientIdSet);

    // Query non-voided patient invoices and line items
    interface InvoiceQueryRow {
      id: string;
      invoice_number: string;
      patient_id: string;
      grand_total: number;
      net_amount: number;
      status: string;
      is_voided: boolean;
      created_at: string;
      invoice_items?: Array<{
        id: string;
        item_name: string;
        category?: string;
        quantity: number;
        unit_price: number;
        total_amount: number;
      }>;
    }

    let patientInvoices: InvoiceQueryRow[] = [];
    if (patientIds.length > 0) {
      const { data: invData } = await supabase
        .from("invoices")
        .select(`
          id, invoice_number, patient_id, grand_total, net_amount, status, is_voided, created_at,
          invoice_items (id, item_name, category, quantity, unit_price, total_amount)
        `)
        .in("patient_id", patientIds)
        .eq("is_voided", false)
        .order("created_at", { ascending: false });
      patientInvoices = (invData as unknown as InvoiceQueryRow[]) || [];
    }

    // Dhaka (+06:00) Date Ranges
    const now = new Date();
    const dhakaOffsetMs = 6 * 60 * 60 * 1000;
    const dhakaNow = new Date(now.getTime() + dhakaOffsetMs);
    const y = dhakaNow.getUTCFullYear();
    const m = dhakaNow.getUTCMonth();
    const d = dhakaNow.getUTCDate();
    const startOfToday = new Date(Date.UTC(y, m, d) - dhakaOffsetMs).getTime();
    const startOfMonth = new Date(Date.UTC(y, m, 1) - dhakaOffsetMs).getTime();
    const startOfYear = new Date(Date.UTC(y, 0, 1) - dhakaOffsetMs).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    let todayBilled = 0;
    let weekBilled = 0;
    let monthBilled = 0;
    let yearBilled = 0;
    let allTimeBilled = 0;

    for (const inv of patientInvoices) {
      const amt = Number(inv.grand_total || inv.net_amount || 0);
      const time = new Date(inv.created_at).getTime();
      allTimeBilled += amt;
      if (time >= startOfToday) todayBilled += amt;
      if (time >= sevenDaysAgo) weekBilled += amt;
      if (time >= startOfMonth) monthBilled += amt;
      if (time >= startOfYear) yearBilled += amt;
    }

    // Graceful fallback to commission rows if invoices table has no direct matches
    if (allTimeBilled === 0 && commissionsList.length > 0) {
      for (const c of commissionsList) {
        const amt = Number(c.billing_subtotal || c.commission_base_amount || 0);
        const time = new Date(c.created_at).getTime();
        allTimeBilled += amt;
        if (time >= startOfToday) todayBilled += amt;
        if (time >= sevenDaysAgo) weekBilled += amt;
        if (time >= startOfMonth) monthBilled += amt;
        if (time >= startOfYear) yearBilled += amt;
      }
    }

    // Patient Map for Patient-Centric Service Breakdown
    const patientMap = new Map<string, { code: string; name: string; phone: string; assignedAt: string; visitId?: string | null }>();
    for (const attr of attributionsList) {
      if (!patientMap.has(attr.patient_id)) {
        patientMap.set(attr.patient_id, {
          code: attr.patients?.patient_code || "",
          name: attr.patients?.full_name || attr.referral_name_snapshot || "Patient",
          phone: attr.patients?.phone || "",
          assignedAt: attr.assigned_at,
          visitId: attr.visit_id,
        });
      }
    }
    for (const c of commissionsList) {
      if (c.patient_id && !patientMap.has(c.patient_id)) {
        patientMap.set(c.patient_id, {
          code: c.patients?.patient_code || "",
          name: c.patients?.full_name || c.referral_name_snapshot || "Patient",
          phone: "",
          assignedAt: c.created_at,
          visitId: c.visit_id,
        });
      }
    }

    const patientServicesSummary: PatientReferralServiceSummary[] = [];
    for (const [pId, pInfo] of patientMap.entries()) {
      const pInvoices = patientInvoices.filter((i) => i.patient_id === pId);
      const totalBilled = pInvoices.reduce((sum, i) => sum + Number(i.grand_total || i.net_amount || 0), 0);
      const services = pInvoices.flatMap((i) =>
        (i.invoice_items || []).map((it) => ({
          name: it.item_name || "Hospital Service",
          category: it.category || "GENERAL",
          quantity: Number(it.quantity || 1),
          amount: Number(it.total_amount || 0),
          invoiceNumber: i.invoice_number,
        }))
      );

      const pCommRows = commissionsList.filter((c) => c.patient_id === pId);
      const pSettlements = ((settlementsRes.data as unknown as ReferralSettlement[]) || []).filter((s) => s.patient_id === pId);
      const effectiveTotalBilled = pInvoices.length > 0 ? totalBilled : pCommRows.reduce((sum, c) => sum + Number(c.billing_subtotal || c.commission_base_amount || 0), 0);
      const commissionRatePercent = Number(pCommRows[0]?.commission_rate_percent ?? agent.default_commission_rate ?? 10);
      let commissionEarned = pCommRows.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
      if (commissionEarned <= 0 && effectiveTotalBilled > 0) {
        commissionEarned = Math.round(((effectiveTotalBilled * commissionRatePercent) / 100) * 100) / 100;
      }
      const settledPaid = pSettlements.reduce((sum, s) => sum + Number(s.net_paid_amount || 0), 0);
      const commissionPaid = Math.max(settledPaid, pCommRows.reduce((sum, c) => sum + Number(c.amount_paid || 0), 0));
      if (commissionPaid > commissionEarned) {
        commissionEarned = commissionPaid;
      }
      const commissionDue = Math.max(0, Math.round((commissionEarned - commissionPaid) * 100) / 100);
      let commissionStatus: "PAID" | "PARTIAL" | "PENDING" = "PENDING";
      if (commissionPaid >= commissionEarned && commissionEarned > 0) {
        commissionStatus = "PAID";
      } else if (commissionPaid > 0) {
        commissionStatus = "PARTIAL";
      }
      const lastPayoutDate = pSettlements[0]?.settlement_date || null;

      if (pInvoices.length === 0) {
        patientServicesSummary.push({
          patientId: pId,
          patientCode: pInfo.code,
          fullName: pInfo.name,
          phone: pInfo.phone,
          attributedAt: pInfo.assignedAt,
          visitId: pInfo.visitId,
          totalBilled: effectiveTotalBilled,
          invoicesCount: pCommRows.length,
          commissionRatePercent,
          commissionEarned,
          commissionPaid,
          commissionDue,
          commissionStatus,
          lastPayoutDate,
          services: pCommRows.map((c) => ({
            name: c.invoices?.invoice_number ? `Invoice ${c.invoices.invoice_number}` : "Hospital Care Service",
            category: "ADMISSION",
            quantity: 1,
            amount: Number(c.billing_subtotal || c.commission_base_amount || 0),
            invoiceNumber: c.invoices?.invoice_number || "INV-REC",
          })),
          invoices: pCommRows.map((c) => ({
            id: c.invoice_id || c.id,
            invoiceNumber: c.invoices?.invoice_number || "INV-REC",
            grandTotal: Number(c.billing_subtotal || c.commission_base_amount || 0),
            status: c.invoices?.status || "POSTED",
            createdAt: c.created_at,
          })),
        });
      } else {
        patientServicesSummary.push({
          patientId: pId,
          patientCode: pInfo.code,
          fullName: pInfo.name,
          phone: pInfo.phone,
          attributedAt: pInfo.assignedAt,
          visitId: pInfo.visitId,
          totalBilled: effectiveTotalBilled,
          invoicesCount: pInvoices.length,
          commissionRatePercent,
          commissionEarned,
          commissionPaid,
          commissionDue,
          commissionStatus,
          lastPayoutDate,
          services,
          invoices: pInvoices.map((i) => ({
            id: i.id,
            invoiceNumber: i.invoice_number,
            grandTotal: Number(i.grand_total || i.net_amount || 0),
            status: i.status,
            createdAt: i.created_at,
          })),
        });
      }
    }

    const periodicBilling: PeriodicBillingStats = {
      todayBilled,
      weekBilled,
      monthBilled,
      yearBilled,
      allTimeBilled,
      referredPatientsCount: patientMap.size,
    };

    return {
      success: true,
      data: {
        agent: agent as ReferralAgent,
        commissions: commissionsList,
        settlements: (settlementsRes.data as ReferralSettlement[]) || [],
        rateHistory: (ratesRes.data as ReferralRateHistory[]) || [],
        attributions: attributionsList,
        patientServicesSummary,
        periodicBilling,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load agent profile details";
    return { success: false, error: msg };
  }
}

export async function searchReferralAgentsAction(query?: string): Promise<{
  success: boolean;
  data?: { id: string; agent_code: string; full_name: string; agent_type: string; phone: string }[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canAccess =
      isSuperAdmin ||
      session.permissions.includes("referral.assign") ||
      session.permissions.includes("referral.view") ||
      session.permissions.includes("billing.create") ||
      session.permissions.includes("billing.view") ||
      session.permissions.includes("referral.manage");
    if (!canAccess) {
      return { success: false, error: "403 Forbidden: Missing referral.assign or view permission." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    const { data, error } = await supabase.rpc("search_active_referral_agents", {
      p_org_id: orgId,
      p_query: query || null,
    });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to search referral agents";
    return { success: false, error: msg };
  }
}

export async function createReferralAgentAction(params: {
  full_name: string;
  agent_type: "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF";
  phone: string;
  commission_rate_percent?: number;
  email?: string;
  address?: string;
  professional_registration_no?: string;
  is_commission_eligible?: boolean;
  bmdc_ethics_acknowledged?: boolean;
  compliance_notes?: string;
  notes?: string;
  agent_code?: string; // Kept for backward compatibility
}): Promise<{ success: boolean; data?: ReferralAgent; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canCreate =
      isSuperAdmin ||
      session.permissions.includes("referral.create") ||
      session.permissions.includes("referral.manage") ||
      session.permissions.includes("referral.assign") ||
      session.permissions.includes("billing.create");
    if (!canCreate) {
      return { success: false, error: "403 Forbidden: Missing referral.create permission." };
    }

    if (!params.full_name?.trim()) return { success: false, error: "Full name required" };
    if (!params.phone?.trim()) return { success: false, error: "Phone number required" };

    const rate = params.commission_rate_percent ?? 10;
    if (rate < 1 || rate > 40) {
      return { success: false, error: "Commission rate must be between 1% and 40%." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    // Call authoritative RPC
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("create_referral_agent_atomic", {
      p_org_id: orgId,
      p_full_name: params.full_name.trim(),
      p_agent_type: params.agent_type,
      p_phone: params.phone.trim(),
      p_commission_rate: rate,
      p_email: params.email?.trim() || null,
      p_address: params.address?.trim() || null,
      p_license_no: params.professional_registration_no?.trim() || null,
      p_is_eligible: params.is_commission_eligible ?? true,
      p_notes: params.notes?.trim() || null,
    });

    if (rpcErr) throw rpcErr;
    const resObj = rpcRes as { success: boolean; agent_id?: string; agent_code?: string; error?: string };
    if (!resObj.success || !resObj.agent_id) {
      return { success: false, error: resObj.error || "Failed to create agent" };
    }

    // Persist BMDC ethics acknowledgment and compliance notes if provided
    if (params.bmdc_ethics_acknowledged !== undefined || params.compliance_notes !== undefined) {
      await supabase
        .from("referral_agents")
        .update({
          bmdc_ethics_acknowledged: params.bmdc_ethics_acknowledged ?? false,
          compliance_notes: params.compliance_notes?.trim() || null,
        })
        .eq("id", resObj.agent_id);
    }

    // Fetch newly created agent
    const { data: created, error: cErr } = await supabase
      .from("referral_agents")
      .select("*")
      .eq("id", resObj.agent_id)
      .single();

    if (cErr) throw cErr;
    return { success: true, data: created as ReferralAgent };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create referral agent";
    return { success: false, error: msg };
  }
}

export async function updateReferralAgentRateAction(params: {
  agentId: string;
  newRatePercent: number;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (params.newRatePercent < 1 || params.newRatePercent > 40) {
      return { success: false, error: "Commission rate must be between 1% and 40%." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    const { data: res, error } = await supabase.rpc("update_referral_agent_rate_atomic", {
      p_org_id: orgId,
      p_agent_id: params.agentId,
      p_new_rate: params.newRatePercent,
      p_reason: params.reason || "Management rate adjustment",
    });

    if (error) throw error;
    const resObj = res as { success: boolean; error?: string };
    if (!resObj.success) return { success: false, error: resObj.error || "Rate update rejected" };

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update commission rate";
    return { success: false, error: msg };
  }
}

export async function updateReferralAgentAction(params: {
  agentId: string;
  fullName: string;
  agentType?: "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF";
  phone: string;
  email?: string;
  address?: string;
  professionalRegistrationNo?: string;
  commissionRatePercent?: number;
  isCommissionEligible?: boolean;
  complianceApproved?: boolean;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    const updateData: Record<string, unknown> = {
      full_name: params.fullName.trim(),
      phone: params.phone.trim(),
      email: params.email?.trim() || null,
      address: params.address?.trim() || null,
      professional_registration_no: params.professionalRegistrationNo?.trim() || null,
      is_commission_eligible: params.isCommissionEligible ?? true,
      compliance_approved: params.complianceApproved ?? true,
      notes: params.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (params.agentType) {
      updateData.agent_type = params.agentType;
    }

    const { error } = await supabase
      .from("referral_agents")
      .update(updateData)
      .eq("id", params.agentId);

    if (error) throw error;

    // If commission rate was changed, also update commission rate history
    if (
      params.commissionRatePercent !== undefined &&
      params.commissionRatePercent >= 1 &&
      params.commissionRatePercent <= 40
    ) {
      await updateReferralAgentRateAction({
        agentId: params.agentId,
        newRatePercent: params.commissionRatePercent,
        reason: "Updated via partner profile editor",
      });
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update agent profile";
    return { success: false, error: msg };
  }
}

export async function deactivateReferralAgentAction(agentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    const updatePayload: Record<string, unknown> = {
      is_active: false,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let { error } = await supabase
      .from("referral_agents")
      .update(updatePayload)
      .eq("id", agentId);

    if (error && (error.code === "PGRST204" || error.message.toLowerCase().includes("column"))) {
      delete updatePayload.updated_at;
      delete updatePayload.archived_at;
      const retry = await supabase
        .from("referral_agents")
        .update(updatePayload)
        .eq("id", agentId);
      error = retry.error;
    }

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to deactivate agent";
    return { success: false, error: msg };
  }
}

export async function deleteReferralAgentAction(agentId: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canDelete = isSuperAdmin || session.permissions.includes("referral.delete") || session.permissions.includes("referral.manage");
    if (!canDelete) {
      return { success: false, error: "403 Forbidden: Missing referral.delete permission." };
    }

    const supabase = createClient();

    // 1. Try atomic delete/archive RPC first
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("delete_referral_partner_atomic", {
        p_agent_id: agentId,
        p_organization_id: session.organizationId,
      });

      if (!rpcErr && rpcRes && typeof rpcRes === "object") {
        const typedRes = rpcRes as { success?: boolean; error?: string; message?: string; action?: string };
        if (typedRes.success) {
          return { success: true, message: typedRes.message };
        } else if (typedRes.error) {
          return { success: false, error: typedRes.error };
        }
      }
    } catch {
      // Fall through to client-side checks
    }

    // 2. Fallback check: If agent has active commissions
    const { data: comms } = await supabase
      .from("referral_commissions")
      .select("id")
      .eq("referral_agent_id", agentId)
      .limit(1);

    if (comms && comms.length > 0) {
      // Historical financial records exist: must archive instead of hard delete
      return deactivateReferralAgentAction(agentId);
    }

    // 3. Fallback check: patient_referral_attributions
    const { data: attributions } = await supabase
      .from("patient_referral_attributions")
      .select("id")
      .eq("referral_agent_id", agentId)
      .limit(1);

    if (attributions && attributions.length > 0) {
      return deactivateReferralAgentAction(agentId);
    }

    // 4. Delete rate history first
    await supabase.from("referral_rate_history").delete().eq("referral_agent_id", agentId);

    // 5. No financial or patient links: perform clean hard delete
    const { error: delErr } = await supabase
      .from("referral_agents")
      .delete()
      .eq("id", agentId);

    if (delErr) {
      // Fallback to deactivation if RLS or foreign key restricts delete
      return deactivateReferralAgentAction(agentId);
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete referral agent";
    return { success: false, error: msg };
  }
}

export async function getReferralCommissionsAction(filters?: {
  agentId?: string;
  settlementStatus?: string;
  limit?: number;
}): Promise<{ success: boolean; data?: ReferralCommission[]; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    let query = supabase
      .from("referral_commissions")
      .select("*, invoices(invoice_number, grand_total, status), patients(full_name, patient_code)")
      .order("created_at", { ascending: false })
      .limit(filters?.limit || 100);

    if (filters?.agentId) {
      query = query.eq("referral_agent_id", filters.agentId);
    }
    if (filters?.settlementStatus && filters.settlementStatus !== "ALL") {
      query = query.eq("settlement_status", filters.settlementStatus);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data: (data as ReferralCommission[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load commission ledger";
    return { success: false, error: msg };
  }
}

export async function settleReferralCommissionsAction(params: {
  agentId: string;
  commissionIds: string[];
  paymentMethod: "CASH" | "BANK_TRANSFER" | "BKASH" | "NAGAD" | "ROCKET" | "UPAY";
  transactionReference?: string;
  notes?: string;
}): Promise<{ success: boolean; settlementNumber?: string; netPaidAmount?: number; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canSettle = isSuperAdmin || session.permissions.includes("referral.commission.pay") || session.permissions.includes("referral.manage");
    if (!canSettle) {
      return { success: false, error: "403 Forbidden: Missing referral.commission.pay permission." };
    }

    if (!params.commissionIds || params.commissionIds.length === 0) {
      return { success: false, error: "Please select at least one pending commission to settle." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    const { data: res, error } = await supabase.rpc("settle_referral_commissions_atomic", {
      p_org_id: orgId,
      p_agent_id: params.agentId,
      p_commission_ids: params.commissionIds,
      p_payment_method: params.paymentMethod,
      p_transaction_reference: params.transactionReference?.trim() || null,
      p_notes: params.notes?.trim() || null,
    });

    if (error) throw error;
    const resObj = res as {
      success: boolean;
      settlement_number?: string;
      net_paid_amount?: number;
      error?: string;
    };

    if (!resObj.success) {
      return { success: false, error: resObj.error || "Failed to process commission settlement" };
    }

    return {
      success: true,
      settlementNumber: resObj.settlement_number,
      netPaidAmount: resObj.net_paid_amount,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to settle commissions";
    return { success: false, error: msg };
  }
}

export interface RecordReferralPayoutParams {
  agentId: string;
  amount: number;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "BKASH" | "NAGAD" | "ROCKET" | "UPAY";
  patientId?: string;
  patientTotalBill?: number;
  commissionRatePercent?: number;
  transactionReference?: string;
  notes?: string;
}

export async function recordReferralCommissionPayoutAction(params: RecordReferralPayoutParams): Promise<{
  success: boolean;
  settlementNumber?: string;
  expenseVoucher?: string;
  settlementId?: string;
  expenseId?: string;
  journalEntryId?: string;
  settlementStatus?: string;
  patientId?: string;
  error?: string;
}> {
  let incidentOrganizationId: string | null = null;
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canPay = isSuperAdmin
      || session.permissions.includes("referral.commission.pay")
      || session.permissions.includes("referral.manage");
    if (!canPay) {
      return { success: false, error: "403 Forbidden: Missing referral.commission.pay permission." };
    }

    if (!params.agentId) {
      return { success: false, error: "Referral partner ID is required." };
    }
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      return { success: false, error: "Payout amount must be greater than zero." };
    }

    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user || user.id !== session.userId) {
      return { success: false, error: "401 Unauthorized: Refresh your session and try again." };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    if (profileError) throw new Error("Organization profile could not be verified.");
    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId || orgId !== session.organizationId) {
      return { success: false, error: "403 Forbidden: Active organization changed. Refresh and retry." };
    }
    incidentOrganizationId = orgId;

    // Only the canonical atomic RPC may post a payout. Permission/network/schema errors
    // must never fall through to direct multi-table writes that can partially succeed.
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("record_referral_commission_payout_atomic", {
      p_org_id: orgId,
      p_agent_id: params.agentId,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod,
      p_patient_id: params.patientId || null,
      p_patient_total_bill: params.patientTotalBill ?? null,
      p_commission_rate_percent: params.commissionRatePercent ?? null,
      p_transaction_reference: params.transactionReference?.trim() || null,
      p_notes: params.notes?.trim() || (params.patientId ? "Per-patient referral commission payout" : "Referral partner commission payout"),
      p_idempotency_key: params.transactionReference?.trim() || null,
    });

    if (rpcErr) {
      if (rpcErr.code === "42501") {
        return { success: false, error: "403 Forbidden: Referral commission payout permission denied." };
      }
      throw new Error(`Referral payout failed safely; no direct-write fallback was attempted. ${rpcErr.message}`);
    }

    const payload = rpcRes as {
      success?: boolean;
      error?: string;
      settlement_number?: string;
      voucher_number?: string;
      settlement_id?: string;
      expense_id?: string;
      journal_entry_id?: string;
      settlement_status?: string;
      patient_id?: string;
    } | null;
    if (!payload?.success) {
      return {
        success: false,
        error: payload?.error || "Referral payout was not confirmed by the database.",
      };
    }

    await resolveSystemRuntimeIncident({
      organizationId: orgId,
      module: "Referral Commission & Payouts",
    });

    return {
      success: true,
      settlementNumber: payload.settlement_number,
      expenseVoucher: payload.voucher_number,
      settlementId: payload.settlement_id,
      expenseId: payload.expense_id,
      journalEntryId: payload.journal_entry_id,
      settlementStatus: payload.settlement_status,
      patientId: payload.patient_id,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record referral commission payout";
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();
        const orgId = incidentOrganizationId || profile?.organization_id;
        if (orgId) {
          await reportSystemRuntimeIncident({
            organizationId: orgId,
            module: "Referral Commission & Payouts",
            location: "lib/referrals/actions.ts:recordReferralCommissionPayoutAction",
            severity: "CRITICAL",
            errorCode: "PAYOUT_EXCEPTION",
            title: "কমিশন পে-আউট প্রক্রিয়াকরণে ত্রুটি",
            reason: msg,
            recommendation: "এজেন্টের ব্যালান্স, পেমেন্ট রেকর্ড ও জার্নাল যাচাই করুন; ব্যর্থ অনুরোধ সরাসরি পুনরাবৃত্তি না করে idempotency reference ব্যবহার করুন।",
          });
        }
      }
    } catch {}
    return { success: false, error: msg };
  }
}

export async function recordDiscretionaryCommissionPayoutAction(params: {
  agentId: string;
  amount: number;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "BKASH" | "NAGAD" | "ROCKET" | "UPAY";
  transactionReference?: string;
  notes?: string;
}): Promise<{ success: boolean; settlementNumber?: string; expenseVoucher?: string; error?: string }> {
  return recordReferralCommissionPayoutAction(params);
}

export async function getReferralSettlementsAction(agentId?: string): Promise<{
  success: boolean;
  data?: ReferralSettlement[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    let query = supabase
      .from("referral_commission_settlements")
      .select("*, referral_agents(agent_code, full_name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (agentId) {
      query = query.eq("referral_agent_id", agentId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: (data as ReferralSettlement[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load settlements";
    return { success: false, error: msg };
  }
}

export async function getReferralSummaryMetricsAction(): Promise<{
  success: boolean;
  data?: ReferralSummaryMetrics;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    const [agentsRes, commsRes, attribsRes, settlementsRes, expensesRes] = await Promise.all([
      supabase.from("referral_agents").select("id, is_active, total_commission_settled").is("archived_at", null),
      supabase.from("referral_commissions").select("commission_base_amount, commission_amount, amount_paid, amount_pending, settlement_status"),
      supabase.from("patient_referral_attributions").select("id", { count: "exact", head: true }),
      supabase.from("referral_commission_settlements").select("net_paid_amount"),
      supabase.from("expenses").select("amount, expense_type, title, status").not("status", "in", '("VOID","VOIDED")'),
    ]);

    const agents = agentsRes.data || [];
    const comms = commsRes.data || [];

    const totalAgents = agents.length;
    const activeAgents = agents.filter((a) => a.is_active).length;
    const totalReferredPatients = attribsRes.count || 0;

    let totalBilledBase = 0;
    let totalCommissionEarned = 0;
    let totalCommissionPending = 0;
    let totalCommissionSettled = 0;

    for (const c of comms) {
      if (c.settlement_status !== "CANCELLED" && c.settlement_status !== "REVERSED") {
        totalBilledBase += Number(c.commission_base_amount || 0);
        totalCommissionEarned += Number(c.commission_amount || 0);
        totalCommissionPending += Number(c.amount_pending || 0);
        totalCommissionSettled += Number(c.amount_paid || 0);
      }
    }

    const settlementsSum = (settlementsRes.data || []).reduce((acc, s) => acc + Number(s.net_paid_amount || 0), 0);
    const agentSettledSum = agents.reduce((acc, a) => acc + Number(a.total_commission_settled || 0), 0);
    const referralExpensesSum = (expensesRes.data || [])
      .filter((e) => (e.expense_type || "").toUpperCase().includes("MARKETING") || (e.title || "").toLowerCase().includes("referral"))
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);
    totalCommissionSettled = Math.max(totalCommissionSettled, settlementsSum, agentSettledSum, referralExpensesSum);

    return {
      success: true,
      data: {
        totalAgents,
        activeAgents,
        totalReferredPatients,
        totalBilledBase: Math.round(totalBilledBase * 100) / 100,
        totalCommissionEarned: Math.round(totalCommissionEarned * 100) / 100,
        totalCommissionPending: Math.round(totalCommissionPending * 100) / 100,
        totalCommissionSettled: Math.round(totalCommissionSettled * 100) / 100,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load summary metrics";
    return { success: false, error: msg };
  }
}

export async function approveCommissionAction(
  commissionId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    const { data: res, error } = await supabase.rpc("approve_referral_commission_atomic", {
      p_org_id: orgId,
      p_commission_id: commissionId,
      p_notes: notes?.trim() || null,
    });

    if (error) throw error;
    const resObj = res as { success: boolean; error?: string };
    if (!resObj.success) {
      return { success: false, error: resObj.error || "Failed to approve commission" };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to approve commission";
    return { success: false, error: msg };
  }
}

export async function rejectCommissionAction(
  commissionId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!reason || reason.trim().length < 3) {
      return { success: false, error: "Rejection reason is required (minimum 3 characters)." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    const { data: res, error } = await supabase.rpc("reject_referral_commission_atomic", {
      p_org_id: orgId,
      p_commission_id: commissionId,
      p_reason: reason.trim(),
    });

    if (error) throw error;
    const resObj = res as { success: boolean; error?: string };
    if (!resObj.success) {
      return { success: false, error: resObj.error || "Failed to reject commission" };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reject commission";
    return { success: false, error: msg };
  }
}

/**
 * Auto-lookup active referral attribution for a patient/admission for Billing
 */
export async function getPatientReferralAttributionAction(
  patientId: string,
  visitId?: string
): Promise<{
  success: boolean;
  data?: {
    attributionId?: string;
    referralAgentId: string;
    agentCode: string;
    fullName: string;
    agentType: string;
    commissionRatePercent: number;
    source: "ADMISSION" | "REGISTRATION";
    isEligible: boolean;
    visitId?: string | null;
  } | null;
  error?: string;
}> {
  try {
    if (!patientId || !patientId.trim()) {
      return { success: true, data: null };
    }

    const supabase = createClient();

    // 1. Try atomic RPC lookup
    const { data: rpcRes, error: rpcErr } = await supabase.rpc(
      "get_patient_referral_attribution_for_billing",
      {
        p_patient_id: patientId.trim(),
        p_visit_id: visitId?.trim() || null,
      }
    );

    if (!rpcErr && rpcRes && typeof rpcRes === "object") {
      const parsed = rpcRes as {
        success?: boolean;
        found?: boolean;
        attribution_id?: string;
        referral_agent_id?: string;
        agent_code?: string;
        full_name?: string;
        agent_type?: string;
        commission_rate_percent?: number;
        is_commission_eligible?: boolean;
        source?: "ADMISSION" | "REGISTRATION";
        visit_id?: string | null;
        error?: string;
      };

      if (parsed.success && parsed.found && parsed.referral_agent_id) {
        return {
          success: true,
          data: {
            attributionId: parsed.attribution_id,
            referralAgentId: parsed.referral_agent_id,
            agentCode: parsed.agent_code || "",
            fullName: parsed.full_name || "",
            agentType: parsed.agent_type || "DOCTOR",
            commissionRatePercent: Number(parsed.commission_rate_percent || 10),
            source: parsed.source || (parsed.visit_id ? "ADMISSION" : "REGISTRATION"),
            isEligible: parsed.is_commission_eligible !== false,
            visitId: parsed.visit_id || null,
          },
        };
      }

      if (parsed.success && !parsed.found) {
        return { success: true, data: null };
      }
    }

    // 2. Direct fallback query
    if (visitId?.trim()) {
      const { data: vData } = await supabase
        .from("patient_referral_attributions")
        .select("*, referral_agents(*)")
        .eq("visit_id", visitId.trim())
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (vData && vData.referral_agent_id) {
        const agent = vData.referral_agents as ReferralAgent | null;
        return {
          success: true,
          data: {
            attributionId: vData.id,
            referralAgentId: vData.referral_agent_id,
            agentCode: agent?.agent_code || vData.referral_code_snapshot || "",
            fullName: agent?.full_name || vData.referral_name_snapshot || "",
            agentType: agent?.agent_type || "DOCTOR",
            commissionRatePercent: Number(agent?.commission_rate_percent || 10),
            source: "ADMISSION",
            isEligible: agent?.is_commission_eligible !== false,
            visitId: vData.visit_id,
          },
        };
      }
    }

    const { data: directData, error: dirErr } = await supabase
      .from("patient_referral_attributions")
      .select("*, referral_agents(*)")
      .eq("patient_id", patientId.trim())
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dirErr) throw dirErr;

    if (directData && directData.referral_agent_id) {
      const agent = directData.referral_agents as ReferralAgent | null;
      return {
        success: true,
        data: {
          attributionId: directData.id,
          referralAgentId: directData.referral_agent_id,
          agentCode: agent?.agent_code || directData.referral_code_snapshot || "",
          fullName: agent?.full_name || directData.referral_name_snapshot || "",
          agentType: agent?.agent_type || "DOCTOR",
          commissionRatePercent: Number(agent?.commission_rate_percent || 10),
          source: directData.visit_id ? "ADMISSION" : "REGISTRATION",
          isEligible: agent?.is_commission_eligible !== false,
          visitId: directData.visit_id,
        },
      };
    }

    return { success: true, data: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load patient referral attribution";
    return { success: false, error: msg };
  }
}

/**
 * Authoritative referral agent search for Billing checkout with commission rates
 */
export async function searchReferralAgentsForBillingAction(query?: string): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    agent_code: string;
    full_name: string;
    agent_type: string;
    phone: string;
    commission_rate_percent: number;
    is_commission_eligible: boolean;
  }>;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canAccess =
      isSuperAdmin ||
      session.permissions.includes("referral.assign") ||
      session.permissions.includes("referral.view") ||
      session.permissions.includes("referral.create") ||
      session.permissions.includes("referral.manage") ||
      session.permissions.includes("billing.create") ||
      session.permissions.includes("billing.view");
    if (!canAccess) {
      return { success: false, error: "403 Forbidden: Missing referral or billing permission." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    // 1. Try search_referral_agents_for_billing RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc("search_referral_agents_for_billing", {
      p_org_id: orgId,
      p_query: query || null,
    });

    if (!rpcErr && rpcData) {
      return {
        success: true,
        data: (rpcData as Array<{
          id: string;
          agent_code: string;
          full_name: string;
          agent_type: string;
          phone: string;
          commission_rate_percent: number;
          is_commission_eligible: boolean;
        }>),
      };
    }

    // 2. Fallback to direct query on referral_agents table
    let q = supabase
      .from("referral_agents")
      .select("id, agent_code, full_name, agent_type, phone, commission_rate_percent, is_commission_eligible")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .limit(50);

    if (query?.trim()) {
      const trimmed = query.trim();
      q = q.or(`agent_code.ilike.%${trimmed}%,full_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`);
    }

    const { data: fallbackData, error: fbErr } = await q;
    if (fbErr) {
      // 3. Fallback to safe search_active_referral_agents RPC if direct table select is restricted
      const { data: safeAgents } = await supabase.rpc("search_active_referral_agents", {
        p_org_id: orgId,
        p_query: query || null,
      });

      return {
        success: true,
        data: ((safeAgents || []) as Array<{ id: string; agent_code: string; full_name: string; agent_type: string; phone: string }>).map((a) => ({
          ...a,
          commission_rate_percent: 10,
          is_commission_eligible: true,
        })),
      };
    }

    return {
      success: true,
      data: (fallbackData || []).map((r) => ({
        id: r.id,
        agent_code: r.agent_code,
        full_name: r.full_name,
        agent_type: r.agent_type,
        phone: r.phone,
        commission_rate_percent: Number(r.commission_rate_percent || 10),
        is_commission_eligible: r.is_commission_eligible !== false,
      })),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to search referral agents for billing";
    return { success: false, error: msg };
  }
}

export interface ReferralPerformanceSummary {
  total_referred_patients: number;
  total_admissions: number;
  opd_referrals: number;
  ipd_referrals: number;
  critical_care_referrals: number;
  gross_revenue: number;
  total_discount: number;
  net_revenue: number;
  commission_earned: number;
  commission_approved: number;
  commission_paid: number;
  commission_outstanding: number;
}

export interface ReferralMonthlyPerformance {
  year_month: string;
  year: number;
  month: number;
  month_name: string;
  referred_patients: number;
  gross_revenue: number;
  discount_amount: number;
  net_revenue: number;
  commission_earned: number;
  commission_paid: number;
}

export interface ReferralYearlyPerformance {
  year: number;
  referred_patients: number;
  gross_revenue: number;
  discount_amount: number;
  net_revenue: number;
  commission_earned: number;
  commission_paid: number;
}

export interface ReferralTopAgent {
  agent_id: string;
  agent_code: string;
  full_name: string;
  agent_type: string;
  patient_count: number;
  net_revenue: number;
  commission_earned: number;
  commission_paid: number;
  compliance_approved: boolean;
  bmdc_ethics_acknowledged: boolean;
}

export interface ReferralPerformanceAnalyticsData {
  time_window: { start: string; end: string };
  summary: ReferralPerformanceSummary;
  monthly: ReferralMonthlyPerformance[];
  yearly: ReferralYearlyPerformance[];
  top_agents: ReferralTopAgent[];
}

export interface SafeReferralAgent {
  id: string;
  agent_code: string;
  full_name: string;
  agent_type: string;
  phone: string;
  email?: string | null;
  is_active: boolean;
  compliance_approved: boolean;
  bmdc_ethics_acknowledged: boolean;
  created_at: string;
}

export async function getReferralPerformanceAnalyticsAction(params?: {
  agentId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  success: boolean;
  data?: ReferralPerformanceAnalyticsData;
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    const { data, error } = await supabase.rpc("get_referral_performance_analytics", {
      p_org_id: orgId,
      p_agent_id: params?.agentId || null,
      p_start_date: params?.startDate || null,
      p_end_date: params?.endDate || null,
    });

    if (error) throw error;
    return {
      success: true,
      data: data as ReferralPerformanceAnalyticsData,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load referral performance analytics";
    return { success: false, error: msg };
  }
}

export async function getReferralAgentsSafeDirectoryAction(query?: string): Promise<{
  success: boolean;
  data?: SafeReferralAgent[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    const isSuperAdmin = session.roles.includes("super_admin");
    const canEdit = isSuperAdmin || session.permissions.includes("referral.edit") || session.permissions.includes("referral.manage");
    if (!canEdit) {
      return { success: false, error: "403 Forbidden: Missing referral.edit permission." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.active_organization_id || profile?.organization_id;
    if (!orgId) throw new Error("Organization profile not resolved");

    const { data, error } = await supabase.rpc("get_referral_agents_safe_directory", {
      p_org_id: orgId,
      p_query: query?.trim() || null,
    });

    if (error) throw error;
    return {
      success: true,
      data: (data || []) as SafeReferralAgent[],
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load referral directory";
    return { success: false, error: msg };
  }
}

