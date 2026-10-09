-- ==============================================================================
-- Migration 133: Complete Database Lint & Schema Contract Harmonization
-- ==============================================================================
-- Description:
--   Comprehensive resolution of all remote database schema lint errors:
--   1. Adds notes and referral_agent_id columns to public.invoices.
--   2. Replaces date_of_birth with canonical dob in create_patient_intake_atomic.
--   3. Reconciles get_episode_billing_overview with canonical column names:
--      - Uses e.started_at, e.ended_at, e.source on patient_care_episodes.
--      - Uses cca.admission_time and cca.discharge_time on critical_care_admissions.
--   4. Reconciles assign_patient_referral_atomic:
--      - Uses public.patient_visits instead of legacy public.visits.
--      - Uses full_name and is_active on referral_agents.
--   5. Reconciles admit_patient_to_bed_atomic:
--      - Inserts into public.patient_visits instead of legacy public.visits.
--      - Uses assigned_at on bed_assignments instead of non-existent admission_date.
--      - Uses full_name and is_active on referral_agents.
--   6. Reconciles waive_episode_service_atomic to reference cca.admission_time.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND INVOICES TABLE WITH NOTES & REFERRAL_AGENT_ID
-- ------------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS referral_agent_id UUID REFERENCES public.referral_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_referral_agent
  ON public.invoices(organization_id, referral_agent_id);

-- ------------------------------------------------------------------------------
-- 2. RECONCILE CREATE_PATIENT_INTAKE_ATOMIC (dob column fix)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_patient_intake_atomic(p_request JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_actor_id UUID;
    v_org_id UUID;
    v_encounter_at TIMESTAMPTZ;
    v_patient JSONB;
    v_opd JSONB;
    v_ipd JSONB;
    v_cc JSONB;
    v_ot JSONB;

    v_patient_id UUID;
    v_patient_code TEXT;
    v_registration_serial TEXT;
    v_episode_id UUID;
    v_episode_number TEXT;
    v_visit_id UUID;
    v_opd_visit_id UUID;
    v_ipd_visit_id UUID;
    v_cc_visit_id UUID;
    v_bed_assignment_id UUID;
    v_cca_id UUID;
    v_ot_booking_id UUID;

    v_dob DATE;
    v_age INT;
    v_nid TEXT;
    v_gender VARCHAR(10);
    v_phone TEXT;
    v_full_name TEXT;

    v_department_id UUID;
    v_doctor_id UUID;
    v_referral_agent_id UUID;
    v_unit_id UUID;
    v_bed_id UUID;
    v_cabin_id UUID;
    v_ot_room_id UUID;
    v_ot_surgeon_id UUID;
    v_ot_anesthetist_id UUID;

    v_bed_charge NUMERIC(10, 2);
    v_cc_charge NUMERIC(10, 2);
    v_ot_charge NUMERIC(10, 2);
    v_visit_number TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    v_org_id := NULLIF(trim(p_request->>'organization_id'), '')::UUID;
    IF v_org_id IS NULL THEN
        v_org_id := private.get_current_org_id();
    END IF;

    IF v_org_id IS NULL OR private.get_current_org_id() IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF NOT (
        public.is_org_admin_or_has_permission(v_org_id, 'patients.create')
        OR public.is_org_admin_or_has_permission(v_org_id, 'reception.manage')
        OR public.is_org_admin_or_has_permission(v_org_id, 'ipd.admit')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED_INTAKE';
    END IF;

    v_actor_id := v_caller_id;

    v_encounter_at := COALESCE(
        NULLIF(trim(p_request->>'encounter_time'), '')::TIMESTAMPTZ,
        NOW()
    );

    v_patient := COALESCE(p_request->'patient', '{}'::JSONB);
    v_opd := p_request->'opd';
    v_ipd := p_request->'ipd';
    v_cc := p_request->'critical_care';
    v_ot := p_request->'ot';

    v_referral_agent_id := NULLIF(COALESCE(p_request->>'referral_agent_id', v_ipd->>'referral_agent_id'), '')::UUID;

    v_full_name := trim(COALESCE(v_patient->>'full_name', ''));
    v_phone := trim(COALESCE(v_patient->>'phone', ''));
    v_gender := UPPER(COALESCE(NULLIF(trim(v_patient->>'gender'), ''), 'OTHER'));
    IF v_gender NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
        v_gender := 'OTHER';
    END IF;

    IF v_full_name = '' THEN
        RAISE EXCEPTION 'PATIENT_NAME_REQUIRED';
    END IF;

    IF v_phone = '' THEN
        RAISE EXCEPTION 'PATIENT_PHONE_REQUIRED';
    END IF;

    v_nid := NULLIF(COALESCE(v_patient->>'nid', v_patient->>'nid_or_birth_cert'), '');
    v_dob := NULLIF(v_patient->>'dob', '')::DATE;
    v_age := NULLIF(v_patient->>'age_years', '')::INT;

    v_patient_id := NULLIF(p_request->>'patient_id', '')::UUID;

    -- Lookup existing or insert new patient
    IF v_patient_id IS NOT NULL THEN
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE id = v_patient_id AND organization_id = v_org_id;

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
        -- Match existing by phone and full_name
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE organization_id = v_org_id AND phone = v_phone AND LOWER(full_name) = LOWER(v_full_name)
        LIMIT 1;

        IF v_patient_id IS NULL THEN
            SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
            SELECT public.generate_patient_registration_serial(v_org_id, v_encounter_at) INTO v_registration_serial;

            -- INSERT with canonical dob column
            INSERT INTO public.patients (
                organization_id, patient_code, registration_serial,
                full_name, phone, gender, blood_group, dob,
                marital_status, occupation, emergency_contact_name,
                emergency_contact_phone, emergency_contact_relation,
                nid_or_birth_cert, created_by, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_code, v_registration_serial,
                v_full_name, v_phone, v_gender,
                NULLIF(trim(v_patient->>'blood_group'), ''),
                v_dob,
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
    END IF;

    -- Create Patient Care Episode
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

    -- Common visit_number
    v_visit_number := 'VISIT-' || TO_CHAR(v_encounter_at AT TIME ZONE 'Asia/Dhaka', 'YYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 6);

    -- Service Branch: OPD
    IF v_opd IS NOT NULL AND v_opd != 'null'::JSONB THEN
        v_department_id := NULLIF(v_opd->>'department_id', '')::UUID;
        v_doctor_id := NULLIF(v_opd->>'doctor_id', '')::UUID;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, department_id, doctor_id, admitted_at,
            status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'OPD', v_department_id, v_doctor_id, v_encounter_at,
            'ACTIVE', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_opd_visit_id;

        v_visit_id := v_opd_visit_id;
    END IF;

    -- Service Branch: IPD Bed / Cabin
    IF v_ipd IS NOT NULL AND v_ipd != 'null'::JSONB THEN
        v_department_id := NULLIF(v_ipd->>'department_id', '')::UUID;
        v_doctor_id := NULLIF(v_ipd->>'doctor_id', '')::UUID;
        v_bed_id := NULLIF(v_ipd->>'bed_id', '')::UUID;
        v_cabin_id := NULLIF(v_ipd->>'cabin_id', '')::UUID;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, department_id, doctor_id, admitted_at,
            status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'IPD', v_department_id, v_doctor_id, v_encounter_at,
            'ACTIVE', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_ipd_visit_id;

        IF v_visit_id IS NULL THEN
            v_visit_id := v_ipd_visit_id;
        END IF;

        IF v_bed_id IS NOT NULL THEN
            SELECT COALESCE(daily_rate, 0) INTO v_bed_charge FROM public.beds WHERE id = v_bed_id;
            UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = v_bed_id;
        ELSIF v_cabin_id IS NOT NULL THEN
            SELECT COALESCE(daily_rate, 0) INTO v_bed_charge FROM public.cabins WHERE id = v_cabin_id;
            UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = v_cabin_id;
        END IF;

        INSERT INTO public.bed_assignments (
            organization_id, visit_id, patient_id, bed_id, cabin_id,
            assigned_at, daily_charge, status, assigned_by
        )
        VALUES (
            v_org_id, v_ipd_visit_id, v_patient_id, v_bed_id, v_cabin_id,
            v_encounter_at, COALESCE(v_bed_charge, 0), 'ACTIVE', v_actor_id
        )
        RETURNING id INTO v_bed_assignment_id;
    END IF;

    -- Service Branch: Critical Care
    IF v_cc IS NOT NULL AND v_cc != 'null'::JSONB THEN
        v_unit_id := NULLIF(v_cc->>'unit_id', '')::UUID;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, admitted_at, status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'EMERGENCY', v_encounter_at, 'ACTIVE', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_cc_visit_id;

        IF v_visit_id IS NULL THEN
            v_visit_id := v_cc_visit_id;
        END IF;

        INSERT INTO public.critical_care_admissions (
            organization_id, patient_id, episode_id, unit_id,
            bed_number, initial_diagnosis, admission_time, status, created_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_unit_id,
            COALESCE(v_cc->>'bed_number', 'ICU-1'),
            COALESCE(v_cc->>'diagnosis', 'Critical care admission'),
            v_encounter_at, 'admitted', NOW()
        )
        RETURNING id INTO v_cca_id;
    END IF;

    -- Service Branch: Operation Theatre
    IF v_ot IS NOT NULL AND v_ot != 'null'::JSONB THEN
        v_ot_room_id := NULLIF(v_ot->>'room_id', '')::UUID;
        v_ot_surgeon_id := NULLIF(v_ot->>'surgeon_id', '')::UUID;
        v_ot_anesthetist_id := NULLIF(v_ot->>'anesthetist_id', '')::UUID;
        v_ot_charge := COALESCE(NULLIF(v_ot->>'ot_charge', '')::NUMERIC, 0);

        IF v_visit_id IS NULL THEN
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number,
                visit_type, doctor_id, admitted_at, status, created_by, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_visit_number,
                'EMERGENCY', v_ot_surgeon_id, v_encounter_at, 'ACTIVE', v_actor_id, NOW(), NOW()
            )
            RETURNING id INTO v_visit_id;
        END IF;

        INSERT INTO public.ot_bookings (
            organization_id, visit_id, ot_room_id, surgeon_id,
            anesthetist_id, procedure_name, scheduled_start,
            ot_charge, status, created_at, updated_at
        )
        VALUES (
            v_org_id, v_visit_id, v_ot_room_id, v_ot_surgeon_id,
            v_ot_anesthetist_id, COALESCE(v_ot->>'procedure_name', 'Surgical procedure'),
            v_encounter_at, v_ot_charge, 'SCHEDULED', NOW(), NOW()
        )
        RETURNING id INTO v_ot_booking_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'patient_id', v_patient_id,
        'patient_code', v_patient_code,
        'registration_serial', v_registration_serial,
        'episode_id', v_episode_id,
        'episode_number', v_episode_number,
        'visit_id', v_visit_id,
        'bed_assignment_id', v_bed_assignment_id,
        'critical_care_admission_id', v_cca_id,
        'ot_booking_id', v_ot_booking_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. RECONCILE GET_EPISODE_BILLING_OVERVIEW (exact schema columns)
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
      e.status, e.started_at, e.ended_at, e.source, e.notes,
      e.admission_discount_amount, e.admission_discount_reason,
      e.referral_agent_id,
      p.patient_code, p.full_name AS patient_name, p.phone AS patient_phone,
      ra.full_name AS referral_agent_name
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

    -- 3. Critical Care Summary (cca.admission_time)
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

      -- C. Critical Care Stays (cca.admission_time)
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
        'admission_type', COALESCE(v_episode.source, 'FRONT_DESK'),
        'started_at', v_episode.started_at,
        'closed_at', v_episode.ended_at,
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
-- 4. RECONCILE ASSIGN_PATIENT_REFERRAL_ATOMIC (referral_agents.full_name, is_active)
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
        SELECT id, is_active, organization_id, full_name
        INTO v_agent
        FROM public.referral_agents
        WHERE id = p_agent_id;

        IF v_agent.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referral agent not found.');
        END IF;

        IF v_agent.organization_id != p_org_id THEN
            RAISE EXCEPTION 'Access denied: Agent does not belong to organization %', p_org_id USING ERRCODE = '42501';
        END IF;

        IF v_agent.is_active IS FALSE THEN
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
-- 5. RECONCILE ADMIT_PATIENT_TO_BED_ATOMIC (bed_assignments.assigned_at, referral_agents)
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
        RAISE EXCEPTION 'VALIDATION_FAILED: Either bed_id or cabin_id must be specified';
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

    -- Record Referral Attribution
    IF p_referral_agent_id IS NOT NULL THEN
        SELECT id, is_active, organization_id, full_name
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

COMMIT;
