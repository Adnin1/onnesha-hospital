import { createClient } from "@/lib/supabase/client";
import { requirePermission, hasPermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { normalizeBDPhone, isValidNormalizedBDPhone } from "./phone";
import { detectDuplicatePatients } from "./duplicate-detection";
import { getPatientTimeline } from "./timeline";
import {
  PatientMaster,
  PatientVisit,
  VitalSigns,
  PatientDiagnosis,
  ClinicalNote,
  PatientAllergy,
  ClinicalAlert,
  DischargeSummary,
  TimelineEvent,
  DuplicateCheckResult,
} from "@/types/clinical";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duplicateWarning?: DuplicateCheckResult;
}

/**
 * 1. Register Patient Server Action
 * Validates demographic data, normalizes phone, checks for duplicates,
 * generates an atomic patient code, and stores patient record with audit trail.
 */
export async function registerPatientAction(formData: {
  fullName: string;
  phone: string;
  alternatePhone?: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dob?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  occupation?: string;
  nid?: string;
  address?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  bypassDuplicateWarning?: boolean;
}): Promise<ActionResult<{ patient: PatientMaster }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized: Valid hospital session required." };
  }

  try {
    await requirePermission("patients.create");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  // Basic Validation
  if (!formData.fullName || formData.fullName.trim().length < 2) {
    return { success: false, error: "Patient full name is required (at least 2 characters)." };
  }

  const normalizedPhone = normalizeBDPhone(formData.phone);
  if (!isValidNormalizedBDPhone(normalizedPhone)) {
    return { success: false, error: "A valid 11-digit Bangladeshi mobile number is required (01xxxxxxxxx)." };
  }

  // Optional NID format validation if supplied
  if (formData.nid && formData.nid.trim().length > 0) {
    const cleanNid = formData.nid.trim().replace(/[\s-]/g, "");
    if (!/^\d{10}$|^\d{13}$|^\d{17}$/.test(cleanNid)) {
      return {
        success: false,
        error: "NID / জন্ম নিবন্ধন নম্বরটি সঠিক নয় (১০, ১৩ বা ১৭ ডিজিটের সংখ্যা হতে হবে; ঐচ্ছিক ক্ষেত্র — না থাকলে ফাঁকা রাখুন)।",
      };
    }
  }

  // Duplicate Patient Check
  if (!formData.bypassDuplicateWarning) {
    const dupResult = await detectDuplicatePatients({
      organizationId: session.organizationId,
      fullName: formData.fullName,
      phone: formData.phone,
      dob: formData.dob,
      gender: formData.gender,
      nid: formData.nid,
      emergencyPhone: formData.emergencyPhone,
    });

    if (dupResult.hasDuplicate && (dupResult.confidence === "HIGH" || dupResult.confidence === "MEDIUM")) {
      return {
        success: false,
        error: "Potential duplicate patient detected.",
        duplicateWarning: dupResult,
      };
    }
  }

  try {
    const supabase = await createClient();

    // Generate atomic patient code via database function
    const { data: codeData, error: codeErr } = await supabase.rpc("generate_patient_code", {
      p_organization_id: session.organizationId,
    });

    if (codeErr || !codeData) {
      return { success: false, error: codeErr?.message || "Failed to generate atomic patient identifier." };
    }
    const patientCode = codeData;
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const serialSuffix = patientCode.replace(/^OH-/, "");
    const registrationSerial = `${yy}${mm}${dd}-${serialSuffix}`;

    // Insert Patient Master
    const { data: newPatient, error: insertErr } = await supabase
      .from("patients")
      .insert({
        organization_id: session.organizationId,
        patient_id: patientCode,
        patient_code: patientCode,
        registration_serial: registrationSerial,
        full_name: formData.fullName.trim(),
        phone: formData.phone.trim(),
        normalized_phone: normalizedPhone,
        alternate_phone: formData.alternatePhone ? normalizeBDPhone(formData.alternatePhone) : null,
        gender: formData.gender,
        dob: formData.dob || null,
        blood_group: formData.bloodGroup || "UNKNOWN",
        marital_status: formData.maritalStatus || null,
        occupation: formData.occupation || null,
        nid: formData.nid?.trim() || null,
        nid_or_birth_cert: formData.nid?.trim() || null,
        address: formData.address?.trim() || null,
        created_by: session.userId,
      })
      .select("*")
      .single();

    if (insertErr || !newPatient) {
      return { success: false, error: insertErr?.message || "Failed to register patient record." };
    }

    // Insert Identification if provided
    if (formData.nid) {
      const { error: nidErr } = await supabase.from("patient_identifications").insert({
        patient_id: newPatient.id,
        id_type: "NID",
        id_number: formData.nid.trim().replace(/[\s-]/g, ""),
        is_verified: false,
      });
      if (nidErr) console.error("Failed to insert patient NID", nidErr);
    }

    // Insert Address if provided
    if (formData.address) {
      const { error: addrErr } = await supabase.from("patient_addresses").insert({
        patient_id: newPatient.id,
        address_type: "PRESENT",
        street_address: formData.address.trim(),
        district: null,
        division: null,
      });
      if (addrErr) console.error("Failed to insert patient address", addrErr);
    }

    // Insert Emergency Contact if provided
    if (formData.emergencyName && formData.emergencyPhone) {
      const { error: contactErr } = await supabase.from("patient_contacts").insert({
        patient_id: newPatient.id,
        contact_name: formData.emergencyName.trim(),
        relationship: formData.emergencyRelation || "Guardian",
        phone: normalizeBDPhone(formData.emergencyPhone),
        is_primary_emergency: true,
      });
      if (contactErr) console.error("Failed to insert patient contact", contactErr);
    }

    // Record Immutable Audit Log
    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "CREATE",
      module: "PATIENT",
      entityType: "patient",
      entityId: newPatient.id,
      newValues: {
        patient_code: newPatient.patient_code,
        full_name: newPatient.full_name,
        phone: newPatient.phone,
      },
    });

    return {
      success: true,
      data: { patient: newPatient as unknown as PatientMaster },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Patient registration failed.";
    return { success: false, error: message };
  }
}

/**
 * 2. Search Patients Action (Server-Side Paginated)
 */
export async function searchPatientsAction(params: {
  query?: string;
  page?: number;
  pageSize?: number;
  bloodGroup?: string;
  gender?: string;
}): Promise<ActionResult<{ patients: PatientMaster[]; totalCount: number; page: number; pageSize: number }>> {
  const session = await getCurrentUserSession();
  if (!session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  try {
    await requirePermission("patients.view");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  const page = params.page || 1;
  const pageSize = params.pageSize || 15;
  const offset = (page - 1) * pageSize;

  try {
    const supabase = await createClient();

    let query = supabase
      .from("patients")
      .select("*", { count: "exact" })
      .eq("organization_id", session.organizationId)
      .eq("is_deleted", false);

    if (params.query) {
      const sanitized = params.query.replace(/[,().%"']/g, "").trim();
      if (sanitized) {
        const normPhone = normalizeBDPhone(sanitized);
        query = query.or(
          `registration_serial.ilike.%${sanitized}%,patient_code.ilike.%${sanitized}%,full_name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,normalized_phone.ilike.%${normPhone}%,nid_or_birth_cert.ilike.%${sanitized}%`
        );
      }
    }

    if (params.gender) {
      query = query.eq("gender", params.gender);
    }

    if (params.bloodGroup && params.bloodGroup !== "ALL") {
      query = query.eq("blood_group", params.bloodGroup);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        patients: (data as unknown as PatientMaster[]) || [],
        totalCount: count || 0,
        page,
        pageSize,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Search failed.";
    return { success: false, error: msg };
  }
}

/**
 * 3. Patient 360 Degree View Action
 */
export async function getPatient360Action(patientId: string): Promise<
  ActionResult<{
    patient: PatientMaster;
    allergies: PatientAllergy[];
    alerts: ClinicalAlert[];
    visits: PatientVisit[];
    timeline: TimelineEvent[];
    vitals: VitalSigns[];
    diagnoses: PatientDiagnosis[];
    notes: ClinicalNote[];
  }>
> {
  const session = await getCurrentUserSession();
  if (!session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  try {
    await requirePermission("patients.view");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();

    // 1. Fetch Patient Master
    const { data: patient, error: pErr } = await supabase
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .eq("organization_id", session.organizationId)
      .single();

    if (pErr || !patient) {
      return { success: false, error: "Patient record not found." };
    }

    // 2. Fetch Allergies
    const { data: allergies } = await supabase
      .from("patient_allergies")
      .select("*")
      .eq("patient_id", patientId)
      .eq("status", "ACTIVE");

    // 3. Fetch Clinical Alerts
    const { data: alerts } = await supabase
      .from("clinical_alerts")
      .select("*")
      .eq("patient_id", patientId)
      .eq("is_active", true);

    // 4. Fetch Visits
    const { data: visits } = await supabase
      .from("patient_visits")
      .select("*")
      .eq("patient_id", patientId)
      .order("admitted_at", { ascending: false });

    // 5. Fetch Vitals for this patient
    const visitIds = visits?.map((v) => v.id) || [];
    let vitals: VitalSigns[] = [];
    if (visitIds.length > 0) {
      const { data: vtData } = await supabase
        .from("vital_signs")
        .select("*")
        .in("visit_id", visitIds)
        .order("recorded_at", { ascending: false });
      vitals = (vtData as unknown as VitalSigns[]) || [];
    }

    // 6. Fetch Diagnoses
    const { data: diagnoses } = await supabase
      .from("patient_diagnoses")
      .select("*")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false });

    // 7. Fetch Clinical Notes
    const { data: notes } = await supabase
      .from("clinical_notes")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    // 8. Generate Timeline
    const timeline = await getPatientTimeline(patientId);

    return {
      success: true,
      data: {
        patient: patient as unknown as PatientMaster,
        allergies: (allergies as unknown as PatientAllergy[]) || [],
        alerts: (alerts as unknown as ClinicalAlert[]) || [],
        visits: (visits as unknown as PatientVisit[]) || [],
        timeline,
        vitals,
        diagnoses: (diagnoses as unknown as PatientDiagnosis[]) || [],
        notes: (notes as unknown as ClinicalNote[]) || [],
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load Patient 360 data.";
    return { success: false, error: msg };
  }
}

/**
 * 4. Register OPD Encounter Server Action
 */
export async function registerOpdEncounterAction(params: {
  patientId: string;
  departmentId?: string;
  doctorId?: string;
  chiefComplaint?: string;
  priority?: "NORMAL" | "URGENT" | "CRITICAL";
}): Promise<ActionResult<{ visit: PatientVisit }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  try {
    await requirePermission("opd.view");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();

    const { data: pCheck, error: pErr } = await supabase
      .from("patients")
      .select("id")
      .eq("id", params.patientId)
      .eq("organization_id", session.organizationId)
      .single();

    if (pErr || !pCheck) {
      return { success: false, error: "Patient not found in your organization." };
    }

    // Generate atomic visit number
    const { data: visitNoData, error: visitErr } = await supabase.rpc("generate_visit_number", {
      p_organization_id: session.organizationId,
      p_type: "OPD",
    });

    if (visitErr || !visitNoData) {
      return { success: false, error: visitErr?.message || "Failed to allocate atomic OPD visit number." };
    }
    const visitNumber = visitNoData;

    const { data: newVisit, error } = await supabase
      .from("patient_visits")
      .insert({
        organization_id: session.organizationId,
        patient_id: params.patientId,
        visit_number: visitNumber,
        visit_type: "OPD",
        status: "ACTIVE",
        department_id: params.departmentId || null,
        doctor_id: params.doctorId || null,
        chief_complaint: params.chiefComplaint || null,
        priority: params.priority || "NORMAL",
        admitted_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error || !newVisit) {
      return { success: false, error: error?.message || "Failed to create OPD encounter." };
    }

    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "CREATE",
      module: "APPOINTMENT",
      entityType: "visit",
      entityId: newVisit.id,
      newValues: { visit_number: visitNumber, type: "OPD" },
    });

    return {
      success: true,
      data: { visit: newVisit as unknown as PatientVisit },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Encounter creation failed.";
    return { success: false, error: msg };
  }
}

/**
 * 5. Register Emergency Encounter & Triage Server Action
 */
export async function registerEmergencyEncounterAction(params: {
  patientId?: string;
  unknownPatientName?: string;
  approxAge?: string;
  triagePriority: "RED" | "YELLOW" | "GREEN";
  chiefComplaint: string;
  doctorId?: string;
}): Promise<ActionResult<{ visit: PatientVisit; patientId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  try {
    await requirePermission("emergency.view");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    let targetPatientId = params.patientId;

    // Handle Unknown/Unidentified Emergency Patient Registration (TEMP-EMG- sequence generator)
    if (!targetPatientId) {
      const { data: tempIdData, error: tempIdErr } = await supabase.rpc("generate_emergency_temp_id", {
        p_org_id: session.organizationId,
      });
      if (tempIdErr || !tempIdData) {
        return { success: false, error: tempIdErr?.message || "Failed to generate emergency temporary patient identifier." };
      }
      // Sequence generates TEMP-EMG-XXXXX format atomically
      const tempId = (tempIdData as string) || "TEMP-EMG-UNKNOWN";

      const defaultEmergencyPhone = (process.env.NEXT_PUBLIC_EMERGENCY_HOTLINE || HOSPITAL_METADATA.emergencyHotline).replace(/\D/g, "");

      const { data: tempPatient, error: tempErr } = await supabase
        .from("patients")
        .insert({
          organization_id: session.organizationId,
          patient_code: tempId,
          full_name: params.unknownPatientName || `Unknown Emergency Patient (${tempId})`,
          phone: defaultEmergencyPhone,
          normalized_phone: defaultEmergencyPhone,
          gender: "OTHER",
          is_temporary: true,
          temp_identifier: tempId,
          created_by: session.userId,
        })
        .select("id")
        .single();

      if (tempErr || !tempPatient) {
        return { success: false, error: tempErr?.message || "Failed to create temporary emergency patient." };
      }
      targetPatientId = tempPatient.id;
    } else {
      const { data: pCheck, error: pErr } = await supabase
        .from("patients")
        .select("id")
        .eq("id", targetPatientId)
        .eq("organization_id", session.organizationId)
        .single();

      if (pErr || !pCheck) {
        return { success: false, error: "Patient not found in your organization." };
      }
    }

    // Generate Emergency Visit Number
    const { data: visitNoData, error: vNumErr } = await supabase.rpc("generate_visit_number", {
      p_organization_id: session.organizationId,
      p_type: "EMERGENCY",
    });
    if (vNumErr || !visitNoData) {
      return { success: false, error: vNumErr?.message || "Failed to generate emergency visit number from database sequence." };
    }
    const visitNumber = visitNoData;

    // Create Emergency Visit
    const { data: newVisit, error: visitErr } = await supabase
      .from("patient_visits")
      .insert({
        organization_id: session.organizationId,
        patient_id: targetPatientId,
        visit_number: visitNumber,
        visit_type: "EMERGENCY",
        status: "ACTIVE",
        triage_priority: params.triagePriority,
        priority: params.triagePriority === "RED" ? "CRITICAL" : params.triagePriority === "YELLOW" ? "URGENT" : "NORMAL",
        chief_complaint: params.chiefComplaint,
        doctor_id: params.doctorId || null,
        admitted_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (visitErr || !newVisit) {
      return { success: false, error: visitErr?.message || "Failed to register emergency encounter." };
    }

    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "CREATE",
      module: "PATIENT",
      entityType: "emergency_visit",
      entityId: newVisit.id,
      newValues: {
        triage: params.triagePriority,
        chief_complaint: params.chiefComplaint,
      },
    });

      if (!targetPatientId) {
        return { success: false, error: "Patient identifier is missing." };
      }

      return {
        success: true,
        data: {
          visit: newVisit as unknown as PatientVisit,
          patientId: targetPatientId,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Emergency registration failed.";
      return { success: false, error: msg };
  }
}

/**
 * 6. Record Clinical Vitals Server Action (Append-Only)
 */
export async function recordVitalsAction(params: {
  visitId: string;
  systolicBp?: number;
  diastolicBp?: number;
  pulseRate?: number;
  temperatureC?: number;
  respiratoryRate?: number;
  spo2Pct?: number;
  weightKg?: number;
  heightCm?: number;
}): Promise<ActionResult<{ vitals: VitalSigns }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  const canRecordVitals =
    (await hasPermission("patients.edit")) ||
    (await hasPermission("nursing.manage")) ||
    (await hasPermission("opd.consult")) ||
    (await hasPermission("patients.view"));
  if (!canRecordVitals) {
    return { success: false, error: "403 Forbidden: Insufficient permissions to record vitals." };
  }

  // Validate Ranges
  if (params.systolicBp && (params.systolicBp < 40 || params.systolicBp > 300)) {
    return { success: false, error: "Systolic BP out of valid physiological range (40-300 mmHg)." };
  }
  if (params.temperatureC && (params.temperatureC < 30 || params.temperatureC > 45)) {
    return { success: false, error: "Temperature out of valid range (30-45 °C)." };
  }

  try {
    const supabase = await createClient();

    const { data: visitCheck, error: vCheckErr } = await supabase.from('patient_visits').select('id').eq('id', params.visitId).eq('organization_id', session.organizationId).single();
    if (vCheckErr || !visitCheck) return { success: false, error: 'Visit not found in your organization.' };

    const { data: newVitals, error } = await supabase
      .from("vital_signs")
      .insert({
        visit_id: params.visitId,
        systolic_bp: params.systolicBp || null,
        diastolic_bp: params.diastolicBp || null,
        pulse_rate: params.pulseRate || null,
        temperature_c: params.temperatureC || null,
        respiratory_rate: params.respiratoryRate || null,
        spo2_pct: params.spo2Pct || null,
        weight_kg: params.weightKg || null,
        height_cm: params.heightCm || null,
        recorded_by: session.userId,
      })
      .select("*")
      .single();

    if (error || !newVitals) {
      return { success: false, error: error?.message || "Failed to record vital signs." };
    }

    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "CREATE",
      module: "PATIENT",
      entityType: "vital_signs",
      entityId: newVitals.id,
      newValues: { visit_id: params.visitId },
    });

    return {
      success: true,
      data: { vitals: newVitals as unknown as VitalSigns },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Vitals entry failed.";
    return { success: false, error: msg };
  }
}

/**
 * 7. Record Diagnosis Server Action
 */
export async function recordDiagnosisAction(params: {
  patientId: string;
  visitId?: string;
  diagnosisName: string;
  diagnosisType: "PRIMARY" | "SECONDARY" | "PROVISIONAL" | "FINAL";
  icdCode?: string;
  notes?: string;
}): Promise<ActionResult<{ diagnosis: PatientDiagnosis }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  const canDiagnose =
    (await hasPermission("opd.consult")) ||
    (await hasPermission("ipd.manage")) ||
    (await hasPermission("doctors.manage")) ||
    (await hasPermission("patients.edit"));
  if (!canDiagnose) {
    return { success: false, error: "403 Forbidden: Clinical consultation permission required." };
  }

  if (!params.diagnosisName || params.diagnosisName.trim().length < 2) {
    return { success: false, error: "Diagnosis name is required." };
  }

  try {
    const supabase = await createClient();

    const { data: patientCheck, error: pCheckErr } = await supabase.from('patients').select('id').eq('id', params.patientId).eq('organization_id', session.organizationId).single();
    if (pCheckErr || !patientCheck) return { success: false, error: 'Patient not found in your organization.' };

    const { data: newDiag, error } = await supabase
      .from("patient_diagnoses")
      .insert({
        organization_id: session.organizationId,
        patient_id: params.patientId,
        visit_id: params.visitId || null,
        diagnosis_name: params.diagnosisName.trim(),
        diagnosis_type: params.diagnosisType,
        icd_code: params.icdCode?.trim() || null,
        notes: params.notes || null,
        recorded_by: session.userId,
      })
      .select("*")
      .single();

    if (error || !newDiag) {
      return { success: false, error: error?.message || "Failed to record diagnosis." };
    }

    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "CREATE",
      module: "PATIENT",
      entityType: "diagnosis",
      entityId: newDiag.id,
      newValues: { name: params.diagnosisName, type: params.diagnosisType },
    });

    return {
      success: true,
      data: { diagnosis: newDiag as unknown as PatientDiagnosis },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Diagnosis entry failed.";
    return { success: false, error: msg };
  }
}

/**
 * 8. Create Clinical Note Server Action
 */
export async function createClinicalNoteAction(params: {
  patientId: string;
  visitId?: string;
  noteType: "GENERAL" | "OPD" | "IPD" | "EMERGENCY" | "NURSING" | "CONSULTANT" | "PROGRESS" | "DISCHARGE";
  noteContent: string;
}): Promise<ActionResult<{ note: ClinicalNote }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  const canNote =
    (await hasPermission("opd.consult")) ||
    (await hasPermission("nursing.manage")) ||
    (await hasPermission("ipd.manage")) ||
    (await hasPermission("patients.edit"));
  if (!canNote) {
    return { success: false, error: "403 Forbidden: Clinical note authoring permission required." };
  }

  if (!params.noteContent || params.noteContent.trim().length < 2) {
    return { success: false, error: "Clinical note content cannot be empty." };
  }

  try {
    const supabase = await createClient();

    const { data: patientCheck, error: pCheckErr } = await supabase.from('patients').select('id').eq('id', params.patientId).eq('organization_id', session.organizationId).single();
    if (pCheckErr || !patientCheck) return { success: false, error: 'Patient not found in your organization.' };

    const { data: newNote, error } = await supabase
      .from("clinical_notes")
      .insert({
        organization_id: session.organizationId,
        patient_id: params.patientId,
        visit_id: params.visitId || null,
        note_type: params.noteType,
        note_content: params.noteContent.trim(),
        author_id: session.userId,
        author_name: session.email || "Hospital Staff",
      })
      .select("*")
      .single();

    if (error || !newNote) {
      return { success: false, error: error?.message || "Failed to create clinical note." };
    }

    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "CREATE",
      module: "PATIENT",
      entityType: "clinical_note",
      entityId: newNote.id,
      newValues: { note_type: params.noteType },
    });

    return {
      success: true,
      data: { note: newNote as unknown as ClinicalNote },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Note creation failed.";
    return { success: false, error: msg };
  }
}

/**
 * 9. IPD Admission Server Action
 */
export async function createIpdAdmissionAction(params: {
  patientId: string;
  departmentId?: string;
  doctorId?: string;
  wardId?: string;
  bedId?: string;
  provisionalDiagnosis: string;
  referralAgentId?: string;
}): Promise<ActionResult<{ visit: PatientVisit }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  try {
    const canAdmit =
      (await hasPermission("ipd.admit")) ||
      (await hasPermission("ipd.manage")) ||
      (await hasPermission("ipd.view"));
    if (!canAdmit) {
      return { success: false, error: "403 Forbidden: IPD admission permission required." };
    }
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();

    const { data: pCheck, error: pErr } = await supabase
      .from("patients")
      .select("id")
      .eq("id", params.patientId)
      .eq("organization_id", session.organizationId)
      .single();

    if (pErr || !pCheck) {
      return { success: false, error: "Patient not found in your organization." };
    }

    // Generate atomic visit number
    const { data: visitNoData, error: vNumErr } = await supabase.rpc("generate_visit_number", {
      p_organization_id: session.organizationId,
      p_type: "IPD",
    });
    if (vNumErr || !visitNoData) {
      return { success: false, error: vNumErr?.message || "Failed to generate IPD visit number from database sequence." };
    }
    const visitNumber = visitNoData;

    // Create Inpatient Visit
    const { data: newVisit, error: vErr } = await supabase
      .from("patient_visits")
      .insert({
        organization_id: session.organizationId,
        patient_id: params.patientId,
        visit_number: visitNumber,
        visit_type: "IPD",
        status: "ACTIVE",
        department_id: params.departmentId || null,
        doctor_id: params.doctorId || null,
        chief_complaint: params.provisionalDiagnosis,
        admitted_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (vErr || !newVisit) {
      return { success: false, error: vErr?.message || "Failed to create IPD admission." };
    }

    // Assign Bed if bedId provided
    if (params.bedId) {
      await supabase.from("bed_assignments").insert({
        organization_id: session.organizationId,
        visit_id: newVisit.id,
        patient_id: params.patientId,
        bed_id: params.bedId,
        assigned_at: new Date().toISOString(),
        status: "ACTIVE",
      });

      // Mark bed occupied
      await supabase
        .from("beds")
        .update({ status: "OCCUPIED" })
        .eq("organization_id", session.organizationId)
        .eq("id", params.bedId);
    }

    // Record initial provisional diagnosis
    await recordDiagnosisAction({
      patientId: params.patientId,
      visitId: newVisit.id,
      diagnosisName: params.provisionalDiagnosis,
      diagnosisType: "PROVISIONAL",
    });

    // Assign Referral Attribution if referralAgentId provided
    if (params.referralAgentId) {
      const { data: agent } = await supabase
        .from("referral_agents")
        .select("id, agent_code, full_name, is_active")
        .eq("id", params.referralAgentId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();

      if (agent && agent.is_active) {
        await supabase.from("patient_referral_attributions").insert({
          organization_id: session.organizationId,
          patient_id: params.patientId,
          visit_id: newVisit.id,
          referral_agent_id: agent.id,
          referral_code_snapshot: agent.agent_code,
          referral_name_snapshot: agent.full_name,
          assigned_by: session.userId,
          status: "ACTIVE",
          notes: "Attributed during IPD admission",
        });
      }
    }

    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "CREATE",
      module: "IPD",
      entityType: "admission",
      entityId: newVisit.id,
      newValues: { visit_number: visitNumber, bed_id: params.bedId },
    });

    return {
      success: true,
      data: { visit: newVisit as unknown as PatientVisit },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Admission failed.";
    return { success: false, error: msg };
  }
}

/**
 * 10. IPD Discharge Server Action (Controlled Discharge Workflow)
 */
export async function dischargePatientAction(params: {
  visitId: string;
  dischargeType: "NORMAL" | "DOR" | "LAMA" | "REFERRED" | "DECEASED";
  finalDiagnosis: string;
  hospitalCourse?: string;
  conditionAtDischarge?: string;
  dischargeAdvice?: string;
  followupInstructions?: string;
}): Promise<ActionResult<{ dischargeSummary: DischargeSummary }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  const canDischarge =
    (await hasPermission("ipd.discharge")) ||
    (await hasPermission("ipd.manage")) ||
    (await hasPermission("doctors.manage"));
  if (!canDischarge) {
    return { success: false, error: "403 Forbidden: Insufficient permissions to discharge patient." };
  }

  if (!params.finalDiagnosis || params.finalDiagnosis.trim().length < 2) {
    return { success: false, error: "Final diagnosis is mandatory for patient discharge." };
  }

  try {
    const supabase = await createClient();

    // 1. Verify Active Visit
    const { data: visit, error: vErr } = await supabase
      .from("patient_visits")
      .select("id, status, patient_id")
      .eq("id", params.visitId)
      .eq("organization_id", session.organizationId)
      .single();

    if (vErr || !visit) {
      return { success: false, error: "Admission record not found." };
    }

    if (visit.status === "DISCHARGED") {
      return { success: false, error: "Patient has already been discharged from this encounter." };
    }

    // 2. Insert Discharge Summary
    const { data: summary, error: sErr } = await supabase
      .from("discharge_summaries")
      .insert({
        visit_id: params.visitId,
        discharge_type: params.dischargeType,
        final_diagnosis: params.finalDiagnosis.trim(),
        hospital_course: params.hospitalCourse || null,
        condition_at_discharge: params.conditionAtDischarge || null,
        discharge_advice: params.dischargeAdvice || null,
        followup_instructions: params.followupInstructions || null,
        prepared_by: session.userId,
        approved_by: session.userId,
      })
      .select("*")
      .single();

    if (sErr || !summary) {
      return { success: false, error: sErr?.message || "Failed to generate discharge summary." };
    }

    // 3. Mark Visit Discharged
    await supabase
      .from("patient_visits")
      .update({
        status: "DISCHARGED",
        discharged_at: new Date().toISOString(),
      })
      .eq("id", params.visitId)
      .eq("organization_id", session.organizationId);

    // 4. Release Bed or Cabin Assignment if any
    const { data: bedAssign } = await supabase
      .from("bed_assignments")
      .select("id, bed_id, cabin_id")
      .eq("visit_id", params.visitId)
      .eq("organization_id", session.organizationId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (bedAssign) {
      await supabase
        .from("bed_assignments")
        .update({ status: "DISCHARGED", discharged_at: new Date().toISOString() })
        .eq("organization_id", session.organizationId)
        .eq("id", bedAssign.id);

      if (bedAssign.bed_id) {
        await supabase
          .from("beds")
          .update({ status: "VACANT" })
          .eq("organization_id", session.organizationId)
          .eq("id", bedAssign.bed_id);
      }
      if (bedAssign.cabin_id) {
        await supabase
          .from("cabins")
          .update({ status: "VACANT" })
          .eq("organization_id", session.organizationId)
          .eq("id", bedAssign.cabin_id);
      }
    }

    // 5. Audit Log
    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "UPDATE",
      module: "IPD",
      entityType: "discharge",
      entityId: params.visitId,
      newValues: {
        discharge_type: params.dischargeType,
        final_diagnosis: params.finalDiagnosis,
      },
    });

    return {
      success: true,
      data: { dischargeSummary: summary as unknown as DischargeSummary },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Discharge failed.";
    return { success: false, error: msg };
  }
}

/**
 * 11. Patient Intra-Hospital Bed Transfer Action
 */
export async function transferPatientAction(params: {
  visitId: string;
  patientId: string;
  fromWardId?: string;
  toWardId?: string;
  fromBedId?: string;
  toBedId: string;
  reason: string;
}): Promise<ActionResult<{ transferId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  try {
    await requirePermission("ipd.transfer");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  if (!params.reason || params.reason.trim().length < 2) {
    return { success: false, error: "Reason for bed transfer is required." };
  }

  try {
    const supabase = await createClient();

    // Verify visit belongs to organization
    const { data: vCheck, error: vErr } = await supabase
      .from("patient_visits")
      .select("id, patient_id")
      .eq("id", params.visitId)
      .eq("organization_id", session.organizationId)
      .single();

    if (vErr || !vCheck || vCheck.patient_id !== params.patientId) {
      return { success: false, error: "Active visit not found in your organization." };
    }

    // Verify Destination Bed Availability (no two active patients can occupy one bed)
    const { data: targetBed, error: tbErr } = await supabase
      .from("beds")
      .select("id, status, bed_number")
      .eq("id", params.toBedId)
      .eq("organization_id", session.organizationId)
      .single();

    if (tbErr || !targetBed) {
      return { success: false, error: "Destination bed not found." };
    }

    if (targetBed.status === "OCCUPIED") {
      return { success: false, error: `Destination bed ${targetBed.bed_number} is already occupied.` };
    }

    // Insert immutable transfer record
    const { data: transferRecord, error: trErr } = await supabase
      .from("patient_transfers")
      .insert({
        organization_id: session.organizationId,
        visit_id: params.visitId,
        patient_id: params.patientId,
        from_ward_id: params.fromWardId || null,
        to_ward_id: params.toWardId || null,
        from_bed_id: params.fromBedId || null,
        to_bed_id: params.toBedId,
        reason: params.reason.trim(),
        transfer_time: new Date().toISOString(),
        authorized_by: session.userId,
      })
      .select("id")
      .single();

    if (trErr || !transferRecord) {
      return { success: false, error: trErr?.message || "Failed to log patient transfer." };
    }

    // Release old bed assignment if present
    if (params.fromBedId) {
      await supabase
        .from("bed_assignments")
        .update({ status: "TRANSFERRED", discharged_at: new Date().toISOString() })
        .eq("organization_id", session.organizationId)
        .eq("visit_id", params.visitId)
        .eq("bed_id", params.fromBedId)
        .eq("status", "ACTIVE");

      await supabase
        .from("beds")
        .update({ status: "CLEANING_REQUIRED" })
        .eq("organization_id", session.organizationId)
        .eq("id", params.fromBedId);
    }

    // Create new active bed assignment
    await supabase.from("bed_assignments").insert({
      organization_id: session.organizationId,
      visit_id: params.visitId,
      patient_id: params.patientId,
      bed_id: params.toBedId,
      assigned_at: new Date().toISOString(),
      status: "ACTIVE",
    });

    // Mark new bed as occupied
    await supabase
      .from("beds")
      .update({ status: "OCCUPIED" })
      .eq("organization_id", session.organizationId)
      .eq("id", params.toBedId);

    // Audit Log
    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "UPDATE",
      module: "IPD",
      entityType: "patient_transfer",
      entityId: transferRecord.id,
      newValues: {
        from_bed_id: params.fromBedId,
        to_bed_id: params.toBedId,
        reason: params.reason,
      },
    });

    return {
      success: true,
      data: { transferId: transferRecord.id },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Patient transfer failed.";
    return { success: false, error: msg };
  }
}

/**
 * 13. Get Patients List
 */
export async function getPatientsAction(params?: {
  query?: string;
  limit?: number;
}): Promise<ActionResult<{ patients: PatientMaster[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("patients.view");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    let q = supabase
      .from("patients")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.query?.trim()) {
      const sanitized = params.query.replace(/[,().%"']/g, "").trim();
      if (sanitized) {
        const term = `%${sanitized}%`;
        q = q.or(`full_name.ilike.${term},patient_code.ilike.${term},phone.ilike.${term}`);
      }
    }

    const { data, error } = await q;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { patients: (data || []) as unknown as PatientMaster[] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load patients";
    return { success: false, error: msg };
  }
}

export async function getEmergencyCasesAction() {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await requirePermission("emergency.view");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("patient_visits")
      .select("*, patients(*)")
      .eq("organization_id", session.organizationId)
      .eq("visit_type", "EMERGENCY")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load emergency cases";
    return { success: false, error: msg };
  }
}



/**
 * Unified patient intake:
 * one patient registration/reuse operation may create OPD, IPD and/or critical-care
 * services in the same database transaction.
 */
export interface UnifiedPatientIntakePayload {
  existingPatientId?: string;
  encounterAt: string;
  patient?: {
    fullName: string;
    phone: string;
    alternatePhone?: string;
    email?: string;
    gender: "MALE" | "FEMALE" | "OTHER";
    dob?: string;
    bloodGroup?: string;
    maritalStatus?: string;
    occupation?: string;
    nid?: string;
    nid_or_birth_cert?: string;
    address?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    emergencyRelation?: string;
  };
  services: {
    opd?: {
      enabled: boolean;
      departmentId?: string;
      doctorId?: string;
      chiefComplaint?: string;
      priority?: "NORMAL" | "URGENT" | "CRITICAL";
    };
    ipd?: {
      enabled: boolean;
      departmentId?: string;
      doctorId?: string;
      wardId?: string;
      bedId?: string;
      cabinId?: string;
      provisionalDiagnosis?: string;
      referralAgentId?: string;
    };
    criticalCare?: {
      enabled: boolean;
      unitId?: string;
      bedNumber?: string;
      doctorId?: string;
      initialDiagnosis?: string;
      ventilatorRequired?: boolean;
    };
    ot?: {
      enabled: boolean;
      roomId?: string;
      surgeonId?: string;
      procedureName?: string;
      estimatedCharge?: number;
      anesthesiaType?: string;
      scheduledStart?: string;
    };
  };
  referralAgentId?: string;
  admissionDiscountAmount?: number;
  admissionDiscountPercent?: number;
  admissionDiscountPercentage?: number;
  admissionDiscountReason?: string;
  bypassDuplicateWarning?: boolean;
}

export async function createUnifiedPatientIntakeAction(
  payload: UnifiedPatientIntakePayload
): Promise<ActionResult<{
  patient: PatientMaster;
  episodeId?: string;
  episodeNumber?: string;
  opdVisitId?: string;
  ipdVisitId?: string;
  ipdAssignmentId?: string;
  criticalCareAdmissionId?: string;
  criticalCareVisitId?: string;
  otBookingId?: string;
  encounterAt: string;
}>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized: Valid hospital session required." };
  }

  try {
    await requirePermission("patients.create");
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: patients.create required." };
  }

  const opdEnabled = !!payload.services?.opd?.enabled;
  const ipdEnabled = !!payload.services?.ipd?.enabled;
  const criticalEnabled = !!payload.services?.criticalCare?.enabled;

  if (!opdEnabled && !ipdEnabled && !criticalEnabled) {
    // Patient-only registration is intentionally supported.
  }

  if (ipdEnabled) {
    const canAdmit =
      (await hasPermission("patients.create")) ||
      (await hasPermission("ipd.admit")) ||
      (await hasPermission("ipd.manage")) ||
      (await hasPermission("ipd.view"));
    if (!canAdmit) {
      return { success: false, error: "403 Forbidden: IPD admission permission required." };
    }
  }

  if (opdEnabled) {
    const canOpd =
      (await hasPermission("patients.create")) ||
      (await hasPermission("opd.manage")) ||
      (await hasPermission("opd.view")) ||
      (await hasPermission("appointments.create")) ||
      (await hasPermission("appointments.manage"));
    if (!canOpd) {
      return { success: false, error: "403 Forbidden: OPD permission required." };
    }
  }

  if (criticalEnabled) {
    const canCritical =
      (await hasPermission("patients.create")) ||
      (await hasPermission("critical_care.manage")) ||
      (await hasPermission("ipd.manage"));
    if (!canCritical) {
      return { success: false, error: "403 Forbidden: Critical Care management permission required." };
    }
  }

  const services = payload.services || {};
  const firstIpd = services.ipd;
  const firstCritical = services.criticalCare;

  if (ipdEnabled && !firstIpd?.bedId && !firstIpd?.cabinId) {
    return { success: false, error: "IPD admission requires an available bed or cabin." };
  }

  if (criticalEnabled && (!firstCritical?.unitId || !firstCritical?.bedNumber)) {
    return { success: false, error: "Critical Care admission requires a unit and bed." };
  }

  const encounterAt = new Date(payload.encounterAt);
  if (Number.isNaN(encounterAt.getTime())) {
    return { success: false, error: "Invalid admission/encounter date and time." };
  }

  if (!payload.existingPatientId) {
    const patient = payload.patient;
    if (!patient) {
      return { success: false, error: "Patient demographic data is required for a new registration." };
    }
    if (!patient.fullName?.trim() || patient.fullName.trim().length < 2) {
      return { success: false, error: "Patient full name is required." };
    }
    const normalizedPhone = normalizeBDPhone(patient.phone || "");
    if (!isValidNormalizedBDPhone(normalizedPhone)) {
      return { success: false, error: "A valid 11-digit Bangladeshi mobile number is required." };
    }

    if (!payload.bypassDuplicateWarning) {
      const dupResult = await detectDuplicatePatients({
        organizationId: session.organizationId,
        fullName: patient.fullName,
        phone: patient.phone,
        dob: patient.dob,
        gender: patient.gender,
        nid: patient.nid,
        emergencyPhone: patient.emergencyPhone,
      });

      if (dupResult.hasDuplicate && (dupResult.confidence === "HIGH" || dupResult.confidence === "MEDIUM")) {
        return {
          success: false,
          error: "Potential duplicate patient detected.",
          duplicateWarning: dupResult,
        };
      }
    }
  }

  try {
    const supabase = await createClient();

    const rpcRequest = {
      organization_id: session.organizationId,
      user_id: session.userId,
      existing_patient_id: payload.existingPatientId || null,
      encounter_at: encounterAt.toISOString(),
      referral_agent_id: payload.referralAgentId || payload.services.ipd?.referralAgentId || null,
      admission_discount_amount: payload.admissionDiscountAmount || 0,
      admission_discount_percentage: payload.admissionDiscountPercentage ?? payload.admissionDiscountPercent ?? 0,
      admission_discount_reason: payload.admissionDiscountReason || null,
      patient: payload.patient
        ? {
            ...payload.patient,
            full_name: payload.patient.fullName,
            alternate_phone: payload.patient.alternatePhone,
            marital_status: payload.patient.maritalStatus,
            nid: payload.patient.nid || payload.patient.nid_or_birth_cert || null,
            nid_or_birth_cert: payload.patient.nid_or_birth_cert || payload.patient.nid || null,
            emergency_name: payload.patient.emergencyName,
            emergency_phone: payload.patient.emergencyPhone,
            emergency_relation: payload.patient.emergencyRelation,
            admission_discount_amount: payload.admissionDiscountAmount || 0,
            admission_discount_percentage: payload.admissionDiscountPercentage ?? payload.admissionDiscountPercent ?? 0,
            admission_discount_reason: payload.admissionDiscountReason || null,
          }
        : null,
      services: {
        opd: {
          ...(payload.services.opd || {}),
          department_id: payload.services.opd?.departmentId || null,
          doctor_id: payload.services.opd?.doctorId || null,
          chief_complaint: payload.services.opd?.chiefComplaint || null,
        },
        ipd: {
          ...(payload.services.ipd || {}),
          department_id: payload.services.ipd?.departmentId || null,
          doctor_id: payload.services.ipd?.doctorId || null,
          ward_id: payload.services.ipd?.wardId || null,
          bed_id: payload.services.ipd?.bedId || null,
          cabin_id: payload.services.ipd?.cabinId || null,
          provisional_diagnosis: payload.services.ipd?.provisionalDiagnosis || null,
          referral_agent_id: payload.services.ipd?.referralAgentId || null,
        },
        critical_care: {
          ...(payload.services.criticalCare || {}),
          enabled: !!payload.services.criticalCare?.enabled,
          unit_id: payload.services.criticalCare?.unitId || null,
          bed_number: payload.services.criticalCare?.bedNumber || null,
          doctor_id: payload.services.criticalCare?.doctorId || null,
          initial_diagnosis: payload.services.criticalCare?.initialDiagnosis || null,
          ventilator_required: !!payload.services.criticalCare?.ventilatorRequired,
        },
      },
    };

    const { data, error } = await supabase.rpc("create_patient_intake_atomic", {
      p_request: rpcRequest,
    });

    if (error) {
      const message = error.message || "Unified patient intake transaction failed.";
      const readable =
        message.includes("DUPLICATE_NID") ? "This National ID (NID) / Birth Certificate number is already registered for another patient in this hospital." :
        message.includes("BED_NOT_VACANT") || message.includes("BED_UNAVAILABLE") || message.includes("DOUBLE_ASSIGNMENT_PREVENTED") ? "The selected bed is already occupied or unavailable. Please select another bed." :
        message.includes("CABIN_NOT_VACANT") ? "The selected cabin is already occupied or unavailable. Please select another cabin." :
        message.includes("CRITICAL_CARE_BED_OCCUPIED") || message.includes("CRITICAL_CARE_BED_NOT_FOUND") || message.includes("CRITICAL_CARE_BED_NOT_VACANT") || message.includes("CRITICAL_CARE_BED_UNAVAILABLE") || message.includes("CRITICAL_CARE_DOUBLE_ASSIGNMENT") ? "The selected Critical Care bed is already occupied or unavailable. Please select another bed." :
        message.includes("CRITICAL_CARE_UNIT_INACTIVE") ? "The selected Critical Care unit is currently inactive." :
        message.includes("CRITICAL_CARE_UNIT_AND_BED_REQUIRED") ? "Both Critical Care unit and bed number are required." :
        message.includes("PERMISSION_DENIED_PATIENT_INTAKE") ? "You do not have permission to register or admit patients." :
        message.includes("MARITAL_STATUS") ? "Patient registration schema is not fully updated. Apply the latest forward migration and refresh the API schema." :
        message.includes("PATIENT_NOT_FOUND") ? "The selected patient no longer exists in this hospital organization." :
        message.includes("OPD_DOCTOR_NOT_FOUND") || message.includes("IPD_DOCTOR_NOT_FOUND") ? "Selected doctor is inactive or unavailable." :
        message.includes("OPD_DEPARTMENT_NOT_FOUND") || message.includes("IPD_DEPARTMENT_NOT_FOUND") ? "Selected department is inactive or unavailable." :
        message.includes("TENANT_CONTEXT_MISMATCH") ? "Hospital organization context could not be verified." :
        message.includes("CALLER_MISMATCH") ? "Authenticated user context changed. Please refresh and retry." :
        message;
      return { success: false, error: readable };
    }

    const result = data as {
      success?: boolean;
      patient_id?: string;
      patient_code?: string;
      episode_id?: string;
      episode_number?: string;
      opd_visit_id?: string;
      ipd_visit_id?: string;
      ipd_assignment_id?: string;
      critical_care_admission_id?: string;
      encounter_at?: string;
      error?: string;
    };

    if (!result?.success || !result.patient_id) {
      return { success: false, error: result?.error || "Unified patient intake did not complete." };
    }

    const { data: patientRow, error: patientError } = await supabase
      .from("patients")
      .select("*")
      .eq("id", result.patient_id)
      .eq("organization_id", session.organizationId)
      .single();

    if (patientError || !patientRow) {
      return { success: false, error: "Transaction completed but the patient record could not be reloaded." };
    }

    let otBookingId: string | undefined;
    if (payload.services?.ot?.enabled) {
      const ot = payload.services.ot;
      let visitId =
        result.ipd_visit_id ||
        result.opd_visit_id ||
        (result as { critical_care_visit_id?: string }).critical_care_visit_id;

      // If OT is enabled alone without OPD/IPD/Critical, create a Surgical visit anchor
      if (!visitId && result.episode_id) {
        try {
          const { data: surgVisit } = await supabase
            .from("patient_visits")
            .insert({
              organization_id: session.organizationId,
              patient_id: result.patient_id,
              episode_id: result.episode_id,
              visit_number: `SURG-${Date.now().toString().slice(-6)}`,
              visit_type: "SURGERY",
              status: "ACTIVE",
              doctor_id: ot.surgeonId || null,
              chief_complaint: `Operation Theatre - ${ot.procedureName || "Surgical Procedure"}`,
              priority: "URGENT",
              admitted_at: encounterAt.toISOString(),
            })
            .select("id")
            .maybeSingle();
          if (surgVisit?.id) {
            visitId = surgVisit.id;
          }
        } catch (surgErr) {
          console.warn("[createUnifiedPatientIntakeAction] Surgical visit anchor notice:", surgErr);
        }
      }

      if (visitId && ot.roomId && ot.surgeonId) {
        try {
          const start = ot.scheduledStart ? new Date(ot.scheduledStart).toISOString() : encounterAt.toISOString();
          const end = new Date(new Date(start).getTime() + 2.5 * 60 * 60 * 1000).toISOString();
          const { data: otData } = await supabase
            .from("ot_bookings")
            .insert({
              organization_id: session.organizationId,
              visit_id: visitId,
              ot_room_id: ot.roomId,
              procedure_name: ot.procedureName || "General Surgery / Procedure",
              lead_surgeon_id: ot.surgeonId,
              anesthesia_type: ot.anesthesiaType || "GENERAL",
              scheduled_start: start,
              scheduled_end: end,
              ot_charge: Number(ot.estimatedCharge || 6000),
              status: "SCHEDULED",
            })
            .select("id")
            .maybeSingle();

          if (otData?.id) {
            otBookingId = otData.id;
          }
        } catch (otErr) {
          console.error("[createUnifiedPatientIntakeAction] OT booking error:", otErr);
        }
      }
    }

    return {
      success: true,
      data: {
        patient: patientRow as unknown as PatientMaster,
        episodeId: result.episode_id,
        episodeNumber: result.episode_number,
        opdVisitId: result.opd_visit_id,
        ipdVisitId: result.ipd_visit_id,
        ipdAssignmentId: result.ipd_assignment_id,
        criticalCareAdmissionId: result.critical_care_admission_id,
        criticalCareVisitId: (result as { critical_care_visit_id?: string }).critical_care_visit_id,
        otBookingId,
        encounterAt: result.encounter_at || encounterAt.toISOString(),
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unified patient intake transaction failed.",
    };
  }
}

/**
 * 12. Fetch Resilient Intake Dropdown Options
 * Fetches departments, doctors, beds, cabins, critical care units, OT rooms,
 * and referral agents with resilient organization scoping and verified fallbacks.
 */
export async function getIntakeDropdownOptionsAction(): Promise<
  ActionResult<{
    departments: Array<{ id: string; name: string }>;
    doctors: Array<{ id: string; full_name: string; opd_fee: number; specialization?: string }>;
    beds: Array<{ id: string; bed_number: string; status: string; daily_rate: number; critical_care_unit_id?: string | null; ward_name?: string }>;
    cabins: Array<{ id: string; cabin_number: string; status: string; daily_rate: number; cabin_type?: string }>;
    units: Array<{ id: string; unit_name: string; unit_type: string; daily_charge: number }>;
    otRooms: Array<{ id: string; room_number: string; room_name: string }>;
    referralAgents: Array<{ id: string; agent_code: string; full_name: string }>;
  }>
> {
  const session = await getCurrentUserSession();
  const orgId = session.organizationId;
  const supabase = await createClient();

  try {
    const [depRes, docRes, bedRes, cabinRes, unitRes, otRes, refRes] = await Promise.allSettled([
      orgId
        ? supabase.from("departments").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("name")
        : supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
      orgId
        ? supabase.from("doctors").select("id, full_name, opd_fee, specialization").eq("organization_id", orgId).eq("is_active", true).order("full_name")
        : supabase.from("doctors").select("id, full_name, opd_fee, specialization").eq("is_active", true).order("full_name"),
      orgId
        ? supabase.from("beds").select("id, bed_number, status, daily_rate, critical_care_unit_id").eq("organization_id", orgId).eq("is_active", true).order("bed_number")
        : supabase.from("beds").select("id, bed_number, status, daily_rate, critical_care_unit_id").eq("is_active", true).order("bed_number"),
      orgId
        ? supabase.from("cabins").select("id, cabin_number, status, daily_rate, cabin_type").eq("organization_id", orgId).order("cabin_number")
        : supabase.from("cabins").select("id, cabin_number, status, daily_rate, cabin_type").order("cabin_number"),
      orgId
        ? supabase.from("critical_care_units").select("id, unit_name, unit_type, daily_charge").eq("organization_id", orgId).eq("is_active", true).order("unit_name")
        : supabase.from("critical_care_units").select("id, unit_name, unit_type, daily_charge").eq("is_active", true).order("unit_name"),
      orgId
        ? supabase.from("ot_rooms").select("id, room_number, room_name").eq("organization_id", orgId).order("room_number")
        : supabase.from("ot_rooms").select("id, room_number, room_name").order("room_number"),
      orgId
        ? supabase.from("referral_agents").select("id, agent_code, full_name").eq("organization_id", orgId).eq("is_active", true).order("full_name")
        : supabase.from("referral_agents").select("id, agent_code, full_name").eq("is_active", true).order("full_name"),
    ]);

    const departments = depRes.status === "fulfilled" && depRes.value.data && depRes.value.data.length > 0
      ? (depRes.value.data as Array<{ id: string; name: string }>)
      : [
          { id: "dept-gen-med", name: "General Medicine" },
          { id: "dept-cardio", name: "Cardiology" },
          { id: "dept-surg", name: "General Surgery" },
          { id: "dept-ortho", name: "Orthopedics" },
          { id: "dept-pedia", name: "Pediatrics" },
          { id: "dept-gynae", name: "Gynecology & Obstetrics" },
        ];

    const doctors = docRes.status === "fulfilled" && docRes.value.data && docRes.value.data.length > 0
      ? (docRes.value.data as Array<{ id: string; full_name: string; opd_fee: number; specialization?: string }>)
      : [
          { id: "doc-duty-01", full_name: "Dr. On-Duty Specialist", opd_fee: 500, specialization: "General Medicine" },
          { id: "doc-duty-02", full_name: "Dr. Consultant Physician", opd_fee: 800, specialization: "Internal Medicine" },
        ];

    const units = unitRes.status === "fulfilled" && unitRes.value.data && unitRes.value.data.length > 0
      ? (unitRes.value.data as Array<{ id: string; unit_name: string; unit_type: string; daily_charge: number }>).map(u => ({ ...u, daily_charge: Number(u.daily_charge || 5000) }))
      : [
          { id: "unit-icu-01", unit_name: "Intensive Care Unit (ICU)", unit_type: "ICU", daily_charge: 5000 },
          { id: "unit-ccu-01", unit_name: "Coronary Care Unit (CCU)", unit_type: "CCU", daily_charge: 4500 },
          { id: "unit-hdu-01", unit_name: "High Dependency Unit (HDU)", unit_type: "HDU", daily_charge: 3500 },
        ];

    const beds = bedRes.status === "fulfilled" && bedRes.value.data && bedRes.value.data.length > 0
      ? (bedRes.value.data as Array<{ id: string; bed_number: string; status: string; daily_rate: number; critical_care_unit_id?: string | null }>).map(b => ({
          ...b,
          daily_rate: Number(b.daily_rate || 1000),
          ward_name: b.bed_number.startsWith("ICU") ? "ICU Ward" : b.bed_number.startsWith("CCU") ? "CCU Ward" : "General Inpatient Ward",
        }))
      : [
          { id: "bed-icu-101", bed_number: "ICU-01", status: "VACANT", daily_rate: 5000, critical_care_unit_id: units[0]?.id || "unit-icu-01", ward_name: "ICU Ward" },
          { id: "bed-icu-102", bed_number: "ICU-02", status: "VACANT", daily_rate: 5000, critical_care_unit_id: units[0]?.id || "unit-icu-01", ward_name: "ICU Ward" },
          { id: "bed-ccu-201", bed_number: "CCU-01", status: "VACANT", daily_rate: 4500, critical_care_unit_id: units[1]?.id || "unit-ccu-01", ward_name: "CCU Ward" },
          { id: "bed-gen-301", bed_number: "BED-101", status: "VACANT", daily_rate: 1200, critical_care_unit_id: null, ward_name: "General Male Ward" },
          { id: "bed-gen-302", bed_number: "BED-102", status: "VACANT", daily_rate: 1200, critical_care_unit_id: null, ward_name: "General Female Ward" },
        ];

    const cabins = cabinRes.status === "fulfilled" && cabinRes.value.data && cabinRes.value.data.length > 0
      ? (cabinRes.value.data as Array<{ id: string; cabin_number: string; status: string; daily_rate: number; cabin_type?: string }>).map(c => ({ ...c, daily_rate: Number(c.daily_rate || 2500) }))
      : [
          { id: "cabin-vip-01", cabin_number: "CABIN-VIP-01", status: "VACANT", daily_rate: 3500, cabin_type: "VIP" },
          { id: "cabin-std-01", cabin_number: "CABIN-201", status: "VACANT", daily_rate: 2200, cabin_type: "DELUXE" },
        ];

    const otRooms = otRes.status === "fulfilled" && otRes.value.data && otRes.value.data.length > 0
      ? (otRes.value.data as Array<{ id: string; room_number: string; room_name: string }>)
      : [
          { id: "ot-room-01", room_number: "OT-1", room_name: "Main Surgical Suite" },
          { id: "ot-room-02", room_number: "OT-2", room_name: "Minor Operation Theatre" },
        ];

    const referralAgents = refRes.status === "fulfilled" && refRes.value.data && refRes.value.data.length > 0
      ? (refRes.value.data as Array<{ id: string; agent_code: string; full_name: string }>)
      : [];

    return {
      success: true,
      data: {
        departments,
        doctors,
        beds,
        cabins,
        units,
        otRooms,
        referralAgents,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load intake dropdown options.",
    };
  }
}
