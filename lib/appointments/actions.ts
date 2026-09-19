import { createClient } from "@/lib/supabase/client";
import { requirePermission, getCurrentUserSession } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/audit/logger";
import { getDhakaDateString } from "@/lib/datetime";
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
 * 2b. Create New Doctor
 */
export async function createDoctorAction(params: {
  fullName: string;
  specialization: string;
  bmdcRegNumber: string;
  degrees?: string;
  designation?: string;
  phone?: string;
  consultationFee?: number;
  departmentId?: string;
  roomNumber?: string;
}): Promise<ActionResult<{ doctor: DoctorRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  if (
    !params.fullName?.trim() ||
    !params.specialization?.trim() ||
    !params.bmdcRegNumber?.trim() ||
    !params.roomNumber?.trim() ||
    params.consultationFee === undefined ||
    params.consultationFee < 0
  ) {
    return {
      success: false,
      error: "Full name, specialization, BMDC reg number, room number, and valid consultation fee are required.",
    };
  }

  try {
    const supabase = await createClient();

    let deptId = params.departmentId;
    if (!deptId) {
      const { data: dept } = await supabase
        .from("departments")
        .select("id")
        .eq("organization_id", session.organizationId)
        .limit(1)
        .single();
      deptId = dept?.id;
    }

    const { data: newDoc, error } = await supabase
      .from("doctors")
      .insert({
        organization_id: session.organizationId,
        department_id: deptId,
        full_name: params.fullName.trim(),
        specialization: params.specialization.trim(),
        bmdc_reg_number: params.bmdcRegNumber.trim(),
        degrees: params.degrees?.trim() || "MBBS",
        designation: params.designation?.trim() || "Medical Officer",
        phone: params.phone?.trim() || null,
        opd_fee: params.consultationFee,
        room_number: params.roomNumber.trim(),
        is_active: true,
      })
      .select("*, departments(name)")
      .single();

    if (error || !newDoc) {
      return { success: false, error: error?.message || "Failed to add doctor" };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "APPOINTMENT",
      entityType: "doctor",
      entityId: newDoc.id,
      newValues: params,
    });

    interface DoctorDbRow extends Omit<DoctorRecord, "department_name"> {
      departments?: { name: string } | null;
    }

    const docRow = newDoc as unknown as DoctorDbRow;
    const doctor: DoctorRecord = {
      ...docRow,
      department_name: docRow.departments?.name || "General Medicine",
    };

    return { success: true, data: { doctor } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error creating doctor";
    return { success: false, error: msg };
  }
}

/**
 * 2c. Create / Publish Doctor Schedule
 */
export async function createDoctorScheduleAction(params: {
  doctorId: string;
  dayOfWeek: number | string;
  startTime: string;
  endTime: string;
  maxPatients?: number;
  roomNumber?: string;
  isPublished?: boolean;
}): Promise<ActionResult<{ schedule: DoctorScheduleRecord }>> {
  const session = await getCurrentUserSession();
  if (!session.userId || !session.organizationId) {
    return { success: false, error: "401 Unauthorized" };
  }

  if (params.endTime <= params.startTime) {
    return { success: false, error: "Invalid schedule: End time must be strictly after start time." };
  }

  if (params.maxPatients !== undefined && params.maxPatients <= 0) {
    return { success: false, error: "Invalid capacity: Max patients must be greater than 0." };
  }

  try {
    const supabase = await createClient();
    const isPublishedState = params.isPublished ?? true;

    const DAYS_MAP: Record<number, string> = {
      0: "SUNDAY",
      1: "MONDAY",
      2: "TUESDAY",
      3: "WEDNESDAY",
      4: "THURSDAY",
      5: "FRIDAY",
      6: "SATURDAY",
    };

    const canonicalDay =
      typeof params.dayOfWeek === "number"
        ? DAYS_MAP[params.dayOfWeek] || "SATURDAY"
        : String(params.dayOfWeek).toUpperCase().trim();

    const { data: sched, error } = await supabase
      .from("doctor_schedules")
      .insert({
        organization_id: session.organizationId,
        doctor_id: params.doctorId,
        day_of_week: canonicalDay,
        start_time: params.startTime,
        end_time: params.endTime,
        max_tokens: params.maxPatients || 30,
        room_number: params.roomNumber?.trim() || "",
        is_active: isPublishedState,
      })
      .select()
      .single();

    if (error || !sched) {
      return { success: false, error: error?.message || "Failed to create doctor schedule" };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "APPOINTMENT",
      entityType: "doctor_schedule",
      entityId: sched.id,
      newValues: { ...params, isPublished: isPublishedState },
    });

    return { success: true, data: { schedule: sched as unknown as DoctorScheduleRecord } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error creating schedule";
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

  const apptDate = params.appointmentDate || getDhakaDateString();
  const source = params.source || "WALKIN";

  try {
    const supabase = await createClient();

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("book_staff_appointment_atomic", {
      p_org_id: session.organizationId,
      p_patient_id: params.patientId,
      p_doctor_id: params.doctorId,
      p_schedule_id: params.scheduleId || null,
      p_appointment_date: apptDate,
      p_source: source,
      p_notes: params.notes || null,
    });

    if (rpcErr || !rpcRes) {
      return { success: false, error: rpcErr?.message || "Failed to execute atomic appointment booking." };
    }

    const resObj = typeof rpcRes === "string" ? JSON.parse(rpcRes) : rpcRes;
    if (!resObj.success) {
      return { success: false, error: resObj.error || "Appointment booking failed." };
    }

    // Fetch newly created appointment record
    const { data: appt, error: apptError } = await supabase
      .from("appointments")
      .select("*, patients(id, patient_code, full_name, phone, gender, blood_group)")
      .eq("id", resObj.appointment_id)
      .single();

    if (apptError || !appt) {
      return { success: false, error: "Failed to load confirmed appointment record." };
    }

    await recordAuditLog({
      organizationId: session.organizationId,
      userId: session.userId,
      action: "CREATE",
      module: "APPOINTMENT",
      entityType: "appointment",
      entityId: appt.id,
      newValues: {
        tokenNumber: resObj.token_number,
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

    const { data: docData } = await supabase
      .from("doctors")
      .select("id, full_name, specialization, room_number, opd_fee")
      .eq("id", params.doctorId)
      .maybeSingle();

    const row = appt as unknown as ApptWithPatientRow;
    const formattedAppt: AppointmentRecord = {
      ...row,
      patient: row.patients || undefined,
      doctor: {
        id: params.doctorId,
        full_name: docData?.full_name || "",
        specialization: docData?.specialization || "",
        room_number: resObj.room_number || docData?.room_number || "",
        opd_fee: Number(docData?.opd_fee) || 0,
      },
    };

    return {
      success: true,
      data: {
        appointment: formattedAppt,
        tokenNumber: resObj.token_number,
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
      room_number: q.room_number || q.doctors?.room_number || "",
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

