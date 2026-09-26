"use client";

import { createClient } from "@/lib/supabase/client";

export interface DoctorAccount {
  id: string;
  doctor_id: string;
  total_consultation_earnings: number;
  total_surgery_earnings: number;
  total_settled: number;
  current_payable: number;
  last_settlement_at: string | null;
  profiles?: {
    id: string;
    full_name: string;
    phone: string;
    specialization: string;
  };
}

export interface DoctorFeeSettlement {
  id: string;
  settlement_number: string;
  doctor_id: string;
  amount: number;
  settlement_date: string;
  payment_mode: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "MFS";
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string;
  };
}

export async function getDoctorAccountsAction(): Promise<{
  success: boolean;
  data?: DoctorAccount[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("doctor_accounts")
      .select(`
        *,
        profiles:doctor_id (id, full_name, phone, specialization)
      `)
      .order("current_payable", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as DoctorAccount[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load doctor accounts";
    return { success: false, error: msg };
  }
}

export async function settleDoctorFeeAction(params: {
  doctor_id: string;
  amount: number;
  payment_mode: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "MFS";
  reference_number?: string;
  notes?: string;
}): Promise<{ success: boolean; data?: DoctorFeeSettlement; error?: string }> {
  try {
    if (!params.doctor_id) return { success: false, error: "Doctor is required" };
    if (params.amount <= 0) return { success: false, error: "Settlement amount must be positive" };

    const supabase = createClient();
    const { data: userProfile } = await supabase.auth.getUser();
    if (!userProfile?.user) return { success: false, error: "Authentication required" };

    const settlementNum = `SETTLE-${Date.now().toString().slice(-6)}`;

    const { data, error } = await supabase
      .from("doctor_fee_settlements")
      .insert({
        settlement_number: settlementNum,
        doctor_id: params.doctor_id,
        amount: params.amount,
        payment_mode: params.payment_mode,
        reference_number: params.reference_number?.trim() || null,
        settled_by: userProfile.user.id,
        notes: params.notes?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Update doctor account balances
    const { data: acc } = await supabase
      .from("doctor_accounts")
      .select("total_settled, current_payable")
      .eq("doctor_id", params.doctor_id)
      .single();

    if (acc) {
      await supabase
        .from("doctor_accounts")
        .update({
          total_settled: Number(acc.total_settled) + params.amount,
          current_payable: Math.max(0, Number(acc.current_payable) - params.amount),
          last_settlement_at: new Date().toISOString(),
        })
        .eq("doctor_id", params.doctor_id);
    }

    return { success: true, data: data as DoctorFeeSettlement };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to execute doctor fee settlement";
    return { success: false, error: msg };
  }
}
