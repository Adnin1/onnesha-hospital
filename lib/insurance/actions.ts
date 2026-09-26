"use client";

import { createClient } from "@/lib/supabase/client";

export interface InsuranceClaim {
  id: string;
  claim_number: string;
  payer_id: string;
  patient_id: string;
  invoice_id: string;
  claim_amount: number;
  approved_amount: number;
  status: "SUBMITTED" | "PRE_AUTHORIZED" | "APPROVED" | "DISBURSED" | "REJECTED";
  created_at: string;
  insurance_payers?: {
    payer_name: string;
    payer_code: string;
  };
  patients?: {
    full_name: string;
    patient_code: string;
  };
}

export async function getInsuranceClaimsAction(): Promise<{
  success: boolean;
  data?: InsuranceClaim[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("insurance_claims")
      .select(`
        *,
        insurance_payers (payer_name, payer_code),
        patients (full_name, patient_code)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as InsuranceClaim[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load insurance claims";
    return { success: false, error: msg };
  }
}
