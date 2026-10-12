-- Migration: 20261012181500_harden_delete_invoice_void_reason_schema_aligned.sql
-- Description: Align delete_invoice_super_admin_atomic with canonical invoices schema columns:
-- status = 'VOID', is_voided = TRUE, voided_by = p_admin_id, void_reason = p_reason.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_admin_id UUID,
  p_reason TEXT,
  p_permanent_purge BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv RECORD;
  v_payment_count INT;
  v_inv_number TEXT;
  v_caller UUID;
  v_is_super BOOLEAN := FALSE;
BEGIN
  -- A. Input validation
  IF p_org_id IS NULL OR p_invoice_id IS NULL OR p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID, Invoice ID, and Admin ID are mandatory.';
  END IF;

  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Purge reason is mandatory and cannot be empty.';
  END IF;

  -- B. Direct RPC caller authentication hardening
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
    RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
  END IF;

  -- C. Role verification: Enforce active Super Admin role via user_roles & roles
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'super admin')
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Unauthorized: Permanent invoice deletion requires active Super Admin role in this organization.';
  END IF;

  -- D. Lock target invoice and verify tenant
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or organization mismatch.');
  END IF;

  v_inv_number := v_inv.invoice_number;

  -- E. In-Transaction Mandatory Audit Logging (Rolls back if audit fails)
  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    module,
    entity_type,
    entity_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    p_org_id,
    p_admin_id,
    CASE WHEN p_permanent_purge THEN 'PURGE' ELSE 'VOID' END,
    'BILLING',
    'invoices',
    p_invoice_id::text,
    to_jsonb(v_inv),
    jsonb_build_object(
      'invoice_number', v_inv_number,
      'reason', p_reason,
      'permanent_purge', p_permanent_purge,
      'total_amount', v_inv.total_amount,
      'paid_amount', v_inv.paid_amount,
      'due_amount', v_inv.due_amount,
      'status', v_inv.status,
      'timestamp', NOW()
    ),
    NOW()
  );

  -- F. Branching execution based on purge mode
  IF p_permanent_purge THEN
    -- PERMANENT PURGE: Fully clean up line items, payments, refunds, journal entries, and invoice
    DELETE FROM public.refunds WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
    DELETE FROM public.journal_entries WHERE reference_id = p_invoice_id;
    DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice, line items, payments, journal entries permanently purged.'
    );
  ELSE
    -- SOFT CANCEL / VOID: Fail closed if real revenue collected
    IF v_inv.status = 'PAID' OR v_inv.paid_amount > 0 THEN
      SELECT COUNT(*) INTO v_payment_count
      FROM public.payments
      WHERE invoice_id = p_invoice_id;

      IF v_payment_count > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot soft-delete an invoice with collected payments. Use permanent purge with valid justification or process refund.'
        );
      END IF;
    END IF;

    UPDATE public.invoices
    SET status = 'VOID',
        is_voided = TRUE,
        voided_by = p_admin_id,
        void_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'VOIDED',
      'invoice_number', v_inv_number,
      'message', 'Invoice marked as void successfully.'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) FROM anon, public;

COMMIT;
