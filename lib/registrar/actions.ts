import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";

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

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

export const DEFAULT_MEDICAL_CERTIFICATES: MedicalCertificate[] = [
  {
    id: "cert-birth-001",
    organization_id: DEFAULT_ORG_ID,
    certificate_number: "OH-BC-202610-001",
    patient_id: "pat-baby-01",
    certificate_type: "birth",
    issued_by: "Dr. Nazmul Huda, MBBS, DGO",
    issue_date: "2026-10-01",
    qr_verification_hash: "sha256:8f4c2e6d1b9a7c3e5f2a1d0b8c7e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e",
    content_payload: {
      child_name: "Baby of Shamima Akhter",
      father_name: "Tariqul Islam",
      mother_name: "Shamima Akhter",
      birth_weight_kg: 3.2,
      time_of_birth: "04:30 AM",
      doctor_name: "Dr. Nazmul Huda",
      doctor_designation: "Consultant Gynecologist & Obstetrician",
      remarks: "Normal spontaneous vaginal delivery. Baby cry immediate, APGAR score 9/10.",
    },
    is_void: false,
    created_at: new Date().toISOString(),
    patients: {
      id: "pat-baby-01",
      patient_code: "OH-202610-0081",
      full_name: "Baby of Shamima Akhter",
      gender: "FEMALE",
      phone: "+8801711223344",
    },
  },
  {
    id: "cert-fit-002",
    organization_id: DEFAULT_ORG_ID,
    certificate_number: "OH-FC-202610-002",
    patient_id: "pat-tanvir-01",
    certificate_type: "medical_fitness",
    issued_by: "Prof. Dr. M. A. Jalil, FCPS, FRCP",
    issue_date: "2026-10-01",
    qr_verification_hash: "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    content_payload: {
      fitness_status: "FIT",
      doctor_name: "Prof. Dr. M. A. Jalil",
      doctor_designation: "Chief Medical Officer & Professor of Medicine",
      remarks: "Clinically examined and found physically and mentally sound. Free from infectious diseases.",
    },
    is_void: false,
    created_at: new Date().toISOString(),
    patients: {
      id: "pat-tanvir-01",
      patient_code: "OH-202610-0001",
      full_name: "Mohammad Tanvir Rahman",
      gender: "MALE",
      phone: "+8801712345678",
    },
  },
  {
    id: "cert-overseas-003",
    organization_id: DEFAULT_ORG_ID,
    certificate_number: "OH-OC-202610-003",
    patient_id: "pat-rokeya-02",
    certificate_type: "overseas_clearance",
    issued_by: "Dr. K. M. Rahman, MBBS, DTCD",
    issue_date: "2026-09-30",
    qr_verification_hash: "sha256:7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d",
    content_payload: {
      destination_country: "Kingdom of Saudi Arabia (KSA)",
      fit_for_travel: true,
      doctor_name: "Dr. K. M. Rahman",
      doctor_designation: "Authorized Overseas Medical Examiner",
      remarks: "CXR clear, VDRL non-reactive, HBsAg negative, Anti-HCV negative. Fit for international employment.",
    },
    is_void: false,
    created_at: new Date().toISOString(),
    patients: {
      id: "pat-rokeya-02",
      patient_code: "OH-202610-0002",
      full_name: "Begum Rokeya Khatun",
      gender: "FEMALE",
      phone: "+8801819000111",
    },
  },
  {
    id: "cert-dis-004",
    organization_id: DEFAULT_ORG_ID,
    certificate_number: "OH-DC-202609-004",
    patient_id: "pat-karim-03",
    certificate_type: "discharge",
    issued_by: "Dr. S. M. Faruq, MS (Ortho)",
    issue_date: "2026-09-29",
    qr_verification_hash: "sha256:4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
    content_payload: {
      doctor_name: "Dr. S. M. Faruq",
      doctor_designation: "Consultant Orthopedic Surgeon",
      remarks: "Underwent closed reduction and internal fixation of right tibia. Wound healthy, sutures removed. Discharged with oral analgesics.",
    },
    is_void: false,
    created_at: new Date().toISOString(),
    patients: {
      id: "pat-karim-03",
      patient_code: "OH-202609-0033",
      full_name: "Abdul Karim",
      gender: "MALE",
      phone: "+8801912888999",
    },
  },
];

export async function getMedicalCertificatesAction(certType?: string): Promise<{
  success: boolean;
  data?: MedicalCertificate[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    let query = supabase
      .from("medical_certificates")
      .select("*, patients(id, patient_code, full_name, phone, gender, date_of_birth)")
      .eq("organization_id", orgId)
      .order("issue_date", { ascending: false });

    if (certType && certType !== "ALL") {
      query = query.eq("certificate_type", certType);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      const filtered = certType && certType !== "ALL"
        ? DEFAULT_MEDICAL_CERTIFICATES.filter((c) => c.certificate_type === certType)
        : DEFAULT_MEDICAL_CERTIFICATES;
      return { success: true, data: filtered };
    }
    return { success: true, data: data as MedicalCertificate[] };
  } catch {
    const filtered = certType && certType !== "ALL"
      ? DEFAULT_MEDICAL_CERTIFICATES.filter((c) => c.certificate_type === certType)
      : DEFAULT_MEDICAL_CERTIFICATES;
    return { success: true, data: filtered };
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
    const orgId = session.organizationId || DEFAULT_ORG_ID;
    const userId = session.userId || "usr-registrar-officer";

    const supabase = createClient();
    const { data: inserted } = await supabase
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

    const certId = inserted ? inserted.id : `cert-${Date.now()}`;
    const newCert: MedicalCertificate = {
      id: certId,
      organization_id: orgId,
      certificate_number: payload.certificate_number,
      patient_id: payload.patient_id,
      certificate_type: payload.certificate_type,
      issued_by: payload.doctor_name || "Authorized Hospital Registrar",
      issue_date: new Date().toISOString().split("T")[0],
      qr_verification_hash: payload.qr_verification_hash,
      content_payload: payload.content_payload || {},
      is_void: false,
      created_at: new Date().toISOString(),
      patients: {
        id: payload.patient_id,
        patient_code: payload.patient_code || "OH-202610-0099",
        full_name: payload.patient_name || "Certified Patient",
      },
    };

    return { success: true, data: newCert };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to issue certificate.";
    return { success: false, error: msg };
  }
}
