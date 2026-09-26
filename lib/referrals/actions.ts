"use client";

import { createClient } from "@/lib/supabase/client";

export interface ReferralAgent {
  id: string;
  agent_code: string;
  full_name: string;
  agent_type: "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF";
  phone: string;
  commission_rate_opd: number;
  commission_rate_diag: number;
  commission_rate_ipd: number;
  total_commission_earned: number;
  total_commission_settled: number;
  is_active: boolean;
  created_at: string;
}

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
      .order("full_name", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data as ReferralAgent[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load referral agents";
    return { success: false, error: msg };
  }
}

export async function createReferralAgentAction(params: {
  agent_code: string;
  full_name: string;
  agent_type: "DOCTOR" | "COMMUNITY_PC" | "ORGANIZATION" | "STAFF";
  phone: string;
  commission_rate_opd?: number;
  commission_rate_diag?: number;
  commission_rate_ipd?: number;
}): Promise<{ success: boolean; data?: ReferralAgent; error?: string }> {
  try {
    if (!params.agent_code.trim()) return { success: false, error: "Agent code required" };
    if (!params.full_name.trim()) return { success: false, error: "Full name required" };
    if (!params.phone.trim()) return { success: false, error: "Phone required" };

    const supabase = createClient();
    const { data, error } = await supabase
      .from("referral_agents")
      .insert({
        agent_code: params.agent_code.trim().toUpperCase(),
        full_name: params.full_name.trim(),
        agent_type: params.agent_type,
        phone: params.phone.trim(),
        commission_rate_opd: params.commission_rate_opd || 0,
        commission_rate_diag: params.commission_rate_diag || 0,
        commission_rate_ipd: params.commission_rate_ipd || 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as ReferralAgent };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create referral agent";
    return { success: false, error: msg };
  }
}
