import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";

export interface RadiologyModality {
  id: string;
  organization_id: string;
  modality_name: string;
  modality_code: "XRAY" | "CT" | "MRI" | "USG" | "ECG" | "ECHO";
  room_number: string;
  is_active: boolean;
  created_at: string;
}

export interface RadiologyStudy {
  id: string;
  organization_id: string;
  patient_id: string;
  modality_id: string;
  requested_by?: string;
  study_name: string;
  clinical_indication?: string;
  technician_id?: string;
  radiologist_id?: string;
  findings?: string;
  impression?: string;
  status: "scheduled" | "in_progress" | "completed" | "approved" | "delivered";
  created_at: string;
  approved_at?: string;
  patients?: {
    id: string;
    patient_code: string;
    full_name: string;
  };
  radiology_modalities?: {
    id: string;
    modality_name: string;
    modality_code: string;
  };
}

export async function getRadiologyStudiesAction(modalityCode?: string): Promise<{
  success: boolean;
  data?: RadiologyStudy[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }

    const supabase = createClient();
    let query = supabase
      .from("radiology_studies")
      .select("*, patients(id, patient_code, full_name), radiology_modalities(id, modality_name, modality_code)")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (modalityCode && modalityCode !== "ALL") {
      query = query.eq("radiology_modalities.modality_code", modalityCode);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as RadiologyStudy[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load studies." };
  }
}

export async function createRadiologyStudyAction(payload: {
  patient_id: string;
  modality_id: string;
  study_name: string;
  clinical_indication?: string;
}): Promise<{ success: boolean; data?: RadiologyStudy; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId || !session.userId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }
    await requirePermission("clinical.write");

    const supabase = createClient();
    const { data, error } = await supabase
      .from("radiology_studies")
      .insert({
        organization_id: session.organizationId,
        patient_id: payload.patient_id,
        modality_id: payload.modality_id,
        study_name: payload.study_name,
        clinical_indication: payload.clinical_indication,
        requested_by: session.userId,
        status: "scheduled",
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as RadiologyStudy };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to create study." };
  }
}
