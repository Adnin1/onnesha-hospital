-- Migration 247: remove direct client access to unused internal compatibility tables.
-- Current canonical OT scheduling uses public.ot_bookings/public.ot_rooms.
-- public.referral_commission_claims is only accessed by owner-executed admission cleanup.
-- These tables remain RLS-enabled; owner/SECURITY DEFINER cleanup and service_role retain access.
BEGIN;

DROP POLICY IF EXISTS ot_schedules_tenant_isolation ON public.ot_schedules;
REVOKE ALL PRIVILEGES ON TABLE public.ot_schedules FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS referral_commission_claims_tenant_isolation ON public.referral_commission_claims;
REVOKE ALL PRIVILEGES ON TABLE public.referral_commission_claims FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
