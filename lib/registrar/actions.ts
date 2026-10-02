import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";

export interface MedicalCertificate {
  id: string;
  organization_id: string;
  certificate_number: string;
  patient_id: string;
  certificate_type: "birth" | "death" | "medical_fitness" | "discharge" | "overseas_clearance";
  issued_by: string;
  issue_date: string;
  qr_verification_hash: string;
  content_payload: {
    doctor_name?: string;
    doctor_designation?: string;
    remarks?: string;
    fitness_status?: "FIT" | "UNFIT" | "TEMPORARILY_UNFIT";
    child_name?: string;
    father_name?: string;
    mother_name?: string;
    birth_weight_kg?: number;
    time_of_birth?: string;
    cause_of_death?: string;
    time_of_death?: string;
    destination_country?: string;
    fit_for_travel?: boolean;
    [key: string]: unknown;
  };
  is_void: boolean;
  void_reason?: string;
  created_at: string;
  patients?: {
    id: string;
    patient_code: string;
    full_name: string;
    phone?: string;
    gender?: string;
    date_of_birth?: string;
  };
}

export async function getMedicalCertificatesAction(certType?: string): Promise<{
  success: boolean;
  data?: MedicalCertificate[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.REGISTRAR_VIEW);

    const supabase = createClient();
    let query = supabase
      .from("medical_certificates")
      .select("*, patients(id, patient_code, full_name, phone, gender, date_of_birth)")
      .eq("organization_id", session.organizationId)
      .order("issue_date", { ascending: false });

    if (certType && certType !== "ALL") {
      query = query.eq("certificate_type", certType);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as MedicalCertificate[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load medical certificates.";
    return { success: false, error: msg };
  }
}

export async function issueMedicalCertificateAction(payload: {
  certificate_number: string;
  patient_id: string;
  certificate_type: "birth" | "death" | "medical_fitness" | "discharge" | "overseas_clearance";
  qr_verification_hash: string;
  content_payload?: MedicalCertificate["content_payload"];
  patient_name?: string;
  patient_code?: string;
  doctor_name?: string;
}): Promise<{ success: boolean; data?: MedicalCertificate; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    await requirePermission(PERMISSIONS.REGISTRAR_MANAGE);

    const orgId = session.organizationId;
    const userId = session.userId;

    const supabase = createClient();

    // Verify patient belongs to organization
    const { data: patient, error: patientErr } = await supabase
      .from("patients")
      .select("id, patient_code, full_name, phone, gender, date_of_birth")
      .eq("id", payload.patient_id)
      .eq("organization_id", orgId)
      .single();

    if (patientErr || !patient) {
      return { success: false, error: "Patient not found or cross-tenant access denied." };
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("medical_certificates")
      .insert({
        organization_id: orgId,
        certificate_number: payload.certificate_number,
        patient_id: payload.patient_id,
        certificate_type: payload.certificate_type,
        issued_by: userId,
        qr_verification_hash: payload.qr_verification_hash,
        content_payload: payload.content_payload || {},
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      return { success: false, error: insertErr ? insertErr.message : "Failed to issue certificate." };
    }

    const newCert: MedicalCertificate = {
      id: inserted.id,
      organization_id: orgId,
      certificate_number: payload.certificate_number,
      patient_id: payload.patient_id,
      certificate_type: payload.certificate_type,
      issued_by: payload.doctor_name || "Authorized Hospital Registrar",
      issue_date: new Date().toISOString().split("T")[0],
      qr_verification_hash: payload.qr_verification_hash,
      content_payload: payload.content_payload || {},
      is_void: false,
      created_at: inserted.created_at || new Date().toISOString(),
      patients: {
        id: patient.id,
        patient_code: patient.patient_code,
        full_name: patient.full_name,
        phone: patient.phone,
        gender: patient.gender,
        date_of_birth: patient.date_of_birth,
      },
    };

    return { success: true, data: newCert };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to issue certificate.";
    return { success: false, error: msg };
  }
}
