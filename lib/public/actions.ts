import { createClient } from "@/lib/supabase/client";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { normalizeBDPhone, isValidNormalizedBDPhone } from "@/lib/patient/phone";
import { getDhakaDateString } from "@/lib/datetime";

export interface PublicDoctorScheduleSummary {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

export interface PublicDoctor {
  id: string;
  full_name: string;
  degrees: string;
  designation: string;
  specialization: string;
  bmdc_reg_number: string;
  room_number: string;
  opd_fee: number;
  followup_fee: number;
  avatar_url?: string | null;
  bio?: string | null;
  public_bio?: string | null;
  experience_years?: number;
  department_name: string;
  department_slug?: string;
  schedules?: PublicDoctorScheduleSummary[];
  visiting_hours_text?: string;
}

export function formatVisitingHoursSummary(
  schedules?: Array<{ day_of_week: string; start_time: string; end_time: string; is_active?: boolean }>
): string {
  const active = (schedules || []).filter((s) => s.is_active !== false);
  if (active.length === 0) return "Schedule on request";

  const formatTime12h = (timeStr: string) => {
    if (!timeStr) return "";
    const parts = timeStr.split(":");
    const h = parseInt(parts[0], 10);
    const m = parts[1] || "00";
    if (isNaN(h)) return timeStr;
    const ampm = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12.toString().padStart(2, "0")}:${m} ${ampm}`;
  };

  const dayOrder: Record<string, number> = {
    sat: 1,
    saturday: 1,
    sun: 2,
    sunday: 2,
    mon: 3,
    monday: 3,
    tue: 4,
    tuesday: 4,
    wed: 5,
    wednesday: 5,
    thu: 6,
    thursday: 6,
    fri: 7,
    friday: 7,
  };

  // Group schedules by time range
  const groups = new Map<string, string[]>();

  for (const s of active) {
    const start = s.start_time ? s.start_time.trim().slice(0, 5) : "";
    const end = s.end_time ? s.end_time.trim().slice(0, 5) : "";
    const timeKey = start && end ? `${formatTime12h(start)} - ${formatTime12h(end)}` : "TBD";
    const day = s.day_of_week.trim();
    const shortDay = day.slice(0, 3);
    if (!groups.has(timeKey)) {
      groups.set(timeKey, []);
    }
    const list = groups.get(timeKey)!;
    if (!list.includes(shortDay)) {
      list.push(shortDay);
    }
  }

  const parts: string[] = [];
  for (const [timeRange, days] of groups.entries()) {
    days.sort((a, b) => {
      const orderA = dayOrder[a.toLowerCase()] || 99;
      const orderB = dayOrder[b.toLowerCase()] || 99;
      return orderA - orderB;
    });
    parts.push(`${days.join(", ")} (${timeRange})`);
  }

  return parts.join("; ");
}

export interface PublicDepartment {
  id: string;
  name: string;
  code: string;
  slug: string;
  description?: string | null;
}

export interface PublicBookingResult {
  success: boolean;
  data?: {
    appointmentId: string;
    tokenNumber: number;
    patientCode: string;
    appointmentDate: string;
    doctorName: string;
    roomNumber: string;
    opdFee: number;
  };
  error?: string;
}

/**
 * 1. Fetch public list of active consultants (sanitized of salary/commissions)
 */
export async function getPublicDoctorsAction(): Promise<{
  success: boolean;
  doctors: PublicDoctor[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    // Use authoritative secure RPC get_public_doctors_directory (enforces is_public, is_active, and canonical org boundary)
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_public_doctors_directory",
      { p_org_id: HOSPITAL_METADATA.id }
    );

    if (rpcError) {
      return { success: false, doctors: [], error: rpcError.message };
    }

    if (!Array.isArray(rpcData)) {
      return { success: true, doctors: [] };
    }

    interface RpcDocItem {
      id: string;
      full_name: string;
      degrees: string;
      designation: string;
      specialization: string;
      bmdc_reg_number: string;
      room_number: string;
      opd_fee: number;
      followup_fee: number;
      avatar_url?: string | null;
      bio?: string | null;
      public_bio?: string | null;
      experience_years?: number;
      department_name: string;
      department_slug: string;
      schedules?: Array<{ id: string; day_of_week: string; start_time: string; end_time: string; is_active?: boolean }>;
    }

    const doctors: PublicDoctor[] = (rpcData as RpcDocItem[]).map((d) => ({
      id: d.id,
      full_name: d.full_name,
      degrees: d.degrees,
      designation: d.designation,
      specialization: d.specialization,
      bmdc_reg_number: d.bmdc_reg_number,
      room_number: d.room_number,
      opd_fee: Number(d.opd_fee),
      followup_fee: Number(d.followup_fee),
      avatar_url: d.avatar_url,
      bio: d.bio,
      public_bio: d.public_bio,
      experience_years: d.experience_years,
      department_name: d.department_name,
      department_slug: d.department_slug,
      schedules: d.schedules || [],
      visiting_hours_text: formatVisitingHoursSummary(d.schedules || []),
    }));

    return { success: true, doctors };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load public doctor directory";
    return { success: false, doctors: [], error: msg };
  }
}

export interface PublicDoctorSchedule {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  max_tokens: number;
  room_number: string;
  slot_label: string;
}

/**
 * 1b. Fetch public published schedules for a specific doctor
 */
export async function getPublicDoctorSchedulesAction(doctorId: string): Promise<{
  success: boolean;
  schedules: PublicDoctorSchedule[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    // Authoritative RPC: get_public_doctor_schedules (joins doctors and enforces doctors.is_public & is_active)
    const { data, error } = await supabase.rpc("get_public_doctor_schedules", {
      p_org_id: HOSPITAL_METADATA.id,
      p_doctor_id: doctorId,
    });

    if (error) {
      return { success: false, schedules: [], error: error.message };
    }

    if (!Array.isArray(data)) {
      return { success: true, schedules: [] };
    }

    interface SchedRow {
      id: string;
      day_of_week: string;
      start_time: string;
      end_time: string;
      max_tokens: number;
      room_number: string;
    }

    const schedules: PublicDoctorSchedule[] = (data as SchedRow[]).map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      max_tokens: s.max_tokens,
      room_number: s.room_number || "",
      slot_label: `${s.day_of_week}: ${s.start_time} - ${s.end_time}${s.room_number ? ` (Room: ${s.room_number})` : ""}`,
    }));

    return { success: true, schedules };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load doctor schedules";
    return { success: false, schedules: [], error: msg };
  }
}

/**
 * 2. Fetch public hospital departments
 */
export async function getPublicDepartmentsAction(): Promise<{
  success: boolean;
  departments: PublicDepartment[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    // Query public_departments_view adhering to canonical public org and public visibility
    const { data, error } = await supabase
      .from("public_departments_view")
      .select("id, name, code")
      .eq("organization_id", HOSPITAL_METADATA.id)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return { success: false, departments: [], error: error.message };
    }

    interface DeptRow {
      id: string;
      name: string;
      code: string;
    }

    const departments: PublicDepartment[] = ((data || []) as unknown as DeptRow[]).map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      slug: d.name.toLowerCase().replace(/\s+/g, "-"),
      description: `Comprehensive diagnostic and outpatient consultation under ${d.name}.`,
    }));

    return { success: true, departments };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load departments";
    return { success: false, departments: [], error: msg };
  }
}

/**
 * 3. Book Public Online Appointment
 * Uses atomic backend RPC book_online_appointment with mandatory scheduleId & concurrency lock.
 */
export async function bookOnlineAppointmentAction(params: {
  doctorId: string;
  scheduleId: string;
  appointmentDate: string;
  patientName: string;
  patientPhone: string;
  patientGender?: "MALE" | "FEMALE" | "OTHER";
  patientAge?: number;
  notes?: string;
}): Promise<PublicBookingResult> {
  const { doctorId, scheduleId, appointmentDate, patientName, patientPhone, patientGender, patientAge, notes } = params;

  if (!doctorId || !scheduleId || !appointmentDate || !patientName?.trim() || !patientPhone?.trim()) {
    return { success: false, error: "Doctor, published schedule slot, appointment date, patient name, and valid phone are required." };
  }

  const trimmedName = patientName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    return { success: false, error: "Patient name must be between 2 and 120 characters." };
  }

  if (patientAge !== undefined && (patientAge < 0 || patientAge > 125 || isNaN(patientAge))) {
    return { success: false, error: "Please enter a valid age between 0 and 125 years." };
  }

  if (notes && notes.length > 500) {
    return { success: false, error: "Notes cannot exceed 500 characters." };
  }

  const today = getDhakaDateString();
  if (appointmentDate < today) {
    return { success: false, error: "Cannot book appointments for past dates." };
  }

  const normalizedPhone = normalizeBDPhone(patientPhone);
  if (!isValidNormalizedBDPhone(normalizedPhone)) {
    return { success: false, error: "Please enter a valid Bangladeshi mobile number (013/014/015/016/017/018/019)." };
  }

  try {
    const supabase = await createClient();

    // Call concurrency-safe PostgreSQL RPC with authoritative p_schedule_id
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("book_online_appointment", {
      p_org_id: HOSPITAL_METADATA.id,
      p_doctor_id: doctorId,
      p_schedule_id: scheduleId,
      p_appointment_date: appointmentDate,
      p_patient_name: trimmedName,
      p_patient_phone: normalizedPhone,
      p_patient_gender: patientGender || "OTHER",
      p_patient_age: patientAge ?? null,
      p_notes: notes || null,
    });

    if (rpcErr || !rpcRes) {
      return { success: false, error: "Online appointment service is temporarily unavailable. Please try again or contact hospital reception." };
    }

    const resObj = typeof rpcRes === "string" ? JSON.parse(rpcRes) : rpcRes;
    if (!resObj.success) {
      return { success: false, error: resObj.error || "Online booking slot unavailable." };
    }

    // Query authoritative doctor record directly by ID, guaranteeing 100% DB integrity
    const { data: authoritativeDoc } = await supabase
      .from("doctors")
      .select("full_name, room_number, opd_fee")
      .eq("id", doctorId)
      .eq("organization_id", HOSPITAL_METADATA.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!authoritativeDoc) {
      return {
        success: false,
        error: "Doctor verification failed. Appointment could not be confirmed with authoritative records.",
      };
    }

    const docFullName = authoritativeDoc.full_name;
    const docRoom = resObj.room_number || authoritativeDoc.room_number || "";
    const docFee = Number(authoritativeDoc.opd_fee) || 0;

    return {
      success: true,
      data: {
        appointmentId: resObj.appointment_id,
        tokenNumber: resObj.token_number,
        patientCode: resObj.patient_code,
        appointmentDate: resObj.appointment_date,
        doctorName: docFullName,
        roomNumber: docRoom,
        opdFee: docFee,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Appointment booking failed";
    return { success: false, error: msg };
  }
}

/**
 * 4. Submit Public Contact / Enquiry Inquiry
 * Calls rate-limited and validated PostgreSQL RPC submit_public_contact_inquiry
 */
export async function submitContactInquiryAction(params: {
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  const { name, phone, email, subject, message } = params;

  const trimmedName = (name || "").trim();
  const trimmedPhone = (phone || "").trim();
  const trimmedSubject = (subject || "General Hospital Enquiry").trim();
  const trimmedMessage = (message || "").trim();

  if (!trimmedName || !trimmedPhone || !trimmedMessage) {
    return { success: false, error: "Name, contact phone, and message are required." };
  }

  if (trimmedName.length < 2 || trimmedName.length > 120) {
    return { success: false, error: "Name must be between 2 and 120 characters." };
  }

  const cleanPhone = normalizeBDPhone(trimmedPhone);
  if (!isValidNormalizedBDPhone(cleanPhone)) {
    return { success: false, error: "Please provide a valid 11-digit Bangladeshi contact number (013-019)." };
  }

  if (email && email.trim()) {
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email.trim()) || email.trim().length > 150) {
      return { success: false, error: "Please enter a valid email address." };
    }
  }

  if (trimmedMessage.length < 10) {
    return { success: false, error: "Message must be at least 10 characters long." };
  }

  if (trimmedMessage.length > 2000) {
    return { success: false, error: "Message cannot exceed 2,000 characters." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_public_contact_inquiry", {
      p_org_id: HOSPITAL_METADATA.id,
      p_name: trimmedName,
      p_phone: cleanPhone,
      p_email: email?.trim() || null,
      p_subject: trimmedSubject.slice(0, 150),
      p_message: trimmedMessage,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const res = typeof data === "string" ? JSON.parse(data) : data;
    if (res && res.success === false) {
      return { success: false, error: res.error || "Submission rejected." };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Submission failed";
    return { success: false, error: msg };
  }
}

/**
 * 5. Fetch Live Waiting Queue Status for Display Boards & Token Verification
 * Uses authoritative database RPC get_public_live_queue with zero PII exposure.
 */
export async function getLiveWaitingQueueAction(): Promise<{
  success: boolean;
  queue: Array<{
    id: string;
    doctor_name: string;
    room_number: string;
    token_number: string;
    status: "waiting" | "calling" | "serving" | "done" | "skipped";
    called_at?: string;
  }>;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // Call server-side secure projection RPC
    const { data, error } = await supabase.rpc("get_public_live_queue", {
      p_org_id: HOSPITAL_METADATA.id,
    });

    if (error) {
      return { success: false, queue: [], error: error.message };
    }

    interface QueueRow {
      id: string;
      doctor_name: string;
      room_number: string;
      token_number: string;
      status: "waiting" | "calling" | "serving" | "done" | "skipped";
      called_at?: string;
    }

    const res = typeof data === "string" ? JSON.parse(data) : data;
    const rawQueue = (res?.queue || []) as QueueRow[];

    const queue = rawQueue.map((item) => ({
      id: item.id,
      doctor_name: item.doctor_name,
      room_number: item.room_number,
      token_number: item.token_number,
      status: item.status,
      called_at: item.called_at,
    }));

    return { success: true, queue };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load queue";
    return { success: false, queue: [], error: msg };
  }
}

