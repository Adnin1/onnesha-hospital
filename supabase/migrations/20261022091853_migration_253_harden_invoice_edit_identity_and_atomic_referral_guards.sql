-- Migration 253: Harden invoice edit caller identity and referral settlement atomic guards
-- Root causes fixed:
-- 1) Migration 252 trusted caller-supplied p_user_id inside a SECURITY DEFINER RPC.
-- 2) Migration 252 could rewrite invoice_items before returning a business-rule error.
-- 3) A PAID referral commission could remain settled while invoice financial values changed.
-- 4) Concurrent edits were not serialized at the invoice row boundary.
--
-- Strategy:
-- - Move the v252 8-parameter implementation into the private schema and revoke client EXECUTE.
-- - Replace the public 8-parameter endpoint with a fail-closed wrapper that binds p_user_id to auth.uid(),
--   locks the invoice row, validates selected referral agent before any writes, and rejects all edits
--   once a referral commission for that invoice is settled PAID.
-- - Keep the existing 7-parameter compatibility forwarder; it resolves to the hardened 8-param wrapper.

BEGIN;

-- Move the previously deployed v252 implementation out of the exposed public API.
ALTER FUNCTION public.update_invoice_atomic(
  UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, UUID
) SET SCHEMA private;

ALTER FUNCTION private.update_invoice_atomic(
  UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, UUID
) RENAME TO update_invoice_atomic_v252_internal;

REVOKE ALL ON FUNCTION private.update_invoice_atomic_v252_internal(
  UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, UUID
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_invoice_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_user_id UUID,
  p_items JSONB,
  p_discount_amount NUMERIC,
  p_discount_reason TEXT,
  p_tax_amount NUMERIC,
  p_referral_agent_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid UUID := auth.uid();
  v_jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
  v_invoice RECORD;
  v_paid_commission RECORD;
BEGIN
  -- Fail closed for normal signed-in callers: a caller may only act as themselves.
  -- service_role remains available for trusted administrative tooling.
  IF v_jwt_role <> 'service_role' THEN
    IF v_auth_uid IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '401 Unauthorized: authenticated user identity is required.'
      );
    END IF;

    IF p_user_id IS DISTINCT FROM v_auth_uid THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', '403 Forbidden: caller identity does not match p_user_id.'
      );
    END IF;
  END IF;

  IF p_org_id IS NULL OR p_invoice_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid invoice edit request.'
    );
  END IF;

  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invoice must contain at least one item.'
    );
  END IF;

  -- Serialize all edits to this invoice and verify tenant ownership before any mutation.
  SELECT i.*
  INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invoice not found.'
    );
  END IF;

  IF v_invoice.is_voided THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot edit a voided invoice.'
    );
  END IF;

  -- Validate an explicitly selected referral agent before the internal v252 function
  -- can touch invoice_items.
  IF p_referral_agent_id IS NOT NULL
     AND p_referral_agent_id <> '00000000-0000-0000-0000-000000000000'::uuid
     AND NOT EXISTS (
       SELECT 1
       FROM public.referral_agents ra
       WHERE ra.id = p_referral_agent_id
         AND ra.organization_id = p_org_id
         AND ra.is_active IS TRUE
         AND ra.archived_at IS NULL
     ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Selected referral agent is invalid or inactive.'
    );
  END IF;

  -- A settled referral commission is a financial close boundary.
  -- Once paid out, changing items/discount/tax/referral attribution would make the
  -- invoice and referral settlement ledger disagree. Require an explicit reversal
  -- workflow instead of silently rewriting history.
  SELECT rc.id, rc.referral_agent_id, rc.settlement_status
  INTO v_paid_commission
  FROM public.referral_commissions rc
  WHERE rc.organization_id = p_org_id
    AND rc.invoice_id = p_invoice_id
    AND rc.settlement_status = 'PAID'
  ORDER BY rc.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      'Cannot edit this invoice because its referral commission has already been settled and paid. Reverse the settlement through the authorized commission reversal workflow first.'
    );
  END IF;

  -- Delegate only after all fail-closed validations have completed.
  RETURN private.update_invoice_atomic_v252_internal(
    p_org_id,
    p_invoice_id,
    p_user_id,
    p_items,
    p_discount_amount,
    p_discount_reason,
    p_tax_amount,
    p_referral_agent_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_atomic(
  UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(
  UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, UUID
) TO authenticated, service_role;

-- Recreate the 7-parameter compatibility forwarder so it resolves to the hardened wrapper.
CREATE OR REPLACE FUNCTION public.update_invoice_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_user_id UUID,
  p_items JSONB,
  p_discount_amount NUMERIC,
  p_discount_reason TEXT,
  p_tax_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.update_invoice_atomic(
    p_org_id,
    p_invoice_id,
    p_user_id,
    p_items,
    p_discount_amount,
    p_discount_reason,
    p_tax_amount,
    NULL::UUID
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_atomic(
  UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(
  UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC
) TO authenticated, service_role;

COMMIT;
