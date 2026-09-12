-- =====================================================================================
-- 009_PRESCRIPTIONS_AND_CLINICAL.sql
-- Electronic Prescriptions (E-Rx), items, instructions, diagnoses, and follow-ups.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    chief_complaints TEXT,
    clinical_findings TEXT,
    diagnosis TEXT,
    investigation_advice TEXT,
    general_advice TEXT,
    followup_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_name VARCHAR(150) NOT NULL,
    generic_name VARCHAR(150),
    dosage_pattern VARCHAR(50) NOT NULL, -- e.g. 1+0+1, 1+1+1+1, 0+0+1
    duration VARCHAR(50) NOT NULL, -- e.g. 7 days, 1 month, Continue
    meal_instruction VARCHAR(100), -- Before meal, After meal, With meal
    special_notes TEXT,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    note_type VARCHAR(50) NOT NULL DEFAULT 'DOCTOR_INTERNAL',
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
