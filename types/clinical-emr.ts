export interface PrescriptionItemRecord {
  id?: string;
  prescription_id?: string;
  medicine_name: string;
  generic_name?: string;
  dosage_pattern: string; // e.g. 1+0+1
  duration: string; // e.g. 7 days
  meal_instruction?: string; // e.g. After meal
  special_notes?: string;
  display_order?: number;
}

export interface PrescriptionRecord {
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
  items?: PrescriptionItemRecord[];
  patient?: {
    id: string;
    patient_code: string;
    full_name: string;
    gender: string;
    phone: string;
    age?: number;
  };
  doctor?: {
    id: string;
    full_name: string;
    degrees: string;
    designation: string;
    specialization: string;
    bmdc_reg_number: string;
    room_number: string;
  };
}

export interface DiagnosticParameterRecord {
  id: string;
  test_id: string;
  parameter_name: string;
  unit?: string;
  reference_range_male?: string;
  reference_range_female?: string;
  reference_range_child?: string;
  observed_value?: string;
  is_abnormal?: boolean;
}

export interface DiagnosticOrderRecord {
  id: string;
  organization_id: string;
  order_number: string;
  patient_id: string;
  visit_id?: string;
  referred_by_doctor_id?: string;
  status: "ORDERED" | "PAID" | "SAMPLE_COLLECTED" | "PROCESSING" | "VERIFIED" | "DELIVERED" | "CANCELLED";
  created_at: string;
  updated_at: string;
  barcode?: string;
  sample_barcode?: string;
  patient?: {
    id: string;
    patient_code: string;
    full_name: string;
    gender: string;
    phone: string;
  };
  doctor?: {
    id: string;
    full_name: string;
  };
  tests?: Array<{
    id: string;
    test_id: string;
    test_name: string;
    test_code: string;
    price: number;
    specimen_type: string;
    status: string;
    parameters?: DiagnosticParameterRecord[];
    descriptive_findings?: string;
    verified_by_name?: string;
    verified_at?: string;
  }>;
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
  appointment_id: string;
  doctor_id: string;
  room_number: string;
  token_number: number;
  queue_status: "WAITING" | "CALLED" | "IN_ROOM" | "COMPLETED" | "SKIPPED";
  called_at?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  patient_name?: string;
  patient_code?: string;
  patient_phone?: string;
  doctor_name?: string;
}
