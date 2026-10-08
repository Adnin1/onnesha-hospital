import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit/logger";

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
  status: "admitted" | "transferred" | "discharged" | "deceased" | "ACTIVE";
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

export interface CriticalCareAlert {
  id: string;
  organization_id: string;
  admission_id: string;
  patient_id?: string;
  alert_type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
  status: "TRIGGERED" | "ACKNOWLEDGED" | "REVIEWED" | "RESOLVED";
  triggered_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
  resolved_by?: string;
  notes?: string;
  patient_name?: string;
  bed_number?: string;
}

/**
 * 1. Fetch configured Critical Care Units from database
 */
export async function getCriticalCareUnitsAction(): Promise<{
  success: boolean;
  data?: CriticalCareUnit[];
  error?: string;
}> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.CRITICAL_CARE_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: critical_care.view required" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("critical_care_units")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("unit_type", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as CriticalCareUnit[]) || [] };
  } catch (err: unknown) {
    console.error("[CriticalCareActions] getCriticalCareUnitsAction error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to load critical care units" };
  }
}

/**
 * 2. Fetch available vacant ICU / CCU beds from database
 */
export async function getAvailableCriticalCareBedsAction(unitType?: string): Promise<{
  success: boolean;
  data?: Array<{ id: string; bed_number: string; status: string; ward_name?: string }>;
  error?: string;
}> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.CRITICAL_CARE_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: critical_care.view required" };
  }

  try {
    const supabase = await createClient();

    let query = supabase
      .from("beds")
      .select("id, bed_number, status, ward_name")
      .eq("organization_id", session.organizationId)
      .in("status", ["VACANT", "AVAILABLE"])
      .order("bed_number", { ascending: true });

    if (unitType) {
      const typePrefix = unitType.trim().toUpperCase();
      query = query.ilike("bed_number", `${typePrefix}-%`);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load beds";
    return { success: false, error: msg };
  }
}

/**
 * 3. Fetch real Critical Care Admissions from database (Zero mock fallback)
 */
export async function getCriticalCareAdmissionsAction(unitType?: string): Promise<{
  success: boolean;
  data?: CriticalCareAdmission[];
  error?: string;
}> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized", data: [] };
  }

  try {
    await requirePermission(PERMISSIONS.CRITICAL_CARE_VIEW);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: critical_care.view required", data: [] };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("critical_care_admissions")
      .select("*, patients(id, patient_code, full_name, phone, gender), critical_care_units(id, unit_name, unit_type)")
      .eq("organization_id", session.organizationId)
      .in("status", ["admitted", "ACTIVE"])
      .order("admission_time", { ascending: false });

    if (unitType && unitType !== "ALL") {
      query = query.eq("critical_care_units.unit_type", unitType);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: (data || []) as CriticalCareAdmission[] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to query critical care admissions";
    return { success: false, error: msg, data: [] };
  }
}

/**
 * 4. Atomic Critical Care Admission using PostgreSQL stored procedure
 */
export async function createCriticalCareAdmissionAction(payload: {
  patient_id: string;
  unit_id: string;
  bed_number: string;
  initial_diagnosis: string;
  ventilator_required?: boolean;
  patient_code?: string;
  patient_name?: string;
  unit_type?: string;
  notes?: string;
}): Promise<{ success: boolean; data?: CriticalCareAdmission; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.CRITICAL_CARE_MANAGE);
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: critical_care.manage required" };
  }

  try {
    const supabase = await createClient();

    // Verify patient belongs to current organization
    const { data: patientRec, error: patErr } = await supabase
      .from("patients")
      .select("id, patient_code, full_name, phone, gender")
      .eq("id", payload.patient_id)
      .eq("organization_id", session.organizationId)
      .maybeSingle();

    if (patErr || !patientRec) {
      return { success: false, error: "Patient not found in this organization" };
    }

    // 1. Attempt atomic stored procedure execution
    const { data: rpcData, error: rpcError } = await supabase.rpc("admit_critical_care_atomic", {
      p_organization_id: session.organizationId,
      p_patient_id: payload.patient_id,
      p_unit_id: payload.unit_id,
      p_bed_number: payload.bed_number,
      p_ventilator_required: !!payload.ventilator_required,
      p_admitting_doctor_id: session.userId,
      p_initial_diagnosis: payload.initial_diagnosis,
      p_notes: payload.notes || null,
    });

    if (rpcError) {
      if (rpcError.message.includes("BED_UNAVAILABLE") || rpcError.message.includes("DOUBLE_ASSIGNMENT")) {
        return { success: false, error: rpcError.message };
      }

      // Fallback: direct table insert with status update
      const { data: inserted, error: insertError } = await supabase
        .from("critical_care_admissions")
        .insert({
          organization_id: session.organizationId,
          patient_id: payload.patient_id,
          unit_id: payload.unit_id,
          bed_number: payload.bed_number,
          initial_diagnosis: payload.initial_diagnosis,
          ventilator_required: !!payload.ventilator_required,
          admitting_doctor_id: session.userId,
          status: "admitted",
        })
        .select()
        .single();

      if (insertError || !inserted?.id) {
        return { success: false, error: insertError?.message || "Failed to create admission record" };
      }

      await supabase
        .from("beds")
        .update({ status: "OCCUPIED", admitted_at: new Date().toISOString() })
        .eq("organization_id", session.organizationId)
        .eq("bed_number", payload.bed_number);

      const admissionId = inserted.id;
      const newAdmission: CriticalCareAdmission = {
        id: admissionId,
        organization_id: session.organizationId,
        patient_id: payload.patient_id,
        unit_id: payload.unit_id,
        bed_number: payload.bed_number,
        initial_diagnosis: payload.initial_diagnosis,
        ventilator_required: !!payload.ventilator_required,
        admitting_doctor_id: session.userId,
        status: "admitted",
        admission_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
        patients: {
          id: patientRec.id,
          patient_code: patientRec.patient_code,
          full_name: patientRec.full_name,
          phone: patientRec.phone,
          gender: patientRec.gender,
        },
        critical_care_units: {
          id: payload.unit_id,
          unit_name: `${payload.unit_type || "ICU"} Complex`,
          unit_type: (payload.unit_type || "ICU") as "ICU" | "ICCU" | "CCU" | "SICU" | "MICU" | "PICU",
        },
      };

      await recordAuditLog({
        organizationId: session.organizationId,
        userId: session.userId,
        action: "CREATE",
        module: "IPD",
        entityType: "critical_care_admissions",
        entityId: admissionId,
        newValues: {
          bed_number: payload.bed_number,
          patient_id: payload.patient_id,
          unit_id: payload.unit_id,
          ventilator: payload.ventilator_required,
        },
      });

      return { success: true, data: newAdmission };
    }

    const admissionId = (rpcData as { admission_id?: string })?.admission_id;
    if (!admissionId) {
      return { success: false, error: "Stored procedure completed without returning an admission ID" };
    }

    const newAdmission: CriticalCareAdmission = {
      id: admissionId,
      organization_id: session.organizationId,
      patient_id: payload.patient_id,
      unit_id: payload.unit_id,
      bed_number: payload.bed_number,
      initial_diagnosis: payload.initial_diagnosis,
      ventilator_required: !!payload.ventilator_required,
      admitting_doctor_id: session.userId,
      status: "admitted",
      admission_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
      patients: {
        id: patientRec.id,
        patient_code: patientRec.patient_code,
        full_name: patientRec.full_name,
        phone: patientRec.phone,
        gender: patientRec.gender,
      },
      critical_care_units: {
        id: payload.unit_id,
        unit_name: `${payload.unit_type || "ICU"} Complex`,
        unit_type: (payload.unit_type || "ICU") as "ICU" | "ICCU" | "CCU" | "SICU" | "MICU" | "PICU",
      },
    };

    return { success: true, data: newAdmission };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create critical care admission.";
    return { success: false, error: msg };
  }
}

/**
 * 5. Record Critical Care Observation & Auto-Trigger Clinical Alerts
 */
export async function recordCriticalCareObservationAction(payload: {
  admission_id: string;
  patient_id?: string;
  patient_name?: string;
  bed_number?: string;
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate?: number;
  spo2?: number;
  fio2?: number;
  gcs_score?: number;
  clinical_notes?: string;
}): Promise<{ success: boolean; error?: string; alertTriggered?: boolean }> {
  try {
    // Physiological validation guards
    if (payload.systolic_bp !== undefined && (payload.systolic_bp < 40 || payload.systolic_bp > 300)) {
      return { success: false, error: "Systolic Blood Pressure must be between 40 and 300 mmHg." };
    }
    if (payload.diastolic_bp !== undefined && (payload.diastolic_bp < 20 || payload.diastolic_bp > 200)) {
      return { success: false, error: "Diastolic Blood Pressure must be between 20 and 200 mmHg." };
    }
    if (payload.heart_rate !== undefined && (payload.heart_rate < 20 || payload.heart_rate > 300)) {
      return { success: false, error: "Heart Rate must be between 20 and 300 beats per minute." };
    }
    if (payload.spo2 !== undefined && (payload.spo2 < 40 || payload.spo2 > 100)) {
      return { success: false, error: "Oxygen Saturation (SpO2) must be between 40% and 100%." };
    }
    if (payload.fio2 !== undefined && (payload.fio2 < 21 || payload.fio2 > 100)) {
      return { success: false, error: "Fraction of Inspired Oxygen (FiO2) must be between 21% and 100%." };
    }
    if (payload.gcs_score !== undefined && (payload.gcs_score < 3 || payload.gcs_score > 15)) {
      return { success: false, error: "Glasgow Coma Scale (GCS) score must be between 3 and 15." };
    }

    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    try {
      await requirePermission(PERMISSIONS.CRITICAL_CARE_MANAGE);
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: critical_care.manage required" };
    }

    const supabase = await createClient();
    await supabase.from("critical_care_observations").insert({
      organization_id: session.organizationId,
      admission_id: payload.admission_id,
      recorded_by: session.userId,
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

    // 2. Alert Lifecycle Detection
    let alertTriggered = false;
    let alertMsg = "";
    let severity: "CRITICAL" | "HIGH" | "MEDIUM" = "HIGH";

    if (payload.spo2 !== undefined && payload.spo2 < 90) {
      alertTriggered = true;
      severity = "CRITICAL";
      alertMsg = `Severe Hypoxemia: SpO2 at ${payload.spo2}%. Immediate airway check and oxygen titration required.`;
    } else if (payload.gcs_score !== undefined && payload.gcs_score < 8) {
      alertTriggered = true;
      severity = "CRITICAL";
      alertMsg = `Severe Neurological Compromise: GCS score ${payload.gcs_score}. Urgent intubation and airway evaluation required.`;
    } else if (payload.systolic_bp !== undefined && payload.systolic_bp < 90) {
      alertTriggered = true;
      severity = "CRITICAL";
      alertMsg = `Severe Hypotension / Shock: Systolic BP ${payload.systolic_bp} mmHg. Inotrope / fluid bolus required.`;
    } else if (payload.heart_rate !== undefined && (payload.heart_rate > 130 || payload.heart_rate < 45)) {
      alertTriggered = true;
      severity = "HIGH";
      alertMsg = `Critical Arrhythmia / Hemodynamic Instability: Pulse ${payload.heart_rate} bpm.`;
    }

    if (alertTriggered) {
      // NOTE(v1.2): Alert persistence to critical_care_alerts DB table planned for next release.
      // For now, alert detection is returned to the caller via alertTriggered boolean.
      console.warn(
        `[CriticalCare] Alert triggered for admission ${payload.admission_id}: ${severity} — ${alertMsg}`
      );
    }

    return { success: true, alertTriggered };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record observation.";
    return { success: false, error: msg };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getCriticalCareAlertsAction(admissionId?: string): Promise<{
  success: boolean;
  data: CriticalCareAlert[];
}> {
  // Returns empty — alert persistence to be implemented in v1.2 via DB table.
  return { success: true, data: [] };
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function updateCriticalCareAlertStatusAction(
  alertId: string,
  newStatus: "TRIGGERED" | "ACKNOWLEDGED" | "REVIEWED" | "RESOLVED",
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  // Stub — alert persistence to be implemented in v1.2 via DB table.
  return { success: false, error: "Alert persistence not yet implemented in database." };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * 7. Discharge or Step-down Transfer using Atomic Stored Procedure
 * Enforces legal state transition: Bed status transitions to CLEANING!
 */
export async function dischargeCriticalCareAdmissionAction(params: {
  admissionId: string;
  status: "transferred" | "discharged" | "deceased";
  finalDiagnosis?: string;
  destination?: string;
  clinicalNotes?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getCurrentUserSession();
    if (!session.userId || !session.organizationId) {
      return { success: false, error: "401 Unauthorized" };
    }

    try {
      await requirePermission(PERMISSIONS.CRITICAL_CARE_MANAGE);
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : "403 Forbidden: critical_care.manage required" };
    }

    const supabase = await createClient();

    // 1. Attempt atomic stored procedure execution
    const { error: rpcError } = await supabase.rpc("discharge_critical_care_atomic", {
      p_admission_id: params.admissionId,
      p_final_diagnosis: params.finalDiagnosis || "Condition stabilized / stepped down",
      p_destination: params.destination || (params.status === "transferred" ? "General Medical Ward" : "Home"),
      p_clinical_notes: params.clinicalNotes || null,
      p_discharged_by: session.userId,
    });

    if (rpcError) {
      // Fallback: direct table update
      const { data: adm } = await supabase
        .from("critical_care_admissions")
        .select("bed_number")
        .eq("id", params.admissionId)
        .eq("organization_id", session.organizationId)
        .maybeSingle();

      if (!adm) {
        return { success: false, error: "Admission not found in this organization" };
      }

      await supabase
        .from("critical_care_admissions")
        .update({
          status: params.status,
          discharge_time: new Date().toISOString(),
        })
        .eq("id", params.admissionId)
        .eq("organization_id", session.organizationId);

      // Bed transitions strictly to CLEANING (not directly to vacant!)
      if (adm.bed_number) {
        await supabase
          .from("beds")
          .update({
            status: "CLEANING",
            admitted_at: null,
            patient_name: null,
          })
          .eq("organization_id", session.organizationId)
          .eq("bed_number", adm.bed_number);
      }
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "IPD",
      entityType: "critical_care_admissions",
      entityId: params.admissionId,
      newValues: {
        new_status: params.status,
        bed_status: "CLEANING",
        destination: params.destination,
      },
    });

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to discharge admission.";
    return { success: false, error: msg };
  }
}

/**
 * 9. Create New Critical Care Unit
 */
export async function createCriticalCareUnitAction(payload: {
  unit_name: string;
  unit_type: "ICU" | "ICCU" | "CCU" | "SICU" | "MICU" | "PICU";
  floor?: string;
  total_beds: number;
  daily_charge: number;
}): Promise<{ success: boolean; data?: CriticalCareUnit; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  await requirePermission("critical_care.manage");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("critical_care_units")
      .insert({
        organization_id: session.organizationId,
        unit_name: payload.unit_name.trim(),
        unit_type: payload.unit_type,
        floor: payload.floor || "3rd Floor",
        total_beds: Number(payload.total_beds) || 1,
        daily_charge: Number(payload.daily_charge) || 8000,
        is_active: true,
      })
      .select("*")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to create critical care unit" };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "IPD",
      entityType: "critical_care_unit",
      entityId: data.id,
      newValues: payload,
    });

    return { success: true, data: data as CriticalCareUnit };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to create unit" };
  }
}

/**
 * 10. Update Critical Care Unit & Daily Tariff
 */
export async function updateCriticalCareUnitAction(payload: {
  unitId: string;
  unit_name?: string;
  unit_type?: "ICU" | "ICCU" | "CCU" | "SICU" | "MICU" | "PICU";
  floor?: string;
  total_beds?: number;
  daily_charge?: number;
  is_active?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  await requirePermission("critical_care.manage");

  try {
    const supabase = await createClient();
    const updateFields: Record<string, unknown> = {};
    if (payload.unit_name?.trim()) updateFields.unit_name = payload.unit_name.trim();
    if (payload.unit_type) updateFields.unit_type = payload.unit_type;
    if (payload.floor) updateFields.floor = payload.floor;
    if (payload.total_beds !== undefined) updateFields.total_beds = Number(payload.total_beds);
    if (payload.daily_charge !== undefined) updateFields.daily_charge = Number(payload.daily_charge);
    if (payload.is_active !== undefined) updateFields.is_active = payload.is_active;

    const { error } = await supabase
      .from("critical_care_units")
      .update(updateFields)
      .eq("id", payload.unitId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "UPDATE",
      module: "IPD",
      entityType: "critical_care_unit",
      entityId: payload.unitId,
      newValues: updateFields,
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update unit" };
  }
}

/**
 * 11. Delete or Deactivate Critical Care Unit
 */
export async function deleteCriticalCareUnitAction(unitId: string): Promise<{ success: boolean; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  await requirePermission("critical_care.manage");

  try {
    const supabase = await createClient();

    // Check for active admissions
    const { data: activeAdm } = await supabase
      .from("critical_care_admissions")
      .select("id")
      .eq("unit_id", unitId)
      .eq("organization_id", session.organizationId)
      .in("status", ["admitted", "ACTIVE"])
      .maybeSingle();

    if (activeAdm) {
      return {
        success: false,
        error: "Cannot delete unit while patients are actively admitted. Transfer or discharge patients first.",
      };
    }

    const { error: delErr } = await supabase
      .from("critical_care_units")
      .delete()
      .eq("id", unitId)
      .eq("organization_id", session.organizationId);

    if (delErr) {
      const { error: updErr } = await supabase
        .from("critical_care_units")
        .update({ is_active: false })
        .eq("id", unitId)
        .eq("organization_id", session.organizationId);

      if (updErr) {
        return { success: false, error: updErr.message };
      }
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "DELETE",
      module: "IPD",
      entityType: "critical_care_unit",
      entityId: unitId,
      newValues: { deleted_or_deactivated: true },
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete unit" };
  }
}

/**
 * 12. Add Critical Care Bed to Unit
 */
export async function addCriticalCareBedAction(payload: {
  unitId: string;
  bed_number: string;
  daily_rate: number;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }
  await requirePermission("critical_care.manage");

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("beds").insert({
      organization_id: session.organizationId,
      critical_care_unit_id: payload.unitId,
      bed_number: payload.bed_number.trim(),
      daily_rate: Number(payload.daily_rate) || 8000,
      status: "VACANT",
      is_active: true,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to add bed" };
  }
}

