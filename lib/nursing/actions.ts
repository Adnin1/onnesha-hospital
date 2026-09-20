import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { PERMISSIONS } from "@/lib/permissions";

export type NursingShift = "MORNING" | "EVENING" | "NIGHT";

export interface NursingNoteRecord {
  id: string;
  organization_id: string;
  visit_id?: string | null;
  patient_id: string;
  nurse_id: string;
  shift: NursingShift;
  note_text: string;
  created_at: string;
  nurse?: { full_name: string } | null;
  patient?: { full_name: string; patient_code: string } | null;
}

export interface PatientVitalsRoundRecord {
  id: string;
  organization_id: string;
  visit_id?: string | null;
  patient_id: string;
  nurse_id: string;
  temperature?: number | null;
  blood_pressure?: string | null;
  pulse?: number | null;
  respiratory_rate?: number | null;
  spo2?: number | null;
  blood_glucose?: number | null;
  round_time: string;
  created_at: string;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Fetch Nursing Notes
 */
export async function getNursingNotesAction(params?: {
  visit_id?: string;
  patient_id?: string;
  limit?: number;
}): Promise<ActionResult<{ notes: NursingNoteRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("nursing_notes")
      .select(`
        *,
        nurse:profiles (full_name),
        patient:patients (full_name, patient_code)
      `)
      .eq("organization_id", session.organizationId)
      .order("created_at", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.visit_id) {
      query = query.eq("visit_id", params.visit_id);
    }
    if (params?.patient_id) {
      query = query.eq("patient_id", params.patient_id);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { notes: (data as unknown as NursingNoteRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch nursing notes";
    return { success: false, error: msg };
  }
}

/**
 * 2. Create Nursing Note
 */
export async function createNursingNoteAction(input: {
  visit_id?: string;
  patient_id: string;
  shift: NursingShift;
  note_text: string;
}): Promise<ActionResult<{ note: NursingNoteRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.NURSING_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient nursing permissions";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nursing_notes")
      .insert({
        organization_id: session.organizationId,
        visit_id: input.visit_id || null,
        patient_id: input.patient_id,
        nurse_id: session.userId,
        shift: input.shift,
        note_text: input.note_text.trim(),
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "NURSING",
      entityType: "nursing_notes",
      entityId: data.id,
      newValues: { patient_id: input.patient_id, shift: input.shift },
    });

    return { success: true, data: { note: data as NursingNoteRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create nursing note";
    return { success: false, error: msg };
  }
}

/**
 * 3. Fetch Patient Vitals Rounds
 */
export async function getPatientVitalsRoundsAction(params?: {
  visit_id?: string;
  patient_id?: string;
  limit?: number;
}): Promise<ActionResult<{ rounds: PatientVitalsRoundRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("patient_vitals_rounds")
      .select("*")
      .eq("organization_id", session.organizationId)
      .order("round_time", { ascending: false })
      .limit(params?.limit || 50);

    if (params?.visit_id) {
      query = query.eq("visit_id", params.visit_id);
    }
    if (params?.patient_id) {
      query = query.eq("patient_id", params.patient_id);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { rounds: (data as PatientVitalsRoundRecord[]) || [] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch patient vitals rounds";
    return { success: false, error: msg };
  }
}

/**
 * 4. Record Patient Vitals Round
 */
export async function recordPatientVitalsRoundAction(input: {
  visit_id?: string;
  patient_id: string;
  temperature?: number;
  blood_pressure?: string;
  pulse?: number;
  respiratory_rate?: number;
  spo2?: number;
  blood_glucose?: number;
}): Promise<ActionResult<{ round: PatientVitalsRoundRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission(PERMISSIONS.NURSING_MANAGE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Forbidden: insufficient nursing permissions";
    return { success: false, error: msg };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("patient_vitals_rounds")
      .insert({
        organization_id: session.organizationId,
        visit_id: input.visit_id || null,
        patient_id: input.patient_id,
        nurse_id: session.userId,
        temperature: input.temperature || null,
        blood_pressure: input.blood_pressure?.trim() || null,
        pulse: input.pulse || null,
        respiratory_rate: input.respiratory_rate || null,
        spo2: input.spo2 || null,
        blood_glucose: input.blood_glucose || null,
        round_time: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId || undefined,
      action: "CREATE",
      module: "NURSING",
      entityType: "patient_vitals_rounds",
      entityId: data.id,
      newValues: { patient_id: input.patient_id, bp: input.blood_pressure, pulse: input.pulse },
    });

    return { success: true, data: { round: data as PatientVitalsRoundRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to record patient vitals round";
    return { success: false, error: msg };
  }
}
