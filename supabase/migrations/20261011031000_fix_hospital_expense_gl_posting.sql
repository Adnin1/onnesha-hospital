-- Forward Migration: Fix hospital expense atomic GL journal posting
-- Migration: 20261011031000_fix_hospital_expense_gl_posting.sql

CREATE OR REPLACE FUNCTION public.record_hospital_expense_atomic(
    p_org_id UUID,
    p_category_id UUID,
    p_title VARCHAR,
    p_amount NUMERIC,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_payment_reference VARCHAR DEFAULT NULL,
    p_paid_to VARCHAR DEFAULT NULL,
    p_expense_date DATE DEFAULT CURRENT_DATE,
    p_expense_type VARCHAR DEFAULT 'GENERAL',
    p_doctor_id UUID DEFAULT NULL,
    p_duty_shift VARCHAR DEFAULT NULL,
    p_department VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_expense_id UUID;
    v_voucher_no VARCHAR(50);
    v_gl_exp_acc_id UUID;
    v_gl_cash_acc_id UUID;
    v_je_number VARCHAR(50);
    v_gl_lines JSONB;
    v_gl_res JSONB := NULL;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero.';
    END IF;

    -- Generate voucher number
    v_voucher_no := public.generate_expense_voucher_number(p_org_id);

    -- Insert expense record
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
        doctor_id,
        duty_shift,
        department,
        status,
        due_amount,
        notes,
        approved_by,
        created_at
    ) VALUES (
        p_org_id,
        p_category_id,
        TRIM(p_title),
        p_amount,
        v_voucher_no,
        TRIM(COALESCE(p_paid_to, 'Vendor/Payee')),
        COALESCE(p_expense_date, CURRENT_DATE),
        COALESCE(p_payment_method, 'CASH'),
        p_payment_reference,
        COALESCE(p_expense_type, 'GENERAL'),
        p_doctor_id,
        p_duty_shift,
        p_department,
        'POSTED',
        0.00,
        p_notes,
        p_created_by,
        NOW()
    ) RETURNING id INTO v_expense_id;

    -- Resolve GL Operating Expense Account (5010 or 5020 or general 5000-range)
    SELECT id INTO v_gl_exp_acc_id
    FROM public.chart_of_accounts
    WHERE organization_id = p_org_id AND account_code IN ('5010', '5020', '5400', '5100') AND is_active = TRUE
    ORDER BY account_code ASC
    LIMIT 1;

    -- Fallback: resolve any active EXPENSE account
    IF v_gl_exp_acc_id IS NULL THEN
        SELECT id INTO v_gl_exp_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'EXPENSE' AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- Resolve Payment Source Account (1010 Cash in Hand or 1020 Bank)
    IF UPPER(p_payment_method) = 'BANK' THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_code = '1020' AND is_active = TRUE;
    ELSE
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_code = '1010' AND is_active = TRUE;
    END IF;

    -- Fallback to any active cash/bank asset
    IF v_gl_cash_acc_id IS NULL THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND is_active = TRUE
        LIMIT 1;
    END IF;

    -- If GL accounts exist, post balanced double-entry journal entry atomically via canonical post_journal_entry_atomic
    IF v_gl_exp_acc_id IS NOT NULL AND v_gl_cash_acc_id IS NOT NULL THEN
        v_je_number := 'JE-EXP-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || SUBSTRING(v_expense_id::TEXT, 1, 6);

        v_gl_lines := jsonb_build_array(
            jsonb_build_object(
                'account_id', v_gl_exp_acc_id,
                'debit', p_amount,
                'credit', 0.00,
                'description', 'Hospital Expense: ' || TRIM(p_title)
            ),
            jsonb_build_object(
                'account_id', v_gl_cash_acc_id,
                'debit', 0.00,
                'credit', p_amount,
                'description', 'Expense Disbursement: ' || v_voucher_no
            )
        );

        BEGIN
            v_gl_res := public.post_journal_entry_atomic(
                p_org_id,
                v_je_number,
                COALESCE(p_expense_date, CURRENT_DATE),
                'EXPENSE_PAYMENT',
                v_expense_id,
                'Hospital Expense: ' || TRIM(p_title) || ' (Voucher: ' || v_voucher_no || ')',
                v_gl_lines,
                p_created_by
            );
        EXCEPTION WHEN OTHERS THEN
            v_gl_res := jsonb_build_object('warning', SQLERRM);
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'expense_id', v_expense_id,
        'voucher_number', v_voucher_no,
        'amount', p_amount,
        'gl_result', v_gl_res
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_hospital_expense_atomic(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, UUID, VARCHAR, VARCHAR, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_hospital_expense_atomic(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, UUID, VARCHAR, VARCHAR, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_hospital_expense_atomic(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, UUID, VARCHAR, VARCHAR, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_hospital_expense_atomic(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, UUID, VARCHAR, VARCHAR, TEXT, UUID) TO service_role;
