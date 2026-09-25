import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";

export interface MedicalCertificate {
  id: string;
  organization_id: string;
  certificate_number: string;
  patient_id: string;
  certificate_type: "birth" | "death" | "medical_fitness" | "discharge" | "overseas_clearance";
  issued_by: string;
  issue_date: string;
  qr_verification_hash: string;
  content_payload: Record<string, unknown>;
  is_void: boolean;
  void_reason?: string;
  created_at: string;
  patients?: {
    id: string;
    patient_code: string;
    full_name: string;
  };
}

export async function getMedicalCertificatesAction(certType?: string): Promise<{
  success: boolean;
  data?: MedicalCertificate[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }

    const supabase = createClient();
    let query = supabase
      .from("medical_certificates")
      .select("*, patients(id, patient_code, full_name)")
      .eq("organization_id", session.organizationId)
      .order("issue_date", { ascending: false });

    if (certType && certType !== "ALL") {
      query = query.eq("certificate_type", certType);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as MedicalCertificate[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load certificates." };
  }
}

export async function issueMedicalCertificateAction(payload: {
  certificate_number: string;
  patient_id: string;
  certificate_type: "birth" | "death" | "medical_fitness" | "discharge" | "overseas_clearance";
  qr_verification_hash: string;
  content_payload?: Record<string, unknown>;
}): Promise<{ success: boolean; data?: MedicalCertificate; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.organizationId || !session.userId) {
      return { success: false, error: "401 Unauthorized: Valid hospital session required." };
    }
    await requirePermission("clinical.write");

    const supabase = createClient();
    const { data, error } = await supabase
      .from("medical_certificates")
      .insert({
        organization_id: session.organizationId,
        certificate_number: payload.certificate_number,
        patient_id: payload.patient_id,
        certificate_type: payload.certificate_type,
        issued_by: session.userId,
        qr_verification_hash: payload.qr_verification_hash,
        content_payload: payload.content_payload || {},
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as MedicalCertificate };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to issue certificate." };
  }
}
