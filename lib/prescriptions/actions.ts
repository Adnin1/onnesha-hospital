import { createClient } from "@/lib/supabase/client";
import { getCurrentUserSession, hasPermission, requirePermission } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { PrescriptionRecord, PrescriptionItemRecord } from "@/types/clinical-emr";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Create Digital Prescription (Rx)
 */
export async function createPrescriptionAction(params: {
  patientId: string;
  doctorId: string;
  visitId?: string;
  chiefComplaints?: string;
  clinicalFindings?: string;
  diagnosis: string;
  investigationAdvice?: string;
  generalAdvice?: string;
  followupDate?: string;
  items: Array<{
    medicineName: string;
    genericName?: string;
    dosagePattern: string; // e.g. 1+0+1
    duration: string; // e.g. 7 days
    mealInstruction?: string; // After meal
    specialNotes?: string;
  }>;
}): Promise<ActionResult<{ prescription: PrescriptionRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("prescriptions.create");
  } catch {
    const canPrescribe =
      (await hasPermission("prescriptions.manage")) ||
      (await hasPermission("doctors.manage")) ||
      (await hasPermission("opd.consult")) ||
      (await hasPermission("ipd.manage")) ||
      session.roles.includes("super_admin") ||
      session.roles.includes("hospital_administrator") ||
      session.roles.includes("admin") ||
      session.roles.includes("doctor") ||
      session.roles.includes("receptionist") ||
      session.roles.includes("nurse");

    if (!canPrescribe) {
      return { success: false, error: "403 Forbidden: Insufficient permissions to issue prescription." };
    }
  }

  if (!params.diagnosis.trim()) {
    return { success: false, error: "Clinical diagnosis is mandatory for prescription issuance." };
  }

  try {
    const supabase = await createClient();

    // Verify patient and doctor exist
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id, full_name, degrees, designation, specialization, bmdc_reg_number, room_number")
      .eq("id", params.doctorId)
      .maybeSingle();

    const { data: patient } = await supabase
      .from("patients")
      .select("id, patient_code, full_name, gender, phone")
      .eq("id", params.patientId)
      .maybeSingle();

    if (!doctor) {
      return { success: false, error: "নির্বাচিত ডাক্তার পাওয়া যায়নি (Doctor not found). অনুগ্রহ করে ডাক্তার নির্বাচন করুন।" };
    }
    if (!patient) {
      return { success: false, error: "নির্বাচিত রোগী পাওয়া যায়নি (Patient not found). অনুগ্রহ করে রোগী নির্বাচন করুন।" };
    }

    // 1. Try master atomic database RPC first
    const itemsJson = (params.items || []).map((item) => ({
      medicine_name: item.medicineName,
      generic_name: item.genericName || null,
      dosage_pattern: item.dosagePattern,
      duration: item.duration,
      meal_instruction: item.mealInstruction || "After meal",
      special_notes: item.specialNotes || null,
    }));

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("create_digital_prescription_atomic", {
      p_org_id: session.organizationId,
      p_doctor_id: params.doctorId,
      p_patient_id: params.patientId,
      p_diagnosis: params.diagnosis.trim(),
      p_chief_complaints: params.chiefComplaints || null,
      p_clinical_findings: params.clinicalFindings || null,
      p_investigation_advice: params.investigationAdvice || null,
      p_general_advice: params.generalAdvice || null,
      p_followup_date: params.followupDate || null,
      p_visit_id: params.visitId || null,
      p_items: itemsJson,
      p_user_id: session.userId,
    });

    if (!rpcErr && rpcRes && (rpcRes as { success?: boolean }).success) {
      const rxId = (rpcRes as { prescription_id: string }).prescription_id;
      const { data: fullRxRow } = await supabase
        .from("prescriptions")
        .select("*, prescription_items(*)")
        .eq("id", rxId)
        .single();

      if (fullRxRow) {
        return {
          success: true,
          data: {
            prescription: {
              ...fullRxRow,
              items: (fullRxRow.prescription_items as unknown as PrescriptionItemRecord[]) || [],
              patient,
              doctor,
            },
          },
        };
      }
    }

    // 2. Direct fallback if RPC is not present
    let visitId = params.visitId || null;
    if (!visitId) {
      const { data: activeVisit } = await supabase
        .from("patient_visits")
        .select("id")
        .eq("organization_id", session.organizationId)
        .eq("patient_id", params.patientId)
        .in("status", ["admitted", "in_progress", "registered", "ADMITTED", "IN_PROGRESS", "REGISTERED", "ACTIVE"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeVisit?.id) {
        visitId = activeVisit.id;
      }
    }

    // Insert prescription master
    const { data: rx, error: rxErr } = await supabase
      .from("prescriptions")
      .insert({
        organization_id: session.organizationId,
        patient_id: params.patientId,
        doctor_id: params.doctorId,
        visit_id: visitId,
        chief_complaints: params.chiefComplaints || null,
        clinical_findings: params.clinicalFindings || null,
        diagnosis: params.diagnosis,
        investigation_advice: params.investigationAdvice || null,
        general_advice: params.generalAdvice || null,
        followup_date: params.followupDate || null,
      })
      .select()
      .single();

    if (rxErr || !rx) {
      return { success: false, error: rxErr?.message || "Failed to create prescription" };
    }

    // Insert line items
    const lineItems: PrescriptionItemRecord[] = [];
    if (params.items && params.items.length > 0) {
      const itemsToInsert = params.items.map((item, idx) => ({
        prescription_id: rx.id,
        medicine_name: item.medicineName,
        generic_name: item.genericName || null,
        dosage_pattern: item.dosagePattern,
        duration: item.duration,
        meal_instruction: item.mealInstruction || "After meal",
        special_notes: item.specialNotes || null,
        display_order: idx + 1,
      }));

      const { data: savedItems } = await supabase
        .from("prescription_items").insert(itemsToInsert)
        .select();

      if (savedItems) {
        lineItems.push(...(savedItems as unknown as PrescriptionItemRecord[]));
      }
    }

    // Audit log
    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "PATIENT",
      entityType: "prescription",
      entityId: rx.id,
      newValues: {
        diagnosis: params.diagnosis,
        patientId: params.patientId,
        doctorId: params.doctorId,
        itemCount: params.items.length,
      },
    });

    const fullRx: PrescriptionRecord = {
      ...rx,
      items: lineItems,
      patient,
      doctor,
    };

    return { success: true, data: { prescription: fullRx } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Prescription action failed";
    return { success: false, error: msg };
  }
}

/**
 * 2. Get Prescriptions for Patient or Organization
 */
export async function getPrescriptionsAction(params?: {
  patientId?: string;
  limit?: number;
}): Promise<ActionResult<{ prescriptions: PrescriptionRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("prescriptions")
      .select("*, prescription_items(*), patients(id, patient_code, full_name, gender, phone), doctors(id, full_name, degrees, designation, specialization, bmdc_reg_number, room_number)")
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 20);

    if (params?.patientId) {
      query = query.eq("patient_id", params.patientId);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    interface RxDbRow {
      id: string;
      organization_id: string;
      visit_id?: string;
      patient_id: string;
      doctor_id: string;
      chief_complaints?: string;
      clinical_findings?: string;
      diagnosis?: string;
      investigation_advice?: string;
      general_advice?: string;
      followup_date?: string;
      created_at: string;
      updated_at: string;
      prescription_items?: PrescriptionItemRecord[];
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        gender: string;
        phone: string;
      } | null;
      doctors?: {
        id: string;
        full_name: string;
        degrees: string;
        designation: string;
        specialization: string;
        bmdc_reg_number: string;
        room_number: string;
      } | null;
    }

    const list: PrescriptionRecord[] = ((data || []) as unknown as RxDbRow[]).map((r) => ({
      ...r,
      items: r.prescription_items || [],
      patient: r.patients || undefined,
      doctor: r.doctors || undefined,
    }));

    return { success: true, data: { prescriptions: list } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load prescriptions";
    return { success: false, error: msg };
  }
}

/**
 * 3. Delete / Void Mistake Prescription
 */
export async function deletePrescriptionAction(params: {
  prescriptionId: string;
}): Promise<ActionResult<{ success: boolean; message: string }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  const canDelete =
    (await hasPermission("prescriptions.delete")) ||
    (await hasPermission("prescriptions.manage")) ||
    session.roles.includes("super_admin") ||
    session.roles.includes("hospital_administrator") ||
    session.roles.includes("admin") ||
    session.roles.includes("doctor") ||
    session.roles.includes("receptionist");

  if (!canDelete) {
    return { success: false, error: "403 Forbidden: Insufficient permissions to delete prescription." };
  }

  try {
    const supabase = await createClient();

    // 1. Delete line items first
    await supabase
      .from("prescription_items")
      .delete()
      .eq("prescription_id", params.prescriptionId);

    // 2. Delete prescription
    const { error } = await supabase
      .from("prescriptions")
      .delete()
      .eq("id", params.prescriptionId)
      .eq("organization_id", session.organizationId);

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "DELETE",
      module: "PATIENT",
      entityType: "prescription",
      entityId: params.prescriptionId,
    });

    return {
      success: true,
      data: {
        success: true,
        message: "ডিজিটাল প্রেসক্রিপশন সফলভাবে মুছে ফেলা হয়েছে।",
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete prescription.",
    };
  }
}


