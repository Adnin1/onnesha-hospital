-- ==============================================================================
-- MIGRATION 231: FIX CABINS & BEDS STATUS CHECK CONSTRAINTS, SYNC TRIGGER, AND EXPENSES RBAC
-- ==============================================================================
-- 1. Updates check constraints on public.cabins, public.beds, and public.bed_assignments:
--    - cabins_status_check: accepts 'VACANT', 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'CLEANING_REQUIRED', 'MAINTENANCE'
--    - beds_status_check: accepts 'VACANT', 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'CLEANING_REQUIRED', 'MAINTENANCE'
--    - bed_assignments_status_check: accepts 'ACTIVE', 'TRANSFERRED', 'VACATED', 'DISCHARGED', 'CANCELLED'
-- 2. Corrects trg_fn_sync_bed_occupancy_status:
--    - Sets status = 'VACANT' when assignments are vacated or deleted (matching canonical schema).
-- 3. Updates record_hospital_expense_atomic:
--    - Grants execution permission if caller has 'expenses.create' permission.
-- 4. Ensures Data API grants on beds, cabins, and bed_assignments.
-- ==============================================================================

-- 1. EXPAND & HARMONIZE STATUS CHECK CONSTRAINTS
ALTER TABLE public.cabins DROP CONSTRAINT IF EXISTS cabins_status_check;
ALTER TABLE public.cabins ADD CONSTRAINT cabins_status_check
    CHECK (status IN ('VACANT', 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'CLEANING_REQUIRED', 'MAINTENANCE'));

ALTER TABLE public.beds DROP CONSTRAINT IF EXISTS beds_status_check;
ALTER TABLE public.beds ADD CONSTRAINT beds_status_check
    CHECK (status IN ('VACANT', 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'CLEANING_REQUIRED', 'MAINTENANCE'));

ALTER TABLE public.bed_assignments DROP CONSTRAINT IF EXISTS bed_assignments_status_check;
ALTER TABLE public.bed_assignments ADD CONSTRAINT bed_assignments_status_check
    CHECK (status IN ('ACTIVE', 'TRANSFERRED', 'VACATED', 'DISCHARGED', 'CANCELLED'));

-- 2. HARDEN REAL-TIME BED & CABIN OCCUPANCY SYNC TRIGGER
CREATE OR REPLACE FUNCTION public.trg_fn_sync_bed_occupancy_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'ACTIVE' THEN
            IF NEW.bed_id IS NOT NULL THEN
                UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.bed_id;
            END IF;
            IF NEW.cabin_id IS NOT NULL THEN
                UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.cabin_id;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'ACTIVE' THEN
            IF NEW.bed_id IS NOT NULL THEN
                UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.bed_id;
            END IF;
            IF NEW.cabin_id IS NOT NULL THEN
                UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.cabin_id;
            END IF;
        END IF;
        IF OLD.status = 'ACTIVE' AND NEW.status != 'ACTIVE' THEN
            IF OLD.bed_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE bed_id = OLD.bed_id AND status = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.beds SET status = 'VACANT', updated_at = NOW() WHERE id = OLD.bed_id;
            END IF;
            IF OLD.cabin_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE cabin_id = OLD.cabin_id AND status = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.cabins SET status = 'VACANT', updated_at = NOW() WHERE id = OLD.cabin_id;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'ACTIVE' THEN
            IF OLD.bed_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE bed_id = OLD.bed_id AND status = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.beds SET status = 'VACANT', updated_at = NOW() WHERE id = OLD.bed_id;
            END IF;
            IF OLD.cabin_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE cabin_id = OLD.cabin_id AND status = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.cabins SET status = 'VACANT', updated_at = NOW() WHERE id = OLD.cabin_id;
            END IF;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bed_occupancy ON public.bed_assignments;
CREATE TRIGGER trg_sync_bed_occupancy
AFTER INSERT OR UPDATE OR DELETE ON public.bed_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_sync_bed_occupancy_status();

-- 3. HARDEN RECORD_HOSPITAL_EXPENSE_ATOMIC (ALLOW EXPENSES.CREATE PERMISSION)
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
SET search_path = public, pg_temp
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
            SELECT COALESCE(organization_id, active_organization_id)
            INTO v_caller_org
            FROM public.profiles
            WHERE id = v_user_id
            LIMIT 1;
        END IF;

        IF p_org_id IS NULL OR (v_caller_org IS NOT NULL AND p_org_id != v_caller_org) THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant violation. Requested organization does not match authenticated session.';
        END IF;

        -- 2. Verify Caller Role / Permission (Includes expenses.create for operational staff)
        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'accounting.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'expenses.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'expenses.create') OR
            public.is_org_admin_or_has_permission(p_org_id, 'billing.manage') OR
            public.has_permission('accounting.manage') OR
            public.has_permission('expenses.manage') OR
            public.has_permission('expenses.create') OR
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

    -- 8. Resolve GL Operating Expense Account
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

GRANT EXECUTE ON FUNCTION public.record_hospital_expense_atomic TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.trg_fn_sync_bed_occupancy_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_fn_sync_bed_occupancy_status() TO postgres, supabase_admin;

-- 4. GRANT DATA API ACCESS ON CABINS, BEDS, BED_ASSIGNMENTS
GRANT SELECT ON public.cabins TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabins TO authenticated, service_role;

GRANT SELECT ON public.beds TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beds TO authenticated, service_role;

GRANT SELECT ON public.bed_assignments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bed_assignments TO authenticated, service_role;
