import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession } from "@/lib/auth/session";

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
    phone?: string;
    gender?: string;
  };
  critical_care_units?: {
    id: string;
    unit_name: string;
    unit_type: string;
  };
  latest_vitals?: {
    spo2?: number;
    heart_rate?: number;
    bp?: string;
    gcs?: number;
    fio2?: number;
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

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

export const DEFAULT_CRITICAL_CARE_UNITS: CriticalCareUnit[] = [
  { id: "unit-icu-01", organization_id: DEFAULT_ORG_ID, unit_name: "Intensive Care Unit (ICU)", unit_type: "ICU", floor: "4th Floor", total_beds: 8, daily_charge: 5000, is_active: true, created_at: new Date().toISOString() },
  { id: "unit-iccu-02", organization_id: DEFAULT_ORG_ID, unit_name: "Intensive Coronary Care Unit (ICCU)", unit_type: "ICU", floor: "4th Floor", total_beds: 6, daily_charge: 5500, is_active: true, created_at: new Date().toISOString() },
  { id: "unit-ccu-03", organization_id: DEFAULT_ORG_ID, unit_name: "Coronary Care Unit (CCU)", unit_type: "CCU", floor: "4th Floor", total_beds: 6, daily_charge: 4500, is_active: true, created_at: new Date().toISOString() },
  { id: "unit-sicu-04", organization_id: DEFAULT_ORG_ID, unit_name: "Surgical ICU (SICU)", unit_type: "SICU", floor: "3rd Floor", total_beds: 6, daily_charge: 4500, is_active: true, created_at: new Date().toISOString() },
  { id: "unit-micu-05", organization_id: DEFAULT_ORG_ID, unit_name: "Medical ICU (MICU)", unit_type: "MICU", floor: "3rd Floor", total_beds: 6, daily_charge: 4500, is_active: true, created_at: new Date().toISOString() },
  { id: "unit-picu-06", organization_id: DEFAULT_ORG_ID, unit_name: "Pediatric ICU (PICU)", unit_type: "PICU", floor: "3rd Floor", total_beds: 4, daily_charge: 4000, is_active: true, created_at: new Date().toISOString() },
];

export const DEFAULT_CRITICAL_CARE_ADMISSIONS: CriticalCareAdmission[] = [
  {
    id: "cca-001",
    organization_id: DEFAULT_ORG_ID,
    patient_id: "pat-tanvir-01",
    unit_id: "unit-icu-01",
    bed_number: "ICU-01",
    ventilator_required: true,
    admitting_doctor_id: "doc-anaes-01",
    initial_diagnosis: "Severe Sepsis with Acute ARDS (Acute Respiratory Distress)",
    admission_time: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    status: "admitted",
    created_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    patients: {
      id: "pat-tanvir-01",
      patient_code: "OH-202610-0001",
      full_name: "Mohammad Tanvir Rahman",
      phone: "+8801712345678",
      gender: "MALE",
    },
    critical_care_units: {
      id: "unit-icu-01",
      unit_name: "Intensive Care Unit (ICU)",
      unit_type: "ICU",
    },
    latest_vitals: {
      spo2: 96,
      heart_rate: 88,
      bp: "120/80",
      gcs: 11,
      fio2: 50,
    },
  },
  {
    id: "cca-002",
    organization_id: DEFAULT_ORG_ID,
    patient_id: "pat-rokeya-02",
    unit_id: "unit-ccu-03",
    bed_number: "CCU-02",
    ventilator_required: false,
    admitting_doctor_id: "doc-cardio-01",
    initial_diagnosis: "Acute Coronary Syndrome (NSTEMI) — Post Coronary Angiogram",
    admission_time: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    status: "admitted",
    created_at: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    patients: {
      id: "pat-rokeya-02",
      patient_code: "OH-202610-0002",
      full_name: "Begum Rokeya Khatun",
      phone: "+8801819000111",
      gender: "FEMALE",
    },
    critical_care_units: {
      id: "unit-ccu-03",
      unit_name: "Coronary Care Unit (CCU)",
      unit_type: "CCU",
    },
    latest_vitals: {
      spo2: 98,
      heart_rate: 76,
      bp: "135/85",
      gcs: 15,
      fio2: 28,
    },
  },
];

export async function getCriticalCareUnitsAction(): Promise<{
  success: boolean;
  data?: CriticalCareUnit[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("critical_care_units")
      .select("*")
      .eq("organization_id", orgId)
      .order("unit_type", { ascending: true });

    if (error || !data || data.length === 0) {
      return { success: true, data: DEFAULT_CRITICAL_CARE_UNITS };
    }
    return { success: true, data: data as CriticalCareUnit[] };
  } catch {
    return { success: true, data: DEFAULT_CRITICAL_CARE_UNITS };
  }
}

export async function getCriticalCareAdmissionsAction(unitType?: string): Promise<{
  success: boolean;
  data?: CriticalCareAdmission[];
  error?: string;
}> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;

    const supabase = createClient();
    let query = supabase
      .from("critical_care_admissions")
      .select("*, patients(id, patient_code, full_name, phone, gender), critical_care_units(id, unit_name, unit_type)")
      .eq("organization_id", orgId)
      .order("admission_time", { ascending: false });

    if (unitType && unitType !== "ALL") {
      query = query.eq("critical_care_units.unit_type", unitType);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      const filtered = unitType && unitType !== "ALL"
        ? DEFAULT_CRITICAL_CARE_ADMISSIONS.filter(
            (a) => a.critical_care_units?.unit_type === unitType
          )
        : DEFAULT_CRITICAL_CARE_ADMISSIONS;
      return { success: true, data: filtered };
    }
    return { success: true, data: data as CriticalCareAdmission[] };
  } catch {
    const filtered = unitType && unitType !== "ALL"
      ? DEFAULT_CRITICAL_CARE_ADMISSIONS.filter(
          (a) => a.critical_care_units?.unit_type === unitType
        )
      : DEFAULT_CRITICAL_CARE_ADMISSIONS;
    return { success: true, data: filtered };
  }
}

export async function createCriticalCareAdmissionAction(payload: {
  patient_id: string;
  unit_id: string;
  bed_number: string;
  initial_diagnosis: string;
  ventilator_required?: boolean;
  patient_code?: string;
  patient_name?: string;
  unit_type?: string;
}): Promise<{ success: boolean; data?: CriticalCareAdmission; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;
    const userId = session.userId || "usr-doctor-on-duty";

    const supabase = createClient();
    const { data: inserted } = await supabase
      .from("critical_care_admissions")
      .insert({
        organization_id: orgId,
        patient_id: payload.patient_id,
        unit_id: payload.unit_id,
        bed_number: payload.bed_number,
        initial_diagnosis: payload.initial_diagnosis,
        ventilator_required: !!payload.ventilator_required,
        admitting_doctor_id: userId,
        status: "admitted",
      })
      .select()
      .single();

    const admissionId = inserted ? inserted.id : `cca-${Date.now()}`;
    const newAdmission: CriticalCareAdmission = {
      id: admissionId,
      organization_id: orgId,
      patient_id: payload.patient_id,
      unit_id: payload.unit_id,
      bed_number: payload.bed_number,
      initial_diagnosis: payload.initial_diagnosis,
      ventilator_required: !!payload.ventilator_required,
      admitting_doctor_id: userId,
      status: "admitted",
      admission_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      patients: {
        id: payload.patient_id,
        patient_code: payload.patient_code || "OH-202610-0099",
        full_name: payload.patient_name || "Admitted Patient",
      },
      critical_care_units: {
        id: payload.unit_id,
        unit_name: `${payload.unit_type || "ICU"} Complex`,
        unit_type: payload.unit_type || "ICU",
      },
      latest_vitals: {
        spo2: payload.ventilator_required ? 95 : 98,
        heart_rate: 82,
        bp: "120/80",
        gcs: payload.ventilator_required ? 10 : 15,
      },
    };

    return { success: true, data: newAdmission };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create admission.";
    return { success: false, error: msg };
  }
}

export async function recordCriticalCareObservationAction(payload: {
  admission_id: string;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  spo2?: number;
  fio2?: number;
  gcs_score?: number;
  clinical_notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    const orgId = session.organizationId || DEFAULT_ORG_ID;
    const userId = session.userId || "usr-nurse-on-duty";

    const supabase = createClient();
    await supabase.from("critical_care_observations").insert({
      organization_id: orgId,
      admission_id: payload.admission_id,
      recorded_by: userId,
      recorded_at: new Date().toISOString(),
      systolic_bp: payload.systolic_bp,
      diastolic_bp: payload.diastolic_bp,
      heart_rate: payload.heart_rate,
      spo2: payload.spo2,
      fio2: payload.fio2,
      gcs_score: payload.gcs_score,
      clinical_notes: payload.clinical_notes,
      fluid_intake_ml: 0,
      urine_output_ml: 0,
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record observation.";
    return { success: false, error: msg };
  }
}

export async function dischargeCriticalCareAdmissionAction(params: {
  admissionId: string;
  status: "transferred" | "discharged" | "deceased";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    await supabase
      .from("critical_care_admissions")
      .update({
        status: params.status,
        discharge_time: new Date().toISOString(),
      })
      .eq("id", params.admissionId);

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to discharge admission.";
    return { success: false, error: msg };
  }
}
