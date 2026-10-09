-- ==============================================================================
-- Migration 136: Zero DB Lint Flawless Production Closure
-- ==============================================================================
-- Description:
--   Permanently resolves all remaining database schema lint issues:
--   1. Adds created_by and cashier_id columns to public.payments.
--   2. Adds description, is_billed, and total_amount to public.episode_service_charges.
--   3. Drops legacy 10-parameter overload of create_episode_settlement_invoice_atomic_v2.
--   4. Harmonizes create_episode_settlement_invoice_atomic_v2.
--   5. Harmonizes get_episode_billing_overview with episode_service_charges columns.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND PAYMENTS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_created_by
  ON public.payments(created_by);

CREATE INDEX IF NOT EXISTS idx_payments_cashier_id
  ON public.payments(cashier_id);

UPDATE public.payments
SET created_by = cashier_id
WHERE created_by IS NULL AND cashier_id IS NOT NULL;

UPDATE public.payments
SET cashier_id = created_by
WHERE cashier_id IS NULL AND created_by IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. EXTEND EPISODE_SERVICE_CHARGES TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE public.episode_service_charges
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_billed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);

UPDATE public.episode_service_charges
SET total_amount = total_price
WHERE total_amount IS NULL;

UPDATE public.episode_service_charges
SET description = notes
WHERE description IS NULL AND notes IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. DROP LEGACY 10-PARAMETER OVERLOAD OF SETTLEMENT INVOICE
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_episode_settlement_invoice_atomic_v2(
    UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, VARCHAR, UUID, TEXT
);

-- ------------------------------------------------------------------------------
-- 4. RECONCILE CREATE_EPISODE_SETTLEMENT_INVOICE_ATOMIC_V2
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_episode_settlement_invoice_atomic_v2(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_cashier_id UUID,
    p_paid_amount NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_reason TEXT DEFAULT NULL,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_referral_agent_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_excluded_reference_ids JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user UUID := auth.uid();
    v_episode RECORD;
    v_preview JSONB;
    v_lines JSONB;
    v_line JSONB;
    v_primary_visit_id UUID;
    v_invoice_id UUID;
    v_invoice_number TEXT;
    v_subtotal NUMERIC(14,2) := 0;
    v_discount NUMERIC(14,2) := COALESCE(p_discount_amount, 0);
    v_grand_total NUMERIC(14,2) := 0;
    v_paid NUMERIC(14,2) := COALESCE(p_paid_amount, 0);
    v_due NUMERIC(14,2) := 0;
    v_status VARCHAR(20);
    v_receipt_number TEXT;
    v_payment_id UUID;
    v_ref_id UUID;
    v_included_count INT := 0;
BEGIN
    IF v_calling_user IS NULL THEN
      RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
      RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
      public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
      OR public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
    ) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    SELECT id, episode_number, status, referral_agent_id
    INTO v_episode
    FROM public.patient_care_episodes
    WHERE id = p_episode_id
      AND organization_id = p_org_id
      AND patient_id = p_patient_id
    FOR UPDATE;

    IF v_episode.id IS NULL THEN RAISE EXCEPTION 'EPISODE_NOT_FOUND'; END IF;
    IF v_episode.status <> 'ACTIVE' THEN RAISE EXCEPTION 'EPISODE_NOT_ACTIVE'; END IF;

    v_preview := public.get_episode_billing_overview(p_org_id, p_patient_id, p_episode_id, NOW());
    v_lines := COALESCE(v_preview->'lines', '[]'::JSONB);
    v_primary_visit_id := NULLIF(v_preview->>'primary_visit_id', '')::UUID;

    IF jsonb_array_length(v_lines) = 0 THEN
      RAISE EXCEPTION 'NO_UNBILLED_SERVICES_FOUND';
    END IF;

    -- Calculate subtotal strictly across NON-excluded lines
    SELECT 
      COALESCE(SUM((val->>'total_price')::NUMERIC), 0),
      COUNT(*)
    INTO v_subtotal, v_included_count
    FROM jsonb_array_elements(v_lines) val
    WHERE p_excluded_reference_ids IS NULL 
       OR NOT (p_excluded_reference_ids ? (val->>'reference_id'));

    IF v_included_count = 0 OR v_subtotal <= 0 THEN
      RAISE EXCEPTION 'NO_UNBILLED_SERVICES_FOUND';
    END IF;

    IF v_discount < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_DISCOUNT_PROHIBITED';
    END IF;

    IF v_discount > v_subtotal THEN
      v_discount := v_subtotal;
    END IF;

    v_grand_total := ROUND(v_subtotal - v_discount, 2);

    IF v_paid < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_PAYMENT_PROHIBITED';
    END IF;

    IF v_paid > v_grand_total THEN
      v_paid := v_grand_total;
    END IF;

    v_due := ROUND(v_grand_total - v_paid, 2);

    IF v_due <= 0.005 THEN
      v_status := 'PAID';
    ELSIF v_paid > 0.005 THEN
      v_status := 'PARTIAL';
    ELSE
      v_status := 'UNPAID';
    END IF;

    -- Generate Invoice Number
    SELECT public.generate_invoice_number(p_org_id) INTO v_invoice_number;

    -- Create Invoice
    INSERT INTO public.invoices (
      organization_id, patient_id, episode_id, visit_id, invoice_number,
      total_amount, discount_amount, discount_reason, grand_total,
      paid_amount, due_amount, status, is_episode_settlement,
      referral_agent_id, notes, created_by, created_at, updated_at
    )
    VALUES (
      p_org_id, p_patient_id, p_episode_id, v_primary_visit_id, v_invoice_number,
      v_subtotal, v_discount, p_discount_reason, v_grand_total,
      v_paid, v_due, v_status, TRUE,
      COALESCE(p_referral_agent_id, v_episode.referral_agent_id),
      p_notes, p_cashier_id, NOW(), NOW()
    )
    RETURNING id INTO v_invoice_id;

    -- Insert Invoice Items (skipping any excluded reference_id)
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
      IF p_excluded_reference_ids IS NOT NULL AND p_excluded_reference_ids ? (v_line->>'reference_id') THEN
        CONTINUE;
      END IF;

      v_ref_id := NULLIF(v_line->>'reference_id', '')::UUID;

      INSERT INTO public.invoice_items (
        organization_id, invoice_id, reference_id, service_category,
        item_name, unit_price, quantity, total_price, created_at
      )
      VALUES (
        p_org_id, v_invoice_id, v_ref_id,
        COALESCE(v_line->>'service_category', 'MISC'),
        COALESCE(v_line->>'item_name', 'Service'),
        COALESCE((v_line->>'unit_price')::NUMERIC, 0),
        COALESCE((v_line->>'quantity')::NUMERIC, 1),
        COALESCE((v_line->>'total_price')::NUMERIC, 0),
        NOW()
      );

      -- Mark custom charge as billed if applicable
      IF COALESCE((v_line->>'is_custom_charge')::BOOLEAN, FALSE) = TRUE AND (v_line->>'charge_id') IS NOT NULL THEN
        UPDATE public.episode_service_charges
        SET is_billed = TRUE, status = 'BILLED', updated_at = NOW()
        WHERE id = (v_line->>'charge_id')::UUID
          AND organization_id = p_org_id;
      END IF;
    END LOOP;

    -- Record Initial Payment if made (supports cashier_id and created_by and patient_id)
    IF v_paid > 0.005 THEN
      SELECT public.generate_receipt_number(p_org_id) INTO v_receipt_number;

      INSERT INTO public.payments (
        organization_id, invoice_id, patient_id, amount,
        payment_method, receipt_number, notes, cashier_id, created_by,
        payment_date, created_at
      )
      VALUES (
        p_org_id, v_invoice_id, p_patient_id, v_paid,
        p_payment_method, v_receipt_number,
        COALESCE(p_notes, 'Episode final settlement initial payment'),
        p_cashier_id, p_cashier_id, NOW(), NOW()
      )
      RETURNING id INTO v_payment_id;
    END IF;

    RETURN jsonb_build_object(
      'success', TRUE,
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_number,
      'subtotal', v_subtotal,
      'discount_amount', v_discount,
      'grand_total', v_grand_total,
      'paid_amount', v_paid,
      'due_amount', v_due,
      'status', v_status,
      'items_count', v_included_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, VARCHAR, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, VARCHAR, UUID, TEXT, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. RECONCILE GET_EPISODE_BILLING_OVERVIEW WITH EPISODE_SERVICE_CHARGES
-- ------------------------------------------------------------------------------
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
        admission_discount_amount, referral_agent_id
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
      AND pv.episode_id = v_episode_id;

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
      AND pv.episode_id = v_episode_id;

    -- 3. Critical Care Summary (cca.admission_time and cca.discharge_time)
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

    -- 4. Active Durable Waivers Summary (using public.profiles)
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
        ORDER BY w.created_at DESC
      ),
      '[]'::JSONB
    )
    INTO v_waived_items
    FROM public.episode_service_waivers w
    LEFT JOIN public.profiles up ON up.id = w.waived_by
    WHERE w.organization_id = p_org_id
      AND w.patient_id = v_patient_id
      AND w.episode_id = v_episode_id
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
      AND esc.episode_id = v_episode_id;

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

    -- 7. Unbilled Lines Assembly
    WITH candidates AS (
      -- A. OPD Consultations
      SELECT
        pv.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'CONSULTATION'::TEXT AS category,
        'OPD Consultation - ' || COALESCE(doc.full_name, 'General Doctor') AS item_name,
        COALESCE(doc.consultation_fee, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      JOIN public.doctors doc ON doc.id = pv.doctor_id
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
        AND NOT EXISTS (
          SELECT 1
          FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id
            AND w.episode_id = v_episode_id
            AND w.reference_id = pv.id
            AND w.status = 'ACTIVE'
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
        ba.assigned_at AS started_at
      FROM public.bed_assignments ba
      JOIN public.patient_visits pv ON pv.id = ba.visit_id
      LEFT JOIN public.beds b ON b.id = ba.bed_id
      LEFT JOIN public.cabins c ON c.id = ba.cabin_id
      LEFT JOIN public.wards w ON w.id = b.ward_id
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
        AND NOT EXISTS (
          SELECT 1
          FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id
            AND w.episode_id = v_episode_id
            AND w.reference_id = ba.id
            AND w.status = 'ACTIVE'
        )

      UNION ALL

      -- C. Critical Care Stays (cca.admission_time and cca.discharge_time)
      SELECT
        cca.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
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
        AND (cca.episode_id = v_episode_id OR (cca.episode_id IS NULL AND cca.status IN ('admitted', 'ACTIVE', 'ADMITTED')))
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = cca.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id
            AND w.episode_id = v_episode_id
            AND w.reference_id = cca.id
            AND w.status = 'ACTIVE'
        )

      UNION ALL

      -- D. Additional Episode Service Charges
      SELECT
        esc.id AS source_id,
        esc.id AS charge_id,
        TRUE AS is_custom_charge,
        esc.service_category::TEXT AS category,
        COALESCE(esc.item_name, esc.description, esc.notes, 'Service Charge') AS item_name,
        COALESCE(esc.unit_price, 0)::NUMERIC AS unit_price,
        COALESCE(esc.quantity, 1)::NUMERIC AS quantity,
        esc.created_at AS started_at
      FROM public.episode_service_charges esc
      WHERE esc.organization_id = p_org_id
        AND esc.patient_id = v_patient_id
        AND esc.episode_id = v_episode_id
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
        AND NOT EXISTS (
          SELECT 1
          FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id
            AND w.episode_id = v_episode_id
            AND w.reference_id = esc.id
            AND w.status = 'ACTIVE'
        )

      UNION ALL

      -- E. Unbilled Operation Theatre (OT) Procedures & Surgeries
      SELECT
        ob.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'PROCEDURE'::TEXT AS category,
        'OT Surgery - ' || COALESCE(ob.procedure_name, 'Surgical Procedure') AS item_name,
        COALESCE(ob.ot_charge, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        ob.scheduled_start AS started_at
      FROM public.ot_bookings ob
      JOIN public.patient_visits pv ON pv.id = ob.visit_id
      WHERE ob.organization_id = p_org_id
        AND pv.organization_id = p_org_id
        AND pv.patient_id = v_patient_id
        AND pv.episode_id = v_episode_id
        AND ob.status != 'CANCELLED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id
            AND inv.is_voided = FALSE
            AND ii.reference_id = ob.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id
            AND w.episode_id = v_episode_id
            AND w.reference_id = ob.id
            AND w.status = 'ACTIVE'
        )
    ),
    priced AS (
      SELECT
        source_id,
        charge_id,
        is_custom_charge,
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
            'charge_id', charge_id,
            'is_custom_charge', is_custom_charge,
            'service_category', category,
            'item_name', item_name,
            'unit_price', unit_price,
            'quantity', quantity,
            'total_price', total_price,
            'started_at', started_at
          )
          ORDER BY started_at ASC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(total_price), 0)
    INTO v_lines, v_total
    FROM priced;

    RETURN jsonb_build_object(
      'episode', CASE WHEN v_episode.id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_episode.id,
          'episode_number', v_episode.episode_number,
          'status', v_episode.status,
          'started_at', v_episode.started_at,
          'ended_at', v_episode.ended_at,
          'admission_discount_amount', v_episode.admission_discount_amount,
          'referral_agent_id', v_episode.referral_agent_id
        )
        ELSE NULL END,
      'primary_visit_id', v_primary_visit_id,
      'encounters', v_encounters,
      'resources', v_resources,
      'critical_care', v_critical,
      'waivers', v_waived_items,
      'additional_charges', v_service_charges,
      'invoices', v_invoices,
      'lines', v_lines,
      'summary', jsonb_build_object(
        'unbilled_subtotal', v_total,
        'unbilled_count', jsonb_array_length(v_lines),
        'episode_invoiced', v_episode_invoiced,
        'episode_paid', v_episode_paid,
        'episode_due', v_episode_due,
        'lifetime_invoiced', v_previous_invoiced,
        'lifetime_paid', v_previous_paid,
        'lifetime_due', v_previous_due
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

COMMIT;
