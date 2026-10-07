-- ==============================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS) — FORWARD MIGRATION 115
-- Unified Patient Intake, Demographics Schema Polish, & Episode Linkage
-- Timestamp: 2026-10-07T22:00:00Z
-- ==============================================================================

-- 1. Ensure all demographic columns exist on public.patients
ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS occupation VARCHAR(100),
    ADD COLUMN IF NOT EXISTS age_years INTEGER,
    ADD COLUMN IF NOT EXISTS nid_or_birth_cert TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT;

-- 2. Performance indexes for fast duplicate check and intake resolution
CREATE INDEX IF NOT EXISTS idx_patients_org_phone_norm
    ON public.patients (organization_id, normalized_phone)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_patients_org_nid_norm
    ON public.patients (organization_id, nid_or_birth_cert)
    WHERE is_deleted = FALSE AND nid_or_birth_cert IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_care_episodes_active_lookup
    ON public.patient_care_episodes (organization_id, patient_id, status)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_bed_assignments_patient_active
    ON public.bed_assignments (organization_id, patient_id, status)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_critical_care_admissions_patient_active
    ON public.critical_care_admissions (organization_id, patient_id, status)
    WHERE status = 'ACTIVE';

-- 3. Upgrade public.create_patient_intake_atomic to store all patient demographics & identities atomically
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
    v_episode_id UUID;
    v_episode_number TEXT;
    v_encounter_at TIMESTAMPTZ := (p_request->>'encounter_at')::TIMESTAMPTZ;
    v_services JSONB := COALESCE(p_request->'services', '{}'::JSONB);
    v_patient JSONB := COALESCE(p_request->'patient', '{}'::JSONB);
    v_opd JSONB := COALESCE(v_services->'opd', '{}'::JSONB);
    v_ipd JSONB := COALESCE(v_services->'ipd', '{}'::JSONB);
    v_cc JSONB := COALESCE(v_services->'critical_care', '{}'::JSONB);
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
    v_cc_bed_status TEXT;
    v_cc_admission_id UUID;
    v_doctor_id UUID;
    v_department_id UUID;
    v_bed_id UUID;
    v_cabin_id UUID;
    v_unit_id UUID;
    v_referral_agent_id UUID;
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

    -- Case 1: Existing Patient Selection (No master duplication)
    IF v_existing_patient_id IS NOT NULL THEN
        SELECT id, patient_code INTO v_patient_id, v_patient_code
        FROM public.patients
        WHERE id = v_existing_patient_id
          AND organization_id = v_org_id
          AND is_deleted = FALSE
        FOR UPDATE;

        IF v_patient_id IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NOT_FOUND';
        END IF;
    ELSE
        -- Case 2: New Patient Identity Creation
        IF NULLIF(trim(v_patient->>'full_name'), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NAME_REQUIRED';
        END IF;

        IF NULLIF(trim(v_patient->>'phone'), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_PHONE_REQUIRED';
        END IF;

        SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
        v_nid := NULLIF(trim(v_patient->>'nid'), '');
        v_dob := NULLIF(v_patient->>'dob', '')::DATE;
        IF v_dob IS NOT NULL THEN
            v_age := GREATEST(0, DATE_PART('year', AGE(v_encounter_at, v_dob))::INTEGER);
        END IF;

        INSERT INTO public.patients (
            organization_id,
            patient_id,
            patient_code,
            full_name,
            phone,
            normalized_phone,
            alternate_phone,
            email,
            gender,
            dob,
            age,
            age_years,
            blood_group,
            marital_status,
            occupation,
            nid_or_birth_cert,
            address,
            is_deleted,
            created_by,
            created_at,
            updated_at
        )
        VALUES (
            v_org_id,
            v_patient_code,
            v_patient_code,
            trim(v_patient->>'full_name'),
            trim(v_patient->>'phone'),
            regexp_replace(trim(v_patient->>'phone'), '[^0-9+]', '', 'g'),
            NULLIF(trim(v_patient->>'alternate_phone'), ''),
            NULLIF(trim(v_patient->>'email'), ''),
            COALESCE(NULLIF(v_patient->>'gender', ''), 'OTHER'),
            v_dob,
            v_age,
            v_age,
            COALESCE(NULLIF(v_patient->>'blood_group', ''), 'UNKNOWN'),
            NULLIF(trim(v_patient->>'marital_status'), ''),
            NULLIF(trim(v_patient->>'occupation'), ''),
            v_nid,
            NULLIF(trim(v_patient->>'address'), ''),
            FALSE,
            v_user_id,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_patient_id;

        -- Child identification record
        IF v_nid IS NOT NULL THEN
            INSERT INTO public.patient_identifications (
                patient_id, id_type, id_number, is_verified
            )
            VALUES (v_patient_id, 'NID', regexp_replace(v_nid, '[^0-9]', '', 'g'), FALSE);
        END IF;

        -- Child address record
        IF NULLIF(trim(v_patient->>'address'), '') IS NOT NULL THEN
            INSERT INTO public.patient_addresses (
                patient_id, address_type, street_address, district, division
            )
            VALUES (
                v_patient_id,
                'PRESENT',
                trim(v_patient->>'address'),
                'Unspecified',
                'Unspecified'
            );
        END IF;

        -- Child emergency contact record
        IF NULLIF(trim(v_patient->>'emergency_name'), '') IS NOT NULL
           AND NULLIF(trim(v_patient->>'emergency_phone'), '') IS NOT NULL THEN
            INSERT INTO public.patient_contacts (
                patient_id, contact_name, relationship, phone, is_primary_emergency
            )
            VALUES (
                v_patient_id,
                trim(v_patient->>'emergency_name'),
                COALESCE(NULLIF(v_patient->>'emergency_relation', ''), 'Guardian'),
                trim(v_patient->>'emergency_phone'),
                TRUE
            );
        END IF;
    END IF;

    -- Create patient-care episode if any service is selected
    IF COALESCE((v_services->'opd'->>'enabled')::BOOLEAN, FALSE)
       OR COALESCE((v_services->'ipd'->>'enabled')::BOOLEAN, FALSE)
       OR COALESCE((v_services->'critical_care'->>'enabled')::BOOLEAN, FALSE) THEN

        v_episode_number := 'EPI-' ||
            TO_CHAR(v_encounter_at AT TIME ZONE 'Asia/Dhaka', 'YYMM') ||
            '-' || LPAD(nextval('public.patient_care_episode_seq')::TEXT, 6, '0');

        INSERT INTO public.patient_care_episodes (
            organization_id, patient_id, episode_number, started_at, source, created_by
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_number, v_encounter_at,
            'UNIFIED_INTAKE', v_user_id
        )
        RETURNING id INTO v_episode_id;
    END IF;

    -- 1. OPD Service Encounter
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

    -- 2. IPD Bed or Cabin Service Encounter
    IF COALESCE((v_ipd->>'enabled')::BOOLEAN, FALSE) THEN
        v_department_id := NULLIF(v_ipd->>'department_id', '')::UUID;
        v_doctor_id := NULLIF(v_ipd->>'doctor_id', '')::UUID;
        v_bed_id := NULLIF(v_ipd->>'bed_id', '')::UUID;
        v_cabin_id := NULLIF(v_ipd->>'cabin_id', '')::UUID;

        IF v_bed_id IS NULL AND v_cabin_id IS NULL THEN
            RAISE EXCEPTION 'IPD_BED_OR_CABIN_REQUIRED';
        END IF;

        IF v_bed_id IS NOT NULL AND v_cabin_id IS NOT NULL THEN
            RAISE EXCEPTION 'IPD_BED_AND_CABIN_CONFLICT';
        END IF;

        IF v_department_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.departments
            WHERE id = v_department_id AND organization_id = v_org_id AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'IPD_DEPARTMENT_NOT_FOUND';
        END IF;

        IF v_doctor_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.doctors
            WHERE id = v_doctor_id AND organization_id = v_org_id AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'IPD_DOCTOR_NOT_FOUND';
        END IF;

        SELECT public.generate_visit_number(v_org_id, 'IPD') INTO v_visit_number;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number, visit_type,
            status, department_id, doctor_id, chief_complaint, admitted_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number, 'IPD',
            'ACTIVE',
            v_department_id,
            v_doctor_id,
            NULLIF(trim(v_ipd->>'provisional_diagnosis'), ''),
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
                RAISE EXCEPTION 'BED_UNAVAILABLE:%', v_bed_number;
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.bed_assignments
                WHERE bed_id = v_bed_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED:%', v_bed_number;
            END IF;

            INSERT INTO public.bed_assignments (
                organization_id, visit_id, patient_id, bed_id, assigned_at,
                daily_charge, status, assigned_by
            )
            VALUES (
                v_org_id, v_visit_id, v_patient_id, v_bed_id, v_encounter_at,
                COALESCE(v_daily_charge, 0), 'ACTIVE', v_user_id
            )
            RETURNING id INTO v_assignment_id;

            UPDATE public.beds
            SET status = 'OCCUPIED',
                patient_name = (SELECT full_name FROM public.patients WHERE id = v_patient_id),
                admitted_at = v_encounter_at
            WHERE id = v_bed_id;
        ELSE
            SELECT status, cabin_number, daily_rate
            INTO v_cabin_status, v_cabin_number, v_cabin_charge
            FROM public.cabins
            WHERE id = v_cabin_id AND organization_id = v_org_id
            FOR UPDATE;

            IF v_cabin_status IS NULL THEN
                RAISE EXCEPTION 'CABIN_NOT_FOUND';
            END IF;

            IF UPPER(v_cabin_status) NOT IN ('VACANT', 'AVAILABLE') THEN
                RAISE EXCEPTION 'CABIN_UNAVAILABLE:%', v_cabin_number;
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.bed_assignments
                WHERE cabin_id = v_cabin_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED:%', v_cabin_number;
            END IF;

            INSERT INTO public.bed_assignments (
                organization_id, visit_id, patient_id, cabin_id, assigned_at,
                daily_charge, status, assigned_by
            )
            VALUES (
                v_org_id, v_visit_id, v_patient_id, v_cabin_id, v_encounter_at,
                COALESCE(v_cabin_charge, 0), 'ACTIVE', v_user_id
            )
            RETURNING id INTO v_assignment_id;

            UPDATE public.cabins
            SET status = 'OCCUPIED'
            WHERE id = v_cabin_id;
        END IF;

        INSERT INTO public.patient_diagnoses (
            organization_id, patient_id, visit_id, diagnosis_name,
            diagnosis_type, recorded_by, recorded_at
        )
        VALUES (
            v_org_id,
            v_patient_id,
            v_visit_id,
            COALESCE(NULLIF(trim(v_ipd->>'provisional_diagnosis'), ''), 'Inpatient admission'),
            'PROVISIONAL',
            v_user_id,
            v_encounter_at
        );

        v_referral_agent_id := NULLIF(v_ipd->>'referral_agent_id', '')::UUID;
        IF v_referral_agent_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.referral_agents
            WHERE id = v_referral_agent_id AND organization_id = v_org_id AND is_active = TRUE
        ) THEN
            INSERT INTO public.patient_referral_attributions (
                organization_id, patient_id, visit_id, referral_agent_id,
                referral_code_snapshot, referral_name_snapshot, assigned_by, status, notes
            )
            SELECT
                v_org_id, v_patient_id, v_visit_id, ra.id,
                ra.agent_code, ra.full_name, v_user_id, 'ACTIVE',
                'Attributed during unified patient intake'
            FROM public.referral_agents ra
            WHERE ra.id = v_referral_agent_id;
        END IF;
    END IF;

    -- 3. Critical Care Service Encounter
    IF COALESCE((v_cc->>'enabled')::BOOLEAN, FALSE) THEN
        v_unit_id := NULLIF(v_cc->>'unit_id', '')::UUID;
        v_doctor_id := NULLIF(v_cc->>'doctor_id', '')::UUID;
        v_bed_number := UPPER(NULLIF(trim(v_cc->>'bed_number'), ''));

        IF v_unit_id IS NULL OR v_bed_number IS NULL THEN
            RAISE EXCEPTION 'CRITICAL_CARE_UNIT_AND_BED_REQUIRED';
        END IF;

        SELECT TRUE INTO v_unit_active
        FROM public.critical_care_units
        WHERE id = v_unit_id AND organization_id = v_org_id AND is_active = TRUE;

        IF COALESCE(v_unit_active, FALSE) = FALSE THEN
            RAISE EXCEPTION 'CRITICAL_CARE_UNIT_NOT_FOUND';
        END IF;

        SELECT status INTO v_cc_bed_status
        FROM public.beds
        WHERE organization_id = v_org_id AND bed_number = v_bed_number AND is_active = TRUE
        FOR UPDATE;

        IF v_cc_bed_status IS NULL THEN
            RAISE EXCEPTION 'CRITICAL_CARE_BED_NOT_FOUND:%', v_bed_number;
        END IF;

        IF UPPER(v_cc_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'CRITICAL_CARE_BED_UNAVAILABLE:%', v_bed_number;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.critical_care_admissions
            WHERE organization_id = v_org_id
              AND bed_number = v_bed_number
              AND status IN ('ACTIVE', 'admitted')
        ) THEN
            RAISE EXCEPTION 'CRITICAL_CARE_DOUBLE_ASSIGNMENT:%', v_bed_number;
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
            'ACTIVE',
            NOW()
        )
        RETURNING id INTO v_cc_admission_id;

        UPDATE public.beds
        SET status = 'OCCUPIED',
            patient_name = (SELECT full_name FROM public.patients WHERE id = v_patient_id),
            admitted_at = v_encounter_at
        WHERE organization_id = v_org_id AND bed_number = v_bed_number;
    END IF;

    -- Return comprehensive result
    RETURN jsonb_build_object(
        'success', TRUE,
        'patient_id', v_patient_id,
        'patient_code', v_patient_code,
        'episode_id', v_episode_id,
        'episode_number', v_episode_number,
        'opd_visit_id', v_opd_visit_id,
        'ipd_visit_id', v_ipd_visit_id,
        'ipd_assignment_id', v_assignment_id,
        'critical_care_admission_id', v_cc_admission_id,
        'encounter_at', v_encounter_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
