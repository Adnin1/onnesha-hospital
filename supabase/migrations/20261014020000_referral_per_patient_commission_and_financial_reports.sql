-- =====================================================================================
-- OHMS ENTERPRISE MIGRATION 180
-- File: supabase/migrations/20261014020000_referral_per_patient_commission_and_financial_reports.sql
-- Purpose:
--   1. Enhance referral_commission_settlements with patient attribution & GL linkages:
--      patient_id, patient_name, patient_code, patient_total_bill, commission_rate_percent,
--      expense_id, journal_entry_id.
--   2. Authoritative Atomic RPC: record_referral_commission_payout_atomic
--      - Supports per-patient or general payouts
--      - Links to referral_commissions (updating amount_paid, amount_pending, settlement_status)
--      - Inserts into referral_commission_settlements
--      - Inserts into expenses with status = 'POSTED', expense_type = 'MARKETING'
--      - Posts balanced double-entry General Ledger (GL) journal entry into journal_entries & journal_entry_lines
--      - Interlinks expense, settlement, and journal_entry atomically.
--   3. Upgrade backward-compatible record_discretionary_referral_payout_atomic to delegate to the new RPC.
--   4. Modernize get_trial_balance and get_general_ledger_report:
--      - Replace brittle private.get_current_org_id() with fail-closed profiles/user_roles check.
--      - Eliminates 42501 Access denied: Organization mismatch error in Accounting & Ledger.
--   5. Idempotent Data Healing & Backfill:
--      - Backfill missing settlement record for historical payout SETTLE-261012-5804 (VOU-2026-001003).
--      - Create missing journal entry for unposted expense 96e14a37 (SETTLE-20261013-4BCAF9).
--      - Link journal_entry_id in expenses.
--      - Synchronize referral_commissions for Seuliy Begum with amount_paid = 2000.00.
-- =====================================================================================

-- 1. ENHANCE referral_commission_settlements TABLE
ALTER TABLE IF EXISTS public.referral_commission_settlements
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS patient_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS patient_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS patient_total_bill NUMERIC(14, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS commission_rate_percent NUMERIC(5, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ref_comm_settlements_patient 
    ON public.referral_commission_settlements (patient_id);
CREATE INDEX IF NOT EXISTS idx_ref_comm_settlements_agent_date 
    ON public.referral_commission_settlements (referral_agent_id, settlement_date DESC);

-- 2. AUTHORITATIVE ATOMIC PER-PATIENT & GENERAL REFERRAL PAYOUT RPC
CREATE OR REPLACE FUNCTION public.record_referral_commission_payout_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_amount NUMERIC,
    p_payment_method VARCHAR,
    p_patient_id UUID DEFAULT NULL,
    p_transaction_reference VARCHAR DEFAULT NULL,
    p_notes VARCHAR DEFAULT NULL,
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_approved_by UUID;
    v_agent RECORD;
    v_patient RECORD;
    v_settlement_id UUID;
    v_settlement_number VARCHAR(60);
    v_category_id UUID;
    v_voucher_number VARCHAR(60);
    v_expense_id UUID;
    v_gl_exp_acc_id UUID;
    v_gl_cash_acc_id UUID;
    v_je_id UUID;
    v_je_number VARCHAR(60);
    v_new_settled NUMERIC(14,2);
    v_patient_total_bill NUMERIC(14,2) := 0.00;
    v_comm_rate NUMERIC(5,2) := 0.00;
    v_now TIMESTAMPTZ := NOW();
    v_comm_rec RECORD;
    v_target_title TEXT;
    v_payment_norm TEXT;
BEGIN
    -- 1. Multi-Tenant Authorization Check
    IF v_caller_id IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_caller_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant operation prohibited.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Validate Amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payout amount must be greater than zero.';
    END IF;

    -- 3. Validate Same-Org Agent
    SELECT id, agent_code, full_name, total_commission_settled, commission_rate_percent
    INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id
      AND organization_id = p_org_id;

    IF v_agent.id IS NULL THEN
        RAISE EXCEPTION 'Referral agent not found in active organization.';
    END IF;

    v_comm_rate := COALESCE(v_agent.commission_rate_percent, 10.00);

    -- 4. Validate and Snapshot Patient if provided
    IF p_patient_id IS NOT NULL THEN
        SELECT id, full_name, patient_code
        INTO v_patient
        FROM public.patients
        WHERE id = p_patient_id
          AND organization_id = p_org_id;

        IF v_patient.id IS NOT NULL THEN
            -- Calculate patient total billed amount across non-voided invoices
            SELECT COALESCE(SUM(grand_total), 0.00)
            INTO v_patient_total_bill
            FROM public.invoices
            WHERE patient_id = p_patient_id
              AND organization_id = p_org_id
              AND is_voided = FALSE;

            -- If invoices table has 0, fallback to commissions table snapshot
            IF v_patient_total_bill = 0.00 THEN
                SELECT COALESCE(SUM(billing_subtotal), 0.00)
                INTO v_patient_total_bill
                FROM public.referral_commissions
                WHERE patient_id = p_patient_id
                  AND referral_agent_id = p_agent_id
                  AND organization_id = p_org_id;
            END IF;
        END IF;
    END IF;

    -- 5. Idempotency Check
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        SELECT id, settlement_number, expense_id, journal_entry_id
        INTO v_settlement_id, v_settlement_number, v_expense_id, v_je_id
        FROM public.referral_commission_settlements
        WHERE organization_id = p_org_id
          AND referral_agent_id = p_agent_id
          AND transaction_reference = TRIM(p_idempotency_key)
        LIMIT 1;

        IF v_settlement_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'settlement_id', v_settlement_id,
                'settlement_number', v_settlement_number,
                'expense_id', v_expense_id,
                'journal_entry_id', v_je_id
            );
        END IF;
    END IF;

    -- 6. Generate Collision-Safe Settlement Number
    v_settlement_number := 'SETTLE-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

    -- 7. Insert Settlement Record
    INSERT INTO public.referral_commission_settlements (
        organization_id,
        settlement_number,
        referral_agent_id,
        settlement_date,
        gross_commission_selected,
        adjustment_amount,
        net_paid_amount,
        payment_method,
        transaction_reference,
        paid_by,
        notes,
        status,
        patient_id,
        patient_name,
        patient_code,
        patient_total_bill,
        commission_rate_percent,
        created_at
    ) VALUES (
        p_org_id,
        v_settlement_number,
        p_agent_id,
        CURRENT_DATE,
        p_amount,
        0,
        p_amount,
        COALESCE(UPPER(TRIM(p_payment_method)), 'CASH'),
        COALESCE(TRIM(p_idempotency_key), TRIM(p_transaction_reference)),
        v_caller_id,
        COALESCE(TRIM(p_notes), 'Referral commission payout'),
        'PAID',
        p_patient_id,
        v_patient.full_name,
        v_patient.patient_code,
        v_patient_total_bill,
        v_comm_rate,
        v_now
    )
    RETURNING id INTO v_settlement_id;

    -- 8. Synchronize Per-Patient Referral Commissions (if applicable)
    IF p_patient_id IS NOT NULL THEN
        -- Check if existing commission record exists
        SELECT id, commission_amount, amount_paid, amount_pending
        INTO v_comm_rec
        FROM public.referral_commissions
        WHERE organization_id = p_org_id
          AND referral_agent_id = p_agent_id
          AND patient_id = p_patient_id
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_comm_rec.id IS NOT NULL THEN
            UPDATE public.referral_commissions
            SET amount_paid = COALESCE(amount_paid, 0) + p_amount,
                amount_pending = GREATEST(0.00, COALESCE(commission_amount, 0) - (COALESCE(amount_paid, 0) + p_amount)),
                settlement_status = CASE 
                    WHEN (COALESCE(commission_amount, 0) - (COALESCE(amount_paid, 0) + p_amount)) <= 0 THEN 'PAID'
                    ELSE 'PARTIAL'
                END,
                approval_status = 'APPROVED',
                paid_at = v_now,
                updated_at = v_now
            WHERE id = v_comm_rec.id;
        ELSE
            -- Insert new commission record for this patient
            INSERT INTO public.referral_commissions (
                organization_id,
                referral_agent_id,
                patient_id,
                referral_code_snapshot,
                referral_name_snapshot,
                billing_subtotal,
                discount_amount,
                commission_base_amount,
                commission_rate_percent,
                commission_amount,
                amount_paid,
                amount_pending,
                approval_status,
                settlement_status,
                paid_at,
                created_at,
                updated_at
            ) VALUES (
                p_org_id,
                p_agent_id,
                p_patient_id,
                v_agent.agent_code,
                v_agent.full_name,
                v_patient_total_bill,
                0.00,
                v_patient_total_bill,
                v_comm_rate,
                GREATEST(p_amount, (v_patient_total_bill * (v_comm_rate / 100.00))),
                p_amount,
                GREATEST(0.00, GREATEST(p_amount, (v_patient_total_bill * (v_comm_rate / 100.00))) - p_amount),
                'APPROVED',
                CASE WHEN p_amount >= GREATEST(p_amount, (v_patient_total_bill * (v_comm_rate / 100.00))) THEN 'PAID' ELSE 'PARTIAL' END,
                v_now,
                v_now,
                v_now
            );
        END IF;
    END IF;

    -- 9. Update Agent Settled Total
    v_new_settled := COALESCE(v_agent.total_commission_settled, 0) + p_amount;
    UPDATE public.referral_agents
    SET total_commission_settled = v_new_settled,
        updated_at = v_now
    WHERE id = p_agent_id
      AND organization_id = p_org_id;

    -- 10. Resolve or Create Expense Category
    SELECT id INTO v_category_id
    FROM public.expense_categories
    WHERE organization_id = p_org_id
      AND (category_code IN ('CAT-MKT-ADV', 'EXP-MARKETING') OR name ILIKE '%Marketing%' OR name ILIKE '%Referral%')
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_category_id IS NULL THEN
        INSERT INTO public.expense_categories (
            organization_id,
            name,
            category_code,
            is_active
        ) VALUES (
            p_org_id,
            'Marketing & Referral Commission',
            'EXP-MARKETING',
            true
        )
        RETURNING id INTO v_category_id;
    END IF;

    -- 11. Resolve Safe Approved Profile
    IF v_caller_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id) THEN
        v_approved_by := v_caller_id;
    ELSE
        SELECT id INTO v_approved_by FROM public.profiles WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- 12. Insert Hospital Expense Record
    v_voucher_number := 'VOUCHER-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    v_payment_norm := UPPER(COALESCE(TRIM(p_payment_method), 'CASH'));

    IF v_patient.full_name IS NOT NULL THEN
        v_target_title := 'Referral Commission: ' || v_agent.full_name || ' (' || v_agent.agent_code || ') - Patient: ' || v_patient.full_name;
    ELSE
        v_target_title := 'Referral Commission Payout: ' || v_agent.full_name || ' (' || v_agent.agent_code || ')';
    END IF;

    INSERT INTO public.expenses (
        organization_id,
        category_id,
        title,
        amount,
        voucher_number,
        paid_to,
        expense_date,
        payment_method,
        payment_reference,
        expense_type,
        status,
        notes,
        approved_by,
        created_at
    ) VALUES (
        p_org_id,
        v_category_id,
        v_target_title,
        p_amount,
        v_voucher_number,
        v_agent.full_name,
        CURRENT_DATE,
        v_payment_norm,
        v_settlement_number,
        'MARKETING',
        'POSTED',
        COALESCE(TRIM(p_notes), 'Referral partner commission payout booked to operational hospital expense'),
        v_approved_by,
        v_now
    )
    RETURNING id INTO v_expense_id;

    -- 13. Double-Entry General Ledger (GL) Posting
    -- Resolve Expense GL Account (5020 or 5400)
    SELECT id INTO v_gl_exp_acc_id
    FROM public.chart_of_accounts
    WHERE organization_id = p_org_id
      AND account_type = 'EXPENSE'
      AND (account_code IN ('5020', '5400') OR account_name ILIKE '%Referral%')
      AND is_active = TRUE
    ORDER BY account_code ASC
    LIMIT 1;

    IF v_gl_exp_acc_id IS NULL THEN
        SELECT id INTO v_gl_exp_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'EXPENSE' AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- Resolve Cash/Bank Asset GL Account (1010 Cash, 1020 Bank, 1040 MFS)
    IF v_payment_norm = 'CASH' THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND account_code = '1010' AND is_active = TRUE
        LIMIT 1;
    ELSIF v_payment_norm IN ('BANK_TRANSFER', 'BANK') THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND account_code = '1020' AND is_active = TRUE
        LIMIT 1;
    ELSE
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND account_code IN ('1040', '1010') AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_gl_cash_acc_id IS NULL THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- If GL accounts resolved, post balanced journal entry atomically
    IF v_gl_exp_acc_id IS NOT NULL AND v_gl_cash_acc_id IS NOT NULL THEN
        v_je_number := 'JE-EXP-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || SUBSTRING(v_expense_id::TEXT, 1, 6);

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
            posted_by,
            created_at
        ) VALUES (
            p_org_id,
            v_je_number,
            CURRENT_DATE,
            'EXPENSE_PAYMENT',
            v_expense_id,
            v_target_title || ' (Voucher: ' || v_voucher_number || ')',
            'DRAFT',
            p_amount,
            p_amount,
            v_approved_by,
            v_now
        )
        RETURNING id INTO v_je_id;

        -- Debit Expense (Increases Expense)
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_je_id,
            v_gl_exp_acc_id,
            p_amount,
            0.00,
            v_target_title
        );

        -- Credit Cash/Bank (Decreases Asset)
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_je_id,
            v_gl_cash_acc_id,
            0.00,
            p_amount,
            'Disbursement via ' || v_payment_norm
        );

        -- Seal journal entry to 'POSTED'
        UPDATE public.journal_entries
        SET status = 'POSTED'
        WHERE id = v_je_id;

        -- Link journal entry to expense
        UPDATE public.expenses
        SET journal_entry_id = v_je_id
        WHERE id = v_expense_id;

        -- Link journal entry and expense to settlement
        UPDATE public.referral_commission_settlements
        SET expense_id = v_expense_id,
            journal_entry_id = v_je_id
        WHERE id = v_settlement_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'settlement_number', v_settlement_number,
        'expense_id', v_expense_id,
        'voucher_number', v_voucher_number,
        'journal_entry_id', v_je_id,
        'journal_entry_number', v_je_number,
        'amount_paid', p_amount,
        'patient_id', p_patient_id,
        'patient_name', v_patient.full_name,
        'patient_total_bill', v_patient_total_bill
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 3. BACKWARD-COMPATIBLE WRAPPER
CREATE OR REPLACE FUNCTION public.record_discretionary_referral_payout_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_amount NUMERIC,
    p_payment_method VARCHAR,
    p_transaction_reference VARCHAR DEFAULT NULL,
    p_notes VARCHAR DEFAULT NULL,
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN public.record_referral_commission_payout_atomic(
        p_org_id,
        p_agent_id,
        p_amount,
        p_payment_method,
        NULL,
        p_transaction_reference,
        p_notes,
        p_idempotency_key
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_discretionary_referral_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_discretionary_referral_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 4. MODERNIZE get_trial_balance TO PREVENT 42501 FALSE-POSITIVE ERRORS
CREATE OR REPLACE FUNCTION public.get_trial_balance(
    p_org_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_id UUID,
    account_code VARCHAR,
    account_name VARCHAR,
    account_type VARCHAR,
    total_debit NUMERIC,
    total_credit NUMERIC,
    net_balance NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_target_date DATE;
BEGIN
    -- Fail-closed tenant authorization
    IF v_caller_id IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_caller_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
        END IF;
    END IF;

    v_target_date := COALESCE(p_as_of_date, CURRENT_DATE);

    RETURN QUERY
    SELECT 
        coa.id AS account_id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        COALESCE(SUM(posted_lines.debit), 0.00)::NUMERIC(14, 2) AS total_debit,
        COALESCE(SUM(posted_lines.credit), 0.00)::NUMERIC(14, 2) AS total_credit,
        (COALESCE(SUM(posted_lines.debit), 0.00) - COALESCE(SUM(posted_lines.credit), 0.00))::NUMERIC(14, 2) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN (
        SELECT 
            jel.account_id,
            jel.debit,
            jel.credit
        FROM public.journal_entry_lines jel
        INNER JOIN public.journal_entries je ON jel.journal_entry_id = je.id
        WHERE je.organization_id = p_org_id
          AND je.status IN ('POSTED', 'REVERSED')
          AND je.entry_date <= v_target_date
    ) posted_lines ON coa.id = posted_lines.account_id
    WHERE coa.organization_id = p_org_id
      AND coa.is_active = TRUE
    GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
    ORDER BY coa.account_code ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trial_balance(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(UUID, DATE) TO authenticated, service_role;

-- 5. MODERNIZE get_general_ledger_report TO PREVENT 42501 FALSE-POSITIVE ERRORS
CREATE OR REPLACE FUNCTION public.get_general_ledger_report(
    p_org_id UUID,
    p_account_id UUID,
    p_start_date DATE DEFAULT NULL::DATE,
    p_end_date DATE DEFAULT NULL::DATE
)
RETURNS TABLE (
    line_id UUID,
    journal_entry_id UUID,
    entry_number VARCHAR,
    entry_date DATE,
    reference_type VARCHAR,
    reference_id UUID,
    line_description TEXT,
    debit NUMERIC,
    credit NUMERIC,
    running_balance NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
BEGIN
    -- Fail-closed tenant authorization
    IF v_caller_id IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_caller_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        jel.id AS line_id,
        je.id AS journal_entry_id,
        je.entry_number,
        je.entry_date,
        je.reference_type,
        je.reference_id,
        COALESCE(jel.description, je.description) AS line_description,
        jel.debit,
        jel.credit,
        SUM(jel.debit - jel.credit) OVER (
            ORDER BY je.entry_date ASC, je.created_at ASC, jel.id ASC
        )::NUMERIC(14, 2) AS running_balance
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.organization_id = p_org_id
      AND jel.account_id = p_account_id
      AND je.status IN ('POSTED', 'REVERSED')
      AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
      AND (p_end_date IS NULL OR je.entry_date <= p_end_date)
    ORDER BY je.entry_date ASC, je.created_at ASC, jel.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_general_ledger_report(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_general_ledger_report(UUID, UUID, DATE, DATE) TO authenticated, service_role;

-- 6. DATA HEALING & BACKFILL
-- 6a. Backlink existing journal entries to expenses
UPDATE public.expenses e
SET journal_entry_id = je.id
FROM public.journal_entries je
WHERE je.reference_id = e.id
  AND e.journal_entry_id IS NULL;

-- 6b. Backfill missing settlement for historical payout SETTLE-261012-5804 (Expense eb0e5904)
DO $$
DECLARE
    v_exp_id UUID := 'eb0e5904-7a5f-424b-8539-584c33622210'::UUID;
    v_agent_id UUID := '99165265-bbb0-41de-a604-df8d0af82450'::UUID;
    v_patient_id UUID := '2b6cc01b-19b3-4dea-bb2a-3a1a208962cf'::UUID;
    v_je_id UUID := '342b1570-5660-4f59-8ea7-6fb38277cc95'::UUID;
    v_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.referral_commission_settlements 
        WHERE settlement_number = 'SETTLE-261012-5804'
    ) THEN
        INSERT INTO public.referral_commission_settlements (
            organization_id,
            settlement_number,
            referral_agent_id,
            settlement_date,
            gross_commission_selected,
            adjustment_amount,
            net_paid_amount,
            payment_method,
            transaction_reference,
            paid_by,
            notes,
            status,
            patient_id,
            patient_name,
            patient_code,
            patient_total_bill,
            commission_rate_percent,
            expense_id,
            journal_entry_id,
            created_at
        ) VALUES (
            v_org_id,
            'SETTLE-261012-5804',
            v_agent_id,
            '2026-10-12',
            1000.00,
            0.00,
            1000.00,
            'CASH',
            'commission',
            '44cc709f-5624-4b25-9f5b-5bd3536bdfe2',
            'khushi',
            'PAID',
            v_patient_id,
            'Seuliy Begum',
            'OH-P-010109',
            11600.00,
            30.00,
            v_exp_id,
            v_je_id,
            '2026-10-12 22:53:00.5606+00'
        );
    END IF;
END;
$$;

-- 6c. Create missing journal entry for expense 96e14a37 (SETTLE-20261013-4BCAF9)
DO $$
DECLARE
    v_exp_id UUID := '96e14a37-ccaf-4d82-9563-ccdd696f52b1'::UUID;
    v_agent_id UUID := '99165265-bbb0-41de-a604-df8d0af82450'::UUID;
    v_patient_id UUID := '2b6cc01b-19b3-4dea-bb2a-3a1a208962cf'::UUID;
    v_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
    v_gl_exp UUID;
    v_gl_cash UUID;
    v_je_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.journal_entries WHERE reference_id = v_exp_id
    ) THEN
        SELECT id INTO v_gl_exp FROM public.chart_of_accounts WHERE organization_id = v_org_id AND account_code = '5020' LIMIT 1;
        IF v_gl_exp IS NULL THEN
            SELECT id INTO v_gl_exp FROM public.chart_of_accounts WHERE organization_id = v_org_id AND account_type = 'EXPENSE' LIMIT 1;
        END IF;

        SELECT id INTO v_gl_cash FROM public.chart_of_accounts WHERE organization_id = v_org_id AND account_code = '1010' LIMIT 1;
        IF v_gl_cash IS NULL THEN
            SELECT id INTO v_gl_cash FROM public.chart_of_accounts WHERE organization_id = v_org_id AND account_type = 'ASSET' LIMIT 1;
        END IF;

        IF v_gl_exp IS NOT NULL AND v_gl_cash IS NOT NULL THEN
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
                posted_by,
                created_at
            ) VALUES (
                v_org_id,
                'JE-EXP-20261013-96e14a',
                '2026-10-13',
                'EXPENSE_PAYMENT',
                v_exp_id,
                'Hospital Expense: Referral Partner Payout: mahin khan (REF-10001) (Voucher: VOUCHER-20261013-2C86D1)',
                'DRAFT',
                1000.00,
                1000.00,
                '44cc709f-5624-4b25-9f5b-5bd3536bdfe2',
                '2026-10-13 18:32:48.156691+00'
            ) RETURNING id INTO v_je_id;

            INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
            VALUES (v_je_id, v_gl_exp, 1000.00, 0.00, 'Referral Partner Payout: mahin khan (REF-10001)');

            INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
            VALUES (v_je_id, v_gl_cash, 0.00, 1000.00, 'Disbursement via CASH');

            UPDATE public.journal_entries SET status = 'POSTED' WHERE id = v_je_id;

            UPDATE public.expenses SET journal_entry_id = v_je_id WHERE id = v_exp_id;
            UPDATE public.referral_commission_settlements 
            SET expense_id = v_exp_id, 
                journal_entry_id = v_je_id,
                patient_id = v_patient_id,
                patient_name = 'Seuliy Begum',
                patient_code = 'OH-P-010109',
                patient_total_bill = 11600.00,
                commission_rate_percent = 30.00
            WHERE settlement_number = 'SETTLE-20261013-4BCAF9';
        END IF;
    END IF;
END;
$$;

-- 6d. Update referral_commissions for Seuliy Begum to reflect the 2000.00 paid
UPDATE public.referral_commissions
SET amount_paid = 2000.00,
    amount_pending = GREATEST(0.00, 3468.00 - 2000.00),
    settlement_status = 'PARTIAL',
    paid_at = '2026-10-13 18:32:48+00'
WHERE patient_id = '2b6cc01b-19b3-4dea-bb2a-3a1a208962cf'::UUID
  AND referral_agent_id = '99165265-bbb0-41de-a604-df8d0af82450'::UUID;
