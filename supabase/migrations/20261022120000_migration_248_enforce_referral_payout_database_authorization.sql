-- Migration 248: enforce referral payout authorization at the database boundary.
-- UI permission checks are not an authorization boundary because authenticated users can call
-- PostgREST RPCs directly. Every settlement insert, including SECURITY DEFINER RPC paths,
-- must require a same-tenant referral commission pay/manage permission or super-admin status.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_referral_commission_settlement_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_caller_id uuid := auth.uid();
  v_jwt_role text := auth.jwt() ->> 'role';
  v_is_super_admin boolean := false;
  v_can_pay boolean := false;
BEGIN
  -- Explicit machine/service boundary. A normal authenticated session never reaches this branch.
  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION '401 Unauthorized: Referral payout requires an authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_caller_id
      AND p.is_super_admin IS TRUE
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_caller_id
      AND ur.organization_id = NEW.organization_id
      AND lower(r.name) = 'super_admin'
  )
  INTO v_is_super_admin;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = v_caller_id
      AND ur.organization_id = NEW.organization_id
      AND rp.permission_key IN (
        'referral.commission.pay',
        'referral.manage',
        '*'
      )
  )
  INTO v_can_pay;

  IF NOT (v_is_super_admin OR v_can_pay) THEN
    RAISE EXCEPTION '403 Forbidden: referral.commission.pay permission required for this organization.'
      USING ERRCODE = '42501';
  END IF;

  -- Non-super-admins must also have an actual membership/profile in the target organization.
  IF NOT v_is_super_admin AND NOT (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_caller_id
        AND (
          p.organization_id = NEW.organization_id
          OR p.active_organization_id = NEW.organization_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = v_caller_id
        AND ur.organization_id = NEW.organization_id
    )
  ) THEN
    RAISE EXCEPTION '403 Forbidden: Cross-tenant referral payout is prohibited.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_referral_commission_settlement_authorization()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS referral_commission_settlement_authorization_guard
  ON public.referral_commission_settlements;

CREATE TRIGGER referral_commission_settlement_authorization_guard
  BEFORE INSERT ON public.referral_commission_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_referral_commission_settlement_authorization();

NOTIFY pgrst, 'reload schema';
COMMIT;
