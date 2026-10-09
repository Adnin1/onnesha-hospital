-- ==============================================================================
-- MIGRATION 139: Fix Column Reference in get_episode_billing_overview
-- Forward-only migration addressing Supabase db lint 42703 (pv.patient_id relation)
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
    v_episode RECORD;
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

    IF v_episode_id IS NOT NULL THEN
      SELECT
        id, episode_number, status, started_at, ended_at,
        admission_discount_amount, admission_discount_reason, referral_agent_id
      INTO v_episode
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
      AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL);

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
      AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL);

    -- 3. Critical Care Summary
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
      AND (cca.episode_id = v_episode_id OR (cca.episode_id IS NULL AND cca.status IN ('admitted', 'ACTIVE', 'ADMITTED')));

    -- 4. Active Durable Waivers Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'reference_id', w.reference_id,
          'service_category', w.service_category,
          'item_name', w.item_name,
          'waived_amount', w.waived_amount,
          'waiver_reason', w.waiver_reason,
          'waived_by', w.waived_by,
          'waived_by_name', COALESCE(up.full_name, 'Staff Member'),
          'created_at', w.created_at,
          'status', w.status
        )
        ORDER BY w.created_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_waived_items
    FROM public.episode_service_waivers w
    LEFT JOIN public.profiles up ON up.id = w.waived_by
    WHERE w.organization_id = p_org_id
      AND w.patient_id = v_patient_id
      AND (w.episode_id = v_episode_id OR v_episode_id IS NULL)
      AND w.status = 'ACTIVE';

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
      AND (esc.episode_id = v_episode_id OR v_episode_id IS NULL);

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
        AND (pv.episode_id = v_episode_id OR (v_episode_id IS NULL AND pv.status = 'ACTIVE'))
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
        AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL)
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
        AND (cca.episode_id = v_episode_id OR (cca.episode_id IS NULL AND cca.status IN ('admitted', 'ACTIVE', 'ADMITTED')))
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
        AND (esc.episode_id = v_episode_id OR v_episode_id IS NULL)
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
        AND (pv.episode_id = v_episode_id OR v_episode_id IS NULL)
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
    reconciled AS (
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
        COALESCE(w.waived_amount, 0)::NUMERIC AS waived_amount,
        GREATEST(0, ROUND(rc.gross_price - COALESCE(w.waived_amount, 0), 2)) AS net_billable
      FROM raw_candidates rc
      LEFT JOIN public.episode_service_waivers w
        ON w.organization_id = p_org_id
       AND (w.episode_id = v_episode_id OR v_episode_id IS NULL)
       AND w.reference_id = rc.source_id
       AND w.status = 'ACTIVE'
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'reference_id', source_id,
            'charge_id', charge_id,
            'is_custom_charge', is_custom_charge,
            'service_category', category,
            'item_name', item_name,
            'unit_price', unit_price,
            'quantity', quantity,
            'total_price', net_billable,
            'started_at', started_at
          )
          ORDER BY started_at ASC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(net_billable), 0)
    INTO v_lines, v_total
    FROM reconciled
    WHERE net_billable > 0;

    -- Return Consolidated Object with both root keys and nested object for 100% contract satisfaction
    RETURN jsonb_build_object(
      'success', TRUE,
      'episode_id', v_episode_id,
      'episode_number', v_episode.episode_number,
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
      'admission_discount_amount', COALESCE(v_episode.admission_discount_amount, 0),
      'admission_discount_reason', v_episode.admission_discount_reason,
      'referral_agent_id', v_episode.referral_agent_id,
      'previous_invoiced', v_previous_invoiced,
      'previous_paid', v_previous_paid,
      'previous_due', v_previous_due,
      'episode_invoiced', v_episode_invoiced,
      'episode_paid', v_episode_paid,
      'episode_due', v_episode_due,
      'lifetime_invoiced', v_previous_invoiced,
      'lifetime_paid', v_previous_paid,
      'lifetime_due', v_previous_due,
      'episode', CASE WHEN v_episode.id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_episode.id,
          'episode_number', v_episode.episode_number,
          'status', v_episode.status,
          'started_at', v_episode.started_at,
          'ended_at', v_episode.ended_at,
          'referral_agent_id', v_episode.referral_agent_id
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
'Authoritative unbilled episode ledger and financial history overview with dual-contract parity.';

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
