import crypto from "crypto";
import { createClient } from "@/lib/supabase/client";
import { requirePermission, hasPermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { HOSPITAL_METADATA } from "@/config/hospital";
import {
  reportSystemRuntimeIncident,
  resolveSystemRuntimeIncident,
} from "@/lib/diagnostics/troubleshooter";
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
  UpdatePatientInput,
  PatientIntakeDossier,
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
  dailyRate?: number;
  dailyServiceCharge?: number;
  admissionFee?: number;
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

    const admFee = params.admissionFee !== undefined ? Number(params.admissionFee) : 300;
    const dailySvcCharge = params.dailyServiceCharge !== undefined ? Number(params.dailyServiceCharge) : 500;

    // Create Inpatient Visit with durable snapshot charges
    const visitPayload: Record<string, unknown> = {
      organization_id: session.organizationId,
      patient_id: params.patientId,
      visit_number: visitNumber,
      visit_type: "IPD",
      status: "ACTIVE",
      department_id: params.departmentId || null,
      doctor_id: params.doctorId || null,
      chief_complaint: params.provisionalDiagnosis,
      admitted_at: new Date().toISOString(),
      admission_fee_snapshot: admFee,
      daily_service_rate_snapshot: dailySvcCharge,
    };

    let { data: newVisit, error: vErr } = await supabase
      .from("patient_visits")
      .insert(visitPayload)
      .select("*")
      .single();

    if (vErr && vErr.code === "PGRST204") {
      delete visitPayload.admission_fee_snapshot;
      delete visitPayload.daily_service_rate_snapshot;
      const retry = await supabase.from("patient_visits").insert(visitPayload).select("*").single();
      newVisit = retry.data;
      vErr = retry.error;
    }

    if (vErr || !newVisit) {
      return { success: false, error: vErr?.message || "Failed to create IPD admission." };
    }

    // Resolve or create active patient care episode and persist snapshot rates
    try {
      const { data: activeEp } = await supabase
        .from("patient_care_episodes")
        .select("id")
        .eq("organization_id", session.organizationId)
        .eq("patient_id", params.patientId)
        .eq("status", "ACTIVE")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let epId = activeEp?.id;
      if (!epId) {
        const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
        const randStr = crypto.randomBytes(2).toString("hex").toUpperCase();
        const { data: newEp } = await supabase
          .from("patient_care_episodes")
          .insert({
            organization_id: session.organizationId,
            patient_id: params.patientId,
            episode_number: `EP-${dateStr}-${randStr}`,
            status: "ACTIVE",
            started_at: new Date().toISOString(),
            admission_fee_snapshot: admFee,
            daily_service_rate_snapshot: dailySvcCharge,
          })
          .select("id")
          .maybeSingle();
        epId = newEp?.id;
      } else {
        await supabase
          .from("patient_care_episodes")
          .update({
            admission_fee_snapshot: admFee,
            daily_service_rate_snapshot: dailySvcCharge,
          })
          .eq("id", epId);
      }

      if (epId) {
        await supabase.from("patient_visits").update({ episode_id: epId }).eq("id", newVisit.id);

        // Record durable unbilled admission fee charge if > 0
        if (admFee > 0) {
          await supabase.from("episode_service_charges").insert({
            organization_id: session.organizationId,
            episode_id: epId,
            patient_id: params.patientId,
            service_category: "MISC",
            item_name: "IPD Admission Fee (ভর্তি ফি - এককালীন)",
            quantity: 1,
            unit_price: admFee,
            status: "UNBILLED",
            notes: "Authoritative IPD admission snapshot fee",
            created_by: session.userId,
          });
        }
      }
    } catch (epErr) {
      console.warn("[createIpdAdmissionAction] Episode snapshot sync notice:", epErr);
    }

    // Assign Bed if bedId provided
    if (params.bedId) {
      const bedAsgPayload: Record<string, unknown> = {
        organization_id: session.organizationId,
        visit_id: newVisit.id,
        patient_id: params.patientId,
        bed_id: params.bedId,
        assigned_at: new Date().toISOString(),
        status: "ACTIVE",
      };
      if (params.dailyRate !== undefined && !Number.isNaN(Number(params.dailyRate))) {
        bedAsgPayload.daily_charge = Number(params.dailyRate);
      }
      let bAsgRes = await supabase.from("bed_assignments").insert(bedAsgPayload);
      if (bAsgRes.error && bAsgRes.error.code === "PGRST204") {
        delete bedAsgPayload.daily_charge;
        bAsgRes = await supabase.from("bed_assignments").insert(bedAsgPayload);
      }
      if (bAsgRes.error) {
        const isConflict =
          bAsgRes.error.message?.includes("idx_unique_active_bed_assignment") ||
          bAsgRes.error.code === "23505" ||
          bAsgRes.error.message?.includes("BED_NOT_VACANT");
        return {
          success: false,
          error: isConflict
            ? "নির্বাচিত বেডটি ইতোমধ্যে অন্য রোগীকে বরাদ্দ করা হয়েছে। অনুগ্রহ করে অন্য বেড নির্বাচন করুন (Selected bed is already occupied)."
            : bAsgRes.error.message,
        };
      }

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
  consultantDoctorId?: string;
  consultantName?: string;
  consultantDesignation?: string;
  bmdcRegNumber?: string;
  presentingFeatures?: string;
  investigationsSummary?: string;
  operationName?: string;
  operationDate?: string;
  operationTime?: string;
  surgeonName?: string;
  assistantSurgeons?: string;
  anaesthetistName?: string;
  anaesthesiaType?: string;
  operativeFindings?: string;
  babySex?: string;
  babyWeightKg?: number;
  babyApgarScore?: string;
  babyNotes?: string;
  medicationsSchedule?: Array<{
    name: string;
    formulation?: string;
    dosage: string;
    timing?: string;
    duration: string;
    instructions?: string;
  }>;
  stitchRemovalDate?: string;
  followupDate?: string;
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

  // Mandatory Consultant Doctor Verification
  if (!params.consultantName?.trim() && !params.consultantDoctorId) {
    return { success: false, error: "Consultant doctor name or selection is mandatory on discharge certificate." };
  }

  try {
    const supabase = await createClient();

    // Execute atomic IPD discharge database RPC
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("complete_ipd_discharge_atomic", {
      p_org_id: session.organizationId,
      p_visit_id: params.visitId,
      p_discharge_type: params.dischargeType,
      p_final_diagnosis: params.finalDiagnosis.trim(),
      p_consultant_doctor_id: params.consultantDoctorId || null,
      p_consultant_name: params.consultantName?.trim() || null,
      p_bmdc_reg_number: params.bmdcRegNumber?.trim() || null,
      p_consultant_designation: params.consultantDesignation?.trim() || null,
      p_hospital_course: params.hospitalCourse?.trim() || null,
      p_condition_at_discharge: params.conditionAtDischarge?.trim() || null,
      p_discharge_advice: params.dischargeAdvice?.trim() || null,
      p_followup_instructions: params.followupInstructions?.trim() || null,
      p_presenting_features: params.presentingFeatures
        ? (typeof params.presentingFeatures === "string"
            ? (() => {
                try {
                  const parsed = JSON.parse(params.presentingFeatures);
                  return Array.isArray(parsed) ? parsed : [String(parsed)];
                } catch {
                  const lines = params.presentingFeatures.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
                  return lines.length > 0 ? lines : [params.presentingFeatures.trim()];
                }
              })()
            : params.presentingFeatures)
        : [],
      p_investigations_summary: params.investigationsSummary?.trim() || null,
      p_operation_name: params.operationName?.trim() || null,
      p_operation_date: params.operationDate || null,
      p_operation_time: params.operationTime?.trim() || null,
      p_surgeon_name: params.surgeonName?.trim() || null,
      p_assistant_surgeons: params.assistantSurgeons?.trim() || null,
      p_anaesthetist_name: params.anaesthetistName?.trim() || null,
      p_anaesthesia_type: params.anaesthesiaType?.trim() || null,
      p_operative_findings: params.operativeFindings?.trim() || null,
      p_baby_sex: params.babySex || null,
      p_baby_weight_kg: params.babyWeightKg || null,
      p_baby_apgar_score: params.babyApgarScore || null,
      p_baby_notes: params.babyNotes?.trim() || null,
      p_medications_schedule: params.medicationsSchedule || [],
      p_stitch_removal_date: params.stitchRemovalDate || null,
      p_followup_date: params.followupDate || null,
      p_prepared_by: session.userId,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || "Failed to execute atomic patient discharge." };
    }

    const summaryId = (rpcRes as { summary_id?: string })?.summary_id;
    if (!summaryId) {
      return { success: false, error: "Discharge summary ID missing from atomic response." };
    }

    // Retrieve the authoritative generated summary
    const { data: summary, error: sErr } = await supabase
      .from("discharge_summaries")
      .select("*")
      .eq("id", summaryId)
      .eq("organization_id", session.organizationId)
      .single();

    if (sErr || !summary) {
      return { success: false, error: "Failed to load generated discharge summary record." };
    }

    // Secondary safety verification: Confirm all beds and cabins are released to VACANT
    const { data: bedAssigns } = await supabase
      .from("bed_assignments")
      .select("id, bed_id, cabin_id")
      .eq("visit_id", params.visitId)
      .eq("organization_id", session.organizationId);

    if (bedAssigns && bedAssigns.length > 0) {
      for (const bedAssign of bedAssigns) {
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
        await supabase
          .from("bed_assignments")
          .update({
            status: "VACATED",
            vacated_at: new Date().toISOString(),
          })
          .eq("organization_id", session.organizationId)
          .eq("id", bedAssign.id);
      }
    }

    // Reconcile ghost bed vacancy drift
    await supabase.rpc("reconcile_bed_vacancy_drift_atomic", {
      p_org_id: session.organizationId,
    });

    await supabase
      .from("patient_visits")
      .update({ status: "DISCHARGED" })
      .eq("organization_id", session.organizationId)
      .eq("id", params.visitId);

    // Audit Log
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
        summary_id: summaryId,
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
 * 10.1 Get Discharge Summary Record by Visit ID
 */
export async function getDischargeSummaryAction(params: {
  visitId: string;
}): Promise<ActionResult<{ summary: DischargeSummary }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("discharge_summaries")
      .select("*")
      .eq("visit_id", params.visitId)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: "Discharge certificate not found." };
    }

    return { success: true, data: { summary: data as unknown as DischargeSummary } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Error retrieving discharge summary." };
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
        .update({ status: "CLEANING_REQUIRED" }) .eq("organization_id", session.organizationId) .eq("id", params.fromBedId);
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
      .or("is_deleted.is.null,is_deleted.eq.false")
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
    age?: number;
    age_years?: number;
    age_months?: number;
    age_days?: number;
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
      opdFee?: number;
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
      dailyRate?: number;
      dailyServiceCharge?: number;
      admissionFee?: number;
      provisionalDiagnosis?: string;
      referralAgentId?: string;
    };
    criticalCare?: {
      enabled: boolean;
      unitId?: string;
      bedNumber?: string;
      dailyCharge?: number;
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
    diagnostics?: {
      enabled: boolean;
      testIds?: string[];
      notes?: string;
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
  diagnosticOrderId?: string;
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
        ot: {
          ...(payload.services.ot || {}),
          enabled: !!payload.services.ot?.enabled,
          room_id: payload.services.ot?.roomId || null,
          ot_room_id: payload.services.ot?.roomId || null,
          surgeon_id: payload.services.ot?.surgeonId || null,
          lead_surgeon_id: payload.services.ot?.surgeonId || null,
          procedure_name: payload.services.ot?.procedureName || null,
          ot_charge: payload.services.ot?.estimatedCharge || 6000,
          anesthesia_type: payload.services.ot?.anesthesiaType || "GENERAL",
          scheduled_start: payload.services.ot?.scheduledStart || null,
        },
      },
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
      ot: {
        ...(payload.services.ot || {}),
        enabled: !!payload.services.ot?.enabled,
        room_id: payload.services.ot?.roomId || null,
        ot_room_id: payload.services.ot?.roomId || null,
        surgeon_id: payload.services.ot?.surgeonId || null,
        lead_surgeon_id: payload.services.ot?.surgeonId || null,
        procedure_name: payload.services.ot?.procedureName || null,
        ot_charge: payload.services.ot?.estimatedCharge || 6000,
        anesthesia_type: payload.services.ot?.anesthesiaType || "GENERAL",
        scheduled_start: payload.services.ot?.scheduledStart || null,
      },
    };

    const { data, error } = await supabase.rpc("create_patient_intake_atomic", {
      p_request: rpcRequest,
    });

    if (error) {
      const message = error.message || "Unified patient intake transaction failed.";
      const readable =
        message.includes("DUPLICATE_NID") ? "This National ID (NID) / Birth Certificate number is already registered for another patient in this hospital." :
        message.includes("BED_NOT_VACANT") || message.includes("BED_UNAVAILABLE") || message.includes("DOUBLE_ASSIGNMENT_PREVENTED") || message.includes("idx_unique_active_bed_assignment") || message.includes("CONCURRENCY_CONFLICT") ? "The selected bed is already occupied or unavailable. Please select another bed." :
        message.includes("CABIN_NOT_VACANT") || message.includes("CABIN_UNAVAILABLE") || message.includes("idx_unique_active_cabin_assignment") ? "The selected cabin is already occupied or unavailable. Please select another cabin." :
        message.includes("CRITICAL_CARE_BED_OCCUPIED") || message.includes("CRITICAL_CARE_BED_NOT_FOUND") || message.includes("CRITICAL_CARE_BED_NOT_VACANT") || message.includes("CRITICAL_CARE_BED_UNAVAILABLE") || message.includes("CRITICAL_CARE_DOUBLE_ASSIGNMENT") ? "The selected Critical Care bed is already occupied or unavailable. Please select another bed." :
        message.includes("CRITICAL_CARE_UNIT_INACTIVE") ? "The selected Critical Care unit is currently inactive." :
        message.includes("CRITICAL_CARE_UNIT_AND_BED_REQUIRED") ? "Both Critical Care unit and bed number are required." :
        message.includes("PERMISSION_DENIED_INTAKE") || message.includes("PERMISSION_DENIED_PATIENT_INTAKE") ? "You do not have permission to register or admit patients." :
        message.includes("MARITAL_STATUS") ? "Patient registration schema is not fully updated. Apply the latest forward migration and refresh the API schema." :
        message.includes("PATIENT_NOT_FOUND") ? "The selected patient no longer exists in this hospital organization." :
        message.includes("OPD_DOCTOR_NOT_FOUND") || message.includes("IPD_DOCTOR_NOT_FOUND") ? "Selected doctor is inactive or unavailable." :
        message.includes("OPD_DEPARTMENT_NOT_FOUND") || message.includes("IPD_DEPARTMENT_NOT_FOUND") ? "Selected department is inactive or unavailable." :
        message.includes("TENANT_CONTEXT_MISMATCH") ? "Hospital organization context could not be verified." :
        message.includes("CALLER_MISMATCH") ? "Authenticated user context changed. Please refresh and retry." :
        message;

      await reportSystemRuntimeIncident({
        organizationId: session.organizationId,
        module: "Patient Intake & Admission",
        location: "public.create_patient_intake_atomic",
        severity: "CRITICAL",
        errorCode: "PATIENT_INTAKE_RPC_ERROR",
        title: "রোগী রেজিস্ট্রেশন বা ভর্তি ব্যর্থ হয়েছে (Patient Intake Failed)",
        reason: readable,
        recommendation: "প্রদত্ত তথ্যের সঠিকতা যাচাই করুন (NID, বেড নম্বর, ডক্টর সিলেকশন)।",
      });

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
      const msg = result?.error || "Unified patient intake did not complete.";
      await reportSystemRuntimeIncident({
        organizationId: session.organizationId,
        module: "Patient Intake & Admission",
        location: "public.create_patient_intake_atomic",
        severity: "CRITICAL",
        errorCode: "PATIENT_INTAKE_INCOMPLETE",
        title: "রোগী রেজিস্ট্রেশন অসফল (Incomplete Intake)",
        reason: msg,
        recommendation: "রোগীর তথ্য পুনরায় যাচাই করে চেষ্টা করুন।",
      });
      return { success: false, error: msg };
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

    let diagnosticOrderId: string | undefined;
    if (payload.services?.diagnostics?.enabled && payload.services.diagnostics.testIds && payload.services.diagnostics.testIds.length > 0) {
      const diagDoctorId = payload.services.ipd?.doctorId || payload.services.opd?.doctorId || payload.services.criticalCare?.doctorId || null;
      const visitId =
        result.ipd_visit_id ||
        result.opd_visit_id ||
        (result as { critical_care_visit_id?: string }).critical_care_visit_id ||
        null;

      try {
        const { data: diagRes, error: diagErr } = await supabase.rpc("create_diagnostic_order_atomic", {
          p_org_id: session.organizationId,
          p_patient_id: result.patient_id,
          p_test_ids: payload.services.diagnostics.testIds,
          p_doctor_id: diagDoctorId,
          p_visit_id: visitId,
          p_clinical_notes: payload.services.diagnostics.notes || "Intake Diagnostic Investigation Order",
        });

        if (diagRes && (diagRes as { order_id?: string }).order_id) {
          diagnosticOrderId = (diagRes as { order_id?: string }).order_id;
        } else if (diagErr) {
          console.warn("[createUnifiedPatientIntakeAction] Diagnostic order notice:", diagErr.message);
        }
      } catch (diagExc) {
        console.error("[createUnifiedPatientIntakeAction] Diagnostic order exception:", diagExc);
      }
    }

    if (payload.referralAgentId && result.patient_id) {
      try {
        const { data: ag } = await supabase
          .from("referral_agents")
          .select("id, agent_code, full_name")
          .eq("id", payload.referralAgentId)
          .maybeSingle();

        if (ag?.id) {
          const visitId = result.ipd_visit_id || result.opd_visit_id || null;
          const { data: existingAttr } = await supabase
            .from("patient_referral_attributions")
            .select("id")
            .eq("patient_id", result.patient_id)
            .eq("referral_agent_id", ag.id)
            .eq("status", "ACTIVE")
            .limit(1)
            .maybeSingle();

          if (!existingAttr?.id) {
            await supabase.from("patient_referral_attributions").insert({
              organization_id: session.organizationId,
              patient_id: result.patient_id,
              visit_id: visitId,
              referral_agent_id: ag.id,
              referral_code_snapshot: ag.agent_code,
              referral_name_snapshot: ag.full_name,
              assigned_by: session.userId,
              status: "ACTIVE",
              notes: "Attributed during patient intake registration",
            });
          }
        }
      } catch (attrErr) {
        console.warn("[createUnifiedPatientIntakeAction] Attribution notice:", attrErr);
      }
    }

    // Auto-resolve any previous intake incidents upon successful completion
    await resolveSystemRuntimeIncident({
      organizationId: session.organizationId,
      module: "Patient Intake & Admission",
    });

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
        diagnosticOrderId,
        encounterAt: result.encounter_at || encounterAt.toISOString(),
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unified patient intake transaction failed.";
    if (session?.organizationId) {
      await reportSystemRuntimeIncident({
        organizationId: session.organizationId,
        module: "Patient Intake & Admission",
        location: "lib/patient/actions.ts:createUnifiedPatientIntakeAction",
        severity: "CRITICAL",
        errorCode: "INTAKE_ACTION_EXCEPTION",
        title: "রোগী ভর্তি প্রক্রিয়ায় অপ্রত্যাশিত ত্রুটি",
        reason: errorMsg,
        recommendation: "পৃষ্ঠাটি রিফ্রেশ করে পুনরায় চেষ্টা করুন।",
      });
    }
    return {
      success: false,
      error: errorMsg,
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
    diagnosticTests: Array<{ id: string; test_name: string; test_code: string; price: number }>;
  }>
> {
  const session = await getCurrentUserSession();
  const orgId = session.organizationId;
  const supabase = await createClient();

  try {
    const [depRes, docRes, bedRes, cabinRes, unitRes, otRes, refRes, testRes, asgRes] = await Promise.allSettled([
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
      orgId
        ? supabase.from("diagnostic_tests").select("id, test_name, test_code, price").eq("organization_id", orgId).eq("is_active", true).order("test_name")
        : supabase.from("diagnostic_tests").select("id, test_name, test_code, price").eq("is_active", true).order("test_name"),
      orgId
        ? supabase.from("bed_assignments").select("bed_id, cabin_id").eq("organization_id", orgId).eq("status", "ACTIVE")
        : supabase.from("bed_assignments").select("bed_id, cabin_id").eq("status", "ACTIVE"),
    ]);

    const activeAssignments = asgRes && asgRes.status === "fulfilled" && asgRes.value.data
      ? (asgRes.value.data as Array<{ bed_id?: string | null; cabin_id?: string | null }>)
      : [];
    const activeBedIds = new Set<string>();
    const activeCabinIds = new Set<string>();
    for (const asg of activeAssignments) {
      if (asg.bed_id) activeBedIds.add(asg.bed_id);
      if (asg.cabin_id) activeCabinIds.add(asg.cabin_id);
    }

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
          status: activeBedIds.has(b.id) ? "OCCUPIED" : b.status,
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
      ? (cabinRes.value.data as Array<{ id: string; cabin_number: string; status: string; daily_rate: number; cabin_type?: string }>).map(c => ({
          ...c,
          status: activeCabinIds.has(c.id) ? "OCCUPIED" : c.status,
          daily_rate: Number(c.daily_rate || 2500),
        }))
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

    const diagnosticTests = testRes.status === "fulfilled" && testRes.value.data && testRes.value.data.length > 0
      ? (testRes.value.data as Array<{ id: string; test_name: string; test_code: string; price: number }>).map(t => ({
          ...t,
          price: Number(t.price || 0),
        }))
      : [
          { id: "test-cbc-01", test_name: "Complete Blood Count (CBC)", test_code: "CBC-001", price: 400 },
          { id: "test-rbs-01", test_name: "Random Blood Sugar (RBS)", test_code: "RBS-001", price: 150 },
          { id: "test-sc-01", test_name: "Serum Creatinine", test_code: "CREAT-001", price: 350 },
          { id: "test-cxr-01", test_name: "Chest X-Ray P/A View", test_code: "CXR-001", price: 600 },
          { id: "test-ecg-01", test_name: "12-Lead Electrocardiogram (ECG)", test_code: "ECG-001", price: 400 },
        ];

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
        diagnosticTests,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load intake dropdown options.",
    };
  }
}

/**
 * 13. Update Patient Demographics & Contact Records
 * Allows hospital staff to correct patient details while strictly preserving
 * immutable identifiers (patient_code, id) and financial invariants.
 */
export async function updatePatientAction(
  input: UpdatePatientInput
): Promise<ActionResult<{ patient: PatientMaster }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized: Valid hospital session required." };
  }

  const canEdit =
    (await hasPermission("patients.edit")) ||
    (await hasPermission("patients.create")) ||
    (await hasPermission("patients.manage"));
  if (!canEdit) {
    return { success: false, error: "403 Forbidden: patients.edit or patients.create permission required." };
  }

  if (!input.patientId) {
    return { success: false, error: "Patient identifier is required." };
  }

  if (!input.fullName || input.fullName.trim().length < 2) {
    return { success: false, error: "Patient full name is required (at least 2 characters)." };
  }

  const normalizedPhone = normalizeBDPhone(input.phone);
  if (!isValidNormalizedBDPhone(normalizedPhone)) {
    return { success: false, error: "A valid 11-digit Bangladeshi mobile number is required (01xxxxxxxxx)." };
  }

  if (input.nid && input.nid.trim().length > 0) {
    const cleanNid = input.nid.trim().replace(/[\s-]/g, "");
    if (!/^\d{10}$|^\d{13}$|^\d{17}$/.test(cleanNid)) {
      return {
        success: false,
        error: "NID / জন্ম নিবন্ধন নম্বরটি সঠিক নয় (১০, ১৩ বা ১৭ ডিজিটের সংখ্যা হতে হবে; ঐচ্ছিক ক্ষেত্র — না থাকলে ফাঁকা রাখুন)।",
      };
    }
  }

  try {
    const supabase = await createClient();

    // Verify patient exists and belongs to organization
    const { data: existingPatient, error: fetchErr } = await supabase
      .from("patients")
      .select("*")
      .eq("id", input.patientId)
      .eq("organization_id", session.organizationId)
      .single();

    if (fetchErr || !existingPatient) {
      return { success: false, error: "Patient record not found in this hospital organization." };
    }

    const { data: updatedPatient, error: updateErr } = await supabase
      .from("patients")
      .update({
        full_name: input.fullName.trim(),
        phone: input.phone.trim(),
        normalized_phone: normalizedPhone,
        alternate_phone: input.alternatePhone ? normalizeBDPhone(input.alternatePhone) : null,
        gender: input.gender,
        dob: input.dob || null,
        blood_group: input.bloodGroup || "UNKNOWN",
        marital_status: input.maritalStatus || null,
        occupation: input.occupation || null,
        nid: input.nid?.trim() || null,
        nid_or_birth_cert: input.nid?.trim() || null,
        address: input.address?.trim() || null,
        age: input.age !== undefined && input.age !== null ? input.age : (existingPatient.age ?? null),
        age_months: input.age_months !== undefined ? input.age_months : (existingPatient.age_months ?? null),
        age_days: input.age_days !== undefined ? input.age_days : (existingPatient.age_days ?? null),
        guardian_name: input.guardianName?.trim() || existingPatient.guardian_name || null,
        emergency_contact_name: input.emergencyName?.trim() || null,
        emergency_contact_phone: input.emergencyPhone ? normalizeBDPhone(input.emergencyPhone) : null,
        emergency_contact_relation: input.emergencyRelation?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.patientId)
      .eq("organization_id", session.organizationId)
      .select("*")
      .single();

    if (updateErr || !updatedPatient) {
      return { success: false, error: updateErr?.message || "Failed to update patient record." };
    }

    // Synchronize auxiliary patient tables
    if (input.nid && input.nid.trim().length > 0) {
      const cleanNid = input.nid.trim().replace(/[\s-]/g, "");
      const { data: existingNid } = await supabase
        .from("patient_identifications")
        .select("id")
        .eq("patient_id", input.patientId)
        .eq("id_type", "NID")
        .maybeSingle();

      if (existingNid) {
        await supabase
          .from("patient_identifications")
          .update({ id_number: cleanNid })
          .eq("id", existingNid.id);
      } else {
        await supabase
          .from("patient_identifications")
          .insert({
            patient_id: input.patientId,
            id_type: "NID",
            id_number: cleanNid,
            is_verified: false,
          });
      }
    }

    if (input.address && input.address.trim().length > 0) {
      const { data: existingAddr } = await supabase
        .from("patient_addresses")
        .select("id")
        .eq("patient_id", input.patientId)
        .eq("address_type", "PRESENT")
        .maybeSingle();

      if (existingAddr) {
        await supabase
          .from("patient_addresses")
          .update({ street_address: input.address.trim() })
          .eq("id", existingAddr.id);
      } else {
        await supabase
          .from("patient_addresses")
          .insert({
            patient_id: input.patientId,
            address_type: "PRESENT",
            street_address: input.address.trim(),
            district: null,
            division: null,
          });
      }
    }

    if (input.emergencyName && input.emergencyName.trim().length > 0) {
      const { data: existingContact } = await supabase
        .from("patient_contacts")
        .select("id")
        .eq("patient_id", input.patientId)
        .eq("is_primary_emergency", true)
        .maybeSingle();

      if (existingContact) {
        await supabase
          .from("patient_contacts")
          .update({
            contact_name: input.emergencyName.trim(),
            relationship: input.emergencyRelation?.trim() || "Guardian",
            phone: input.emergencyPhone ? normalizeBDPhone(input.emergencyPhone) : "",
          })
          .eq("id", existingContact.id);
      } else {
        await supabase
          .from("patient_contacts")
          .insert({
            patient_id: input.patientId,
            contact_name: input.emergencyName.trim(),
            relationship: input.emergencyRelation?.trim() || "Guardian",
            phone: input.emergencyPhone ? normalizeBDPhone(input.emergencyPhone) : "",
            is_primary_emergency: true,
          });
      }
    }

    // Audit trail
    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "UPDATE",
      module: "PATIENT",
      entityType: "patient",
      entityId: input.patientId,
      oldValues: {
        full_name: existingPatient.full_name,
        phone: existingPatient.phone,
        gender: existingPatient.gender,
        blood_group: existingPatient.blood_group,
        address: existingPatient.address,
        nid: existingPatient.nid,
      },
      newValues: {
        full_name: updatedPatient.full_name,
        phone: updatedPatient.phone,
        gender: updatedPatient.gender,
        blood_group: updatedPatient.blood_group,
        address: updatedPatient.address,
        nid: updatedPatient.nid,
      },
    });

    return {
      success: true,
      data: { patient: updatedPatient as unknown as PatientMaster },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update patient record.",
    };
  }
}

/**
 * 13B. Safe Patient Record Archive & Deletion Server Actions
 * Follows healthcare clinical-record governance:
 * - Defaults strictly to logical ARCHIVE (soft delete) preserving clinical, financial, and audit history.
 * - Explicitly requires 'patients.delete' or 'patients.manage' ('patients.edit' is denied).
 * - Provides controlled restorePatientAction and strict zero-history purgePatientAction.
 */
export async function deletePatientAction(
  patientId: string,
  reason?: string
): Promise<ActionResult<{ deletedId: string; archived: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized: Valid hospital session required." };
  }

  // Strict Permission Check: Demographics edit permission MUST NOT permit record deletion/archival
  const canDelete =
    (await hasPermission("patients.delete")) ||
    (await hasPermission("patients.manage"));
  if (!canDelete) {
    return { success: false, error: "403 Forbidden: Insufficient permission to archive or delete patient records." };
  }

  if (!patientId) {
    return { success: false, error: "Patient identifier is required." };
  }

  try {
    const supabase = await createClient();

    // Verify patient exists and belongs to this organization
    const { data: existingPatient, error: fetchErr } = await supabase
      .from("patients")
      .select("id, full_name, patient_code, phone")
      .eq("id", patientId)
      .eq("organization_id", session.organizationId)
      .single();

    if (fetchErr || !existingPatient) {
      return { success: false, error: "Patient record not found in this hospital organization." };
    }

    // Clinical Standard: Always perform safe logical ARCHIVE (soft-delete) first
    // Never physically delete patient clinical history on routine UI delete action
    const { error: archiveErr } = await supabase
      .from("patients")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: session.userId,
        deletion_reason: reason || "Archived from Patient Registry",
        updated_at: new Date().toISOString(),
      })
      .eq("id", patientId)
      .eq("organization_id", session.organizationId);

    if (archiveErr) {
      return { success: false, error: `Failed to archive patient record: ${archiveErr.message}` };
    }

    // Record immutable audit log
    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "DELETE",
      module: "PATIENT",
      entityType: "patient",
      entityId: patientId,
      oldValues: {
        full_name: existingPatient.full_name,
        patient_code: existingPatient.patient_code,
        phone: existingPatient.phone,
        reason: reason || "Archived from Patient Registry",
        archived_at: new Date().toISOString(),
      },
    });

    return {
      success: true,
      data: { deletedId: patientId, archived: true },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to archive patient record.",
    };
  }
}

/**
 * 13C. Restore Archived Patient Server Action
 * Restores a logically archived patient back into the active registry.
 */
export async function restorePatientAction(
  patientId: string
): Promise<ActionResult<{ restoredId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized: Valid hospital session required." };
  }

  const canRestore =
    (await hasPermission("patients.delete")) ||
    (await hasPermission("patients.manage"));
  if (!canRestore) {
    return { success: false, error: "403 Forbidden: Insufficient permission to restore patient records." };
  }

  if (!patientId) {
    return { success: false, error: "Patient identifier is required." };
  }

  try {
    const supabase = await createClient();

    const { data: existingPatient, error: fetchErr } = await supabase
      .from("patients")
      .select("id, full_name, patient_code")
      .eq("id", patientId)
      .eq("organization_id", session.organizationId)
      .single();

    if (fetchErr || !existingPatient) {
      return { success: false, error: "Patient record not found in this hospital organization." };
    }

    const { error: restoreErr } = await supabase
      .from("patients")
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", patientId)
      .eq("organization_id", session.organizationId);

    if (restoreErr) {
      return { success: false, error: `Failed to restore patient: ${restoreErr.message}` };
    }

    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "UPDATE",
      module: "PATIENT",
      entityType: "patient",
      entityId: patientId,
      newValues: {
        is_deleted: false,
        restored_at: new Date().toISOString(),
      },
    });

    return {
      success: true,
      data: { restoredId: patientId },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to restore patient record.",
    };
  }
}

/**
 * 13D. Mistaken-Registration Narrow Purge Server Action
 * Permanently deletes an accidental empty registration ONLY IF zero financial,
 * clinical, or encounter history exists.
 */
export async function purgePatientAction(
  patientId: string,
  reason: string
): Promise<ActionResult<{ purgedId: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized: Valid hospital session required." };
  }

  const isSuperadmin = (await hasPermission("superadmin")) || (await hasPermission("patients.manage"));
  if (!isSuperadmin) {
    return { success: false, error: "403 Forbidden: Permanent purge requires superadmin or executive hospital management privilege." };
  }

  if (!patientId) {
    return { success: false, error: "Patient identifier is required." };
  }
  if (!reason || reason.trim().length < 5) {
    return { success: false, error: "Explicit audit reason (minimum 5 characters) is required for permanent record purge." };
  }

  try {
    const supabase = await createClient();

    // Verify patient has ZERO clinical or financial attachments
    const [invCheck, visitCheck, apptCheck] = await Promise.all([
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("patient_id", patientId).eq("organization_id", session.organizationId),
      supabase.from("patient_visits").select("id", { count: "exact", head: true }).eq("patient_id", patientId).eq("organization_id", session.organizationId),
      supabase.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", patientId).eq("organization_id", session.organizationId),
    ]);

    if ((invCheck.count || 0) > 0 || (visitCheck.count || 0) > 0 || (apptCheck.count || 0) > 0) {
      return {
        success: false,
        error: "PURGE_BLOCKED: Patient has linked clinical or financial history (invoices, admissions, or appointments). Permanent purge is strictly forbidden. Use Archive Patient instead.",
      };
    }

    // Cascade remove non-financial intake and attribution attachments for accidental registrations
    await supabase.from("patient_episodes").delete().eq("patient_id", patientId).eq("organization_id", session.organizationId);
    await supabase.from("emergency_registrations").delete().eq("patient_id", patientId).eq("organization_id", session.organizationId);
    await supabase.from("patient_referral_attributions").delete().eq("patient_id", patientId).eq("organization_id", session.organizationId);

    const { error: purgeErr } = await supabase
      .from("patients")
      .delete()
      .eq("id", patientId)
      .eq("organization_id", session.organizationId);

    if (purgeErr) {
      return { success: false, error: `Failed to purge patient record: ${purgeErr.message}` };
    }

    await recordAuditLog({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "DELETE",
      module: "PATIENT",
      entityType: "patient",
      entityId: patientId,
      oldValues: { reason, purged_permanently: true },
    });

    return {
      success: true,
      data: { purgedId: patientId },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to purge patient record.",
    };
  }
}

/**
 * 14. Fetch Comprehensive Patient Registration & Intake Dossier
 * Retrieves complete intake records across demographics, admission, bed, CCU, OT,
 * diagnoses, and billing so staff can review or print the file anytime.
 */
export async function getPatientIntakeDossierAction(
  patientId: string
): Promise<ActionResult<PatientIntakeDossier>> {
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

    const { data: patient, error: pErr } = await supabase
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .eq("organization_id", session.organizationId)
      .single();

    if (pErr || !patient) {
      return { success: false, error: "Patient record not found." };
    }

    // Inpatient Admission
    const { data: admissionData } = await supabase
      .from("inpatient_admissions")
      .select(`
        id,
        admission_date,
        status,
        discharge_date,
        admission_discount_percent,
        admission_discount_reason,
        provisional_diagnosis,
        referral_agent_id,
        referral_agents (full_name, agent_code)
      `)
      .eq("patient_id", patientId)
      .order("admission_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    let assignedBedNumber: string | null = null;
    let assignedCabinNumber: string | null = null;
    let wardName: string | null = null;

    if (admissionData?.id) {
      const { data: bedAssign } = await supabase
        .from("ipd_bed_assignments")
        .select(`
          bed_id,
          beds (bed_number, daily_rate, ward_name),
          cabin_id,
          cabins (cabin_number, daily_rate)
        `)
        .eq("admission_id", admissionData.id)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bedAssign) {
        const bedObj = bedAssign.beds as unknown as { bed_number?: string; ward_name?: string } | null;
        const cabinObj = bedAssign.cabins as unknown as { cabin_number?: string } | null;
        if (bedObj?.bed_number) {
          assignedBedNumber = bedObj.bed_number;
          wardName = bedObj.ward_name || null;
        }
        if (cabinObj?.cabin_number) {
          assignedCabinNumber = cabinObj.cabin_number;
        }
      }
    }

    // OPD Consultation
    const { data: opdData } = await supabase
      .from("opd_consultations")
      .select(`
        id,
        consultation_date,
        status,
        chief_complaint,
        doctors (full_name, specialization),
        departments (name)
      `)
      .eq("patient_id", patientId)
      .order("consultation_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Critical Care
    const { data: ccuData } = await supabase
      .from("critical_care_admissions")
      .select(`
        id,
        admitted_at,
        status,
        bed_number,
        initial_diagnosis,
        ventilator_required,
        critical_care_units (unit_name, unit_type),
        doctors (full_name)
      `)
      .eq("patient_id", patientId)
      .order("admitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // OT Booking
    const { data: otData } = await supabase
      .from("ot_bookings")
      .select(`
        id,
        procedure_name,
        scheduled_start,
        status,
        anesthesia_type,
        ot_rooms (room_name, room_number),
        doctors (full_name)
      `)
      .eq("patient_id", patientId)
      .order("scheduled_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Visits and Vitals
    const { data: visits } = await supabase
      .from("patient_visits")
      .select("id")
      .eq("patient_id", patientId)
      .order("admitted_at", { ascending: false });

    const visitIds = visits?.map((v) => v.id) || [];
    let latestVitals: VitalSigns | null = null;
    if (visitIds.length > 0) {
      const { data: vtData } = await supabase
        .from("vital_signs")
        .select("*")
        .in("visit_id", visitIds)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (vtData) latestVitals = vtData as unknown as VitalSigns;
    }

    // Diagnoses
    const { data: diagData } = await supabase
      .from("patient_diagnoses")
      .select("icd_code, diagnosis_name, diagnosis_type, recorded_at")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false })
      .limit(5);

    // Recent Invoices
    const { data: invData } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, discount_amount, paid_amount, due_amount, payment_status, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(5);

    const refAgent = admissionData?.referral_agents as unknown as { full_name?: string; agent_code?: string } | null;
    const opdDoc = opdData?.doctors as unknown as { full_name?: string } | null;
    const opdDept = opdData?.departments as unknown as { name?: string } | null;
    const ccuUnit = ccuData?.critical_care_units as unknown as { unit_name?: string; unit_type?: string } | null;
    const ccuDoc = ccuData?.doctors as unknown as { full_name?: string } | null;
    const otRoom = otData?.ot_rooms as unknown as { room_name?: string; room_number?: string } | null;
    const otDoc = otData?.doctors as unknown as { full_name?: string } | null;

    const dossier: PatientIntakeDossier = {
      patient: patient as unknown as PatientMaster,
      registrationDetails: {
        registeredAt: patient.created_at,
        registrationSerial: patient.registration_serial || patient.patient_code,
        patientCode: patient.patient_code,
      },
      inpatientAdmission: admissionData
        ? {
            id: admissionData.id,
            admissionDate: admissionData.admission_date,
            status: admissionData.status,
            dischargeDate: admissionData.discharge_date,
            admissionDiscountPercent: admissionData.admission_discount_percent,
            admissionDiscountReason: admissionData.admission_discount_reason,
            assignedBedNumber,
            assignedCabinNumber,
            wardName,
            provisionalDiagnosis: admissionData.provisional_diagnosis,
            referralAgentName: refAgent?.full_name || null,
            referralAgentCode: refAgent?.agent_code || null,
          }
        : null,
      opdEncounter: opdData
        ? {
            id: opdData.id,
            encounterDate: opdData.consultation_date,
            status: opdData.status,
            departmentName: opdDept?.name || null,
            doctorName: opdDoc?.full_name || null,
            chiefComplaint: opdData.chief_complaint || null,
          }
        : null,
      criticalCareAdmission: ccuData
        ? {
            id: ccuData.id,
            admittedAt: ccuData.admitted_at,
            status: ccuData.status,
            unitName: ccuUnit?.unit_name || null,
            unitType: ccuUnit?.unit_type || null,
            bedNumber: ccuData.bed_number,
            doctorName: ccuDoc?.full_name || null,
            initialDiagnosis: ccuData.initial_diagnosis || null,
            ventilatorRequired: ccuData.ventilator_required,
          }
        : null,
      otBooking: otData
        ? {
            id: otData.id,
            procedureName: otData.procedure_name,
            scheduledStart: otData.scheduled_start,
            status: otData.status,
            roomName: otRoom?.room_name || null,
            roomNumber: otRoom?.room_number || null,
            surgeonName: otDoc?.full_name || null,
            anesthesiaType: otData.anesthesia_type || null,
          }
        : null,
      latestVitals,
      diagnoses: (diagData || []).map((d) => ({
        diagnosisCode: d.icd_code || undefined,
        diagnosisName: d.diagnosis_name,
        diagnosisType: d.diagnosis_type,
        recordedAt: d.recorded_at,
      })),
      recentInvoices: (invData || []).map((i) => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        totalAmount: Number(i.total_amount || 0),
        discountAmount: Number(i.discount_amount || 0),
        paidAmount: Number(i.paid_amount || 0),
        dueAmount: Number(i.due_amount || 0),
        paymentStatus: i.payment_status,
        createdAt: i.created_at,
      })),
    };

    return {
      success: true,
      data: dossier,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to load patient intake dossier.",
    };
  }
}

/**
 * Cancel or permanently delete an accidental/mistake IPD admission.
 * Atomically releases all assigned beds/cabins to VACANT and cleans up unbilled snapshots.
 */
export async function cancelOrDeleteIpdAdmissionAction(params: {
  visitId: string;
  reason?: string;
  permanentDelete?: boolean;
}): Promise<ActionResult<{ success: boolean; mode: string; message: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  const canManage =
    (await hasPermission("ipd.manage")) ||
    (await hasPermission("ipd.admit")) ||
    (await hasPermission("ipd.discharge")) ||
    (await hasPermission("patients.delete"));

  if (!canManage) {
    return { success: false, error: "403 Forbidden: IPD admission management permission required." };
  }

  try {
    const supabase = await createClient();
    const reason = params.reason?.trim() || "Mistake admission entry cancelled by admin";
    const permanentDelete = params.permanentDelete !== undefined ? params.permanentDelete : true;

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("cancel_or_delete_ipd_admission_atomic", {
      p_org_id: session.organizationId,
      p_visit_id: params.visitId,
      p_admin_id: session.userId,
      p_reason: reason,
      p_permanent_delete: permanentDelete,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || "Failed to cancel/delete admission." };
    }

    const res = rpcRes as { success?: boolean; mode?: string; message?: string; error?: string };
    if (res && res.success === false) {
      return { success: false, error: res.error || "Failed to cancel/delete admission." };
    }

    // Reconcile ghost bed vacancy drift
    await supabase.rpc("reconcile_bed_vacancy_drift_atomic", {
      p_org_id: session.organizationId,
    });

    return {
      success: true,
      data: {
        success: true,
        mode: res?.mode || (permanentDelete ? "DELETED" : "CANCELLED"),
        message: res?.message || "Admission successfully removed and beds vacated.",
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error cancelling/deleting admission",
    };
  }
}


export async function updateIpdAdmissionAction(params: {
  visitId: string;
  provisionalDiagnosis?: string;
  doctorId?: string;
  guardianName?: string;
  guardianPhone?: string;
  notes?: string;
}): Promise<ActionResult<{ message: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  const canManage =
    (await hasPermission("ipd.manage")) ||
    (await hasPermission("ipd.admit")) ||
    (await hasPermission("doctors.manage"));

  if (!canManage) {
    return { success: false, error: "403 Forbidden: Insufficient permissions to edit admission details." };
  }

  try {
    const supabase = await createClient();
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("update_ipd_admission_atomic", {
      p_org_id: session.organizationId,
      p_visit_id: params.visitId,
      p_user_id: session.userId,
      p_provisional_diagnosis: params.provisionalDiagnosis?.trim() || null,
      p_doctor_id: params.doctorId || null,
      p_guardian_name: params.guardianName?.trim() || null,
      p_guardian_phone: params.guardianPhone?.trim() || null,
      p_notes: params.notes?.trim() || null,
    });

    if (rpcErr) {
      return { success: false, error: rpcErr.message || "Failed to update admission details." };
    }

    const res = rpcRes as { success?: boolean; message?: string; error?: string };
    if (res && res.success === false) {
      return { success: false, error: res.error || "Failed to update admission details." };
    }

    return {
      success: true,
      data: {
        message: res?.message || "Admission details updated successfully.",
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error updating admission details",
    };
  }
}
