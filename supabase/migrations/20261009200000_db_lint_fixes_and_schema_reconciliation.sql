-- ==============================================================================
-- Migration 132: Database Lint Fixes & Canonical Schema Reconciliation
-- ==============================================================================
-- Description:
--   Resolves all lint errors detected by `supabase db lint --linked`:
--   1. Adds referral_agent_id column and index to public.invoices.
--   2. Defines public.generate_patient_registration_serial(UUID, TIMESTAMPTZ).
--   3. Reconciles public.assign_patient_referral_atomic to reference public.patient_visits.
--   4. Reconciles public.admit_patient_to_bed_atomic to insert into public.patient_visits.
--   5. Fixes get_episode_billing_overview to reference cca.admission_time and cca.discharge_time.
--   6. Fixes waive_episode_service_atomic to reference cca.admission_time and cca.discharge_time.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ADD REFERRAL_AGENT_ID TO INVOICES
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS referral_agent_id UUID REFERENCES public.referral_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_referral_agent
  ON public.invoices(organization_id, referral_agent_id);

-- ------------------------------------------------------------------------------
-- 2. DEFINE GENERATE_PATIENT_REGISTRATION_SERIAL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_patient_registration_serial(
    p_org_id UUID,
    p_encounter_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_date_prefix TEXT := TO_CHAR(COALESCE(p_encounter_at, NOW()) AT TIME ZONE 'Asia/Dhaka', 'YYMMDD');
    v_daily_count BIGINT;
    v_serial TEXT;
BEGIN
    SELECT COUNT(*) + 1
    INTO v_daily_count
    FROM public.patients
    WHERE organization_id = p_org_id
      AND registration_serial LIKE v_date_prefix || '-%';

    v_serial := v_date_prefix || '-' || LPAD(v_daily_count::TEXT, 4, '0');
    RETURN v_serial;
END;
$$;

COMMENT ON FUNCTION public.generate_patient_registration_serial(UUID, TIMESTAMPTZ) IS
'Authoritative sequence generator for daily patient registration serials in YYMMDD-XXXX format.';

REVOKE ALL ON FUNCTION public.generate_patient_registration_serial(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_patient_registration_serial(UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. RECONCILE ASSIGN_PATIENT_REFERRAL_ATOMIC (patient_visits)
-- ------------------------------------------------------------------------------
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
    v_active_org UUID;
    v_calling_user UUID;
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
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'accountant', 'cashier', 'receptionist')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.manage', 'referral.create', 'patients.edit', '*')
            )
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks referral attribution permission' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Validate active agent if provided
    IF p_agent_id IS NOT NULL THEN
        SELECT id, is_active, status, organization_id, agent_name
        INTO v_agent
        FROM public.referral_agents
        WHERE id = p_agent_id;

        IF v_agent.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referral agent not found.');
        END IF;

        IF v_agent.organization_id != p_org_id THEN
            RAISE EXCEPTION 'Access denied: Agent does not belong to organization %', p_org_id USING ERRCODE = '42501';
        END IF;

        IF v_agent.is_active IS FALSE OR v_agent.status != 'ACTIVE' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referral agent is not active.');
        END IF;
    END IF;

    -- Record referral attribution
    INSERT INTO public.patient_referral_attributions (
        organization_id,
        patient_id,
        visit_id,
        agent_id,
        assigned_by,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        p_patient_id,
        p_visit_id,
        p_agent_id,
        v_calling_user,
        p_notes,
        NOW()
    ) RETURNING id INTO v_attrib_id;

    RETURN jsonb_build_object('success', true, 'attribution_id', v_attrib_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. RECONCILE ADMIT_PATIENT_TO_BED_ATOMIC (patient_visits)
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

    -- 1. Authentication & Organization Validation
    IF v_active_org IS NULL OR v_active_org != p_organization_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- 2. Authorization check
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

    -- 3. Validation: At least one of bed_id or cabin_id must be provided
    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: Either bed_id or cabin_id must be specified';
    END IF;

    -- 4. Verify patient belongs to organization
    SELECT full_name, organization_id INTO v_patient_name, v_patient_org
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_name IS NULL THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: Patient % does not exist', p_patient_id;
    END IF;

    IF v_patient_org != p_organization_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Patient belongs to organization % but admission requested for %', v_patient_org, p_organization_id USING ERRCODE = '42501';
    END IF;

    -- 5. Row-level Lock and Concurrency Validation for Bed
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

    -- 6. Row-level Lock and Concurrency Validation for Cabin
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

    -- 7. Create Inpatient Visit in canonical public.patient_visits
    INSERT INTO public.patient_visits (
        organization_id,
        patient_id,
        visit_number,
        doctor_id,
        visit_type,
        admitted_at,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_organization_id,
        p_patient_id,
        'VISIT-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Dhaka', 'YYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 6),
        p_doctor_id,
        COALESCE(p_admission_type, 'IPD'),
        NOW(),
        'ADMITTED',
        NOW(),
        NOW()
    ) RETURNING id INTO v_visit_id;

    -- 8. Create Bed Assignment
    INSERT INTO public.bed_assignments (
        organization_id,
        patient_id,
        visit_id,
        bed_id,
        cabin_id,
        admission_date,
        daily_charge,
        status,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_organization_id,
        p_patient_id,
        v_visit_id,
        p_bed_id,
        p_cabin_id,
        NOW(),
        COALESCE(v_charge, 0),
        'ACTIVE',
        p_chief_complaint,
        COALESCE(v_calling_user, p_assigned_by),
        NOW()
    ) RETURNING id INTO v_assignment_id;

    -- 9. Mark Bed/Cabin Occupied
    IF p_bed_id IS NOT NULL THEN
        UPDATE public.beds
        SET status = 'OCCUPIED', updated_at = NOW()
        WHERE id = p_bed_id;
    END IF;

    IF p_cabin_id IS NOT NULL THEN
        UPDATE public.cabins
        SET status = 'OCCUPIED', updated_at = NOW()
        WHERE id = p_cabin_id;
    END IF;

    -- 10. Record Referral Attribution if referral agent is supplied
    IF p_referral_agent_id IS NOT NULL THEN
        SELECT id, is_active, status, organization_id, agent_name
        INTO v_ref_agent
        FROM public.referral_agents
        WHERE id = p_referral_agent_id;

        IF v_ref_agent.id IS NOT NULL
           AND v_ref_agent.organization_id = p_organization_id
           AND v_ref_agent.is_active IS TRUE
           AND v_ref_agent.status = 'ACTIVE' THEN
            INSERT INTO public.patient_referral_attributions (
                organization_id,
                patient_id,
                visit_id,
                agent_id,
                assigned_by,
                notes,
                created_at
            ) VALUES (
                p_organization_id,
                p_patient_id,
                v_visit_id,
                p_referral_agent_id,
                v_calling_user,
                'Automated admission attribution for ' || COALESCE(v_bed_number, 'Inpatient Bed'),
                NOW()
            ) RETURNING id INTO v_attrib_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'visit_id', v_visit_id,
        'assignment_id', v_assignment_id,
        'bed_number', v_bed_number,
        'daily_charge', v_charge,
        'patient_name', v_patient_name,
        'admitted_at', NOW(),
        'attribution_id', v_attrib_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. RECONCILE GET_EPISODE_BILLING_OVERVIEW (cca.admission_time)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_episode_billing_overview(
    p_org_id UUID,
    p_episode_id UUID,
    p_as_of TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode RECORD;
    v_patient_id UUID;
    v_episode_id UUID;
    v_consultations JSONB;
    v_bed_stays JSONB;
    v_critical JSONB;
    v_additional_charges JSONB;
    v_surgeries JSONB;
    v_invoices JSONB;
    v_waived_items JSONB;
    v_unbilled_lines JSONB;
    v_total_unbilled NUMERIC(14, 2) := 0;
    v_total_invoiced NUMERIC(14, 2) := 0;
    v_total_paid NUMERIC(14, 2) := 0;
    v_total_due NUMERIC(14, 2) := 0;
    v_total_waived NUMERIC(14, 2) := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    SELECT
      e.id, e.organization_id, e.patient_id, e.episode_number,
      e.status, e.admission_type, e.started_at, e.closed_at,
      e.chief_complaint, e.initial_diagnosis, e.referral_agent_id,
      p.patient_code, p.full_name AS patient_name, p.phone AS patient_phone,
      ra.agent_name AS referral_agent_name
    INTO v_episode
    FROM public.patient_care_episodes e
    JOIN public.patients p ON p.id = e.patient_id
    LEFT JOIN public.referral_agents ra ON ra.id = e.referral_agent_id
    WHERE e.id = p_episode_id AND e.organization_id = p_org_id;

    IF v_episode.id IS NULL THEN
        RAISE EXCEPTION 'EPISODE_NOT_FOUND';
    END IF;

    v_patient_id := v_episode.patient_id;
    v_episode_id := v_episode.id;

    -- 1. Consultations
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.id,
          'visit_number', pv.visit_number,
          'visit_type', pv.visit_type,
          'doctor_id', pv.doctor_id,
          'doctor_name', doc.full_name,
          'consultation_fee', COALESCE(doc.consultation_fee, doc.opd_fee, 800.00),
          'admitted_at', pv.admitted_at,
          'status', pv.status
        )
        ORDER BY pv.admitted_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_consultations
    FROM public.patient_visits pv
    LEFT JOIN public.doctors doc ON doc.id = pv.doctor_id
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id
      AND pv.visit_type = 'OPD';

    -- 2. Bed & Cabin Stays
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ba.id,
          'bed_id', ba.bed_id,
          'bed_number', b.bed_number,
          'cabin_id', ba.cabin_id,
          'cabin_number', c.cabin_number,
          'ward_name', w.name,
          'assigned_at', ba.assigned_at,
          'vacated_at', ba.vacated_at,
          'daily_charge', ba.daily_charge,
          'billable_days', public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of)),
          'status', ba.status
        )
        ORDER BY ba.assigned_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_bed_stays
    FROM public.bed_assignments ba
    JOIN public.patient_visits pv ON pv.id = ba.visit_id
    LEFT JOIN public.beds b ON b.id = ba.bed_id
    LEFT JOIN public.cabins c ON c.id = ba.cabin_id
    LEFT JOIN public.wards w ON w.id = b.ward_id
    WHERE ba.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id;

    -- 3. Critical Care Summary (using cca.admission_time)
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

    -- 5. Build Aggregated Unbilled Candidate Lines (excluding invoiced and actively waived)
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
          SELECT 1 FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id AND inv.is_voided = FALSE AND ii.reference_id = pv.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id AND w.episode_id = v_episode_id AND w.reference_id = pv.id AND w.status = 'ACTIVE'
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
          SELECT 1 FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id AND inv.is_voided = FALSE AND ii.reference_id = ba.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id AND w.episode_id = v_episode_id AND w.reference_id = ba.id AND w.status = 'ACTIVE'
        )

      UNION ALL

      -- C. Critical Care Stays (using cca.admission_time)
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
          SELECT 1 FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id AND inv.is_voided = FALSE AND ii.reference_id = cca.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id AND w.episode_id = v_episode_id AND w.reference_id = cca.id AND w.status = 'ACTIVE'
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
          SELECT 1 FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id AND inv.is_voided = FALSE AND ii.reference_id = esc.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id AND w.episode_id = v_episode_id AND w.reference_id = esc.id AND w.status = 'ACTIVE'
        )

      UNION ALL

      -- E. Unbilled Operation Theatre (OT) Procedures
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
          SELECT 1 FROM public.invoice_items ii
          JOIN public.invoices inv ON inv.id = ii.invoice_id
          WHERE inv.organization_id = p_org_id AND inv.is_voided = FALSE AND ii.reference_id = ob.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.episode_service_waivers w
          WHERE w.organization_id = p_org_id AND w.episode_id = v_episode_id AND w.reference_id = ob.id AND w.status = 'ACTIVE'
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
        ROUND((unit_price * quantity), 2) AS line_total,
        started_at
      FROM candidates
    )
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'source_id', source_id,
            'charge_id', charge_id,
            'is_custom_charge', is_custom_charge,
            'category', category,
            'item_name', item_name,
            'unit_price', unit_price,
            'quantity', quantity,
            'line_total', line_total,
            'started_at', started_at
          )
          ORDER BY started_at ASC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(line_total), 0)
    INTO v_unbilled_lines, v_total_unbilled
    FROM priced;

    -- 6. Additional Episode Charges Detailed Listing
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', esc.id,
          'service_category', esc.service_category,
          'item_name', esc.item_name,
          'description', esc.description,
          'quantity', esc.quantity,
          'unit_price', esc.unit_price,
          'total_amount', esc.total_amount,
          'status', esc.status,
          'is_billed', esc.is_billed,
          'created_at', esc.created_at
        )
        ORDER BY esc.created_at ASC
      ),
      '[]'::JSONB
    )
    INTO v_additional_charges
    FROM public.episode_service_charges esc
    WHERE esc.organization_id = p_org_id
      AND esc.patient_id = v_patient_id
      AND esc.episode_id = v_episode_id;

    -- 7. OT Procedures Detailed Listing
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ob.id,
          'procedure_name', ob.procedure_name,
          'scheduled_start', ob.scheduled_start,
          'ot_charge', ob.ot_charge,
          'status', ob.status
        )
        ORDER BY ob.scheduled_start ASC
      ),
      '[]'::JSONB
    )
    INTO v_surgeries
    FROM public.ot_bookings ob
    JOIN public.patient_visits pv ON pv.id = ob.visit_id
    WHERE ob.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id;

    -- 8. Existing Invoices for this Episode
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', inv.id,
            'invoice_number', inv.invoice_number,
            'total_amount', inv.total_amount,
            'discount_amount', inv.discount_amount,
            'grand_total', inv.grand_total,
            'paid_amount', inv.paid_amount,
            'due_amount', inv.due_amount,
            'status', inv.status,
            'created_at', inv.created_at
          )
          ORDER BY inv.created_at DESC
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(inv.grand_total), 0),
      COALESCE(SUM(inv.paid_amount), 0),
      COALESCE(SUM(inv.due_amount), 0)
    INTO v_invoices, v_total_invoiced, v_total_paid, v_total_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.patient_id = v_patient_id
      AND inv.episode_id = v_episode_id
      AND inv.is_voided = FALSE;

    -- Total Waived Sum
    SELECT COALESCE(SUM(waived_amount), 0)
    INTO v_total_waived
    FROM public.episode_service_waivers
    WHERE organization_id = p_org_id
      AND patient_id = v_patient_id
      AND episode_id = v_episode_id
      AND status = 'ACTIVE';

    RETURN jsonb_build_object(
      'success', TRUE,
      'episode', jsonb_build_object(
        'id', v_episode.id,
        'episode_number', v_episode.episode_number,
        'status', v_episode.status,
        'admission_type', v_episode.admission_type,
        'started_at', v_episode.started_at,
        'closed_at', v_episode.closed_at,
        'chief_complaint', v_episode.chief_complaint,
        'initial_diagnosis', v_episode.initial_diagnosis,
        'patient_code', v_episode.patient_code,
        'patient_name', v_episode.patient_name,
        'patient_phone', v_episode.patient_phone,
        'referral_agent_id', v_episode.referral_agent_id,
        'referral_agent_name', v_episode.referral_agent_name
      ),
      'consultations', v_consultations,
      'bed_stays', v_bed_stays,
      'critical_care_stays', v_critical,
      'additional_charges', v_additional_charges,
      'surgeries', v_surgeries,
      'invoices', v_invoices,
      'waived_items', v_waived_items,
      'unbilled_lines', v_unbilled_lines,
      'totals', jsonb_build_object(
        'unbilled_amount', v_total_unbilled,
        'invoiced_grand_total', v_total_invoiced,
        'paid_amount', v_total_paid,
        'due_amount', v_total_due,
        'waived_amount', v_total_waived,
        'net_estimated_total', ROUND((v_total_invoiced + v_total_unbilled), 2)
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. RECONCILE WAIVE_EPISODE_SERVICE_ATOMIC (cca.admission_time)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.waive_episode_service_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_reference_id UUID,
    p_service_category VARCHAR DEFAULT NULL,
    p_item_name TEXT DEFAULT NULL,
    p_waived_amount NUMERIC DEFAULT NULL,
    p_waiver_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_reason TEXT := NULLIF(trim(p_waiver_reason), '');
    v_waiver_id UUID;
    v_derived_category VARCHAR(50);
    v_derived_item_name TEXT;
    v_derived_amount NUMERIC(14, 2);
    v_final_waived_amount NUMERIC(14, 2);
BEGIN
    -- 1. Authentication Check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    -- 2. Tenant Isolation Check
    IF private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    -- 3. RBAC Privilege Enforcement
    IF NOT (
        public.is_org_admin_or_has_permission(p_org_id, 'billing.manage')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.discount')
        OR public.is_org_admin_or_has_permission(p_org_id, 'billing.create')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_WAIVER';
    END IF;

    -- 4. Audit Reason Validation
    IF v_clean_reason IS NULL OR char_length(v_clean_reason) < 3 THEN
        RAISE EXCEPTION 'WAIVER_REASON_REQUIRED_MIN_3_CHARS';
    END IF;

    -- 5. Concurrency Control: Acquire Row Lock on Episode
    PERFORM 1 FROM public.patient_care_episodes
    WHERE id = p_episode_id AND organization_id = p_org_id AND patient_id = p_patient_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EPISODE_NOT_FOUND';
    END IF;

    -- 6. Unbilled Invariant: Reject if Item is Already Billed in an Active Invoice
    IF EXISTS (
        SELECT 1
        FROM public.invoice_items ii
        JOIN public.invoices inv ON inv.id = ii.invoice_id
        WHERE inv.organization_id = p_org_id
          AND inv.is_voided = FALSE
          AND ii.reference_id = p_reference_id
    ) THEN
        RAISE EXCEPTION 'ITEM_ALREADY_INVOICED';
    END IF;

    -- 7. Server-Authoritative Derivation from Source Tables
    -- A. OPD Consultation
    SELECT
        'OPD'::VARCHAR,
        ('OPD Consultation - ' || COALESCE(doc.full_name, 'Attending Doctor'))::TEXT,
        COALESCE(doc.consultation_fee, doc.opd_fee, 800.00)::NUMERIC
    INTO v_derived_category, v_derived_item_name, v_derived_amount
    FROM public.patient_visits pv
    JOIN public.doctors doc ON doc.id = pv.doctor_id
    WHERE pv.id = p_reference_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = p_patient_id
      AND pv.episode_id = p_episode_id;

    -- B. Bed or Cabin Stay
    IF v_derived_amount IS NULL THEN
        SELECT
            (CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END)::VARCHAR,
            (CASE
                WHEN ba.cabin_id IS NOT NULL THEN 'Cabin Stay - ' || COALESCE(c.cabin_number, 'Cabin')
                ELSE 'Bed Stay - ' || COALESCE(b.bed_number, 'Bed')
            END)::TEXT,
            (COALESCE(ba.daily_charge, 0) * public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, NOW())))::NUMERIC
        INTO v_derived_category, v_derived_item_name, v_derived_amount
        FROM public.bed_assignments ba
        JOIN public.patient_visits pv ON pv.id = ba.visit_id
        LEFT JOIN public.beds b ON b.id = ba.bed_id
        LEFT JOIN public.cabins c ON c.id = ba.cabin_id
        WHERE ba.id = p_reference_id
          AND ba.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = p_episode_id;
    END IF;

    -- C. Critical Care Unit Stay (using cca.admission_time)
    IF v_derived_amount IS NULL THEN
        SELECT
            'MISC'::VARCHAR,
            ('Critical Care - ' || COALESCE(u.unit_name, u.unit_type, 'Unit') || ' (' || cca.bed_number || ')')::TEXT,
            (COALESCE(u.daily_charge, 0) * public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, NOW())))::NUMERIC
        INTO v_derived_category, v_derived_item_name, v_derived_amount
        FROM public.critical_care_admissions cca
        JOIN public.critical_care_units u ON u.id = cca.unit_id
        WHERE cca.id = p_reference_id
          AND cca.organization_id = p_org_id
          AND cca.patient_id = p_patient_id
          AND (cca.episode_id = p_episode_id OR (cca.episode_id IS NULL AND cca.status IN ('admitted', 'ACTIVE', 'ADMITTED')));
    END IF;

    -- D. Additional Episode Service Charges
    IF v_derived_amount IS NULL THEN
        SELECT
            esc.service_category::VARCHAR,
            COALESCE(esc.item_name, esc.description, 'Service Charge')::TEXT,
            (COALESCE(esc.unit_price, 0) * COALESCE(esc.quantity, 1))::NUMERIC
        INTO v_derived_category, v_derived_item_name, v_derived_amount
        FROM public.episode_service_charges esc
        WHERE esc.id = p_reference_id
          AND esc.organization_id = p_org_id
          AND esc.patient_id = p_patient_id
          AND esc.episode_id = p_episode_id
          AND COALESCE(esc.is_billed, FALSE) = FALSE;
    END IF;

    -- E. Operation Theatre (OT) Procedures
    IF v_derived_amount IS NULL THEN
        SELECT
            'PROCEDURE'::VARCHAR,
            ('OT Surgery - ' || COALESCE(ob.procedure_name, 'Surgical Procedure'))::TEXT,
            COALESCE(ob.ot_charge, 0)::NUMERIC
        INTO v_derived_category, v_derived_item_name, v_derived_amount
        FROM public.ot_bookings ob
        JOIN public.patient_visits pv ON pv.id = ob.visit_id
        WHERE ob.id = p_reference_id
          AND ob.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = p_episode_id
          AND ob.status != 'CANCELLED';
    END IF;

    -- Invariant: Service Must Exist and Belong to This Episode/Patient
    IF v_derived_amount IS NULL THEN
        RAISE EXCEPTION 'REFERENCED_SERVICE_NOT_FOUND_OR_INELIGIBLE';
    END IF;

    -- Derive Final Authoritative Waived Amount
    IF p_waived_amount IS NOT NULL AND p_waived_amount > 0 AND p_waived_amount <= v_derived_amount THEN
        v_final_waived_amount := ROUND(p_waived_amount, 2);
    ELSE
        v_final_waived_amount := ROUND(v_derived_amount, 2);
    END IF;

    -- Deactivate previous active waiver
    UPDATE public.episode_service_waivers
    SET status = 'RESTORED', updated_at = NOW()
    WHERE organization_id = p_org_id
      AND episode_id = p_episode_id
      AND reference_id = p_reference_id
      AND status = 'ACTIVE';

    -- Insert new active waiver
    INSERT INTO public.episode_service_waivers (
        organization_id, patient_id, episode_id, reference_id,
        service_category, item_name, waived_amount, waiver_reason,
        waived_by, status, created_at, updated_at
    )
    VALUES (
        p_org_id, p_patient_id, p_episode_id, p_reference_id,
        COALESCE(v_derived_category, p_service_category, 'MISC'),
        COALESCE(v_derived_item_name, p_item_name, 'Service Charge'),
        v_final_waived_amount, v_clean_reason,
        auth.uid(), 'ACTIVE', NOW(), NOW()
    )
    RETURNING id INTO v_waiver_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'waiver_id', v_waiver_id,
        'waived_amount', v_final_waived_amount,
        'item_name', COALESCE(v_derived_item_name, p_item_name, 'Service Charge')
    );
END;
$$;

COMMENT ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) IS
'Authoritative server-validated atomic service charge waiver with source entity verification, concurrency row lock, and duplicate prevention.';

REVOKE ALL ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waive_episode_service_atomic(UUID, UUID, UUID, UUID, VARCHAR, TEXT, NUMERIC, TEXT) TO authenticated, service_role;

COMMIT;
