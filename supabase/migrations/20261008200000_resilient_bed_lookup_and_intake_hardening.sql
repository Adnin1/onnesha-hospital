-- ==============================================================================
-- OHMS Migration 122: Resilient Bed Lookup & Unified Intake Hardening
--
-- Objective:
--   1. Upgrade public.create_patient_intake_atomic to perform case-insensitive
--      and whitespace-trimmed matching on critical-care bed numbers.
--   2. Support automatic bed-unit binding resilience when an available hospital
--      bed is assigned to critical care.
--   3. Ensure patient-only registration works 100% cleanly without requiring
--      any service lookups or admission dependencies.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_patient_intake_atomic(
    p_request JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID := (p_request->>'organization_id')::UUID;
    v_user_id UUID := (p_request->>'user_id')::UUID;
    v_existing_patient_id UUID := NULLIF(p_request->>'existing_patient_id', '')::UUID;
    v_patient_id UUID;
    v_patient_code TEXT;
    v_registration_serial TEXT;
    v_episode_id UUID;
    v_episode_number TEXT;
    v_encounter_at TIMESTAMPTZ := (p_request->>'encounter_at')::TIMESTAMPTZ;
    v_services JSONB := COALESCE(p_request->'services', '{}'::JSONB);
    v_patient JSONB := COALESCE(p_request->'patient', '{}'::JSONB);
    v_opd JSONB := COALESCE(v_services->'opd', '{}'::JSONB);
    v_ipd JSONB := COALESCE(v_services->'ipd', '{}'::JSONB);
    v_cc JSONB := COALESCE(v_services->'critical_care', '{}'::JSONB);
    v_admission_discount NUMERIC := COALESCE((p_request->>'admission_discount_amount')::NUMERIC, (v_patient->>'admission_discount_amount')::NUMERIC, 0);
    v_admission_discount_reason TEXT := NULLIF(trim(COALESCE(p_request->>'admission_discount_reason', v_patient->>'admission_discount_reason')), '');
    v_referral_agent_id UUID := NULLIF(COALESCE(p_request->>'referral_agent_id', v_ipd->>'referral_agent_id'), '')::UUID;
    v_referral_agent_code TEXT;
    v_referral_agent_name TEXT;
    v_visit_id UUID;
    v_opd_visit_id UUID;
    v_ipd_visit_id UUID;
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
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF v_org_id IS NULL OR private.get_current_org_id() IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    IF v_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'CALLER_MISMATCH';
    END IF;

    IF v_encounter_at IS NULL THEN
        RAISE EXCEPTION 'INVALID_ENCOUNTER_TIME';
    END IF;

    -- Validate Referral Agent if provided
    IF v_referral_agent_id IS NOT NULL THEN
        SELECT agent_code, full_name
        INTO v_referral_agent_code, v_referral_agent_name
        FROM public.referral_agents
        WHERE id = v_referral_agent_id
          AND organization_id = v_org_id
          AND is_active = TRUE
          AND archived_at IS NULL;

        IF v_referral_agent_code IS NULL THEN
            RAISE EXCEPTION 'REFERRAL_AGENT_NOT_FOUND';
        END IF;
    END IF;

    -- 1. Create or Resolve Patient Master
    IF v_existing_patient_id IS NOT NULL THEN
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE id = v_existing_patient_id AND organization_id = v_org_id;

        IF v_patient_id IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NOT_FOUND';
        END IF;

        UPDATE public.patients
        SET last_visit_date = v_encounter_at,
            total_visits = COALESCE(total_visits, 0) + 1,
            updated_at = NOW()
        WHERE id = v_patient_id;
    ELSE
        SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
        v_registration_serial := TO_CHAR(v_encounter_at, 'YYMMDD') || '-' || SUBSTRING(v_patient_code FROM 7);

        v_nid := NULLIF(trim(v_patient->>'nid'), '');
        IF v_nid IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.patients WHERE organization_id = v_org_id AND nid = v_nid
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_NID:%', v_nid;
        END IF;

        IF NULLIF(v_patient->>'dob', '') IS NOT NULL THEN
            v_dob := (v_patient->>'dob')::DATE;
            v_age := GREATEST(0, EXTRACT(YEAR FROM AGE(v_encounter_at, v_dob))::INTEGER);
        ELSE
            v_age := COALESCE((v_patient->>'age')::INTEGER, 0);
        END IF;

        INSERT INTO public.patients (
            organization_id, patient_code, registration_serial, full_name,
            phone, alternate_phone, email, gender, dob, age, blood_group,
            marital_status, occupation, nid, address, emergency_contact_name,
            emergency_contact_phone, emergency_contact_relation,
            total_visits, last_visit_date, created_at, updated_at
        )
        VALUES (
            v_org_id,
            v_patient_code,
            v_registration_serial,
            trim(v_patient->>'full_name'),
            trim(v_patient->>'phone'),
            NULLIF(trim(v_patient->>'alternate_phone'), ''),
            NULLIF(trim(v_patient->>'email'), ''),
            COALESCE(NULLIF(v_patient->>'gender', ''), 'OTHER'),
            v_dob,
            v_age,
            COALESCE(NULLIF(v_patient->>'blood_group', ''), 'UNKNOWN'),
            NULLIF(trim(v_patient->>'marital_status'), ''),
            NULLIF(trim(v_patient->>'occupation'), ''),
            v_nid,
            NULLIF(trim(v_patient->>'address'), ''),
            NULLIF(trim(v_patient->>'emergency_name'), ''),
            NULLIF(trim(v_patient->>'emergency_phone'), ''),
            NULLIF(trim(v_patient->>'emergency_relation'), ''),
            1,
            v_encounter_at,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_patient_id;
    END IF;

    -- 2. Create Canonical Patient Episode
    SELECT public.generate_episode_number(v_org_id) INTO v_episode_number;

    INSERT INTO public.patient_episodes (
        organization_id, patient_id, episode_number, start_time,
        status, referral_agent_id, admission_discount_amount,
        admission_discount_reason, created_by, created_at
    )
    VALUES (
        v_org_id,
        v_patient_id,
        v_episode_number,
        v_encounter_at,
        'ACTIVE',
        v_referral_agent_id,
        v_admission_discount,
        v_admission_discount_reason,
        v_user_id,
        NOW()
    )
    RETURNING id INTO v_episode_id;

    -- 3. OPD Service Encounter
    IF COALESCE((v_opd->>'enabled')::BOOLEAN, FALSE) THEN
        v_department_id := NULLIF(v_opd->>'department_id', '')::UUID;
        v_doctor_id := NULLIF(v_opd->>'doctor_id', '')::UUID;

        IF v_department_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.departments
            WHERE id = v_department_id AND organization_id = v_org_id AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'OPD_DEPARTMENT_NOT_FOUND';
        END IF;

        IF v_doctor_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.doctors
            WHERE id = v_doctor_id AND organization_id = v_org_id AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'OPD_DOCTOR_NOT_FOUND';
        END IF;

        SELECT public.generate_visit_number(v_org_id, 'OPD') INTO v_visit_number;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number, visit_type,
            status, department_id, doctor_id, chief_complaint, priority, admitted_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number, 'OPD',
            'ACTIVE',
            v_department_id,
            v_doctor_id,
            NULLIF(trim(v_opd->>'chief_complaint'), ''),
            COALESCE(NULLIF(v_opd->>'priority', ''), 'NORMAL'),
            v_encounter_at
        )
        RETURNING id INTO v_opd_visit_id;

        v_visit_id := v_opd_visit_id;
    END IF;

    -- 4. IPD Bed/Cabin Service Encounter
    IF COALESCE((v_ipd->>'enabled')::BOOLEAN, FALSE) THEN
        v_department_id := NULLIF(v_ipd->>'department_id', '')::UUID;
        v_doctor_id := NULLIF(v_ipd->>'doctor_id', '')::UUID;
        v_bed_id := NULLIF(v_ipd->>'bed_id', '')::UUID;
        v_cabin_id := NULLIF(v_ipd->>'cabin_id', '')::UUID;

        IF v_bed_id IS NULL AND v_cabin_id IS NULL THEN
            RAISE EXCEPTION 'IPD_REQUIRES_BED_OR_CABIN';
        END IF;

        IF v_bed_id IS NOT NULL AND v_cabin_id IS NOT NULL THEN
            RAISE EXCEPTION 'IPD_CANNOT_SELECT_BOTH_BED_AND_CABIN';
        END IF;

        SELECT public.generate_visit_number(v_org_id, 'IPD') INTO v_visit_number;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number, visit_type,
            status, department_id, doctor_id, admitted_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number, 'IPD',
            'ACTIVE',
            v_department_id,
            v_doctor_id,
            v_encounter_at
        )
        RETURNING id INTO v_ipd_visit_id;

        v_visit_id := v_ipd_visit_id;

        IF v_bed_id IS NOT NULL THEN
            SELECT status, bed_number, daily_rate
            INTO v_bed_status, v_bed_number, v_daily_charge
            FROM public.beds
            WHERE id = v_bed_id AND organization_id = v_org_id AND is_active = TRUE
            FOR UPDATE;

            IF v_bed_status IS NULL THEN
                RAISE EXCEPTION 'BED_NOT_FOUND';
            END IF;

            IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
                RAISE EXCEPTION 'BED_UNAVAILABLE';
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.bed_assignments
                WHERE bed_id = v_bed_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED';
            END IF;

            INSERT INTO public.bed_assignments (
                organization_id, visit_id, bed_id, assigned_at,
                daily_charge, status, assigned_by
            )
            VALUES (
                v_org_id, v_ipd_visit_id, v_bed_id, v_encounter_at,
                v_daily_charge, 'ACTIVE', v_user_id
            )
            RETURNING id INTO v_assignment_id;

            UPDATE public.beds
            SET status = 'OCCUPIED',
                patient_name = (SELECT full_name FROM public.patients WHERE id = v_patient_id),
                admitted_at = v_encounter_at
            WHERE id = v_bed_id;
        END IF;

        IF v_cabin_id IS NOT NULL THEN
            SELECT status, cabin_number, daily_rate
            INTO v_cabin_status, v_cabin_number, v_cabin_charge
            FROM public.cabins
            WHERE id = v_cabin_id AND organization_id = v_org_id AND is_active = TRUE
            FOR UPDATE;

            IF v_cabin_status IS NULL THEN
                RAISE EXCEPTION 'CABIN_NOT_FOUND';
            END IF;

            IF UPPER(v_cabin_status) NOT IN ('VACANT', 'AVAILABLE') THEN
                RAISE EXCEPTION 'CABIN_UNAVAILABLE';
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.bed_assignments
                WHERE cabin_id = v_cabin_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED';
            END IF;

            INSERT INTO public.bed_assignments (
                organization_id, visit_id, cabin_id, assigned_at,
                daily_charge, status, assigned_by
            )
            VALUES (
                v_org_id, v_ipd_visit_id, v_cabin_id, v_encounter_at,
                v_cabin_charge, 'ACTIVE', v_user_id
            )
            RETURNING id INTO v_assignment_id;

            UPDATE public.cabins
            SET status = 'OCCUPIED'
            WHERE id = v_cabin_id;
        END IF;
    END IF;

    -- 5. Critical Care Service Encounter
    IF COALESCE((v_cc->>'enabled')::BOOLEAN, FALSE) THEN
        v_unit_id := NULLIF(v_cc->>'unit_id', '')::UUID;
        v_doctor_id := NULLIF(v_cc->>'doctor_id', '')::UUID;
        v_bed_number := UPPER(NULLIF(trim(v_cc->>'bed_number'), ''));

        IF v_unit_id IS NULL OR v_bed_number IS NULL THEN
            RAISE EXCEPTION 'CRITICAL_CARE_UNIT_AND_BED_REQUIRED';
        END IF;

        SELECT is_active INTO v_unit_active
        FROM public.critical_care_units
        WHERE id = v_unit_id AND organization_id = v_org_id AND is_active = TRUE;

        IF COALESCE(v_unit_active, FALSE) = FALSE THEN
            RAISE EXCEPTION 'CRITICAL_CARE_UNIT_NOT_FOUND';
        END IF;

        -- Authoritative Bed lookup with case-insensitive, whitespace-tolerant matching
        SELECT id, status, bed_number INTO v_cc_bed_id, v_cc_bed_status, v_bed_number
        FROM public.beds
        WHERE organization_id = v_org_id
          AND UPPER(TRIM(bed_number)) = v_bed_number
          AND is_active = TRUE
        ORDER BY
          CASE WHEN critical_care_unit_id = v_unit_id THEN 1
               WHEN critical_care_unit_id IS NULL THEN 2
               ELSE 3 END ASC,
          created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF v_cc_bed_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL_CARE_BED_NOT_FOUND:%', v_bed_number;
        END IF;

        IF UPPER(v_cc_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'CRITICAL_CARE_BED_UNAVAILABLE:%', v_bed_number;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.critical_care_admissions
            WHERE organization_id = v_org_id
              AND UPPER(TRIM(bed_number)) = v_bed_number
              AND status IN ('ACTIVE', 'admitted')
        ) THEN
            RAISE EXCEPTION 'CRITICAL_CARE_DOUBLE_ASSIGNMENT:%', v_bed_number;
        END IF;

        -- If no prior visit exists for this episode, create an Emergency visit anchor
        IF v_visit_id IS NULL THEN
            SELECT public.generate_visit_number(v_org_id, 'EMERGENCY') INTO v_visit_number;
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number, visit_type,
                status, department_id, doctor_id, chief_complaint, priority, admitted_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_visit_number, 'EMERGENCY',
                'ACTIVE',
                NULL,
                v_doctor_id,
                'Critical Care - ' || COALESCE(NULLIF(trim(v_cc->>'initial_diagnosis'), ''), 'Critical Care Admission'),
                'CRITICAL',
                v_encounter_at
            )
            RETURNING id INTO v_visit_id;
        END IF;

        INSERT INTO public.critical_care_admissions (
            organization_id, patient_id, episode_id, unit_id, bed_number,
            ventilator_required, admitting_doctor_id, initial_diagnosis,
            admission_time, status, created_at
        )
        VALUES (
            v_org_id,
            v_patient_id,
            v_episode_id,
            v_unit_id,
            v_bed_number,
            COALESCE((v_cc->>'ventilator_required')::BOOLEAN, FALSE),
            v_doctor_id,
            COALESCE(NULLIF(trim(v_cc->>'initial_diagnosis'), ''), 'Critical Care Observation Required'),
            v_encounter_at,
            'admitted',
            NOW()
        )
        RETURNING id INTO v_cc_admission_id;

        -- Authoritatively update bed to OCCUPIED and bind to unit
        UPDATE public.beds
        SET status = 'OCCUPIED',
            patient_name = (SELECT full_name FROM public.patients WHERE id = v_patient_id),
            admitted_at = v_encounter_at,
            critical_care_unit_id = COALESCE(critical_care_unit_id, v_unit_id)
        WHERE id = v_cc_bed_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'patient_id', v_patient_id,
        'patient_code', v_patient_code,
        'registration_serial', v_registration_serial,
        'episode_id', v_episode_id,
        'episode_number', v_episode_number,
        'opd_visit_id', v_opd_visit_id,
        'ipd_visit_id', v_ipd_visit_id,
        'critical_care_visit_id', v_visit_id,
        'ipd_assignment_id', v_assignment_id,
        'critical_care_admission_id', v_cc_admission_id,
        'encounter_at', v_encounter_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated, service_role;
