-- ==============================================================================
-- OHMS Migration 130: Durable Billing Waivers, Audited Ledger, & RPC Authorization Hardening
-- Date: 2026-10-09
-- Purpose:
--   1. Create public.episode_service_waivers table with RLS and audit trails
--      so financial waivers persist across browser sessions and reloads.
--   2. Implement waive_episode_service_atomic & restore_episode_service_waiver_atomic.
--   3. Upgrade get_episode_billing_overview & get_episode_billing_preview:
--      - Automatically exclude active waived items from unbilled candidate lines.
--      - Return waived_items array with audit details and acting user.
--      - Enforce database-side RBAC permission checks.
--   4. Harden create_patient_intake_atomic:
--      - Enforce caller identity from auth.uid() (prevent user_id spoofing).
--      - Enforce database-side RBAC (patients.create / patients.manage / reception.manage / clinical.manage).
--      - Pin search_path = '' and restrict EXECUTE permissions.
--   5. Harden create_episode_settlement_invoice_atomic_v2:
--      - Enforce cashier identity from auth.uid().
--      - Enforce database-side RBAC (billing.create / billing.manage).
--      - Strict payment method validation and financial reconciliation.
--   6. Harden add/edit/delete_episode_service_charge_atomic with RBAC.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. DURABLE BILLING WAIVERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.episode_service_waivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    episode_id UUID NOT NULL REFERENCES public.patient_care_episodes(id) ON DELETE CASCADE,
    reference_id UUID NOT NULL,
    service_category VARCHAR(50) NOT NULL,
    item_name TEXT NOT NULL,
    waived_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (waived_amount >= 0),
    waiver_reason TEXT NOT NULL CHECK (char_length(trim(waiver_reason)) >= 3),
    waived_by UUID NOT NULL REFERENCES auth.users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESTORED')),
    restored_by UUID REFERENCES auth.users(id),
    restored_at TIMESTAMPTZ,
    restoration_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episode_service_waivers_lookup
    ON public.episode_service_waivers (organization_id, episode_id, status);

CREATE INDEX IF NOT EXISTS idx_episode_service_waivers_ref
    ON public.episode_service_waivers (organization_id, reference_id, status);

ALTER TABLE public.episode_service_waivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "episode_service_waivers_org_isolation" ON public.episode_service_waivers;
CREATE POLICY "episode_service_waivers_org_isolation"
    ON public.episode_service_waivers
    FOR ALL
    USING (organization_id = private.get_current_org_id());

-- ------------------------------------------------------------------------------
-- 2. WAIVE & RESTORE ATOMIC RPCS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.waive_episode_service_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_reference_id UUID,
    p_service_category VARCHAR,
    p_item_name TEXT,
    p_waived_amount NUMERIC,
    p_waiver_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_reason TEXT := NULLIF(trim(p_waiver_reason), '');
    v_waiver_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.discount')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_WAIVER';
    END IF;

    IF v_clean_reason IS NULL OR char_length(v_clean_reason) < 3 THEN
        RAISE EXCEPTION 'WAIVER_REASON_REQUIRED_MIN_3_CHARS';
    END IF;

    IF p_waived_amount IS NULL OR p_waived_amount < 0 THEN
        RAISE EXCEPTION 'INVALID_WAIVED_AMOUNT';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.patient_care_episodes
        WHERE id = p_episode_id AND organization_id = p_org_id AND patient_id = p_patient_id
    ) THEN
        RAISE EXCEPTION 'EPISODE_NOT_FOUND';
    END IF;

    -- Deactivate any previous active waiver for the same reference item in this episode
    UPDATE public.episode_service_waivers
    SET status = 'RESTORED', updated_at = NOW()
    WHERE organization_id = p_org_id
      AND episode_id = p_episode_id
      AND reference_id = p_reference_id
      AND status = 'ACTIVE';

    INSERT INTO public.episode_service_waivers (
        organization_id, patient_id, episode_id, reference_id,
        service_category, item_name, waived_amount, waiver_reason,
        waived_by, status, created_at, updated_at
    )
    VALUES (
        p_org_id, p_patient_id, p_episode_id, p_reference_id,
        COALESCE(p_service_category, 'MISC'),
        COALESCE(p_item_name, 'Service Charge'),
        p_waived_amount, v_clean_reason,
        auth.uid(), 'ACTIVE', NOW(), NOW()
    )
    RETURNING id INTO v_waiver_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'waiver_id', v_waiver_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restore_episode_service_waiver_atomic(
    p_org_id UUID,
    p_waiver_id UUID,
    p_restoration_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_RESTORE';
    END IF;

    UPDATE public.episode_service_waivers
    SET status = 'RESTORED',
        restored_by = auth.uid(),
        restored_at = NOW(),
        restoration_reason = NULLIF(trim(p_restoration_reason), ''),
        updated_at = NOW()
    WHERE id = p_waiver_id
      AND organization_id = p_org_id
      AND status = 'ACTIVE';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACTIVE_WAIVER_NOT_FOUND';
    END IF;

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.restore_episode_service_waiver_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_episode_service_waiver_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. UPGRADED GET_EPISODE_BILLING_OVERVIEW (DURABLE WAIVERS + RBAC)
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
      SELECT *
        INTO v_episode
      FROM public.patient_care_episodes
      WHERE organization_id = p_org_id
        AND patient_id = v_patient_id
        AND status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1;
      v_episode_id := v_episode.id;
    ELSE
      SELECT *
        INTO v_episode
      FROM public.patient_care_episodes
      WHERE id = v_episode_id
        AND organization_id = p_org_id
        AND patient_id = v_patient_id;
    END IF;

    IF v_episode_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'NO_ACTIVE_EPISODE',
        'lines', '[]'::JSONB,
        'total', 0,
        'previous_due', 0
      );
    END IF;

    -- Pick primary visit anchor
    SELECT id INTO v_primary_visit_id
    FROM public.patient_visits
    WHERE organization_id = p_org_id
      AND patient_id = v_patient_id
      AND episode_id = v_episode_id
    ORDER BY admitted_at ASC
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

    -- 3. Critical Care Summary
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cca.id,
          'unit_name', u.unit_name,
          'unit_type', u.unit_type,
          'bed_number', cca.bed_number,
          'admission_time', COALESCE(cca.admission_time, cca.admitted_at),
          'discharge_time', COALESCE(cca.discharge_time, cca.discharged_at),
          'daily_charge', u.daily_charge,
          'status', cca.status
        )
        ORDER BY COALESCE(cca.admission_time, cca.admitted_at) ASC
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
        ORDER BY w.created_at DESC
      ),
      '[]'::JSONB
    )
    INTO v_waived_items
    FROM public.episode_service_waivers w
    LEFT JOIN public.user_profiles up ON up.id = w.waived_by
    WHERE w.organization_id = p_org_id
      AND w.patient_id = v_patient_id
      AND w.episode_id = v_episode_id
      AND w.status = 'ACTIVE';

    -- 5. Build Aggregated Unbilled Candidate Lines (excluding already invoiced AND actively waived)
    WITH candidates AS (
      -- A. OPD Consultations
      SELECT
        pv.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'OPD'::TEXT AS category,
        'OPD Consultation - ' || COALESCE(doc.full_name, 'Attending Doctor') AS item_name,
        COALESCE(doc.consultation_fee, doc.opd_fee, 800.00)::NUMERIC AS unit_price,
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
        AND NOT EXISTS (
          SELECT 1
          FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id
            AND w.episode_id = v_episode_id
            AND w.reference_id = ba.id
            AND w.status = 'ACTIVE'
        )

      UNION ALL

      -- C. Critical Care Stays
      SELECT
        cca.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'MISC'::TEXT AS category,
        'Critical Care - ' || COALESCE(u.unit_name, u.unit_type, 'Unit') ||
          ' (' || cca.bed_number || ')' AS item_name,
        COALESCE(u.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(COALESCE(cca.admission_time, cca.admitted_at), COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity,
        COALESCE(cca.admission_time, cca.admitted_at) AS started_at
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
        COALESCE(esc.item_name, esc.description, 'Service Charge') AS item_name,
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
          ORDER BY started_at
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(total_price), 0)
    INTO v_lines, v_total
    FROM priced;

    -- Lifetime Financial Summary
    SELECT
      COALESCE(SUM(i.grand_total), 0),
      COALESCE(SUM(i.paid_amount), 0),
      COALESCE(SUM(i.due_amount), 0)
    INTO v_previous_invoiced, v_previous_paid, v_previous_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = v_patient_id
      AND i.is_voided = FALSE;

    -- Episode Financial Summary
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

    -- Invoices History
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
        ORDER BY i.created_at DESC
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
      'episode_number', v_episode.episode_number,
      'patient_id', v_patient_id,
      'primary_visit_id', v_primary_visit_id,
      'lines', v_lines,
      'waived_items', v_waived_items,
      'encounters', v_encounters,
      'resources', v_resources,
      'critical_care', v_critical,
      'invoice_history', v_invoices,
      'total', v_total,
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
      'lifetime_due', v_previous_due
    );
END;
$$;

-- Alias get_episode_billing_preview
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

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. HARDENED CREATE_PATIENT_INTAKE_ATOMIC (AUTHENTICATED ACTOR + RBAC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_patient_intake_atomic(p_request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID := (p_request->>'organization_id')::UUID;
    v_caller_id UUID := auth.uid();
    v_actor_id UUID;
    v_existing_patient_id UUID := NULLIF(p_request->>'existing_patient_id', '')::UUID;
    v_patient_id UUID;
    v_patient_code TEXT;
    v_registration_serial TEXT;
    v_episode_id UUID;
    v_episode_number TEXT;
    v_encounter_at TIMESTAMPTZ := COALESCE((p_request->>'encounter_at')::TIMESTAMPTZ, NOW());
    v_services JSONB := COALESCE(p_request->'services', '{}'::JSONB);
    v_patient JSONB := COALESCE(p_request->'patient', '{}'::JSONB);
    v_opd JSONB := COALESCE(v_services->'opd', '{}'::JSONB);
    v_ipd JSONB := COALESCE(v_services->'ipd', '{}'::JSONB);
    v_cc JSONB := COALESCE(v_services->'critical_care', v_services->'criticalCare', '{}'::JSONB);
    v_ot JSONB := COALESCE(v_services->'ot', '{}'::JSONB);
    v_admission_discount NUMERIC := 0;
    v_admission_discount_percent NUMERIC := 0;
    v_admission_discount_reason TEXT := NULLIF(trim(COALESCE(p_request->>'admission_discount_reason', v_patient->>'admission_discount_reason')), '');
    v_referral_agent_id UUID := NULLIF(COALESCE(p_request->>'referral_agent_id', v_ipd->>'referral_agent_id'), '')::UUID;
    v_referral_agent_code TEXT;
    v_referral_agent_name TEXT;
    v_visit_id UUID;
    v_opd_visit_id UUID;
    v_ipd_visit_id UUID;
    v_cc_visit_id UUID;
    v_visit_number TEXT;
    v_assignment_id UUID;
    v_bed_status TEXT;
    v_bed_number TEXT;
    v_daily_charge NUMERIC := 0;
    v_cabin_status TEXT;
    v_cabin_number TEXT;
    v_cabin_charge NUMERIC := 0;
    v_unit_active BOOLEAN;
    v_cc_bed_id UUID;
    v_cc_bed_status TEXT;
    v_cc_admission_id UUID;
    v_doctor_id UUID;
    v_department_id UUID;
    v_bed_id UUID;
    v_cabin_id UUID;
    v_unit_id UUID;
    v_nid TEXT;
    v_dob DATE;
    v_age INTEGER := 0;
    v_billable_base NUMERIC := 0;
    v_opd_fee NUMERIC := 0;
    v_cc_daily_charge NUMERIC := 0;
    v_ot_charge NUMERIC := 0;
    v_ot_booking_id UUID;
    v_ot_room_id UUID;
    v_ot_surgeon_id UUID;
    v_ot_anesthetist_id UUID;
    v_ot_procedure TEXT;
    v_ot_anesthesia TEXT;
    v_ot_start TIMESTAMPTZ;
    v_ot_end TIMESTAMPTZ;
BEGIN
    -- 1. Strict Tenant, Authentication, and RBAC Guard
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(v_org_id, 'patients.create')
        OR public.is_org_admin_or_has_permission(v_org_id, 'patients.manage')
        OR public.is_org_admin_or_has_permission(v_org_id, 'reception.manage')
        OR public.is_org_admin_or_has_permission(v_org_id, 'clinical.manage')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_PATIENT_INTAKE';
    END IF;

    -- Authoritative Actor Identity (prevent client-side user_id spoofing)
    v_actor_id := v_caller_id;

    -- 2. Validate Referral Agent if provided
    IF v_referral_agent_id IS NOT NULL THEN
        SELECT agent_code, full_name
        INTO v_referral_agent_code, v_referral_agent_name
        FROM public.referral_agents
        WHERE id = v_referral_agent_id
          AND organization_id = v_org_id
          AND is_active = TRUE;

        IF v_referral_agent_code IS NULL THEN
            RAISE EXCEPTION 'INVALID_REFERRAL_AGENT';
        END IF;
    END IF;

    -- 3. Patient Resolution / Creation
    IF v_existing_patient_id IS NOT NULL THEN
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE id = v_existing_patient_id
          AND organization_id = v_org_id
          AND is_deleted = FALSE;

        IF v_patient_id IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NOT_FOUND';
        END IF;

        IF v_registration_serial IS NULL OR trim(v_registration_serial) = '' THEN
            SELECT public.generate_patient_registration_serial(v_org_id, v_encounter_at) INTO v_registration_serial;
            UPDATE public.patients
            SET registration_serial = v_registration_serial,
                updated_at = NOW()
            WHERE id = v_patient_id AND organization_id = v_org_id;
        END IF;
    ELSE
        -- Validate mandatory demographics
        IF NULLIF(trim(COALESCE(v_patient->>'full_name', '')), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NAME_REQUIRED';
        END IF;

        IF NULLIF(trim(COALESCE(v_patient->>'phone', '')), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_PHONE_REQUIRED';
        END IF;

        v_nid := NULLIF(trim(COALESCE(v_patient->>'nid_or_birth_cert', v_patient->>'nid', '')), '');
        v_dob := NULLIF(v_patient->>'date_of_birth', '')::DATE;
        v_age := COALESCE((v_patient->>'age_years')::INTEGER, (v_patient->>'age')::INTEGER, 0);

        IF v_dob IS NULL AND v_age > 0 THEN
            v_dob := (CURRENT_DATE - (v_age || ' years')::INTERVAL)::DATE;
        ELSIF v_dob IS NOT NULL AND v_age = 0 THEN
            v_age := EXTRACT(YEAR FROM age(CURRENT_DATE, v_dob))::INTEGER;
        END IF;

        SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
        SELECT public.generate_patient_registration_serial(v_org_id, v_encounter_at) INTO v_registration_serial;

        INSERT INTO public.patients (
            organization_id, patient_code, registration_serial,
            full_name, phone, gender, blood_group, date_of_birth, age_years,
            address, marital_status, occupation, emergency_contact_name,
            emergency_contact_phone, emergency_contact_relation,
            nid_or_birth_cert, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_code, v_registration_serial,
            trim(v_patient->>'full_name'),
            trim(v_patient->>'phone'),
            COALESCE(NULLIF(trim(v_patient->>'gender'), ''), 'OTHER'),
            NULLIF(trim(v_patient->>'blood_group'), ''),
            v_dob,
            v_age,
            NULLIF(trim(v_patient->>'address'), ''),
            NULLIF(trim(v_patient->>'marital_status'), ''),
            NULLIF(trim(v_patient->>'occupation'), ''),
            NULLIF(trim(v_patient->>'emergency_contact_name'), ''),
            NULLIF(trim(v_patient->>'emergency_contact_phone'), ''),
            NULLIF(trim(v_patient->>'emergency_contact_relation'), ''),
            v_nid,
            v_actor_id,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_patient_id;
    END IF;

    -- 4. Create Single Patient Care Episode
    SELECT public.generate_episode_number(v_org_id) INTO v_episode_number;

    INSERT INTO public.patient_care_episodes (
        organization_id, patient_id, episode_number,
        status, referral_agent_id, started_at, created_at, updated_at
    )
    VALUES (
        v_org_id, v_patient_id, v_episode_number,
        'ACTIVE', v_referral_agent_id, v_encounter_at, NOW(), NOW()
    )
    RETURNING id INTO v_episode_id;

    -- 5. OPD Service Intake
    IF (v_opd->>'enabled')::BOOLEAN IS TRUE THEN
        v_doctor_id := NULLIF(v_opd->>'doctor_id', '')::UUID;
        v_department_id := NULLIF(v_opd->>'department_id', '')::UUID;

        IF v_doctor_id IS NOT NULL THEN
            SELECT COALESCE(consultation_fee, opd_fee, 800.00), department_id
            INTO v_opd_fee, v_department_id
            FROM public.doctors
            WHERE id = v_doctor_id AND organization_id = v_org_id;

            v_billable_base := v_billable_base + COALESCE(v_opd_fee, 0);
        END IF;

        SELECT public.generate_visit_number(v_org_id, 'OPD') INTO v_visit_number;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, department_id, doctor_id, admitted_at,
            status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'OPD', v_department_id, v_doctor_id, v_encounter_at,
            'IN_PROGRESS', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_opd_visit_id;

        v_visit_id := v_opd_visit_id;
    END IF;

    -- 6. IPD Bed/Cabin Service Intake
    IF (v_ipd->>'enabled')::BOOLEAN IS TRUE THEN
        v_doctor_id := NULLIF(v_ipd->>'doctor_id', '')::UUID;
        v_department_id := NULLIF(v_ipd->>'department_id', '')::UUID;
        v_bed_id := NULLIF(v_ipd->>'bed_id', '')::UUID;
        v_cabin_id := NULLIF(v_ipd->>'cabin_id', '')::UUID;

        IF v_bed_id IS NULL AND v_cabin_id IS NULL THEN
            RAISE EXCEPTION 'BED_OR_CABIN_REQUIRED_FOR_IPD';
        END IF;

        SELECT public.generate_visit_number(v_org_id, 'IPD') INTO v_visit_number;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, department_id, doctor_id, admitted_at,
            status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'IPD', v_department_id, v_doctor_id, v_encounter_at,
            'ADMITTED', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_ipd_visit_id;

        IF v_visit_id IS NULL THEN
            v_visit_id := v_ipd_visit_id;
        END IF;

        IF v_bed_id IS NOT NULL THEN
            SELECT status, bed_number, daily_charge
            INTO v_bed_status, v_bed_number, v_daily_charge
            FROM public.beds
            WHERE id = v_bed_id AND organization_id = v_org_id
            FOR UPDATE;

            IF v_bed_status != 'VACANT' THEN
                RAISE EXCEPTION 'BED_NOT_VACANT';
            END IF;

            UPDATE public.beds
            SET status = 'OCCUPIED', updated_at = NOW()
            WHERE id = v_bed_id AND organization_id = v_org_id;

            INSERT INTO public.bed_assignments (
                organization_id, patient_id, visit_id, bed_id,
                daily_charge, assigned_at, status, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_id, v_ipd_visit_id, v_bed_id,
                COALESCE(v_daily_charge, 0), v_encounter_at, 'ACTIVE', NOW(), NOW()
            )
            RETURNING id INTO v_assignment_id;

            v_billable_base := v_billable_base + COALESCE(v_daily_charge, 0);
        ELSIF v_cabin_id IS NOT NULL THEN
            SELECT status, cabin_number, daily_charge
            INTO v_cabin_status, v_cabin_number, v_cabin_charge
            FROM public.cabins
            WHERE id = v_cabin_id AND organization_id = v_org_id
            FOR UPDATE;

            IF v_cabin_status != 'VACANT' THEN
                RAISE EXCEPTION 'CABIN_NOT_VACANT';
            END IF;

            UPDATE public.cabins
            SET status = 'OCCUPIED', updated_at = NOW()
            WHERE id = v_cabin_id AND organization_id = v_org_id;

            INSERT INTO public.bed_assignments (
                organization_id, patient_id, visit_id, cabin_id,
                daily_charge, assigned_at, status, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_id, v_ipd_visit_id, v_cabin_id,
                COALESCE(v_cabin_charge, 0), v_encounter_at, 'ACTIVE', NOW(), NOW()
            )
            RETURNING id INTO v_assignment_id;

            v_billable_base := v_billable_base + COALESCE(v_cabin_charge, 0);
        END IF;
    END IF;

    -- 7. Critical Care Intake
    IF (v_cc->>'enabled')::BOOLEAN IS TRUE THEN
        v_unit_id := NULLIF(v_cc->>'unit_id', '')::UUID;
        v_bed_number := trim(COALESCE(v_cc->>'bed_number', ''));

        IF v_unit_id IS NULL OR v_bed_number = '' THEN
            RAISE EXCEPTION 'CRITICAL_CARE_UNIT_AND_BED_REQUIRED';
        END IF;

        SELECT is_active, daily_charge
        INTO v_unit_active, v_cc_daily_charge
        FROM public.critical_care_units
        WHERE id = v_unit_id AND organization_id = v_org_id;

        IF v_unit_active IS NOT TRUE THEN
            RAISE EXCEPTION 'CRITICAL_CARE_UNIT_INACTIVE';
        END IF;

        SELECT id, status
        INTO v_cc_bed_id, v_cc_bed_status
        FROM public.critical_care_beds
        WHERE organization_id = v_org_id
          AND unit_id = v_unit_id
          AND UPPER(TRIM(bed_number)) = UPPER(v_bed_number)
        FOR UPDATE;

        IF v_cc_bed_id IS NOT NULL AND v_cc_bed_status != 'VACANT' THEN
            RAISE EXCEPTION 'CRITICAL_CARE_BED_OCCUPIED';
        END IF;

        IF v_cc_bed_id IS NOT NULL THEN
            UPDATE public.critical_care_beds
            SET status = 'OCCUPIED', updated_at = NOW()
            WHERE id = v_cc_bed_id AND organization_id = v_org_id;
        END IF;

        SELECT public.generate_visit_number(v_org_id, 'EMERGENCY') INTO v_visit_number;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, admitted_at, status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'EMERGENCY', v_encounter_at, 'ADMITTED', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_cc_visit_id;

        IF v_visit_id IS NULL THEN
            v_visit_id := v_cc_visit_id;
        END IF;

        INSERT INTO public.critical_care_admissions (
            organization_id, patient_id, episode_id, unit_id,
            bed_number, admitting_doctor_id, initial_diagnosis,
            ventilator_required, admission_time, status,
            created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_unit_id,
            v_bed_number,
            NULLIF(v_cc->>'doctor_id', '')::UUID,
            NULLIF(trim(v_cc->>'initial_diagnosis'), ''),
            COALESCE((v_cc->>'ventilator_required')::BOOLEAN, FALSE),
            v_encounter_at, 'admitted', NOW(), NOW()
        )
        RETURNING id INTO v_cc_admission_id;

        v_billable_base := v_billable_base + COALESCE(v_cc_daily_charge, 0);
    END IF;

    -- 8. Operation Theatre (OT) Surgery Intake
    IF (v_ot->>'enabled')::BOOLEAN IS TRUE THEN
        v_ot_room_id := NULLIF(v_ot->>'ot_room_id', '')::UUID;
        v_ot_surgeon_id := NULLIF(v_ot->>'surgeon_id', '')::UUID;
        v_ot_anesthetist_id := NULLIF(v_ot->>'anesthetist_id', '')::UUID;
        v_ot_procedure := NULLIF(trim(v_ot->>'procedure_name'), '');
        v_ot_anesthesia := NULLIF(trim(v_ot->>'anesthesia_type'), '');
        v_ot_charge := COALESCE((v_ot->>'ot_charge')::NUMERIC, 0);
        v_ot_start := COALESCE((v_ot->>'scheduled_start')::TIMESTAMPTZ, v_encounter_at);
        v_ot_end := COALESCE((v_ot->>'scheduled_end')::TIMESTAMPTZ, v_ot_start + INTERVAL '2 hours');

        IF v_ot_procedure IS NOT NULL THEN
            IF v_visit_id IS NULL THEN
                SELECT public.generate_visit_number(v_org_id, 'EMERGENCY') INTO v_visit_number;
                INSERT INTO public.patient_visits (
                    organization_id, patient_id, episode_id, visit_number,
                    visit_type, doctor_id, admitted_at, status, created_by, created_at, updated_at
                )
                VALUES (
                    v_org_id, v_patient_id, v_episode_id, v_visit_number,
                    'EMERGENCY', v_ot_surgeon_id, v_encounter_at, 'IN_PROGRESS', v_actor_id, NOW(), NOW()
                )
                RETURNING id INTO v_visit_id;
            END IF;

            INSERT INTO public.ot_bookings (
                organization_id, visit_id, ot_room_id, surgeon_id,
                anesthetist_id, procedure_name, anesthesia_type,
                scheduled_start, scheduled_end, ot_charge,
                status, created_at, updated_at
            )
            VALUES (
                v_org_id, v_visit_id, v_ot_room_id, v_ot_surgeon_id,
                v_ot_anesthetist_id, v_ot_procedure, v_ot_anesthesia,
                v_ot_start, v_ot_end, v_ot_charge,
                'SCHEDULED', NOW(), NOW()
            )
            RETURNING id INTO v_ot_booking_id;

            v_billable_base := v_billable_base + v_ot_charge;
        END IF;
    END IF;

    -- 9. Process Admission Discount
    v_admission_discount := COALESCE((p_request->>'admission_discount_amount')::NUMERIC, (v_patient->>'admission_discount_amount')::NUMERIC, 0);
    v_admission_discount_percent := COALESCE((p_request->>'admission_discount_percent')::NUMERIC, (v_patient->>'admission_discount_percent')::NUMERIC, 0);

    IF v_admission_discount = 0 AND v_admission_discount_percent > 0 AND v_billable_base > 0 THEN
        v_admission_discount := ROUND((v_billable_base * v_admission_discount_percent / 100.0), 2);
    END IF;

    IF v_admission_discount > 0 THEN
        IF v_admission_discount > v_billable_base AND v_billable_base > 0 THEN
            v_admission_discount := v_billable_base;
        END IF;

        UPDATE public.patient_care_episodes
        SET admission_discount_amount = v_admission_discount,
            admission_discount_reason = v_admission_discount_reason,
            updated_at = NOW()
        WHERE id = v_episode_id AND organization_id = v_org_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'patient_id', v_patient_id,
        'patient_code', v_patient_code,
        'registration_serial', v_registration_serial,
        'episode_id', v_episode_id,
        'episode_number', v_episode_number,
        'primary_visit_id', v_visit_id,
        'opd_visit_id', v_opd_visit_id,
        'ipd_visit_id', v_ipd_visit_id,
        'critical_care_visit_id', v_cc_visit_id,
        'bed_assignment_id', v_assignment_id,
        'critical_care_admission_id', v_cc_admission_id,
        'ot_booking_id', v_ot_booking_id,
        'admission_discount_amount', v_admission_discount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. HARDENED CREATE_EPISODE_SETTLEMENT_INVOICE_ATOMIC_V2 (CASHIER RBAC & RECONCILIATION)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_episode_settlement_invoice_atomic_v2(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_cashier_id UUID,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0,
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
    v_caller_id UUID := auth.uid();
    v_cashier_id UUID;
    v_episode RECORD;
    v_preview JSONB;
    v_lines JSONB;
    v_line JSONB;
    v_subtotal NUMERIC := 0;
    v_discount NUMERIC := COALESCE(p_discount_amount, 0);
    v_grand_total NUMERIC := 0;
    v_paid NUMERIC := COALESCE(p_initial_payment_amount, 0);
    v_due NUMERIC := 0;
    v_status TEXT := 'UNPAID';
    v_invoice_id UUID;
    v_invoice_number TEXT;
    v_receipt_number TEXT;
    v_payment_id UUID;
    v_primary_visit_id UUID;
    v_ref_id UUID;
    v_included_count INTEGER := 0;
    v_payment_method TEXT := UPPER(COALESCE(NULLIF(trim(p_payment_method), ''), 'CASH'));
BEGIN
    -- 1. Tenant, Authentication, and RBAC Guard
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_BILLING_SETTLEMENT';
    END IF;

    -- Authoritative Cashier Identity
    v_cashier_id := v_caller_id;

    -- 2. Validate Payment Method & Non-negative Constraints
    IF v_payment_method NOT IN ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_BANKING') THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
    END IF;

    IF v_discount < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_DISCOUNT_PROHIBITED';
    END IF;

    IF v_paid < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_PAYMENT_PROHIBITED';
    END IF;

    -- 3. Lock and Verify Episode
    SELECT *
      INTO v_episode
    FROM public.patient_care_episodes
    WHERE id = p_episode_id
      AND organization_id = p_org_id
      AND patient_id = p_patient_id
    FOR UPDATE;

    IF v_episode.id IS NULL THEN RAISE EXCEPTION 'EPISODE_NOT_FOUND'; END IF;
    IF v_episode.status <> 'ACTIVE' THEN RAISE EXCEPTION 'EPISODE_NOT_ACTIVE'; END IF;

    -- 4. Gather Unbilled Candidates (already excludes persistent waivers)
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

    IF v_discount > v_subtotal THEN
      v_discount := v_subtotal;
    END IF;

    v_grand_total := ROUND(v_subtotal - v_discount, 2);

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

    -- 5. Generate Invoice Number & Insert Invoice
    SELECT public.generate_invoice_number(p_org_id) INTO v_invoice_number;

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
      p_notes, v_cashier_id, NOW(), NOW()
    )
    RETURNING id INTO v_invoice_id;

    -- 6. Insert Line Items
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

      -- Mark custom charge as billed
      IF COALESCE((v_line->>'is_custom_charge')::BOOLEAN, FALSE) = TRUE AND (v_line->>'charge_id') IS NOT NULL THEN
        UPDATE public.episode_service_charges
        SET is_billed = TRUE, status = 'BILLED', updated_at = NOW()
        WHERE id = (v_line->>'charge_id')::UUID
          AND organization_id = p_org_id;
      END IF;
    END LOOP;

    -- 7. Record Payment if initial payment received
    IF v_paid > 0.005 THEN
      SELECT public.generate_receipt_number(p_org_id) INTO v_receipt_number;

      INSERT INTO public.payments (
        organization_id, invoice_id, patient_id, amount,
        payment_method, receipt_number, notes, created_by,
        payment_date, created_at
      )
      VALUES (
        p_org_id, v_invoice_id, p_patient_id, v_paid,
        v_payment_method, v_receipt_number,
        COALESCE(p_notes, 'Episode final settlement initial payment'),
        v_cashier_id, NOW(), NOW()
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
      'receipt_number', v_receipt_number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. HARDEN SERVICE CHARGE RPCS (RBAC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_episode_service_charge_atomic(
    p_org_id UUID,
    p_episode_id UUID,
    p_patient_id UUID,
    p_category VARCHAR,
    p_item_name VARCHAR,
    p_quantity NUMERIC,
    p_unit_price NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_charge_id UUID;
    v_clean_name TEXT := NULLIF(trim(p_item_name), '');
    v_clean_cat TEXT := UPPER(COALESCE(NULLIF(trim(p_category), ''), 'MISC'));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
        OR public.is_org_admin_or_has_permission(p_org_id, 'clinical.manage')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'ITEM_NAME_REQUIRED';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    IF p_unit_price IS NULL OR p_unit_price < 0 THEN
        RAISE EXCEPTION 'INVALID_UNIT_PRICE';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.patient_care_episodes
        WHERE id = p_episode_id AND organization_id = p_org_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'ACTIVE_EPISODE_NOT_FOUND';
    END IF;

    INSERT INTO public.episode_service_charges (
        organization_id, episode_id, patient_id, service_category,
        item_name, quantity, unit_price, status, notes, created_by, created_at, updated_at
    )
    VALUES (
        p_org_id, p_episode_id, p_patient_id, v_clean_cat,
        v_clean_name, p_quantity, p_unit_price, 'UNBILLED', p_notes, auth.uid(), NOW(), NOW()
    )
    RETURNING id INTO v_charge_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'charge_id', v_charge_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_episode_service_charge_atomic(
    p_org_id UUID,
    p_charge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    DELETE FROM public.episode_service_charges
    WHERE id = p_charge_id
      AND organization_id = p_org_id
      AND status = 'UNBILLED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHARGE_NOT_FOUND_OR_ALREADY_INVOICED';
    END IF;

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.add_episode_service_charge_atomic(UUID, UUID, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_episode_service_charge_atomic(UUID, UUID, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_episode_service_charge_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_episode_service_charge_atomic(UUID, UUID) TO authenticated, service_role;

COMMIT;
