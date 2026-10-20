-- =====================================================================================
-- Migration 215: Allow Authorized Billing Staff to Create Referral Agents in RPC
-- Timestamp: 20261020160000
-- =====================================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_referral_agent_atomic(
    p_org_id UUID,
    p_full_name VARCHAR,
    p_agent_type VARCHAR,
    p_phone VARCHAR,
    p_commission_rate NUMERIC DEFAULT 10.00,
    p_email VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_license_no VARCHAR DEFAULT NULL,
    p_is_eligible BOOLEAN DEFAULT TRUE,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_agent_code VARCHAR(40);
    v_agent_id UUID;
    v_rate NUMERIC(5,2);
    v_compliance BOOLEAN;
    v_has_perm BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Enforce caller authorization: supports super_admin, admin, hospital_administrator, finance_manager, receptionist, cashier, accountant, or relevant permissions
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'receptionist', 'cashier', 'accountant')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.manage', 'referral.create', 'referral.assign', 'billing.create', '*')
            )
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks referral creation permission.');
        END IF;
    END IF;

    -- Strict 1% - 40% Validation
    v_rate := COALESCE(p_commission_rate, 10.00);
    IF v_rate < 1.00 OR v_rate > 40.00 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Commission rate must be between 1% and 40%.');
    END IF;

    -- Compliance default: DOCTOR agents require hospital management compliance confirmation
    IF UPPER(p_agent_type) = 'DOCTOR' THEN
        v_compliance := COALESCE(p_is_eligible, FALSE);
    ELSE
        v_compliance := TRUE;
    END IF;

    -- Generate sequential authoritative code
    v_agent_code := public.generate_referral_code(p_org_id);

    INSERT INTO public.referral_agents (
        organization_id, agent_code, full_name, agent_type, phone,
        commission_rate_percent, commission_rate_diag, commission_rate_opd, commission_rate_ipd,
        is_commission_eligible, compliance_approved, email, address,
        professional_registration_no, notes, is_active, created_at, updated_at
    ) VALUES (
        p_org_id, v_agent_code, TRIM(p_full_name), UPPER(p_agent_type), TRIM(p_phone),
        v_rate, v_rate, v_rate, v_rate,
        COALESCE(p_is_eligible, TRUE), v_compliance, p_email, p_address,
        p_license_no, p_notes, TRUE, NOW(), NOW()
    ) RETURNING id INTO v_agent_id;

    -- Record initial rate history
    INSERT INTO public.referral_rate_history (
        organization_id, referral_agent_id, old_rate, new_rate,
        effective_from, changed_by, reason, created_at
    ) VALUES (
        p_org_id, v_agent_id, 0.00, v_rate,
        NOW(), v_calling_user, 'Initial profile creation', NOW()
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user, 'CREATE', 'REFERRAL', 'referral_agent', v_agent_id::text,
        jsonb_build_object(
            'agent_code', v_agent_code,
            'full_name', p_full_name,
            'agent_type', p_agent_type,
            'commission_rate', v_rate
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'agent_id', v_agent_id,
        'agent_code', v_agent_code
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_referral_agent_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, BOOLEAN, TEXT) TO authenticated, service_role;

COMMIT;
