-- =====================================================================================
-- Migration 140: 20261010213000_fix_referral_commission_gl_account_codes.sql
-- Fixes "Account <NULL> does not exist or is inactive" error during billing invoice creation
-- by aligning referral commission expense (5020 & 5400) and payable (2030) accounts in
-- chart_of_accounts, updating seed_default_chart_of_accounts, and adding fail-safe on-the-fly
-- provisioning to post_billing_to_gl_atomic, settle_referral_commissions_atomic, and
-- generate_receipt_number.
-- =====================================================================================

-- 1. Ensure chart_of_accounts has all required accounts for ALL organizations
INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
SELECT id, '1010', 'Cash in Hand (Cashier Drawer)', 'ASSET', TRUE FROM public.organizations
ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
SELECT id, '1020', 'Operating Bank Account (Cash at Bank)', 'ASSET', TRUE FROM public.organizations
ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
SELECT id, '1100', 'Accounts Receivable - Patients', 'ASSET', TRUE FROM public.organizations
ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
SELECT id, '2030', 'Referral & Partner Commissions Payable', 'LIABILITY', TRUE FROM public.organizations
ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
SELECT id, '4010', 'Patient Clinical & Bed Service Revenue', 'REVENUE', TRUE FROM public.organizations
ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
SELECT id, '4090', 'Patient Billing Discounts Allowed', 'EXPENSE', TRUE FROM public.organizations
ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
SELECT id, '5020', 'Referral & Partner Commission Expense', 'EXPENSE', TRUE FROM public.organizations
ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
SELECT id, '5400', 'Referral Commission Expense', 'EXPENSE', TRUE FROM public.organizations
ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

-- 2. Update seed_default_chart_of_accounts to always seed both 5020 and 5400, plus 2030
CREATE OR REPLACE FUNCTION public.seed_default_chart_of_accounts(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- ASSETS
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
    VALUES 
        (p_org_id, '1010', 'Cash in Hand (Cashier Drawer)', 'ASSET', TRUE),
        (p_org_id, '1020', 'Operating Bank Account (Cash at Bank)', 'ASSET', TRUE),
        (p_org_id, '1100', 'Accounts Receivable - Patients', 'ASSET', TRUE),
        (p_org_id, '1200', 'General Hospital Supplies Inventory', 'ASSET', TRUE),
        (p_org_id, '1210', 'Pharmacy Medicine Inventory', 'ASSET', TRUE),
        (p_org_id, '1500', 'Medical Equipment & Biomedical Machinery', 'ASSET', TRUE),
        (p_org_id, '1590', 'Accumulated Depreciation - Medical Equipment', 'ASSET', TRUE)
    ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

    -- LIABILITIES
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
    VALUES 
        (p_org_id, '2010', 'Accounts Payable - Medical & Drug Suppliers', 'LIABILITY', TRUE),
        (p_org_id, '2020', 'Accrued Staff Salaries & Withholdings', 'LIABILITY', TRUE),
        (p_org_id, '2030', 'Referral & Partner Commissions Payable', 'LIABILITY', TRUE)
    ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

    -- EQUITY
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
    VALUES 
        (p_org_id, '3010', 'Hospital Retained Earnings & Capital Fund', 'EQUITY', TRUE)
    ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

    -- REVENUES
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
    VALUES 
        (p_org_id, '4010', 'Patient Clinical & Bed Service Revenue', 'REVENUE', TRUE),
        (p_org_id, '4011', 'Doctor Consultation Fees Revenue', 'REVENUE', TRUE),
        (p_org_id, '4012', 'Pathology & Diagnostic Service Revenue', 'REVENUE', TRUE),
        (p_org_id, '4020', 'Pharmacy Medicine Sales Revenue', 'REVENUE', TRUE)
    ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;

    -- EXPENSES
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
    VALUES 
        (p_org_id, '4090', 'Patient Billing Discounts Allowed', 'EXPENSE', TRUE),
        (p_org_id, '5010', 'Cost of Goods Sold (COGS) - Pharmacy Medicines', 'EXPENSE', TRUE),
        (p_org_id, '5020', 'Referral & Partner Commission Expense', 'EXPENSE', TRUE),
        (p_org_id, '5100', 'Hospital Staff Salaries & Wages Expense', 'EXPENSE', TRUE),
        (p_org_id, '5200', 'Medical Equipment Depreciation Expense', 'EXPENSE', TRUE),
        (p_org_id, '5300', 'Hospital Facility Maintenance & Utilities', 'EXPENSE', TRUE),
        (p_org_id, '5400', 'Referral Commission Expense', 'EXPENSE', TRUE)
    ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE;
END;
$$;

-- 3. Hardened, fail-safe post_billing_to_gl_atomic with dynamic account provisioning
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

-- 4. Drop spurious function from earlier attempt if present
DROP FUNCTION IF EXISTS public.execute_commission_payout_atomic(UUID, UUID, UUID[], VARCHAR, VARCHAR, TEXT);

-- 5. Hardened, fail-safe settle_referral_commissions_atomic
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

    SELECT id INTO v_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2030' AND is_active = TRUE LIMIT 1;
    IF v_pay_acc_id IS NULL THEN
        INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
        VALUES (p_org_id, '2030', 'Referral & Partner Commissions Payable', 'LIABILITY', TRUE)
        ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
        RETURNING id INTO v_pay_acc_id;
    END IF;

    IF UPPER(p_payment_method) = 'CASH' THEN
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010' AND is_active = TRUE LIMIT 1;
        IF v_cash_acc_id IS NULL THEN
            INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
            VALUES (p_org_id, '1010', 'Cash in Hand (Cashier Drawer)', 'ASSET', TRUE)
            ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
            RETURNING id INTO v_cash_acc_id;
        END IF;
    ELSE
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020' AND is_active = TRUE LIMIT 1;
        IF v_cash_acc_id IS NULL THEN
            INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
            VALUES (p_org_id, '1020', 'Operating Bank Account (Cash at Bank)', 'ASSET', TRUE)
            ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
            RETURNING id INTO v_cash_acc_id;
        END IF;
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

-- 6. Hardened, fail-safe generate_receipt_number sequence & function
CREATE SEQUENCE IF NOT EXISTS public.receipt_code_seq START WITH 100001 INCREMENT BY 1;
GRANT USAGE, SELECT ON SEQUENCE public.receipt_code_seq TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'OH-RCT-';
BEGIN
    BEGIN
        v_seq_num := nextval('public.receipt_code_seq'::regclass);
    EXCEPTION WHEN OTHERS THEN
        v_seq_num := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT % 1000000000;
    END;
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_receipt_number(UUID) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number(UUID) TO authenticated, service_role;
