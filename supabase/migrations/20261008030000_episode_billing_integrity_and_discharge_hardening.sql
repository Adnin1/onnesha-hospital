-- ==============================================================================
-- OHMS Migration 117: Episode billing integrity + complete discharge hardening
-- Date: 2026-10-08
-- Purpose:
--   * Snapshot OPD fee at encounter time so later doctor-price changes cannot
--     alter historical billing.
--   * Close OPD visits when an episode is discharged.
--   * Expose a complete episode history/financial overview to billing staff.
--   * Make final settlement idempotent while still allowing later supplemental
--     charges before discharge.
--   * Refuse discharge while ANY episode charge remains unbilled or due.
-- ==============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Financial price snapshot for OPD encounters
-- ---------------------------------------------------------------------------
ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS opd_fee_snapshot NUMERIC(12,2);

UPDATE public.patient_visits pv
SET opd_fee_snapshot = COALESCE(d.opd_fee, 0)
FROM public.doctors d
WHERE pv.visit_type = 'OPD'
  AND pv.doctor_id = d.id
  AND pv.opd_fee_snapshot IS NULL;

CREATE OR REPLACE FUNCTION public.snapshot_opd_fee_before_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.visit_type = 'OPD' AND NEW.opd_fee_snapshot IS NULL AND NEW.doctor_id IS NOT NULL THEN
    SELECT COALESCE(d.opd_fee, 0)
      INTO NEW.opd_fee_snapshot
    FROM public.doctors d
    WHERE d.id = NEW.doctor_id
      AND d.organization_id = NEW.organization_id;
  END IF;

  IF NEW.visit_type = 'OPD' AND NEW.opd_fee_snapshot IS NULL THEN
    NEW.opd_fee_snapshot := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_opd_fee_before_visit ON public.patient_visits;
CREATE TRIGGER trg_snapshot_opd_fee_before_visit
BEFORE INSERT OR UPDATE OF doctor_id, visit_type, organization_id
ON public.patient_visits
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_opd_fee_before_visit();

-- ---------------------------------------------------------------------------
-- 2. Automatically close active OPD visits when their care episode closes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_opd_visits_when_episode_closes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'CLOSED' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.patient_visits
    SET status = 'COMPLETED',
        discharged_at = COALESCE(NEW.ended_at, NOW()),
        updated_at = NOW()
    WHERE organization_id = NEW.organization_id
      AND episode_id = NEW.id
      AND visit_type = 'OPD'
      AND status = 'ACTIVE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_opd_visits_when_episode_closes ON public.patient_care_episodes;
CREATE TRIGGER trg_close_opd_visits_when_episode_closes
AFTER UPDATE OF status
ON public.patient_care_episodes
FOR EACH ROW
EXECUTE FUNCTION public.close_opd_visits_when_episode_closes();

-- ---------------------------------------------------------------------------
-- 3. Complete billing/clinical episode overview.
-- ---------------------------------------------------------------------------
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
      SELECT id
        INTO v_episode_id
      FROM public.patient_care_episodes
      WHERE organization_id = p_org_id
        AND patient_id = v_patient_id
        AND status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1;
    END IF;

    IF v_episode_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', TRUE,
        'episode_id', NULL,
        'patient_id', v_patient_id,
        'primary_visit_id', NULL,
        'lines', '[]'::JSONB,
        'encounters', '[]'::JSONB,
        'resources', '[]'::JSONB,
        'critical_care', '[]'::JSONB,
        'invoice_history', '[]'::JSONB,
        'total', 0,
        'previous_invoiced', 0,
        'previous_paid', 0,
        'previous_due', 0,
        'episode_invoiced', 0,
        'episode_paid', 0,
        'episode_due', 0
      );
    END IF;

    SELECT pv.id
      INTO v_primary_visit_id
    FROM public.patient_visits pv
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id
    ORDER BY CASE WHEN pv.visit_type = 'IPD' THEN 0 ELSE 1 END, pv.admitted_at
    LIMIT 1;

    -- Current episode clinical encounter history.
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
      AND pv.episode_id = v_episode_id;

    -- Bed/cabin allocation history.
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
      AND pv.episode_id = v_episode_id;

    -- Critical care history.
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
      AND cca.episode_id = v_episode_id;

    -- Billable current episode items. Source-record presence in a non-void
    -- invoice marks the item as already billed.
    WITH candidates AS (
      SELECT
        pv.id AS source_id,
        'CONSULTATION'::TEXT AS category,
        'OPD Consultation - ' || COALESCE(d.full_name, 'Consultant') AS item_name,
        COALESCE(pv.opd_fee_snapshot, d.opd_fee, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      LEFT JOIN public.doctors d ON d.id = pv.doctor_id
      WHERE pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND pv.episode_id = v_episode_id
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
        AND pv.episode_id = v_episode_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ba.id
        )

      UNION ALL

      SELECT
        cca.id AS source_id,
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
        AND cca.episode_id = v_episode_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = cca.id
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

    -- Lifetime patient financial summary (non-void invoices).
    SELECT
      COALESCE(SUM(i.grand_total), 0),
      COALESCE(SUM(i.paid_amount), 0),
      COALESCE(SUM(i.due_amount), 0)
    INTO v_previous_invoiced, v_previous_paid, v_previous_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = v_patient_id
      AND i.is_voided = FALSE;

    -- Episode-only financial summary.
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
      AND (i.episode_id = v_episode_id OR (i.episode_id IS NULL AND i.is_voided = FALSE))
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
      'previous_invoiced', v_previous_invoiced,
      'previous_paid', v_previous_paid,
      'previous_due', v_previous_due,
      'episode_invoiced', v_episode_invoiced,
      'episode_paid', v_episode_paid,
      'episode_due', v_episode_due
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Safer final settlement function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_episode_settlement_invoice_atomic_v2(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_cashier_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode RECORD;
    v_existing UUID;
    v_existing_due NUMERIC := 0;
    v_preview JSONB;
    v_items JSONB;
    v_total NUMERIC := 0;
    v_result JSONB;
    v_invoice_id UUID;
    v_primary_visit UUID;
    v_is_first BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT id, patient_id, status
      INTO v_episode
    FROM public.patient_care_episodes
    WHERE id = p_episode_id
      AND organization_id = p_org_id
      AND patient_id = p_patient_id
    FOR UPDATE;

    IF v_episode.id IS NULL THEN RAISE EXCEPTION 'EPISODE_NOT_FOUND'; END IF;
    IF v_episode.status <> 'ACTIVE' THEN RAISE EXCEPTION 'EPISODE_NOT_ACTIVE'; END IF;

    v_preview := public.get_episode_billing_overview(p_org_id, p_patient_id, p_episode_id, NOW());
    v_items := COALESCE(v_preview->'lines', '[]'::JSONB);
    v_total := COALESCE((v_preview->>'total')::NUMERIC, 0);
    v_primary_visit := NULLIF(v_preview->>'primary_visit_id', '')::UUID;

    SELECT i.id, i.due_amount
      INTO v_existing, v_existing_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = p_patient_id
      AND i.episode_id = p_episode_id
      AND i.is_episode_settlement = TRUE
      AND i.is_voided = FALSE
    ORDER BY i.created_at DESC
    LIMIT 1;

    IF v_total <= 0 THEN
      IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', TRUE,
          'invoice_id', v_existing,
          'invoice_number', (SELECT invoice_number FROM public.invoices WHERE id = v_existing),
          'grand_total', (SELECT grand_total FROM public.invoices WHERE id = v_existing),
          'paid_amount', (SELECT paid_amount FROM public.invoices WHERE id = v_existing),
          'due_amount', v_existing_due,
          'status', (SELECT status FROM public.invoices WHERE id = v_existing),
          'existing', TRUE
        );
      END IF;

      RETURN jsonb_build_object(
        'success', TRUE,
        'invoice_id', NULL,
        'invoice_number', NULL,
        'grand_total', 0,
        'paid_amount', 0,
        'due_amount', 0,
        'status', 'PAID',
        'existing', FALSE
      );
    END IF;

    IF v_existing IS NOT NULL THEN
      -- Existing settlement is retained. New unbilled source records are issued
      -- on a supplemental episode invoice so they can never disappear.
      v_is_first := FALSE;
    ELSE
      v_is_first := TRUE;
    END IF;

    v_result := public.create_invoice_and_post_gl_atomic(
      p_org_id,
      p_patient_id,
      v_primary_visit,
      v_items,
      0,
      CASE WHEN v_is_first THEN 'Episode final settlement' ELSE 'Episode supplemental settlement' END,
      0,
      'CASH',
      NULL,
      p_cashier_id,
      CASE WHEN v_is_first
        THEN 'Unified patient care episode final settlement'
        ELSE 'Additional unbilled charges added after prior settlement'
      END
    );

    IF COALESCE((v_result->>'success')::BOOLEAN, FALSE) IS NOT TRUE THEN
      RAISE EXCEPTION 'EPISODE_SETTLEMENT_FAILED:%', COALESCE(v_result->>'error', 'unknown');
    END IF;

    v_invoice_id := NULLIF(v_result->>'invoice_id', '')::UUID;

    UPDATE public.invoices
    SET episode_id = p_episode_id,
        is_episode_settlement = v_is_first,
        updated_at = NOW()
    WHERE id = v_invoice_id
      AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'invoice_id', v_invoice_id,
      'invoice_number', v_result->>'invoice_number',
      'grand_total', v_result->>'grand_total',
      'paid_amount', v_result->>'paid_amount',
      'due_amount', v_result->>'due_amount',
      'status', v_result->>'status',
      'existing', FALSE,
      'supplemental', NOT v_is_first
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Discharge hardening: no unbilled source and no episode-level due.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_episode_discharge_atomic_v2(
    p_org_id UUID,
    p_episode_id UUID,
    p_discharge_type VARCHAR,
    p_final_diagnosis TEXT,
    p_hospital_course TEXT DEFAULT NULL,
    p_discharge_advice TEXT DEFAULT NULL,
    p_followup_instructions TEXT DEFAULT NULL,
    p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode RECORD;
    v_overview JSONB;
    v_unbilled NUMERIC := 0;
    v_episode_due NUMERIC := 0;
    v_discharge_at TIMESTAMPTZ := NOW();
    v_visit RECORD;
    v_assignment RECORD;
    v_cc RECORD;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT *
      INTO v_episode
    FROM public.patient_care_episodes
    WHERE id = p_episode_id
      AND organization_id = p_org_id
    FOR UPDATE;

    IF v_episode.id IS NULL THEN RAISE EXCEPTION 'EPISODE_NOT_FOUND'; END IF;
    IF v_episode.status <> 'ACTIVE' THEN RAISE EXCEPTION 'EPISODE_ALREADY_CLOSED'; END IF;

    v_overview := public.get_episode_billing_overview(
      p_org_id,
      v_episode.patient_id,
      p_episode_id,
      v_discharge_at
    );

    v_unbilled := COALESCE((v_overview->>'total')::NUMERIC, 0);

    SELECT COALESCE(SUM(i.due_amount), 0)
      INTO v_episode_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.episode_id = p_episode_id
      AND i.is_voided = FALSE;

    IF v_unbilled > 0.009 THEN
      RAISE EXCEPTION 'UNBILLED_EPISODE_CHARGES:%', ROUND(v_unbilled,2);
    END IF;

    IF v_episode_due > 0.009 THEN
      RAISE EXCEPTION 'EPISODE_PAYMENT_DUE:%', ROUND(v_episode_due,2);
    END IF;

    -- Release all active bed/cabin allocations through the authoritative
    -- transition function so a resource becomes CLEANING rather than VACANT.
    FOR v_assignment IN
      SELECT ba.id, ba.bed_id, ba.cabin_id, ba.visit_id
      FROM public.bed_assignments ba
      JOIN public.patient_visits pv ON pv.id = ba.visit_id
      WHERE ba.organization_id = p_org_id
        AND pv.organization_id = p_org_id
        AND pv.episode_id = p_episode_id
        AND ba.status = 'ACTIVE'
      FOR UPDATE OF ba
    LOOP
      PERFORM public.vacate_or_discharge_bed_atomic(
        p_org_id,
        v_assignment.bed_id,
        v_assignment.cabin_id,
        COALESCE(p_actor, auth.uid()),
        'Episode discharge after final billing settlement'
      );
    END LOOP;

    -- Critical care resources must also be closed before the episode closes.
    FOR v_cc IN
      SELECT cca.id
      FROM public.critical_care_admissions cca
      WHERE cca.organization_id = p_org_id
        AND cca.episode_id = p_episode_id
        AND cca.status IN ('ACTIVE','admitted')
      FOR UPDATE
    LOOP
      PERFORM public.discharge_critical_care_atomic(
        v_cc.id,
        COALESCE(NULLIF(trim(p_final_diagnosis), ''), 'Critical care completed'),
        'HOME',
        p_hospital_course,
        COALESCE(p_actor, auth.uid())
      );
    END LOOP;

    -- Close all remaining active visits in this episode. OPD becomes
    -- COMPLETED; IPD becomes DISCHARGED.
    FOR v_visit IN
      SELECT pv.*
      FROM public.patient_visits pv
      WHERE pv.organization_id = p_org_id
        AND pv.episode_id = p_episode_id
        AND pv.status = 'ACTIVE'
      FOR UPDATE
    LOOP
      UPDATE public.patient_visits
      SET status = CASE WHEN visit_type = 'OPD' THEN 'COMPLETED' ELSE 'DISCHARGED' END,
          discharged_at = v_discharge_at,
          updated_at = NOW()
      WHERE id = v_visit.id;

      IF v_visit.visit_type = 'IPD' THEN
        INSERT INTO public.discharge_summaries (
          visit_id,
          discharge_type,
          final_diagnosis,
          hospital_course,
          discharge_advice,
          followup_instructions,
          prepared_by,
          approved_by,
          created_at
        )
        VALUES (
          v_visit.id,
          p_discharge_type,
          COALESCE(NULLIF(trim(p_final_diagnosis), ''), 'Discharged after completed hospital episode'),
          p_hospital_course,
          p_discharge_advice,
          p_followup_instructions,
          COALESCE(p_actor, auth.uid()),
          COALESCE(p_actor, auth.uid()),
          v_discharge_at
        )
        ON CONFLICT (visit_id) DO UPDATE SET
          discharge_type = EXCLUDED.discharge_type,
          final_diagnosis = EXCLUDED.final_diagnosis,
          hospital_course = EXCLUDED.hospital_course,
          discharge_advice = EXCLUDED.discharge_advice,
          followup_instructions = EXCLUDED.followup_instructions,
          approved_by = EXCLUDED.approved_by;
      END IF;
    END LOOP;

    UPDATE public.patient_care_episodes
    SET status = 'CLOSED',
        ended_at = v_discharge_at,
        updated_at = NOW()
    WHERE id = p_episode_id;

    INSERT INTO public.audit_logs (
      organization_id,
      user_id,
      action,
      module,
      entity_type,
      entity_id,
      new_values,
      created_at
    )
    VALUES (
      p_org_id,
      COALESCE(p_actor, auth.uid()),
      'DISCHARGE',
      'PATIENT',
      'patient_care_episode',
      p_episode_id::TEXT,
      jsonb_build_object(
        'patient_id', v_episode.patient_id,
        'discharge_type', p_discharge_type,
        'discharged_at', v_discharge_at,
        'episode_due', v_episode_due,
        'unbilled_before_discharge', v_unbilled
      ),
      v_discharge_at
    );

    RETURN jsonb_build_object(
      'success', TRUE,
      'episode_id', p_episode_id,
      'patient_id', v_episode.patient_id,
      'discharged_at', v_discharge_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID,UUID,UUID,TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID,UUID,UUID,TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID,UUID,UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID,UUID,UUID,UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_episode_discharge_atomic_v2(UUID,UUID,VARCHAR,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_episode_discharge_atomic_v2(UUID,UUID,VARCHAR,TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.snapshot_opd_fee_before_visit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_opd_fee_before_visit() TO authenticated;

REVOKE ALL ON FUNCTION public.close_opd_visits_when_episode_closes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_opd_visits_when_episode_closes() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
