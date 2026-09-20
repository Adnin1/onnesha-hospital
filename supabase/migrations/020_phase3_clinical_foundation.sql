-- =====================================================================================
-- 020_PHASE3_CLINICAL_FOUNDATION.sql
-- Onnesha Hospital Management System (OHMS) - Phase 3 Clinical Foundation Migration
-- Enhances Patient Master, Encounters, Vitals, Diagnoses, Notes, Allergies, Alerts,
-- IPD Admissions, Transfers, Emergency Triage, and Consents.
-- =====================================================================================

-- 1. Patient Master Enhancements
ALTER TABLE patients 
  ADD COLUMN IF NOT EXISTS dob DATE,
  ADD COLUMN IF NOT EXISTS email VARCHAR(150),
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS normalized_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temp_identifier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deceased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deceased_reason TEXT,
  ADD COLUMN IF NOT EXISTS merged_into_patient_id UUID REFERENCES patients(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

-- Create atomic sequence generator for patient codes if not exists
CREATE SEQUENCE IF NOT EXISTS patient_code_seq START WITH 10001;

DROP FUNCTION IF EXISTS generate_patient_code(UUID);
CREATE OR REPLACE FUNCTION generate_patient_code(p_organization_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'OH';
BEGIN
    v_seq_num := nextval('patient_code_seq');
    RETURN v_prefix || '-' || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 2. Patient Merge Requests Table (Safe Review Foundation)
CREATE TABLE IF NOT EXISTS patient_merge_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    source_patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    target_patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    requested_by UUID REFERENCES profiles(id),
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Structured Patient Allergies
CREATE TABLE IF NOT EXISTS patient_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    allergen VARCHAR(150) NOT NULL,
    reaction TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'MODERATE' CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'RESOLVED')),
    recorded_by UUID REFERENCES profiles(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- 4. Clinical Alerts Table (Prominent Warnings in All Encounters)
CREATE TABLE IF NOT EXISTS clinical_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('DRUG_ALLERGY', 'FALL_RISK', 'INFECTION_PRECAUTION', 'HIGH_RISK_SURGERY', 'GENERAL_WARNING')),
    message TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_by UUID REFERENCES profiles(id),
    resolved_at TIMESTAMPTZ
);

-- 5. Enhanced Visits & Encounters
ALTER TABLE patient_visits
  ADD COLUMN IF NOT EXISTS visit_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES doctors(id),
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'URGENT', 'CRITICAL')),
  ADD COLUMN IF NOT EXISTS reason_for_visit TEXT;

CREATE SEQUENCE IF NOT EXISTS visit_number_seq START WITH 50001;

DROP FUNCTION IF EXISTS generate_visit_number(UUID, VARCHAR);
CREATE OR REPLACE FUNCTION generate_visit_number(p_organization_id UUID, p_type VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10);
BEGIN
    v_seq_num := nextval('visit_number_seq');
    IF p_type = 'EMERGENCY' THEN
        v_prefix := 'EMG';
    ELSIF p_type = 'IPD' THEN
        v_prefix := 'IPD';
    ELSE
        v_prefix := 'OPD';
    END IF;
    RETURN v_prefix || '-' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(v_seq_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 6. Structured Diagnoses
CREATE TABLE IF NOT EXISTS patient_diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES patient_visits(id) ON DELETE CASCADE,
    icd_code VARCHAR(30),
    diagnosis_name TEXT NOT NULL,
    diagnosis_type VARCHAR(20) NOT NULL DEFAULT 'PRIMARY' CHECK (diagnosis_type IN ('PRIMARY', 'SECONDARY', 'PROVISIONAL', 'FINAL')),
    onset_date DATE,
    notes TEXT,
    recorded_by UUID REFERENCES profiles(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Clinical Notes (Append-oriented with correction support)
CREATE TABLE IF NOT EXISTS clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES patient_visits(id) ON DELETE CASCADE,
    note_type VARCHAR(50) NOT NULL DEFAULT 'GENERAL' CHECK (note_type IN ('GENERAL', 'OPD', 'IPD', 'EMERGENCY', 'NURSING', 'CONSULTANT', 'PROGRESS', 'DISCHARGE')),
    note_content TEXT NOT NULL,
    is_amended BOOLEAN NOT NULL DEFAULT FALSE,
    amendment_reason TEXT,
    original_note_id UUID REFERENCES clinical_notes(id),
    author_id UUID REFERENCES profiles(id),
    author_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. IPD Transfers Table
CREATE TABLE IF NOT EXISTS patient_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    from_ward_id UUID REFERENCES wards(id),
    to_ward_id UUID REFERENCES wards(id),
    from_bed_id UUID REFERENCES beds(id),
    to_bed_id UUID REFERENCES beds(id),
    reason TEXT NOT NULL,
    transfer_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    authorized_by UUID REFERENCES profiles(id)
);

-- 9. Patient Consents
CREATE TABLE IF NOT EXISTS patient_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES patient_visits(id) ON DELETE SET NULL,
    consent_type VARCHAR(50) NOT NULL CHECK (consent_type IN ('GENERAL_TREATMENT', 'DATA_PROCESSING', 'INVASIVE_PROCEDURE', 'SURGERY', 'ANESTHESIA', 'DISCLOSURE')),
    status VARCHAR(20) NOT NULL DEFAULT 'GRANTED' CHECK (status IN ('GRANTED', 'REVOKED', 'REFUSED')),
    notes TEXT,
    captured_by UUID REFERENCES profiles(id),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Enable RLS on All New Phase 3 Tables
ALTER TABLE patient_merge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;

-- 11. Core RLS Policies for Phase 3 Tables
DROP POLICY IF EXISTS rls_patient_merge_requests ON patient_merge_requests;
CREATE POLICY rls_patient_merge_requests ON patient_merge_requests FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_patient_allergies ON patient_allergies;
CREATE POLICY rls_patient_allergies ON patient_allergies FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_clinical_alerts ON clinical_alerts;
CREATE POLICY rls_clinical_alerts ON clinical_alerts FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_patient_diagnoses ON patient_diagnoses;
CREATE POLICY rls_patient_diagnoses ON patient_diagnoses FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_clinical_notes ON clinical_notes;
CREATE POLICY rls_clinical_notes ON clinical_notes FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_patient_transfers ON patient_transfers;
CREATE POLICY rls_patient_transfers ON patient_transfers FOR ALL USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS rls_patient_consents ON patient_consents;
CREATE POLICY rls_patient_consents ON patient_consents FOR ALL USING (organization_id = get_current_org_id());

-- 12. Targeted Performance Indexes
CREATE INDEX IF NOT EXISTS idx_patients_org_norm_phone ON patients(organization_id, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_patients_org_code ON patients(organization_id, patient_code);
CREATE INDEX IF NOT EXISTS idx_patients_org_dob ON patients(organization_id, dob);
CREATE INDEX IF NOT EXISTS idx_patient_identifications_num ON patient_identifications(id_number);
CREATE INDEX IF NOT EXISTS idx_visits_org_type_status ON patient_visits(organization_id, visit_type, status);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON patient_visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_visit_id ON vital_signs(visit_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient_id ON patient_diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_id ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_allergies_patient_id ON patient_allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_alerts_patient_active ON clinical_alerts(patient_id, is_active);
