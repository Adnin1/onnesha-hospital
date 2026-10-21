-- =====================================================================================
-- MIGRATION 243: Align Expenses, Patient Visits, and OT Schedules Schema Contracts
-- Authority: Synthetic Engineering Swarm (APEX Godmode v5.0)
-- Purpose:
--   1. Add created_by, status, notes, and payment columns to public.expenses.
--   2. Add provisional_diagnosis, doctor_id, notes, and clinical_findings to public.patient_visits.
--   3. Create public.ot_schedules compatibility table for OT surgery linkage.
-- =====================================================================================

-- 1. EXPENSES COLUMNS ALIGNMENT
ALTER TABLE IF EXISTS public.expenses
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'CASH',
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS expense_type VARCHAR(50) DEFAULT 'GENERAL',
    ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS duty_shift VARCHAR(50),
    ADD COLUMN IF NOT EXISTS department VARCHAR(100),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'POSTED',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);

-- 2. PATIENT_VISITS CLINICAL COLUMNS ALIGNMENT
ALTER TABLE IF EXISTS public.patient_visits
    ADD COLUMN IF NOT EXISTS provisional_diagnosis TEXT,
    ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS clinical_findings TEXT;

CREATE INDEX IF NOT EXISTS idx_patient_visits_doctor ON public.patient_visits(doctor_id);

-- 3. OT SCHEDULES COMPATIBILITY TABLE
CREATE TABLE IF NOT EXISTS public.ot_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    visit_id UUID REFERENCES public.patient_visits(id) ON DELETE SET NULL,
    room_id UUID REFERENCES public.ot_rooms(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ot_schedules_visit ON public.ot_schedules(visit_id);
