import { createClient } from "@/lib/supabase/client";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { normalizeBDPhone, isValidNormalizedBDPhone } from "@/lib/patient/phone";

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
    const { data, error } = await supabase
      .from("doctors")
      .select(`
        id,
        full_name,
        degrees,
        designation,
        specialization,
        bmdc_reg_number,
        room_number,
        opd_fee,
        followup_fee,
        avatar_url,
        bio,
        departments(id, name)
      `)
      .eq("organization_id", HOSPITAL_METADATA.id)
      .eq("is_active", true)
      .or("is_public.eq.true,is_public.is.null")
      .order("full_name", { ascending: true });

    if (error) {
      return { success: false, doctors: [], error: error.message };
    }

    interface DoctorWithDept {
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
      departments?: { id: string; name: string } | null;
    }

    const doctors: PublicDoctor[] = ((data || []) as unknown as DoctorWithDept[]).map((d) => ({
      id: d.id,
      full_name: d.full_name,
      degrees: d.degrees,
      designation: d.designation,
      specialization: d.specialization,
      bmdc_reg_number: d.bmdc_reg_number,
      room_number: d.room_number,
      opd_fee: Number(d.opd_fee) || 800,
      followup_fee: Number(d.followup_fee) || 400,
      avatar_url: d.avatar_url,
      bio: d.bio,
      department_name: d.departments?.name || "General Medicine",
      department_slug: d.departments?.name ? d.departments.name.toLowerCase().replace(/\s+/g, "-") : "general",
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
    const { data, error } = await supabase
      .from("doctor_schedules")
      .select("id, day_of_week, start_time, end_time, max_tokens, room_number, doctors!inner(is_active, is_public)")
      .eq("organization_id", HOSPITAL_METADATA.id)
      .eq("doctor_id", doctorId)
      .eq("is_active", true)
      .eq("doctors.is_active", true)
      .or("is_public.eq.true,is_public.is.null", { foreignTable: "doctors" });

    if (error) {
      return { success: false, schedules: [], error: error.message };
    }

    interface SchedRow {
      id: string;
      day_of_week: string;
      start_time: string;
      end_time: string;
      max_tokens: number;
      room_number: string;
    }

    const schedules: PublicDoctorSchedule[] = ((data || []) as unknown as SchedRow[]).map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      max_tokens: s.max_tokens,
      room_number: s.room_number || "Chamber",
      slot_label: `${s.day_of_week}: ${s.start_time} - ${s.end_time} (Room: ${s.room_number || "Chamber"})`,
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
    const { data, error } = await supabase
      .from("departments")
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

  if (!doctorId || !scheduleId || !appointmentDate || !patientName || !patientPhone) {
    return { success: false, error: "Doctor, published schedule slot, appointment date, patient name, and valid phone are required." };
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
      p_patient_name: patientName.trim(),
      p_patient_phone: normalizedPhone,
      p_patient_gender: patientGender || "OTHER",
      p_patient_age: patientAge || null,
      p_notes: notes || null,
    });

    if (rpcErr || !rpcRes) {
      return { success: false, error: rpcErr?.message || "Failed to process appointment request." };
    }

    const resObj = typeof rpcRes === "string" ? JSON.parse(rpcRes) : rpcRes;
    if (!resObj.success) {
      return { success: false, error: resObj.error || "Online booking slot unavailable." };
    }

    // Fetch doctor name and room
    const { data: docData } = await supabase
      .from("doctors")
      .select("full_name, room_number, opd_fee")
      .eq("id", doctorId)
      .single();

    return {
      success: true,
      data: {
        appointmentId: resObj.appointment_id,
        tokenNumber: resObj.token_number,
        patientCode: resObj.patient_code,
        appointmentDate: resObj.appointment_date,
        doctorName: docData?.full_name || "Specialist Consultant",
        roomNumber: resObj.room_number || docData?.room_number || "Chamber",
        opdFee: Number(docData?.opd_fee) || 800,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Appointment booking failed";
    return { success: false, error: msg };
  }
}

/**
 * 4. Submit Public Contact / Enquiry Inquiry
 */
export async function submitContactInquiryAction(params: {
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  const { name, phone, email, subject, message } = params;

  if (!name.trim() || !phone.trim() || !message.trim()) {
    return { success: false, error: "Name, contact phone, and message are required." };
  }

  const cleanPhone = normalizeBDPhone(phone);
  if (!isValidNormalizedBDPhone(cleanPhone)) {
    return { success: false, error: "Please provide a valid 11-digit Bangladeshi contact number." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("public_contact_inquiries").insert({
      organization_id: HOSPITAL_METADATA.id,
      name: name.trim(),
      phone: cleanPhone,
      email: email?.trim() || null,
      subject: subject.trim() || "General Hospital Enquiry",
      message: message.trim(),
      status: "NEW",
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Submission failed";
    return { success: false, error: msg };
  }
}

/**
 * 5. Fetch Live Waiting Queue Status for Display Boards & Token Verification
 */
export async function getLiveWaitingQueueAction(): Promise<{
  success: boolean;
  queue: Array<{
    id: string;
    doctor_name: string;
    room_number: string;
    patient_name: string;
    token_number: string;
    status: "waiting" | "calling" | "serving" | "done" | "skipped";
    called_at?: string;
  }>;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id,
        serial_number,
        token_number,
        status,
        patient_name,
        created_at,
        doctors(id, full_name, room_number)
      `)
      .eq("organization_id", HOSPITAL_METADATA.id)
      .eq("appointment_date", today)
      .in("status", ["SCHEDULED", "CONFIRMED", "IN_CONSULTATION", "COMPLETED"])
      .order("token_number", { ascending: true })
      .limit(30);

    if (error) {
      return { success: false, queue: [], error: error.message };
    }

    interface AptRow {
      id: string;
      serial_number?: number;
      token_number?: number;
      status: string;
      patient_name?: string;
      created_at?: string;
      doctors?: { id: string; full_name: string; room_number: string } | null;
    }

    const rows = (data || []) as unknown as AptRow[];
    const queue = rows.map((r) => {
      let qStatus: "waiting" | "calling" | "serving" | "done" | "skipped" = "waiting";
      if (r.status === "IN_CONSULTATION") {
        qStatus = "serving";
      } else if (r.status === "CONFIRMED") {
        qStatus = "calling";
      } else if (r.status === "COMPLETED") {
        qStatus = "done";
      }

      // Mask patient name for public screen privacy: e.g. "Md. Tariqul" -> "Md. T***"
      const nameParts = (r.patient_name || "Patient").trim().split(" ");
      const maskedName =
        nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[1][0]}***`
          : `${nameParts[0].slice(0, 2)}***`;

      const tkn = r.token_number || r.serial_number || 1;
      return {
        id: r.id,
        doctor_name: r.doctors?.full_name || "Consultant",
        room_number: r.doctors?.room_number || "Chamber",
        patient_name: maskedName,
        token_number: `#${tkn}`,
        status: qStatus,
        called_at: r.created_at ? new Date(r.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : undefined,
      };
    });

    return { success: true, queue };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load queue";
    return { success: false, queue: [], error: msg };
  }
}

