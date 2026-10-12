-- Migration: 20261012173000_harden_security_definer_rpcs_and_purge_audit.sql
-- Description: P0 Security Definer direct-RPC hardening, in-transaction audit logging,
-- and clinical result completeness enforcement for permanent invoice purge and diagnostic workflows.

BEGIN;

-- 1. Create diagnostic_report_verification_logs to track complete amendment audit history
CREATE TABLE IF NOT EXISTS public.diagnostic_report_verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.diagnostic_orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES public.diagnostic_order_items(id) ON DELETE CASCADE,
    verified_by UUID NOT NULL REFERENCES public.profiles(id),
    signature_hash VARCHAR(255) NOT NULL,
    remarks TEXT,
    action VARCHAR(50) NOT NULL DEFAULT 'INITIAL_VERIFICATION',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drv_logs_order_id ON public.diagnostic_report_verification_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_drv_logs_item_id ON public.diagnostic_report_verification_logs(order_item_id);

ALTER TABLE public.diagnostic_report_verification_logs ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON public.diagnostic_report_verification_logs FROM public;

-- ============================================================================
-- 2. HARDEN delete_invoice_super_admin_atomic (P0 SECURITY & AUDIT INTEGRITY)
-- ============================================================================
DROP FUNCTION IF EXISTS public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN);

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

  -- C. Role verification: Enforce active Super Admin role
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'super admin')
  )
  OR EXISTS (
    SELECT 1 
    FROM public.profiles p
    WHERE p.id = p_admin_id
      AND (p.organization_id = p_org_id OR p.organization_id IS NULL)
      AND LOWER(p.role) IN ('super_admin', 'super admin')
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
      'purged_by', p_admin_id,
      'timestamp', NOW()
    ),
    NOW()
  );

  -- F. Deletion execution
  IF p_permanent_purge THEN
    -- Unlink foreign references across modules
    UPDATE public.pharmacy_sales 
    SET invoice_id = NULL 
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.referral_commissions 
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.insurance_claims 
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.payment_allocations 
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.refunds 
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.payments 
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.invoice_items 
    WHERE invoice_id = p_invoice_id;

    -- Update linked diagnostic orders to unbilled
    UPDATE public.diagnostic_orders 
    SET billing_status = 'UNBILLED', 
        status = CASE WHEN status = 'PAID' THEN 'ORDERED' ELSE status END,
        updated_at = NOW()
    WHERE invoice_id = p_invoice_id;

    DELETE FROM public.invoices 
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PERMANENT_PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice ' || v_inv_number || ' and all ledger associations permanently wiped.'
    );
  ELSE
    -- Standard soft-delete void
    UPDATE public.invoices
    SET is_voided = TRUE,
        void_reason = p_reason,
        voided_by = p_admin_id,
        status = 'CANCELLED',
        updated_at = NOW()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'SOFT_VOIDED',
      'invoice_number', v_inv_number,
      'message', 'Invoice ' || v_inv_number || ' marked cancelled/voided.'
    );
  END IF;
END;
$$;

-- Backward-compatible 4-arg signature overload
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

-- ============================================================================
-- 3. HARDEN accept_diagnostic_order_atomic (LAB STATE & AUTHORIZATION)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_diagnostic_order_atomic(
    p_org_id UUID,
    p_order_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status VARCHAR(30);
    v_items_count INT := 0;
    v_caller UUID;
    v_has_lab_access BOOLEAN := FALSE;
BEGIN
    IF p_org_id IS NULL OR p_order_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID, Order ID, and User ID are required';
    END IF;

    -- Direct caller validation
    v_caller := auth.uid();
    IF v_caller IS NOT NULL AND v_caller != p_user_id THEN
        RAISE EXCEPTION 'Caller auth identity does not match staff user ID';
    END IF;

    -- Check staff belongs to organization with operational permissions
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id
          AND (organization_id = p_org_id OR organization_id IS NULL)
          AND LOWER(role) IN ('super_admin', 'hospital_administrator', 'lab_technologist', 'pathologist', 'doctor', 'receptionist')
    )
    OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id
          AND ur.organization_id = p_org_id
    ) INTO v_has_lab_access;

    IF NOT v_has_lab_access THEN
        RAISE EXCEPTION 'Unauthorized: User lacks laboratory operational authority';
    END IF;

    -- Lock target order
    SELECT status INTO v_order_status
    FROM public.diagnostic_orders
    WHERE id = p_order_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RAISE EXCEPTION 'Diagnostic order not found in organization';
    END IF;

    -- State machine validation
    IF v_order_status NOT IN ('ORDERED', 'PENDING', 'PAID') THEN
        RAISE EXCEPTION 'Cannot accept order in status %; order must be ORDERED, PENDING, or PAID', v_order_status;
    END IF;

    UPDATE public.diagnostic_orders
    SET status = 'ACCEPTED',
        updated_at = NOW()
    WHERE id = p_order_id AND organization_id = p_org_id;

    UPDATE public.diagnostic_order_items
    SET status = 'ACCEPTED'
    WHERE order_id = p_order_id
      AND status IN ('ORDERED', 'PENDING');

    GET DIAGNOSTICS v_items_count = ROW_COUNT;

    -- In-transaction audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, p_user_id, 'ACCEPT', 'LAB', 'diagnostic_order', p_order_id::text,
        jsonb_build_object('previous_status', v_order_status),
        jsonb_build_object('status', 'ACCEPTED', 'accepted_items_count', v_items_count),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', p_order_id,
        'status', 'ACCEPTED',
        'accepted_items_count', v_items_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_diagnostic_order_atomic(UUID, UUID, UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.accept_diagnostic_order_atomic(UUID, UUID, UUID) FROM anon, public;

-- ============================================================================
-- 4. HARDEN verify_diagnostic_order_atomic (CLINICAL SAFETY & COMPLETENESS)
-- ============================================================================
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

    -- Check verifier profile exists and has clinical verification credentials
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_verifier_id 
          AND (organization_id = p_org_id OR organization_id IS NULL)
          AND LOWER(role) IN ('super_admin', 'doctor', 'lab_technologist', 'pathologist', 'hospital_administrator')
    )
    OR EXISTS (
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

    IF v_order_status IS NULL THEN
        RAISE EXCEPTION 'Diagnostic order not found in organization';
    END IF;

    -- State machine validation: Only orders in PROCESSING (or SAMPLE_COLLECTED) can be verified
    IF v_order_status NOT IN ('PROCESSING', 'SAMPLE_COLLECTED') THEN
        RAISE EXCEPTION 'Cannot verify order in status %; order must be in PROCESSING or SAMPLE_COLLECTED', v_order_status;
    END IF;

    -- Result completeness validation: Must have recorded test results/findings
    SELECT EXISTS (
        SELECT 1 
        FROM public.diagnostic_order_items doi
        JOIN public.diagnostic_results dr ON dr.order_item_id = doi.id
        WHERE doi.order_id = p_order_id
    ) INTO v_has_results;

    IF NOT v_has_results THEN
        RAISE EXCEPTION 'Cannot verify diagnostic order: No test results or descriptive findings have been recorded';
    END IF;

    -- Update order items to VERIFIED
    UPDATE public.diagnostic_order_items
    SET status = 'VERIFIED'
    WHERE order_id = p_order_id;

    -- Record clinical verification and maintain amendment history
    FOR v_item IN SELECT id FROM public.diagnostic_order_items WHERE order_id = p_order_id
    LOOP
        SELECT signature_hash INTO v_previous_hash
        FROM public.diagnostic_report_verifications
        WHERE order_item_id = v_item.id;

        INSERT INTO public.diagnostic_report_verifications (
            order_item_id, verified_by, signature_hash, verified_at, remarks
        ) VALUES (
            v_item.id, p_verifier_id, p_signature_hash, NOW(), p_remarks
        )
        ON CONFLICT (order_item_id) DO UPDATE
        SET verified_by = EXCLUDED.verified_by,
            signature_hash = EXCLUDED.signature_hash,
            verified_at = EXCLUDED.verified_at,
            remarks = EXCLUDED.remarks;

        -- Record permanent amendment log
        INSERT INTO public.diagnostic_report_verification_logs (
            order_id, order_item_id, verified_by, signature_hash, remarks, action
        ) VALUES (
            p_order_id, v_item.id, p_verifier_id, p_signature_hash, p_remarks,
            CASE WHEN v_previous_hash IS NOT NULL THEN 'AMENDMENT_UPDATE' ELSE 'INITIAL_VERIFICATION' END
        );

        v_verified_count := v_verified_count + 1;
    END LOOP;

    -- Update parent order status
    UPDATE public.diagnostic_orders
    SET status = 'VERIFIED',
        verified_by_profile_id = p_verifier_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- In-transaction mandatory audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, p_verifier_id, 'VERIFY', 'LAB', 'diagnostic_order', p_order_id::text,
        jsonb_build_object('previous_status', v_order_status),
        jsonb_build_object(
            'status', 'VERIFIED',
            'signature_hash', p_signature_hash,
            'verified_items_count', v_verified_count,
            'remarks', p_remarks
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', p_order_id,
        'status', 'VERIFIED',
        'verified_items_count', v_verified_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_diagnostic_order_atomic(UUID, UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.verify_diagnostic_order_atomic(UUID, UUID, UUID, TEXT, TEXT) FROM anon, public;

COMMIT;
