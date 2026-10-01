-- Migration 100: Harden Inpatient Bed, Ward, Cabin, and Critical Care RLS & Revoke Anon Grants
-- Enforces strict zero-trust tenant isolation: Anonymous public callers cannot read inpatient clinical assets.

BEGIN;

-- 1. Explicitly Revoke ALL Permissions from anon and PUBLIC on Inpatient & Ward Tables
REVOKE ALL ON public.beds FROM anon, PUBLIC;
REVOKE ALL ON public.cabins FROM anon, PUBLIC;
REVOKE ALL ON public.wards FROM anon, PUBLIC;
REVOKE ALL ON public.bed_types FROM anon, PUBLIC;
REVOKE ALL ON public.bed_assignments FROM anon, PUBLIC;
REVOKE ALL ON public.critical_care_units FROM anon, PUBLIC;
REVOKE ALL ON public.critical_care_admissions FROM anon, PUBLIC;
REVOKE ALL ON public.critical_care_observations FROM anon, PUBLIC;

-- 2. Grant Strict Operational Permissions Exclusively to Authenticated Staff & Service Role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beds TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabins TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wards TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bed_types TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bed_assignments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.critical_care_units TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.critical_care_admissions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.critical_care_observations TO authenticated, service_role;

-- 3. Ensure Row-Level Security is FORCED on all Inpatient Tables
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cabins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bed_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bed_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_care_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_care_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.critical_care_observations ENABLE ROW LEVEL SECURITY;

-- 4. Clean up Any Overly Permissive Policies on critical_care_units
DROP POLICY IF EXISTS cc_units_select ON public.critical_care_units;
DROP POLICY IF EXISTS cc_units_insert ON public.critical_care_units;
DROP POLICY IF EXISTS cc_units_update ON public.critical_care_units;
DROP POLICY IF EXISTS cc_units_delete ON public.critical_care_units;

-- 5. Create Strict Tenant-Isolation Policy on public.wards
DROP POLICY IF EXISTS rls_wards ON public.wards;
CREATE POLICY rls_wards ON public.wards
    FOR ALL
    TO authenticated, service_role
    USING (organization_id = COALESCE(private.get_current_org_id(), (NULLIF(current_setting('app.current_organization_id', true), ''))::uuid));

-- 6. Create Strict Tenant-Isolation Policy on public.critical_care_units
DROP POLICY IF EXISTS rls_critical_care_units ON public.critical_care_units;
CREATE POLICY rls_critical_care_units ON public.critical_care_units
    FOR ALL
    TO authenticated, service_role
    USING (organization_id = COALESCE(private.get_current_org_id(), (NULLIF(current_setting('app.current_organization_id', true), ''))::uuid));

-- 7. Ensure Strict Tenant-Isolation Policy on public.critical_care_admissions & observations
DROP POLICY IF EXISTS rls_cc_admissions ON public.critical_care_admissions;
CREATE POLICY rls_cc_admissions ON public.critical_care_admissions
    FOR ALL
    TO authenticated, service_role
    USING (organization_id = COALESCE(private.get_current_org_id(), (NULLIF(current_setting('app.current_organization_id', true), ''))::uuid));

DROP POLICY IF EXISTS rls_cc_observations ON public.critical_care_observations;
CREATE POLICY rls_cc_observations ON public.critical_care_observations
    FOR ALL
    TO authenticated, service_role
    USING (organization_id = COALESCE(private.get_current_org_id(), (NULLIF(current_setting('app.current_organization_id', true), ''))::uuid));

COMMIT;

-- 8. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
