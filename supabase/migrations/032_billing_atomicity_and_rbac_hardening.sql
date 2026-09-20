-- =====================================================================================
-- 032_billing_atomicity_and_rbac_hardening.sql
-- Onnesha Hospital Management System (OHMS) - Phase 32 Migration
--
-- 1. Schema reconciliations on billing tables (invoices, invoice_items, payments).
-- 2. Fine-Grained RBAC on staff mutations for organizations, departments,
--    doctors, and doctor_schedules.
-- 3. Scoping public read access strictly to canonical public organization
--    ('a0000000-0000-0000-0000-000000000001').
-- 4. Hardening organization_integrations table against credential leakage.
-- 5. Atomic Billing RPCs (create_invoice_atomic and collect_payment_atomic)
--    with transactional rollback and strict balance consistency.
-- =====================================================================================

-- =====================================================================================
-- PART 1: Schema Reconciliations
-- =====================================================================================

ALTER TABLE IF EXISTS public.invoices 
    ADD COLUMN IF NOT EXISTS visit_id UUID,
    ADD COLUMN IF NOT EXISTS discount_reason TEXT,
    ADD COLUMN IF NOT EXISTS discount_approved_by UUID,
    ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS due_amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'UNPAID',
    ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS voided_by UUID,
    ADD COLUMN IF NOT EXISTS void_reason TEXT,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.invoice_items
    ADD COLUMN IF NOT EXISTS service_category VARCHAR(30) DEFAULT 'MISC',
    ADD COLUMN IF NOT EXISTS reference_id UUID,
    ADD COLUMN IF NOT EXISTS item_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(8, 2) DEFAULT 1.00,
    ADD COLUMN IF NOT EXISTS total_price NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.payments
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(30),
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'CASH',
    ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cashier_id UUID,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================================
-- PART 2: RBAC Helper Function
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.is_org_admin_or_has_permission(p_org_id UUID, p_perm_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid() 
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = auth.uid() 
      AND ur.organization_id = p_org_id
      AND (rp.permission_key = p_perm_key OR rp.permission_key = '*')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_admin_or_has_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin_or_has_permission(UUID, TEXT) TO authenticated, service_role;

-- =====================================================================================
-- PART 3: Strict Public Canonical Scoping & Fine-Grained RBAC Mutations
-- =====================================================================================

-- 1. organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_organizations_staff_update ON public.organizations;

CREATE POLICY rls_organizations_staff_update ON public.organizations
    FOR UPDATE TO authenticated
    USING (id = get_current_org_id() AND public.is_org_admin_or_has_permission(id, 'settings.manage'))
    WITH CHECK (id = get_current_org_id() AND public.is_org_admin_or_has_permission(id, 'settings.manage'));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.organizations FROM anon, PUBLIC;

-- 2. departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_departments_public_select ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff_select ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff_insert ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff_update ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff_delete ON public.departments;

-- Public can ONLY read active, public departments in the canonical public organization
CREATE POLICY rls_departments_public_select ON public.departments
    FOR SELECT TO anon
    USING (
        organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
        AND is_active = TRUE 
        AND (is_public = TRUE OR is_public IS NULL)
    );

-- Authenticated staff can SELECT departments belonging to their org or canonical public departments
CREATE POLICY rls_departments_staff_select ON public.departments
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_org_id() 
        OR (organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid AND is_active = TRUE AND (is_public = TRUE OR is_public IS NULL))
    );

-- Staff mutations require admin or 'departments.manage' permission
CREATE POLICY rls_departments_staff_insert ON public.departments
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'departments.manage')
    );

CREATE POLICY rls_departments_staff_update ON public.departments
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'departments.manage')
    )
    WITH CHECK (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'departments.manage')
    );

CREATE POLICY rls_departments_staff_delete ON public.departments
    FOR DELETE TO authenticated
    USING (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'departments.manage')
    );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.departments FROM anon, PUBLIC;

-- 3. doctors
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_doctors_public_select ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff_select ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff_insert ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff_update ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff_delete ON public.doctors;

-- Public can ONLY read active, public doctors in the canonical public organization
CREATE POLICY rls_doctors_public_select ON public.doctors
    FOR SELECT TO anon
    USING (
        organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid 
        AND is_active = TRUE 
        AND (is_public = TRUE OR is_public IS NULL)
    );

CREATE POLICY rls_doctors_staff_select ON public.doctors
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_org_id() 
        OR (organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid AND is_active = TRUE AND (is_public = TRUE OR is_public IS NULL))
    );

-- Staff mutations require admin or 'doctors.manage' permission
CREATE POLICY rls_doctors_staff_insert ON public.doctors
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
    );

CREATE POLICY rls_doctors_staff_update ON public.doctors
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
    )
    WITH CHECK (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
    );

CREATE POLICY rls_doctors_staff_delete ON public.doctors
    FOR DELETE TO authenticated
    USING (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
    );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.doctors FROM anon, PUBLIC;

-- 4. doctor_schedules
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_doctor_schedules_public_select ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff_select ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff_insert ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff_update ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff_delete ON public.doctor_schedules;

-- Public can ONLY read active schedules for active, public doctors in canonical public org
CREATE POLICY rls_doctor_schedules_public_select ON public.doctor_schedules
    FOR SELECT TO anon
    USING (
        is_active = TRUE AND EXISTS (
            SELECT 1 FROM public.doctors d 
            WHERE d.id = doctor_schedules.doctor_id 
              AND d.organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid
              AND d.is_active = TRUE 
              AND (d.is_public = TRUE OR d.is_public IS NULL)
        )
    );

CREATE POLICY rls_doctor_schedules_staff_select ON public.doctor_schedules
    FOR SELECT TO authenticated
    USING (
        organization_id = get_current_org_id() OR (
            is_active = TRUE AND EXISTS (
                SELECT 1 FROM public.doctors d 
                WHERE d.id = doctor_schedules.doctor_id 
                  AND d.organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid
                  AND d.is_active = TRUE 
                  AND (d.is_public = TRUE OR d.is_public IS NULL)
            )
        )
    );

-- Staff mutations require admin or 'schedules.manage' or 'doctors.manage' permission
CREATE POLICY rls_doctor_schedules_staff_insert ON public.doctor_schedules
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = get_current_org_id() 
        AND (
            public.is_org_admin_or_has_permission(organization_id, 'schedules.manage')
            OR public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
        )
    );

CREATE POLICY rls_doctor_schedules_staff_update ON public.doctor_schedules
    FOR UPDATE TO authenticated
    USING (
        organization_id = get_current_org_id() 
        AND (
            public.is_org_admin_or_has_permission(organization_id, 'schedules.manage')
            OR public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
        )
    )
    WITH CHECK (
        organization_id = get_current_org_id() 
        AND (
            public.is_org_admin_or_has_permission(organization_id, 'schedules.manage')
            OR public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
        )
    );

CREATE POLICY rls_doctor_schedules_staff_delete ON public.doctor_schedules
    FOR DELETE TO authenticated
    USING (
        organization_id = get_current_org_id() 
        AND (
            public.is_org_admin_or_has_permission(organization_id, 'schedules.manage')
            OR public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
        )
    );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.doctor_schedules FROM anon, PUBLIC;

-- 5. organization_integrations (Shield gateway and webhook credentials)
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_organization_integrations ON public.organization_integrations;
DROP POLICY IF EXISTS rls_organization_integrations_staff ON public.organization_integrations;

CREATE POLICY rls_organization_integrations_staff ON public.organization_integrations
    FOR ALL TO authenticated
    USING (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'settings.manage')
    )
    WITH CHECK (
        organization_id = get_current_org_id() 
        AND public.is_org_admin_or_has_permission(organization_id, 'settings.manage')
    );

REVOKE ALL ON TABLE public.organization_integrations FROM anon, PUBLIC;

-- =====================================================================================
-- PART 4: Atomic Billing RPCs
-- =====================================================================================

DROP FUNCTION IF EXISTS public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_gateway_transaction_id VARCHAR DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_perm BOOLEAN;
    v_item JSONB;
    v_item_cat VARCHAR;
    v_item_name VARCHAR;
    v_unit_price NUMERIC;
    v_quantity NUMERIC;
    v_item_total NUMERIC;
    v_item_ref UUID;
    v_subtotal NUMERIC := 0.00;
    v_discount NUMERIC;
    v_grand_total NUMERIC;
    v_paid NUMERIC;
    v_due NUMERIC;
    v_status VARCHAR;
    v_invoice_id UUID;
    v_invoice_number VARCHAR;
    v_receipt_number VARCHAR;
    v_payment_id UUID;
    v_cashier_uuid UUID;
BEGIN
    v_calling_user_id := auth.uid();

    -- Check 1: Authentication required unless internal service_role
    IF v_calling_user_id IS NULL AND current_user != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Authentication required.');
    END IF;

    -- Check 2: Check active profile and billing permissions
    IF v_calling_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND is_active = TRUE) THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: User profile inactive or non-existent.');
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'cashier', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.create', 'billing.manage', '*')
            ) INTO v_has_perm;

            IF v_has_perm IS NOT TRUE THEN
                RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks invoice creation authorization.');
            END IF;
        END IF;
    END IF;

    -- Check 3: Validate patient belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id AND organization_id = p_org_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in organization.');
    END IF;

    -- Check 4: Validate items JSON array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice must contain at least one line item.');
    END IF;

    -- Compute subtotal from items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0);
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 1.0);
        v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    END LOOP;

    v_discount := GREATEST(0, COALESCE(p_discount_amount, 0));
    v_grand_total := GREATEST(0, v_subtotal - v_discount);
    v_paid := LEAST(v_grand_total, GREATEST(0, COALESCE(p_initial_payment_amount, 0)));
    v_due := GREATEST(0, v_grand_total - v_paid);

    IF v_due = 0 AND v_grand_total > 0 THEN
        v_status := 'PAID';
    ELSIF v_paid > 0 THEN
        v_status := 'PARTIAL';
    ELSE
        v_status := 'UNPAID';
    END IF;

    v_invoice_number := public.generate_invoice_number(p_org_id);

    -- Insert invoice master
    INSERT INTO public.invoices (
        organization_id, invoice_number, patient_id, visit_id,
        subtotal, discount_amount, discount_reason, tax_amount,
        grand_total, paid_amount, due_amount, status,
        created_by, created_at, updated_at
    ) VALUES (
        p_org_id, v_invoice_number, p_patient_id, p_visit_id,
        v_subtotal, v_discount, p_discount_reason, 0.00,
        v_grand_total, v_paid, v_due, v_status,
        v_calling_user_id, NOW(), NOW()
    ) RETURNING id INTO v_invoice_id;

    -- Insert line items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_cat := UPPER(COALESCE(v_item->>'service_category', v_item->>'category', 'MISC'));
        IF v_item_cat NOT IN ('CONSULTATION', 'LAB', 'XRAY', 'USG', 'ECG', 'PHARMACY', 'BED', 'CABIN', 'OT', 'AMBULANCE', 'MISC') THEN
            v_item_cat := 'MISC';
        END IF;
        v_item_name := COALESCE(v_item->>'item_name', v_item->>'itemName', 'Service Item');
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0);
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 1.0);
        v_item_total := v_unit_price * v_quantity;
        v_item_ref := CASE 
            WHEN (v_item->>'reference_id') ~ '^[0-9a-fA-F-]{36}$' THEN (v_item->>'reference_id')::UUID 
            WHEN (v_item->>'referenceId') ~ '^[0-9a-fA-F-]{36}$' THEN (v_item->>'referenceId')::UUID 
            ELSE NULL 
        END;

        INSERT INTO public.invoice_items (
            invoice_id, service_category, reference_id,
            item_name, unit_price, quantity, total_price, created_at
        ) VALUES (
            v_invoice_id, v_item_cat, v_item_ref,
            v_item_name, v_unit_price, v_quantity, v_item_total, NOW()
        );
    END LOOP;

    -- Record initial payment if paid > 0
    IF v_paid > 0 THEN
        v_receipt_number := public.generate_receipt_number(p_org_id);
        v_cashier_uuid := COALESCE(p_cashier_id, v_calling_user_id);
        
        -- Fallback cashier if calling_user_id is not in profiles
        IF v_cashier_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_cashier_uuid) THEN
            SELECT id INTO v_cashier_uuid FROM public.profiles WHERE organization_id = p_org_id LIMIT 1;
        END IF;

        INSERT INTO public.payments (
            organization_id, invoice_id, receipt_number, payment_method,
            amount, gateway_transaction_id, cashier_id, notes, created_at
        ) VALUES (
            p_org_id, v_invoice_id, v_receipt_number,
            UPPER(COALESCE(p_payment_method, 'CASH')),
            v_paid, p_gateway_transaction_id, v_cashier_uuid,
            COALESCE(p_notes, 'Initial payment at invoice creation'), NOW()
        ) RETURNING id INTO v_payment_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'subtotal', v_subtotal,
        'grand_total', v_grand_total,
        'paid_amount', v_paid,
        'due_amount', v_due,
        'status', v_status,
        'payment_id', v_payment_id,
        'receipt_number', v_receipt_number
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) TO authenticated, service_role;

-- Collect Payment Atomic RPC
DROP FUNCTION IF EXISTS public.collect_payment_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.collect_payment_atomic(
    p_org_id UUID,
    p_invoice_id UUID,
    p_amount NUMERIC,
    p_payment_method VARCHAR,
    p_gateway_transaction_id VARCHAR DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_perm BOOLEAN;
    v_invoice RECORD;
    v_receipt_no VARCHAR;
    v_new_paid NUMERIC;
    v_new_due NUMERIC;
    v_new_status VARCHAR;
    v_payment_id UUID;
    v_cashier_uuid UUID;
BEGIN
    v_calling_user_id := auth.uid();

    IF v_calling_user_id IS NULL AND current_user != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Authentication required.');
    END IF;

    IF v_calling_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND is_active = TRUE) THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: User profile inactive or non-existent.');
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'cashier', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.collect', 'billing.manage', '*')
            ) INTO v_has_perm;

            IF v_has_perm IS NOT TRUE THEN
                RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks payment collection authorization.');
            END IF;
        END IF;
    END IF;

    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero.');
    END IF;

    -- Lock invoice FOR UPDATE
    SELECT * INTO v_invoice FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found in organization.');
    END IF;

    IF COALESCE(v_invoice.is_voided, FALSE) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot collect payment on a voided invoice.');
    END IF;

    IF p_amount > v_invoice.due_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount exceeds outstanding invoice balance. Overpayment is not permitted.');
    END IF;

    v_new_paid := v_invoice.paid_amount + p_amount;
    v_new_due := GREATEST(0, v_invoice.grand_total - v_new_paid);
    v_new_status := CASE WHEN v_new_due = 0 THEN 'PAID' ELSE 'PARTIAL' END;

    v_receipt_no := public.generate_receipt_number(p_org_id);

    v_cashier_uuid := COALESCE(p_cashier_id, v_calling_user_id);
    IF v_cashier_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_cashier_uuid) THEN
        SELECT id INTO v_cashier_uuid FROM public.profiles WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    INSERT INTO public.payments (
        organization_id, invoice_id, receipt_number, payment_method,
        amount, gateway_transaction_id, cashier_id, notes, created_at
    ) VALUES (
        p_org_id, v_invoice.id, v_receipt_no,
        UPPER(p_payment_method),
        p_amount, p_gateway_transaction_id, v_cashier_uuid,
        COALESCE(p_notes, 'Payment collected against invoice ' || v_invoice.invoice_number), NOW()
    ) RETURNING id INTO v_payment_id;

    UPDATE public.invoices
    SET paid_amount = v_new_paid,
        due_amount = v_new_due,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = v_invoice.id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'receipt_number', v_receipt_no,
        'invoice_id', v_invoice.id,
        'paid_amount', v_new_paid,
        'due_amount', v_new_due,
        'status', v_new_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.collect_payment_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_payment_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) TO authenticated, service_role;
