-- ==============================================================================
-- MIGRATION 223: RESOLVE SUPABASE ADVISORS & SECURITY LINT DEFECTS
-- 1. Eliminate Security Definer View ERRORs by enabling security_invoker on views.
-- 2. Move pg_trgm extension out of public schema to extensions schema.
-- 3. Set immutable search_path on functions to prevent search_path escalation.
-- 4. Deduplicate redundant identical indexes on public.bed_assignments.
-- ==============================================================================

-- 1. Security Definer View Remediation (Supabase Lint 0010)
-- Enforce RLS and permissions of invoking user on views rather than view creator
ALTER VIEW IF EXISTS public.patient_episodes SET (security_invoker = true);
ALTER VIEW IF EXISTS public.user_profiles SET (security_invoker = true);

-- 2. Move Extension Out of Public Schema (Supabase Lint 0014)
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 3. Function Search Path Mutable Remediation (Supabase Lint 0011)
-- Pin search_path = public on trigger functions to prevent search_path hijacking
ALTER FUNCTION public.fn_prevent_detector_runs_modification() SET search_path = public;
ALTER FUNCTION public.fn_prevent_snapshot_modification() SET search_path = public;
ALTER FUNCTION public.fn_audit_detector_registry_changes() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.sync_patients_dob_columns() SET search_path = public;
ALTER FUNCTION public.trg_beds_auto_populate_ward_name() SET search_path = public;

-- 4. Duplicate Index Remediation on bed_assignments (Supabase Lint 0009)
-- Retain primary indexes (idx_unique_active_bed_assignment and idx_unique_active_cabin_assignment)
DROP INDEX IF EXISTS public.uq_active_bed_assignment;
DROP INDEX IF EXISTS public.uq_bed_assignments_one_active_per_bed;
DROP INDEX IF EXISTS public.uq_active_cabin_assignment;
DROP INDEX IF EXISTS public.uq_bed_assignments_one_active_per_cabin;
