-- Migration 246: enable tenant RLS for compatibility tables and harden referral payout search_path.
-- Applied history version: 20261022110000 / migration_246_enable_rls_ot_referral_and_harden_search_path.
-- Keep this file aligned with the already-applied remote migration; later privilege reductions
-- belong in a new migration and must not rewrite this applied version.
BEGIN;

ALTER TABLE public.ot_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ot_schedules_tenant_isolation ON public.ot_schedules;
CREATE POLICY ot_schedules_tenant_isolation
  ON public.ot_schedules
  FOR ALL
  TO authenticated
  USING (
    organization_id = ((SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id'))::uuid)
    OR organization_id = public.get_current_org_id()
  )
  WITH CHECK (
    organization_id = ((SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id'))::uuid)
    OR organization_id = public.get_current_org_id()
  );
REVOKE ALL PRIVILEGES ON TABLE public.ot_schedules FROM PUBLIC, anon;

ALTER TABLE public.referral_commission_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_commission_claims_tenant_isolation ON public.referral_commission_claims;
CREATE POLICY referral_commission_claims_tenant_isolation
  ON public.referral_commission_claims
  FOR ALL
  TO authenticated
  USING (
    organization_id = ((SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id'))::uuid)
    OR organization_id = public.get_current_org_id()
  )
  WITH CHECK (
    organization_id = ((SELECT (auth.jwt() -> 'app_metadata' ->> 'organization_id'))::uuid)
    OR organization_id = public.get_current_org_id()
  );
REVOKE ALL PRIVILEGES ON TABLE public.referral_commission_claims FROM PUBLIC, anon;

-- Pin both legacy and canonical SECURITY DEFINER overloads to a fixed empty search_path.
ALTER FUNCTION public.record_referral_commission_payout_atomic(
  UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR
) SET search_path = '';
ALTER FUNCTION public.record_referral_commission_payout_atomic(
  UUID, UUID, NUMERIC, VARCHAR, UUID, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR
) SET search_path = '';

NOTIFY pgrst, 'reload schema';
COMMIT;
