-- Migration 101: Drop legacy public policies on critical_care_admissions
BEGIN;

DROP POLICY IF EXISTS cc_admissions_select ON public.critical_care_admissions;
DROP POLICY IF EXISTS cc_admissions_insert ON public.critical_care_admissions;
DROP POLICY IF EXISTS cc_admissions_update ON public.critical_care_admissions;
DROP POLICY IF EXISTS cc_admissions_delete ON public.critical_care_admissions;

COMMIT;

NOTIFY pgrst, 'reload schema';
