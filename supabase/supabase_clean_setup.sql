-- ==============================================================================
-- ONNESHA HOSPITAL - HISTORICAL INITIAL BOOTSTRAP SETUP ONLY
-- NOTE: This file is for documentation/historical reference.
-- The authoritative source of truth for database migrations is supabase/migrations/*.sql.
-- Do NOT run this directly against an active production database.
-- ==============================================================================

-- 1. Enable Core Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Organizations (Tenant Root)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Departments
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'clinical',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Users Profile
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Helper Functions for Row Level Security
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 6. Patients (Auto OH-000001 Sequence)
CREATE SEQUENCE IF NOT EXISTS patient_seq START WITH 1;

CREATE OR REPLACE FUNCTION set_patient_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.patient_id IS NULL OR NEW.patient_id = '' THEN
    NEW.patient_id := 'OH-' || LPAD(nextval('patient_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  guardian_name TEXT,
  gender TEXT NOT NULL,
  age INT NOT NULL,
  blood_group TEXT,
  phone TEXT NOT NULL,
  nid_or_birth_cert TEXT,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_patient_code ON public.patients;
CREATE TRIGGER trg_patient_code
BEFORE INSERT ON public.patients
FOR EACH ROW EXECUTE FUNCTION set_patient_code();

-- 7. Doctors
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doctor_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  specialization TEXT NOT NULL,
  designation TEXT NOT NULL,
  degrees TEXT NOT NULL,
  bmdc_reg_number TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  opd_fee NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
  commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
  room_number TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Appointments & Realtime Queue
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_slot TEXT NOT NULL,
  token_number TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'reception',
  status TEXT NOT NULL DEFAULT 'waiting',
  fee_status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.waiting_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  token_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  called_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Billing & Invoices (VOID Audit Protection)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  due_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  is_void BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  description TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_price NUMERIC(12, 2) NOT NULL
);

-- 10. Lab Tests & Orders
CREATE TABLE IF NOT EXISTS public.lab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  sample_type TEXT NOT NULL DEFAULT 'blood',
  delivery_hours INT NOT NULL DEFAULT 24,
  unit TEXT,
  reference_range TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 11. Pharmacy Inventory
CREATE TABLE IF NOT EXISTS public.medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  generic_name TEXT NOT NULL,
  category TEXT NOT NULL,
  strength TEXT,
  manufacturer TEXT NOT NULL,
  current_stock INT NOT NULL DEFAULT 0,
  unit_price NUMERIC(10, 2) NOT NULL,
  reorder_level INT NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 12. Beds & Inpatient Rooms
CREATE TABLE IF NOT EXISTS public.beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_name TEXT NOT NULL,
  bed_number TEXT NOT NULL,
  bed_type TEXT NOT NULL DEFAULT 'General',
  daily_rate NUMERIC(10, 2) NOT NULL DEFAULT 600.00,
  status TEXT NOT NULL DEFAULT 'available',
  patient_name TEXT,
  admitted_at TIMESTAMPTZ
);

-- 13. Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- SEED DATA: ONNESHA HOSPITAL INITIAL RECORDS
-- ------------------------------------------------------------------------------

-- Default Organization
INSERT INTO public.organizations (id, name, code, phone, email, address)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Onnesha Hospital & Diagnostic Complex',
  'OH',
  '01712-345678',
  'contact@onneshahospital.com',
  'Hospital Road, Main Bazar, Dhaka, Bangladesh'
) ON CONFLICT (code) DO NOTHING;

-- Departments
INSERT INTO public.departments (id, organization_id, name, code, type)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'General Medicine', 'MED', 'clinical'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Cardiology & Heart Care', 'CARD', 'clinical'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Gynecology & Obstetrics', 'GYN', 'clinical')
ON CONFLICT DO NOTHING;

-- Doctors
INSERT INTO public.doctors (id, organization_id, doctor_code, full_name, specialization, designation, degrees, bmdc_reg_number, department_id, opd_fee, room_number)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'DOC-001', 'Prof. Dr. M. A. Rahman', 'Medicine Specialist', 'Senior Consultant', 'MBBS, FCPS (Medicine)', 'A-12490', 'b0000000-0000-0000-0000-000000000001', 800.00, 'Room 101'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'DOC-002', 'Dr. Farhana Yasmin', 'Gynecologist & Obstetrician', 'Associate Professor', 'MBBS, DGO, FCPS', 'A-23812', 'b0000000-0000-0000-0000-000000000003', 700.00, 'Room 102')
ON CONFLICT DO NOTHING;

-- Sample Beds
INSERT INTO public.beds (ward_name, bed_number, bed_type, daily_rate, status)
VALUES
  ('Male General Ward', 'MW-01', 'General', 600.00, 'available'),
  ('Male General Ward', 'MW-02', 'General', 600.00, 'available'),
  ('VIP Cabins', 'Cabin 301', 'Cabin AC', 3500.00, 'available'),
  ('ICU Complex', 'ICU-01', 'ICU', 7500.00, 'available')
ON CONFLICT DO NOTHING;
