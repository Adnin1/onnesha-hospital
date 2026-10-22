-- Migration 260: cap patient-scoped referral payouts and allocate safely across commission rows.
-- Prevents overpayment and multi-invoice misallocation while preserving discretionary payouts.
BEGIN;

CREATE OR REPLACE FUNCTION public.record_referral_commission_payout_atomic(p_org_id uuid, p_agent_id uuid, p_amount numeric, p_payment_method character varying, p_patient_id uuid DEFAULT NULL::uuid, p_patient_total_bill numeric DEFAULT NULL::numeric, p_commission_rate_percent numeric DEFAULT NULL::numeric, p_transaction_reference character varying DEFAULT NULL::character varying, p_notes character varying DEFAULT NULL::character varying, p_idempotency_key character varying DEFAULT NULL::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_approved_by UUID;
    v_agent RECORD;
    v_patient_name TEXT := NULL;
    v_patient_code VARCHAR := NULL;
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
    v_patient_total_bill NUMERIC(14,2) := COALESCE(p_patient_total_bill, 0.00);
    v_comm_rate NUMERIC(5,2) := COALESCE(p_commission_rate_percent, 0.00);
    v_now TIMESTAMPTZ := NOW();
    v_comm_rec RECORD;
    v_existing_comm_count INTEGER := 0;
    v_patient_commission_due NUMERIC(14,2) := 0.00;
    v_remaining_payout NUMERIC(14,2) := 0.00;
    v_allocate NUMERIC(14,2) := 0.00;
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

    IF v_comm_rate <= 0.00 THEN
        v_comm_rate := COALESCE(v_agent.commission_rate_percent, 10.00);
    END IF;

    -- 4. Validate and Snapshot Patient if provided
    IF p_patient_id IS NOT NULL THEN
        SELECT full_name, patient_code
        INTO v_patient_name, v_patient_code
        FROM public.patients
        WHERE id = p_patient_id
          AND organization_id = p_org_id;

        IF v_patient_name IS NULL THEN
            RAISE EXCEPTION 'Patient not found in active organization.';
        END IF;

        IF v_patient_total_bill <= 0.00 THEN
            SELECT COALESCE(SUM(grand_total), 0.00)
            INTO v_patient_total_bill
            FROM public.invoices
            WHERE patient_id = p_patient_id
              AND organization_id = p_org_id
              AND is_voided = FALSE;

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

    -- 4b. Patient-scoped payout must never exceed aggregate outstanding commission.
    IF p_patient_id IS NOT NULL THEN
        SELECT COUNT(*),
               COALESCE(SUM(GREATEST(COALESCE(commission_amount, 0) - COALESCE(amount_paid, 0), 0)), 0)
        INTO v_existing_comm_count, v_patient_commission_due
        FROM public.referral_commissions
        WHERE organization_id = p_org_id
          AND referral_agent_id = p_agent_id
          AND patient_id = p_patient_id
          AND COALESCE(settlement_status, 'PENDING') NOT IN ('CANCELLED', 'REVERSED');

        IF v_existing_comm_count = 0 THEN
            v_patient_commission_due := ROUND(
                GREATEST(0, v_patient_total_bill * (v_comm_rate / 100.00)),
                2
            );
        END IF;

        IF p_amount > v_patient_commission_due + 0.01 THEN
            RAISE EXCEPTION
                'Payout amount % exceeds outstanding patient referral commission %.',
                p_amount, v_patient_commission_due;
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

    -- 6. Generate Settlement Number
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
        v_patient_name,
        v_patient_code,
        v_patient_total_bill,
        v_comm_rate,
        v_now
    )
    RETURNING id INTO v_settlement_id;

    -- 8. Synchronize Per-Patient Referral Commissions (if applicable)
    IF p_patient_id IS NOT NULL THEN
        v_remaining_payout := p_amount;

        IF v_existing_comm_count > 0 THEN
            FOR v_comm_rec IN
                SELECT id, commission_amount, amount_paid, amount_pending
                FROM public.referral_commissions
                WHERE organization_id = p_org_id
                  AND referral_agent_id = p_agent_id
                  AND patient_id = p_patient_id
                  AND COALESCE(settlement_status, 'PENDING') NOT IN ('CANCELLED', 'REVERSED')
                  AND COALESCE(amount_paid, 0) < COALESCE(commission_amount, 0)
                ORDER BY created_at ASC, id ASC
                FOR UPDATE
            LOOP
                EXIT WHEN v_remaining_payout <= 0;

                v_allocate := LEAST(
                    v_remaining_payout,
                    GREATEST(COALESCE(v_comm_rec.commission_amount, 0) - COALESCE(v_comm_rec.amount_paid, 0), 0)
                );

                IF v_allocate > 0 THEN
                    UPDATE public.referral_commissions
                    SET amount_paid = COALESCE(amount_paid, 0) + v_allocate,
                        amount_pending = GREATEST(0.00, COALESCE(commission_amount, 0) - (COALESCE(amount_paid, 0) + v_allocate)),
                        settlement_status = CASE
                            WHEN (COALESCE(amount_paid, 0) + v_allocate) >= COALESCE(commission_amount, 0) - 0.01 THEN 'PAID'
                            ELSE 'PARTIAL'
                        END,
                        approval_status = 'APPROVED',
                        paid_at = CASE
                            WHEN (COALESCE(amount_paid, 0) + v_allocate) >= COALESCE(commission_amount, 0) - 0.01 THEN v_now
                            ELSE paid_at
                        END,
                        updated_at = v_now
                    WHERE id = v_comm_rec.id;

                    v_remaining_payout := v_remaining_payout - v_allocate;
                END IF;
            END LOOP;

            IF v_remaining_payout > 0.01 THEN
                RAISE EXCEPTION 'Unable to allocate full patient payout safely. Remaining amount: %', v_remaining_payout;
            END IF;
        ELSE
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
                v_patient_commission_due,
                p_amount,
                GREATEST(0.00, v_patient_commission_due - p_amount),
                'APPROVED',
                CASE WHEN p_amount >= v_patient_commission_due - 0.01 THEN 'PAID' ELSE 'PARTIAL' END,
                CASE WHEN p_amount >= v_patient_commission_due - 0.01 THEN v_now ELSE NULL END,
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

    IF v_patient_name IS NOT NULL THEN
        v_target_title := 'Referral Commission: ' || v_agent.full_name || ' (' || v_agent.agent_code || ') - Patient: ' || v_patient_name;
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

        -- Debit Expense
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

        -- Credit Cash/Bank
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

        UPDATE public.journal_entries
        SET status = 'POSTED'
        WHERE id = v_je_id;

        UPDATE public.expenses
        SET journal_entry_id = v_je_id
        WHERE id = v_expense_id;

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
        'patient_name', v_patient_name,
        'patient_code', v_patient_code,
        'patient_total_bill', v_patient_total_bill,
        'commission_rate_percent', v_comm_rate,
        'settlement_status', 'PAID'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;

COMMIT;
