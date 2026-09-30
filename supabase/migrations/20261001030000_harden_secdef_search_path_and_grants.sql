-- ==============================================================================
-- Migration 98: Harden SECURITY DEFINER Functions — search_path & EXECUTE Grants
-- 
-- Fixes two SECURITY DEFINER functions that were created with the weaker
-- SET search_path = public instead of the repository-standard SET search_path = ''
-- with fully schema-qualified references.
--
-- Per Supabase security guidance:
--   1. SET search_path = '' prevents search_path hijacking
--   2. All table/function references must be fully schema-qualified
--   3. Explicit REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated
--
-- Functions hardened:
--   1. public.ingest_analyzer_transmission_atomic (from migration 96)
--   2. public.update_hospital_master_profile (from migration 97)
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. HARDEN: ingest_analyzer_transmission_atomic
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ingest_analyzer_transmission_atomic(
    p_organization_id UUID,
    p_analyzer_id UUID,
    p_sample_barcode VARCHAR,
    p_raw_message TEXT,
    p_protocol VARCHAR,
    p_message_type VARCHAR,
    p_parsed_results JSONB,
    p_payload_fingerprint VARCHAR,
    p_is_simulation BOOLEAN,
    p_order_id UUID,
    p_order_item_id UUID,
    p_technician_id UUID,
    p_result_values JSONB,
    p_panic_alerts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_id UUID;
    v_transmission_id UUID;
    v_result_id UUID;
    v_rec RECORD;
    v_applied_count INT := 0;
    v_panic_count INT := 0;
BEGIN
    -- 1. Database-level Idempotency: Check if transmission already exists
    SELECT id INTO v_existing_id
    FROM public.lab_analyzer_transmissions
    WHERE organization_id = p_organization_id
      AND analyzer_id = p_analyzer_id
      AND payload_fingerprint = p_payload_fingerprint
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'transmission_id', v_existing_id,
            'results_applied', 0,
            'panic_count', 0
        );
    END IF;

    -- 2. Insert new transmission record
    INSERT INTO public.lab_analyzer_transmissions (
        organization_id, analyzer_id, sample_barcode,
        raw_message, protocol, message_type,
        parsed_results, payload_fingerprint, is_simulation,
        status, received_at
    )
    VALUES (
        p_organization_id, p_analyzer_id, p_sample_barcode,
        p_raw_message, p_protocol, p_message_type,
        p_parsed_results, p_payload_fingerprint, p_is_simulation,
        'received', NOW()
    )
    RETURNING id INTO v_transmission_id;

    -- 3. Create diagnostic result if order context exists
    IF p_order_id IS NOT NULL AND p_order_item_id IS NOT NULL THEN
        INSERT INTO public.diagnostic_results (
            organization_id, order_id, order_item_id,
            performed_by, result_date, status
        )
        VALUES (
            p_organization_id, p_order_id, p_order_item_id,
            p_technician_id, NOW(), 'preliminary'
        )
        RETURNING id INTO v_result_id;

        -- 4. Insert individual result values
        IF v_result_id IS NOT NULL AND p_result_values IS NOT NULL THEN
            FOR v_rec IN SELECT * FROM jsonb_array_elements(p_result_values)
            LOOP
                INSERT INTO public.diagnostic_result_values (
                    organization_id, result_id, parameter_id,
                    observed_value, is_abnormal
                )
                VALUES (
                    p_organization_id, v_result_id,
                    (v_rec.value->>'parameter_id')::UUID,
                    v_rec.value->>'observed_value',
                    COALESCE((v_rec.value->>'is_abnormal')::BOOLEAN, FALSE)
                );
                v_applied_count := v_applied_count + 1;
            END LOOP;
        END IF;

        -- 5. Update order item status
        UPDATE public.diagnostic_order_items
        SET status = 'result_entered', updated_at = NOW()
        WHERE id = p_order_item_id
          AND organization_id = p_organization_id;
    END IF;

    -- 6. Log panic/critical alerts
    IF p_panic_alerts IS NOT NULL THEN
        FOR v_rec IN SELECT * FROM jsonb_array_elements(p_panic_alerts)
        LOOP
            INSERT INTO public.lab_critical_alerts (
                organization_id, transmission_id, analyzer_id,
                analyte_code, observed_value, abnormal_flag,
                acknowledged, created_at
            )
            VALUES (
                p_organization_id, v_transmission_id, p_analyzer_id,
                v_rec.value->>'analyte_code',
                v_rec.value->>'observed_value',
                v_rec.value->>'abnormal_flag',
                FALSE, NOW()
            );
            v_panic_count := v_panic_count + 1;
        END LOOP;
    END IF;

    -- 7. Update transmission status
    UPDATE public.lab_analyzer_transmissions
    SET status = 'processed', processed_at = NOW()
    WHERE id = v_transmission_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'transmission_id', v_transmission_id,
        'result_id', v_result_id,
        'results_applied', v_applied_count,
        'panic_count', v_panic_count
    );
END;
$$;

-- Restrict execution: only authenticated users (role check is inside caller code)
REVOKE ALL ON FUNCTION public.ingest_analyzer_transmission_atomic(
    UUID, UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB, VARCHAR, BOOLEAN, UUID, UUID, UUID, JSONB, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ingest_analyzer_transmission_atomic(
    UUID, UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB, VARCHAR, BOOLEAN, UUID, UUID, UUID, JSONB, JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.ingest_analyzer_transmission_atomic(
    UUID, UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB, VARCHAR, BOOLEAN, UUID, UUID, UUID, JSONB, JSONB
) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. HARDEN: update_hospital_master_profile
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_hospital_master_profile(
    p_name TEXT,
    p_address TEXT,
    p_phone TEXT,
    p_emergency_hotline TEXT,
    p_ambulance_hotline TEXT,
    p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_org_id UUID;
    v_role_names TEXT[];
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- Require authentication
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update hospital master data.'
            USING ERRCODE = '42501';
    END IF;

    -- Verify Super Admin or Hospital Administrator role
    SELECT COALESCE(array_agg(r.name::text), ARRAY[]::text[])
    INTO v_role_names
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = v_caller_id
      AND ur.is_active = TRUE;

    IF 'super_admin' = ANY(v_role_names) 
       OR 'hospital_administrator' = ANY(v_role_names) 
       OR 'admin' = ANY(v_role_names) THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: only Super Admin or Hospital Administrator can modify master hospital profile.'
            USING ERRCODE = '42501';
    END IF;

    -- Determine caller's organization (tenant-aware, not hardcoded)
    SELECT ur.organization_id INTO v_org_id
    FROM public.user_roles ur
    WHERE ur.user_id = v_caller_id
      AND ur.is_active = TRUE
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Cannot determine caller organization. No active role assignment found.'
            USING ERRCODE = '42501';
    END IF;

    -- Update organization master record
    UPDATE public.organizations
    SET 
        name = COALESCE(NULLIF(TRIM(p_name), ''), name),
        phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
        email = COALESCE(NULLIF(TRIM(p_email), ''), email),
        address = COALESCE(NULLIF(TRIM(p_address), ''), address),
        updated_at = NOW()
    WHERE id = v_org_id;

    -- Update settings (emergency/ambulance hotlines)
    INSERT INTO public.organization_settings (
        organization_id,
        emergency_hotline,
        ambulance_hotline,
        updated_at
    )
    VALUES (
        v_org_id,
        COALESCE(NULLIF(TRIM(p_emergency_hotline), ''), ''),
        COALESCE(NULLIF(TRIM(p_ambulance_hotline), ''), ''),
        NOW()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
        emergency_hotline = COALESCE(NULLIF(TRIM(p_emergency_hotline), ''), public.organization_settings.emergency_hotline),
        ambulance_hotline = COALESCE(NULLIF(TRIM(p_ambulance_hotline), ''), public.organization_settings.ambulance_hotline),
        updated_at = NOW();

    -- Audit log entry
    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        details,
        created_at
    )
    VALUES (
        v_org_id,
        v_caller_id,
        'update_hospital_master_profile',
        'organization',
        v_org_id,
        jsonb_build_object(
            'name', p_name,
            'address', p_address,
            'phone', p_phone,
            'emergency_hotline', p_emergency_hotline,
            'ambulance_hotline', p_ambulance_hotline,
            'email', p_email
        ),
        NOW()
    );

    -- Return updated profile
    RETURN jsonb_build_object(
        'success', TRUE,
        'organization_id', v_org_id,
        'updated_at', NOW()
    );
END;
$$;

-- Restrict execution: revoke from PUBLIC and anon, grant only to authenticated
REVOKE ALL ON FUNCTION public.update_hospital_master_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_hospital_master_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_hospital_master_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. DISABLE LEGACY SANDBOX PLACEHOLDER CREDENTIALS (FAIL-CLOSED INTEGRITY)
-- In production, merchant credentials must be explicitly configured via Owner Gate.
-- Sandbox credentials must be disabled so the system fails closed until real keys exist.
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE public.organization_integrations
SET is_enabled = FALSE,
    updated_at = NOW()
WHERE provider_name = 'SSLCOMMERZ'
  AND (
    encrypted_credentials->>'store_id' = 'testbox'
    OR encrypted_credentials->>'store_passwd' = 'qwerty'
  );

