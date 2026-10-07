-- =====================================================================================
-- 20261007210000_billing_referral_autosuggest_and_custom_rate.sql
-- Onnesha Hospital Management System (OHMS) - Migration 112
--
-- IPD Admission Referral Attribution Auto-Suggestion & Configurable Commission Rate:
-- 1. get_patient_referral_attribution_for_billing RPC (Auto-lookup for billing cashiers)
-- 2. search_referral_agents_for_billing RPC (Authoritative rate-inclusive agent search for billing)
-- 3. create_invoice_atomic (13-param signature with configurable referral partner & commission rate)
-- 4. create_invoice_and_post_gl_atomic (13-param atomic billing-to-GL integration)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. RPC: get_patient_referral_attribution_for_billing
-- Safe auto-lookup of active patient attribution for billing cashiers & accountants.
-- Prioritizes admission visit attribution, falling back to active patient attribution.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_patient_referral_attribution_for_billing(
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL
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
    v_attrib RECORD;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Organization session not resolved.');
    END IF;

    -- Verify caller authorization
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = v_active_org
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier', 'receptionist')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = v_active_org
                  AND rp.permission_key IN ('billing.create', 'billing.manage', 'referral.view', 'referral.assign', 'referral.manage', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks billing or referral authorization.');
        END IF;
    END IF;

    -- Priority 1: Visit-specific attribution (e.g. Inpatient Admission)
    IF p_visit_id IS NOT NULL THEN
        SELECT 
            pra.id AS attribution_id,
            pra.referral_agent_id,
            ra.agent_code,
            ra.full_name,
            ra.agent_type,
            ra.commission_rate_percent,
            ra.is_commission_eligible,
            pra.visit_id,
            'ADMISSION' AS source
        INTO v_attrib
        FROM public.patient_referral_attributions pra
        JOIN public.referral_agents ra ON ra.id = pra.referral_agent_id
        WHERE pra.visit_id = p_visit_id
          AND pra.organization_id = v_active_org
          AND pra.status = 'ACTIVE'
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        LIMIT 1;
    END IF;

    -- Priority 2: Patient active attribution fallback (includes latest admission or registration attribution)
    IF v_attrib.attribution_id IS NULL THEN
        SELECT 
            pra.id AS attribution_id,
            pra.referral_agent_id,
            ra.agent_code,
            ra.full_name,
            ra.agent_type,
            ra.commission_rate_percent,
            ra.is_commission_eligible,
            pra.visit_id,
            CASE WHEN pra.visit_id IS NOT NULL THEN 'ADMISSION' ELSE 'REGISTRATION' END AS source
        INTO v_attrib
        FROM public.patient_referral_attributions pra
        JOIN public.referral_agents ra ON ra.id = pra.referral_agent_id
        WHERE pra.patient_id = p_patient_id
          AND pra.organization_id = v_active_org
          AND pra.status = 'ACTIVE'
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        ORDER BY pra.created_at DESC
        LIMIT 1;
    END IF;

    IF v_attrib.attribution_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'found', true,
            'attribution_id', v_attrib.attribution_id,
            'referral_agent_id', v_attrib.referral_agent_id,
            'agent_code', v_attrib.agent_code,
            'full_name', v_attrib.full_name,
            'agent_type', v_attrib.agent_type,
            'commission_rate_percent', v_attrib.commission_rate_percent,
            'is_commission_eligible', v_attrib.is_commission_eligible,
            'source', v_attrib.source,
            'visit_id', v_attrib.visit_id
        );
    ELSE
        RETURN jsonb_build_object(
            'success', true,
            'found', false
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_patient_referral_attribution_for_billing(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_referral_attribution_for_billing(UUID, UUID) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 2. RPC: search_referral_agents_for_billing
-- Returns referral agents including commission rate for authorized billing cashiers
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_referral_agents_for_billing(
    p_org_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_code VARCHAR(40),
    full_name VARCHAR(150),
    agent_type VARCHAR(30),
    phone VARCHAR(30),
    commission_rate_percent NUMERIC(5,2),
    is_commission_eligible BOOLEAN
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
                  AND rp.permission_key IN ('billing.create', 'billing.manage', 'referral.view', 'referral.manage', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks billing cashier authority' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        ra.id,
        ra.agent_code,
        ra.full_name,
        ra.agent_type,
        ra.phone,
        ra.commission_rate_percent,
        ra.is_commission_eligible
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

REVOKE ALL ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 3. Drop legacy 11-parameter create_invoice_atomic and replace with 13-parameter version
-- -------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_invoice_atomic(
    UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0.00,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_gateway_transaction_id VARCHAR DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_referral_agent_id UUID DEFAULT NULL,
    p_referral_commission_rate NUMERIC DEFAULT NULL
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

    -- Referral variables
    v_ref_agent_id UUID;
    v_ref_code VARCHAR(40);
    v_ref_name VARCHAR(150);
    v_ref_type VARCHAR(30);
    v_ref_rate NUMERIC(5,2);
    v_ref_eligible BOOLEAN;
    v_ref_compliance BOOLEAN;
    v_attrib_id UUID;
    v_comm_amount NUMERIC(14,2) := 0.00;
    v_comm_id UUID;
    v_explicit_suppression BOOLEAN := FALSE;
BEGIN
    v_calling_user_id := auth.uid();

    -- Step 1: Authentication required unless internal service_role
    IF v_calling_user_id IS NULL AND current_user != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Authentication required.');
    END IF;

    -- Step 2: Check active profile and billing permissions
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

    -- Step 3: Validate patient belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id AND organization_id = p_org_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in organization.');
    END IF;

    -- Step 4: Validate items JSON array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice must contain at least one line item.');
    END IF;

    -- Step 5: Pre-validate items: non-negative unit_price, quantity > 0
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0);
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 1.0);

        IF v_unit_price < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item unit price cannot be negative.');
        END IF;

        IF v_quantity <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item quantity must be greater than zero.');
        END IF;

        v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    END LOOP;

    -- Step 6: Validate discount
    v_discount := COALESCE(p_discount_amount, 0.00);
    IF v_discount < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discount amount cannot be negative.');
    END IF;
    IF v_discount > v_subtotal THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discount amount cannot exceed invoice subtotal.');
    END IF;

    v_grand_total := v_subtotal - v_discount;

    -- Step 7: Validate initial payment amount
    v_paid := COALESCE(p_initial_payment_amount, 0.00);
    IF v_paid < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount cannot be negative.');
    END IF;
    IF v_paid > v_grand_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount cannot exceed total invoice due amount.');
    END IF;

    v_due := v_grand_total - v_paid;

    IF v_due = 0 AND v_grand_total > 0 THEN
        v_status := 'PAID';
    ELSIF v_paid > 0 THEN
        v_status := 'PARTIAL';
    ELSE
        v_status := 'UNPAID';
    END IF;

    -- Step 8: Pre-validate Cashier
    IF v_paid > 0 THEN
        IF p_cashier_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles p
                JOIN public.user_roles ur ON ur.user_id = p.id
                JOIN public.roles r ON ur.role_id = r.id
                WHERE p.id = p_cashier_id AND ur.organization_id = p_org_id AND p.is_active = TRUE
                  AND LOWER(r.name) IN ('cashier', 'accountant', 'finance_manager', 'admin', 'super_admin')
            ) THEN
                RETURN jsonb_build_object('success', false, 'error', 'Specified cashier does not hold an authorized cashier role in organization.');
            END IF;
            v_cashier_uuid := p_cashier_id;
        ELSIF v_calling_user_id IS NOT NULL THEN
            v_cashier_uuid := v_calling_user_id;
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Payment requires an authorized cashier.');
        END IF;

        IF UPPER(COALESCE(p_payment_method, 'CASH')) = 'CASH' AND p_gateway_transaction_id IS NOT NULL AND TRIM(p_gateway_transaction_id) != '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cash payment must not have a gateway transaction ID.');
        END IF;
    END IF;

    -- Step 9: Resolve Referral Attribution & Custom Commission Rate %
    -- Nil UUID (00000000-0000-0000-0000-000000000000) explicitly suppresses commission
    IF p_referral_agent_id = '00000000-0000-0000-0000-000000000000'::UUID THEN
        v_explicit_suppression := TRUE;
    ELSIF p_referral_agent_id IS NOT NULL THEN
        -- Explicit referral agent passed by cashier
        SELECT ra.id, ra.agent_code, ra.full_name, ra.agent_type,
               ra.commission_rate_percent, ra.is_commission_eligible, ra.compliance_approved, pra.id
        INTO v_ref_agent_id, v_ref_code, v_ref_name, v_ref_type,
             v_ref_rate, v_ref_eligible, v_ref_compliance, v_attrib_id
        FROM public.referral_agents ra
        LEFT JOIN public.patient_referral_attributions pra
               ON pra.referral_agent_id = ra.id
              AND pra.patient_id = p_patient_id
              AND pra.organization_id = p_org_id
              AND pra.status = 'ACTIVE'
        WHERE ra.id = p_referral_agent_id
          AND ra.organization_id = p_org_id
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        LIMIT 1;

        -- Create active attribution if not already recorded
        IF v_ref_agent_id IS NOT NULL AND v_attrib_id IS NULL THEN
            INSERT INTO public.patient_referral_attributions (
                organization_id, patient_id, visit_id, referral_agent_id,
                referral_code_snapshot, referral_name_snapshot, assigned_by,
                status, notes, created_at, updated_at
            ) VALUES (
                p_org_id, p_patient_id, p_visit_id, v_ref_agent_id,
                v_ref_code, v_ref_name, v_calling_user_id,
                'ACTIVE', 'Attributed during billing checkout', NOW(), NOW()
            ) RETURNING id INTO v_attrib_id;
        END IF;
    END IF;

    -- If no explicit referral agent given and not suppressed, auto-suggest from admission visit first
    IF NOT v_explicit_suppression AND v_ref_agent_id IS NULL AND p_visit_id IS NOT NULL THEN
        SELECT pra.referral_agent_id, ra.agent_code, ra.full_name, ra.agent_type,
               ra.commission_rate_percent, ra.is_commission_eligible, ra.compliance_approved, pra.id
        INTO v_ref_agent_id, v_ref_code, v_ref_name, v_ref_type,
             v_ref_rate, v_ref_eligible, v_ref_compliance, v_attrib_id
        FROM public.patient_referral_attributions pra
        JOIN public.referral_agents ra ON ra.id = pra.referral_agent_id
        WHERE pra.visit_id = p_visit_id
          AND pra.organization_id = p_org_id
          AND pra.status = 'ACTIVE'
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        LIMIT 1;
    END IF;

    -- If still no referral agent resolved, check general patient active attributions (including admission)
    IF NOT v_explicit_suppression AND v_ref_agent_id IS NULL THEN
        SELECT pra.referral_agent_id, ra.agent_code, ra.full_name, ra.agent_type,
               ra.commission_rate_percent, ra.is_commission_eligible, ra.compliance_approved, pra.id
        INTO v_ref_agent_id, v_ref_code, v_ref_name, v_ref_type,
             v_ref_rate, v_ref_eligible, v_ref_compliance, v_attrib_id
        FROM public.patient_referral_attributions pra
        JOIN public.referral_agents ra ON ra.id = pra.referral_agent_id
        WHERE pra.patient_id = p_patient_id
          AND pra.organization_id = p_org_id
          AND pra.status = 'ACTIVE'
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        ORDER BY pra.created_at DESC
        LIMIT 1;
    END IF;

    -- Custom Rate Override: if cashier adjusted commission percentage, validate bounds (1.00% to 40.00%)
    IF v_ref_agent_id IS NOT NULL AND p_referral_commission_rate IS NOT NULL THEN
        IF p_referral_commission_rate < 1.00 OR p_referral_commission_rate > 40.00 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referral commission rate must be between 1.00% and 40.00%.');
        END IF;
        v_ref_rate := ROUND(p_referral_commission_rate::NUMERIC, 2);
    END IF;

    -- =================================================================================
    -- ALL PRE-VALIDATIONS PASSED — EXECUTE DATABASE MUTATIONS
    -- =================================================================================
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

    -- Record Payment if initial payment received
    IF v_paid > 0 THEN
        v_receipt_number := public.generate_receipt_number(p_org_id);
        INSERT INTO public.payments (
            organization_id, invoice_id, amount,
            payment_method, gateway_transaction_id, cashier_id,
            receipt_number, payment_date, created_at
        ) VALUES (
            p_org_id, v_invoice_id, v_paid,
            UPPER(COALESCE(p_payment_method, 'CASH')), p_gateway_transaction_id, v_cashier_uuid,
            v_receipt_number, NOW(), NOW()
        ) RETURNING id INTO v_payment_id;
    END IF;

    -- Automatic Referral Commission Calculation & Snapshot
    -- FORMULA: commission_base = grand_total (final patient bill after approved discount)
    -- commission_amount = ROUND(commission_base * commission_rate_percent / 100, 2)
    IF NOT v_explicit_suppression AND v_ref_agent_id IS NOT NULL AND v_ref_eligible IS TRUE AND v_grand_total > 0 THEN
        v_comm_amount := ROUND((v_grand_total * v_ref_rate / 100.0), 2);

        IF v_comm_amount > 0 THEN
            INSERT INTO public.referral_commissions (
                organization_id, referral_agent_id, referral_attribution_id,
                patient_id, visit_id, invoice_id,
                referral_code_snapshot, referral_name_snapshot,
                billing_subtotal, discount_amount, commission_base_amount,
                commission_rate_percent, commission_amount,
                amount_paid, amount_pending,
                approval_status, settlement_status,
                created_at, updated_at
            ) VALUES (
                p_org_id, v_ref_agent_id, v_attrib_id,
                p_patient_id, p_visit_id, v_invoice_id,
                v_ref_code, v_ref_name,
                v_subtotal, v_discount, v_grand_total,
                v_ref_rate, v_comm_amount,
                0.00, v_comm_amount,
                CASE WHEN v_ref_type = 'DOCTOR' AND v_ref_compliance IS NOT TRUE THEN 'PENDING' ELSE 'APPROVED' END,
                'PENDING',
                NOW(), NOW()
            ) RETURNING id INTO v_comm_id;

            -- Update agent aggregate earned counter
            UPDATE public.referral_agents
            SET total_commission_earned = total_commission_earned + v_comm_amount,
                updated_at = NOW()
            WHERE id = v_ref_agent_id;
        END IF;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'CREATE', 'BILLING', 'invoice', v_invoice_id::text,
        jsonb_build_object(
            'invoice_number', v_invoice_number,
            'subtotal', v_subtotal,
            'discount', v_discount,
            'grand_total', v_grand_total,
            'paid', v_paid,
            'referral_code', v_ref_code,
            'commission_rate_percent', v_ref_rate,
            'commission_amount', v_comm_amount
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'subtotal', v_subtotal,
        'discount_amount', v_discount,
        'grand_total', v_grand_total,
        'paid_amount', v_paid,
        'due_amount', v_due,
        'status', v_status,
        'receipt_number', v_receipt_number,
        'payment_id', v_payment_id,
        'referral_code', v_ref_code,
        'commission_rate_percent', v_ref_rate,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT, UUID, NUMERIC) TO authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- 4. Drop legacy 11-parameter create_invoice_and_post_gl_atomic and replace with 13-parameter version
-- -------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_invoice_and_post_gl_atomic(
    UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.create_invoice_and_post_gl_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0.00,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_gateway_transaction_id VARCHAR DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_referral_agent_id UUID DEFAULT NULL,
    p_referral_commission_rate NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inv_res JSONB;
    v_invoice_id UUID;
    v_gl_res JSONB;
BEGIN
    -- 1. Create Invoice, Items, Payment, Referral Commission atomically
    v_inv_res := public.create_invoice_atomic(
        p_org_id,
        p_patient_id,
        p_visit_id,
        p_items,
        p_discount_amount,
        p_discount_reason,
        p_initial_payment_amount,
        p_payment_method,
        p_gateway_transaction_id,
        p_cashier_id,
        p_notes,
        p_referral_agent_id,
        p_referral_commission_rate
    );

    IF (v_inv_res->>'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_inv_res;
    END IF;

    v_invoice_id := (v_inv_res->>'invoice_id')::UUID;

    -- 2. Post to General Ledger in the exact same transaction
    v_gl_res := public.post_billing_to_gl_atomic(p_org_id, v_invoice_id);

    IF (v_gl_res->>'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'General Ledger posting failed: %', COALESCE(v_gl_res->>'error', 'Unknown GL error')
            USING ERRCODE = 'P0001';
    END IF;

    -- 3. Return full combined result
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_inv_res->>'invoice_number',
        'subtotal', (v_inv_res->>'subtotal')::NUMERIC,
        'discount_amount', (v_inv_res->>'discount_amount')::NUMERIC,
        'grand_total', (v_inv_res->>'grand_total')::NUMERIC,
        'paid_amount', (v_inv_res->>'paid_amount')::NUMERIC,
        'due_amount', (v_inv_res->>'due_amount')::NUMERIC,
        'status', v_inv_res->>'status',
        'receipt_number', v_inv_res->>'receipt_number',
        'payment_id', (v_inv_res->>'payment_id')::UUID,
        'journal_entry_id', (v_gl_res->>'journal_entry_id')::UUID,
        'journal_entry_number', v_gl_res->>'journal_entry_number',
        'referral_code', v_inv_res->>'referral_code',
        'commission_rate_percent', (v_inv_res->>'commission_rate_percent')::NUMERIC,
        'commission_amount', (v_inv_res->>'commission_amount')::NUMERIC,
        'commission_id', (v_inv_res->>'commission_id')::UUID
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_and_post_gl_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_post_gl_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT, UUID, NUMERIC) TO authenticated, service_role;
