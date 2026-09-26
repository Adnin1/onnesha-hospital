"use client";

import { createClient } from "@/lib/supabase/client";

export interface ScholarshipApplication {
  id: string;
  application_number: string;
  patient_id: string;
  fund_id: string;
  requested_amount: number;
  approved_amount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "DISBURSED";
  created_at: string;
  patients?: {
    full_name: string;
    patient_code: string;
  };
  welfare_funds?: {
    fund_name: string;
    donor_sponsor: string | null;
  };
}

export async function getScholarshipApplicationsAction(): Promise<{
  success: boolean;
  data?: ScholarshipApplication[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("scholarship_applications")
      .select(`
        *,
        patients (full_name, patient_code),
        welfare_funds (fund_name, donor_sponsor)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as ScholarshipApplication[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load scholarship applications";
    return { success: false, error: msg };
  }
}
