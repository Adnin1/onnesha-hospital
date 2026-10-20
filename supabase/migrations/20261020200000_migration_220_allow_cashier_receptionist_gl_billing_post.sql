-- =====================================================================================
-- Migration 220: Allow Receptionist and Cashier Operational Billing & General Ledger Posting
--
-- Technical Root Cause Analysis:
-- When an invoice is created via create_invoice_and_post_gl_atomic, create_invoice_atomic
-- succeeds, but the subsequent post_billing_to_gl_atomic calls post_journal_entry_atomic.
-- In post_journal_entry_atomic, the RBAC authorization check strictly allowed ONLY
-- ('super_admin', 'admin', 'accountant', 'finance_manager') or ('accounting.manage', 'accounting.post', '*').
-- Receptionist and cashier roles holding front-desk billing authority were blocked with:
-- "Access denied: Caller lacks authorized accounting role or permission" (ERRCODE = '42501').
--
-- Fixes:
--   1. Seed permissions 'billing.collect', 'payments.create', and 'accounting.post' into public.permissions.
--   2. Grant 'billing.collect' and 'payments.create' to receptionist, accountant, hospital_administrator, and super_admin roles.
--   3. Upgrade public.post_journal_entry_atomic: for operational transactions (reference_type IN
--      ('INVOICE', 'BILLING', 'PAYMENT', 'COMMISSION', 'REFERRAL_COMMISSION', 'REFERRAL_PAYMENT')),
--      allow authorized billing/front-desk staff (receptionist, cashier, hospital_administrator)
--      or callers possessing ('billing.create', 'billing.manage', 'payments.create', 'billing.collect').
--   4. Upgrade public.post_billing_to_gl_atomic: include 'receptionist' and 'hospital_administrator'
--      in authorized roles and accept ('billing.create', 'billing.manage', 'payments.create', 'billing.collect').
--   5. Upgrade public.collect_payment_atomic: include 'receptionist' and 'hospital_administrator'
--      in authorized roles and cashier validation.
-- =====================================================================================

BEGIN;

-- 1. Ensure permissions exist in public.permissions
INSERT INTO public.permissions (key, module, description)
VALUES
    ('billing.collect', 'BILLING', 'Collect payments and receipts against patient invoices'),
    ('payments.create', 'PAYMENT', 'Record payment collections against patient accounts'),
    ('accounting.post', 'ACCOUNTING', 'Post double-entry journal entries directly to General Ledger')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    module = EXCLUDED.module;

-- 2. Grant billing and payment collection permissions to front-desk and finance roles
DO $$
DECLARE
    v_role_id UUID;
    v_perm TEXT;
    v_rec_perms TEXT[] := ARRAY['billing.collect', 'payments.create'];
    v_fin_perms TEXT[] := ARRAY['billing.collect', 'payments.create', 'accounting.post'];
BEGIN
    -- Receptionist
    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = 'receptionist' LIMIT 1;
    IF v_role_id IS NOT NULL THEN
        FOREACH v_perm IN ARRAY v_rec_perms LOOP
            INSERT INTO public.role_permissions (role_id, permission_key)
            VALUES (v_role_id, v_perm)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- Accountant
    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = 'accountant' LIMIT 1;
    IF v_role_id IS NOT NULL THEN
        FOREACH v_perm IN ARRAY v_fin_perms LOOP
            INSERT INTO public.role_permissions (role_id, permission_key)
            VALUES (v_role_id, v_perm)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- Hospital Administrator
    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = 'hospital_administrator' LIMIT 1;
    IF v_role_id IS NOT NULL THEN
        FOREACH v_perm IN ARRAY v_fin_perms LOOP
            INSERT INTO public.role_permissions (role_id, permission_key)
            VALUES (v_role_id, v_perm)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- Super Admin
    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = 'super_admin' LIMIT 1;
    IF v_role_id IS NOT NULL THEN
        FOREACH v_perm IN ARRAY v_fin_perms LOOP
            INSERT INTO public.role_permissions (role_id, permission_key)
            VALUES (v_role_id, v_perm)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;
END $$;

-- 3. Upgrade public.post_journal_entry_atomic
CREATE OR REPLACE FUNCTION public.post_journal_entry_atomic(
    p_org_id UUID,
    p_entry_number VARCHAR,
    p_entry_date DATE,
    p_reference_type VARCHAR,
    p_reference_id UUID,
    p_description TEXT,
    p_lines JSONB,
    p_posted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total_debit NUMERIC(14, 2) := 0.00;
    v_total_credit NUMERIC(14, 2) := 0.00;
    v_entry_id UUID;
    v_elem JSONB;
    v_active_org UUID;
    v_calling_user_id UUID;
    v_has_perm BOOLEAN := FALSE;
    v_line_debit NUMERIC(14, 2);
    v_line_credit NUMERIC(14, 2);
    v_acc_id UUID;
    v_line_desc TEXT;
    v_target_date DATE;
    v_closed_period_name VARCHAR(50);
BEGIN
    v_calling_user_id := auth.uid();
    v_target_date := COALESCE(p_entry_date, CURRENT_DATE);

    -- Fail-Closed Organization Resolution
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Active organization context is missing or does not match target organization'
            USING ERRCODE = '42501';
    END IF;

    -- Accounting Period Control: Disallow posting into closed fiscal periods
    SELECT period_name INTO v_closed_period_name
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND is_closed = TRUE
      AND v_target_date BETWEEN start_date AND end_date
    LIMIT 1;

    IF v_closed_period_name IS NOT NULL THEN
        RAISE EXCEPTION 'Accounting Period Closed: Transactions cannot be posted to closed fiscal period "%" for date %',
            v_closed_period_name, v_target_date
            USING ERRCODE = '22023';
    END IF;

    -- RBAC Authorization check
    IF v_calling_user_id IS NOT NULL AND current_user != 'service_role' THEN
        -- Standard finance roles
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            -- Check operational context: If reference is an INVOICE, PAYMENT, BILLING, COMMISSION, or REFERRAL_COMMISSION entry,
            -- allow authorized front-desk/billing staff (cashier, receptionist) or users with billing/payment permissions
            IF p_reference_type IN ('INVOICE', 'BILLING', 'PAYMENT', 'COMMISSION', 'REFERRAL_COMMISSION', 'REFERRAL_PAYMENT') THEN
                SELECT EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    JOIN public.roles r ON ur.role_id = r.id
                    WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                      AND LOWER(r.name) IN ('cashier', 'receptionist')
                ) INTO v_has_perm;

                IF v_has_perm IS NOT TRUE THEN
                    SELECT EXISTS (
                        SELECT 1 FROM public.user_roles ur
                        JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                        WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                          AND rp.permission_key IN ('billing.create', 'billing.manage', 'payments.create', 'billing.collect')
                    ) INTO v_has_perm;
                END IF;
            END IF;

            IF v_has_perm IS NOT TRUE THEN
                SELECT EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                    WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                      AND rp.permission_key IN ('accounting.manage', 'accounting.post', '*')
                ) INTO v_has_perm;

                IF v_has_perm IS NOT TRUE THEN
                    RAISE EXCEPTION 'Access denied: Caller lacks authorized accounting role or permission'
                        USING ERRCODE = '42501';
                END IF;
            END IF;
        END IF;
    END IF;

    -- Validate input lines array
    IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Invalid journal: At least 2 balanced journal lines are required';
    END IF;

    -- Pre-calculate and validate debit XOR credit exclusivity across all lines
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_line_debit := COALESCE((v_elem->>'debit')::NUMERIC, 0.00);
        v_line_credit := COALESCE((v_elem->>'credit')::NUMERIC, 0.00);

        IF (v_line_debit > 0 AND v_line_credit > 0) OR (v_line_debit = 0 AND v_line_credit = 0) THEN
            RAISE EXCEPTION 'Invalid journal line: Each line must have debit > 0 XOR credit > 0 (found debit=%, credit=%)',
                v_line_debit, v_line_credit;
        END IF;

        IF v_line_debit < 0 OR v_line_credit < 0 THEN
            RAISE EXCEPTION 'Negative amounts are strictly prohibited in double-entry journal lines';
        END IF;

        v_total_debit := v_total_debit + v_line_debit;
        v_total_credit := v_total_credit + v_line_credit;
    END LOOP;

    -- Enforce Double-Entry Invariant: TOTAL DEBIT = TOTAL CREDIT
    IF v_total_debit != v_total_credit THEN
        RAISE EXCEPTION 'Unbalanced journal entry: Total Debit (%) must equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit <= 0 THEN
        RAISE EXCEPTION 'Journal entry must have a non-zero balanced amount';
    END IF;

    -- STEP 1: Insert header in controlled 'PENDING' state
    INSERT INTO public.journal_entries (
        organization_id,
        entry_number,
        entry_date,
        reference_type,
        reference_id,
        description,
        status,
        total_debit,
        total_credit,
        posted_by
    ) VALUES (
        p_org_id,
        p_entry_number,
        v_target_date,
        p_reference_type,
        p_reference_id,
        p_description,
        'PENDING',
        v_total_debit,
        v_total_credit,
        p_posted_by
    ) RETURNING id INTO v_entry_id;

    -- STEP 2: Insert journal entry lines while header is PENDING
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_acc_id := (v_elem->>'account_id')::UUID;
        v_line_debit := COALESCE((v_elem->>'debit')::NUMERIC, 0.00);
        v_line_credit := COALESCE((v_elem->>'credit')::NUMERIC, 0.00);
        v_line_desc := v_elem->>'description';

        IF NOT EXISTS (
            SELECT 1 FROM public.chart_of_accounts
            WHERE id = v_acc_id AND organization_id = p_org_id AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Account % does not exist or is inactive in organization %', v_acc_id, p_org_id;
        END IF;

        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_entry_id,
            v_acc_id,
            v_line_debit,
            v_line_credit,
            v_line_desc
        );
    END LOOP;

    -- STEP 3: Atomically transition header to 'POSTED'
    -- The trg_journal_entries_immutability trigger will verify lines and lock the entry
    UPDATE public.journal_entries
    SET status = 'POSTED'
    WHERE id = v_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', v_entry_id,
        'entry_number', p_entry_number,
        'total_amount', v_total_debit
    );
END;
$$;

REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) TO authenticated, service_role;

-- 4. Upgrade public.post_billing_to_gl_atomic
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

    -- Verify caller authorization (includes receptionist and cashier)
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier', 'receptionist')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.create', 'billing.manage', 'payments.create', 'billing.collect', 'accounting.manage', '*')
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

    -- Fail-safe resolution of core GL accounts with automatic insertion if missing
    SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010' AND is_active = TRUE LIMIT 1;
    IF v_cash_acc_id IS NULL THEN
        INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
        VALUES (p_org_id, '1010', 'Cash in Hand (Cashier Drawer)', 'ASSET', TRUE)
        ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
        RETURNING id INTO v_cash_acc_id;
    END IF;

    SELECT id INTO v_ar_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1100' AND is_active = TRUE LIMIT 1;
    IF v_ar_acc_id IS NULL THEN
        INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
        VALUES (p_org_id, '1100', 'Accounts Receivable - Patients', 'ASSET', TRUE)
        ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
        RETURNING id INTO v_ar_acc_id;
    END IF;

    SELECT id INTO v_rev_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '4010' AND is_active = TRUE LIMIT 1;
    IF v_rev_acc_id IS NULL THEN
        INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
        VALUES (p_org_id, '4010', 'Patient Clinical & Bed Service Revenue', 'REVENUE', TRUE)
        ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
        RETURNING id INTO v_rev_acc_id;
    END IF;

    SELECT id INTO v_disc_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '4090' AND is_active = TRUE LIMIT 1;
    IF v_disc_acc_id IS NULL THEN
        INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
        VALUES (p_org_id, '4090', 'Patient Billing Discounts Allowed', 'EXPENSE', TRUE)
        ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
        RETURNING id INTO v_disc_acc_id;
    END IF;

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
        -- Resolve Referral Commission Expense (supports both 5020 and 5400)
        SELECT id INTO v_comm_exp_acc_id FROM public.chart_of_accounts 
        WHERE organization_id = p_org_id AND account_code IN ('5020', '5400') AND is_active = TRUE 
        ORDER BY (account_code = '5020') DESC LIMIT 1;

        IF v_comm_exp_acc_id IS NULL THEN
            INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
            VALUES (p_org_id, '5020', 'Referral & Partner Commission Expense', 'EXPENSE', TRUE)
            ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
            RETURNING id INTO v_comm_exp_acc_id;
        END IF;

        -- Resolve Referral Commissions Payable (2030)
        SELECT id INTO v_comm_pay_acc_id FROM public.chart_of_accounts 
        WHERE organization_id = p_org_id AND account_code = '2030' AND is_active = TRUE 
        LIMIT 1;

        IF v_comm_pay_acc_id IS NULL THEN
            INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
            VALUES (p_org_id, '2030', 'Referral & Partner Commissions Payable', 'LIABILITY', TRUE)
            ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
            RETURNING id INTO v_comm_pay_acc_id;
        END IF;

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

-- 5. Upgrade public.collect_payment_atomic
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
              AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'cashier', 'accountant', 'finance_manager', 'receptionist')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.create', 'billing.manage', 'billing.collect', 'payments.create', '*')
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
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.user_roles ur ON ur.user_id = p.id
            JOIN public.roles r ON ur.role_id = r.id
            WHERE p.id = p_cashier_id AND ur.organization_id = p_org_id AND p.is_active = TRUE
              AND (
                LOWER(r.name) IN ('cashier', 'accountant', 'finance_manager', 'admin', 'super_admin', 'receptionist', 'hospital_administrator')
                OR EXISTS (
                    SELECT 1 FROM public.role_permissions rp
                    WHERE rp.role_id = ur.role_id
                      AND rp.permission_key IN ('billing.create', 'billing.manage', 'billing.collect', 'payments.create', '*')
                )
              )
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid cashier: specified cashier profile does not belong to this organization or lacks cashier authority.');
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
END;
$$;

REVOKE ALL ON FUNCTION public.collect_payment_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.collect_payment_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.collect_payment_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) TO authenticated, service_role;

COMMIT;
