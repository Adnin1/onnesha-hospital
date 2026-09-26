-- ==============================================================================
-- OHMS Migration 075: Specialty Clinical Workflows (Dental, Eye, Physiotherapy)
-- Bridges shared core clinical infrastructure (patients, appointments, billing)
-- with specialty-specific examination templates, findings, and procedure records.
-- ==============================================================================

-- 1. Sequences for Specialty Codes
CREATE SEQUENCE IF NOT EXISTS dental_exam_code_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS eye_exam_code_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS physio_session_code_seq START WITH 1001 INCREMENT BY 1;

-- 2. DENTAL EXAMINATIONS
CREATE TABLE IF NOT EXISTS dental_examinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    exam_code TEXT NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    chief_complaint TEXT NOT NULL,
    tooth_number TEXT, -- Universal or FDI notation (e.g., 18, 21, 36, 48)
    dental_findings JSONB NOT NULL DEFAULT '{}'::jsonb, -- { caries: bool, plaque: bool, calculus: bool, gingivitis: bool, pocket_depth_mm: number }
    diagnosis TEXT NOT NULL,
    procedure_done TEXT, -- e.g., Scaling, Composite Filling, Extraction, Root Canal Treatment
    procedure_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (procedure_fee >= 0),
    prescription_notes TEXT,
    follow_up_date DATE,
    billing_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. EYE / OPHTHALMOLOGY EXAMINATIONS
CREATE TABLE IF NOT EXISTS eye_examinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    exam_code TEXT NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    doctor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    chief_complaint TEXT NOT NULL,
    visual_acuity_od TEXT, -- Right eye (e.g. 6/6, 20/20)
    visual_acuity_os TEXT, -- Left eye (e.g. 6/9, 20/30)
    intraocular_pressure_od NUMERIC(5,2), -- IOP mmHg
    intraocular_pressure_os NUMERIC(5,2), -- IOP mmHg
    refraction JSONB NOT NULL DEFAULT '{}'::jsonb, -- { od_sph: string, od_cyl: string, od_axis: string, os_sph: string, os_cyl: string, os_axis: string }
    fundus_findings TEXT,
    diagnosis TEXT NOT NULL,
    procedure_done TEXT, -- e.g., Slit Lamp Examination, Tonometry, Foreign Body Removal, Cataract Eval
    procedure_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (procedure_fee >= 0),
    prescription_notes TEXT,
    follow_up_date DATE,
    billing_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. PHYSIOTHERAPY & REHABILITATION SESSIONS
CREATE TABLE IF NOT EXISTS physiotherapy_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_code TEXT NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    therapist_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    chief_complaint TEXT NOT NULL,
    pain_score_initial INTEGER CHECK (pain_score_initial BETWEEN 0 AND 10), -- VAS 0-10
    pain_score_post INTEGER CHECK (pain_score_post BETWEEN 0 AND 10),
    assessment_findings TEXT NOT NULL, -- Range of motion, muscle strength, gait
    treatment_plan TEXT NOT NULL,
    session_number INTEGER NOT NULL DEFAULT 1 CHECK (session_number > 0),
    total_sessions_prescribed INTEGER NOT NULL DEFAULT 1 CHECK (total_sessions_prescribed >= session_number),
    modalities_applied JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["TENS", "Ultrasound Therapy", "Therapeutic Exercise", "Cervical Traction"]
    progress_notes TEXT,
    session_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (session_fee >= 0),
    follow_up_date DATE,
    billing_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Row Level Security & Multi-Tenant Enforcement
ALTER TABLE dental_examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_examinations FORCE ROW LEVEL SECURITY;

ALTER TABLE eye_examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE eye_examinations FORCE ROW LEVEL SECURITY;

ALTER TABLE physiotherapy_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE physiotherapy_sessions FORCE ROW LEVEL SECURITY;

-- Dental RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dental_examinations' AND policyname = 'dental_examinations_tenant_isolation') THEN
        CREATE POLICY dental_examinations_tenant_isolation ON dental_examinations
            FOR ALL
            USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
            WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
    END IF;
END $$;

-- Eye RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'eye_examinations' AND policyname = 'eye_examinations_tenant_isolation') THEN
        CREATE POLICY eye_examinations_tenant_isolation ON eye_examinations
            FOR ALL
            USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
            WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
    END IF;
END $$;

-- Physiotherapy RLS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'physiotherapy_sessions' AND policyname = 'physiotherapy_sessions_tenant_isolation') THEN
        CREATE POLICY physiotherapy_sessions_tenant_isolation ON physiotherapy_sessions
            FOR ALL
            USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
            WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
    END IF;
END $$;

-- 6. Indices for Query Performance & Tenant Filtering
CREATE INDEX IF NOT EXISTS idx_dental_exams_org_patient ON dental_examinations(organization_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_dental_exams_created ON dental_examinations(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eye_exams_org_patient ON eye_examinations(organization_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_eye_exams_created ON eye_examinations(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_physio_sessions_org_patient ON physiotherapy_sessions(organization_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_physio_sessions_created ON physiotherapy_sessions(organization_id, created_at DESC);
