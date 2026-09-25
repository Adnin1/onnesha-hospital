import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";

export interface CriticalCareUnit {
  id: string;
  organization_id: string;
  unit_name: string;
  unit_type: "ICU" | "ICCU" | "CCU" | "SICU" | "MICU" | "PICU";
  floor?: string;
  total_beds: number;
  daily_charge: number;
  is_active: boolean;
  created_at: string;
}

export interface CriticalCareAdmission {
  id: string;
  organization_id: string;
  patient_id: string;
  unit_id: string;
  bed_number: string;
  ventilator_required: boolean;
  admitting_doctor_id?: string;
  initial_diagnosis: string;
  admission_time: string;
  discharge_time?: string;
  status: "admitted" | "transferred" | "discharged" | "deceased";
  created_at: string;
  patients?: {
    id: string;
    patient_code: string;
    full_name: string;
  };
  critical_care_units?: {
    id: string;
    unit_name: string;
    unit_type: string;
  };
}

export interface CriticalCareObservation {
  id: string;
  organization_id: string;
  admission_id: string;
  recorded_by: string;
  recorded_at: string;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  spo2?: number;
  fio2?: number;
  gcs_score?: number;
  fluid_intake_ml: number;
  urine_output_ml: number;
  clinical_notes?: string;
}

export async function getCriticalCareUnitsAction(): Promise<{
  success: boolean;
  data?: CriticalCareUnit[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("critical_care_units")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("unit_type", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as CriticalCareUnit[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load units." };
  }
}

export async function getCriticalCareAdmissionsAction(unitType?: string): Promise<{
  success: boolean;
  data?: CriticalCareAdmission[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }

    const supabase = createClient();
    let query = supabase
      .from("critical_care_admissions")
      .select("*, patients(id, patient_code, full_name), critical_care_units(id, unit_name, unit_type)")
      .eq("organization_id", session.organizationId)
      .order("admission_time", { ascending: false });

    if (unitType && unitType !== "ALL") {
      query = query.eq("critical_care_units.unit_type", unitType);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as CriticalCareAdmission[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load admissions." };
  }
}

export async function createCriticalCareAdmissionAction(payload: {
  patient_id: string;
  unit_id: string;
  bed_number: string;
  initial_diagnosis: string;
  ventilator_required?: boolean;
}): Promise<{ success: boolean; data?: CriticalCareAdmission; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId || !session.userId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }
    await requirePermission("clinical.write");

    const supabase = createClient();
    const { data, error } = await supabase
      .from("critical_care_admissions")
      .insert({
        organization_id: session.organizationId,
        patient_id: payload.patient_id,
        unit_id: payload.unit_id,
        bed_number: payload.bed_number,
        initial_diagnosis: payload.initial_diagnosis,
        ventilator_required: !!payload.ventilator_required,
        admitting_doctor_id: session.userId,
        status: "admitted",
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as CriticalCareAdmission };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to create admission." };
  }
}
