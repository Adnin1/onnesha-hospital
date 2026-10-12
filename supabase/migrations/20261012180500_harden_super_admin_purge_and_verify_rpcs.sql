-- Migration: 20261012180500_harden_super_admin_purge_and_verify_rpcs.sql
-- Description: Apply hardened delete_invoice_super_admin_atomic and verify_diagnostic_order_atomic
-- using verified schema tables: public.payments, public.refunds, and public.diagnostic_report_verifications.

BEGIN;

-- 1. HARDEN delete_invoice_super_admin_atomic
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
    CASE WHEN p_permanent_purge THEN 'PURGE' ELSE 'DELETE' END,
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
    -- PERMANENT PURGE: Fully clean up line items, payments, refunds, GL entries, and invoice
    DELETE FROM public.refunds WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
    DELETE FROM public.gl_transactions WHERE reference_id = p_invoice_id::text OR reference_number = v_inv_number;
    DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice, line items, payments, ledger entries permanently purged.'
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
    SET status = 'CANCELLED',
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'CANCELLED',
      'invoice_number', v_inv_number,
      'message', 'Invoice soft-cancelled successfully.'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_admin_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.delete_invoice_super_admin_atomic(p_org_id, p_invoice_id, p_admin_id, p_reason, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) FROM anon, public;

-- 2. HARDEN verify_diagnostic_order_atomic
CREATE OR REPLACE FUNCTION public.verify_diagnostic_order_atomic(
    p_org_id UUID,
    p_order_id UUID,
    p_verifier_id UUID,
    p_signature_hash TEXT,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status VARCHAR(30);
    v_item RECORD;
    v_verified_count INT := 0;
    v_has_results BOOLEAN := FALSE;
    v_caller UUID;
    v_has_verify_role BOOLEAN := FALSE;
    v_previous_hash TEXT;
BEGIN
    IF p_org_id IS NULL OR p_order_id IS NULL OR p_verifier_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID, Order ID, and Verifier ID are required';
    END IF;

    IF TRIM(COALESCE(p_signature_hash, '')) = '' THEN
        RAISE EXCEPTION 'Verification integrity hash is mandatory';
    END IF;

    -- Direct caller validation
    v_caller := auth.uid();
    IF v_caller IS NOT NULL AND v_caller != p_verifier_id THEN
        RAISE EXCEPTION 'Caller auth identity does not match verifier profile ID';
    END IF;

    -- Check verifier has clinical credentials via user_roles
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_verifier_id
          AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'doctor', 'lab_technologist', 'pathologist', 'hospital_administrator')
    ) INTO v_has_verify_role;

    IF NOT v_has_verify_role THEN
        RAISE EXCEPTION 'Unauthorized: Verifier lacks clinical authorization credentials in this organization';
    END IF;

    -- Check order exists in tenant and lock it
    SELECT status INTO v_order_status
    FROM public.diagnostic_orders
    WHERE id = p_order_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Diagnostic order not found in organization');
    END IF;

    -- Restrict prior state strictly to PROCESSING or SAMPLE_COLLECTED
    IF v_order_status NOT IN ('PROCESSING', 'SAMPLE_COLLECTED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order cannot be verified from state: ' || v_order_status || '. Must be in PROCESSING or SAMPLE_COLLECTED.'
        );
    END IF;

    -- Iterate and verify each order item
    FOR v_item IN
        SELECT doi.id, doi.test_id
        FROM public.diagnostic_order_items doi
        WHERE doi.order_id = p_order_id
        FOR UPDATE
    LOOP
        -- Check result completeness: at least one result row must exist
        SELECT EXISTS (
            SELECT 1 FROM public.diagnostic_results dr
            WHERE dr.order_item_id = v_item.id
              AND dr.result_value IS NOT NULL
              AND TRIM(dr.result_value) != ''
        ) INTO v_has_results;

        IF NOT v_has_results THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Cannot verify item ' || v_item.id || ': No test results recorded. Result completeness is required.'
            );
        END IF;

        -- Check previous verification in diagnostic_report_verifications
        SELECT signature_hash INTO v_previous_hash
        FROM public.diagnostic_report_verifications
        WHERE order_item_id = v_item.id;

        -- Upsert diagnostic_report_verifications
        INSERT INTO public.diagnostic_report_verifications (
            order_item_id, verified_by, signature_hash, verified_at, remarks
        ) VALUES (
            v_item.id, p_verifier_id, p_signature_hash, NOW(), p_remarks
        )
        ON CONFLICT (order_item_id) DO UPDATE SET
            verified_by = EXCLUDED.verified_by,
            signature_hash = EXCLUDED.signature_hash,
            verified_at = EXCLUDED.verified_at,
            remarks = EXCLUDED.remarks;

        -- Update order item status to VERIFIED
        UPDATE public.diagnostic_order_items
        SET status = 'VERIFIED',
            updated_at = NOW()
        WHERE id = v_item.id;

        -- Record amendment / verification log
        INSERT INTO public.diagnostic_report_verification_logs (
            order_id,
            order_item_id,
            verified_by,
            signature_hash,
            remarks,
            action,
            created_at
        ) VALUES (
            p_order_id,
            v_item.id,
            p_verifier_id,
            p_signature_hash,
            p_remarks,
            CASE WHEN v_previous_hash IS NOT NULL THEN 'AMENDED_VERIFICATION' ELSE 'INITIAL_VERIFICATION' END,
            NOW()
        );

        v_verified_count := v_verified_count + 1;
    END LOOP;

    -- Update order to COMPLETED
    UPDATE public.diagnostic_orders
    SET status = 'COMPLETED',
        updated_at = NOW()
    WHERE id = p_order_id AND organization_id = p_org_id;

    -- In-transaction mandatory audit logging
    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values,
        created_at
    ) VALUES (
        p_org_id,
        p_verifier_id,
        'VERIFY',
        'DIAGNOSTICS',
        'diagnostic_orders',
        p_order_id::text,
        jsonb_build_object(
            'previous_status', v_order_status,
            'new_status', 'COMPLETED',
            'verified_items_count', v_verified_count,
            'signature_hash', p_signature_hash,
            'verifier_id', p_verifier_id,
            'timestamp', NOW()
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'COMPLETED',
        'verified_items_count', v_verified_count,
        'signature_hash', p_signature_hash
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_diagnostic_order_atomic(UUID, UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.verify_diagnostic_order_atomic(UUID, UUID, UUID, TEXT, TEXT) FROM anon, public;

COMMIT;
