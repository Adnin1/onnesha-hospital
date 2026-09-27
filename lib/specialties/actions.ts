import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";

export interface DentalExaminationRecord {
  id: string;
  organization_id: string;
  exam_code: string;
  patient_id: string;
  appointment_id?: string | null;
  doctor_id?: string | null;
  chief_complaint: string;
  tooth_number?: string | null;
  dental_findings: {
    caries?: boolean;
    plaque?: boolean;
    calculus?: boolean;
    gingivitis?: boolean;
    pocket_depth_mm?: number;
    mobility?: string;
  };
  diagnosis: string;
  procedure_done?: string | null;
  procedure_fee: number;
  prescription_notes?: string | null;
  follow_up_date?: string | null;
  billing_invoice_id?: string | null;
  status: "draft" | "completed" | "cancelled";
  created_at: string;
  patients?: {
    id: string;
    full_name: string;
    patient_code: string;
    phone?: string;
  };
}

export interface EyeExaminationRecord {
  id: string;
  organization_id: string;
  exam_code: string;
  patient_id: string;
  appointment_id?: string | null;
  doctor_id?: string | null;
  chief_complaint: string;
  visual_acuity_od?: string | null;
  visual_acuity_os?: string | null;
  intraocular_pressure_od?: number | null;
  intraocular_pressure_os?: number | null;
  refraction: {
    od_sph?: string;
    od_cyl?: string;
    od_axis?: string;
    os_sph?: string;
    os_cyl?: string;
    os_axis?: string;
  };
  fundus_findings?: string | null;
  diagnosis: string;
  procedure_done?: string | null;
  procedure_fee: number;
  prescription_notes?: string | null;
  follow_up_date?: string | null;
  billing_invoice_id?: string | null;
  status: "draft" | "completed" | "cancelled";
  created_at: string;
  patients?: {
    id: string;
    full_name: string;
    patient_code: string;
    phone?: string;
  };
}

export interface PhysiotherapySessionRecord {
  id: string;
  organization_id: string;
  session_code: string;
  patient_id: string;
  appointment_id?: string | null;
  therapist_id?: string | null;
  chief_complaint: string;
  pain_score_initial?: number | null;
  pain_score_post?: number | null;
  assessment_findings: string;
  treatment_plan: string;
  session_number: number;
  total_sessions_prescribed: number;
  modalities_applied: string[];
  progress_notes?: string | null;
  session_fee: number;
  follow_up_date?: string | null;
  billing_invoice_id?: string | null;
  status: "in_progress" | "completed" | "cancelled";
  created_at: string;
  patients?: {
    id: string;
    full_name: string;
    patient_code: string;
    phone?: string;
  };
}

// -------------------------------------------------------------
// DENTAL ACTIONS
// -------------------------------------------------------------

export async function getDentalExaminationsAction(patientId?: string): Promise<{
  success: boolean;
  data?: DentalExaminationRecord[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    let query = supabase
      .from("dental_examinations")
      .select("*, patients (id, full_name, patient_code, phone)")
      .order("created_at", { ascending: false });

    if (patientId) {
      query = query.eq("patient_id", patientId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: (data as DentalExaminationRecord[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load dental examinations";
    return { success: false, error: msg };
  }
}

export async function createDentalExaminationAction(params: {
  patient_id: string;
  appointment_id?: string | null;
  doctor_id?: string | null;
  chief_complaint: string;
  tooth_number?: string | null;
  dental_findings?: Record<string, unknown>;
  diagnosis: string;
  procedure_done?: string | null;
  procedure_fee?: number;
  prescription_notes?: string | null;
  follow_up_date?: string | null;
}): Promise<{
  success: boolean;
  data?: DentalExaminationRecord;
  error?: string;
}> {
  try {
    if (!params.patient_id) return { success: false, error: "Patient ID is required" };
    if (!params.chief_complaint?.trim()) return { success: false, error: "Chief complaint is required" };
    if (!params.diagnosis?.trim()) return { success: false, error: "Diagnosis is required" };

    const supabase = createClient();
    const session = await getCurrentUserSession();
    if (!session.organizationId) return { success: false, error: "401 Unauthorized" };
    const orgId = session.organizationId;

    const examCode = `DENT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const { data, error } = await supabase
      .from("dental_examinations")
      .insert({
        organization_id: orgId,
        exam_code: examCode,
        patient_id: params.patient_id,
        appointment_id: params.appointment_id || null,
        doctor_id: params.doctor_id || null,
        chief_complaint: params.chief_complaint.trim(),
        tooth_number: params.tooth_number?.trim() || null,
        dental_findings: params.dental_findings || {},
        diagnosis: params.diagnosis.trim(),
        procedure_done: params.procedure_done?.trim() || null,
        procedure_fee: params.procedure_fee !== undefined ? Math.max(0, params.procedure_fee) : 0,
        prescription_notes: params.prescription_notes?.trim() || null,
        follow_up_date: params.follow_up_date || null,
        status: "completed",
      })
      .select("*, patients (id, full_name, patient_code, phone)")
      .single();

    if (error) throw error;
    return { success: true, data: data as DentalExaminationRecord };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record dental examination";
    return { success: false, error: msg };
  }
}

// -------------------------------------------------------------
// EYE / OPHTHALMOLOGY ACTIONS
// -------------------------------------------------------------

export async function getEyeExaminationsAction(patientId?: string): Promise<{
  success: boolean;
  data?: EyeExaminationRecord[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    let query = supabase
      .from("eye_examinations")
      .select("*, patients (id, full_name, patient_code, phone)")
      .order("created_at", { ascending: false });

    if (patientId) {
      query = query.eq("patient_id", patientId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: (data as EyeExaminationRecord[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load eye examinations";
    return { success: false, error: msg };
  }
}

export async function createEyeExaminationAction(params: {
  patient_id: string;
  appointment_id?: string | null;
  doctor_id?: string | null;
  chief_complaint: string;
  visual_acuity_od?: string | null;
  visual_acuity_os?: string | null;
  intraocular_pressure_od?: number | null;
  intraocular_pressure_os?: number | null;
  refraction?: Record<string, unknown>;
  fundus_findings?: string | null;
  diagnosis: string;
  procedure_done?: string | null;
  procedure_fee?: number;
  prescription_notes?: string | null;
  follow_up_date?: string | null;
}): Promise<{
  success: boolean;
  data?: EyeExaminationRecord;
  error?: string;
}> {
  try {
    if (!params.patient_id) return { success: false, error: "Patient ID is required" };
    if (!params.chief_complaint?.trim()) return { success: false, error: "Chief complaint is required" };
    if (!params.diagnosis?.trim()) return { success: false, error: "Diagnosis is required" };

    const supabase = createClient();
    const session = await getCurrentUserSession();
    if (!session.organizationId) return { success: false, error: "401 Unauthorized" };
    const orgId = session.organizationId;

    const examCode = `EYE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const { data, error } = await supabase
      .from("eye_examinations")
      .insert({
        organization_id: orgId,
        exam_code: examCode,
        patient_id: params.patient_id,
        appointment_id: params.appointment_id || null,
        doctor_id: params.doctor_id || null,
        chief_complaint: params.chief_complaint.trim(),
        visual_acuity_od: params.visual_acuity_od?.trim() || null,
        visual_acuity_os: params.visual_acuity_os?.trim() || null,
        intraocular_pressure_od: params.intraocular_pressure_od || null,
        intraocular_pressure_os: params.intraocular_pressure_os || null,
        refraction: params.refraction || {},
        fundus_findings: params.fundus_findings?.trim() || null,
        diagnosis: params.diagnosis.trim(),
        procedure_done: params.procedure_done?.trim() || null,
        procedure_fee: params.procedure_fee !== undefined ? Math.max(0, params.procedure_fee) : 0,
        prescription_notes: params.prescription_notes?.trim() || null,
        follow_up_date: params.follow_up_date || null,
        status: "completed",
      })
      .select("*, patients (id, full_name, patient_code, phone)")
      .single();

    if (error) throw error;
    return { success: true, data: data as EyeExaminationRecord };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record eye examination";
    return { success: false, error: msg };
  }
}

// -------------------------------------------------------------
// PHYSIOTHERAPY ACTIONS
// -------------------------------------------------------------

export async function getPhysiotherapySessionsAction(patientId?: string): Promise<{
  success: boolean;
  data?: PhysiotherapySessionRecord[];
  error?: string;
}> {
  try {
    const supabase = createClient();
    let query = supabase
      .from("physiotherapy_sessions")
      .select("*, patients (id, full_name, patient_code, phone)")
      .order("created_at", { ascending: false });

    if (patientId) {
      query = query.eq("patient_id", patientId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: (data as PhysiotherapySessionRecord[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load physiotherapy sessions";
    return { success: false, error: msg };
  }
}

export async function createPhysiotherapySessionAction(params: {
  patient_id: string;
  appointment_id?: string | null;
  therapist_id?: string | null;
  chief_complaint: string;
  pain_score_initial?: number | null;
  pain_score_post?: number | null;
  assessment_findings: string;
  treatment_plan: string;
  session_number?: number;
  total_sessions_prescribed?: number;
  modalities_applied?: string[];
  progress_notes?: string | null;
  session_fee?: number;
  follow_up_date?: string | null;
}): Promise<{
  success: boolean;
  data?: PhysiotherapySessionRecord;
  error?: string;
}> {
  try {
    if (!params.patient_id) return { success: false, error: "Patient ID is required" };
    if (!params.chief_complaint?.trim()) return { success: false, error: "Chief complaint is required" };
    if (!params.assessment_findings?.trim()) return { success: false, error: "Assessment findings required" };
    if (!params.treatment_plan?.trim()) return { success: false, error: "Treatment plan is required" };

    const supabase = createClient();
    const session = await getCurrentUserSession();
    if (!session.organizationId) return { success: false, error: "401 Unauthorized" };
    const orgId = session.organizationId;

    const sessionCode = `PT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const sessionNum = params.session_number && params.session_number > 0 ? params.session_number : 1;
    const totalPrescribed = params.total_sessions_prescribed && params.total_sessions_prescribed >= sessionNum ? params.total_sessions_prescribed : sessionNum;

    const { data, error } = await supabase
      .from("physiotherapy_sessions")
      .insert({
        organization_id: orgId,
        session_code: sessionCode,
        patient_id: params.patient_id,
        appointment_id: params.appointment_id || null,
        therapist_id: params.therapist_id || null,
        chief_complaint: params.chief_complaint.trim(),
        pain_score_initial: params.pain_score_initial !== undefined ? params.pain_score_initial : null,
        pain_score_post: params.pain_score_post !== undefined ? params.pain_score_post : null,
        assessment_findings: params.assessment_findings.trim(),
        treatment_plan: params.treatment_plan.trim(),
        session_number: sessionNum,
        total_sessions_prescribed: totalPrescribed,
        modalities_applied: params.modalities_applied || [],
        progress_notes: params.progress_notes?.trim() || null,
        session_fee: params.session_fee !== undefined ? Math.max(0, params.session_fee) : 0,
        follow_up_date: params.follow_up_date || null,
        status: "completed",
      })
      .select("*, patients (id, full_name, patient_code, phone)")
      .single();

    if (error) throw error;
    return { success: true, data: data as PhysiotherapySessionRecord };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record physiotherapy session";
    return { success: false, error: msg };
  }
}
