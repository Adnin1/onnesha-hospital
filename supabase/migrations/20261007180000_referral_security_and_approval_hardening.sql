-- =====================================================================================
-- 20261007180000_referral_security_and_approval_hardening.sql
-- Onnesha Hospital Management System (OHMS) - Migration 110
--
-- P0 / P1 Security, Authorization, and Financial Workflow Hardening:
-- 1. In-Database Authorization for all Referral, Billing, and IPD SECURITY DEFINER RPCs:
--    - create_referral_agent_atomic: requires referral.manage or Admin/Finance Manager
--    - update_referral_agent_rate_atomic: requires referral.manage or Admin/Finance Manager
--    - assign_patient_referral_atomic: cross-tenant validation + requires referral.assign
--    - admit_patient_to_bed_atomic: cross-tenant validation (patient, bed/cabin) + requires ipd.admit
--    - post_billing_to_gl_atomic: requires billing.create / accounting.manage
--    - search_active_referral_agents: requires referral lookup / assignment authority
-- 2. Management-Only Referral Visibility via RLS:
--    - Low-privilege users (receptionist, nurse, doctor) denied from full referral_agents table,
--      rate history, commission ledgers, and settlement tables.
--    - Reception/admission staff must use search_active_referral_agents for narrow lookup.
-- 3. Authoritative Commission Approval Workflow:
--    - Added approve_referral_commission_atomic
--    - Added reject_referral_commission_atomic
--    - settle_referral_commissions_atomic strictly enforces approval_status = 'APPROVED'
-- 4. Paid Commission + Invoice Void Integrity (Model A):
--    - void_invoice_and_reverse_gl_atomic strictly prohibits voiding invoices if related
--      referral commission has already been paid/settled (409 Conflict).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- PART 1: Seed Missing Referral Permissions into permissions & role_permissions
-- -------------------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, description)
VALUES
    ('referral.view', 'REFERRAL', 'View referral partner directory (Narrow View)'),
    ('referral.manage', 'REFERRAL', 'Full management of referral agents, rates, and compliance'),
    ('referral.assign', 'REFERRAL', 'Assign referral agent attribution to patient encounters'),
    ('referral.commission.view', 'REFERRAL', 'View referral commission calculations and financial ledgers'),
    ('referral.commission.approve', 'REFERRAL', 'Authorize or reject pending referral commission claims'),
    ('referral.commission.pay', 'REFERRAL', 'Disburse payout settlements to referral partners')
ON CONFLICT (key) DO UPDATE SET
    module = EXCLUDED.module,
    description = EXCLUDED.description;

-- Grant management & approval permissions to Super Admin, Admin, and Finance Manager
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.perm
FROM public.roles r
CROSS JOIN (
    VALUES 
        ('referral.view'),
        ('referral.manage'),
        ('referral.assign'),
        ('referral.commission.view'),
        ('referral.commission.approve'),
        ('referral.commission.pay')
) AS p(perm)
WHERE LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant')
ON CONFLICT DO NOTHING;

-- Grant narrow assign/view permissions to Receptionist, Doctor, Nurse, and Cashier
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.perm
FROM public.roles r
CROSS JOIN (
    VALUES 
        ('referral.view'),
        ('referral.assign')
) AS p(perm)
WHERE LOWER(r.name) IN ('receptionist', 'doctor', 'nurse', 'cashier')
ON CONFLICT DO NOTHING;


-- -------------------------------------------------------------------------------------
-- PART 2: Management-Only Referral Visibility via Row Level Security (RLS)
-- -------------------------------------------------------------------------------------

-- 1. referral_agents: Full table rows visible ONLY to management / finance roles
DROP POLICY IF EXISTS ref_agents_select ON public.referral_agents;
CREATE POLICY ref_agents_select ON public.referral_agents
FOR SELECT TO authenticated
USING (
    organization_id = private.get_current_org_id()
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
              AND rp.permission_key IN ('referral.manage', 'referral.commission.view', '*')
        )
    )
);

-- 2. referral_rate_history: Visible ONLY to management / finance roles
DROP POLICY IF EXISTS ref_rate_hist_select ON public.referral_rate_history;
CREATE POLICY ref_rate_hist_select ON public.referral_rate_history
FOR SELECT TO authenticated
USING (
    organization_id = private.get_current_org_id()
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_rate_history.organization_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_rate_history.organization_id
              AND rp.permission_key IN ('referral.manage', 'referral.commission.view', '*')
        )
    )
);

-- 3. patient_referral_attributions: Visible to management or users with referral.assign / ipd.admit
DROP POLICY IF EXISTS ref_attrib_select ON public.patient_referral_attributions;
CREATE POLICY ref_attrib_select ON public.patient_referral_attributions
FOR SELECT TO authenticated
USING (
    organization_id = private.get_current_org_id()
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = patient_referral_attributions.organization_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = patient_referral_attributions.organization_id
              AND rp.permission_key IN ('referral.manage', 'referral.assign', 'billing.create', 'ipd.admit', '*')
        )
    )
);


-- -------------------------------------------------------------------------------------
-- PART 3: Narrow Referral Agent Lookup RPC for Admission / Reception Staff
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_active_referral_agents(
    p_org_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_code VARCHAR(40),
    full_name VARCHAR(150),
    agent_type VARCHAR(30),
    phone VARCHAR(30)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Verify caller authentication & role/permission
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'doctor', 'nurse', 'cashier')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.view', 'referral.assign', 'referral.manage', 'billing.create', 'ipd.admit', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks referral lookup authority' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        ra.id,
        ra.agent_code,
        ra.full_name,
        ra.agent_type,
        ra.phone
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
    ORDER BY ra.full_name ASC
    LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.search_active_referral_agents(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_active_referral_agents(UUID, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 4: create_referral_agent_atomic with In-Database Authorization
-- -------------------------------------------------------------------------------------
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

    -- Enforce caller authorization
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
                  AND rp.permission_key IN ('referral.manage', '*')
            )
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks referral.manage permission.');
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

REVOKE ALL ON FUNCTION public.create_referral_agent_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_referral_agent_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, BOOLEAN, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 5: update_referral_agent_rate_atomic with In-Database Authorization
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_referral_agent_rate_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_new_rate NUMERIC,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_old_rate NUMERIC(5,2);
    v_has_perm BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Enforce caller authorization
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
                  AND rp.permission_key IN ('referral.manage', '*')
            )
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks referral.manage permission.');
        END IF;
    END IF;

    IF p_new_rate < 1.00 OR p_new_rate > 40.00 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Commission rate must be between 1% and 40%.');
    END IF;

    SELECT commission_rate_percent INTO v_old_rate
    FROM public.referral_agents
    WHERE id = p_agent_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_old_rate IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral agent not found.');
    END IF;

    UPDATE public.referral_agents
    SET commission_rate_percent = p_new_rate,
        commission_rate_diag = p_new_rate,
        commission_rate_opd = p_new_rate,
        commission_rate_ipd = p_new_rate,
        updated_at = NOW()
    WHERE id = p_agent_id;

    INSERT INTO public.referral_rate_history (
        organization_id, referral_agent_id, old_rate, new_rate,
        effective_from, changed_by, reason, created_at
    ) VALUES (
        p_org_id, p_agent_id, v_old_rate, p_new_rate,
        NOW(), v_calling_user, COALESCE(p_reason, 'Rate updated by management'), NOW()
    );

    RETURN jsonb_build_object('success', true, 'old_rate', v_old_rate, 'new_rate', p_new_rate);
END;
$$;

REVOKE ALL ON FUNCTION public.update_referral_agent_rate_atomic(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_referral_agent_rate_atomic(UUID, UUID, NUMERIC, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 6: assign_patient_referral_atomic with Multi-Tenant & RBAC Validation
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_patient_referral_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL,
    p_agent_id UUID DEFAULT NULL,
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
    v_patient_org UUID;
    v_visit_org UUID;
    v_agent RECORD;
    v_attrib_id UUID;
    v_has_perm BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Verify patient belongs to organization
    SELECT organization_id INTO v_patient_org
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_org IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found.');
    END IF;

    IF v_patient_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Patient does not belong to organization %', p_org_id USING ERRCODE = '42501';
    END IF;

    -- Verify visit belongs to organization if provided
    IF p_visit_id IS NOT NULL THEN
        SELECT organization_id INTO v_visit_org
        FROM public.visits
        WHERE id = p_visit_id;

        IF v_visit_org IS NOT NULL AND v_visit_org != p_org_id THEN
            RAISE EXCEPTION 'Access denied: Visit does not belong to organization %', p_org_id USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Verify caller authorization
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'receptionist', 'doctor', 'nurse', 'cashier')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.assign', 'referral.manage', 'billing.create', 'ipd.admit', '*')
            )
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks referral.assign permission.');
        END IF;
    END IF;

    IF p_agent_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral agent ID is required.');
    END IF;

    SELECT id, agent_code, full_name, is_active INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id AND organization_id = p_org_id;

    IF v_agent.id IS NULL OR v_agent.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected referral agent is inactive or invalid.');
    END IF;

    -- Deactivate any existing active attribution for this specific visit
    IF p_visit_id IS NOT NULL THEN
        UPDATE public.patient_referral_attributions
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE organization_id = p_org_id AND visit_id = p_visit_id AND status = 'ACTIVE';
    END IF;

    INSERT INTO public.patient_referral_attributions (
        organization_id, patient_id, visit_id, referral_agent_id,
        referral_code_snapshot, referral_name_snapshot, assigned_by,
        status, notes, created_at, updated_at
    ) VALUES (
        p_org_id, p_patient_id, p_visit_id, p_agent_id,
        v_agent.agent_code, v_agent.full_name, v_calling_user,
        'ACTIVE', p_notes, NOW(), NOW()
    ) RETURNING id INTO v_attrib_id;

    RETURN jsonb_build_object(
        'success', true,
        'attribution_id', v_attrib_id,
        'referral_code', v_agent.agent_code,
        'referral_name', v_agent.full_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 7: admit_patient_to_bed_atomic with Strict Authentication & Multi-Tenant Verification
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admit_patient_to_bed_atomic(
    p_organization_id UUID,
    p_patient_id UUID,
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name TEXT DEFAULT NULL,
    p_chief_complaint TEXT DEFAULT NULL,
    p_admission_type VARCHAR DEFAULT 'IPD',
    p_daily_charge NUMERIC DEFAULT 0,
    p_assigned_by UUID DEFAULT NULL,
    p_referral_agent_id UUID DEFAULT NULL
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
    v_bed_number TEXT;
    v_bed_status TEXT;
    v_patient_name TEXT;
    v_patient_org UUID;
    v_bed_org UUID;
    v_cabin_org UUID;
    v_visit_id UUID;
    v_assignment_id UUID;
    v_charge NUMERIC := p_daily_charge;
    v_active_check UUID;
    v_ref_agent RECORD;
    v_attrib_id UUID;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    -- 1. Authentication & Organization Validation
    IF v_active_org IS NULL OR v_active_org != p_organization_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- 2. Authorization check: caller must have ipd.admit or clinical management role
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_organization_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'nurse')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_organization_id
                  AND rp.permission_key IN ('ipd.admit', 'beds.allocate', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks IPD admission permission (ipd.admit)' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 3. Validation: At least one of bed_id or cabin_id must be provided
    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Either bed_id or cabin_id must be provided';
    END IF;

    -- 4. Multi-Tenant Patient Verification
    SELECT full_name, organization_id INTO v_patient_name, v_patient_org
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_name IS NULL THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: Patient % does not exist', p_patient_id;
    END IF;

    IF v_patient_org != p_organization_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Patient belongs to organization % but admission requested for %', v_patient_org, p_organization_id USING ERRCODE = '42501';
    END IF;

    -- 5. Row-level Lock and Concurrency Validation for Bed
    IF p_bed_id IS NOT NULL THEN
        SELECT status, bed_number, daily_rate, organization_id
        INTO v_bed_status, v_bed_number, v_charge, v_bed_org
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'BED_NOT_FOUND: Bed % does not exist', p_bed_id;
        END IF;

        IF v_bed_org != p_organization_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Bed belongs to organization % but admission requested for %', v_bed_org, p_organization_id USING ERRCODE = '42501';
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'BED_UNAVAILABLE: Bed % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE bed_id = p_bed_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Bed % already has an active assignment %', v_bed_number, v_active_check;
        END IF;
    END IF;

    -- 6. Row-level Lock and Concurrency Validation for Cabin
    IF p_cabin_id IS NOT NULL THEN
        SELECT status, cabin_number, daily_rate, organization_id
        INTO v_bed_status, v_bed_number, v_charge, v_cabin_org
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'CABIN_NOT_FOUND: Cabin % does not exist', p_cabin_id;
        END IF;

        IF v_cabin_org != p_organization_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Cabin belongs to organization % but admission requested for %', v_cabin_org, p_organization_id USING ERRCODE = '42501';
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'CABIN_UNAVAILABLE: Cabin % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE cabin_id = p_cabin_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Cabin % already has an active assignment %', v_bed_number, v_active_check;
        END IF;
    END IF;

    -- 7. Create Inpatient Visit
    INSERT INTO public.visits (
        organization_id,
        patient_id,
        doctor_id,
        visit_type,
        visit_date,
        chief_complaint,
        status,
        created_at
    ) VALUES (
        p_organization_id,
        p_patient_id,
        p_doctor_id,
        p_admission_type,
        NOW(),
        COALESCE(p_chief_complaint, 'Inpatient Admission to ' || COALESCE(v_bed_number, 'Bed')),
        'ADMITTED',
        NOW()
    ) RETURNING id INTO v_visit_id;

    -- 8. Create Bed Assignment
    INSERT INTO public.bed_assignments (
        organization_id,
        patient_id,
        visit_id,
        bed_id,
        cabin_id,
        admission_date,
        daily_charge,
        status,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_organization_id,
        p_patient_id,
        v_visit_id,
        p_bed_id,
        p_cabin_id,
        NOW(),
        COALESCE(v_charge, 0),
        'ACTIVE',
        p_chief_complaint,
        COALESCE(v_calling_user, p_assigned_by),
        NOW()
    ) RETURNING id INTO v_assignment_id;

    -- 9. Mark Bed/Cabin Occupied
    IF p_bed_id IS NOT NULL THEN
        UPDATE public.beds
        SET status = 'OCCUPIED', updated_at = NOW()
        WHERE id = p_bed_id;
    END IF;

    IF p_cabin_id IS NOT NULL THEN
        UPDATE public.cabins
        SET status = 'OCCUPIED', updated_at = NOW()
        WHERE id = p_cabin_id;
    END IF;

    -- 10. Optional Referral Agent Attribution
    IF p_referral_agent_id IS NOT NULL THEN
        SELECT id, agent_code, full_name, is_active INTO v_ref_agent
        FROM public.referral_agents
        WHERE id = p_referral_agent_id AND organization_id = p_organization_id;

        IF v_ref_agent.id IS NOT NULL AND v_ref_agent.is_active IS TRUE THEN
            INSERT INTO public.patient_referral_attributions (
                organization_id, patient_id, visit_id, referral_agent_id,
                referral_code_snapshot, referral_name_snapshot, assigned_by,
                status, notes, created_at, updated_at
            ) VALUES (
                p_organization_id, p_patient_id, v_visit_id, p_referral_agent_id,
                v_ref_agent.agent_code, v_ref_agent.full_name, COALESCE(v_calling_user, p_assigned_by),
                'ACTIVE', 'Attributed during IPD admission', NOW(), NOW()
            ) RETURNING id INTO v_attrib_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'visit_id', v_visit_id,
        'assignment_id', v_assignment_id,
        'bed_number', v_bed_number,
        'patient_name', v_patient_name,
        'referral_attribution_id', v_attrib_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 8: post_billing_to_gl_atomic with In-Database Authorization
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_billing_to_gl_atomic(
    p_org_id UUID,
    p_invoice_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inv RECORD;
    v_active_org UUID;
    v_calling_user UUID;
    v_is_authorized BOOLEAN := FALSE;
    v_entry_number VARCHAR(40);
    v_cash_acc_id UUID;
    v_ar_acc_id UUID;
    v_rev_acc_id UUID;
    v_disc_acc_id UUID;
    v_comm_exp_acc_id UUID;
    v_comm_pay_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_res JSONB;

    v_comm RECORD;
    v_comm_entry_number VARCHAR(40);
    v_comm_lines JSONB := '[]'::JSONB;
    v_comm_res JSONB;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Verify caller authorization
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.create', 'billing.manage', 'accounting.manage', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks billing/accounting authority.');
        END IF;
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invoice % not found in organization %', p_invoice_id, p_org_id;
    END IF;

    -- Ensure default COA exists
    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010';
    SELECT id INTO v_ar_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1100';
    SELECT id INTO v_rev_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '4010';
    SELECT id INTO v_disc_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '4090';

    -- Invoice Primary GL Journal Entry
    IF v_inv.paid_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_cash_acc_id,
            'debit', v_inv.paid_amount,
            'credit', 0.00,
            'description', 'Payment collected on invoice ' || v_inv.invoice_number
        );
    END IF;

    IF v_inv.due_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_ar_acc_id,
            'debit', v_inv.due_amount,
            'credit', 0.00,
            'description', 'Accounts receivable on invoice ' || v_inv.invoice_number
        );
    END IF;

    IF v_inv.discount_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_disc_acc_id,
            'debit', v_inv.discount_amount,
            'credit', 0.00,
            'description', 'Discount applied to invoice ' || v_inv.invoice_number
        );
    END IF;

    IF v_inv.subtotal > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_rev_acc_id,
            'debit', 0.00,
            'credit', v_inv.subtotal,
            'description', 'Patient service gross revenue on invoice ' || v_inv.invoice_number
        );
    END IF;

    v_entry_number := 'JE-INV-' || v_inv.invoice_number;

    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_entry_number,
        CURRENT_DATE,
        'INVOICE',
        p_invoice_id,
        'Revenue recognition for invoice ' || v_inv.invoice_number,
        v_lines,
        v_calling_user
    );

    -- Secondary Double-Entry Posting: Referral Commission Accrual
    SELECT * INTO v_comm FROM public.referral_commissions
    WHERE invoice_id = p_invoice_id AND organization_id = p_org_id AND settlement_status = 'PENDING'
    LIMIT 1;

    IF v_comm.id IS NOT NULL AND v_comm.commission_amount > 0 THEN
        SELECT id INTO v_comm_exp_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5020';
        SELECT id INTO v_comm_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2030';

        v_comm_lines := v_comm_lines || jsonb_build_object(
            'account_id', v_comm_exp_acc_id,
            'debit', v_comm.commission_amount,
            'credit', 0.00,
            'description', 'Referral commission expense for ' || v_comm.referral_code_snapshot
        );

        v_comm_lines := v_comm_lines || jsonb_build_object(
            'account_id', v_comm_pay_acc_id,
            'debit', 0.00,
            'credit', v_comm.commission_amount,
            'description', 'Referral commission payable accrued for ' || v_comm.referral_code_snapshot
        );

        v_comm_entry_number := 'JE-REF-ACC-' || v_inv.invoice_number;

        v_comm_res := public.post_journal_entry_atomic(
            p_org_id,
            v_comm_entry_number,
            CURRENT_DATE,
            'REFERRAL_COMMISSION',
            v_comm.id,
            'Referral commission accrual on invoice ' || v_inv.invoice_number || ' for ' || v_comm.referral_name_snapshot,
            v_comm_lines,
            v_calling_user
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'journal_result', v_res, 'commission_journal_result', v_comm_res);
END;
$$;

REVOKE ALL ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 9: Authoritative Commission Approval & Rejection RPCs
-- -------------------------------------------------------------------------------------

-- 1. approve_referral_commission_atomic
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
    v_is_authorized BOOLEAN := FALSE;
    v_comm RECORD;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Caller must have referral.commission.approve, referral.manage, or finance/admin role
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
                  AND rp.permission_key IN ('referral.commission.approve', 'referral.manage', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
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
            'notes', p_notes
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


-- 2. reject_referral_commission_atomic
CREATE OR REPLACE FUNCTION public.reject_referral_commission_atomic(
    p_org_id UUID,
    p_commission_id UUID,
    p_reason TEXT DEFAULT NULL
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
    v_comm RECORD;
    v_je RECORD;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Caller must have referral.commission.approve, referral.manage, or finance/admin role
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
                  AND rp.permission_key IN ('referral.commission.approve', 'referral.manage', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
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

    IF v_comm.settlement_status = 'PAID' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot reject a commission that has already been paid/settled.');
    END IF;

    UPDATE public.referral_commissions
    SET approval_status = 'REJECTED',
        settlement_status = 'CANCELLED',
        reversal_reason = COALESCE(p_reason, 'Rejected by management'),
        reversed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_commission_id;

    -- Decrement agent total earned counter
    UPDATE public.referral_agents
    SET total_commission_earned = GREATEST(0, total_commission_earned - v_comm.commission_amount),
        updated_at = NOW()
    WHERE id = v_comm.referral_agent_id;

    -- Reverse accrual journal entry if posted
    SELECT * INTO v_je FROM public.journal_entries
    WHERE reference_type = 'REFERRAL_COMMISSION' AND reference_id = p_commission_id AND organization_id = p_org_id AND status = 'POSTED'
    LIMIT 1;

    IF v_je.id IS NOT NULL THEN
        PERFORM public.reverse_journal_entry_atomic(p_org_id, v_je.id, 'Commission rejected: ' || COALESCE(p_reason, 'No reason specified'));
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user, 'REJECT', 'REFERRAL', 'referral_commission', p_commission_id::text,
        jsonb_build_object(
            'commission_id', p_commission_id,
            'reason', p_reason,
            'rejected_at', NOW()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'commission_id', p_commission_id,
        'approval_status', 'REJECTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_referral_commission_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_referral_commission_atomic(UUID, UUID, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 10: settle_referral_commissions_atomic with Approval Enforcement & RBAC
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_referral_commissions_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_commission_ids UUID[],
    p_payment_method VARCHAR,
    p_transaction_reference TEXT DEFAULT NULL,
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
    v_is_authorized BOOLEAN := FALSE;
    v_agent RECORD;
    v_comm RECORD;
    v_settlement_id UUID;
    v_settlement_number VARCHAR(40);
    v_total_paid NUMERIC(14,2) := 0.00;
    v_item_count INT := 0;

    v_pay_acc_id UUID;
    v_cash_acc_id UUID;
    v_gl_lines JSONB := '[]'::JSONB;
    v_gl_res JSONB;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Enforce caller authorization: referral.commission.pay, referral.manage, or finance/admin role
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
                  AND rp.permission_key IN ('referral.commission.pay', 'referral.manage', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks referral.commission.pay permission.');
        END IF;
    END IF;

    -- Validate payment method
    IF UPPER(p_payment_method) NOT IN ('CASH', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid payout payment method.');
    END IF;

    -- Validate agent exists and is eligible
    SELECT * INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_agent.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral agent not found.');
    END IF;

    IF v_agent.agent_type = 'DOCTOR' AND v_agent.compliance_approved IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor referral payout requires management compliance approval before disbursement.');
    END IF;

    IF p_commission_ids IS NULL OR array_length(p_commission_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'At least one commission record must be selected for payout.');
    END IF;

    v_settlement_number := public.generate_referral_settlement_number(p_org_id);

    -- Compute total payable and lock rows
    FOR v_comm IN
        SELECT id, amount_pending, settlement_status, approval_status
        FROM public.referral_commissions
        WHERE id = ANY(p_commission_ids)
          AND organization_id = p_org_id
          AND referral_agent_id = p_agent_id
        FOR UPDATE
    LOOP
        -- Strict Approval Enforcement: Must be APPROVED prior to settlement
        IF v_comm.approval_status != 'APPROVED' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Commission ' || v_comm.id || ' has not been approved (Status: ' || v_comm.approval_status || '). Approval is strictly required before payout settlement.'
            );
        END IF;

        IF v_comm.settlement_status IN ('PAID', 'CANCELLED', 'REVERSED') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cannot settle already paid, cancelled, or reversed commissions.');
        END IF;

        IF v_comm.amount_pending <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Selected commission has no pending balance.');
        END IF;

        v_total_paid := v_total_paid + v_comm.amount_pending;
        v_item_count := v_item_count + 1;
    END LOOP;

    IF v_item_count = 0 OR v_total_paid <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No eligible pending commissions found.');
    END IF;

    -- Insert Settlement Header
    INSERT INTO public.referral_commission_settlements (
        organization_id, settlement_number, referral_agent_id, settlement_date,
        gross_commission_selected, adjustment_amount, net_paid_amount,
        payment_method, transaction_reference, paid_by, approved_by,
        status, notes, created_at
    ) VALUES (
        p_org_id, v_settlement_number, p_agent_id, CURRENT_DATE,
        v_total_paid, 0.00, v_total_paid,
        UPPER(p_payment_method), p_transaction_reference, v_calling_user, v_calling_user,
        'PAID', p_notes, NOW()
    ) RETURNING id INTO v_settlement_id;

    -- Insert Settlement Items & Update Commission Ledger Rows
    FOR v_comm IN
        SELECT id, amount_pending
        FROM public.referral_commissions
        WHERE id = ANY(p_commission_ids)
          AND organization_id = p_org_id
          AND referral_agent_id = p_agent_id
    LOOP
        INSERT INTO public.referral_commission_settlement_items (
            organization_id, settlement_id, commission_id, allocated_amount, created_at
        ) VALUES (
            p_org_id, v_settlement_id, v_comm.id, v_comm.amount_pending, NOW()
        );

        UPDATE public.referral_commissions
        SET amount_paid = amount_paid + v_comm.amount_pending,
            amount_pending = 0.00,
            settlement_status = 'PAID',
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = v_comm.id;
    END LOOP;

    -- Update Agent Total Settled Counter
    UPDATE public.referral_agents
    SET total_commission_settled = total_commission_settled + v_total_paid,
        updated_at = NOW()
    WHERE id = p_agent_id;

    -- Post General Ledger Settlement Journal Entry:
    -- Debit: 2030 (Referral Commissions Payable)
    -- Credit: 1010 (Cash in Hand) OR 1020 (Cash at Bank)
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2030';

    IF UPPER(p_payment_method) = 'CASH' THEN
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010';
    ELSE
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020';
    END IF;

    v_gl_lines := v_gl_lines || jsonb_build_object(
        'account_id', v_pay_acc_id,
        'debit', v_total_paid,
        'credit', 0.00,
        'description', 'Settlement of referral commission payable to ' || v_agent.agent_code
    );

    v_gl_lines := v_gl_lines || jsonb_build_object(
        'account_id', v_cash_acc_id,
        'debit', 0.00,
        'credit', v_total_paid,
        'description', 'Disbursement of referral payout via ' || UPPER(p_payment_method)
    );

    v_gl_res := public.post_journal_entry_atomic(
        p_org_id,
        'JE-REF-SET-' || v_settlement_number,
        CURRENT_DATE,
        'REFERRAL_SETTLEMENT',
        v_settlement_id,
        'Disbursement of referral commissions to ' || v_agent.agent_code || ' (' || v_agent.full_name || ')',
        v_gl_lines,
        v_calling_user
    );

    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'settlement_number', v_settlement_number,
        'net_paid_amount', v_total_paid,
        'item_count', v_item_count,
        'gl_result', v_gl_res
    );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_referral_commissions_atomic(UUID, UUID, UUID[], VARCHAR, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_referral_commissions_atomic(UUID, UUID, UUID[], VARCHAR, TEXT, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 11: void_invoice_and_reverse_gl_atomic (Model A: Prohibit Void if Paid)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_invoice_and_reverse_gl_atomic(
    p_org_id UUID,
    p_invoice_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_inv RECORD;
    v_je RECORD;
    v_calling_user_id UUID;
    v_has_perm BOOLEAN := FALSE;
    v_rev_result JSONB := NULL;
    v_comm RECORD;
BEGIN
    v_calling_user_id := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Validate void permission
    IF v_calling_user_id IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.void', '*')
            )
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks invoice void permission.');
        END IF;
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_inv.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
    END IF;

    IF v_inv.is_voided IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice is already voided.');
    END IF;

    -- Financial Invariant (Model A): Check related referral commission
    -- If related referral commission has already been settled/paid, void is strictly prohibited!
    SELECT * INTO v_comm FROM public.referral_commissions
    WHERE invoice_id = p_invoice_id AND organization_id = p_org_id;

    IF v_comm.id IS NOT NULL AND v_comm.settlement_status = 'PAID' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '409 Conflict: Cannot void invoice. Related referral commission has already been paid/settled. Payout must be recovered/reversed prior to invoice void.'
        );
    END IF;

    -- Mark invoice voided
    UPDATE public.invoices
    SET is_voided = TRUE,
        status = 'VOID',
        voided_by = v_calling_user_id,
        void_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_invoice_id;

    -- Reverse General Ledger Billing Journal Entry
    SELECT * INTO v_je FROM public.journal_entries
    WHERE reference_type = 'INVOICE' AND reference_id = p_invoice_id AND organization_id = p_org_id AND status = 'POSTED'
    LIMIT 1;

    IF v_je.id IS NOT NULL THEN
        v_rev_result := public.reverse_journal_entry_atomic(p_org_id, v_je.id, 'Invoice voided: ' || COALESCE(p_reason, 'No reason specified'));
    END IF;

    -- Reverse Referral Commission if exists and not paid
    IF v_comm.id IS NOT NULL AND v_comm.settlement_status != 'PAID' THEN
        UPDATE public.referral_commissions
        SET settlement_status = 'CANCELLED',
            approval_status = 'REJECTED',
            reversal_reason = 'Invoice voided: ' || COALESCE(p_reason, 'No reason specified'),
            reversed_at = NOW(),
            updated_at = NOW()
        WHERE id = v_comm.id;

        -- Decrement agent total earned counter
        UPDATE public.referral_agents
        SET total_commission_earned = GREATEST(0, total_commission_earned - v_comm.commission_amount),
            updated_at = NOW()
        WHERE id = v_comm.referral_agent_id;

        -- Reverse Commission GL Journal Entry
        SELECT * INTO v_je FROM public.journal_entries
        WHERE reference_type = 'REFERRAL_COMMISSION' AND reference_id = v_comm.id AND organization_id = p_org_id AND status = 'POSTED'
        LIMIT 1;

        IF v_je.id IS NOT NULL THEN
            PERFORM public.reverse_journal_entry_atomic(p_org_id, v_je.id, 'Commission reversed on invoice void: ' || COALESCE(p_reason, ''));
        END IF;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'VOID', 'BILLING', 'invoice', p_invoice_id::text,
        jsonb_build_object(
            'reason', p_reason,
            'voided_at', NOW(),
            'commission_reversed', (v_comm.id IS NOT NULL AND v_comm.settlement_status != 'PAID')
        )
    );

    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'is_voided', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) TO authenticated, service_role;
