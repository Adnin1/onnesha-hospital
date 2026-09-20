export type UUID = string;

export interface Organization {
  id: UUID;
  name: string;
  code: string;
  logo_url?: string;
  phone: string;
  email: string;
  address: string;
  subscription_tier: "starter" | "growth" | "enterprise";
  is_active: boolean;
  created_at: string;
}

export interface Branch {
  id: UUID;
  organization_id: UUID;
  name: string;
  code: string;
  address: string;
  phone: string;
  is_main: boolean;
}

export interface Department {
  id: UUID;
  organization_id: UUID;
  name: string;
  code: string;
  type: "clinical" | "diagnostic" | "administrative";
  is_active: boolean;
}

export type RoleType = 
  | "super_admin"
  | "admin"
  | "doctor"
  | "receptionist"
  | "nurse"
  | "pharmacist"
  | "lab_technician"
  | "accountant"
  | "hr";

export interface Role {
  id: UUID;
  organization_id: UUID;
  name: RoleType;
  label: string;
  description: string;
  is_system: boolean;
}

export interface Permission {
  id: UUID;
  module: string;
  action: string;
  code: string;
  description: string;
}

export interface UserProfile {
  id: UUID;
  organization_id: UUID;
  branch_id?: UUID;
  full_name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  role: RoleType;
  permissions: string[];
  is_active: boolean;
  created_at: string;
}

export interface Patient {
  id: UUID;
  organization_id: UUID;
  patient_id: string; // e.g. OH-000001
  full_name: string;
  guardian_name?: string;
  relationship_with_guardian?: string;
  gender: "male" | "female" | "other";
  dob?: string;
  age: number;
  blood_group?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  phone: string;
  nid_or_birth_cert?: string;
  address: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  created_by?: UUID;
  created_at: string;
  updated_at?: string;
}

export interface Doctor {
  id: UUID;
  organization_id: UUID;
  user_id?: UUID;
  doctor_code: string;
  full_name: string;
  specialization: string;
  designation: string;
  degrees: string;
  bmdc_reg_number: string;
  department_id: UUID;
  department_name?: string;
  opd_fee: number;
  report_followup_fee: number;
  commission_rate: number;
  room_number: string;
  avatar_url?: string;
  is_active: boolean;
}

export interface DoctorSchedule {
  id: UUID;
  doctor_id: UUID;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  day_name: string;
  start_time: string;
  end_time: string;
  max_patients_per_slot: number;
  is_active: boolean;
}

export interface Appointment {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  patient_name?: string;
  patient_phone?: string;
  doctor_id: UUID;
  doctor_name?: string;
  appointment_date: string;
  time_slot: string;
  token_number: string; // e.g. A-023
  source: "online_web" | "reception_walkin" | "call_center";
  status: "booked" | "waiting" | "in_consultation" | "completed" | "cancelled" | "no_show";
  fee_status: "paid" | "unpaid" | "waived";
  notes?: string;
  created_at: string;
}

export interface WaitingQueueItem {
  id: UUID;
  organization_id: UUID;
  doctor_id: UUID;
  doctor_name: string;
  room_number: string;
  appointment_id: UUID;
  patient_name: string;
  token_number: string;
  status: "waiting" | "calling" | "serving" | "done" | "skipped";
  called_at?: string;
}

export interface InvoiceItem {
  id: UUID;
  invoice_id?: UUID;
  item_type: "consultation" | "lab_test" | "radiology" | "medicine" | "bed_charge" | "ot_charge" | "nursing" | "other";
  reference_id?: UUID;
  description: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

export interface Invoice {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  patient_name?: string;
  patient_code?: string;
  patient_phone?: string;
  visit_id?: UUID;
  invoice_number: string; // e.g. INV-2026-0001
  items: InvoiceItem[];
  subtotal: number;
  discount_amount: number;
  discount_percent: number;
  discount_reason?: string;
  discount_approved_by?: string;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  due_amount: number;
  payment_status: "unpaid" | "partially_paid" | "paid" | "refunded" | "void";
  payment_method?: "cash" | "bkash" | "nagad" | "card" | "bank_transfer";
  is_void: boolean;
  void_reason?: string;
  voided_by?: string;
  created_by_name?: string;
  created_at: string;
}

export interface LabTest {
  id: UUID;
  organization_id: UUID;
  category_id: UUID;
  category_name: string;
  name: string;
  code: string;
  price: number;
  sample_type: "blood" | "urine" | "tissue" | "stool" | "swab" | "xray" | "ultrasound" | "ecg";
  delivery_hours: number;
  unit?: string;
  reference_range?: string;
}

export interface LabOrder {
  id: UUID;
  organization_id: UUID;
  order_number: string; // LAB-2026-001
  patient_id: UUID;
  patient_name: string;
  patient_code: string;
  doctor_name: string;
  tests: {
    test_id: UUID;
    test_name: string;
    price: number;
    status: "ordered" | "sample_collected" | "processing" | "completed" | "verified";
    result_value?: string;
    normal_range?: string;
    unit?: string;
    is_abnormal?: boolean;
    remarks?: string;
  }[];
  status: "ordered" | "sample_collected" | "processing" | "completed" | "verified" | "delivered";
  ordered_at: string;
  verified_by?: string;
}

export interface Medicine {
  id: UUID;
  organization_id: UUID;
  brand_name: string;
  generic_name: string;
  category: "Tablet" | "Syrup" | "Injection" | "Capsule" | "Drop" | "Ointment" | "Surgical";
  strength: string;
  manufacturer: string;
  current_stock: number;
  unit_price: number;
  purchase_price: number;
  reorder_level: number;
  batches: {
    batch_number: string;
    expiry_date: string;
    quantity: number;
  }[];
}

export interface Bed {
  id: UUID;
  ward_name: string;
  bed_number: string;
  bed_type: "General" | "Cabin AC" | "Cabin Non-AC" | "ICU" | "CCU" | "Post-Operative";
  daily_rate: number;
  status: "available" | "occupied" | "cleaning" | "reserved";
  patient_name?: string;
  patient_code?: string;
  admitted_at?: string;
}

export interface OperationTheaterBooking {
  id: UUID;
  room_name: string;
  patient_name: string;
  procedure_name: string;
  lead_surgeon: string;
  anesthetist: string;
  scheduled_date: string;
  scheduled_time: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
}

export interface Prescription {
  id: UUID;
  prescription_number: string;
  patient_id: UUID;
  patient_name: string;
  patient_age: number;
  patient_gender: string;
  doctor_name: string;
  doctor_degrees: string;
  date: string;
  vitals: {
    bp: string;
    pulse: string;
    weight: string;
    temp: string;
  };
  chief_complaints: string[];
  diagnosis: string[];
  medicines: {
    name: string;
    dosage: string; // e.g. 1+0+1
    instruction: string; // before meal / after meal
    duration: string; // 7 days
  }[];
  advice: string;
  next_visit?: string;
}

export interface Employee {
  id: UUID;
  employee_code: string;
  full_name: string;
  department: string;
  designation: string;
  phone: string;
  joining_date: string;
  basic_salary: number;
  status: "active" | "on_leave" | "resigned";
}
