-- ==============================================================================
-- MIGRATION 166: Support Doctor Phone, Cabin Floor Optional, and IPD Admission Charges
-- Version: 20261013024000
-- ==============================================================================

-- 1. Ensure phone column exists on doctors table
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- 2. Make floor_number optional on cabins table with safe default
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'cabins' 
          AND column_name = 'floor_number'
    ) THEN
        ALTER TABLE public.cabins ALTER COLUMN floor_number DROP NOT NULL;
        ALTER TABLE public.cabins ALTER COLUMN floor_number SET DEFAULT 'Ground Floor';
    END IF;
END $$;

-- 3. Upgrade public.get_episode_billing_overview to authoritatively include:
--    - Bed/Cabin stays
--    - IPD Daily Service Charge (500 BDT/day)
--    - IPD One-Time Admission Fee (300 BDT)
--    - OPD Consultations (custom snapshot fee or doctor fee)
--    - Critical Care (ICU/CCU) stays
--    - OT Procedures & Surgeries
--    - Diagnostic tests & imaging (Lab, X-Ray, USG, ECG)
--    - Episode Service Charges

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
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
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
          'opd_fee_snapshot', COALESCE(pv.opd_fee_snapshot, d.opd_fee, 0)
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
            AND ii.reference_id = pv.id
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
            AND ii.reference_id = ba.id
        )

      UNION ALL

      -- 3. IPD Daily Hospital Service Charge (500 BDT/day per billable day)
      SELECT
        ('srv-' || SUBSTRING(ba.id::TEXT, 5))::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'IPD Service Charge (সার্ভিস চার্জ)' AS item_name,
        500.00::NUMERIC AS unit_price,
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
            AND (ii.reference_id = ba.id OR ii.reference_id = ('srv-' || SUBSTRING(ba.id::TEXT, 5))::TEXT)
        )

      UNION ALL

      -- 4. IPD One-Time Admission Fee (300 BDT)
      SELECT
        ('adm-' || SUBSTRING(pv.id::TEXT, 5))::TEXT AS source_id,
        'MISC'::TEXT AS category,
        'IPD Admission Fee (ভর্তি ফি)' AS item_name,
        300.00::NUMERIC AS unit_price,
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
            AND (ii.reference_id = pv.id OR ii.reference_id = ('adm-' || SUBSTRING(pv.id::TEXT, 5))::TEXT)
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

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'invoice_number', i.invoice_number,
          'created_at', i.created_at,
          'grand_total', i.grand_total,
          'paid_amount', i.paid_amount,
          'due_amount', i.due_amount,
          'status', i.status,
          'is_episode_settlement', i.is_episode_settlement,
          'items', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'service_category', ii.service_category,
                  'item_name', ii.item_name,
                  'unit_price', ii.unit_price,
                  'quantity', ii.quantity,
                  'total_price', ii.total_price,
                  'reference_id', ii.reference_id
                )
                ORDER BY ii.created_at
              )
              FROM public.invoice_items ii
              WHERE ii.invoice_id = i.id
            ),
            '[]'::JSONB
          ),
          'payments', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'receipt_number', p.receipt_number,
                  'amount', p.amount,
                  'payment_method', p.payment_method,
                  'payment_date', p.payment_date
                )
                ORDER BY p.payment_date
              )
              FROM public.payments p
              WHERE p.invoice_id = i.id
            ),
            '[]'::JSONB
          )
        )
        ORDER BY i.created_at
      ),
      '[]'::JSONB
    )
    INTO v_invoices
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = v_patient_id
      AND (v_episode_id IS NULL OR i.episode_id = v_episode_id OR (i.episode_id IS NULL AND i.is_voided = FALSE))
      AND i.is_voided = FALSE;

    RETURN jsonb_build_object(
      'success', TRUE,
      'episode_id', v_episode_id,
      'patient_id', v_patient_id,
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

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID,UUID,UUID,TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID,UUID,UUID,TIMESTAMPTZ) TO authenticated;
