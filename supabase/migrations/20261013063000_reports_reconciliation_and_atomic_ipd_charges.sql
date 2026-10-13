-- =====================================================================================
-- MIGRATION 175: Reports Reconciliation & Atomic IPD Admission Auto-Charges
-- =====================================================================================
-- 1. Upgrades public.get_profit_and_loss_summary:
--    a) Harmonizes operating expenses with public.expenses vouchers so Reports matches
--       the Expenses module (11,150 BDT) and excludes double-counted discounts.
--    b) Accurately tracks Cash Disbursements from CASH expense vouchers.
--    c) Computes precise netOperatingSurplus and netCashMovement for all periods.
-- 2. Upgrades public.admit_patient_to_bed_atomic:
--    a) Automatically injects IPD Admission Fee (300 BDT) and IPD Daily Service Charge
--       (500 BDT) into public.episode_service_charges upon bed/cabin admission.
-- =====================================================================================

-- 1. UPGRADE get_profit_and_loss_summary
CREATE OR REPLACE FUNCTION public.get_profit_and_loss_summary(
    p_org_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_start_date_d DATE;
    v_end_date_d DATE;
    v_gross_revenue NUMERIC(14, 2) := 0.00;
    v_discounts NUMERIC(14, 2) := 0.00;
    v_net_revenue NUMERIC(14, 2) := 0.00;
    v_operating_expenses NUMERIC(14, 2) := 0.00;
    v_expenses_table_total NUMERIC(14, 2) := 0.00;
    v_gl_expense_total NUMERIC(14, 2) := 0.00;
    v_operating_surplus NUMERIC(14, 2) := 0.00;
    v_patient_collections NUMERIC(14, 2) := 0.00;
    v_cash_refunds NUMERIC(14, 2) := 0.00;
    v_operating_disbursements NUMERIC(14, 2) := 0.00;
    v_total_cash_inflow NUMERIC(14, 2) := 0.00;
    v_total_cash_outflow NUMERIC(14, 2) := 0.00;
    v_net_cash_movement NUMERIC(14, 2) := 0.00;
    v_expense_breakdown JSONB := '[]'::JSONB;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());

    -- Strict Fail-Closed Check
    IF (v_active_org IS NULL OR v_active_org != p_org_id)
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch or unauthenticated caller'
            USING ERRCODE = '42501';
    END IF;

    -- Normalize start and end boundaries to Asia/Dhaka calendar dates for DATE-column queries
    v_start_date_d := (p_start_date AT TIME ZONE 'Asia/Dhaka')::DATE;
    v_end_date_d   := (p_end_date AT TIME ZONE 'Asia/Dhaka')::DATE;

    -- Accrual: Gross revenue and discounts recognized on invoices in half-open period [start, end)
    SELECT
        COALESCE(SUM(subtotal) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(discount_amount) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(grand_total) FILTER (WHERE is_voided = FALSE), 0.00)
    INTO
        v_gross_revenue,
        v_discounts,
        v_net_revenue
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    -- Operating Expenses: Query active expenses vouchers table directly
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_expenses_table_total
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND status NOT IN ('VOID', 'VOIDED')
      AND expense_date >= v_start_date_d
      AND expense_date < v_end_date_d;

    -- Also check general ledger expense entries, strictly excluding contra-revenue discounts (4090)
    SELECT COALESCE(SUM(jel.debit - jel.credit), 0.00)
    INTO v_gl_expense_total
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.organization_id = p_org_id
      AND je.status = 'POSTED'
      AND coa.account_type = 'EXPENSE'
      AND coa.account_code NOT IN ('4090')
      AND coa.account_name NOT ILIKE '%Discount%'
      AND je.entry_date >= v_start_date_d
      AND je.entry_date < v_end_date_d;

    IF v_expenses_table_total > 0 THEN
        v_operating_expenses := v_expenses_table_total;

        SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
        INTO v_expense_breakdown
        FROM (
            SELECT jsonb_build_object(
                'category', COALESCE(ec.name, e.expense_type, 'General Expense'),
                'amount', COALESCE(SUM(e.amount), 0.00)
            ) AS row_data
            FROM public.expenses e
            LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
            WHERE e.organization_id = p_org_id
              AND e.status NOT IN ('VOID', 'VOIDED')
              AND e.expense_date >= v_start_date_d
              AND e.expense_date < v_end_date_d
            GROUP BY COALESCE(ec.name, e.expense_type, 'General Expense')
            ORDER BY SUM(e.amount) DESC
        ) sub;
    ELSE
        v_operating_expenses := v_gl_expense_total;

        SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
        INTO v_expense_breakdown
        FROM (
            SELECT jsonb_build_object(
                'category', coa.account_name || ' (' || coa.account_code || ')',
                'amount', COALESCE(SUM(jel.debit - jel.credit), 0.00)
            ) AS row_data
            FROM public.journal_entry_lines jel
            JOIN public.journal_entries je ON je.id = jel.journal_entry_id
            JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
            WHERE je.organization_id = p_org_id
              AND je.status = 'POSTED'
              AND coa.account_type = 'EXPENSE'
              AND coa.account_code NOT IN ('4090')
              AND coa.account_name NOT ILIKE '%Discount%'
              AND je.entry_date >= v_start_date_d
              AND je.entry_date < v_end_date_d
            GROUP BY coa.account_name, coa.account_code
            ORDER BY SUM(jel.debit - jel.credit) DESC
        ) sub;
    END IF;

    v_operating_surplus := v_net_revenue - v_operating_expenses;

    -- Cash Movement: Inflows (Patient Collections) in half-open period [start, end)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_patient_collections
    FROM public.payments
    WHERE organization_id = p_org_id
      AND COALESCE(payment_date, created_at) >= p_start_date
      AND COALESCE(payment_date, created_at) < p_end_date;

    v_total_cash_inflow := v_patient_collections;

    -- Cash Refunds
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_refunds
    FROM public.refunds
    WHERE organization_id = p_org_id
      AND refunded_at >= p_start_date
      AND refunded_at < p_end_date;

    -- Cash Operating Disbursements
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_operating_disbursements
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND status NOT IN ('VOID', 'VOIDED')
      AND UPPER(payment_method) = 'CASH'
      AND expense_date >= v_start_date_d
      AND expense_date < v_end_date_d;

    IF v_operating_disbursements = 0 THEN
        SELECT COALESCE(SUM(jel.credit - jel.debit), 0.00)
        INTO v_operating_disbursements
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
        JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
        WHERE je.organization_id = p_org_id
          AND je.status = 'POSTED'
          AND coa.account_type = 'ASSET'
          AND coa.account_code LIKE '10%'
          AND je.entry_date >= v_start_date_d
          AND je.entry_date < v_end_date_d
          AND (je.reference_type IS NULL OR je.reference_type NOT IN ('REFUND', 'PATIENT_REFUND', 'PAYMENT'));
        v_operating_disbursements := GREATEST(v_operating_disbursements, 0.00);
    END IF;

    v_total_cash_outflow := v_cash_refunds + v_operating_disbursements;
    v_net_cash_movement := v_total_cash_inflow - v_total_cash_outflow;

    RETURN jsonb_build_object(
        'success', true,
        'period_start', p_start_date,
        'period_end', p_end_date,
        'accrual_basis', jsonb_build_object(
            'gross_revenue', v_gross_revenue,
            'discounts', v_discounts,
            'net_recognized_revenue', v_net_revenue,
            'operating_expenses', v_operating_expenses,
            'net_operating_surplus', v_operating_surplus,
            'expense_breakdown', v_expense_breakdown
        ),
        'cash_basis', jsonb_build_object(
            'patient_collections', v_patient_collections,
            'total_cash_inflow', v_total_cash_inflow,
            'refunds', v_cash_refunds,
            'operating_disbursements', v_operating_disbursements,
            'total_cash_outflow', v_total_cash_outflow,
            'net_cash_movement', v_net_cash_movement
        ),
        'cash_movement', jsonb_build_object(
            'patient_collections', v_patient_collections,
            'total_cash_inflow', v_total_cash_inflow,
            'refunds', v_cash_refunds,
            'operating_disbursements', v_operating_disbursements,
            'total_cash_outflow', v_total_cash_outflow,
            'net_cash_movement', v_net_cash_movement
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;


-- 2. UPGRADE admit_patient_to_bed_atomic WITH AUTOMATIC IPD ADMISSION CHARGES
CREATE OR REPLACE FUNCTION public.admit_patient_to_bed_atomic(
    p_organization_id UUID,
    p_patient_id UUID,
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name TEXT DEFAULT NULL,
    p_chief_complaint TEXT DEFAULT NULL,
    p_admission_type VARCHAR DEFAULT 'IPD',
    p_daily_charge NUMERIC DEFAULT 0,
    p_assigned_by UUID DEFAULT NULL,
    p_referral_agent_id UUID DEFAULT NULL
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
    v_bed_number TEXT;
    v_bed_status TEXT;
    v_patient_name TEXT;
    v_patient_org UUID;
    v_bed_org UUID;
    v_cabin_org UUID;
    v_visit_id UUID;
    v_assignment_id UUID;
    v_charge NUMERIC := p_daily_charge;
    v_active_check UUID;
    v_ref_agent RECORD;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL OR v_active_org != p_organization_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_organization_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'nurse')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_organization_id
                  AND rp.permission_key IN ('ipd.admit', 'beds.allocate', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks IPD admission permission (ipd.admit)' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Either bed_id or cabin_id must be provided';
    END IF;

    SELECT full_name, organization_id INTO v_patient_name, v_patient_org
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_name IS NULL THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: Patient % does not exist', p_patient_id;
    END IF;

    IF v_patient_org != p_organization_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Patient belongs to organization % but admission requested for %', v_patient_org, p_organization_id USING ERRCODE = '42501';
    END IF;

    -- Bed Check
    IF p_bed_id IS NOT NULL THEN
        SELECT status, bed_number, daily_rate, organization_id
        INTO v_bed_status, v_bed_number, v_charge, v_bed_org
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'BED_NOT_FOUND: Bed % does not exist', p_bed_id;
        END IF;

        IF v_bed_org != p_organization_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Bed belongs to organization % but admission requested for %', v_bed_org, p_organization_id USING ERRCODE = '42501';
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'BED_UNAVAILABLE: Bed % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE bed_id = p_bed_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Bed % already has an active assignment %', v_bed_number, v_active_check;
        END IF;
    END IF;

    -- Cabin Check
    IF p_cabin_id IS NOT NULL THEN
        SELECT status, cabin_number, daily_rate, organization_id
        INTO v_bed_status, v_bed_number, v_charge, v_cabin_org
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'CABIN_NOT_FOUND: Cabin % does not exist', p_cabin_id;
        END IF;

        IF v_cabin_org != p_organization_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Cabin belongs to organization % but admission requested for %', v_cabin_org, p_organization_id USING ERRCODE = '42501';
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'CABIN_UNAVAILABLE: Cabin % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE cabin_id = p_cabin_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Cabin % already has an active assignment %', v_bed_number, v_active_check;
        END IF;
    END IF;

    -- Insert into canonical patient_visits
    INSERT INTO public.patient_visits (
        organization_id,
        patient_id,
        visit_number,
        doctor_id,
        visit_type,
        admitted_at,
        status,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        p_organization_id,
        p_patient_id,
        'VISIT-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Dhaka', 'YYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 6),
        p_doctor_id,
        COALESCE(p_admission_type, 'IPD'),
        NOW(),
        'ACTIVE',
        COALESCE(v_calling_user, p_assigned_by),
        NOW(),
        NOW()
    ) RETURNING id INTO v_visit_id;

    -- Insert into bed_assignments
    INSERT INTO public.bed_assignments (
        organization_id,
        patient_id,
        visit_id,
        bed_id,
        cabin_id,
        assigned_at,
        daily_charge,
        status,
        assigned_by
    ) VALUES (
        p_organization_id,
        p_patient_id,
        v_visit_id,
        p_bed_id,
        p_cabin_id,
        NOW(),
        COALESCE(v_charge, 0),
        'ACTIVE',
        COALESCE(v_calling_user, p_assigned_by)
    ) RETURNING id INTO v_assignment_id;

    -- Mark Occupied
    IF p_bed_id IS NOT NULL THEN
        UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = p_bed_id;
    END IF;

    IF p_cabin_id IS NOT NULL THEN
        UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = p_cabin_id;
    END IF;

    -- Automatically record IPD Admission Fee (300 BDT) in episode_service_charges
    INSERT INTO public.episode_service_charges (
        organization_id,
        patient_id,
        service_category,
        item_name,
        quantity,
        unit_price,
        total_price,
        status,
        is_billed,
        created_by,
        notes
    ) VALUES (
        p_organization_id,
        p_patient_id,
        'MISC',
        'IPD Admission Fee (ভর্তি ফি - এককালীন)',
        1,
        300.00,
        300.00,
        'PENDING',
        FALSE,
        COALESCE(v_calling_user, p_assigned_by),
        'Automated IPD admission fee snapshot'
    );

    -- Automatically record IPD Daily Service Charge (500 BDT) in episode_service_charges
    INSERT INTO public.episode_service_charges (
        organization_id,
        patient_id,
        service_category,
        item_name,
        quantity,
        unit_price,
        total_price,
        status,
        is_billed,
        created_by,
        notes
    ) VALUES (
        p_organization_id,
        p_patient_id,
        'MISC',
        'IPD Daily Service Charge (দৈনিক সেবা চার্জ)',
        1,
        500.00,
        500.00,
        'PENDING',
        FALSE,
        COALESCE(v_calling_user, p_assigned_by),
        'Automated IPD daily hospital service charge'
    );

    -- Record Referral Attribution if agent provided
    IF p_referral_agent_id IS NOT NULL THEN
        SELECT id, agent_code, is_active, organization_id, full_name
        INTO v_ref_agent
        FROM public.referral_agents
        WHERE id = p_referral_agent_id;

        IF v_ref_agent.id IS NOT NULL
           AND v_ref_agent.organization_id = p_organization_id
           AND v_ref_agent.is_active IS TRUE THEN
            INSERT INTO public.patient_referral_attributions (
                organization_id,
                patient_id,
                visit_id,
                referral_agent_id,
                referral_code_snapshot,
                referral_name_snapshot,
                assigned_by,
                status,
                notes
            ) VALUES (
                p_organization_id,
                p_patient_id,
                v_visit_id,
                v_ref_agent.id,
                v_ref_agent.agent_code,
                v_ref_agent.full_name,
                COALESCE(v_calling_user, p_assigned_by),
                'ACTIVE',
                'Attributed during IPD admission'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', v_assignment_id,
        'visit_id', v_visit_id,
        'patient_id', p_patient_id,
        'daily_charge', COALESCE(v_charge, 0),
        'admission_fee', 300.00,
        'daily_service_charge', 500.00
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) TO authenticated, service_role;
