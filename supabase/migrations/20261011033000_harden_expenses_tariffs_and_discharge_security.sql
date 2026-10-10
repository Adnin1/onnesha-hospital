-- =====================================================================================
-- FORWARD MIGRATION: 20261011033000_harden_expenses_tariffs_and_discharge_security.sql
-- Rigorous Multi-Tenant Security, RBAC Grants, Atomic GL Reversal & Transactional IPD Discharge
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. HARDEN EXPENSE CREATION & GL ATOMICITY (record_hospital_expense_atomic)
-- -------------------------------------------------------------------------------------

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
    v_caller_org UUID;
    v_user_id UUID;
    v_expense_id UUID;
    v_voucher_no VARCHAR(50);
    v_gl_exp_acc_id UUID;
    v_gl_cash_acc_id UUID;
    v_je_number VARCHAR(50);
    v_gl_lines JSONB;
    v_gl_res JSONB;
BEGIN
    -- 1. Resolve & Enforce Tenant Isolation
    v_user_id := auth.uid();
    v_caller_org := public.get_current_org_id();

    IF v_user_id IS NOT NULL THEN
        IF v_caller_org IS NULL THEN
            RAISE EXCEPTION '401 Unauthorized: Caller has no active organization profile.';
        END IF;
        IF p_org_id IS NULL OR p_org_id != v_caller_org THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant violation. Requested organization does not match authenticated session.';
        END IF;

        -- 2. Verify Caller Role / Permission
        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'accounting.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'expenses.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'billing.manage') OR
            public.has_permission('accounting.manage') OR
            public.has_permission('billing.manage')
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks permissions to disburse or record hospital expenses.';
        END IF;
    END IF;

    -- 3. Input Validation
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero.';
    END IF;

    IF TRIM(COALESCE(p_title, '')) = '' THEN
        RAISE EXCEPTION 'Expense title/purpose is mandatory.';
    END IF;

    -- 4. Verify Active Category Belongs to Organization
    IF NOT EXISTS (
        SELECT 1 FROM public.expense_categories
        WHERE id = p_category_id AND organization_id = p_org_id AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Category does not exist or is inactive for organization %.', p_org_id;
    END IF;

    -- 5. Verify Doctor (if provided)
    IF p_doctor_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.doctors
            WHERE id = p_doctor_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Referenced doctor does not belong to organization %.', p_org_id;
        END IF;
    END IF;

    -- 6. Generate Voucher Number Atomically
    v_voucher_no := public.generate_expense_voucher_number(p_org_id);

    -- 7. Insert Expense Record
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
        COALESCE(v_user_id, p_created_by),
        NOW()
    ) RETURNING id INTO v_expense_id;

    -- 8. Resolve GL Operating Expense Account (5010 Operational or 5020 or general 5000-range)
    SELECT id INTO v_gl_exp_acc_id
    FROM public.chart_of_accounts
    WHERE organization_id = p_org_id AND account_code IN ('5010', '5020', '5400', '5100') AND is_active = TRUE
    ORDER BY account_code ASC
    LIMIT 1;

    IF v_gl_exp_acc_id IS NULL THEN
        SELECT id INTO v_gl_exp_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'EXPENSE' AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_gl_exp_acc_id IS NULL THEN
        RAISE EXCEPTION 'Chart of Accounts missing active Operating Expense account (5010/5020/5400) for organization %.', p_org_id;
    END IF;

    -- 9. Resolve Payment Source Account (1010 Cash, 1020 Bank, 1030 Mobile Banking)
    IF UPPER(p_payment_method) IN ('BANK', 'CHEQUE', 'ONLINE_TRANSFER') THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_code = '1020' AND is_active = TRUE;
    ELSIF UPPER(p_payment_method) IN ('BKASH', 'NAGAD', 'ROCKET', 'MOBILE_BANKING') THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_code IN ('1030', '1010') AND is_active = TRUE
        ORDER BY account_code DESC
        LIMIT 1;
    ELSE
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_code = '1010' AND is_active = TRUE;
    END IF;

    IF v_gl_cash_acc_id IS NULL THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_gl_cash_acc_id IS NULL THEN
        RAISE EXCEPTION 'Chart of Accounts missing active Cash/Bank Asset account (1010/1020) for organization %.', p_org_id;
    END IF;

    -- 10. Post Balanced Double-Entry Journal Entry Atomically
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
            'description', 'Disbursement Voucher: ' || v_voucher_no
        )
    );

    -- Strict Atomicity: Failure here causes transaction rollback!
    v_gl_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        COALESCE(p_expense_date, CURRENT_DATE),
        'EXPENSE_PAYMENT',
        v_expense_id,
        'Hospital Expense: ' || TRIM(p_title) || ' (Voucher: ' || v_voucher_no || ')',
        v_gl_lines,
        COALESCE(v_user_id, p_created_by)
    );

    IF v_gl_res IS NULL OR (v_gl_res->>'success')::BOOLEAN IS NOT TRUE THEN
        RAISE EXCEPTION 'General Ledger journal posting failed: %', COALESCE(v_gl_res->>'error', 'Unknown GL failure');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'expense_id', v_expense_id,
        'voucher_number', v_voucher_no,
        'amount', p_amount,
        'journal_entry_id', v_gl_res->>'journal_entry_id',
        'journal_entry_number', v_je_number
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 2. ATOMIC EXPENSE VOID & GL REVERSAL (void_hospital_expense_atomic)
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.void_hospital_expense_atomic(
    p_org_id UUID,
    p_expense_id UUID,
    p_void_reason TEXT,
    p_voided_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_org UUID;
    v_user_id UUID;
    v_exp RECORD;
    v_je RECORD;
    v_rev_je_number VARCHAR(50);
    v_rev_lines JSONB := '[]'::jsonb;
    v_line RECORD;
    v_rev_res JSONB := NULL;
BEGIN
    -- 1. Tenant & Permission Guard
    v_user_id := auth.uid();
    v_caller_org := public.get_current_org_id();

    IF v_user_id IS NOT NULL THEN
        IF v_caller_org IS NULL OR p_org_id != v_caller_org THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant access violation in voiding expense.';
        END IF;

        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'accounting.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'expenses.manage') OR
            public.has_permission('accounting.manage')
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Only authorized accounting administrators may void posted hospital expenses.';
        END IF;
    END IF;

    IF TRIM(COALESCE(p_void_reason, '')) = '' THEN
        RAISE EXCEPTION 'A valid, non-empty reason is mandatory to void an expense voucher.';
    END IF;

    -- 2. Lock & Retrieve Expense Row
    SELECT id, organization_id, title, amount, voucher_number, status
    INTO v_exp
    FROM public.expenses
    WHERE id = p_expense_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_exp.id IS NULL THEN
        RAISE EXCEPTION 'Expense record % not found in organization %.', p_expense_id, p_org_id;
    END IF;

    IF v_exp.status IN ('VOID', 'VOIDED') THEN
        RAISE EXCEPTION 'Expense voucher % has already been voided.', v_exp.voucher_number;
    END IF;

    -- 3. Retrieve Posted Journal Entry (if any)
    SELECT id, entry_number
    INTO v_je
    FROM public.journal_entries
    WHERE organization_id = p_org_id AND reference_id = p_expense_id AND status = 'POSTED'
    ORDER BY created_at DESC
    LIMIT 1;

    -- 4. Reverse Journal Entry Atomically
    IF v_je.id IS NOT NULL THEN
        v_rev_je_number := 'REV-' || v_je.entry_number;

        -- Invert lines: swap debits and credits
        FOR v_line IN
            SELECT account_id, debit, credit, description
            FROM public.journal_lines
            WHERE journal_entry_id = v_je.id
        LOOP
            v_rev_lines := v_rev_lines || jsonb_build_object(
                'account_id', v_line.account_id,
                'debit', v_line.credit,   -- Inverted
                'credit', v_line.debit,   -- Inverted
                'description', 'Reversal: ' || COALESCE(v_line.description, 'Void of ' || v_exp.voucher_number)
            );
        END LOOP;

        IF jsonb_array_length(v_rev_lines) > 0 THEN
            v_rev_res := public.post_journal_entry_atomic(
                p_org_id,
                v_rev_je_number,
                CURRENT_DATE,
                'EXPENSE_VOID_REVERSAL',
                p_expense_id,
                'Void Reversal for Voucher ' || v_exp.voucher_number || ' - ' || TRIM(p_void_reason),
                v_rev_lines,
                COALESCE(v_user_id, p_voided_by)
            );

            IF v_rev_res IS NULL OR (v_rev_res->>'success')::BOOLEAN IS NOT TRUE THEN
                RAISE EXCEPTION 'Failed to post reversal journal entry: %', COALESCE(v_rev_res->>'error', 'Unknown error');
            END IF;

            -- Mark original journal entry as VOID
            UPDATE public.journal_entries
            SET status = 'VOID'
            WHERE id = v_je.id;
        END IF;
    END IF;

    -- 5. Mark Expense as CANONICAL 'VOIDED'
    UPDATE public.expenses
    SET status = 'VOIDED',
        void_reason = TRIM(p_void_reason),
        updated_at = NOW()
    WHERE id = p_expense_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'expense_id', p_expense_id,
        'voucher_number', v_exp.voucher_number,
        'status', 'VOIDED',
        'reversal_journal_entry', v_rev_res
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 3. HARDEN EXPENSE ANALYTICS (get_expense_analytics_summary)
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_expense_analytics_summary(
    p_org_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_org UUID;
    v_user_id UUID;
    v_start DATE := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
    v_end DATE := COALESCE(p_end_date, CURRENT_DATE);
    v_total_today NUMERIC(14, 2) := 0.00;
    v_total_range NUMERIC(14, 2) := 0.00;
    v_total_month NUMERIC(14, 2) := 0.00;
    v_total_doctor NUMERIC(14, 2) := 0.00;
    v_total_ot NUMERIC(14, 2) := 0.00;
    v_category_breakdown JSONB;
    v_recent_expenses JSONB;
BEGIN
    -- Enforce Tenant Isolation
    v_user_id := auth.uid();
    v_caller_org := public.get_current_org_id();

    IF v_user_id IS NOT NULL THEN
        IF v_caller_org IS NULL OR p_org_id != v_caller_org THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant access violation in expense analytics.';
        END IF;
    END IF;

    -- Today's total (excluding VOID and VOIDED)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_today
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date = CURRENT_DATE
      AND status NOT IN ('VOID', 'VOIDED');

    -- Selected range total
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_range
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date BETWEEN v_start AND v_end
      AND status NOT IN ('VOID', 'VOIDED');

    -- Current month total
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_month
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date >= DATE_TRUNC('month', CURRENT_DATE)::DATE
      AND expense_date <= CURRENT_DATE
      AND status NOT IN ('VOID', 'VOIDED');

    -- Doctor payments in range
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_doctor
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date BETWEEN v_start AND v_end
      AND status NOT IN ('VOID', 'VOIDED')
      AND (doctor_id IS NOT NULL OR expense_type IN ('DOCTOR_HONORARIUM', 'DUTY_FEE', 'MONTHLY_RETAINER', 'SURGEON_FEE', 'ANAESTHETIST_FEE'));

    -- OT & Surgery expenses in range
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_ot
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date BETWEEN v_start AND v_end
      AND status NOT IN ('VOID', 'VOIDED')
      AND expense_type IN ('OT_MEDICINE', 'OT_CONSUMABLE', 'SURGERY_EXPENSE');

    -- Category-wise breakdown
    SELECT COALESCE(jsonb_agg(cat_row), '[]'::jsonb)
    INTO v_category_breakdown
    FROM (
        SELECT 
            ec.name AS category_name,
            COALESCE(ec.category_code, 'GENERAL') AS category_code,
            COUNT(e.id) AS expense_count,
            COALESCE(SUM(e.amount), 0.00) AS total_amount
        FROM public.expense_categories ec
        LEFT JOIN public.expenses e 
            ON e.category_id = ec.id 
            AND e.organization_id = p_org_id
            AND e.expense_date BETWEEN v_start AND v_end
            AND e.status NOT IN ('VOID', 'VOIDED')
        WHERE ec.organization_id = p_org_id AND ec.is_active = TRUE
        GROUP BY ec.id, ec.name, ec.category_code
        ORDER BY total_amount DESC
    ) cat_row;

    -- Recent 15 expenses in range
    SELECT COALESCE(jsonb_agg(exp_row), '[]'::jsonb)
    INTO v_recent_expenses
    FROM (
        SELECT 
            e.id,
            e.voucher_number,
            e.title,
            e.amount,
            e.paid_to,
            e.expense_date,
            e.payment_method,
            e.expense_type,
            e.status,
            ec.name AS category_name,
            d.full_name AS doctor_name
        FROM public.expenses e
        LEFT JOIN public.expense_categories ec ON e.category_id = ec.id
        LEFT JOIN public.doctors d ON e.doctor_id = d.id
        WHERE e.organization_id = p_org_id
          AND e.expense_date BETWEEN v_start AND v_end
        ORDER BY e.created_at DESC
        LIMIT 15
    ) exp_row;

    RETURN jsonb_build_object(
        'total_today', v_total_today,
        'total_range', v_total_range,
        'total_month', v_total_month,
        'total_doctor', v_total_doctor,
        'total_ot', v_total_ot,
        'start_date', v_start,
        'end_date', v_end,
        'category_breakdown', v_category_breakdown,
        'recent_expenses', v_recent_expenses
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 4. HARDEN HOSPITAL SERVICE TARIFFS (Permissions & Secure RPC)
-- -------------------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.hospital_service_tariffs FROM authenticated;
GRANT SELECT ON public.hospital_service_tariffs TO authenticated;
GRANT ALL ON public.hospital_service_tariffs TO service_role;

DROP POLICY IF EXISTS rls_hospital_service_tariffs ON public.hospital_service_tariffs;
DROP POLICY IF EXISTS rls_hospital_service_tariffs_select ON public.hospital_service_tariffs;
DROP POLICY IF EXISTS rls_hospital_service_tariffs_modify ON public.hospital_service_tariffs;

CREATE POLICY rls_hospital_service_tariffs_select ON public.hospital_service_tariffs
FOR SELECT TO authenticated, service_role
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY rls_hospital_service_tariffs_modify ON public.hospital_service_tariffs
FOR ALL TO authenticated, service_role
USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND (
        public.is_org_admin_or_has_permission(organization_id, 'billing.manage') OR
        public.is_org_admin_or_has_permission(organization_id, 'settings.manage') OR
        public.has_permission('billing.manage')
    )
)
WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND (
        public.is_org_admin_or_has_permission(organization_id, 'billing.manage') OR
        public.is_org_admin_or_has_permission(organization_id, 'settings.manage') OR
        public.has_permission('billing.manage')
    )
);

CREATE OR REPLACE FUNCTION public.save_hospital_service_tariff_atomic(
    p_org_id UUID,
    p_id UUID DEFAULT NULL,
    p_service_code VARCHAR DEFAULT NULL,
    p_service_name VARCHAR DEFAULT NULL,
    p_category VARCHAR DEFAULT 'CONSULTATION',
    p_price NUMERIC DEFAULT 0.00,
    p_unit VARCHAR DEFAULT 'Per Service',
    p_description TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_org UUID;
    v_user_id UUID;
    v_tariff_id UUID;
BEGIN
    v_user_id := auth.uid();
    v_caller_org := public.get_current_org_id();

    IF v_user_id IS NOT NULL THEN
        IF v_caller_org IS NULL OR p_org_id != v_caller_org THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant tariff access violation.';
        END IF;

        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'billing.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'settings.manage') OR
            public.has_permission('billing.manage')
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Insufficient permissions to modify hospital tariffs.';
        END IF;
    END IF;

    IF p_price < 0 THEN
        RAISE EXCEPTION 'Tariff price cannot be negative.';
    END IF;

    IF TRIM(COALESCE(p_service_name, '')) = '' THEN
        RAISE EXCEPTION 'Service name is mandatory.';
    END IF;

    IF p_id IS NOT NULL THEN
        UPDATE public.hospital_service_tariffs
        SET service_code = COALESCE(p_service_code, service_code),
            service_name = TRIM(p_service_name),
            category = COALESCE(p_category, category),
            price = p_price,
            unit = COALESCE(p_unit, unit),
            description = p_description,
            is_active = p_is_active,
            updated_at = NOW()
        WHERE id = p_id AND organization_id = p_org_id
        RETURNING id INTO v_tariff_id;

        IF v_tariff_id IS NULL THEN
            RAISE EXCEPTION 'Tariff record % not found in organization %.', p_id, p_org_id;
        END IF;
    ELSE
        INSERT INTO public.hospital_service_tariffs (
            organization_id,
            service_code,
            service_name,
            category,
            price,
            unit,
            description,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            p_org_id,
            COALESCE(p_service_code, 'SRV-' || UPPER(SUBSTRING(p_category FROM 1 FOR 3)) || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0')),
            TRIM(p_service_name),
            COALESCE(p_category, 'CONSULTATION'),
            p_price,
            COALESCE(p_unit, 'Per Service'),
            p_description,
            COALESCE(p_is_active, TRUE),
            NOW(),
            NOW()
        ) RETURNING id INTO v_tariff_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'id', v_tariff_id,
        'service_name', p_service_name,
        'price', p_price
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 5. HARDEN EXPENSE CATEGORIES (Permissions & Safe Archive)
-- -------------------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON public.expense_categories FROM authenticated;
GRANT SELECT ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

DROP POLICY IF EXISTS rls_expense_categories ON public.expense_categories;
DROP POLICY IF EXISTS rls_expense_categories_select ON public.expense_categories;
DROP POLICY IF EXISTS rls_expense_categories_manage ON public.expense_categories;

CREATE POLICY rls_expense_categories_select ON public.expense_categories
FOR SELECT TO authenticated, service_role
USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY rls_expense_categories_manage ON public.expense_categories
FOR ALL TO authenticated, service_role
USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND (
        public.is_org_admin_or_has_permission(organization_id, 'accounting.manage') OR
        public.is_org_admin_or_has_permission(organization_id, 'expenses.manage') OR
        public.has_permission('accounting.manage')
    )
)
WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND (
        public.is_org_admin_or_has_permission(organization_id, 'accounting.manage') OR
        public.is_org_admin_or_has_permission(organization_id, 'expenses.manage') OR
        public.has_permission('accounting.manage')
    )
);

-- -------------------------------------------------------------------------------------
-- 6. STRICT MULTI-TENANT IPD DISCHARGE RLS & ATOMIC WORKFLOW
-- -------------------------------------------------------------------------------------

-- Backfill legacy rows: assign organization_id from visit
UPDATE public.discharge_summaries ds
SET organization_id = pv.organization_id
FROM public.patient_visits pv
WHERE ds.visit_id = pv.id AND ds.organization_id IS NULL;

-- Remove broad OR organization_id IS NULL policy
DROP POLICY IF EXISTS rls_discharge_summaries ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_select ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_insert ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_update ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_delete ON public.discharge_summaries;

CREATE POLICY rls_discharge_summaries_strict ON public.discharge_summaries
FOR ALL TO authenticated, service_role
USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

-- ATOMIC DISCHARGE PROCEDURE
CREATE OR REPLACE FUNCTION public.complete_ipd_discharge_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_discharge_type VARCHAR,
    p_final_diagnosis TEXT,
    p_consultant_doctor_id UUID DEFAULT NULL,
    p_consultant_name VARCHAR DEFAULT NULL,
    p_bmdc_reg_number VARCHAR DEFAULT NULL,
    p_consultant_designation VARCHAR DEFAULT NULL,
    p_hospital_course TEXT DEFAULT NULL,
    p_condition_at_discharge VARCHAR DEFAULT NULL,
    p_discharge_advice TEXT DEFAULT NULL,
    p_followup_instructions TEXT DEFAULT NULL,
    p_presenting_features JSONB DEFAULT '[]'::jsonb,
    p_investigations_summary TEXT DEFAULT NULL,
    p_operation_name VARCHAR DEFAULT NULL,
    p_operation_date DATE DEFAULT NULL,
    p_operation_time VARCHAR DEFAULT NULL,
    p_surgeon_name VARCHAR DEFAULT NULL,
    p_assistant_surgeons VARCHAR DEFAULT NULL,
    p_anaesthetist_name VARCHAR DEFAULT NULL,
    p_anaesthesia_type VARCHAR DEFAULT NULL,
    p_operative_findings TEXT DEFAULT NULL,
    p_baby_sex VARCHAR DEFAULT NULL,
    p_baby_weight_kg NUMERIC DEFAULT NULL,
    p_baby_apgar_score VARCHAR DEFAULT NULL,
    p_baby_notes TEXT DEFAULT NULL,
    p_medications_schedule JSONB DEFAULT '[]'::jsonb,
    p_stitch_removal_date DATE DEFAULT NULL,
    p_followup_date DATE DEFAULT NULL,
    p_prepared_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_org UUID;
    v_user_id UUID;
    v_visit RECORD;
    v_doc RECORD;
    v_summary_id UUID;
    v_bed_assign RECORD;
    v_final_consultant_name VARCHAR(150);
    v_final_bmdc VARCHAR(50);
    v_final_designation VARCHAR(150);
BEGIN
    v_user_id := auth.uid();
    v_caller_org := public.get_current_org_id();

    -- 1. Tenant Check
    IF v_user_id IS NOT NULL THEN
        IF v_caller_org IS NULL OR p_org_id != v_caller_org THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant access violation in patient discharge.';
        END IF;

        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'ipd.discharge') OR
            public.is_org_admin_or_has_permission(p_org_id, 'ipd.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'doctors.manage') OR
            public.has_permission('ipd.discharge') OR
            public.has_permission('ipd.manage')
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Insufficient clinical permissions to discharge inpatient.';
        END IF;
    END IF;

    -- 2. Lock & Validate Visit
    SELECT id, organization_id, patient_id, status
    INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Inpatient admission record % not found in organization %.', p_visit_id, p_org_id;
    END IF;

    IF v_visit.status = 'DISCHARGED' THEN
        RAISE EXCEPTION 'Patient has already been discharged from admission encounter %.', p_visit_id;
    END IF;

    -- 3. Validate Mandatory Clinical Fields
    IF TRIM(COALESCE(p_final_diagnosis, '')) = '' OR LENGTH(TRIM(p_final_diagnosis)) < 2 THEN
        RAISE EXCEPTION 'Final clinical diagnosis is mandatory for discharge approval.';
    END IF;

    -- 4. Validate & Bind Consultant Doctor Details
    v_final_consultant_name := TRIM(COALESCE(p_consultant_name, ''));
    v_final_bmdc := TRIM(COALESCE(p_bmdc_reg_number, ''));
    v_final_designation := TRIM(COALESCE(p_consultant_designation, ''));

    IF p_consultant_doctor_id IS NOT NULL THEN
        SELECT id, full_name, bmdc_reg_number, specialization, designation
        INTO v_doc
        FROM public.doctors
        WHERE id = p_consultant_doctor_id AND organization_id = p_org_id;

        IF v_doc.id IS NOT NULL THEN
            IF v_final_consultant_name = '' THEN
                v_final_consultant_name := v_doc.full_name;
            END IF;
            IF v_final_bmdc = '' THEN
                v_final_bmdc := COALESCE(v_doc.bmdc_reg_number, '');
            END IF;
            IF v_final_designation = '' THEN
                v_final_designation := COALESCE(v_doc.designation || ', ' || v_doc.specialization, v_doc.designation);
            END IF;
        END IF;
    END IF;

    IF v_final_consultant_name = '' THEN
        RAISE EXCEPTION 'Consultant Doctor name is mandatory on discharge certificate.';
    END IF;

    -- 5. Insert Discharge Summary
    INSERT INTO public.discharge_summaries (
        organization_id,
        visit_id,
        discharge_type,
        final_diagnosis,
        hospital_course,
        condition_at_discharge,
        discharge_advice,
        followup_instructions,
        consultant_doctor_id,
        consultant_name,
        consultant_designation,
        bmdc_reg_number,
        presenting_features,
        investigations_summary,
        operation_name,
        operation_date,
        operation_time,
        surgeon_name,
        assistant_surgeons,
        anaesthetist_name,
        anaesthesia_type,
        operative_findings,
        baby_sex,
        baby_weight_kg,
        baby_apgar_score,
        baby_notes,
        medications_schedule,
        stitch_removal_date,
        followup_date,
        prepared_by,
        approved_by,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_visit_id,
        COALESCE(p_discharge_type, 'NORMAL'),
        TRIM(p_final_diagnosis),
        TRIM(p_hospital_course),
        TRIM(p_condition_at_discharge),
        TRIM(p_discharge_advice),
        TRIM(p_followup_instructions),
        p_consultant_doctor_id,
        v_final_consultant_name,
        v_final_designation,
        v_final_bmdc,
        COALESCE(p_presenting_features, '[]'::jsonb),
        TRIM(p_investigations_summary),
        TRIM(p_operation_name),
        p_operation_date,
        TRIM(p_operation_time),
        TRIM(p_surgeon_name),
        TRIM(p_assistant_surgeons),
        TRIM(p_anaesthetist_name),
        TRIM(p_anaesthesia_type),
        TRIM(p_operative_findings),
        p_baby_sex,
        p_baby_weight_kg,
        p_baby_apgar_score,
        TRIM(p_baby_notes),
        COALESCE(p_medications_schedule, '[]'::jsonb),
        p_stitch_removal_date,
        p_followup_date,
        COALESCE(v_user_id, p_prepared_by),
        COALESCE(v_user_id, p_prepared_by),
        NOW(),
        NOW()
    ) RETURNING id INTO v_summary_id;

    -- 6. Transition Visit to DISCHARGED
    UPDATE public.patient_visits
    SET status = 'DISCHARGED',
        discharged_at = NOW(),
        updated_at = NOW()
    WHERE id = p_visit_id AND organization_id = p_org_id;

    -- 7. Atomically Release Bed / Cabin Assignment
    FOR v_bed_assign IN
        SELECT id, bed_id, cabin_id
        FROM public.bed_assignments
        WHERE visit_id = p_visit_id AND organization_id = p_org_id AND status = 'ACTIVE'
    LOOP
        UPDATE public.bed_assignments
        SET status = 'DISCHARGED',
            discharged_at = NOW(),
            updated_at = NOW()
        WHERE id = v_bed_assign.id;

        IF v_bed_assign.bed_id IS NOT NULL THEN
            UPDATE public.beds
            SET status = 'VACANT', updated_at = NOW()
            WHERE id = v_bed_assign.bed_id AND organization_id = p_org_id;
        END IF;

        IF v_bed_assign.cabin_id IS NOT NULL THEN
            UPDATE public.cabins
            SET status = 'VACANT', updated_at = NOW()
            WHERE id = v_bed_assign.cabin_id AND organization_id = p_org_id;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'summary_id', v_summary_id,
        'visit_id', p_visit_id,
        'status', 'DISCHARGED',
        'consultant_name', v_final_consultant_name,
        'bmdc_reg_number', v_final_bmdc
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 7. EXECUTE GRANTS
-- -------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.record_hospital_expense_atomic FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_hospital_expense_atomic FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_expense_analytics_summary FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_hospital_service_tariff_atomic FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_ipd_discharge_atomic FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_hospital_expense_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_hospital_expense_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_expense_analytics_summary TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_hospital_service_tariff_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_ipd_discharge_atomic TO authenticated, service_role;
