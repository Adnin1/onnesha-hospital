-- =====================================================================================
-- MIGRATION 242: Add is_super_admin to Profiles and discharged_at to Bed Assignments
-- Authority: Synthetic Engineering Swarm (APEX Godmode v5.0)
-- Purpose:
--   1. Add is_super_admin BOOLEAN DEFAULT FALSE to public.profiles so RBAC checks succeed.
--   2. Add discharged_at TIMESTAMPTZ to public.bed_assignments so complete_ipd_discharge_atomic succeeds.
-- =====================================================================================

-- 1. PROFILES SUPER ADMIN FLAG
ALTER TABLE IF EXISTS public.profiles
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_super_admin 
    ON public.profiles(is_super_admin);

-- 2. BED ASSIGNMENTS DISCHARGE TIMESTAMP
ALTER TABLE IF EXISTS public.bed_assignments
    ADD COLUMN IF NOT EXISTS discharged_at TIMESTAMPTZ;
