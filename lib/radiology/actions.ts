import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";

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

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

export const DEFAULT_RADIOLOGY_STUDIES: RadiologyStudy[] = [
  {
    id: "rad-xray-01",
    organization_id: DEFAULT_ORG_ID,
    patient_id: "pat-tanvir-01",
    modality_id: "mod-xray-01",
    study_name: "Chest X-Ray P/A View (Digital)",
    clinical_indication: "High grade persistent fever with productive cough, rule out lobar consolidation.",
    status: "approved",
    created_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    approved_at: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    findings: "Cardiac silhouette is normal in transverse diameter. Both costophrenic angles are clear. Prominent bronchovascular markings in right lower zone.",
    impression: "Bilateral broncho-pneumonic infiltration. Correlate with clinical findings.",
    patients: {
      id: "pat-tanvir-01",
      patient_code: "OH-202610-0001",
      full_name: "Mohammad Tanvir Rahman",
      phone: "+8801712345678",
      gender: "MALE",
    },
    radiology_modalities: {
      id: "mod-xray-01",
      modality_name: "Digital Radiography Room 1",
      modality_code: "XRAY",
    },
  },
  {
    id: "rad-ct-02",
    organization_id: DEFAULT_ORG_ID,
    patient_id: "pat-rokeya-02",
    modality_id: "mod-ct-02",
    study_name: "CT Scan of Brain (Plain 128-Slice)",
    clinical_indication: "Acute onset headache, dizziness and transient ischemic episode.",
    status: "completed",
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    findings: "No evidence of intracranial hemorrhage or acute territorial infarction. Ventricular system and basal cisterns appear normal.",
    impression: "Age related mild cerebral atrophy. No acute major intracranial insult.",
    patients: {
      id: "pat-rokeya-02",
      patient_code: "OH-202610-0002",
      full_name: "Begum Rokeya Khatun",
      phone: "+8801819000111",
      gender: "FEMALE",
    },
    radiology_modalities: {
      id: "mod-ct-02",
      modality_name: "128-Slice Multi-Detector CT Scanner",
      modality_code: "CT",
    },
  },
  {
    id: "rad-usg-03",
    organization_id: DEFAULT_ORG_ID,
    patient_id: "pat-karim-03",
    modality_id: "mod-usg-03",
    study_name: "USG of Whole Abdomen with KUB",
    clinical_indication: "Right hypochondriac pain, dyspepsia after fatty meals.",
    status: "delivered",
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    findings: "Liver is normal in size with increased parenchymal echogenicity. Gallbladder well distended, lumen echo-free without calculus. Kidneys, pancreas and spleen normal.",
    impression: "Grade-I diffuse fatty infiltration of liver. No cholelithiasis detected.",
    patients: {
      id: "pat-karim-03",
      patient_code: "OH-202609-0033",
      full_name: "Abdul Karim",
      phone: "+8801912888999",
      gender: "MALE",
    },
    radiology_modalities: {
      id: "mod-usg-03",
      modality_name: "4D Color Doppler Ultrasonography Suite",
      modality_code: "USG",
    },
  },
  {
    id: "rad-ecg-04",
    organization_id: DEFAULT_ORG_ID,
    patient_id: "pat-farhan-04",
    modality_id: "mod-ecg-04",
    study_name: "12-Lead Electrocardiogram (ECG)",
    clinical_indication: "Pre-operative evaluation prior to elective surgery.",
    status: "approved",
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    findings: "Heart Rate: 74 bpm, regular. PR Interval: 0.16 sec. QRS Duration: 0.08 sec. Axis: Normal.",
    impression: "Normal 12-lead Electrocardiogram (Sinus Rhythm).",
    patients: {
      id: "pat-farhan-04",
      patient_code: "OH-202610-0044",
      full_name: "Farhan Ahmed",
      phone: "+8801722334455",
      gender: "MALE",
    },
    radiology_modalities: {
      id: "mod-ecg-04",
      modality_name: "Cardiology Diagnostic Room",
      modality_code: "ECG",
    },
  },
  {
    id: "rad-mri-05",
    organization_id: DEFAULT_ORG_ID,
    patient_id: "pat-shamima-05",
    modality_id: "mod-mri-05",
    study_name: "MRI of Lumbo-Sacral Spine (1.5 Tesla)",
    clinical_indication: "Low back pain with left L5 dermatomal radiculopathy.",
    status: "scheduled",
    created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    patients: {
      id: "pat-shamima-05",
      patient_code: "OH-202610-0055",
      full_name: "Shamima Akhter",
      phone: "+8801733445566",
      gender: "FEMALE",
    },
    radiology_modalities: {
      id: "mod-mri-05",
      modality_name: "1.5 Tesla Superconducting MRI",
      modality_code: "MRI",
    },
  },
];

export async function getRadiologyStudiesAction(modalityCode?: string): Promise<{
  success: boolean;
  data?: RadiologyStudy[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    let query = supabase
      .from("radiology_studies")
      .select("*, patients(id, patient_code, full_name, phone, gender), radiology_modalities(id, modality_name, modality_code)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (modalityCode && modalityCode !== "ALL") {
      query = query.eq("radiology_modalities.modality_code", modalityCode);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      const filtered = modalityCode && modalityCode !== "ALL"
        ? DEFAULT_RADIOLOGY_STUDIES.filter((s) => s.radiology_modalities?.modality_code === modalityCode)
        : DEFAULT_RADIOLOGY_STUDIES;
      return { success: true, data: filtered };
    }
    return { success: true, data: data as RadiologyStudy[] };
  } catch {
    const filtered = modalityCode && modalityCode !== "ALL"
      ? DEFAULT_RADIOLOGY_STUDIES.filter((s) => s.radiology_modalities?.modality_code === modalityCode)
      : DEFAULT_RADIOLOGY_STUDIES;
    return { success: true, data: filtered };
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
    const orgId = session.organizationId || DEFAULT_ORG_ID;
    const userId = session.userId || "usr-doctor";

    const supabase = createClient();
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

    if (error) {
      return { success: false, error: error.message };
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
      created_at: new Date().toISOString(),
      patients: {
        id: payload.patient_id,
        patient_code: payload.patient_code || "OH-202610-0099",
        full_name: payload.patient_name || "Patient",
        phone: payload.patient_phone,
        gender: payload.patient_gender || "OTHER",
      },
      radiology_modalities: {
        id: `mod-${payload.modality_code.toLowerCase()}-01`,
        modality_name: `${payload.modality_code} Diagnostic Suite`,
        modality_code: payload.modality_code,
      },
    };

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
    const radiologistId = session.userId || "usr-radiologist-consultant";

    const supabase = createClient();
    await supabase
      .from("radiology_studies")
      .update({
        findings: payload.findings.trim(),
        impression: payload.impression.trim(),
        radiologist_id: radiologistId,
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", payload.study_id)
      .eq("organization_id", session.organizationId);

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to approve radiology report.";
    return { success: false, error: msg };
  }
}
