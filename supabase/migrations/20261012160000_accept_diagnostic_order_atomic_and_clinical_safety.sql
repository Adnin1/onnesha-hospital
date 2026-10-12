-- Migration 165: Atomic Diagnostic Order Acceptance & Clinical Verification Hardening
-- Enforces:
-- 1. accept_diagnostic_order_atomic RPC: Single-transaction status transition to ACCEPTED
-- 2. State machine validation preventing invalid transitions (e.g. CANCELLED/DELIVERED -> VERIFIED)
-- 3. Fail-closed access control and audit integrity

BEGIN;

-- 1. Create accept_diagnostic_order_atomic RPC
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
BEGIN
    -- Verify caller organization context
    IF p_org_id IS NULL OR p_order_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID and Order ID are required';
    END IF;

    -- Lock target order and verify tenant
    SELECT status INTO v_order_status
    FROM public.diagnostic_orders
    WHERE id = p_order_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RAISE EXCEPTION 'Diagnostic order not found in organization';
    END IF;

    -- Validate state transition: can only accept from ORDERED, PENDING, or PAID
    IF v_order_status NOT IN ('ORDERED', 'PENDING', 'PAID') THEN
        RAISE EXCEPTION 'Cannot accept order in status %; order must be ORDERED, PENDING, or PAID', v_order_status;
    END IF;

    -- Update diagnostic_orders status to ACCEPTED
    UPDATE public.diagnostic_orders
    SET status = 'ACCEPTED',
        updated_at = NOW()
    WHERE id = p_order_id AND organization_id = p_org_id;

    -- Update all associated diagnostic_order_items to ACCEPTED
    UPDATE public.diagnostic_order_items
    SET status = 'ACCEPTED'
    WHERE order_id = p_order_id
      AND status IN ('ORDERED', 'PENDING');

    GET DIAGNOSTICS v_items_count = ROW_COUNT;

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

-- 2. Harden verify_diagnostic_order_atomic with state-machine transition constraints
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
BEGIN
    -- Check order exists in tenant and lock it
    SELECT status INTO v_order_status
    FROM public.diagnostic_orders
    WHERE id = p_order_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RAISE EXCEPTION 'Diagnostic order not found in organization';
    END IF;

    -- State machine validation: Cannot verify CANCELLED or DELIVERED orders
    IF v_order_status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Cannot verify a cancelled diagnostic order';
    END IF;

    IF v_order_status = 'DELIVERED' THEN
        RAISE EXCEPTION 'Cannot re-verify an already delivered diagnostic order';
    END IF;

    -- Check verifier profile exists and belongs to active organization
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_verifier_id 
          AND (organization_id = p_org_id OR organization_id IS NULL)
    ) THEN
        RAISE EXCEPTION 'Verifier profile not found or unauthorized';
    END IF;

    -- Update all items for this order to VERIFIED
    UPDATE public.diagnostic_order_items
    SET status = 'VERIFIED'
    WHERE order_id = p_order_id;

    -- Record clinical verification record with integrity hash for each order item
    FOR v_item IN SELECT id FROM public.diagnostic_order_items WHERE order_id = p_order_id
    LOOP
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
            
        v_verified_count := v_verified_count + 1;
    END LOOP;

    -- Update order status
    UPDATE public.diagnostic_orders
    SET status = 'VERIFIED',
        verified_by_profile_id = p_verifier_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

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
