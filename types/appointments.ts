export interface DoctorRecord {
  id: string;
  organization_id: string;
  profile_id?: string;
  full_name: string;
  degrees: string;
  designation: string;
  specialization: string;
  bmdc_reg_number: string;
  room_number: string;
  opd_fee: number;
  consultation_fee?: number;
  commission_rate?: number;
  followup_fee: number;
  report_fee: number;
  avatar_url?: string;
  bio?: string;
  is_active: boolean;
  department_name?: string;
  created_at: string;
  updated_at: string;
}

export interface DoctorScheduleRecord {
  id: string;
  organization_id: string;
  doctor_id: string;
  day_of_week: "SATURDAY" | "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY";
  start_time: string;
  end_time: string;
  max_tokens: number;
  avg_consultation_minutes: number;
  is_active: boolean;
}

export interface AppointmentRecord {
  id: string;
  organization_id: string;
  patient_id: string;
  doctor_id: string;
  department_id?: string;
  schedule_id?: string;
  appointment_date: string;
  slot_start_time?: string;
  token_number: number;
  source: "ONLINE" | "WALKIN" | "PHONE" | "EMERGENCY";
  status: "BOOKED" | "WAITING" | "IN_CHAMBER" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  payment_status: "PENDING" | "PAID" | "EXEMPT";
  booked_by?: string;
  patient_notes?: string;
  created_at: string;
  updated_at: string;
  // Joins
  patient?: {
    id: string;
    patient_code: string;
    full_name: string;
    phone: string;
    gender: string;
    blood_group?: string;
  };
  doctor?: {
    id: string;
    full_name: string;
    specialization: string;
    room_number: string;
    opd_fee: number;
  };
}

export interface WaitingQueueRecord {
  id: string;
  organization_id: string;
  appointment_id?: string;
  doctor_id?: string;
  room_number?: string;
  token_number: number;
  queue_status: "WAITING" | "CALLED" | "IN_ROOM" | "COMPLETED" | "SKIPPED";
  status?: "WAITING" | "CALLED" | "IN_ROOM" | "COMPLETED" | "SKIPPED" | string;
  called_at?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  visit_id?: string;
  patient_id?: string;
  patient_name?: string;
  patient_code?: string;
  patient_phone?: string;
  doctor_name?: string;
  patient?: {
    id?: string;
    full_name: string;
    patient_code: string;
    phone: string;
  };
  doctor?: {
    id?: string;
    full_name: string;
    room_number: string;
    specialization?: string;
  };
}
