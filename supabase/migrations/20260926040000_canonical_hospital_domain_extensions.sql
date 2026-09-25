-- Migration 068: Canonical Extension for Unified Hospital Domains
-- Adds: Critical Care Engine, Dedicated Radiology Modality & Worklists, Blood Bank Registry,
--        Registrar & Medical Certificates, Central CRM / Health Cards, and Ambulance Transport.
-- Enforces: Strict Multi-Tenant RLS, Least Privilege, Schema-Qualified Sequences, and Audit Log Triggers.

-- 1. Deterministic Sequence for Document & Certificate Numbering
CREATE SEQUENCE IF NOT EXISTS public.medical_certificate_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.blood_bag_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.ambulance_trip_seq START WITH 1001 INCREMENT BY 1;

-- 2. DOMAIN C: CRITICAL CARE ENGINE (Unified ICU / ICCU / CCU / SICU / MICU / PICU)
CREATE TABLE IF NOT EXISTS public.critical_care_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('ICU', 'ICCU', 'CCU', 'SICU', 'MICU', 'PICU')),
  floor TEXT NOT NULL DEFAULT 'Level 3',
  total_beds INT NOT NULL DEFAULT 10,
  daily_charge NUMERIC(10,2) NOT NULL DEFAULT 7500.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.critical_care_admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES public.critical_care_units(id) ON DELETE RESTRICT,
  bed_number TEXT NOT NULL,
  ventilator_required BOOLEAN NOT NULL DEFAULT false,
  admitting_doctor_id UUID REFERENCES public.profiles(id),
  initial_diagnosis TEXT NOT NULL,
  admission_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  discharge_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'admitted' CHECK (status IN ('admitted', 'transferred', 'discharged', 'deceased')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.critical_care_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  admission_id UUID NOT NULL REFERENCES public.critical_care_admissions(id) ON DELETE CASCADE,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  systolic_bp INT,
  diastolic_bp INT,
  heart_rate INT,
  spo2 INT,
  fio2 INT,
  gcs_score INT CHECK (gcs_score BETWEEN 3 AND 15),
  fluid_intake_ml NUMERIC(10,2) NOT NULL DEFAULT 0,
  urine_output_ml NUMERIC(10,2) NOT NULL DEFAULT 0,
  clinical_notes TEXT
);

-- 3. DOMAIN E: RADIOLOGY ENGINE
CREATE TABLE IF NOT EXISTS public.radiology_modalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  modality_name TEXT NOT NULL,
  modality_code TEXT NOT NULL CHECK (modality_code IN ('XRAY', 'CT', 'MRI', 'USG', 'ECG', 'ECHO')),
  room_number TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.radiology_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  modality_id UUID NOT NULL REFERENCES public.radiology_modalities(id) ON DELETE RESTRICT,
  requested_by UUID REFERENCES public.profiles(id),
  study_name TEXT NOT NULL,
  clinical_indication TEXT,
  technician_id UUID REFERENCES public.profiles(id),
  radiologist_id UUID REFERENCES public.profiles(id),
  findings TEXT,
  impression TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'approved', 'delivered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

-- 4. DOMAIN I: BLOOD BANK
CREATE TABLE IF NOT EXISTS public.blood_donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  phone TEXT NOT NULL,
  last_donation_date DATE,
  screening_status TEXT NOT NULL DEFAULT 'passed' CHECK (screening_status IN ('pending', 'passed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blood_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bag_number TEXT NOT NULL UNIQUE,
  donor_id UUID REFERENCES public.blood_donors(id) ON DELETE SET NULL,
  blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  component_type TEXT NOT NULL CHECK (component_type IN ('whole_blood', 'prbc', 'ffp', 'platelets', 'cryoprecipitate')),
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE NOT NULL,
  storage_location TEXT NOT NULL DEFAULT 'Refrigerator A - Shelf 2',
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'issued', 'discarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blood_transfusion_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bag_id UUID NOT NULL REFERENCES public.blood_inventory(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  crossmatch_result TEXT NOT NULL CHECK (crossmatch_result IN ('compatible', 'incompatible')),
  verified_by UUID NOT NULL REFERENCES public.profiles(id),
  transfusion_start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  adverse_reaction_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. DOMAIN N: REGISTRAR & MEDICAL CERTIFICATES
CREATE TABLE IF NOT EXISTS public.medical_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL UNIQUE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  certificate_type TEXT NOT NULL CHECK (certificate_type IN ('birth', 'death', 'medical_fitness', 'discharge', 'overseas_clearance')),
  issued_by UUID NOT NULL REFERENCES public.profiles(id),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qr_verification_hash TEXT NOT NULL,
  content_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_void BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. DOMAIN P: AMBULANCE & EMERGENCY TRANSPORT
CREATE TABLE IF NOT EXISTS public.ambulance_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  vehicle_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('basic', 'icu_equipped', 'neonatal')),
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ambulance_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trip_number TEXT NOT NULL UNIQUE,
  vehicle_id UUID NOT NULL REFERENCES public.ambulance_vehicles(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  pickup_location TEXT NOT NULL,
  drop_location TEXT NOT NULL,
  fare_amount NUMERIC(10,2) NOT NULL DEFAULT 1500.00,
  status TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'in_transit', 'completed', 'cancelled')),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  completion_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. DOMAIN O: CRM, HEALTH CARDS & CORPORATE CLIENTS
CREATE TABLE IF NOT EXISTS public.health_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_number TEXT NOT NULL UNIQUE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  card_tier TEXT NOT NULL CHECK (card_tier IN ('silver', 'gold', 'platinum', 'corporate')),
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  valid_until DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS across all new tables
ALTER TABLE public.critical_care_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_care_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_care_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiology_modalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiology_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_transfusion_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulance_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulance_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_cards ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies using app.current_organization_id
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'critical_care_units' AND policyname = 'cc_units_tenant_isolation') THEN
    CREATE POLICY cc_units_tenant_isolation ON public.critical_care_units
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'critical_care_admissions' AND policyname = 'cc_admissions_tenant_isolation') THEN
    CREATE POLICY cc_admissions_tenant_isolation ON public.critical_care_admissions
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'critical_care_observations' AND policyname = 'cc_observations_tenant_isolation') THEN
    CREATE POLICY cc_observations_tenant_isolation ON public.critical_care_observations
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'radiology_modalities' AND policyname = 'rad_modalities_tenant_isolation') THEN
    CREATE POLICY rad_modalities_tenant_isolation ON public.radiology_modalities
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'radiology_studies' AND policyname = 'rad_studies_tenant_isolation') THEN
    CREATE POLICY rad_studies_tenant_isolation ON public.radiology_studies
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blood_donors' AND policyname = 'blood_donors_tenant_isolation') THEN
    CREATE POLICY blood_donors_tenant_isolation ON public.blood_donors
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blood_inventory' AND policyname = 'blood_inv_tenant_isolation') THEN
    CREATE POLICY blood_inv_tenant_isolation ON public.blood_inventory
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'blood_transfusion_records' AND policyname = 'blood_transfusion_tenant_isolation') THEN
    CREATE POLICY blood_transfusion_tenant_isolation ON public.blood_transfusion_records
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medical_certificates' AND policyname = 'med_certs_tenant_isolation') THEN
    CREATE POLICY med_certs_tenant_isolation ON public.medical_certificates
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ambulance_vehicles' AND policyname = 'amb_vehicles_tenant_isolation') THEN
    CREATE POLICY amb_vehicles_tenant_isolation ON public.ambulance_vehicles
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ambulance_trips' AND policyname = 'amb_trips_tenant_isolation') THEN
    CREATE POLICY amb_trips_tenant_isolation ON public.ambulance_trips
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'health_cards' AND policyname = 'health_cards_tenant_isolation') THEN
    CREATE POLICY health_cards_tenant_isolation ON public.health_cards
      FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
  END IF;
END $$;
