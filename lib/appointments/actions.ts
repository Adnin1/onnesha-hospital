import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import {
  DoctorRecord,
  DoctorScheduleRecord,
  AppointmentRecord,
  WaitingQueueRecord,
} from "@/types/appointments";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 1. Get All Doctors for Active Organization
 */
export async function getDoctorsAction(): Promise<ActionResult<{ doctors: DoctorRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("doctors")
      .select("*, departments(name)")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    interface DoctorDbRow extends Omit<DoctorRecord, "department_name"> {
      departments?: { name: string } | null;
    }

    const doctors: DoctorRecord[] = ((data || []) as unknown as DoctorDbRow[]).map((d) => ({
      ...d,
      department_name: d.departments?.name || "General Medicine",
    }));

    return { success: true, data: { doctors } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error loading doctors";
    return { success: false, error: msg };
  }
}

/**
 * 2. Get Doctor Schedules
 */
export async function getDoctorSchedulesAction(
  doctorId: string
): Promise<ActionResult<{ schedules: DoctorScheduleRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("doctor_schedules")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("doctor_id", doctorId)
      .eq("is_active", true);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { schedules: (data || []) as unknown as DoctorScheduleRecord[] } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error loading schedules";
    return { success: false, error: msg };
  }
}

/**
 * 3. Book Appointment / Issue Token Action
 */
export async function bookAppointmentAction(params: {
  patientId: string;
  doctorId: string;
  scheduleId?: string;
  appointmentDate?: string;
  source?: "WALKIN" | "ONLINE" | "PHONE" | "EMERGENCY";
  notes?: string;
}): Promise<ActionResult<{ appointment: AppointmentRecord; tokenNumber: number }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    await requirePermission("appointments.create");
  } catch (permErr: unknown) {
    const msg = permErr instanceof Error ? permErr.message : "403 Forbidden";
    return { success: false, error: msg };
  }

  const apptDate = params.appointmentDate || new Date().toISOString().split("T")[0];
  const source = params.source || "WALKIN";

  try {
    const supabase = await createClient();

    const { data: doctor, error: docError } = await supabase
      .from("doctors")
      .select("id, full_name, room_number, opd_fee")
      .eq("id", params.doctorId)
      .single();

    if (docError || !doctor) {
      return { success: false, error: "Doctor not found" };
    }

    const { data: tokenData, error: tokenErr } = await supabase.rpc("get_next_token", {
      p_org_id: session.organizationId,
      p_doctor_id: params.doctorId,
      p_date: apptDate,
    });

    if (tokenErr || !tokenData) {
      return { success: false, error: tokenErr?.message || "Failed to allocate atomic token number." };
    }
    const nextToken = Number(tokenData);

    const { data: appt, error: apptError } = await supabase
      .from("appointments")
      .insert({
        organization_id: session.organizationId,
        patient_id: params.patientId,
        doctor_id: params.doctorId,
        schedule_id: params.scheduleId || null,
        appointment_date: apptDate,
        token_number: nextToken,
        source,
        status: "WAITING",
        payment_status: "PENDING",
        booked_by: session.userId,
        patient_notes: params.notes || null,
      })
      .select("*, patients(id, patient_code, full_name, phone, gender, blood_group)")
      .single();

    if (apptError || !appt) {
      return { success: false, error: apptError?.message || "Failed to book appointment" };
    }

    await supabase.from("waiting_queue").insert({
      organization_id: session.organizationId,
      appointment_id: appt.id,
      doctor_id: params.doctorId,
      room_number: doctor.room_number || "Chamber 101",
      token_number: nextToken,
      queue_status: "WAITING",
    });

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "APPOINTMENT",
      entityType: "appointment",
      entityId: appt.id,
      newValues: {
        tokenNumber: nextToken,
        doctorId: params.doctorId,
        patientId: params.patientId,
        appointmentDate: apptDate,
      },
    });

    interface ApptWithPatientRow extends Omit<AppointmentRecord, "patient"> {
      patients?: {
        id: string;
        patient_code: string;
        full_name: string;
        phone: string;
        gender: string;
        blood_group?: string;
      } | null;
    }

    const row = appt as unknown as ApptWithPatientRow;
    const formattedAppt: AppointmentRecord = {
      ...row,
      patient: row.patients || undefined,
      doctor: {
        id: doctor.id,
        full_name: doctor.full_name,
        specialization: "",
        room_number: doctor.room_number,
        opd_fee: Number(doctor.opd_fee) || 800,
      },
    };

    return {
      success: true,
      data: {
        appointment: formattedAppt,
        tokenNumber: nextToken,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Booking error";
    return { success: false, error: msg };
  }
}

/**
 * 4. Get Live Waiting Queue for Doctor / Reception
 */
export async function getLiveWaitingQueueAction(
  doctorId?: string
): Promise<ActionResult<{ queue: WaitingQueueRecord[] }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    let query = supabase
      .from("waiting_queue")
      .select("*, appointments(id, token_number, patients(id, patient_code, full_name, phone)), doctors(id, full_name, room_number)")
      .eq("organization_id", session.organizationId)
      .in("queue_status", ["WAITING", "CALLED", "IN_ROOM"])
      .order("token_number", { ascending: true });

    if (doctorId) {
      query = query.eq("doctor_id", doctorId);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: error.message };
    }

    interface QueueDbRow {
      id: string;
      organization_id: string;
      appointment_id: string;
      doctor_id: string;
      room_number: string;
      token_number: number;
      queue_status: "WAITING" | "CALLED" | "IN_ROOM" | "COMPLETED" | "SKIPPED";
      called_at?: string;
      started_at?: string;
      finished_at?: string;
      created_at: string;
      appointments?: {
        id: string;
        token_number: number;
        patients?: {
          id: string;
          patient_code: string;
          full_name: string;
          phone: string;
        } | null;
      } | null;
      doctors?: {
        id: string;
        full_name: string;
        room_number: string;
      } | null;
    }

    const queue: WaitingQueueRecord[] = ((data || []) as unknown as QueueDbRow[]).map((q) => ({
      id: q.id,
      organization_id: q.organization_id,
      appointment_id: q.appointment_id,
      doctor_id: q.doctor_id,
      room_number: q.room_number || q.doctors?.room_number || "Chamber",
      token_number: q.token_number,
      queue_status: q.queue_status,
      status: q.queue_status,
      called_at: q.called_at,
      started_at: q.started_at,
      finished_at: q.finished_at,
      created_at: q.created_at,
      patient_name: q.appointments?.patients?.full_name || "Patient",
      patient_code: q.appointments?.patients?.patient_code || "",
      patient_phone: q.appointments?.patients?.phone || "",
      doctor_name: q.doctors?.full_name || "Doctor",
      patient: q.appointments?.patients || undefined,
      doctor: q.doctors || undefined,
    }));

    return { success: true, data: { queue } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Queue error";
    return { success: false, error: msg };
  }
}

/**
 * 5. Update Queue Status (Call Token, In Room, Complete, Skip)
 */
export async function updateQueueStatusAction(params: {
  queueId: string;
  status: "WAITING" | "CALLED" | "IN_ROOM" | "COMPLETED" | "SKIPPED";
}): Promise<ActionResult<{ updated: boolean }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  try {
    const supabase = await createClient();
    const updatePayload: Record<string, unknown> = {
      queue_status: params.status,
    };

    if (params.status === "CALLED") {
      updatePayload.called_at = new Date().toISOString();
    } else if (params.status === "IN_ROOM") {
      updatePayload.started_at = new Date().toISOString();
    } else if (params.status === "COMPLETED" || params.status === "SKIPPED") {
      updatePayload.finished_at = new Date().toISOString();
    }

    const { data: qItem, error } = await supabase
      .from("waiting_queue")
      .update(updatePayload)
      .eq("id", params.queueId)
      .eq("organization_id", session.organizationId)
      .select("appointment_id, token_number")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (params.status === "CALLED" && qItem) {
      await supabase.from("token_calls").insert({
        waiting_queue_id: params.queueId,
        called_by: session.userId,
      });
    }

    if (qItem?.appointment_id) {
      let apptStatus = "WAITING";
      if (params.status === "IN_ROOM") apptStatus = "IN_CHAMBER";
      else if (params.status === "COMPLETED") apptStatus = "COMPLETED";
      else if (params.status === "SKIPPED") apptStatus = "NO_SHOW";

      await supabase
        .from("appointments")
        .update({ status: apptStatus })
        .eq("id", qItem.appointment_id);
    }

    return { success: true, data: { updated: true } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Status update error";
    return { success: false, error: msg };
  }
}

