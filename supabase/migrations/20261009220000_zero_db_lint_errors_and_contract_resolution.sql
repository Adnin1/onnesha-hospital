-- ==============================================================================
-- Migration 134: Zero DB Lint Errors and Schema Harmonization Resolution
-- ==============================================================================
-- Description:
--   Resolves all remaining schema lint issues:
--   1. Adds created_by column to public.patient_visits.
--   2. Adds updated_at column to public.beds and public.cabins.
--   3. Adds organization_id column to public.invoice_items and backfills from invoices.
--   4. Harmonizes get_episode_billing_overview:
--      - Uses cca.admission_time and cca.discharge_time (eliminates non-existent admitted_at).
--      - Uses public.profiles (eliminates non-existent user_profiles).
--   5. Harmonizes assign_patient_referral_atomic to use canonical patient_referral_attributions schema.
--   6. Harmonizes admit_patient_to_bed_atomic to use canonical patient_referral_attributions schema.
--   7. Harmonizes create_episode_settlement_invoice_atomic_v2 for invoice_items organization_id.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ADD MISSING COLUMNS TO RELATIONS
-- ------------------------------------------------------------------------------

-- Add created_by to patient_visits
ALTER TABLE public.patient_visits
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_visits_created_by
  ON public.patient_visits(created_by);

-- Add updated_at to beds and cabins
ALTER TABLE public.beds
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.cabins
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add organization_id to invoice_items
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_invoice_items_organization
  ON public.invoice_items(organization_id);

-- Backfill organization_id on existing invoice_items
UPDATE public.invoice_items ii
SET organization_id = inv.organization_id
FROM public.invoices inv
WHERE ii.invoice_id = inv.id AND ii.organization_id IS NULL;


-- ------------------------------------------------------------------------------
-- 2. RECONCILE GET_EPISODE_BILLING_OVERVIEW
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

    -- 5. Invoices Summary
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

    -- 6. Unbilled Lines Assembly
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


-- ------------------------------------------------------------------------------
-- 3. RECONCILE ASSIGN_PATIENT_REFERRAL_ATOMIC
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.assign_patient_referral_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL,
    p_agent_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user UUID;
    v_active_org UUID;
    v_patient_org UUID;
    v_visit_org UUID;
    v_agent RECORD;
    v_attrib_id UUID;
    v_has_perm BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Verify patient belongs to organization
    SELECT organization_id INTO v_patient_org
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_org IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found.');
    END IF;

    IF v_patient_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Patient does not belong to organization %', p_org_id USING ERRCODE = '42501';
    END IF;

    -- Verify visit belongs to organization if provided
    IF p_visit_id IS NOT NULL THEN
        SELECT organization_id INTO v_visit_org
        FROM public.patient_visits
        WHERE id = p_visit_id;

        IF v_visit_org IS NOT NULL AND v_visit_org != p_org_id THEN
            RAISE EXCEPTION 'Access denied: Visit does not belong to organization %', p_org_id USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Verify caller authorization
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'receptionist', 'doctor', 'nurse', 'cashier')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.assign', 'referral.manage', 'billing.create', 'ipd.admit', '*')
            )
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks referral.assign permission.');
        END IF;
    END IF;

    IF p_agent_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral agent ID is required.');
    END IF;

    SELECT id, agent_code, full_name, is_active INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id AND organization_id = p_org_id;

    IF v_agent.id IS NULL OR v_agent.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected referral agent is inactive or invalid.');
    END IF;

    -- Deactivate any existing active attribution for this specific visit
    IF p_visit_id IS NOT NULL THEN
        UPDATE public.patient_referral_attributions
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE organization_id = p_org_id AND visit_id = p_visit_id AND status = 'ACTIVE';
    END IF;

    -- Record referral attribution using canonical columns
    INSERT INTO public.patient_referral_attributions (
        organization_id,
        patient_id,
        visit_id,
        referral_agent_id,
        referral_code_snapshot,
        referral_name_snapshot,
        assigned_by,
        status,
        notes,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_patient_id,
        p_visit_id,
        p_agent_id,
        v_agent.agent_code,
        v_agent.full_name,
        v_calling_user,
        'ACTIVE',
        p_notes,
        NOW(),
        NOW()
    ) RETURNING id INTO v_attrib_id;

    RETURN jsonb_build_object(
        'success', true,
        'attribution_id', v_attrib_id,
        'referral_code', v_agent.agent_code,
        'referral_name', v_agent.full_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4. RECONCILE ADMIT_PATIENT_TO_BED_ATOMIC
-- ------------------------------------------------------------------------------
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
    v_attrib_id UUID;
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

    -- Insert into bed_assignments (using assigned_at)
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

    -- Record Referral Attribution using canonical columns
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
                notes,
                created_at,
                updated_at
            ) VALUES (
                p_organization_id,
                p_patient_id,
                v_visit_id,
                p_referral_agent_id,
                v_ref_agent.agent_code,
                v_ref_agent.full_name,
                v_calling_user,
                'ACTIVE',
                'Automated admission attribution for ' || COALESCE(v_bed_number, 'Inpatient Bed'),
                NOW(),
                NOW()
            ) RETURNING id INTO v_attrib_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'visit_id', v_visit_id,
        'assignment_id', v_assignment_id,
        'attribution_id', v_attrib_id,
        'room_number', v_bed_number,
        'daily_charge', v_charge
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 5. RECONCILE CREATE_EPISODE_SETTLEMENT_INVOICE_ATOMIC_V2
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

    -- Record Initial Payment if made
    IF v_paid > 0.005 THEN
      SELECT public.generate_receipt_number(p_org_id) INTO v_receipt_number;

      INSERT INTO public.payments (
        organization_id, invoice_id, patient_id, amount,
        payment_method, receipt_number, notes, created_by,
        payment_date, created_at
      )
      VALUES (
        p_org_id, v_invoice_id, p_patient_id, v_paid,
        p_payment_method, v_receipt_number,
        COALESCE(p_notes, 'Episode final settlement initial payment'),
        p_cashier_id, NOW(), NOW()
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

COMMIT;
