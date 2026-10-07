"use client";

import { createClient } from "@/lib/supabase/client";

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

// -------------------------------------------------------------------------------------
// Actions
// -------------------------------------------------------------------------------------

export async function getReferralAgentsAction(): Promise<{
  success: boolean;
  data?: ReferralAgent[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("referral_agents")
      .select("*")
      .is("archived_at", null)
      .order("full_name", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as ReferralAgent[]) || [] };
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
  };
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data: agent, error: aErr } = await supabase
      .from("referral_agents")
      .select("*")
      .eq("id", agentId)
      .single();

    if (aErr || !agent) throw aErr || new Error("Referral agent not found");

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
        .select("*")
        .eq("referral_agent_id", agentId)
        .order("assigned_at", { ascending: false })
        .limit(100),
    ]);

    return {
      success: true,
      data: {
        agent: agent as ReferralAgent,
        commissions: (commissionsRes.data as ReferralCommission[]) || [],
        settlements: (settlementsRes.data as ReferralSettlement[]) || [],
        rateHistory: (ratesRes.data as ReferralRateHistory[]) || [],
        attributions: (attribRes.data as ReferralAttribution[]) || [],
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
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
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
  notes?: string;
  agent_code?: string; // Kept for backward compatibility
}): Promise<{ success: boolean; data?: ReferralAgent; error?: string }> {
  try {
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
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
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
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
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
  phone: string;
  email?: string;
  address?: string;
  professionalRegistrationNo?: string;
  isCommissionEligible?: boolean;
  complianceApproved?: boolean;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("referral_agents")
      .update({
        full_name: params.fullName.trim(),
        phone: params.phone.trim(),
        email: params.email?.trim() || null,
        address: params.address?.trim() || null,
        professional_registration_no: params.professionalRegistrationNo?.trim() || null,
        is_commission_eligible: params.isCommissionEligible ?? true,
        compliance_approved: params.complianceApproved ?? true,
        notes: params.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.agentId);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update agent profile";
    return { success: false, error: msg };
  }
}

export async function deactivateReferralAgentAction(agentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    // Safe archival / deactivation to preserve financial invariants
    const { error } = await supabase
      .from("referral_agents")
      .update({
        is_active: false,
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to deactivate agent";
    return { success: false, error: msg };
  }
}

export async function getReferralCommissionsAction(filters?: {
  agentId?: string;
  settlementStatus?: string;
  limit?: number;
}): Promise<{ success: boolean; data?: ReferralCommission[]; error?: string }> {
  try {
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
    if (!params.commissionIds || params.commissionIds.length === 0) {
      return { success: false, error: "Please select at least one pending commission to settle." };
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
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

export async function getReferralSettlementsAction(agentId?: string): Promise<{
  success: boolean;
  data?: ReferralSettlement[];
  error?: string;
}> {
  try {
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
    const supabase = createClient();
    const [agentsRes, commsRes, attribsRes] = await Promise.all([
      supabase.from("referral_agents").select("id, is_active").is("archived_at", null),
      supabase.from("referral_commissions").select("commission_base_amount, commission_amount, amount_paid, amount_pending, settlement_status"),
      supabase.from("patient_referral_attributions").select("id", { count: "exact", head: true }),
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
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
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
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
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
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.organization_id;
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

