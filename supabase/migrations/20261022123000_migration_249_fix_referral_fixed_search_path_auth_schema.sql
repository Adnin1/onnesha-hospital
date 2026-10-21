-- Migration 249: fix fixed-search_path qualification for referral authorization paths.
-- Migration 246/248 intentionally removed mutable search_path. These functions use auth.*
-- explicitly, so the fixed path must include the trusted auth schema.
BEGIN;

ALTER FUNCTION public.record_referral_commission_payout_atomic(
  UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR
) SET search_path = public, auth, pg_temp;

ALTER FUNCTION public.record_referral_commission_payout_atomic(
  UUID, UUID, NUMERIC, VARCHAR, UUID, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR
) SET search_path = public, auth, pg_temp;

ALTER FUNCTION public.enforce_referral_commission_settlement_authorization()
  SET search_path = public, auth, pg_temp;

NOTIFY pgrst, 'reload schema';
COMMIT;
