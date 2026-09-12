-- ==============================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM - PRODUCTION DATABASE DDL (MIGRATION)
-- Multi-Tenant Architecture with Row Level Security (RLS) and Audit Logging
-- ==============================================================================

-- Enable UUID and Cryptographic Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. SECURITY & MULTI-TENANCY CORE FUNCTIONS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT AS $$
  SELECT r.name FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION has_permission(perm_code TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = auth.uid() AND p.code = perm_code
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Auto-update updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. CORE SYSTEM & TENANT ISOLATION TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  subscription_tier TEXT NOT NULL DEFAULT 'starter' CHECK (subscription_tier IN ('starter', 'growth', 'enterprise')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  is_main BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('clinical', 'diagnostic', 'administrative')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY, -- References auth.users(id)
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'VOID', 'LOGIN')),
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. PATIENT REGISTRY & DIGITAL MEDICAL RECORDS
-- ------------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS patient_id_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.patient_id IS NULL OR NEW.patient_id = '' THEN
    NEW.patient_id := 'OH-' || LPAD(nextval('patient_id_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  guardian_name TEXT,
  relationship_with_guardian TEXT,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  dob DATE,
  age INT NOT NULL,
  blood_group TEXT CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  phone TEXT NOT NULL,
  nid_or_birth_cert TEXT,
  address TEXT NOT NULL,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trigger_patient_code
BEFORE INSERT ON public.patients
FOR EACH ROW EXECUTE FUNCTION generate_patient_code();

CREATE TABLE IF NOT EXISTS public.patient_medical_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  allergies TEXT[],
  chronic_conditions TEXT[],
  past_surgeries TEXT[],
  family_history TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patient_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. DOCTORS & SCHEDULING
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  doctor_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  specialization TEXT NOT NULL,
  designation TEXT NOT NULL,
  degrees TEXT NOT NULL,
  bmdc_reg_number TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES public.departments(id),
  opd_fee NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
  report_followup_fee NUMERIC(10, 2) NOT NULL DEFAULT 300.00,
  commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  room_number TEXT NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  day_name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_patients_per_slot INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- ------------------------------------------------------------------------------
-- 5. APPOINTMENTS & REALTIME TOKEN QUEUE
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  token_number TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('online_web', 'reception_walkin', 'call_center')),
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'waiting', 'in_consultation', 'completed', 'cancelled', 'no_show')),
  fee_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (fee_status IN ('paid', 'unpaid', 'waived')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.waiting_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  token_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'calling', 'serving', 'done', 'skipped')),
  called_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. PATIENT VISITS (OPD / IPD / EMERGENCY)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_number TEXT UNIQUE NOT NULL,
  visit_type TEXT NOT NULL CHECK (visit_type IN ('opd', 'ipd', 'emergency')),
  department_id UUID REFERENCES public.departments(id),
  doctor_id UUID REFERENCES public.doctors(id),
  status TEXT NOT NULL CHECK (status IN ('admitted', 'in_consultation', 'completed', 'discharged')),
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ipd_admissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE CASCADE,
  admission_reason TEXT NOT NULL,
  provisional_diagnosis TEXT,
  referred_by TEXT,
  discharge_condition TEXT
);

CREATE TABLE IF NOT EXISTS public.discharge_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE CASCADE,
  final_diagnosis TEXT NOT NULL,
  hospital_course TEXT NOT NULL,
  treatments_given TEXT NOT NULL,
  condition_on_discharge TEXT NOT NULL,
  follow_up_date DATE,
  discharge_advice TEXT,
  prepared_by_doctor_id UUID REFERENCES public.doctors(id)
);

-- ------------------------------------------------------------------------------
-- 7. BILLING, INVOICES & REVENUE AUDIT
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  discount_reason TEXT,
  discount_approved_by UUID REFERENCES public.users(id),
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  due_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded', 'void')),
  is_void BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  voided_by UUID REFERENCES public.users(id),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('consultation', 'lab_test', 'radiology', 'medicine', 'bed_charge', 'ot_charge', 'nursing', 'other')),
  reference_id UUID,
  description TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_price NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_number TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bkash', 'nagad', 'card', 'bank_transfer')),
  transaction_ref TEXT,
  received_by UUID REFERENCES public.users(id),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  reason TEXT NOT NULL,
  approved_by UUID REFERENCES public.users(id),
  processed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('salary', 'utility', 'maintenance', 'medical_supplies', 'other')),
  amount NUMERIC(12, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  paid_to TEXT NOT NULL,
  approved_by UUID REFERENCES public.users(id),
  receipt_url TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ------------------------------------------------------------------------------
-- 8. LABORATORY & DIAGNOSTICS (PATHOLOGY, X-RAY, USG, ECG)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lab_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.lab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.lab_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  cost NUMERIC(10, 2) DEFAULT 0.00,
  sample_type TEXT NOT NULL,
  delivery_hours INT NOT NULL DEFAULT 24,
  unit TEXT,
  reference_range TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.lab_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  order_number TEXT UNIQUE NOT NULL,
  ordered_by_doctor_id UUID REFERENCES public.doctors(id),
  status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'sample_collected', 'processing', 'completed', 'verified', 'delivered')),
  is_urgent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lab_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.lab_tests(id),
  price NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'sample_collected', 'processing', 'completed', 'verified')),
  result_value TEXT,
  normal_range TEXT,
  unit TEXT,
  is_abnormal BOOLEAN DEFAULT false,
  remarks TEXT,
  tested_by UUID REFERENCES public.users(id),
  verified_by UUID REFERENCES public.users(id),
  verified_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- 9. PHARMACY & INVENTORY FIFO STOCK LEDGER
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.medicine_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.medicines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  generic_name TEXT NOT NULL,
  category_id UUID REFERENCES public.medicine_categories(id),
  manufacturer TEXT NOT NULL,
  unit TEXT NOT NULL,
  reorder_level INT NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT
);

CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase_in', 'sale_out', 'return_in', 'damage_out', 'expired_out', 'adjustment')),
  quantity INT NOT NULL,
  reference_id UUID,
  unit_price NUMERIC(10, 2) NOT NULL,
  balance_after INT NOT NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 10. BEDS, WARDS, CABINS & OPERATION THEATER
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cabins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cabin_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('VIP', 'Deluxe', 'Standard AC', 'Non-AC')),
  daily_rate NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance', 'cleaning'))
);

CREATE TABLE IF NOT EXISTS public.beds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ward_id UUID REFERENCES public.wards(id) ON DELETE CASCADE,
  cabin_id UUID REFERENCES public.cabins(id) ON DELETE CASCADE,
  bed_number TEXT NOT NULL,
  bed_type TEXT NOT NULL,
  daily_rate NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'cleaning'))
);

CREATE TABLE IF NOT EXISTS public.bed_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL REFERENCES public.patient_visits(id) ON DELETE CASCADE,
  bed_id UUID REFERENCES public.beds(id),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'transferred', 'discharged'))
);

CREATE TABLE IF NOT EXISTS public.ot_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  name TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.ot_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ot_room_id UUID NOT NULL REFERENCES public.ot_rooms(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  lead_surgeon_id UUID NOT NULL REFERENCES public.doctors(id),
  anesthetist_id UUID REFERENCES public.doctors(id),
  procedure_name TEXT NOT NULL,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  charges NUMERIC(12, 2) DEFAULT 0.00
);

-- ------------------------------------------------------------------------------
-- 11. DIGITAL PRESCRIPTIONS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES public.patient_visits(id) ON DELETE SET NULL,
  prescription_number TEXT UNIQUE NOT NULL,
  chief_complaints TEXT[],
  clinical_findings TEXT,
  diagnosis TEXT[],
  general_advice TEXT,
  dietary_advice TEXT,
  next_visit_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prescription_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  generic_name TEXT,
  dosage TEXT NOT NULL, -- e.g. 1+0+1
  timing TEXT NOT NULL, -- before meal / after meal
  duration_days INT NOT NULL,
  special_instructions TEXT
);

-- ------------------------------------------------------------------------------
-- 12. HR, BIOMETRIC ATTENDANCE & PAYROLL
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  employee_code TEXT UNIQUE NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  designation TEXT NOT NULL,
  date_of_joining DATE NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time',
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'resigned'))
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('biometric_device', 'manual')),
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'on_leave'))
);

-- ------------------------------------------------------------------------------
-- 13. SYSTEM LOGS & BANGLADESH SMS GATEWAY LOGS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  message_body TEXT NOT NULL,
  sms_type TEXT NOT NULL CHECK (sms_type IN ('appointment_confirm', 'token_alert', 'bill_receipt', 'lab_ready', 'otp')),
  provider_response_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'queued')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 14. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ------------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiting_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
CREATE POLICY "Tenant Isolation - Patients" ON public.patients FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "Tenant Isolation - Doctors" ON public.doctors FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "Tenant Isolation - Appointments" ON public.appointments FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "Tenant Isolation - Invoices" ON public.invoices FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "Tenant Isolation - Lab Orders" ON public.lab_orders FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "Tenant Isolation - Medicines" ON public.medicines FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "Tenant Isolation - Prescriptions" ON public.prescriptions FOR ALL USING (organization_id = current_org_id());
CREATE POLICY "Tenant Isolation - Employees" ON public.employees FOR ALL USING (organization_id = current_org_id());
