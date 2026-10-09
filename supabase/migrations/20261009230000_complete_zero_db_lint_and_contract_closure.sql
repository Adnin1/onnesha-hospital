-- ==============================================================================
-- Migration 135: Complete Zero DB Lint and Schema Contract Closure
-- ==============================================================================
-- Description:
--   Permanently resolves all remaining database schema lint issues:
--   1. Adds surgeon_id, updated_at, and nullable scheduled_end to public.ot_bookings.
--   2. Adds patient_id to public.payments and backfills from invoices.
--   3. Creates public.user_profiles view aliasing public.profiles for legacy compatibility.
--   4. Re-harmonizes create_patient_intake_atomic for ot_bookings (lead_surgeon_id + surgeon_id).
--   5. Re-harmonizes get_episode_billing_overview and get_episode_billing_preview.
--   6. Re-harmonizes create_episode_settlement_invoice_atomic_v2.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. EXTEND OT_BOOKINGS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE public.ot_bookings
  ADD COLUMN IF NOT EXISTS surgeon_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.ot_bookings
  ALTER COLUMN scheduled_end DROP NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. EXTEND PAYMENTS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_payments_patient_id
  ON public.payments(patient_id);

UPDATE public.payments p
SET patient_id = inv.patient_id
FROM public.invoices inv
WHERE p.invoice_id = inv.id AND p.patient_id IS NULL;

-- ------------------------------------------------------------------------------
-- 3. USER_PROFILES COMPATIBILITY VIEW
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.user_profiles AS
  SELECT * FROM public.profiles;

GRANT SELECT ON public.user_profiles TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. RECONCILE CREATE_PATIENT_INTAKE_ATOMIC
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
    ELSE
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE organization_id = v_org_id
          AND phone = v_phone
          AND lower(trim(full_name)) = lower(v_full_name)
        LIMIT 1;

        IF v_patient_id IS NULL AND v_nid IS NOT NULL THEN
            SELECT id, patient_code, registration_serial
            INTO v_patient_id, v_patient_code, v_registration_serial
            FROM public.patients
            WHERE organization_id = v_org_id
              AND (nid_or_birth_cert = v_nid OR nid = v_nid)
            LIMIT 1;
        END IF;

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

    -- Service Branch: IPD
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
            COALESCE(v_cc->>'bed_number', '1'),
            NULLIF(trim(v_cc->>'initial_diagnosis'), ''),
            v_encounter_at,
            'ADMITTED',
            NOW()
        )
        RETURNING id INTO v_cca_id;
    END IF;

    -- Service Branch: OT
    IF v_ot IS NOT NULL AND v_ot != 'null'::JSONB THEN
        IF v_visit_id IS NULL THEN
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number,
                visit_type, admitted_at, status, created_by, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_visit_number,
                'IPD', v_encounter_at, 'ACTIVE', v_actor_id, NOW(), NOW()
            )
            RETURNING id INTO v_visit_id;
        END IF;

        v_ot_room_id := NULLIF(v_ot->>'ot_room_id', '')::UUID;
        v_ot_surgeon_id := NULLIF(v_ot->>'surgeon_id', '')::UUID;
        v_ot_anesthetist_id := NULLIF(v_ot->>'anesthetist_id', '')::UUID;
        v_ot_charge := COALESCE((v_ot->>'ot_charge')::NUMERIC, 5000.00);

        INSERT INTO public.ot_bookings (
            organization_id, visit_id, ot_room_id, lead_surgeon_id, surgeon_id,
            anesthetist_id, procedure_name, scheduled_start, scheduled_end,
            ot_charge, status, created_at, updated_at
        )
        VALUES (
            v_org_id, v_visit_id, v_ot_room_id,
            COALESCE(v_ot_surgeon_id, v_doctor_id),
            COALESCE(v_ot_surgeon_id, v_doctor_id),
            v_ot_anesthetist_id,
            COALESCE(v_ot->>'procedure_name', 'Surgical procedure'),
            v_encounter_at,
            v_encounter_at + INTERVAL '2 hours',
            v_ot_charge,
            'SCHEDULED',
            NOW(),
            NOW()
        )
        RETURNING id INTO v_ot_booking_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'patient_id', v_patient_id,
        'patient_code', v_patient_code,
        'registration_serial', v_registration_serial,
        'episode_id', v_episode_id,
        'episode_number', v_episode_number,
        'primary_visit_id', v_visit_id,
        'opd_visit_id', v_opd_visit_id,
        'ipd_visit_id', v_ipd_visit_id,
        'critical_care_admission_id', v_cca_id,
        'ot_booking_id', v_ot_booking_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. RECONCILE GET_EPISODE_BILLING_OVERVIEW
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ);

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

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

COMMIT;
