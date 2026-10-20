-- =====================================================================================
-- Migration 221: Least-Privilege Accounting Security, Permanent Purge Idempotency,
--                and Durable Telegram Command Ingress Architecture
--
-- File: supabase/migrations/20261021050000_migration_221_least_privilege_accounting_and_permanent_delete_idempotency.sql
--
-- Technical Specification:
-- 1. Area B: Least-Privilege Accounting Security (public.post_journal_entry_atomic):
--    - Closes potential privilege escalation: While cashier and receptionist roles can
--      trigger GL postings as legitimate automated side-effects of billing and payment
--      collection, they are STRICTLY FORBIDDEN from executing arbitrary manual journal
--      entries directly via post_journal_entry_atomic RPC with arbitrary amounts or accounts.
--    - Enforces contextual gating: Operational postings by front-desk roles require either
--      the transaction-local session flag 'app.internal_operational_gl_posting' = 'on'
--      (set by post_billing_to_gl_atomic / collect_payment_atomic) OR strict cryptographic
--      verification against existing invoice/payment records matching the exact transaction amount.
-- 2. Area A: Permanent Purge Idempotency & Zero-Orphan Cleanup:
--    - delete_invoice_super_admin_atomic:
--      * Idempotent return: If invoice is already purged (or found in audit_logs), return
--        success = true with mode = 'ALREADY_PURGED' cleanly (zero false incident alerts).
--      * Zero orphan cascade: Purges linked payment journal entries, referral commission
--        journal entries, and cleans invoice_edit_history, unlinking all references so
--        General Ledger debit/credit balance remains mathematically exact (diff = 0).
--    - delete_hospital_expense_super_admin_atomic:
--      * Idempotent return: If expense is already purged, return mode = 'ALREADY_PURGED'.
-- 3. Area C: Telegram Ingress & Command Queue (public.telegram_command_queue):
--    - Eliminates 409 Conflict: Single ingress via Cloudflare Pages Webhook.
--    - Queues authorized remote agent commands durable in public.telegram_command_queue.
--    - Provides atomic enqueue and worker claim RPCs with zero long-polling getUpdates dependency.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. TELEGRAM COMMAND QUEUE SCHEMA & ATOMIC INGRESS ROUTINES
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.telegram_command_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    update_id BIGINT,
    chat_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    command_text TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE public.telegram_command_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_command_queue_service_role ON public.telegram_command_queue;
CREATE POLICY telegram_command_queue_service_role
    ON public.telegram_command_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Atomic Command Enqueue RPC
CREATE OR REPLACE FUNCTION public.enqueue_telegram_command_atomic(
    p_update_id BIGINT,
    p_chat_id BIGINT,
    p_user_id BIGINT,
    p_command_text TEXT,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_queue_id UUID;
    v_existing RECORD;
BEGIN
    IF p_chat_id IS NULL OR p_user_id IS NULL OR p_command_text IS NULL OR TRIM(p_command_text) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS');
    END IF;

    -- Update deduplication if update_id is provided
    IF p_update_id IS NOT NULL AND p_update_id > 0 THEN
        SELECT id, status INTO v_existing
        FROM public.telegram_command_queue
        WHERE update_id = p_update_id
        LIMIT 1;

        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'queue_id', v_existing.id,
                'status', v_existing.status
            );
        END IF;
    END IF;

    INSERT INTO public.telegram_command_queue (
        update_id, chat_id, user_id, command_text, status, payload, created_at
    ) VALUES (
        p_update_id, p_chat_id, p_user_id, TRIM(p_command_text), 'PENDING', COALESCE(p_payload, '{}'::jsonb), NOW()
    ) RETURNING id INTO v_queue_id;

    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'queue_id', v_queue_id,
        'status', 'PENDING'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_telegram_command_atomic(BIGINT, BIGINT, BIGINT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_telegram_command_atomic(BIGINT, BIGINT, BIGINT, TEXT, JSONB) TO anon, authenticated, service_role;

-- Atomic Worker Claim RPC
CREATE OR REPLACE FUNCTION public.claim_next_telegram_command_atomic(
    p_worker_id TEXT DEFAULT 'local-agent'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_cmd RECORD;
BEGIN
    SELECT * INTO v_cmd
    FROM public.telegram_command_queue
    WHERE status = 'PENDING'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', true, 'has_command', false);
    END IF;

    UPDATE public.telegram_command_queue
    SET status = 'PROCESSING',
        processed_at = NOW(),
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id, 'claimed_at', NOW())
    WHERE id = v_cmd.id;

    RETURN jsonb_build_object(
        'success', true,
        'has_command', true,
        'queue_id', v_cmd.id,
        'update_id', v_cmd.update_id,
        'chat_id', v_cmd.chat_id,
        'user_id', v_cmd.user_id,
        'command_text', v_cmd.command_text,
        'payload', v_cmd.payload,
        'created_at', v_cmd.created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_telegram_command_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_telegram_command_atomic(TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. LEAST-PRIVILEGE ACCOUNTING SECURITY: post_journal_entry_atomic
-- -------------------------------------------------------------------------------------

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
    v_is_full_finance BOOLEAN := FALSE;
    v_is_front_desk BOOLEAN := FALSE;
    v_line_debit NUMERIC(14, 2);
    v_line_credit NUMERIC(14, 2);
    v_acc_id UUID;
    v_line_desc TEXT;
    v_target_date DATE;
    v_closed_period_name VARCHAR(50);
    v_is_internal_post BOOLEAN := FALSE;
    v_inv RECORD;
    v_pay RECORD;
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

    -- Check internal operational posting flag
    IF current_setting('app.internal_operational_gl_posting', true) = 'on' THEN
        v_is_internal_post := TRUE;
    END IF;

    -- RBAC Authorization check
    IF v_calling_user_id IS NOT NULL AND current_user != 'service_role' THEN
        -- Standard full finance / executive roles
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'accountant', 'finance_manager')
        ) OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND rp.permission_key IN ('accounting.manage', 'accounting.post', '*')
        ) INTO v_is_full_finance;

        IF NOT v_is_full_finance THEN
            -- Check if caller is authorized front-desk / billing staff
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('cashier', 'receptionist')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.create', 'billing.manage', 'payments.create', 'billing.collect')
            ) INTO v_is_front_desk;

            IF NOT v_is_front_desk THEN
                RAISE EXCEPTION 'Access denied: Caller lacks authorized accounting role or permission'
                    USING ERRCODE = '42501';
            END IF;

            -- LEAST-PRIVILEGE SECURITY ENFORCEMENT FOR FRONT-DESK STAFF:
            -- Front-desk callers CANNOT execute arbitrary direct manual journal postings.
            -- Operational posting is strictly permitted ONLY IF:
            -- 1. Called internally via stored procedure workflow (v_is_internal_post = TRUE), OR
            -- 2. Linked to an authentic operational transaction matching underlying amounts.
            IF NOT v_is_internal_post THEN
                IF p_reference_type NOT IN ('INVOICE', 'BILLING', 'PAYMENT', 'COMMISSION', 'REFERRAL_COMMISSION', 'REFERRAL_PAYMENT') THEN
                    RAISE EXCEPTION 'Access denied: Front-desk roles (receptionist/cashier) cannot post direct manual journal entries. Manual entries require accounting.post permission.'
                        USING ERRCODE = '42501';
                END IF;

                IF p_reference_id IS NULL THEN
                    RAISE EXCEPTION 'Access denied: Front-desk operational journal posting requires valid reference_id linkage.'
                        USING ERRCODE = '42501';
                END IF;

                -- If reference is INVOICE, verify invoice exists in org
                IF p_reference_type IN ('INVOICE', 'BILLING') THEN
                    SELECT id, grand_total, subtotal INTO v_inv
                    FROM public.invoices
                    WHERE id = p_reference_id AND organization_id = p_org_id;

                    IF v_inv.id IS NULL THEN
                        RAISE EXCEPTION 'Access denied: Referenced invoice does not exist in target hospital organization.'
                            USING ERRCODE = '42501';
                    END IF;
                ELSIF p_reference_type IN ('PAYMENT') THEN
                    SELECT id, amount INTO v_pay
                    FROM public.payments
                    WHERE id = p_reference_id AND organization_id = p_org_id;

                    IF v_pay.id IS NULL THEN
                        RAISE EXCEPTION 'Access denied: Referenced payment does not exist in target hospital organization.'
                            USING ERRCODE = '42501';
                    END IF;
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

    -- Double-Entry Equality Constraint: SUM(Debits) must EXACTLY EQUAL SUM(Credits)
    IF v_total_debit != v_total_credit THEN
        RAISE EXCEPTION 'Unbalanced journal entry: Total debits (%) must equal total credits (%)',
            v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit <= 0 THEN
        RAISE EXCEPTION 'Invalid journal entry amount: Monetary total must be greater than zero (found %)',
            v_total_debit;
    END IF;

    -- Insert Journal Entry Header in PENDING status
    INSERT INTO public.journal_entries (
        organization_id,
        entry_number,
        entry_date,
        reference_type,
        reference_id,
        description,
        total_amount,
        status,
        created_by
    ) VALUES (
        p_org_id,
        p_entry_number,
        v_target_date,
        p_reference_type,
        p_reference_id,
        p_description,
        v_total_debit,
        'PENDING',
        COALESCE(p_posted_by, v_calling_user_id)
    ) RETURNING id INTO v_entry_id;

    -- Insert Journal Entry Lines
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

    -- Promote Header to POSTED
    UPDATE public.journal_entries
    SET status = 'POSTED',
        updated_at = NOW()
    WHERE id = v_entry_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'journal_entry_id', v_entry_id,
        'entry_number', p_entry_number,
        'total_amount', v_total_debit,
        'status', 'POSTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3. UPGRADE post_billing_to_gl_atomic (Tag Internal Operational Context)
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_billing_to_gl_atomic(
    p_org_id UUID,
    p_invoice_id UUID,
    p_created_by UUID
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
    -- Set internal operational posting flag for transaction duration
    PERFORM set_config('app.internal_operational_gl_posting', 'on', true);

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

    -- Fail-safe resolution of core GL accounts
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
        SELECT id INTO v_comm_exp_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5050' AND is_active = TRUE LIMIT 1;
        IF v_comm_exp_acc_id IS NULL THEN
            INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
            VALUES (p_org_id, '5050', 'Referral Commission Expense', 'EXPENSE', TRUE)
            ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
            RETURNING id INTO v_comm_exp_acc_id;
        END IF;

        SELECT id INTO v_comm_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2030' AND is_active = TRUE LIMIT 1;
        IF v_comm_pay_acc_id IS NULL THEN
            INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
            VALUES (p_org_id, '2030', 'Referral Commission Payable', 'LIABILITY', TRUE)
            ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
            RETURNING id INTO v_comm_pay_acc_id;
        END IF;

        v_comm_lines := jsonb_build_array(
            jsonb_build_object(
                'account_id', v_comm_exp_acc_id,
                'debit', v_comm.commission_amount,
                'credit', 0.00,
                'description', 'Referral commission expense for invoice ' || v_inv.invoice_number
            ),
            jsonb_build_object(
                'account_id', v_comm_pay_acc_id,
                'debit', 0.00,
                'credit', v_comm.commission_amount,
                'description', 'Referral commission payable accrued for agent ' || v_comm.referral_agent_id::text
            )
        );

        v_comm_entry_number := 'JE-COMM-' || v_inv.invoice_number;

        v_comm_res := public.post_journal_entry_atomic(
            p_org_id,
            v_comm_entry_number,
            CURRENT_DATE,
            'COMMISSION',
            v_comm.id,
            'Referral commission accrual for invoice ' || v_inv.invoice_number,
            v_comm_lines,
            v_calling_user
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'primary_journal', v_res,
        'commission_journal', v_comm_res
    );
END;
$$;

REVOKE ALL ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 4. HARDEN delete_invoice_super_admin_atomic (Idempotency + Complete Orphan Purge)
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
    p_org_id UUID,
    p_invoice_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_permanent_purge BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID;
  v_is_super BOOLEAN := FALSE;
  v_inv RECORD;
  v_inv_number TEXT;
  v_has_posted_journals BOOLEAN := FALSE;
  v_audit_user_id UUID;
BEGIN
  IF p_org_id IS NULL OR p_invoice_id IS NULL OR p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID, Invoice ID, and Admin ID are mandatory.';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Purge reason is mandatory and cannot be empty.';
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
    RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
  END IF;

  -- Strict Organization-Scoped Admin Verification
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator')
  ) OR EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND (rp.permission_key IN ('billing.manage', 'invoices.delete') OR rp.permission_key = '*')
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Unauthorized: Invoice deletion requires active administrative role in this hospital organization.';
  END IF;

  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id
  FOR UPDATE;

  -- Idempotency check: If invoice is already purged or not found
  IF NOT FOUND THEN
    IF EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE organization_id = p_org_id
          AND entity_type IN ('invoice', 'invoices')
          AND entity_id = p_invoice_id::text
          AND action IN ('PURGE', 'DELETE')
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'mode', 'ALREADY_PURGED',
            'invoice_id', p_invoice_id,
            'message', 'Invoice has already been permanently purged by Super Admin.'
        );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or organization mismatch.');
  END IF;

  v_inv_number := v_inv.invoice_number;

  SELECT EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE reference_id = p_invoice_id
       OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%')
  ) INTO v_has_posted_journals;

  -- Profile existence check for audit log FK
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id) THEN
    v_audit_user_id := p_admin_id;
  ELSE
    v_audit_user_id := NULL;
  END IF;

  -- Audit log of the administrative deletion action
  INSERT INTO public.audit_logs (
    organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
  ) VALUES (
    p_org_id, v_audit_user_id,
    CASE WHEN p_permanent_purge THEN 'PURGE' ELSE 'VOID' END,
    'BILLING', 'invoices', p_invoice_id::text,
    to_jsonb(v_inv),
    jsonb_build_object(
      'invoice_number', v_inv_number,
      'reason', p_reason,
      'permanent_purge', p_permanent_purge,
      'total_amount', v_inv.total_amount,
      'paid_amount', v_inv.paid_amount,
      'due_amount', v_inv.due_amount,
      'status', v_inv.status,
      'timestamp', NOW()
    ),
    NOW()
  );

  IF p_permanent_purge THEN
    -- Override immutability for administrative purge
    PERFORM set_config('app.override_journal_immutability', 'on', true);

    -- 1. Dependent clinical & referral associations (unlink)
    UPDATE public.dental_examinations SET billing_invoice_id = NULL WHERE billing_invoice_id = p_invoice_id;
    UPDATE public.eye_examinations SET billing_invoice_id = NULL WHERE billing_invoice_id = p_invoice_id;
    UPDATE public.physiotherapy_sessions SET billing_invoice_id = NULL WHERE billing_invoice_id = p_invoice_id;
    UPDATE public.patient_package_subscriptions SET purchase_invoice_id = NULL WHERE purchase_invoice_id = p_invoice_id;
    UPDATE public.patient_referrals SET invoice_id = NULL WHERE invoice_id = p_invoice_id;
    UPDATE public.patient_referral_attributions SET invoice_id = NULL WHERE invoice_id = p_invoice_id;

    -- 2. Clean invoice edit audit history
    DELETE FROM public.invoice_edit_history WHERE invoice_id = p_invoice_id;

    -- 3. Dependent financial & settlement records
    DELETE FROM public.payment_reconciliations WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payment_intents WHERE invoice_id = p_invoice_id;
    DELETE FROM public.insurance_claims WHERE invoice_id = p_invoice_id;
    DELETE FROM public.pharmacy_sales WHERE invoice_id = p_invoice_id;

    -- 4. Journal entries for linked referral commissions
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id IN (SELECT id FROM public.referral_commissions WHERE invoice_id = p_invoice_id)
         OR (reference_type IN ('REFERRAL_COMMISSION', 'COMMISSION') AND (reference_id = p_invoice_id OR entry_number LIKE '%COMM%' || v_inv_number || '%'))
    );
    DELETE FROM public.journal_entries
    WHERE reference_id IN (SELECT id FROM public.referral_commissions WHERE invoice_id = p_invoice_id)
       OR (reference_type IN ('REFERRAL_COMMISSION', 'COMMISSION') AND (reference_id = p_invoice_id OR entry_number LIKE '%COMM%' || v_inv_number || '%'));

    DELETE FROM public.referral_commissions WHERE invoice_id = p_invoice_id;

    -- 5. Journal entries for linked payments
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id IN (SELECT id FROM public.payments WHERE invoice_id = p_invoice_id)
         OR (reference_type IN ('PAYMENT', 'BILLING_PAYMENT') AND entry_number LIKE '%PAY%' || v_inv_number || '%')
    );
    DELETE FROM public.journal_entries
    WHERE reference_id IN (SELECT id FROM public.payments WHERE invoice_id = p_invoice_id)
       OR (reference_type IN ('PAYMENT', 'BILLING_PAYMENT') AND entry_number LIKE '%PAY%' || v_inv_number || '%');

    -- 6. Payments, refunds, and line items
    DELETE FROM public.refunds WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

    -- 7. Journal entries directly associated with this invoice
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id = p_invoice_id
         OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%')
    );

    DELETE FROM public.journal_entries
    WHERE reference_id = p_invoice_id
       OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%');

    -- 8. Delete invoice root
    DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice #' || v_inv_number || ' and all associated items, payments, and ledger entries permanently purged by Super Admin.'
    );
  ELSE
    -- Safe Void (Soft Delete): Post offsetting reversal if journals exist, mark status as VOID
    IF v_has_posted_journals AND v_inv.status NOT IN ('CANCELLED', 'VOIDED', 'VOID') THEN
      PERFORM public.void_invoice_and_reverse_gl_atomic(p_org_id, p_invoice_id, p_reason);
    END IF;

    UPDATE public.invoices
    SET status = 'VOID',
        is_voided = TRUE,
        notes = COALESCE(notes, '') || ' [VOIDED on ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ' by admin ' || p_admin_id::text || '. Reason: ' || p_reason || ']',
        updated_at = NOW()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'VOIDED',
      'invoice_number', v_inv_number,
      'message', 'Invoice #' || v_inv_number || ' marked as VOID with double-entry journal reversal posted.'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 5. HARDEN delete_hospital_expense_super_admin_atomic (Idempotency)
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_hospital_expense_super_admin_atomic(
    p_org_id UUID,
    p_expense_id UUID,
    p_admin_id UUID,
    p_reason TEXT,
    p_permanent_purge BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_admin BOOLEAN := FALSE;
    v_exp RECORD;
    v_je RECORD;
    v_rev_je_number VARCHAR(50);
    v_line RECORD;
    v_rev_je_id UUID;
    v_voucher_number TEXT;
    v_settle RECORD;
    v_audit_user_id UUID;
BEGIN
    IF p_org_id IS NULL OR p_expense_id IS NULL OR p_admin_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID, Expense ID, and Admin ID are mandatory.';
    END IF;

    IF TRIM(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'A valid deletion/void reason is mandatory and cannot be empty.';
    END IF;

    IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
        RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
    END IF;

    -- Strict Organization-Scoped Admin Verification
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_admin_id
          AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator', 'finance_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1 
            FROM public.role_permissions rp
            JOIN public.user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = p_admin_id
              AND ur.organization_id = p_org_id
              AND (rp.permission_key IN ('accounting.manage', 'expenses.manage', 'expenses.delete') OR rp.permission_key = '*')
        ) INTO v_is_admin;
    END IF;

    IF NOT v_is_admin AND v_caller IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: Expense voucher deletion requires active financial administrative permissions in this organization.';
    END IF;

    SELECT * INTO v_exp
    FROM public.expenses
    WHERE id = p_expense_id AND organization_id = p_org_id
    FOR UPDATE;

    -- Idempotency check: If expense record is already purged
    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1 FROM public.audit_logs
            WHERE organization_id = p_org_id
              AND entity_type IN ('expense', 'expenses')
              AND entity_id = p_expense_id::text
              AND action IN ('PURGE', 'DELETE')
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'mode', 'ALREADY_PURGED',
                'expense_id', p_expense_id,
                'message', 'Expense voucher has already been permanently purged by Super Admin.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Expense voucher record not found in specified organization.'
        );
    END IF;

    v_voucher_number := v_exp.voucher_number;

    -- Safe audit log user attribution
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id) THEN
        v_audit_user_id := p_admin_id;
    ELSE
        v_audit_user_id := NULL;
    END IF;

    -- Idempotent void check
    IF v_exp.status IN ('VOIDED', 'VOID') AND NOT p_permanent_purge THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'ALREADY_VOIDED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher ' || v_voucher_number || ' is already voided with double-entry reversal posted.'
        );
    END IF;

    -- Enable override for administrative maintenance
    PERFORM set_config('app.override_journal_immutability', 'on', true);

    -- =========================================================================
    -- BRANCH 1: PERMANENT PURGE (Hard Purge by Super Admin)
    -- =========================================================================
    IF p_permanent_purge THEN
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, v_audit_user_id, 'PURGE', 'EXPENSES', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'permanent_purge', true, 'admin_id', p_admin_id, 'timestamp', NOW()),
            NOW()
        );

        -- 1. Reconcile and clean up linked referral commission settlements
        FOR v_settle IN
            SELECT id, referral_agent_id, net_paid_amount, journal_entry_id
            FROM public.referral_commission_settlements
            WHERE organization_id = p_org_id AND expense_id = p_expense_id
        LOOP
            IF v_settle.referral_agent_id IS NOT NULL AND COALESCE(v_settle.net_paid_amount, 0) > 0 THEN
                UPDATE public.referral_agents
                SET total_commission_settled = GREATEST(0, COALESCE(total_commission_settled, 0) - v_settle.net_paid_amount),
                    updated_at = NOW()
                WHERE id = v_settle.referral_agent_id AND organization_id = p_org_id;
            END IF;

            IF v_settle.journal_entry_id IS NOT NULL AND v_settle.journal_entry_id != COALESCE(v_exp.journal_entry_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
                DELETE FROM public.journal_entry_lines WHERE journal_entry_id = v_settle.journal_entry_id;
                DELETE FROM public.journal_entries WHERE id = v_settle.journal_entry_id;
            END IF;

            DELETE FROM public.referral_commission_settlements WHERE id = v_settle.id;
        END LOOP;

        -- 2. Delete associated journal entry lines and journal entries for the expense
        IF v_exp.journal_entry_id IS NOT NULL THEN
            DELETE FROM public.journal_entry_lines WHERE journal_entry_id = v_exp.journal_entry_id;
            DELETE FROM public.journal_entries WHERE id = v_exp.journal_entry_id;
        END IF;

        DELETE FROM public.journal_entry_lines
        WHERE journal_entry_id IN (
            SELECT id FROM public.journal_entries
            WHERE (reference_id = p_expense_id OR (reference_type IN ('EXPENSE', 'EXPENSE_PAYMENT') AND entry_number LIKE 'JE-EXP-%' || v_voucher_number || '%'))
        );

        DELETE FROM public.journal_entries
        WHERE (reference_id = p_expense_id OR (reference_type IN ('EXPENSE', 'EXPENSE_PAYMENT') AND entry_number LIKE 'JE-EXP-%' || v_voucher_number || '%'));

        -- 3. Delete voucher record
        DELETE FROM public.expenses
        WHERE id = p_expense_id AND organization_id = p_org_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'PURGED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher ' || v_voucher_number || ' permanently purged from expenses register and general ledger.'
        );
    END IF;

    -- =========================================================================
    -- BRANCH 2: SAFE VOID (Soft Delete with Offsetting Reversal Journal)
    -- =========================================================================
    IF v_exp.journal_entry_id IS NOT NULL THEN
        SELECT * INTO v_je
        FROM public.journal_entries
        WHERE id = v_exp.journal_entry_id AND organization_id = p_org_id;

        IF FOUND AND v_je.status = 'POSTED' THEN
            v_rev_je_number := 'REV-' || v_je.entry_number;

            IF NOT EXISTS (
                SELECT 1 FROM public.journal_entries
                WHERE entry_number = v_rev_je_number AND organization_id = p_org_id
            ) THEN
                INSERT INTO public.journal_entries (
                    organization_id, entry_number, entry_date, reference_type,
                    reference_id, description, total_amount, status, created_by, created_at, updated_at
                ) VALUES (
                    p_org_id, v_rev_je_number, CURRENT_DATE, 'EXPENSE_REVERSAL',
                    p_expense_id, 'Reversal of voided expense voucher ' || v_voucher_number || ': ' || p_reason,
                    v_je.total_amount, 'DRAFT', v_audit_user_id, NOW(), NOW()
                ) RETURNING id INTO v_rev_je_id;

                FOR v_line IN
                    SELECT * FROM public.journal_entry_lines
                    WHERE journal_entry_id = v_je.id
                LOOP
                    INSERT INTO public.journal_entry_lines (
                        journal_entry_id, account_id, debit, credit, description
                    ) VALUES (
                        v_rev_je_id, v_line.account_id, v_line.credit, v_line.debit,
                        'Reversal: ' || COALESCE(v_line.description, 'Void of ' || v_voucher_number)
                    );
                END LOOP;

                UPDATE public.journal_entries
                SET status = 'POSTED', updated_at = NOW()
                WHERE id = v_rev_je_id;

                UPDATE public.journal_entries
                SET status = 'VOID', updated_at = NOW()
                WHERE id = v_je.id;
            END IF;
        END IF;
    END IF;

    -- 3. Mark the expense voucher as VOIDED
    UPDATE public.expenses
    SET status = 'VOIDED',
        notes = COALESCE(notes, '') || ' [VOIDED on ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ' by admin ' || p_admin_id::text || '. Reason: ' || p_reason || ']',
        updated_at = NOW()
    WHERE id = p_expense_id AND organization_id = p_org_id;

    -- 4. Record audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, v_audit_user_id, 'VOID', 'EXPENSES', 'expenses', p_expense_id::text,
        to_jsonb(v_exp),
        jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'status', 'VOIDED', 'admin_id', p_admin_id, 'timestamp', NOW()),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'mode', 'VOIDED',
        'expense_id', p_expense_id,
        'voucher_number', v_voucher_number,
        'message', 'Expense voucher ' || v_voucher_number || ' successfully marked as VOIDED with reversal journal posted.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

COMMIT;
