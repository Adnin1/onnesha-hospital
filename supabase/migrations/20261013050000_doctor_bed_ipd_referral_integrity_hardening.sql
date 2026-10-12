-- ==============================================================================
-- MIGRATION 173: Doctor, Bed/Cabin, IPD Charges, and Referral Hardening
-- Version: 20261013050000
-- ==============================================================================

-- 1. Ensure doctors table columns: BMDC reg number and phone nullable
ALTER TABLE public.doctors ALTER COLUMN bmdc_reg_number DROP NOT NULL;
ALTER TABLE public.doctors ALTER COLUMN phone DROP NOT NULL;

-- 2. Ensure cabins table floor_number drops default 'Ground Floor' so blank stays NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'cabins' 
          AND column_name = 'floor_number'
    ) THEN
        ALTER TABLE public.cabins ALTER COLUMN floor_number DROP DEFAULT;
    END IF;
END $$;

-- 3. Add durable snapshot fee columns on patient_visits and patient_care_episodes
ALTER TABLE public.patient_visits 
    ADD COLUMN IF NOT EXISTS admission_fee_snapshot NUMERIC(12,2) DEFAULT 300.00,
    ADD COLUMN IF NOT EXISTS daily_service_rate_snapshot NUMERIC(12,2) DEFAULT 500.00;

ALTER TABLE public.patient_care_episodes 
    ADD COLUMN IF NOT EXISTS admission_fee_snapshot NUMERIC(12,2) DEFAULT 300.00,
    ADD COLUMN IF NOT EXISTS daily_service_rate_snapshot NUMERIC(12,2) DEFAULT 500.00;

-- 4. Update get_episode_billing_overview to read durable snapshot charges
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
      ORDER BY pv.admitted_at DESC
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

      -- 3. IPD Daily Hospital Service Charge (derived from durable snapshot rate)
      SELECT
        ('srv-' || SUBSTRING(ba.id::TEXT, 5))::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'IPD Service Charge (সার্ভিস চার্জ)' AS item_name,
        COALESCE(pv.daily_service_rate_snapshot, 500.00)::NUMERIC AS unit_price,
        public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of))::NUMERIC AS quantity,
        ba.assigned_at AS started_at
      FROM public.bed_assignments ba
      JOIN public.patient_visits pv ON pv.id = ba.visit_id
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
            AND ii.item_name LIKE '%Service Charge%'
            AND (ii.reference_id = ba.id::TEXT OR ii.reference_id = ('srv-' || SUBSTRING(ba.id::TEXT, 5))::TEXT)
        )

      UNION ALL

      -- 4. IPD One-Time Admission Fee (derived from durable snapshot fee)
      SELECT
        ('adm-' || SUBSTRING(pv.id::TEXT, 5))::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'IPD Admission Fee (ভর্তি ফি)' AS item_name,
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
            AND ii.item_name LIKE '%Admission Fee%'
            AND (ii.reference_id = pv.id::TEXT OR ii.reference_id = ('adm-' || SUBSTRING(pv.id::TEXT, 5))::TEXT)
        )

      UNION ALL

      -- 5. Critical care (ICU/CCU) stays
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

      -- 6. Operation Theatre (OT) Procedures & Surgeries
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

      -- 7. Diagnostic tests & imaging (LAB, XRAY, USG, ECG)
      SELECT
        doi.id::TEXT AS source_id,
        CASE 
          WHEN dc.category_code IN ('XRAY', 'USG', 'ECG') THEN dc.category_code
          ELSE 'LAB'
        END::TEXT AS category,
        'Lab Test - ' || COALESCE(dt.test_name, 'Diagnostic Test') AS item_name,
        COALESCE(doi.price, dt.price, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        doi.created_at AS started_at
      FROM public.diagnostic_order_items doi
      JOIN public.diagnostic_orders do_ord ON do_ord.id = doi.order_id
      JOIN public.diagnostic_tests dt ON dt.id = doi.test_id
      LEFT JOIN public.diagnostic_categories dc ON dc.id = dt.category_id
      LEFT JOIN public.patient_visits pv ON pv.id = do_ord.visit_id
      WHERE do_ord.organization_id = p_org_id
        AND do_ord.patient_id = v_patient_id
        AND (
          v_episode_id IS NULL
          OR (do_ord.visit_id IS NOT NULL AND pv.episode_id = v_episode_id)
          OR (do_ord.created_at >= (
            SELECT COALESCE(started_at, '1970-01-01'::TIMESTAMPTZ) FROM public.patient_care_episodes WHERE id = v_episode_id
          ))
        )
        AND do_ord.status != 'CANCELLED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = doi.id::TEXT
        )
    ),
    priced AS (
      SELECT
        source_id,
        category,
        item_name,
        unit_price,
        quantity,
        started_at,
        ROUND((unit_price * quantity)::NUMERIC, 2) AS total_price
      FROM candidates
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'reference_id', source_id,
            'service_category', category,
            'item_name', item_name,
            'unit_price', unit_price,
            'quantity', quantity,
            'total_price', total_price,
            'started_at', started_at
          )
          ORDER BY started_at
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(total_price), 0)
    INTO v_lines, v_total
    FROM priced;

    -- Lifetime patient financial summary
    SELECT
      COALESCE(SUM(i.grand_total), 0),
      COALESCE(SUM(i.paid_amount), 0),
      COALESCE(SUM(i.due_amount), 0)
    INTO v_previous_invoiced, v_previous_paid, v_previous_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = v_patient_id
      AND i.is_voided = FALSE;

    -- Episode-only financial summary
    IF v_episode_id IS NOT NULL THEN
      SELECT
        COALESCE(SUM(i.grand_total), 0),
        COALESCE(SUM(i.paid_amount), 0),
        COALESCE(SUM(i.due_amount), 0)
      INTO v_episode_invoiced, v_episode_paid, v_episode_due
      FROM public.invoices i
      WHERE i.organization_id = p_org_id
        AND i.patient_id = v_patient_id
        AND i.episode_id = v_episode_id
        AND i.is_voided = FALSE;
    ELSE
      v_episode_invoiced := 0;
      v_episode_paid := 0;
      v_episode_due := 0;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'episode_id', v_episode_id,
      'primary_visit_id', v_primary_visit_id,
      'admission_discount_amount', v_admission_discount_amount,
      'admission_discount_reason', v_admission_discount_reason,
      'referral_agent_id', v_referral_agent_id,
      'encounters', v_encounters,
      'resources', v_resources,
      'critical_care', v_critical,
      'lines', v_lines,
      'total', v_total,
      'previous_invoiced', v_previous_invoiced,
      'previous_paid', v_previous_paid,
      'previous_due', v_previous_due,
      'episode_invoiced', v_episode_invoiced,
      'episode_paid', v_episode_paid,
      'episode_due', v_episode_due
    );
END;
$$;

-- 5. Atomic RPC for Discretionary Referral Partner Payout Posting directly to Expenses
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
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_org UUID;
    v_agent RECORD;
    v_settlement_id UUID;
    v_settlement_number VARCHAR(60);
    v_category_id UUID;
    v_voucher_number VARCHAR(60);
    v_expense_id UUID;
    v_new_settled NUMERIC(14,2);
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Authentication & Tenant Authorization Check
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION '401 Unauthorized: Authentication required.';
    END IF;

    SELECT organization_id INTO v_caller_org
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_org IS NOT NULL AND v_caller_org IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION '403 Forbidden: Cross-tenant operation prohibited.';
    END IF;

    -- 2. Validate Amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payout amount must be greater than zero.';
    END IF;

    -- 3. Validate Same-Org Agent
    SELECT id, agent_code, full_name, total_commission_settled
    INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id
      AND organization_id = p_org_id;

    IF v_agent.id IS NULL THEN
        RAISE EXCEPTION 'Referral agent not found in the active organization.';
    END IF;

    -- 4. Idempotency Check (prevent double-clicks within recent minutes)
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        SELECT id, settlement_number
        INTO v_settlement_id, v_settlement_number
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
                'settlement_number', v_settlement_number
            );
        END IF;
    END IF;

    -- 5. Generate Collision-Safe Settlement Number
    v_settlement_number := 'SETTLE-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

    -- 6. Insert Settlement Record
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
        created_at
    ) VALUES (
        p_org_id,
        v_settlement_number,
        p_agent_id,
        v_now,
        p_amount,
        0,
        p_amount,
        COALESCE(p_payment_method, 'CASH'),
        COALESCE(TRIM(p_idempotency_key), TRIM(p_transaction_reference)),
        v_caller_id,
        COALESCE(TRIM(p_notes), 'Discretionary partner payout'),
        v_now
    )
    RETURNING id INTO v_settlement_id;

    -- 7. Update Agent Settled Total
    v_new_settled := COALESCE(v_agent.total_commission_settled, 0) + p_amount;
    UPDATE public.referral_agents
    SET total_commission_settled = v_new_settled,
        updated_at = v_now
    WHERE id = p_agent_id
      AND organization_id = p_org_id;

    -- 8. Resolve or Create Expense Category
    SELECT id INTO v_category_id
    FROM public.expense_categories
    WHERE organization_id = p_org_id
      AND (category_code = 'EXP-MARKETING' OR name ILIKE '%Marketing%' OR name ILIKE '%Referral%')
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
            'Marketing & Referral Commission (মার্কেটিং ও রেফারেল কমিশন)',
            'EXP-MARKETING',
            true
        )
        RETURNING id INTO v_category_id;
    END IF;

    -- 9. Generate Voucher Number and Insert Hospital Expense
    v_voucher_number := 'VOUCHER-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

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
        'Referral Partner Payout: ' || v_agent.full_name || ' (' || v_agent.agent_code || ')',
        p_amount,
        v_voucher_number,
        v_agent.full_name,
        CURRENT_DATE,
        COALESCE(p_payment_method, 'CASH'),
        v_settlement_number,
        'OPERATIONAL',
        'PAID',
        COALESCE(TRIM(p_notes), 'Discretionary referral payout booked to operational hospital expense'),
        v_caller_id,
        v_now
    )
    RETURNING id INTO v_expense_id;

    -- 10. Return Atomic Receipt
    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'settlement_number', v_settlement_number,
        'voucher_number', v_voucher_number,
        'expense_id', v_expense_id,
        'amount', p_amount,
        'agent_name', v_agent.full_name
    );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.record_discretionary_referral_payout_atomic TO authenticated;
