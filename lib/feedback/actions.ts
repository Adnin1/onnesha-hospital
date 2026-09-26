"use client";

import { createClient } from "@/lib/supabase/client";

export interface PatientComplaint {
  id: string;
  complaint_number: string;
  patient_id: string | null;
  subject: string;
  details: string;
  severity: "LOW" | "NORMAL" | "URGENT" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
  resolution_notes: string | null;
  created_at: string;
  patients?: {
    full_name: string;
    phone: string;
  };
}

export async function getComplaintsAction(): Promise<{
  success: boolean;
  data?: PatientComplaint[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("patient_complaints")
      .select(`
        *,
        patients (full_name, phone)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: (data as PatientComplaint[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load complaints";
    return { success: false, error: msg };
  }
}

export async function registerComplaintAction(params: {
  patient_id?: string;
  subject: string;
  details: string;
  severity: "LOW" | "NORMAL" | "URGENT" | "CRITICAL";
}): Promise<{ success: boolean; data?: PatientComplaint; error?: string }> {
  try {
    if (!params.subject.trim()) return { success: false, error: "Subject is required" };
    if (!params.details.trim()) return { success: false, error: "Details are required" };

    const supabase = createClient();

    // Server-authoritative complaint number from DB sequence
    const { data: seqData } = await supabase.rpc("generate_complaint_number");
    const complaintNum = (seqData as string) || `CMP-${crypto.randomUUID().slice(0, 8)}`;

    const { data, error } = await supabase
      .from("patient_complaints")
      .insert({
        complaint_number: complaintNum,
        patient_id: params.patient_id || null,
        subject: params.subject.trim(),
        details: params.details.trim(),
        severity: params.severity,
        status: "OPEN",
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: data as PatientComplaint };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to register complaint";
    return { success: false, error: msg };
  }
}
