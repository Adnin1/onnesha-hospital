-- ==============================================================================
-- MIGRATION 140: Fix Unassigned Record and Harden Episode Billing Overview
-- Version: 20261009280000
-- Description:
--   1. Eliminates PL/pgSQL runtime crash: 'record "v_episode" is not assigned yet'
--      when a patient has no active care episode or is an outpatient.
--   2. Replaces unassigned RECORD with explicit, safe initialized scalar variables.
--   3. Guarantees that unbilled OPD visits, bed assignments, critical care stays,
--      OT surgeries, and extra service charges are cleanly aggregated and returned
--      for ANY patient regardless of whether an active episode exists.
--   4. Re-synchronizes get_episode_billing_preview alias.
-- ==============================================================================

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
    v_waived_items JSONB := '[]'::JSONB;
    v_service_charges JSONB := '[]'::JSONB;
    v_total NUMERIC(14,2) := 0;
    v_previous_invoiced NUMERIC(14,2) := 0;
    v_previous_paid NUMERIC(14,2) := 0;
    v_previous_due NUMERIC(14,2) := 0;
    v_episode_invoiced NUMERIC(14,2) := 0;
    v_episode_paid NUMERIC(14,2) := 0;
    v_episode_due NUMERIC(14,2) := 0;
    v_primary_visit_id UUID := NULL;

    -- Explicit, safely initialized scalar variables to prevent PL/pgSQL unassigned record crashes
    v_ep_id UUID := NULL;
    v_ep_number TEXT := NULL;
    v_ep_status TEXT := NULL;
    v_ep_started_at TIMESTAMPTZ := NULL;
    v_ep_ended_at TIMESTAMPTZ := NULL;
    v_ep_discount NUMERIC(14,2) := 0;
    v_ep_discount_reason TEXT := NULL;
    v_ep_ref_agent_id UUID := NULL;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.view')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
        OR public.is_org_admin_or_has_permission(p_org_id, 'clinical.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'patients.view')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
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

    -- Resolve active episode if not provided
    IF v_episode_id IS NULL THEN
      SELECT id INTO v_episode_id
      FROM public.patient_care_episodes
      WHERE organization_id = p_org_id
        AND patient_id = v_patient_id
        AND status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1;
    END IF;

    -- Safely query episode details into scalar variables
    IF v_episode_id IS NOT NULL THEN
      SELECT
        id, episode_number, status, started_at, ended_at,
        COALESCE(admission_discount_amount, 0), admission_discount_reason, referral_agent_id
      INTO
        v_ep_id, v_ep_number, v_ep_status, v_ep_started_at, v_ep_ended_at,
        v_ep_discount, v_ep_discount_reason, v_ep_ref_agent_id
      FROM public.patient_care_episodes
      WHERE id = v_episode_id
        AND organization_id = p_org_id
        AND patient_id = v_patient_id;
    END IF;

    -- Primary Visit ID
    SELECT pv.id INTO v_primary_visit_id
    FROM public.patient_visits pv
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND (pv.episode_id = v_episode_id OR (v_episode_id IS NULL AND pv.status = 'ACTIVE'))
    ORDER BY pv.admitted_at ASC
    LIMIT 1;

    -- 1. Encounters Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.id,
          'visit_number', pv.visit_number,
          'visit_type', pv.visit_type,
          'department_name', d.name,
          'doctor_name', doc.full_name,
          'admitted_at', pv.admitted_at,
          'discharged_at', pv.discharged_at,
          'status', pv.status
        )
        ORDER BY pv.admitted_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_encounters
    FROM public.patient_visits pv
    LEFT JOIN public.departments d ON d.id = pv.department_id
    LEFT JOIN public.doctors doc ON doc.id = pv.doctor_id
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL OR pv.episode_id IS NULL);

    -- 2. Bed & Cabin Stays Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ba.id,
          'resource_type', CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END,
          'resource_number', COALESCE(c.cabin_number, b.bed_number, '—'),
          'ward_name', w.name,
          'assigned_at', ba.assigned_at,
          'vacated_at', ba.vacated_at,
          'daily_charge', ba.daily_charge,
          'status', ba.status
        )
        ORDER BY ba.assigned_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_resources
    FROM public.bed_assignments ba
    JOIN public.patient_visits pv ON pv.id = ba.visit_id
    LEFT JOIN public.beds b ON b.id = ba.bed_id
    LEFT JOIN public.cabins c ON c.id = ba.cabin_id
    LEFT JOIN public.wards w ON w.id = b.ward_id
    WHERE ba.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL OR pv.episode_id IS NULL);

    -- 3. Critical Care Admissions Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cca.id,
          'unit_name', u.unit_name,
          'unit_type', u.unit_type,
          'bed_number', cca.bed_number,
          'admission_time', cca.admission_time,
          'discharge_time', cca.discharge_time,
          'daily_charge', u.daily_charge,
          'ventilator_required', cca.ventilator_required,
          'status', cca.status
        )
        ORDER BY cca.admission_time ASC
      ),
      '[]'::JSONB
    )
    INTO v_critical
    FROM public.critical_care_admissions cca
    JOIN public.critical_care_units u ON u.id = cca.unit_id
    WHERE cca.organization_id = p_org_id
      AND cca.patient_id = v_patient_id
      AND (cca.episode_id = v_episode_id OR v_episode_id IS NULL OR cca.episode_id IS NULL);

    -- 4. Waived Items Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', bw.id,
          'reference_id', bw.reference_id,
          'service_category', bw.service_category,
          'item_name', bw.item_name,
          'waived_amount', bw.waived_amount,
          'waiver_reason', bw.waiver_reason,
          'waived_by', bw.waived_by,
          'waived_by_name', COALESCE(prof.full_name, 'Authorized Staff'),
          'created_at', bw.created_at,
          'status', bw.status
        )
        ORDER BY bw.created_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_waived_items
    FROM public.episode_service_waivers bw
    LEFT JOIN public.profiles prof ON prof.id = bw.waived_by
    WHERE bw.organization_id = p_org_id
      AND bw.patient_id = v_patient_id
      AND (bw.episode_id = v_episode_id OR v_episode_id IS NULL OR bw.episode_id IS NULL)
      AND bw.status = 'ACTIVE';

    -- 5. Additional Episode Service Charges List
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', esc.id,
          'service_category', esc.service_category,
          'item_name', esc.item_name,
          'description', COALESCE(esc.description, esc.notes),
          'quantity', esc.quantity,
          'unit_price', esc.unit_price,
          'total_amount', COALESCE(esc.total_amount, esc.total_price),
          'status', esc.status,
          'is_billed', COALESCE(esc.is_billed, FALSE),
          'created_at', esc.created_at
        )
        ORDER BY esc.created_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_service_charges
    FROM public.episode_service_charges esc
    WHERE esc.organization_id = p_org_id
      AND esc.patient_id = v_patient_id
      AND (esc.episode_id = v_episode_id OR v_episode_id IS NULL OR esc.episode_id IS NULL);

    -- 6. Invoices Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', inv.id,
          'invoice_number', inv.invoice_number,
          'grand_total', inv.grand_total,
          'paid_amount', inv.paid_amount,
          'due_amount', inv.due_amount,
          'status', inv.status,
          'created_at', inv.created_at,
          'is_episode_settlement', inv.is_episode_settlement
        )
        ORDER BY inv.created_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_invoices
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND (inv.episode_id = v_episode_id OR (v_episode_id IS NULL AND inv.status IN ('PAID', 'PARTIAL', 'UNPAID')))
      AND inv.is_voided = FALSE;

    -- Financial Totals
    SELECT
      COALESCE(SUM(inv.grand_total), 0),
      COALESCE(SUM(inv.paid_amount), 0),
      COALESCE(SUM(inv.due_amount), 0)
    INTO v_previous_invoiced, v_previous_paid, v_previous_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND inv.is_voided = FALSE;

    IF v_episode_id IS NOT NULL THEN
      SELECT
        COALESCE(SUM(inv.grand_total), 0),
        COALESCE(SUM(inv.paid_amount), 0),
        COALESCE(SUM(inv.due_amount), 0)
      INTO v_episode_invoiced, v_episode_paid, v_episode_due
      FROM public.invoices inv
      WHERE inv.organization_id = p_org_id
        AND inv.patient_id = v_patient_id
        AND inv.episode_id = v_episode_id
        AND inv.is_voided = FALSE;
    END IF;

    -- 7. Unbilled Lines Assembly (Reconciled with Partial & Full Waiver Accounting)
    WITH raw_candidates AS (
      -- A. OPD Consultations
      SELECT
        pv.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'CONSULTATION'::TEXT AS category,
        'OPD Consultation - ' || COALESCE(doc.full_name, 'Doctor') AS item_name,
        COALESCE(pv.opd_fee_snapshot, doc.consultation_fee, doc.opd_fee, 500.00)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at,
        ROUND((COALESCE(pv.opd_fee_snapshot, doc.consultation_fee, doc.opd_fee, 500.00) * 1)::NUMERIC, 2) AS gross_price
      FROM public.patient_visits pv
      LEFT JOIN public.doctors doc ON doc.id = pv.doctor_id
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL OR pv.episode_id IS NULL OR pv.status = 'ACTIVE')
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

      -- B. Bed & Cabin Stays
      SELECT
        ba.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END AS category,
        CASE
          WHEN ba.cabin_id IS NOT NULL THEN 'Cabin Stay - ' || COALESCE(c.cabin_number, 'Cabin')
          ELSE 'Bed Stay - ' || COALESCE(b.bed_number, 'Bed') || ' (' || COALESCE(w.name, 'Ward') || ')'
        END AS item_name,
        COALESCE(ba.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of))::NUMERIC AS quantity,
        ba.assigned_at AS started_at,
        ROUND((COALESCE(ba.daily_charge, 0) * public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of)))::NUMERIC, 2) AS gross_price
      FROM public.bed_assignments ba
      JOIN public.patient_visits pv ON pv.id = ba.visit_id
      LEFT JOIN public.beds b ON b.id = ba.bed_id
      LEFT JOIN public.cabins c ON c.id = ba.cabin_id
      LEFT JOIN public.wards w ON w.id = b.ward_id
      WHERE ba.organization_id = p_org_id
        AND pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL OR pv.episode_id IS NULL)
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ba.id
        )

      UNION ALL

      -- C. Critical Care Stays
      SELECT
        cca.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'MISC'::TEXT AS category,
        'Critical Care - ' || COALESCE(u.unit_name, u.unit_type, 'Unit') ||
          ' (Bed ' || cca.bed_number || ')' AS item_name,
        COALESCE(u.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity,
        cca.admission_time AS started_at,
        ROUND((COALESCE(u.daily_charge, 0) * public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of)))::NUMERIC, 2) AS gross_price
      FROM public.critical_care_admissions cca
      JOIN public.critical_care_units u ON u.id = cca.unit_id
      WHERE cca.organization_id = p_org_id
        AND cca.patient_id = v_patient_id
        AND (cca.episode_id = v_episode_id OR v_episode_id IS NULL OR cca.episode_id IS NULL OR cca.status IN ('admitted', 'ACTIVE', 'ADMITTED'))
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = cca.id
        )

      UNION ALL

      -- D. Additional Episode Service Charges
      SELECT
        esc.id AS source_id,
        esc.id AS charge_id,
        TRUE AS is_custom_charge,
        CASE
          WHEN esc.service_category IN ('CONSULTATION', 'LAB', 'XRAY', 'USG', 'ECG', 'PHARMACY', 'BED', 'CABIN', 'OT', 'AMBULANCE', 'MISC') THEN esc.service_category
          WHEN esc.service_category = 'INVESTIGATION' THEN 'LAB'
          WHEN esc.service_category = 'PROCEDURE' THEN 'OT'
          WHEN esc.service_category = 'ROOM' THEN 'BED'
          ELSE 'MISC'
        END::TEXT AS category,
        COALESCE(esc.item_name, esc.description, esc.notes, 'Service Charge') AS item_name,
        COALESCE(esc.unit_price, 0)::NUMERIC AS unit_price,
        COALESCE(esc.quantity, 1)::NUMERIC AS quantity,
        esc.created_at AS started_at,
        ROUND((COALESCE(esc.unit_price, 0) * COALESCE(esc.quantity, 1))::NUMERIC, 2) AS gross_price
      FROM public.episode_service_charges esc
      WHERE esc.organization_id = p_org_id
        AND esc.patient_id = v_patient_id
        AND (esc.episode_id = v_episode_id OR v_episode_id IS NULL OR esc.episode_id IS NULL)
        AND COALESCE(esc.status, 'UNBILLED') IN ('UNBILLED', 'PENDING')
        AND COALESCE(esc.is_billed, FALSE) = FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = esc.id
        )

      UNION ALL

      -- E. Unbilled Operation Theatre (OT) Procedures & Surgeries
      SELECT
        ob.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'OT'::TEXT AS category,
        'OT Surgery - ' || COALESCE(ob.procedure_name, 'Surgical Procedure') AS item_name,
        COALESCE(ob.ot_charge, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        ob.scheduled_start AS started_at,
        ROUND((COALESCE(ob.ot_charge, 0) * 1)::NUMERIC, 2) AS gross_price
      FROM public.ot_bookings ob
      JOIN public.patient_visits pv ON pv.id = ob.visit_id
      WHERE ob.organization_id = p_org_id
        AND pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL OR pv.episode_id IS NULL)
        AND ob.status != 'CANCELLED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ob.id
        )
    ),
    reconciled_lines AS (
      SELECT
        rc.source_id,
        rc.charge_id,
        rc.is_custom_charge,
        rc.category,
        rc.item_name,
        rc.unit_price,
        rc.quantity,
        rc.started_at,
        rc.gross_price,
        COALESCE(bw.total_waived, 0)::NUMERIC AS waived_amount,
        GREATEST(0, rc.gross_price - COALESCE(bw.total_waived, 0))::NUMERIC AS net_price
      FROM raw_candidates rc
      LEFT JOIN (
        SELECT
          reference_id,
          SUM(waived_amount) AS total_waived
        FROM public.episode_service_waivers
        WHERE organization_id = p_org_id
          AND patient_id = v_patient_id
          AND status = 'ACTIVE'
        GROUP BY reference_id
      ) bw ON bw.reference_id = rc.source_id
      WHERE (rc.gross_price - COALESCE(bw.total_waived, 0)) > 0.00
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'reference_id', rl.source_id,
            'charge_id', rl.charge_id,
            'is_custom_charge', rl.is_custom_charge,
            'service_category', rl.category,
            'item_name', rl.item_name,
            'unit_price', rl.unit_price,
            'quantity', rl.quantity,
            'gross_price', rl.gross_price,
            'waived_amount', rl.waived_amount,
            'total_price', rl.net_price,
            'started_at', rl.started_at
          )
          ORDER BY rl.started_at ASC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(rl.net_price), 0)
    INTO v_lines, v_total
    FROM reconciled_lines rl;

    RETURN jsonb_build_object(
      'success', TRUE,
      'episode_id', v_ep_id,
      'episode_number', v_ep_number,
      'patient_id', v_patient_id,
      'primary_visit_id', v_primary_visit_id,
      'lines', v_lines,
      'waived_items', v_waived_items,
      'encounters', v_encounters,
      'resources', v_resources,
      'critical_care', v_critical,
      'service_charges', v_service_charges,
      'invoice_history', v_invoices,
      'invoices', v_invoices,
      'total', v_total,
      'unbilled_total', v_total,
      'admission_discount_amount', COALESCE(v_ep_discount, 0),
      'admission_discount_reason', v_ep_discount_reason,
      'referral_agent_id', v_ep_ref_agent_id,
      'previous_invoiced', v_previous_invoiced,
      'previous_paid', v_previous_paid,
      'previous_due', v_previous_due,
      'episode_invoiced', v_episode_invoiced,
      'episode_paid', v_episode_paid,
      'episode_due', v_episode_due,
      'lifetime_invoiced', v_previous_invoiced,
      'lifetime_paid', v_previous_paid,
      'lifetime_due', v_previous_due,
      'episode', CASE WHEN v_ep_id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_ep_id,
          'episode_number', v_ep_number,
          'status', v_ep_status,
          'started_at', v_ep_started_at,
          'ended_at', v_ep_ended_at,
          'referral_agent_id', v_ep_ref_agent_id
        )
      ELSE NULL END,
      'financial_summary', jsonb_build_object(
        'unbilled_total', v_total,
        'previous_invoiced', v_previous_invoiced,
        'previous_paid', v_previous_paid,
        'previous_due', v_previous_due,
        'episode_invoiced', v_episode_invoiced,
        'episode_paid', v_episode_paid,
        'episode_due', v_episode_due
      )
    );
END;
$$;

COMMENT ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) IS
'Authoritative unbilled episode ledger and financial history overview with safe scalar initialization.';

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- ALIAS get_episode_billing_preview SYNCHRONIZATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_episode_billing_preview(
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
BEGIN
    RETURN public.get_episode_billing_overview(p_org_id, p_patient_id, p_episode_id, p_as_of);
END;
$$;

COMMENT ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) IS
'Direct pass-through alias to get_episode_billing_overview for seamless legacy compatibility.';

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;
