"use client";

import { createClient } from "@/lib/supabase/client";

export interface DaycareAdmission {
  id: string;
  admission_number: string;
  patient_id: string;
  procedure_name: string;
  admitted_at: string;
  discharged_at: string | null;
  status: "ADMITTED" | "DISCHARGED" | "TRANSFERRED_IPD";
  created_at: string;
  patients?: {
    full_name: string;
    patient_code: string;
  };
}

export async function getDaycareAdmissionsAction(): Promise<{
  success: boolean;
  data?: DaycareAdmission[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("daycare_admissions")
      .select(`
        *,
        patients (full_name, patient_code)
      `)
      .order("admitted_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as DaycareAdmission[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load daycare admissions";
    return { success: false, error: msg };
  }
}
