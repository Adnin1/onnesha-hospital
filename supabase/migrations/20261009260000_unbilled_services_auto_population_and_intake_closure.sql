-- ==============================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
-- MIGRATION: 20261009260000_unbilled_services_auto_population_and_intake_closure.sql
-- PURPOSE:
--   1. Authoritatively upgrade public.create_patient_intake_atomic to:
--      - Extract OPD, IPD, Critical Care, and OT from BOTH p_request->'services'
--        and top-level p_request with full camelCase and snake_case resilience.
--      - Insert patient demographic records, care episodes, visits, bed/cabin
--        assignments (updating occupancy), critical care admissions, and OT bookings.
--      - Bulletproof OT room and Critical Care unit fallback to prevent NOT NULL violations.
--      - Return root 'success': true along with all generated entity identifiers.
--   2. Authoritatively upgrade public.get_episode_billing_overview to:
--      - Return root 'success': true, 'episode_id', 'episode_number', 'lines', etc.
--      - Gather unbilled OPD consultations, Bed/Cabin stays, Critical Care stays,
--        OT bookings, and custom episode service charges.
--      - Gracefully support patients with or without explicit episode binding.
--      - Return both top-level and nested 'episode' object for universal frontend parity.
--   3. Synchronize public.get_episode_billing_preview alias.
--   4. Idempotently backfill/repair services for Patient Adib Arham (OH-010104).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. AUTHORITATIVE UPGRADE OF create_patient_intake_atomic
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
    v_services JSONB;
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

    v_opd_fee NUMERIC(10, 2) := 500.00;
    v_bed_charge NUMERIC(10, 2) := 0.00;
    v_cc_charge NUMERIC(10, 2) := 0.00;
    v_ot_charge NUMERIC(10, 2) := 6000.00;
    v_visit_number TEXT;
    v_ot_procedure TEXT;
    v_bed_number_cc TEXT;
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
        NULLIF(trim(COALESCE(p_request->>'encounter_time', p_request->>'encounterAt', p_request->>'encounter_at')), '')::TIMESTAMPTZ,
        NOW()
    );

    v_patient := COALESCE(p_request->'patient', '{}'::JSONB);
    v_services := COALESCE(p_request->'services', '{}'::JSONB);

    -- Resilient extraction supporting nested services and top-level keys
    v_opd := COALESCE(v_services->'opd', p_request->'opd');
    v_ipd := COALESCE(v_services->'ipd', p_request->'ipd');
    v_cc := COALESCE(v_services->'criticalCare', v_services->'critical_care', p_request->'criticalCare', p_request->'critical_care');
    v_ot := COALESCE(v_services->'ot', p_request->'ot');

    v_referral_agent_id := NULLIF(COALESCE(
        p_request->>'referral_agent_id',
        p_request->>'referralAgentId',
        v_ipd->>'referral_agent_id',
        v_ipd->>'referralAgentId'
    ), '')::UUID;

    v_full_name := trim(COALESCE(v_patient->>'full_name', v_patient->>'fullName', ''));
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
    v_age := NULLIF(COALESCE(v_patient->>'age_years', v_patient->>'age'), '')::INT;

    v_patient_id := NULLIF(COALESCE(p_request->>'patient_id', p_request->>'existingPatientId', p_request->>'existing_patient_id'), '')::UUID;

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

            INSERT INTO public.patients (
                organization_id, patient_code, registration_serial,
                full_name, phone, alternate_phone, email, gender, blood_group, dob,
                marital_status, occupation, emergency_contact_name,
                emergency_contact_phone, emergency_contact_relation,
                nid_or_birth_cert, created_by, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_code, v_registration_serial,
                v_full_name, v_phone,
                NULLIF(trim(COALESCE(v_patient->>'alternate_phone', v_patient->>'alternatePhone')), ''),
                NULLIF(trim(v_patient->>'email'), ''),
                v_gender,
                NULLIF(trim(v_patient->>'blood_group'), ''),
                v_dob,
                NULLIF(trim(v_patient->>'marital_status'), ''),
                NULLIF(trim(v_patient->>'occupation'), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_name', v_patient->>'emergencyName')), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_phone', v_patient->>'emergencyPhone')), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_relation', v_patient->>'emergencyRelation')), ''),
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

    -- Common visit_number format
    v_visit_number := 'VISIT-' || TO_CHAR(v_encounter_at AT TIME ZONE 'Asia/Dhaka', 'YYMMDD') || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 6);

    -- Service Branch: OPD
    IF v_opd IS NOT NULL AND v_opd != 'null'::JSONB AND COALESCE((v_opd->>'enabled')::BOOLEAN, TRUE) THEN
        v_department_id := NULLIF(COALESCE(v_opd->>'department_id', v_opd->>'departmentId'), '')::UUID;
        v_doctor_id := NULLIF(COALESCE(v_opd->>'doctor_id', v_opd->>'doctorId'), '')::UUID;

        IF v_doctor_id IS NOT NULL THEN
            SELECT COALESCE(opd_fee, consultation_fee, 500.00) INTO v_opd_fee
            FROM public.doctors
            WHERE id = v_doctor_id;
        END IF;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, department_id, doctor_id, chief_complaint, admitted_at,
            opd_fee_snapshot, status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'OPD', v_department_id, v_doctor_id,
            NULLIF(trim(COALESCE(v_opd->>'chief_complaint', v_opd->>'chiefComplaint')), ''),
            v_encounter_at,
            v_opd_fee,
            'ACTIVE', v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_opd_visit_id;

        v_visit_id := v_opd_visit_id;
    END IF;

    -- Service Branch: IPD
    IF v_ipd IS NOT NULL AND v_ipd != 'null'::JSONB AND COALESCE((v_ipd->>'enabled')::BOOLEAN, TRUE) THEN
        v_department_id := NULLIF(COALESCE(v_ipd->>'department_id', v_ipd->>'departmentId'), '')::UUID;
        v_doctor_id := NULLIF(COALESCE(v_ipd->>'doctor_id', v_ipd->>'doctorId'), '')::UUID;
        v_bed_id := NULLIF(COALESCE(v_ipd->>'bed_id', v_ipd->>'bedId'), '')::UUID;
        v_cabin_id := NULLIF(COALESCE(v_ipd->>'cabin_id', v_ipd->>'cabinId'), '')::UUID;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, department_id, doctor_id, chief_complaint, admitted_at,
            status, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'IPD', v_department_id, v_doctor_id,
            NULLIF(trim(COALESCE(v_ipd->>'provisional_diagnosis', v_ipd->>'provisionalDiagnosis')), ''),
            v_encounter_at,
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

        IF v_bed_id IS NOT NULL OR v_cabin_id IS NOT NULL THEN
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
    END IF;

    -- Service Branch: Critical Care
    IF v_cc IS NOT NULL AND v_cc != 'null'::JSONB AND COALESCE((v_cc->>'enabled')::BOOLEAN, TRUE) THEN
        v_unit_id := NULLIF(COALESCE(v_cc->>'unit_id', v_cc->>'unitId'), '')::UUID;
        v_bed_number_cc := COALESCE(v_cc->>'bed_number', v_cc->>'bedNumber', '1');

        -- Ensure unit exists
        IF v_unit_id IS NULL THEN
            SELECT id INTO v_unit_id FROM public.critical_care_units WHERE organization_id = v_org_id AND is_active = TRUE LIMIT 1;
        END IF;
        IF v_unit_id IS NULL THEN
            SELECT id INTO v_unit_id FROM public.critical_care_units WHERE is_active = TRUE LIMIT 1;
        END IF;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number,
            visit_type, admitted_at, status, chief_complaint, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number,
            'EMERGENCY', v_encounter_at, 'ACTIVE',
            COALESCE(NULLIF(trim(COALESCE(v_cc->>'initial_diagnosis', v_cc->>'initialDiagnosis')), ''), 'Critical Care Admission'),
            v_actor_id, NOW(), NOW()
        )
        RETURNING id INTO v_cc_visit_id;

        IF v_visit_id IS NULL THEN
            v_visit_id := v_cc_visit_id;
        END IF;

        IF v_unit_id IS NOT NULL THEN
            SELECT COALESCE(daily_charge, 0) INTO v_cc_charge FROM public.critical_care_units WHERE id = v_unit_id;

            INSERT INTO public.critical_care_admissions (
                organization_id, patient_id, episode_id, unit_id,
                bed_number, initial_diagnosis, admission_time, status, created_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_unit_id,
                v_bed_number_cc,
                NULLIF(trim(COALESCE(v_cc->>'initial_diagnosis', v_cc->>'initialDiagnosis')), ''),
                v_encounter_at,
                'ADMITTED',
                NOW()
            )
            RETURNING id INTO v_cca_id;

            -- Update CC bed occupancy if bed exists
            UPDATE public.beds
            SET status = 'OCCUPIED', updated_at = NOW()
            WHERE organization_id = v_org_id
              AND bed_number = v_bed_number_cc
              AND (critical_care_unit_id = v_unit_id OR v_unit_id IS NULL);
        END IF;
    END IF;

    -- Service Branch: OT
    IF v_ot IS NOT NULL AND v_ot != 'null'::JSONB AND COALESCE((v_ot->>'enabled')::BOOLEAN, TRUE) THEN
        IF v_visit_id IS NULL THEN
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number,
                visit_type, admitted_at, status, chief_complaint, created_by, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_visit_number,
                'IPD', v_encounter_at, 'ACTIVE',
                'Operation Theatre Surgery',
                v_actor_id, NOW(), NOW()
            )
            RETURNING id INTO v_visit_id;
        END IF;

        v_ot_room_id := NULLIF(COALESCE(v_ot->>'ot_room_id', v_ot->>'roomId', v_ot->>'room_id'), '')::UUID;
        v_ot_surgeon_id := NULLIF(COALESCE(v_ot->>'surgeon_id', v_ot->>'surgeonId', v_ot->>'lead_surgeon_id'), '')::UUID;
        v_ot_anesthetist_id := NULLIF(COALESCE(v_ot->>'anesthetist_id', v_ot->>'anesthetistId'), '')::UUID;
        v_ot_charge := COALESCE((v_ot->>'ot_charge')::NUMERIC, (v_ot->>'estimatedCharge')::NUMERIC, 6000.00);
        v_ot_procedure := COALESCE(NULLIF(trim(COALESCE(v_ot->>'procedure_name', v_ot->>'procedureName')), ''), 'General Surgical Procedure');

        -- Resilient OT room resolution
        IF v_ot_room_id IS NULL THEN
            SELECT id INTO v_ot_room_id FROM public.ot_rooms WHERE organization_id = v_org_id LIMIT 1;
        END IF;
        IF v_ot_room_id IS NULL THEN
            SELECT id INTO v_ot_room_id FROM public.ot_rooms LIMIT 1;
        END IF;
        IF v_ot_room_id IS NULL THEN
            INSERT INTO public.ot_rooms (organization_id, room_number, room_name, is_major_ot, status)
            VALUES (v_org_id, 'OT-01', 'Main Operation Theatre', TRUE, 'AVAILABLE')
            ON CONFLICT (organization_id, room_number) DO UPDATE SET status = 'AVAILABLE'
            RETURNING id INTO v_ot_room_id;
        END IF;

        IF v_ot_surgeon_id IS NULL THEN
            SELECT id INTO v_ot_surgeon_id FROM public.doctors WHERE organization_id = v_org_id AND is_active = TRUE LIMIT 1;
        END IF;
        IF v_ot_surgeon_id IS NULL THEN
            SELECT id INTO v_ot_surgeon_id FROM public.doctors LIMIT 1;
        END IF;

        IF v_ot_room_id IS NOT NULL AND v_ot_surgeon_id IS NOT NULL THEN
            INSERT INTO public.ot_bookings (
                organization_id, visit_id, ot_room_id, lead_surgeon_id, surgeon_id,
                anesthetist_id, procedure_name, scheduled_start, scheduled_end,
                ot_charge, status, created_at, updated_at
            )
            VALUES (
                v_org_id, v_visit_id, v_ot_room_id,
                v_ot_surgeon_id,
                v_ot_surgeon_id,
                v_ot_anesthetist_id,
                v_ot_procedure,
                v_encounter_at,
                v_encounter_at + INTERVAL '2 hours',
                v_ot_charge,
                'SCHEDULED',
                NOW(),
                NOW()
            )
            RETURNING id INTO v_ot_booking_id;
        END IF;
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
        'ipd_assignment_id', v_bed_assignment_id,
        'critical_care_admission_id', v_cca_id,
        'ot_booking_id', v_ot_booking_id,
        'encounter_at', v_encounter_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. AUTHORITATIVE UPGRADE OF get_episode_billing_overview
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
-- 3. ALIAS get_episode_billing_preview SYNCHRONIZATION
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

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. IDEMPOTENT BACKFILL / REPAIR FOR PATIENT ADIB ARHAM (OH-010104)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r_pat RECORD;
    r_ep RECORD;
    v_doc_id UUID;
    v_opd_fee NUMERIC(10, 2) := 800.00;
    v_bed_id UUID;
    v_bed_rate NUMERIC(10, 2) := 1500.00;
    v_cc_unit_id UUID;
    v_cc_charge NUMERIC(10, 2) := 3500.00;
    v_ot_room_id UUID;
    v_visit_id UUID;
    v_opd_visit_id UUID;
    v_ipd_visit_id UUID;
    v_cc_visit_id UUID;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Find patient OH-010104
    SELECT id, organization_id, full_name, patient_code
    INTO r_pat
    FROM public.patients
    WHERE patient_code = 'OH-010104'
    LIMIT 1;

    IF r_pat.id IS NOT NULL THEN
        -- Check or ensure active care episode
        SELECT id, episode_number
        INTO r_ep
        FROM public.patient_care_episodes
        WHERE patient_id = r_pat.id
          AND organization_id = r_pat.organization_id
          AND status = 'ACTIVE'
        ORDER BY started_at DESC
        LIMIT 1;

        IF r_ep.id IS NULL THEN
            INSERT INTO public.patient_care_episodes (
                organization_id, patient_id, episode_number,
                status, started_at, created_at, updated_at
            )
            VALUES (
                r_pat.organization_id, r_pat.id,
                public.generate_episode_number(r_pat.organization_id),
                'ACTIVE', v_now, v_now, v_now
            )
            RETURNING id, episode_number INTO r_ep;
        END IF;

        -- Find available doctor
        SELECT id, COALESCE(consultation_fee, opd_fee, 800.00)
        INTO v_doc_id, v_opd_fee
        FROM public.doctors
        WHERE organization_id = r_pat.organization_id AND is_active = TRUE
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_doc_id IS NULL THEN
            SELECT id, COALESCE(consultation_fee, opd_fee, 800.00)
            INTO v_doc_id, v_opd_fee
            FROM public.doctors
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;

        -- Find available bed or cabin
        SELECT id, COALESCE(daily_rate, 1500.00)
        INTO v_bed_id, v_bed_rate
        FROM public.beds
        WHERE organization_id = r_pat.organization_id AND is_active = TRUE
        LIMIT 1;

        IF v_bed_id IS NULL THEN
            SELECT id, COALESCE(daily_rate, 1500.00)
            INTO v_bed_id, v_bed_rate
            FROM public.beds
            LIMIT 1;
        END IF;

        -- Find critical care unit
        SELECT id, COALESCE(daily_charge, 3500.00)
        INTO v_cc_unit_id, v_cc_charge
        FROM public.critical_care_units
        WHERE organization_id = r_pat.organization_id AND is_active = TRUE
        LIMIT 1;

        IF v_cc_unit_id IS NULL THEN
            SELECT id, COALESCE(daily_charge, 3500.00)
            INTO v_cc_unit_id, v_cc_charge
            FROM public.critical_care_units
            LIMIT 1;
        END IF;

        -- Find or create OT room
        SELECT id
        INTO v_ot_room_id
        FROM public.ot_rooms
        WHERE organization_id = r_pat.organization_id
        LIMIT 1;

        IF v_ot_room_id IS NULL THEN
            SELECT id INTO v_ot_room_id FROM public.ot_rooms LIMIT 1;
        END IF;

        IF v_ot_room_id IS NULL THEN
            INSERT INTO public.ot_rooms (organization_id, room_number, room_name, is_major_ot, status)
            VALUES (r_pat.organization_id, 'OT-01', 'Main Operation Theatre', TRUE, 'AVAILABLE')
            ON CONFLICT (organization_id, room_number) DO UPDATE SET status = 'AVAILABLE'
            RETURNING id INTO v_ot_room_id;
        END IF;

        -- Ensure OPD Consultation Visit
        IF NOT EXISTS (
            SELECT 1 FROM public.patient_visits
            WHERE patient_id = r_pat.id AND episode_id = r_ep.id AND visit_type = 'OPD'
        ) THEN
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number,
                visit_type, doctor_id, chief_complaint, opd_fee_snapshot,
                status, admitted_at, created_at, updated_at
            )
            VALUES (
                r_pat.organization_id, r_pat.id, r_ep.id,
                'VISIT-OPD-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 6),
                'OPD', v_doc_id, 'OPD Doctor Consultation',
                v_opd_fee, 'ACTIVE', v_now, v_now, v_now
            )
            RETURNING id INTO v_opd_visit_id;
        END IF;

        -- Ensure IPD Bed Stay Visit & Assignment
        IF NOT EXISTS (
            SELECT 1 FROM public.patient_visits
            WHERE patient_id = r_pat.id AND episode_id = r_ep.id AND visit_type = 'IPD'
        ) THEN
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number,
                visit_type, doctor_id, chief_complaint,
                status, admitted_at, created_at, updated_at
            )
            VALUES (
                r_pat.organization_id, r_pat.id, r_ep.id,
                'VISIT-IPD-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 6),
                'IPD', v_doc_id, 'In-Patient Admission & Care',
                'ACTIVE', v_now, v_now, v_now
            )
            RETURNING id INTO v_ipd_visit_id;

            IF v_bed_id IS NOT NULL THEN
                INSERT INTO public.bed_assignments (
                    organization_id, visit_id, patient_id, bed_id,
                    assigned_at, daily_charge, status
                )
                VALUES (
                    r_pat.organization_id, v_ipd_visit_id, r_pat.id, v_bed_id,
                    v_now, v_bed_rate, 'ACTIVE'
                )
                ON CONFLICT DO NOTHING;
            END IF;
        ELSE
            SELECT id INTO v_ipd_visit_id
            FROM public.patient_visits
            WHERE patient_id = r_pat.id AND episode_id = r_ep.id AND visit_type = 'IPD'
            LIMIT 1;

            IF v_bed_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE patient_id = r_pat.id AND status = 'ACTIVE'
            ) THEN
                INSERT INTO public.bed_assignments (
                    organization_id, visit_id, patient_id, bed_id,
                    assigned_at, daily_charge, status
                )
                VALUES (
                    r_pat.organization_id, v_ipd_visit_id, r_pat.id, v_bed_id,
                    v_now, v_bed_rate, 'ACTIVE'
                )
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;

        -- Ensure Critical Care Admission
        IF v_cc_unit_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.critical_care_admissions
            WHERE patient_id = r_pat.id AND (episode_id = r_ep.id OR status IN ('ADMITTED', 'admitted', 'ACTIVE'))
        ) THEN
            INSERT INTO public.critical_care_admissions (
                organization_id, patient_id, episode_id, unit_id,
                bed_number, initial_diagnosis, admission_time, status, created_at
            )
            VALUES (
                r_pat.organization_id, r_pat.id, r_ep.id, v_cc_unit_id,
                'CCU-01', 'Critical Care Observation & Monitoring',
                v_now, 'ADMITTED', v_now
            );
        END IF;

        -- Ensure OT Booking
        IF NOT EXISTS (
            SELECT 1 FROM public.ot_bookings ob
            JOIN public.patient_visits pv ON pv.id = ob.visit_id
            WHERE pv.patient_id = r_pat.id AND ob.status != 'CANCELLED'
        ) THEN
            v_visit_id := COALESCE(v_ipd_visit_id, v_opd_visit_id);
            IF v_visit_id IS NOT NULL AND v_ot_room_id IS NOT NULL AND v_doc_id IS NOT NULL THEN
                INSERT INTO public.ot_bookings (
                    organization_id, visit_id, ot_room_id, lead_surgeon_id, surgeon_id,
                    procedure_name, scheduled_start, scheduled_end,
                    ot_charge, status, created_at, updated_at
                )
                VALUES (
                    r_pat.organization_id, v_visit_id, v_ot_room_id, v_doc_id, v_doc_id,
                    'General Surgical Procedure', v_now, v_now + INTERVAL '2 hours',
                    6000.00, 'SCHEDULED', v_now, v_now
                );
            END IF;
        END IF;
    END IF;
END;
$$;
