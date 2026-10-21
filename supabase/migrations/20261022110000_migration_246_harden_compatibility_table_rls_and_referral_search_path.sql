-- Migration 246: close exposed compatibility-table access and pin referral payout wrapper search_path.
-- These tables have no canonical application callers: OT scheduling uses ot_bookings,
-- and referral_commission_claims is referenced only by SECURITY DEFINER cleanup logic.
-- The postgres-owned SECURITY DEFINER cleanup function can continue to maintain them;
-- client API roles must not access them directly.
BEGIN;

ALTER TABLE public.ot_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.ot_schedules FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.ot_schedules TO service_role;

ALTER TABLE public.referral_commission_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.referral_commission_claims FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.referral_commission_claims TO service_role;

-- Fix the legacy 8-argument SECURITY DEFINER compatibility wrapper flagged by the
-- Supabase advisor. Its body already schema-qualifies the delegated RPC.
ALTER FUNCTION public.record_referral_commission_payout_atomic(
  UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR
) SET search_path = '';

NOTIFY pgrst, 'reload schema';
COMMIT;
