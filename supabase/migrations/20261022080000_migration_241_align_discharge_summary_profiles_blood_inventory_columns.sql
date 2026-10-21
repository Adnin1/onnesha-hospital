-- =====================================================================================
-- MIGRATION 241: Align Clinical Discharge Summaries, Profiles Role, and Blood Inventory Columns
-- Authority: Synthetic Engineering Swarm (APEX Godmode v5.0)
-- Purpose:
--   1. Add clinical consultant and certificate columns to public.discharge_summaries
--      required by complete_ipd_discharge_atomic.
--   2. Add role and active_organization_id columns to public.profiles to satisfy
--      RBAC caller authorization checks in stored procedures.
--   3. Add updated_at to public.blood_inventory to satisfy audit timestamping.
-- =====================================================================================

-- 1. DISCHARGE_SUMMARIES CLINICAL COLUMNS
ALTER TABLE IF EXISTS public.discharge_summaries
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS doctor_designation VARCHAR(100),
    ADD COLUMN IF NOT EXISTS consultant_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS consultant_doctor_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS consultant_doctor_bmdc VARCHAR(50),
    ADD COLUMN IF NOT EXISTS consultant_doctor_specialty VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bmdc_reg_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS investigations_summary TEXT,
    ADD COLUMN IF NOT EXISTS ot_details TEXT,
    ADD COLUMN IF NOT EXISTS baby_note TEXT,
    ADD COLUMN IF NOT EXISTS presenting_features JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS medications_schedule JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS stitch_removal_date DATE,
    ADD COLUMN IF NOT EXISTS followup_date DATE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_discharge_summaries_consultant 
    ON public.discharge_summaries(consultant_doctor_id);

CREATE INDEX IF NOT EXISTS idx_discharge_summaries_org 
    ON public.discharge_summaries(organization_id);

-- 2. PROFILES RBAC COMPATIBILITY COLUMNS
ALTER TABLE IF EXISTS public.profiles
    ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'staff',
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS active_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role 
    ON public.profiles(role);

-- 3. BLOOD_INVENTORY AUDIT COLUMN
ALTER TABLE IF EXISTS public.blood_inventory
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
