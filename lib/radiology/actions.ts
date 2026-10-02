import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit/logger";

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
    phone?: string;
    gender?: string;
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
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    await requirePermission(PERMISSIONS.RADIOLOGY_VIEW);

    const supabase = createClient();
    let query = supabase
      .from("radiology_studies")
      .select("*, patients(id, patient_code, full_name, phone, gender), radiology_modalities(id, modality_name, modality_code)")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false });

    if (modalityCode && modalityCode !== "ALL") {
      query = query.eq("radiology_modalities.modality_code", modalityCode);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[RadiologyActions] getRadiologyStudiesAction DB error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []) as RadiologyStudy[] };
  } catch (err: unknown) {
    console.error("[RadiologyActions] getRadiologyStudiesAction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load radiology studies",
    };
  }
}

export async function createRadiologyStudyAction(payload: {
  patient_id: string;
  modality_code: "XRAY" | "CT" | "MRI" | "USG" | "ECG" | "ECHO";
  study_name: string;
  clinical_indication?: string;
  patient_name?: string;
  patient_code?: string;
  patient_phone?: string;
  patient_gender?: string;
}): Promise<{ success: boolean; data?: RadiologyStudy; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    await requirePermission(PERMISSIONS.RADIOLOGY_MANAGE);

    const orgId = session.organizationId;
    const userId = session.userId;
    const supabase = createClient();

    // Verify patient exists and belongs to active organization
    const { data: patient, error: patErr } = await supabase
      .from("patients")
      .select("id, patient_code, full_name, phone, gender")
      .eq("id", payload.patient_id)
      .eq("organization_id", orgId)
      .single();

    if (patErr || !patient) {
      return { success: false, error: "Patient not found or unauthorized tenant." };
    }

    const { data: inserted, error } = await supabase
      .from("radiology_studies")
      .insert({
        organization_id: orgId,
        patient_id: payload.patient_id,
        modality_id: `mod-${payload.modality_code.toLowerCase()}-01`,
        study_name: payload.study_name,
        clinical_indication: payload.clinical_indication,
        requested_by: userId,
        status: "scheduled",
      })
      .select()
      .single();

    if (error || !inserted) {
      return { success: false, error: error?.message || "Failed to order imaging study." };
    }

    const studyId = inserted.id;
    const newStudy: RadiologyStudy = {
      id: studyId,
      organization_id: orgId,
      patient_id: payload.patient_id,
      modality_id: `mod-${payload.modality_code.toLowerCase()}-01`,
      requested_by: userId,
      study_name: payload.study_name,
      clinical_indication: payload.clinical_indication,
      status: "scheduled",
      created_at: inserted.created_at || new Date().toISOString(),
      patients: {
        id: patient.id,
        patient_code: patient.patient_code,
        full_name: patient.full_name,
        phone: patient.phone,
        gender: patient.gender,
      },
      radiology_modalities: {
        id: `mod-${payload.modality_code.toLowerCase()}-01`,
        modality_name: `${payload.modality_code} Diagnostic Suite`,
        modality_code: payload.modality_code,
      },
    };

    await recordAuditLog({
      organizationId: orgId,
      userId: userId,
      action: "CREATE",
      module: "CLINICAL",
      entityType: "radiology_study",
      entityId: studyId,
      newValues: {
        studyName: payload.study_name,
        modalityCode: payload.modality_code,
        patientId: payload.patient_id,
      },
    });

    return { success: true, data: newStudy };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to order imaging study.";
    return { success: false, error: msg };
  }
}

export async function approveRadiologyReportAction(payload: {
  study_id: string;
  findings: string;
  impression: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!payload.findings || payload.findings.trim().length < 5) {
      return { success: false, error: "Radiological findings must be documented (at least 5 characters)." };
    }
    if (!payload.impression || payload.impression.trim().length < 3) {
      return { success: false, error: "Diagnostic impression is required for consultant report sign-off." };
    }

    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }
    await requirePermission(PERMISSIONS.RADIOLOGY_MANAGE);

    const orgId = session.organizationId;
    const radiologistId = session.userId;
    const supabase = createClient();

    const { error: updateErr } = await supabase
      .from("radiology_studies")
      .update({
        findings: payload.findings.trim(),
        impression: payload.impression.trim(),
        radiologist_id: radiologistId,
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", payload.study_id)
      .eq("organization_id", orgId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await recordAuditLog({
      organizationId: orgId,
      userId: radiologistId,
      action: "UPDATE",
      module: "CLINICAL",
      entityType: "radiology_study",
      entityId: payload.study_id,
      newValues: {
        status: "approved",
        findings: payload.findings.trim(),
        impression: payload.impression.trim(),
      },
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to approve radiology report.";
    return { success: false, error: msg };
  }
}
