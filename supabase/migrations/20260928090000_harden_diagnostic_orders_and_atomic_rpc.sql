-- =====================================================================================
-- Migration: 20260928090000_harden_diagnostic_orders_and_atomic_rpc.sql
-- Description:
--   1. Adds clinical_notes, verified_by_profile_id, and verified_at to diagnostic_orders
--   2. Enforces unique constraint on diagnostic_order_items (order_id, test_id)
--   3. Provides atomic RPC create_diagnostic_order_atomic to prevent orphaned orders
--   4. Provides atomic RPC verify_diagnostic_order_atomic for fail-closed electronic signing
--   5. Adds seed_organization_diagnostic_catalog for dynamic multi-tenant catalog provisioning
-- =====================================================================================

BEGIN;

-- 1. Schema Alterations on diagnostic_orders
ALTER TABLE public.diagnostic_orders 
    ADD COLUMN IF NOT EXISTS clinical_notes TEXT,
    ADD COLUMN IF NOT EXISTS verified_by_profile_id UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 2. Unique Constraint on diagnostic_order_items to eliminate duplicate line items
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_diagnostic_order_item_test'
    ) THEN
        ALTER TABLE public.diagnostic_order_items 
            ADD CONSTRAINT uq_diagnostic_order_item_test UNIQUE (order_id, test_id);
    END IF;
END $$;

-- 3. Atomic Order Creation RPC
CREATE OR REPLACE FUNCTION public.create_diagnostic_order_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_test_ids UUID[],
    p_doctor_id UUID DEFAULT NULL,
    p_visit_id UUID DEFAULT NULL,
    p_clinical_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_order_number VARCHAR(30);
    v_order_id UUID;
    v_test_id UUID;
    v_price NUMERIC(10, 2);
    v_total NUMERIC(10, 2) := 0;
    v_item_count INT := 0;
    v_clean_test_ids UUID[];
BEGIN
    -- 1. Input validations
    IF p_org_id IS NULL OR p_patient_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID and Patient ID are required';
    END IF;

    -- Validate patient belongs to organization
    IF NOT EXISTS (
        SELECT 1 FROM public.patients 
        WHERE id = p_patient_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'Patient does not exist or does not belong to the current organization';
    END IF;

    -- Validate doctor belongs to organization if specified
    IF p_doctor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.doctors 
        WHERE id = p_doctor_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'Doctor does not exist or does not belong to the current organization';
    END IF;

    -- Validate visit belongs to organization if specified
    IF p_visit_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.patient_visits 
        WHERE id = p_visit_id AND organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'Visit does not exist or does not belong to the current organization';
    END IF;

    -- Deduplicate requested test IDs
    SELECT ARRAY_AGG(DISTINCT tid) INTO v_clean_test_ids
    FROM unnest(p_test_ids) AS tid;

    IF v_clean_test_ids IS NULL OR array_length(v_clean_test_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one diagnostic test must be ordered';
    END IF;

    -- Verify all requested tests belong to the organization and are active
    IF (
        SELECT COUNT(*) 
        FROM public.diagnostic_tests 
        WHERE id = ANY(v_clean_test_ids) 
          AND organization_id = p_org_id 
          AND is_active = TRUE
    ) <> array_length(v_clean_test_ids, 1) THEN
        RAISE EXCEPTION 'One or more diagnostic tests are invalid, inactive, or belong to another organization';
    END IF;

    -- Generate atomic sequential order number
    v_order_number := public.generate_diagnostic_order_number(p_org_id);

    -- Insert Order record
    INSERT INTO public.diagnostic_orders (
        organization_id, patient_id, visit_id, referred_by_doctor_id, order_number, clinical_notes, status
    ) VALUES (
        p_org_id, p_patient_id, p_visit_id, p_doctor_id, v_order_number, p_clinical_notes, 'ORDERED'
    ) RETURNING id INTO v_order_id;

    -- Insert Order Items with verified catalog pricing
    FOR v_test_id, v_price IN 
        SELECT id, price FROM public.diagnostic_tests WHERE id = ANY(v_clean_test_ids)
    LOOP
        INSERT INTO public.diagnostic_order_items (
            order_id, test_id, price, status
        ) VALUES (
            v_order_id, v_test_id, v_price, 'PENDING'
        );
        v_total := v_total + v_price;
        v_item_count := v_item_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total_amount', v_total,
        'test_count', v_item_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_diagnostic_order_atomic(UUID, UUID, UUID[], UUID, UUID, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_diagnostic_order_atomic(UUID, UUID, UUID[], UUID, UUID, TEXT) FROM anon, public;

-- 4. Atomic Order Verification RPC
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
SET search_path = ''
AS $$
DECLARE
    v_order_status VARCHAR(30);
    v_item RECORD;
    v_verified_count INT := 0;
BEGIN
    -- Check order exists in tenant
    SELECT status INTO v_order_status
    FROM public.diagnostic_orders
    WHERE id = p_order_id AND organization_id = p_org_id;

    IF v_order_status IS NULL THEN
        RAISE EXCEPTION 'Diagnostic order not found in current organization';
    END IF;

    -- Check verifier profile exists
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_verifier_id
    ) THEN
        RAISE EXCEPTION 'Verifier profile not found';
    END IF;

    -- Update all items for this order to VERIFIED
    UPDATE public.diagnostic_order_items
    SET status = 'VERIFIED'
    WHERE order_id = p_order_id;

    -- Record pathologist verification for each order item
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

-- 5. Multi-Tenant Organization Catalog Seeding Helper
CREATE OR REPLACE FUNCTION public.seed_organization_diagnostic_catalog(p_target_org_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_inserted INT := 0;
BEGIN
    IF p_target_org_id IS NULL THEN
        RAISE EXCEPTION 'Target organization ID cannot be null';
    END IF;

    -- If target org already has tests, do nothing
    IF EXISTS (SELECT 1 FROM public.diagnostic_tests WHERE organization_id = p_target_org_id) THEN
        RETURN 0;
    END IF;

    -- Copy categories
    INSERT INTO public.diagnostic_categories (
        organization_id, category_name, category_code, description
    )
    SELECT p_target_org_id, category_name, category_code, description
    FROM public.diagnostic_categories
    WHERE organization_id = v_source_org_id
    ON CONFLICT (organization_id, category_code) DO NOTHING;

    -- Copy tests
    INSERT INTO public.diagnostic_tests (
        organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
    )
    SELECT 
        p_target_org_id, 
        tc.id, 
        st.test_code, 
        st.test_name, 
        st.specimen_type, 
        st.price, 
        st.delivery_turnaround_hours, 
        st.has_numerical_parameters, 
        st.is_active
    FROM public.diagnostic_tests st
    JOIN public.diagnostic_categories sc ON sc.id = st.category_id
    JOIN public.diagnostic_categories tc ON tc.category_code = sc.category_code AND tc.organization_id = p_target_org_id
    WHERE st.organization_id = v_source_org_id
    ON CONFLICT (organization_id, test_code) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_organization_diagnostic_catalog(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.seed_organization_diagnostic_catalog(UUID) FROM anon, public;

COMMIT;
