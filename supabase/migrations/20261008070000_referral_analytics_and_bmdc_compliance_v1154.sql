-- ==============================================================================
-- OHMS FORWARD MIGRATION 119: REFERRAL ANALYTICS MATHEMATICAL REPAIR,
-- YEARLY/ALL-HISTORY WINDOW SEMANTICS, SAFE DIRECTORY PERMISSION HARDENING,
-- AND BMDC DOCTOR ETHICS APPROVAL ENFORCEMENT (v1.1.54 CLOSURE)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REPAIR get_referral_performance_analytics RPC
--    Fixes:
--    - Bug 1: Removes multi-table Cartesian join multiplication between attributions,
--             episodes, visits, and commissions. Computes financial metrics directly
--             from referral_commissions fact table.
--    - Bug 2: Applies v_start and v_end filters to the yearly aggregation query.
--    - Bug 3: Sets unbounded start ('1970-01-01') and end ('2099-12-31') when dates
--             are NULL so "All History" returns true complete history.
--    - Bug 4: Uses clean half-open [start, end) time boundary semantics.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_referral_performance_analytics(
    p_org_id UUID,
    p_agent_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user UUID;
    v_active_org UUID;
    v_is_authorized BOOLEAN := FALSE;
    -- Bug 3 Fix: If both dates are NULL, use true unbounded all-time window instead of 1 year default
    v_start TIMESTAMPTZ := COALESCE(p_start_date, '1970-01-01 00:00:00+00'::TIMESTAMPTZ);
    v_end TIMESTAMPTZ := COALESCE(p_end_date, '2099-12-31 23:59:59+00'::TIMESTAMPTZ);
    v_financial_kpis JSONB;
    v_attribution_kpis JSONB;
    v_summary JSONB;
    v_monthly JSONB;
    v_yearly JSONB;
    v_top_agents JSONB;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Verify management / finance authority
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.manage', 'referral.commission.view', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks referral analytics authority' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- A. Financial Facts (Bug 1 Fix: Computed directly from referral_commissions without relational join multiplication)
    -- Excludes CANCELLED/REVERSED records from active earned/payable sums, but tracks them distinctly
    SELECT jsonb_build_object(
        'gross_revenue', COALESCE(SUM(rc.billing_subtotal) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0),
        'total_discount', COALESCE(SUM(rc.discount_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0),
        'net_revenue', COALESCE(SUM(rc.commission_base_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0),
        'commission_earned', COALESCE(SUM(rc.commission_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0),
        'commission_approved', COALESCE(SUM(rc.commission_amount) FILTER (WHERE rc.approval_status = 'APPROVED' AND rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0),
        'commission_paid', COALESCE(SUM(rc.amount_paid), 0),
        'commission_outstanding', COALESCE(SUM(rc.amount_pending) FILTER (WHERE rc.approval_status = 'APPROVED' AND rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0),
        'commission_reversed', COALESCE(SUM(rc.commission_amount) FILTER (WHERE rc.settlement_status IN ('CANCELLED', 'REVERSED')), 0)
    )
    INTO v_financial_kpis
    FROM public.referral_commissions rc
    WHERE rc.organization_id = p_org_id
      AND (p_agent_id IS NULL OR rc.referral_agent_id = p_agent_id)
      AND rc.created_at >= v_start
      AND rc.created_at < v_end;

    -- B. Patient & Encounter Attribution Counts (Computed directly from attributions without multiplying commissions)
    SELECT jsonb_build_object(
        'total_referred_patients', COUNT(DISTINCT pra.patient_id),
        'total_admissions', COUNT(DISTINCT pra.patient_id) FILTER (WHERE pra.visit_id IS NOT NULL),
        'opd_referrals', COUNT(DISTINCT pra.id) FILTER (WHERE pra.status = 'ACTIVE'),
        'ipd_referrals', COUNT(DISTINCT pra.visit_id) FILTER (WHERE pra.visit_id IS NOT NULL),
        'critical_care_referrals', 0
    )
    INTO v_attribution_kpis
    FROM public.patient_referral_attributions pra
    WHERE pra.organization_id = p_org_id
      AND (p_agent_id IS NULL OR pra.referral_agent_id = p_agent_id)
      AND pra.assigned_at >= v_start
      AND pra.assigned_at < v_end;

    -- Combine KPIs into unified summary
    v_summary := COALESCE(v_attribution_kpis, '{}'::JSONB) || COALESCE(v_financial_kpis, '{}'::JSONB);

    -- C. Monthly Performance Aggregation (Filtered with clean half-open bounds)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'year_month', m.ym,
                'year', m.yr,
                'month', m.mo,
                'month_name', TO_CHAR(m.month_date, 'Mon YYYY'),
                'referred_patients', m.pat_count,
                'gross_revenue', m.gross,
                'discount_amount', m.discount,
                'net_revenue', m.net,
                'commission_earned', m.comm_earned,
                'commission_paid', m.comm_paid
            )
            ORDER BY m.ym ASC
        ),
        '[]'::JSONB
    )
    INTO v_monthly
    FROM (
        SELECT 
            TO_CHAR(rc.created_at, 'YYYY-MM') as ym,
            EXTRACT(YEAR FROM rc.created_at)::INT as yr,
            EXTRACT(MONTH FROM rc.created_at)::INT as mo,
            DATE_TRUNC('month', rc.created_at) as month_date,
            COUNT(DISTINCT rc.patient_id) as pat_count,
            COALESCE(SUM(rc.billing_subtotal) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as gross,
            COALESCE(SUM(rc.discount_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as discount,
            COALESCE(SUM(rc.commission_base_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as net,
            COALESCE(SUM(rc.commission_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as comm_earned,
            COALESCE(SUM(rc.amount_paid), 0) as comm_paid
        FROM public.referral_commissions rc
        WHERE rc.organization_id = p_org_id
          AND (p_agent_id IS NULL OR rc.referral_agent_id = p_agent_id)
          AND rc.created_at >= v_start
          AND rc.created_at < v_end
        GROUP BY TO_CHAR(rc.created_at, 'YYYY-MM'), EXTRACT(YEAR FROM rc.created_at), EXTRACT(MONTH FROM rc.created_at), DATE_TRUNC('month', rc.created_at)
    ) m;

    -- D. Yearly Performance Aggregation (Bug 2 Fix: Strictly respects v_start and v_end filters)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'year', y.yr,
                'referred_patients', y.pat_count,
                'gross_revenue', y.gross,
                'discount_amount', y.discount,
                'net_revenue', y.net,
                'commission_earned', y.comm_earned,
                'commission_paid', y.comm_paid
            )
            ORDER BY y.yr DESC
        ),
        '[]'::JSONB
    )
    INTO v_yearly
    FROM (
        SELECT 
            EXTRACT(YEAR FROM rc.created_at)::INT as yr,
            COUNT(DISTINCT rc.patient_id) as pat_count,
            COALESCE(SUM(rc.billing_subtotal) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as gross,
            COALESCE(SUM(rc.discount_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as discount,
            COALESCE(SUM(rc.commission_base_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as net,
            COALESCE(SUM(rc.commission_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as comm_earned,
            COALESCE(SUM(rc.amount_paid), 0) as comm_paid
        FROM public.referral_commissions rc
        WHERE rc.organization_id = p_org_id
          AND (p_agent_id IS NULL OR rc.referral_agent_id = p_agent_id)
          AND rc.created_at >= v_start
          AND rc.created_at < v_end
        GROUP BY EXTRACT(YEAR FROM rc.created_at)
    ) y;

    -- E. Top Performing Agents in Selected Window
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'agent_id', a.id,
                'agent_code', a.agent_code,
                'full_name', a.full_name,
                'agent_type', a.agent_type,
                'patient_count', a.pat_count,
                'net_revenue', a.net,
                'commission_earned', a.comm_earned,
                'commission_paid', a.comm_paid,
                'compliance_approved', a.compliance_approved,
                'bmdc_ethics_acknowledged', a.bmdc_ethics_acknowledged
            )
            ORDER BY a.net DESC
        ),
        '[]'::JSONB
    )
    INTO v_top_agents
    FROM (
        SELECT 
            ra.id,
            ra.agent_code,
            ra.full_name,
            ra.agent_type,
            ra.compliance_approved,
            ra.bmdc_ethics_acknowledged,
            COUNT(DISTINCT rc.patient_id) as pat_count,
            COALESCE(SUM(rc.commission_base_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as net,
            COALESCE(SUM(rc.commission_amount) FILTER (WHERE rc.settlement_status NOT IN ('CANCELLED', 'REVERSED')), 0) as comm_earned,
            COALESCE(SUM(rc.amount_paid), 0) as comm_paid
        FROM public.referral_agents ra
        LEFT JOIN public.referral_commissions rc 
          ON rc.referral_agent_id = ra.id AND rc.organization_id = p_org_id
          AND rc.created_at >= v_start AND rc.created_at < v_end
        WHERE ra.organization_id = p_org_id
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        GROUP BY ra.id, ra.agent_code, ra.full_name, ra.agent_type, ra.compliance_approved, ra.bmdc_ethics_acknowledged
        LIMIT 20
    ) a;

    RETURN jsonb_build_object(
        'success', TRUE,
        'time_window', jsonb_build_object('start', v_start, 'end', v_end),
        'summary', v_summary,
        'monthly', v_monthly,
        'yearly', v_yearly,
        'top_agents', v_top_agents
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_performance_analytics(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_performance_analytics(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. HARDEN get_referral_agents_safe_directory RPC (Caller Authorization)
--    Enforces that caller is authenticated and has at least an operational staff role
--    or referral.view/referral.assign/patient.register permission in the tenant.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_referral_agents_safe_directory(
    p_org_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_code VARCHAR(40),
    full_name VARCHAR(150),
    agent_type VARCHAR(30),
    phone VARCHAR(30),
    email VARCHAR(100),
    is_active BOOLEAN,
    compliance_approved BOOLEAN,
    bmdc_ethics_acknowledged BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user UUID;
    v_active_org UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Verify operational staff authorization (reject unauthorized patients or anonymous)
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'nurse', 'receptionist', 'cashier', 'accountant', 'finance_manager', 'staff')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.view', 'referral.assign', 'patient.register', 'billing.create', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks directory access authorization' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        ra.id,
        ra.agent_code,
        ra.full_name,
        ra.agent_type,
        ra.phone,
        ra.email,
        ra.is_active,
        ra.compliance_approved,
        ra.bmdc_ethics_acknowledged,
        ra.created_at
    FROM public.referral_agents ra
    WHERE ra.organization_id = p_org_id
      AND ra.is_active = TRUE
      AND ra.archived_at IS NULL
      AND (
          p_query IS NULL 
          OR TRIM(p_query) = '' 
          OR ra.agent_code ILIKE '%' || TRIM(p_query) || '%'
          OR ra.full_name ILIKE '%' || TRIM(p_query) || '%'
          OR ra.phone ILIKE '%' || TRIM(p_query) || '%'
      )
    ORDER BY ra.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_agents_safe_directory(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_agents_safe_directory(UUID, TEXT) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3. HARDEN approve_referral_commission_atomic (BMDC Doctor Ethics Gate)
--    Guarantees that a DOCTOR commission can NEVER be approved if
--    bmdc_ethics_acknowledged is FALSE.
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_referral_commission_atomic(
    p_org_id UUID,
    p_commission_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user UUID;
    v_active_org UUID;
    v_has_permission BOOLEAN := FALSE;
    v_comm RECORD;
    v_agent_type VARCHAR(30);
    v_bmdc_ethics BOOLEAN;
    v_compliance_approved BOOLEAN;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Organization context mismatch.');
    END IF;

    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.manage', 'referral.commission.approve', '*')
            )
        ) INTO v_has_permission;

        IF v_has_permission IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks commission approval permission.');
        END IF;
    END IF;

    SELECT * INTO v_comm
    FROM public.referral_commissions
    WHERE id = p_commission_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_comm.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral commission record not found.');
    END IF;

    IF v_comm.approval_status = 'APPROVED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Commission is already approved.');
    END IF;

    IF v_comm.settlement_status IN ('CANCELLED', 'REVERSED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot approve a cancelled or reversed commission.');
    END IF;

    -- Strict BMDC Ethics & Compliance Validation for Doctor Referrals
    SELECT ra.agent_type, ra.bmdc_ethics_acknowledged, ra.compliance_approved
    INTO v_agent_type, v_bmdc_ethics, v_compliance_approved
    FROM public.referral_agents ra
    WHERE ra.id = v_comm.referral_agent_id AND ra.organization_id = p_org_id;

    IF v_agent_type = 'DOCTOR' AND (v_bmdc_ethics IS NOT TRUE OR v_compliance_approved IS NOT TRUE) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot approve doctor referral commission: BMDC Code of Ethics acknowledgment and formal hospital compliance approval are strictly mandatory.'
        );
    END IF;

    UPDATE public.referral_commissions
    SET approval_status = 'APPROVED',
        approved_by = v_calling_user,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_commission_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user, 'APPROVE', 'REFERRAL', 'referral_commission', p_commission_id::text,
        jsonb_build_object(
            'commission_id', p_commission_id,
            'approved_at', NOW(),
            'notes', p_notes,
            'agent_type', v_agent_type,
            'bmdc_ethics_acknowledged', v_bmdc_ethics
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'commission_id', p_commission_id,
        'approval_status', 'APPROVED',
        'approved_by', v_calling_user
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_referral_commission_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_referral_commission_atomic(UUID, UUID, TEXT) TO authenticated, service_role;
