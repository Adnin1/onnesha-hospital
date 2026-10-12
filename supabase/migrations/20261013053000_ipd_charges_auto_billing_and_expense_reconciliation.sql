-- =====================================================================================
-- MIGRATION 174: IPD Charges Auto-Billing Overview & Expense Analytics Reconciliation
-- =====================================================================================
-- 1. Upgrade public.get_expense_analytics_summary to authoritatively return both
--    modern keys (total_expense_amount, expense_count, cash_paid_total, bank_paid_total)
--    and legacy keys (total_range, total_today, total_month) with zero key mismatches.
-- 2. Upgrade public.get_episode_billing_overview to authoritatively include:
--    a) IPD Daily Hospital Service Charge directly from public.patient_visits (visit_type = 'IPD')
--       without requiring an active bed_assignments row.
--    b) IPD One-Time Admission Fee (ভর্তি ফি - এককালীন) snapshot.
--    c) Unbilled items from public.episode_service_charges.
-- 3. One-time data reconciliation syncing public.referral_agents.total_commission_settled
--    with public.referral_commission_settlements and public.expenses.
-- =====================================================================================

-- 1. UPGRADE get_expense_analytics_summary
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
    v_total_utility NUMERIC(14, 2) := 0.00;
    v_cash_paid NUMERIC(14, 2) := 0.00;
    v_bank_paid NUMERIC(14, 2) := 0.00;
    v_expense_count INTEGER := 0;
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

    -- Selected range total & count
    SELECT COALESCE(SUM(amount), 0.00), COUNT(*)
    INTO v_total_range, v_expense_count
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND (p_start_date IS NULL OR expense_date >= v_start)
      AND (p_end_date IS NULL OR expense_date <= v_end)
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
      AND (p_start_date IS NULL OR expense_date >= v_start)
      AND (p_end_date IS NULL OR expense_date <= v_end)
      AND status NOT IN ('VOID', 'VOIDED')
      AND (doctor_id IS NOT NULL OR expense_type IN ('DOCTOR_HONORARIUM', 'DUTY_FEE', 'MONTHLY_RETAINER', 'SURGEON_FEE', 'ANAESTHETIST_FEE'));

    -- OT & Surgery expenses in range
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_ot
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND (p_start_date IS NULL OR expense_date >= v_start)
      AND (p_end_date IS NULL OR expense_date <= v_end)
      AND status NOT IN ('VOID', 'VOIDED')
      AND expense_type IN ('OT_MEDICINE', 'OT_CONSUMABLE', 'SURGERY_EXPENSE');

    -- Utilities & bills
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_utility
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND (p_start_date IS NULL OR expense_date >= v_start)
      AND (p_end_date IS NULL OR expense_date <= v_end)
      AND status NOT IN ('VOID', 'VOIDED')
      AND expense_type IN ('UTILITY', 'ELECTRICITY', 'INTERNET', 'GENERATOR_FUEL', 'WATER');

    -- Cash paid total
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_paid
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND (p_start_date IS NULL OR expense_date >= v_start)
      AND (p_end_date IS NULL OR expense_date <= v_end)
      AND status NOT IN ('VOID', 'VOIDED')
      AND UPPER(payment_method) = 'CASH';

    -- Bank & MFS paid total
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_bank_paid
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND (p_start_date IS NULL OR expense_date >= v_start)
      AND (p_end_date IS NULL OR expense_date <= v_end)
      AND status NOT IN ('VOID', 'VOIDED')
      AND UPPER(payment_method) != 'CASH';

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
            AND (p_start_date IS NULL OR e.expense_date >= v_start)
            AND (p_end_date IS NULL OR e.expense_date <= v_end)
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
          AND (p_start_date IS NULL OR e.expense_date >= v_start)
          AND (p_end_date IS NULL OR e.expense_date <= v_end)
        ORDER BY e.created_at DESC
        LIMIT 15
    ) exp_row;

    RETURN jsonb_build_object(
        'total_expense_amount', v_total_range,
        'expense_count', v_expense_count,
        'doctor_expense_total', v_total_doctor,
        'ot_expense_total', v_total_ot,
        'utility_expense_total', v_total_utility,
        'cash_paid_total', v_cash_paid,
        'bank_paid_total', v_bank_paid,
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

REVOKE ALL ON FUNCTION public.get_expense_analytics_summary(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expense_analytics_summary(UUID, DATE, DATE) TO authenticated, service_role;

-- 2. UPGRADE get_episode_billing_overview
CREATE OR REPLACE FUNCTION public.get_episode_billing_overview(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID DEFAULT NULL,
    p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode_id UUID := p_episode_id;
    v_patient_id UUID := p_patient_id;
    v_lines JSONB := '[]'::JSONB;
    v_encounters JSONB := '[]'::JSONB;
    v_resources JSONB := '[]'::JSONB;
    v_critical JSONB := '[]'::JSONB;
    v_invoices JSONB := '[]'::JSONB;
    v_total NUMERIC(14,2) := 0;
    v_previous_invoiced NUMERIC(14,2) := 0;
    v_previous_paid NUMERIC(14,2) := 0;
    v_previous_due NUMERIC(14,2) := 0;
    v_episode_invoiced NUMERIC(14,2) := 0;
    v_episode_paid NUMERIC(14,2) := 0;
    v_episode_due NUMERIC(14,2) := 0;
    v_primary_visit_id UUID := NULL;
    v_admission_discount_amount NUMERIC(14,2) := 0;
    v_admission_discount_reason TEXT := NULL;
    v_referral_agent_id UUID := NULL;
    v_caller_org UUID;
BEGIN
    SELECT organization_id INTO v_caller_org
    FROM public.profiles
    WHERE id = auth.uid();

    IF auth.uid() IS NULL OR (v_caller_org IS NOT NULL AND v_caller_org IS DISTINCT FROM p_org_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.patients
      WHERE id = v_patient_id
        AND organization_id = p_org_id
        AND is_deleted = FALSE
    ) THEN
      RAISE EXCEPTION 'PATIENT_NOT_FOUND';
    END IF;

    IF v_episode_id IS NULL THEN
      SELECT id, admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_episode_id, v_admission_discount_amount, v_admission_discount_reason, v_referral_agent_id
      FROM public.patient_care_episodes
      WHERE organization_id = p_org_id
        AND patient_id = v_patient_id
        AND status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1;
    ELSE
      SELECT admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_admission_discount_amount, v_admission_discount_reason, v_referral_agent_id
      FROM public.patient_care_episodes
      WHERE id = v_episode_id;
    END IF;

    IF v_episode_id IS NOT NULL THEN
      SELECT pv.id
        INTO v_primary_visit_id
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND pv.episode_id = v_episode_id
      ORDER BY CASE WHEN pv.visit_type = 'IPD' THEN 0 ELSE 1 END, pv.admitted_at
      LIMIT 1;
    ELSE
      SELECT pv.id
        INTO v_primary_visit_id
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
      ORDER BY CASE WHEN pv.visit_type = 'IPD' THEN 0 ELSE 1 END, pv.admitted_at DESC
      LIMIT 1;
    END IF;

    -- Encounters history
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.id,
          'visit_number', pv.visit_number,
          'visit_type', pv.visit_type,
          'status', pv.status,
          'admitted_at', pv.admitted_at,
          'discharged_at', pv.discharged_at,
          'doctor_name', d.full_name,
          'department_name', dep.name,
          'chief_complaint', pv.chief_complaint,
          'opd_fee_snapshot', COALESCE(pv.opd_fee_snapshot, d.opd_fee, 0),
          'admission_fee_snapshot', COALESCE(pv.admission_fee_snapshot, 300.00),
          'daily_service_rate_snapshot', COALESCE(pv.daily_service_rate_snapshot, 500.00)
        )
        ORDER BY pv.admitted_at
      ),
      '[]'::JSONB
    )
    INTO v_encounters
    FROM public.patient_visits pv
    LEFT JOIN public.doctors d ON d.id = pv.doctor_id
    LEFT JOIN public.departments dep ON dep.id = pv.department_id
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id);

    -- Bed/cabin allocation history
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ba.id,
          'resource_type', CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END,
          'resource_number', COALESCE(c.cabin_number, b.bed_number),
          'ward_name', w.name,
          'assigned_at', ba.assigned_at,
          'vacated_at', ba.vacated_at,
          'status', ba.status,
          'daily_charge', ba.daily_charge
        )
        ORDER BY ba.assigned_at
      ),
      '[]'::JSONB
    )
    INTO v_resources
    FROM public.bed_assignments ba
    JOIN public.patient_visits pv
      ON pv.id = ba.visit_id
    LEFT JOIN public.beds b
      ON b.id = ba.bed_id
    LEFT JOIN public.wards w
      ON w.id = b.ward_id
    LEFT JOIN public.cabins c
      ON c.id = ba.cabin_id
    WHERE ba.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id);

    -- Critical care history
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cca.id,
          'unit_name', u.unit_name,
          'unit_type', u.unit_type,
          'bed_number', cca.bed_number,
          'admission_time', cca.admission_time,
          'discharge_time', cca.discharge_time,
          'status', cca.status,
          'daily_charge', u.daily_charge,
          'ventilator_required', cca.ventilator_required,
          'doctor_name', d.full_name,
          'initial_diagnosis', cca.initial_diagnosis
        )
        ORDER BY cca.admission_time
      ),
      '[]'::JSONB
    )
    INTO v_critical
    FROM public.critical_care_admissions cca
    LEFT JOIN public.critical_care_units u ON u.id = cca.unit_id
    LEFT JOIN public.doctors d ON d.id = cca.admitting_doctor_id
    WHERE cca.organization_id = p_org_id
      AND cca.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR cca.episode_id = v_episode_id);

    -- Billable candidate items:
    WITH candidates AS (
      -- 1. OPD Consultations
      SELECT
        pv.id AS source_id,
        'CONSULTATION'::TEXT AS category,
        'OPD Consultation - ' || COALESCE(d.full_name, 'Consultant') AS item_name,
        COALESCE(pv.opd_fee_snapshot, d.opd_fee, 500.00)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      LEFT JOIN public.doctors d ON d.id = pv.doctor_id
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id)
        AND pv.visit_type = 'OPD'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = pv.id::TEXT
        )

      UNION ALL

      -- 2. Bed & Cabin stays
      SELECT
        ba.id AS source_id,
        CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END::TEXT AS category,
        CASE
          WHEN ba.cabin_id IS NOT NULL THEN 'Cabin Stay - ' || COALESCE(c.cabin_number, 'Cabin')
          ELSE 'Bed Stay - ' || COALESCE(b.bed_number, 'Bed')
        END AS item_name,
        COALESCE(ba.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of))::NUMERIC AS quantity,
        ba.assigned_at AS started_at
      FROM public.bed_assignments ba
      JOIN public.patient_visits pv ON pv.id = ba.visit_id
      LEFT JOIN public.beds b ON b.id = ba.bed_id
      LEFT JOIN public.wards w ON w.id = b.ward_id
      LEFT JOIN public.cabins c ON c.id = ba.cabin_id
      WHERE ba.organization_id = p_org_id
        AND pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ba.id::TEXT
        )

      UNION ALL

      -- 3. IPD Daily Hospital Service Charge (authoritatively derived directly from IPD visit)
      SELECT
        ('srv-' || SUBSTRING(pv.id::TEXT, 5))::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'IPD Daily Service Charge (দৈনিক সেবা চার্জ)' AS item_name,
        COALESCE(pv.daily_service_rate_snapshot, 500.00)::NUMERIC AS unit_price,
        public.ohms_billable_days(pv.admitted_at, COALESCE(pv.discharged_at, p_as_of))::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id)
        AND pv.visit_type = 'IPD'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND (ii.item_name ILIKE '%Service Charge%' OR ii.item_name ILIKE '%সেবা চার্জ%')
            AND (ii.reference_id = pv.id::TEXT OR ii.reference_id = ('srv-' || SUBSTRING(pv.id::TEXT, 5))::TEXT)
        )

      UNION ALL

      -- 4. IPD One-Time Admission Fee (authoritatively derived from IPD visit snapshot)
      SELECT
        ('adm-' || SUBSTRING(pv.id::TEXT, 5))::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'IPD Admission Fee (ভর্তি ফি - এককালীন)' AS item_name,
        COALESCE(pv.admission_fee_snapshot, 300.00)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR pv.episode_id = v_episode_id)
        AND pv.visit_type = 'IPD'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND (ii.item_name ILIKE '%Admission Fee%' OR ii.item_name ILIKE '%ভর্তি ফি%')
            AND (ii.reference_id = pv.id::TEXT OR ii.reference_id = ('adm-' || SUBSTRING(pv.id::TEXT, 5))::TEXT)
        )

      UNION ALL

      -- 5. Unbilled Episode Service Charges
      SELECT
        esc.id::TEXT AS source_id,
        COALESCE(esc.service_category, 'MISC')::TEXT AS category,
        esc.item_name::TEXT AS item_name,
        COALESCE(esc.unit_price, 0)::NUMERIC AS unit_price,
        COALESCE(esc.quantity, 1)::NUMERIC AS quantity,
        esc.created_at AS started_at
      FROM public.episode_service_charges esc
      WHERE esc.organization_id = p_org_id
        AND esc.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR esc.episode_id = v_episode_id)
        AND esc.status = 'UNBILLED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = esc.id::TEXT
        )

      UNION ALL

      -- 6. Critical care (ICU/CCU) stays
      SELECT
        cca.id::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'Critical Care - ' || COALESCE(u.unit_name, u.unit_type, 'Unit') ||
          ' (' || cca.bed_number || ')' AS item_name,
        COALESCE(u.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity,
        cca.admission_time AS started_at
      FROM public.critical_care_admissions cca
      JOIN public.critical_care_units u ON u.id = cca.unit_id
      WHERE cca.organization_id = p_org_id
        AND cca.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR cca.episode_id = v_episode_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = cca.id::TEXT
        )

      UNION ALL

      -- 7. Operation Theatre (OT) Procedures & Surgeries
      SELECT
        ob.id::TEXT AS source_id,
        'OT'::TEXT AS category,
        'OT Surgery - ' || COALESCE(ob.procedure_name, 'Surgical Procedure') AS item_name,
        COALESCE(ob.charges, 6000.00)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        ob.scheduled_start AS started_at
      FROM public.ot_bookings ob
      WHERE ob.organization_id = p_org_id
        AND ob.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR ob.patient_id = v_patient_id)
        AND ob.status != 'cancelled'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ob.id::TEXT
        )

      UNION ALL

      -- 8. Diagnostic Test Orders (Lab, X-Ray, USG, ECG)
      SELECT
        doi.id::TEXT AS source_id,
        COALESCE(d_cat.code, doi.service_category, 'LAB')::TEXT AS category,
        doi.test_name::TEXT AS item_name,
        COALESCE(doi.price, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        d_ord.order_date AS started_at
      FROM public.diagnostic_order_items doi
      JOIN public.diagnostic_orders d_ord ON d_ord.id = doi.order_id
      LEFT JOIN public.lab_tests lt ON lt.id = doi.test_id
      LEFT JOIN public.diagnostic_categories d_cat ON d_cat.id = lt.category_id
      WHERE d_ord.organization_id = p_org_id
        AND d_ord.patient_id = v_patient_id
        AND (v_episode_id IS NULL OR d_ord.episode_id = v_episode_id)
        AND d_ord.status != 'CANCELLED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = doi.id::TEXT
        )
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'reference_id', c.source_id,
            'charge_id', NULL,
            'is_custom_charge', FALSE,
            'service_category', c.category,
            'item_name', c.item_name,
            'unit_price', c.unit_price,
            'quantity', c.quantity,
            'total_price', (c.unit_price * c.quantity),
            'started_at', c.started_at
          )
          ORDER BY c.started_at ASC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(c.unit_price * c.quantity), 0)
    INTO v_lines, v_total
    FROM candidates c;

    -- Invoices history
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', inv.id,
            'invoice_number', inv.invoice_number,
            'created_at', inv.created_at,
            'total_amount', inv.total_amount,
            'paid_amount', inv.paid_amount,
            'due_amount', inv.due_amount,
            'status', inv.status
          )
          ORDER BY inv.created_at DESC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(inv.total_amount), 0),
      COALESCE(SUM(inv.paid_amount), 0),
      COALESCE(SUM(inv.due_amount), 0)
    INTO v_invoices, v_previous_invoiced, v_previous_paid, v_previous_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND inv.is_voided = FALSE;

    v_episode_invoiced := v_total;
    v_episode_paid := v_previous_paid;
    v_episode_due := GREATEST(0, v_total - v_previous_paid);

    RETURN jsonb_build_object(
      'success', TRUE,
      'episode_id', v_episode_id,
      'primary_visit_id', v_primary_visit_id,
      'lines', v_lines,
      'encounters', v_encounters,
      'resources', v_resources,
      'critical_care', v_critical,
      'invoice_history', v_invoices,
      'total', v_total,
      'admission_discount_amount', v_admission_discount_amount,
      'admission_discount_reason', v_admission_discount_reason,
      'referral_agent_id', v_referral_agent_id,
      'previous_invoiced', v_previous_invoiced,
      'previous_paid', v_previous_paid,
      'previous_due', v_previous_due,
      'episode_invoiced', v_episode_invoiced,
      'episode_paid', v_episode_paid,
      'episode_due', v_episode_due
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated;

-- 3. RECONCILE REFERRAL AGENT SETTLED AMOUNTS WITH SETTLEMENTS & EXPENSES
UPDATE public.referral_agents ra
SET total_commission_settled = GREATEST(
  ra.total_commission_settled,
  COALESCE((
    SELECT SUM(rcs.net_paid_amount)
    FROM public.referral_commission_settlements rcs
    WHERE rcs.referral_agent_id = ra.id
      AND rcs.organization_id = ra.organization_id
  ), 0),
  COALESCE((
    SELECT SUM(e.amount)
    FROM public.expenses e
    WHERE e.organization_id = ra.organization_id
      AND e.status NOT IN ('VOID', 'VOIDED')
      AND (e.title ILIKE '%' || ra.agent_code || '%' OR e.paid_to = ra.full_name)
  ), 0)
);

COMMENT ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) IS
'MIGRATION 174: Authoritative billing overview with automatic IPD admission fee (300) and daily service rate (500) derived directly from IPD visits.';
