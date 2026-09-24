export type UUID = string;

// Organization & Tenancy
export interface Organization {
  id: UUID;
  name: string;
  code: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: string;
  logo_url?: string;
  status: "ACTIVE" | "SUSPENDED" | "TRIAL";
  created_at: string;
  updated_at: string;
}

export interface OrganizationSettings {
  organization_id: UUID;
  currency: string;
  timezone: string;
  patient_id_prefix: string;
  invoice_prefix: string;
  emergency_hotline: string;
  ambulance_hotline: string;
  pad_top_margin_cm: number;
  pad_bottom_margin_cm: number;
  sms_sender_id: string;
  max_cashier_discount_pct: number;
}

// User Profile & Roles
export type RoleType =
  | "super_admin"
  | "hospital_administrator"
  | "admin"
  | "accountant"
  | "doctor"
  | "nurse"
  | "lab_technologist"
  | "lab_technician"
  | "pathologist"
  | "pharmacist"
  | "hr_payroll"
  | "hr_manager"
  | "hr"
  | "receptionist"
  | "finance_admin"
  | "pharmacy_manager"
  | "diagnostic_staff"
  | "ot_staff"
  | "viewer";

export interface UserProfile {
  id: UUID;
  phone: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  is_active: boolean;
  must_change_password?: boolean;
  account_status?: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  employee_id?: string;
  organization_id?: UUID;
  created_at: string;
  updated_at: string;
  active_organization_id?: UUID;
  roles?: RoleType[];
  permissions?: string[];
}

// Patient Types
export interface Patient {
  id: UUID;
  organization_id: UUID;
  patient_code: string;
  nid_or_birth_cert?: string;
  full_name: string;
  phone: string;
  email?: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dob?: string;
  blood_group?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "UNKNOWN";
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  is_deleted?: boolean;
  created_at: string;
  updated_at: string;
}

// Doctor Types
export interface Doctor {
  id: UUID;
  organization_id: UUID;
  full_name: string;
  degrees: string;
  designation: string;
  specialization: string;
  bmdc_reg_number: string;
  room_number: string;
  opd_fee: number;
  followup_fee: number;
  report_fee: number;
  avatar_url?: string;
  bio?: string;
  is_active: boolean;
  created_at: string;
}

// Appointment & Queue Types
export interface Appointment {
  id: UUID;
  organization_id: UUID;
  patient_id: UUID;
  doctor_id: UUID;
  appointment_date: string;
  token_number: number;
  source: "ONLINE" | "WALKIN" | "PHONE" | "EMERGENCY";
  status: "BOOKED" | "WAITING" | "IN_CHAMBER" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  payment_status: "PENDING" | "PAID" | "EXEMPT";
  patient_notes?: string;
  created_at: string;
}

export interface WaitingQueueItem {
  id: UUID;
  organization_id: UUID;
  appointment_id: UUID;
  doctor_id: UUID;
  room_number: string;
  token_number: number;
  queue_status: "WAITING" | "CALLED" | "IN_ROOM" | "COMPLETED" | "SKIPPED";
  called_at?: string;
}

// Billing & Invoicing Types
export interface Invoice {
  id: UUID;
  organization_id: UUID;
  invoice_number: string;
  patient_id: UUID;
  visit_id?: UUID;
  subtotal: number;
  discount_amount: number;
  discount_reason?: string;
  tax_amount: number;
  grand_total: number;
  paid_amount: number;
  due_amount: number;
  status: "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED" | "VOID";
  is_voided: boolean;
  created_at: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: UUID;
  invoice_id?: UUID;
  service_category: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  total_price: number;
}

// Pharmacy Types
export interface Medicine {
  id: UUID;
  organization_id: UUID;
  brand_name: string;
  dosage_form: string;
  strength: string;
  manufacturer: string;
  min_stock_alert: number;
  is_active: boolean;
}

export interface MedicineBatch {
  id: UUID;
  organization_id: UUID;
  medicine_id: UUID;
  batch_number: string;
  expiry_date: string;
  purchase_rate: number;
  mrp: number;
  current_stock: number;
}

// Bed & Cabin Types
export interface Bed {
  id: UUID;
  organization_id: UUID;
  ward_id: UUID;
  bed_number: string;
  status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
  is_active: boolean;
}

export interface Cabin {
  id: UUID;
  organization_id: UUID;
  cabin_number: string;
  cabin_type: "AC_DELUXE" | "NON_AC_STANDARD" | "VIP_SUITE";
  daily_rate: number;
  status: "VACANT" | "OCCUPIED" | "CLEANING" | "MAINTENANCE";
}

// Audit Log Type
export interface AuditLog {
  id: number;
  organization_id: UUID;
  user_id?: UUID;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}
