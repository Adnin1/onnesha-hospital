-- =====================================================================================
-- 006_PATIENT_VISITS.sql
-- Patient visits, OPD encounters, IPD admissions, Emergency triage, and discharge summaries.
-- =====================================================================================

-- 1. Unified Patient Visits
CREATE TABLE IF NOT EXISTS patient_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    visit_type VARCHAR(20) NOT NULL CHECK (visit_type IN ('OPD', 'IPD', 'EMERGENCY')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISCHARGED', 'TRANSFERRED', 'CANCELLED')),
    triage_priority VARCHAR(20) DEFAULT 'GREEN' CHECK (triage_priority IN ('RED', 'YELLOW', 'GREEN')),
    chief_complaint TEXT,
    admitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discharged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Vital Signs Log
CREATE TABLE IF NOT EXISTS vital_signs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE CASCADE,
    pulse_rate INT,
    systolic_bp INT,
    diastolic_bp INT,
    temperature_c NUMERIC(4, 1),
    respiratory_rate INT,
    spo2_pct NUMERIC(4, 1),
    weight_kg NUMERIC(5, 2),
    height_cm NUMERIC(5, 2),
    recorded_by UUID REFERENCES profiles(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Discharge Summaries
CREATE TABLE IF NOT EXISTS discharge_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id UUID NOT NULL UNIQUE REFERENCES patient_visits(id) ON DELETE RESTRICT,
    discharge_type VARCHAR(50) NOT NULL CHECK (discharge_type IN ('NORMAL', 'DOR', 'LAMA', 'REFERRED', 'DECEASED')),
    final_diagnosis TEXT NOT NULL,
    hospital_course TEXT,
    condition_at_discharge TEXT,
    discharge_advice TEXT,
    followup_instructions TEXT,
    prepared_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
