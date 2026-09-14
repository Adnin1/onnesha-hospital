import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
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

    let patientCode = codeData;
    if (codeErr || !patientCode) {
      // Fallback timestamp code if function unavailable
      patientCode = `OH-${Date.now().toString().slice(-6)}`;
    }

    // Insert Patient Master
    const { data: newPatient, error: insertErr } = await supabase
      .from("patients")
      .insert({
        organization_id: session.organizationId,
        patient_code: patientCode,
        full_name: formData.fullName.trim(),
        phone: formData.phone.trim(),
        normalized_phone: normalizedPhone,
        alternate_phone: formData.alternatePhone ? normalizeBDPhone(formData.alternatePhone) : null,
        gender: formData.gender,
        dob: formData.dob || null,
        blood_group: formData.bloodGroup || "UNKNOWN",
        marital_status: formData.maritalStatus || null,
        occupation: formData.occupation || null,
        created_by: session.userId,
      })
      .select("*")
      .single();

    if (insertErr || !newPatient) {
      return { success: false, error: insertErr?.message || "Failed to register patient record." };
    }

    // Insert Identification if provided
    if (formData.nid) {
      await supabase.from("patient_identifications").insert({
        patient_id: newPatient.id,
        id_type: "NID",
        id_number: formData.nid.trim().replace(/[\s-]/g, ""),
        is_verified: false,
      });
    }

    // Insert Address if provided
    if (formData.address) {
      await supabase.from("patient_addresses").insert({
        patient_id: newPatient.id,
        address_type: "PRESENT",
        street_address: formData.address.trim(),
        district: "Dhaka",
        division: "Dhaka",
      });
    }

    // Insert Emergency Contact if provided
    if (formData.emergencyName && formData.emergencyPhone) {
      await supabase.from("patient_contacts").insert({
        patient_id: newPatient.id,
        contact_name: formData.emergencyName.trim(),
        relationship: formData.emergencyRelation || "Guardian",
        phone: normalizeBDPhone(formData.emergencyPhone),
        is_primary_emergency: true,
      });
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
      const q = params.query.trim();
      const normPhone = normalizeBDPhone(q);

      query = query.or(
        `patient_code.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%,normalized_phone.ilike.%${normPhone}%`
      );
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

    // Generate atomic visit number
    const { data: visitNoData } = await supabase.rpc("generate_visit_number", {
      p_organization_id: session.organizationId,
      p_type: "OPD",
    });

    const visitNumber = visitNoData || `OPD-${Date.now().toString().slice(-6)}`;

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

    // Handle Unknown/Unidentified Emergency Patient Registration
    if (!targetPatientId) {
      const tempId = `TEMP-EMG-${Date.now().toString().slice(-4)}`;
      const { data: tempPatient, error: tempErr } = await supabase
        .from("patients")
        .insert({
          organization_id: session.organizationId,
          patient_code: tempId,
          full_name: params.unknownPatientName || `Unknown Emergency Patient (${tempId})`,
          phone: "01700000000",
          normalized_phone: "01700000000",
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
    }

    // Generate Emergency Visit Number
    const { data: visitNoData } = await supabase.rpc("generate_visit_number", {
      p_organization_id: session.organizationId,
      p_type: "EMERGENCY",
    });
    const visitNumber = visitNoData || `EMG-${Date.now().toString().slice(-6)}`;

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

  // Validate Ranges
  if (params.systolicBp && (params.systolicBp < 40 || params.systolicBp > 300)) {
    return { success: false, error: "Systolic BP out of valid physiological range (40-300 mmHg)." };
  }
  if (params.temperatureC && (params.temperatureC < 30 || params.temperatureC > 45)) {
    return { success: false, error: "Temperature out of valid range (30-45 °C)." };
  }

  try {
    const supabase = await createClient();

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

  if (!params.diagnosisName || params.diagnosisName.trim().length < 2) {
    return { success: false, error: "Diagnosis name is required." };
  }

  try {
    const supabase = await createClient();

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

  if (!params.noteContent || params.noteContent.trim().length < 2) {
    return { success: false, error: "Clinical note content cannot be empty." };
  }

  try {
    const supabase = await createClient();

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
}): Promise<ActionResult<{ visit: PatientVisit }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "Unauthorized session." };
  }

  try {
    await requirePermission("ipd.view");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();

    // Generate atomic visit number
    const { data: visitNoData } = await supabase.rpc("generate_visit_number", {
      p_organization_id: session.organizationId,
      p_type: "IPD",
    });
    const visitNumber = visitNoData || `IPD-${Date.now().toString().slice(-6)}`;

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
        .eq("id", params.bedId);
    }

    // Record initial provisional diagnosis
    await recordDiagnosisAction({
      patientId: params.patientId,
      visitId: newVisit.id,
      diagnosisName: params.provisionalDiagnosis,
      diagnosisType: "PROVISIONAL",
    });

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
      .eq("id", params.visitId);

    // 4. Release Bed Assignment if any
    const { data: bedAssign } = await supabase
      .from("bed_assignments")
      .select("id, bed_id")
      .eq("visit_id", params.visitId)
      .eq("status", "ACTIVE")
      .single();

    if (bedAssign) {
      await supabase
        .from("bed_assignments")
        .update({ status: "DISCHARGED", discharged_at: new Date().toISOString() })
        .eq("id", bedAssign.id);

      if (bedAssign.bed_id) {
        await supabase
          .from("beds")
          .update({ status: "VACANT" })
          .eq("id", bedAssign.bed_id);
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

    // Verify Destination Bed Availability (no two active patients can occupy one bed)
    const { data: targetBed, error: tbErr } = await supabase
      .from("beds")
      .select("id, status, bed_number")
      .eq("id", params.toBedId)
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
        .eq("visit_id", params.visitId)
        .eq("bed_id", params.fromBedId)
        .eq("status", "ACTIVE");

      await supabase
        .from("beds")
        .update({ status: "CLEANING_REQUIRED" })
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
      const term = `%${params.query.trim()}%`;
      q = q.or(`full_name.ilike.${term},patient_code.ilike.${term},phone.ilike.${term}`);
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

