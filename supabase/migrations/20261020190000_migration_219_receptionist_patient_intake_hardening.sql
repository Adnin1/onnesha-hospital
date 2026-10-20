-- =====================================================================================
-- Migration 219: Receptionist Patient Intake & Pediatric Demographic Hardening
--
-- Fixes:
--   1. Ensures reception staff has comprehensive front-desk intake permissions
--      (patients.create, ipd.admit, ipd.manage, appointments.create, billing.create, referral.assign).
--   2. Upgrades public.create_patient_intake_atomic to atomically persist:
--      - address
--      - age, age_years, age_months, age_days
--      - dob, date_of_birth
--      - nid, nid_or_birth_cert
--      - admission_discount_amount, admission_discount_reason
--      - updates existing patient demographics when existingPatientId is supplied.
--   3. Broadens intake caller RBAC check to include appointments.create and billing.create.
-- =====================================================================================

BEGIN;

-- 1. Ensure receptionist role has full clinical & reception intake permissions in role_permissions
DO $$
DECLARE
    v_role_id UUID;
    v_perm TEXT;
    v_perms TEXT[] := ARRAY[
        'patients.create',
        'patients.view',
        'patients.edit',
        'patients.history',
        'ipd.admit',
        'ipd.view',
        'ipd.manage',
        'appointments.create',
        'appointments.view',
        'appointments.call_token',
        'billing.create',
        'billing.view',
        'beds.view',
        'beds.allocate',
        'beds.manage',
        'referral.assign',
        'referral.create',
        'referral.view'
    ];
BEGIN
    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = 'receptionist' LIMIT 1;
    IF v_role_id IS NOT NULL THEN
        FOREACH v_perm IN ARRAY v_perms LOOP
            IF EXISTS (SELECT 1 FROM public.permissions WHERE key = v_perm) THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.role_permissions 
                    WHERE role_id = v_role_id AND permission_key = v_perm
                ) THEN
                    INSERT INTO public.role_permissions (role_id, permission_key)
                    VALUES (v_role_id, v_perm);
                END IF;
            END IF;
        END LOOP;
    END IF;
END $$;

-- 2. Upgraded create_patient_intake_atomic with full demographic and pediatric persistence
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
    v_age_years INT;
    v_age_months INT;
    v_age_days INT;
    v_address TEXT;
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
    v_target_status TEXT;
    v_target_label TEXT;
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
        OR public.is_org_admin_or_has_permission(v_org_id, 'ipd.admit')
        OR public.is_org_admin_or_has_permission(v_org_id, 'ipd.manage')
        OR public.is_org_admin_or_has_permission(v_org_id, 'appointments.create')
        OR public.is_org_admin_or_has_permission(v_org_id, 'billing.create')
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
    v_age_years := NULLIF(COALESCE(v_patient->>'age_years', v_patient->>'age'), '')::INT;
    v_age_months := NULLIF(v_patient->>'age_months', '')::INT;
    v_age_days := NULLIF(v_patient->>'age_days', '')::INT;
    v_age := COALESCE(v_age_years, 0);
    v_address := NULLIF(trim(v_patient->>'address'), '');

    -- If dob is not provided, derive from age components
    IF v_dob IS NULL AND (v_age_years IS NOT NULL OR v_age_months IS NOT NULL OR v_age_days IS NOT NULL) THEN
        v_dob := (CURRENT_DATE - (COALESCE(v_age_years, 0) * INTERVAL '1 year') - (COALESCE(v_age_months, 0) * INTERVAL '1 month') - (COALESCE(v_age_days, 0) * INTERVAL '1 day'))::DATE;
    END IF;

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

        -- Update existing patient's address, emergency contacts, or pediatric age if provided
        UPDATE public.patients
        SET
            address = COALESCE(v_address, address),
            emergency_contact_name = COALESCE(NULLIF(trim(COALESCE(v_patient->>'emergency_contact_name', v_patient->>'emergencyName', v_patient->>'emergency_name')), ''), emergency_contact_name),
            emergency_contact_phone = COALESCE(NULLIF(trim(COALESCE(v_patient->>'emergency_contact_phone', v_patient->>'emergencyPhone', v_patient->>'emergency_phone')), ''), emergency_contact_phone),
            emergency_contact_relation = COALESCE(NULLIF(trim(COALESCE(v_patient->>'emergency_contact_relation', v_patient->>'emergencyRelation', v_patient->>'emergency_relation')), ''), emergency_contact_relation),
            dob = COALESCE(v_dob, dob),
            date_of_birth = COALESCE(v_dob, date_of_birth),
            age_years = COALESCE(v_age_years, age_years),
            age_months = COALESCE(v_age_months, age_months),
            age_days = COALESCE(v_age_days, age_days),
            updated_at = NOW()
        WHERE id = v_patient_id;
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
                full_name, phone, alternate_phone, email, gender, blood_group, dob, date_of_birth,
                age, age_years, age_months, age_days, address,
                marital_status, occupation, emergency_contact_name,
                emergency_contact_phone, emergency_contact_relation,
                nid_or_birth_cert, nid,
                admission_discount_amount, admission_discount_reason,
                created_by, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_code, v_registration_serial,
                v_full_name, v_phone,
                NULLIF(trim(COALESCE(v_patient->>'alternate_phone', v_patient->>'alternatePhone')), ''),
                NULLIF(trim(v_patient->>'email'), ''),
                v_gender,
                NULLIF(trim(COALESCE(v_patient->>'blood_group', v_patient->>'bloodGroup')), ''),
                v_dob,
                v_dob,
                v_age,
                v_age_years,
                v_age_months,
                v_age_days,
                v_address,
                NULLIF(trim(COALESCE(v_patient->>'marital_status', v_patient->>'maritalStatus')), ''),
                NULLIF(trim(v_patient->>'occupation'), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_name', v_patient->>'emergencyName', v_patient->>'emergency_name')), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_phone', v_patient->>'emergencyPhone', v_patient->>'emergency_phone')), ''),
                NULLIF(trim(COALESCE(v_patient->>'emergency_contact_relation', v_patient->>'emergencyRelation', v_patient->>'emergency_relation')), ''),
                v_nid,
                v_nid,
                COALESCE((v_patient->>'admission_discount_amount')::NUMERIC, (p_request->>'admission_discount_amount')::NUMERIC, 0),
                NULLIF(trim(COALESCE(v_patient->>'admission_discount_reason', p_request->>'admission_discount_reason')), ''),
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
            -- 1. Lock bed row FOR UPDATE to guard against race conditions
            SELECT status, bed_number, daily_rate 
            INTO v_target_status, v_target_label, v_bed_charge
            FROM public.beds
            WHERE id = v_bed_id
            FOR UPDATE;

            IF v_target_status IS NULL THEN
                RAISE EXCEPTION 'BED_NOT_FOUND: Selected bed does not exist.' USING ERRCODE = 'P0002';
            END IF;

            -- 2. Verify no active assignment in bed_assignments
            IF EXISTS (
                SELECT 1 FROM public.bed_assignments
                WHERE bed_id = v_bed_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'BED_NOT_VACANT: Bed % is already occupied by an active patient.', v_target_label USING ERRCODE = '23505';
            END IF;

            -- 3. Verify bed status is vacant or available
            IF UPPER(COALESCE(v_target_status, '')) NOT IN ('VACANT', 'AVAILABLE') THEN
                RAISE EXCEPTION 'BED_NOT_VACANT: Bed % is currently in % status and cannot accept admission.', v_target_label, v_target_status USING ERRCODE = '23505';
            END IF;

            UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = v_bed_id;
        ELSIF v_cabin_id IS NOT NULL THEN
            -- 1. Lock cabin row FOR UPDATE
            SELECT status, cabin_number, daily_rate 
            INTO v_target_status, v_target_label, v_bed_charge
            FROM public.cabins
            WHERE id = v_cabin_id
            FOR UPDATE;

            IF v_target_status IS NULL THEN
                RAISE EXCEPTION 'CABIN_NOT_FOUND: Selected cabin does not exist.' USING ERRCODE = 'P0002';
            END IF;

            -- 2. Verify no active assignment in bed_assignments
            IF EXISTS (
                SELECT 1 FROM public.bed_assignments
                WHERE cabin_id = v_cabin_id AND status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'CABIN_NOT_VACANT: Cabin % is already occupied by an active patient.', v_target_label USING ERRCODE = '23505';
            END IF;

            -- 3. Verify cabin status is vacant or available
            IF UPPER(COALESCE(v_target_status, '')) NOT IN ('VACANT', 'AVAILABLE') THEN
                RAISE EXCEPTION 'CABIN_NOT_VACANT: Cabin % is currently in % status and cannot accept admission.', v_target_label, v_target_status USING ERRCODE = '23505';
            END IF;

            UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = v_cabin_id;
        END IF;

        IF v_bed_id IS NOT NULL OR v_cabin_id IS NOT NULL THEN
            BEGIN
                INSERT INTO public.bed_assignments (
                    organization_id, visit_id, patient_id, bed_id, cabin_id,
                    assigned_at, daily_charge, status, assigned_by
                )
                VALUES (
                    v_org_id, v_ipd_visit_id, v_patient_id, v_bed_id, v_cabin_id,
                    v_encounter_at, COALESCE(v_bed_charge, 0), 'ACTIVE', v_actor_id
                )
                RETURNING id INTO v_bed_assignment_id;
            EXCEPTION
                WHEN unique_violation THEN
                    IF v_bed_id IS NOT NULL THEN
                        RAISE EXCEPTION 'BED_NOT_VACANT: Bed % is already occupied by another active patient.', COALESCE(v_target_label, 'selected') USING ERRCODE = '23505';
                    ELSE
                        RAISE EXCEPTION 'CABIN_NOT_VACANT: Cabin % is already occupied by another active patient.', COALESCE(v_target_label, 'selected') USING ERRCODE = '23505';
                    END IF;
            END;
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

COMMIT;
