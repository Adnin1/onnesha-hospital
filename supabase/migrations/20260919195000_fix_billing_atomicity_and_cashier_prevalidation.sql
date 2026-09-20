-- =====================================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
-- Migration: 20260919195000_fix_billing_atomicity_and_cashier_prevalidation.sql
-- 1. Pre-validate ALL constraints, money invariants, and explicit cashier BEFORE ANY INSERT
--    in create_invoice_atomic() so that returning failure never leaves orphan mutations.
-- 2. Validate explicit cashier and payment method integrity in collect_payment_atomic().
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. HARDEN create_invoice_atomic (Zero-Mutation Pre-Validation Architecture)
-- -------------------------------------------------------------------------------------
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

    -- Step 5: Compute subtotal and strictly validate item prices and quantities
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

    -- Step 6: Validate discount amount
    IF p_discount_amount IS NOT NULL AND p_discount_amount < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discount amount cannot be negative.');
    END IF;

    IF p_discount_amount IS NOT NULL AND p_discount_amount > v_subtotal THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discount amount cannot exceed invoice subtotal.');
    END IF;

    v_discount := GREATEST(0, COALESCE(p_discount_amount, 0));
    v_grand_total := GREATEST(0, v_subtotal - v_discount);

    -- Step 7: Validate initial payment amount
    IF p_initial_payment_amount IS NOT NULL AND p_initial_payment_amount < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Initial payment amount cannot be negative.');
    END IF;

    IF p_initial_payment_amount IS NOT NULL AND p_initial_payment_amount > v_grand_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'Initial payment amount exceeds invoice grand total. Overpayment is rejected.');
    END IF;

    v_paid := GREATEST(0, COALESCE(p_initial_payment_amount, 0));
    v_due := GREATEST(0, v_grand_total - v_paid);

    IF v_due = 0 AND v_grand_total > 0 THEN
        v_status := 'PAID';
    ELSIF v_paid > 0 THEN
        v_status := 'PARTIAL';
    ELSE
        v_status := 'UNPAID';
    END IF;

    -- Step 8: Pre-validate Cashier & Payment Method BEFORE ANY MUTATION
    IF v_paid > 0 THEN
        -- Explicit cashier validation (NO SILENT FALLBACK)
        IF p_cashier_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_cashier_id AND organization_id = p_org_id AND is_active = TRUE) THEN
                RETURN jsonb_build_object('success', false, 'error', 'Invalid cashier: specified cashier profile does not belong to this organization or is inactive.');
            END IF;
            v_cashier_uuid := p_cashier_id;
        ELSIF v_calling_user_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND organization_id = p_org_id AND is_active = TRUE) THEN
                v_cashier_uuid := v_calling_user_id;
            ELSE
                v_cashier_uuid := NULL;
            END IF;
        ELSE
            v_cashier_uuid := NULL;
        END IF;

        -- Payment method integrity: CASH payments must not carry a gateway transaction ID
        IF UPPER(COALESCE(p_payment_method, 'CASH')) = 'CASH' AND p_gateway_transaction_id IS NOT NULL AND TRIM(p_gateway_transaction_id) != '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cash payment must not have a gateway transaction ID.');
        END IF;
    END IF;

    -- =================================================================================
    -- ALL PRE-VALIDATIONS PASSED — BEGIN DATABASE MUTATIONS
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

    -- Atomic Audit Log for Invoice Creation
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'CREATE', 'BILLING', 'invoice', v_invoice_id::text,
        jsonb_build_object(
            'invoice_number', v_invoice_number,
            'patient_id', p_patient_id,
            'visit_id', p_visit_id,
            'subtotal', v_subtotal,
            'discount_amount', v_discount,
            'discount_reason', p_discount_reason,
            'grand_total', v_grand_total,
            'paid_amount', v_paid,
            'due_amount', v_due,
            'status', v_status
        )
    );

    -- Record initial payment if paid > 0
    IF v_paid > 0 THEN
        v_receipt_number := public.generate_receipt_number(p_org_id);

        INSERT INTO public.payments (
            organization_id, invoice_id, receipt_number, payment_method,
            amount, gateway_transaction_id, cashier_id, notes, created_at
        ) VALUES (
            p_org_id, v_invoice_id, v_receipt_number,
            UPPER(COALESCE(p_payment_method, 'CASH')),
            v_paid, p_gateway_transaction_id, v_cashier_uuid,
            COALESCE(p_notes, 'Initial payment at invoice creation'), NOW()
        ) RETURNING id INTO v_payment_id;

        -- Atomic Audit Log for Initial Payment
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, new_values
        ) VALUES (
            p_org_id, v_calling_user_id, 'CREATE', 'BILLING', 'payment', v_payment_id::text,
            jsonb_build_object(
                'receipt_number', v_receipt_number,
                'invoice_id', v_invoice_id,
                'amount', v_paid,
                'payment_method', UPPER(COALESCE(p_payment_method, 'CASH')),
                'gateway_transaction_id', p_gateway_transaction_id,
                'cashier_id', v_cashier_uuid
            )
        );
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
        'receipt_number', v_receipt_number,
        'payment_id', v_payment_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice creation could not be completed: ' || SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. HARDEN collect_payment_atomic (Zero-Mutation Pre-Validation Architecture)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collect_payment_atomic(
    p_org_id UUID,
    p_invoice_id UUID,
    p_amount NUMERIC,
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
    v_invoice RECORD;
    v_new_paid NUMERIC;
    v_new_due NUMERIC;
    v_new_status VARCHAR;
    v_receipt_no VARCHAR;
    v_payment_id UUID;
    v_cashier_uuid UUID;
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
                  AND rp.permission_key IN ('billing.create', 'billing.manage', 'payments.create', '*')
            ) INTO v_has_perm;

            IF v_has_perm IS NOT TRUE THEN
                RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks payment collection authorization.');
            END IF;
        END IF;
    END IF;

    -- Step 3: Validate payment amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero.');
    END IF;

    -- Step 4: Validate explicit cashier BEFORE ANY MUTATION
    IF p_cashier_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_cashier_id AND organization_id = p_org_id AND is_active = TRUE) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid cashier: specified cashier profile does not belong to this organization or is inactive.');
        END IF;
        v_cashier_uuid := p_cashier_id;
    ELSIF v_calling_user_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND organization_id = p_org_id AND is_active = TRUE) THEN
            v_cashier_uuid := v_calling_user_id;
        ELSE
            v_cashier_uuid := NULL;
        END IF;
    ELSE
        v_cashier_uuid := NULL;
    END IF;

    -- Step 5: Validate payment method integrity (CASH payments must not carry gateway transaction ID)
    IF UPPER(COALESCE(p_payment_method, 'CASH')) = 'CASH' AND p_gateway_transaction_id IS NOT NULL AND TRIM(p_gateway_transaction_id) != '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cash payment must not have a gateway transaction ID.');
    END IF;

    -- Step 6: Lock invoice within organization
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

    -- =================================================================================
    -- ALL PRE-VALIDATIONS PASSED — EXECUTE MUTATION
    -- =================================================================================

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

    -- Atomic Audit Log for Payment Collection
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'CREATE', 'BILLING', 'payment', v_payment_id::text,
        jsonb_build_object(
            'receipt_number', v_receipt_no,
            'invoice_id', v_invoice.id,
            'invoice_number', v_invoice.invoice_number,
            'amount', p_amount,
            'payment_method', UPPER(p_payment_method),
            'gateway_transaction_id', p_gateway_transaction_id,
            'cashier_id', v_cashier_uuid,
            'new_paid', v_new_paid,
            'new_due', v_new_due,
            'new_status', v_new_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'receipt_number', v_receipt_no,
        'invoice_id', v_invoice.id,
        'new_paid', v_new_paid,
        'new_due', v_new_due,
        'new_status', v_new_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment collection could not be completed: ' || SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.collect_payment_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_payment_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) TO authenticated, service_role;
