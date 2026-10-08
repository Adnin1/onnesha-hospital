-- ==============================================================================
-- OHMS Migration 124: Permanent Patient Intake & Care Episode Schema Alignment
--
-- Objective:
--   1. Add missing emergency contact & visit tracking columns to public.patients
--      (emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
--       total_visits, last_visit_date).
--   2. Authoritatively create public.generate_episode_number(UUID) function using
--      the established patient_care_episode_seq sequence.
--   3. Create public.patient_episodes view and INSTEAD OF triggers over
--      public.patient_care_episodes to guarantee 100% bidirectional compatibility
--      for both legacy queries and new workflows.
--   4. Upgrade public.create_patient_intake_atomic to insert directly into
--      public.patient_care_episodes, provide patient_id to public.bed_assignments
--      (preventing NOT NULL constraint violations), and sync patient_contacts.
--   5. Upgrade public.get_episode_billing_preview to query public.patient_care_episodes.
-- ==============================================================================

-- 1. Ensure all columns exist on public.patients
ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
    ADD COLUMN IF NOT EXISTS total_visits INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_visit_date TIMESTAMPTZ;

-- Backfill emergency contact fields from patient_contacts if available
UPDATE public.patients p
SET emergency_contact_name = c.contact_name,
    emergency_contact_phone = c.phone,
    emergency_contact_relation = c.relationship
FROM public.patient_contacts c
WHERE c.patient_id = p.id
  AND c.is_primary_emergency = TRUE
  AND p.emergency_contact_name IS NULL;

-- 2. Sequence & Function for Episode Number Generation
CREATE SEQUENCE IF NOT EXISTS public.patient_care_episode_seq START WITH 100001;

CREATE OR REPLACE FUNCTION public.generate_episode_number(
    p_org_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN 'EPI-' ||
        TO_CHAR(NOW() AT TIME ZONE 'Asia/Dhaka', 'YYMM') ||
        '-' || LPAD(nextval('public.patient_care_episode_seq')::TEXT, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_episode_number(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_episode_number(UUID) TO authenticated, service_role;

-- 3. Backward-Compatible View & INSTEAD OF Trigger for patient_episodes -> patient_care_episodes
CREATE OR REPLACE VIEW public.patient_episodes AS
SELECT
    id,
    organization_id,
    patient_id,
    episode_number,
    started_at AS start_time,
    started_at,
    ended_at AS end_time,
    ended_at,
    status,
    source,
    notes,
    admission_discount_amount,
    admission_discount_reason,
    referral_agent_id,
    created_by,
    created_at,
    updated_at
FROM public.patient_care_episodes;

CREATE OR REPLACE FUNCTION public.trg_patient_episodes_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_new_id UUID := COALESCE(NEW.id, gen_random_uuid());
    v_started_at TIMESTAMPTZ := COALESCE(NEW.started_at, NEW.start_time, NOW());
    v_ended_at TIMESTAMPTZ := COALESCE(NEW.ended_at, NEW.end_time);
BEGIN
    INSERT INTO public.patient_care_episodes (
        id, organization_id, patient_id, episode_number,
        started_at, ended_at, status, source, notes,
        admission_discount_amount, admission_discount_reason,
        referral_agent_id, created_by, created_at, updated_at
    )
    VALUES (
        v_new_id,
        NEW.organization_id,
        NEW.patient_id,
        NEW.episode_number,
        v_started_at,
        v_ended_at,
        COALESCE(NEW.status, 'ACTIVE'),
        COALESCE(NEW.source, 'FRONT_DESK'),
        NEW.notes,
        COALESCE(NEW.admission_discount_amount, 0),
        NEW.admission_discount_reason,
        NEW.referral_agent_id,
        NEW.created_by,
        COALESCE(NEW.created_at, NOW()),
        COALESCE(NEW.updated_at, NOW())
    );
    NEW.id := v_new_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_episodes_insert_trigger ON public.patient_episodes;
CREATE TRIGGER trg_patient_episodes_insert_trigger
INSTEAD OF INSERT ON public.patient_episodes
FOR EACH ROW EXECUTE FUNCTION public.trg_patient_episodes_insert();

CREATE OR REPLACE FUNCTION public.trg_patient_episodes_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.patient_care_episodes
    SET ended_at = COALESCE(NEW.ended_at, NEW.end_time, ended_at),
        status = COALESCE(NEW.status, status),
        notes = COALESCE(NEW.notes, notes),
        admission_discount_amount = COALESCE(NEW.admission_discount_amount, admission_discount_amount),
        admission_discount_reason = COALESCE(NEW.admission_discount_reason, admission_discount_reason),
        referral_agent_id = COALESCE(NEW.referral_agent_id, referral_agent_id),
        updated_at = NOW()
    WHERE id = OLD.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_episodes_update_trigger ON public.patient_episodes;
CREATE TRIGGER trg_patient_episodes_update_trigger
INSTEAD OF UPDATE ON public.patient_episodes
FOR EACH ROW EXECUTE FUNCTION public.trg_patient_episodes_update();

GRANT SELECT, INSERT, UPDATE ON public.patient_episodes TO authenticated, service_role;

-- 4. Authoritative Upgrade of create_patient_intake_atomic
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
    v_emergency_name TEXT;
    v_emergency_phone TEXT;
    v_emergency_relation TEXT;
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

    -- Extract emergency contact parameters
    v_emergency_name := NULLIF(trim(COALESCE(v_patient->>'emergency_name', v_patient->>'emergency_contact_name')), '');
    v_emergency_phone := NULLIF(trim(COALESCE(v_patient->>'emergency_phone', v_patient->>'emergency_contact_phone')), '');
    v_emergency_relation := COALESCE(NULLIF(trim(COALESCE(v_patient->>'emergency_relation', v_patient->>'emergency_contact_relation')), ''), 'Guardian');

    -- 1. Create or Resolve Patient Master
    IF v_existing_patient_id IS NOT NULL THEN
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE id = v_existing_patient_id AND organization_id = v_org_id;

        IF v_patient_id IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NOT_FOUND';
        END IF;

        v_nid := NULLIF(trim(COALESCE(v_patient->>'nid', v_patient->>'nid_or_birth_cert')), '');

        UPDATE public.patients
        SET last_visit_date = v_encounter_at,
            total_visits = COALESCE(total_visits, 0) + 1,
            nid = COALESCE(v_nid, nid),
            nid_or_birth_cert = COALESCE(v_nid, nid_or_birth_cert, nid),
            emergency_contact_name = COALESCE(v_emergency_name, emergency_contact_name),
            emergency_contact_phone = COALESCE(v_emergency_phone, emergency_contact_phone),
            emergency_contact_relation = COALESCE(v_emergency_relation, emergency_contact_relation),
            updated_at = NOW()
        WHERE id = v_patient_id;
    ELSE
        SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
        v_registration_serial := TO_CHAR(v_encounter_at, 'YYMMDD') || '-' || SUBSTRING(v_patient_code FROM 7);

        v_nid := NULLIF(trim(COALESCE(v_patient->>'nid', v_patient->>'nid_or_birth_cert')), '');
        IF v_nid IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.patients
            WHERE organization_id = v_org_id
              AND is_deleted = FALSE
              AND (nid = v_nid OR nid_or_birth_cert = v_nid)
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_NID:%', v_nid;
        END IF;

        IF NULLIF(v_patient->>'dob', '') IS NOT NULL THEN
            v_dob := (v_patient->>'dob')::DATE;
            v_age := GREATEST(0, EXTRACT(YEAR FROM AGE(v_encounter_at, v_dob))::INTEGER);
        ELSE
            v_age := COALESCE((v_patient->>'age')::INTEGER, (v_patient->>'age_years')::INTEGER, 0);
        END IF;

        INSERT INTO public.patients (
            organization_id, patient_code, registration_serial, full_name,
            phone, alternate_phone, email, gender, dob, age, age_years, blood_group,
            marital_status, occupation, nid, nid_or_birth_cert, address,
            emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
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
            v_age,
            COALESCE(NULLIF(v_patient->>'blood_group', ''), 'UNKNOWN'),
            NULLIF(trim(v_patient->>'marital_status'), ''),
            NULLIF(trim(v_patient->>'occupation'), ''),
            v_nid,
            v_nid,
            NULLIF(trim(v_patient->>'address'), ''),
            v_emergency_name,
            v_emergency_phone,
            v_emergency_relation,
            1,
            v_encounter_at,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_patient_id;

        -- Store primary emergency contact into public.patient_contacts table as well
        IF v_emergency_name IS NOT NULL AND v_emergency_phone IS NOT NULL THEN
            INSERT INTO public.patient_contacts (
                patient_id, contact_name, relationship, phone, is_primary_emergency, created_at
            )
            VALUES (
                v_patient_id, v_emergency_name, v_emergency_relation, v_emergency_phone, TRUE, NOW()
            );
        END IF;

        -- Store identification record if NID is provided
        IF v_nid IS NOT NULL THEN
            INSERT INTO public.patient_identifications (
                patient_id, id_type, id_number, is_verified
            )
            VALUES (v_patient_id, 'NID', regexp_replace(v_nid, '[^0-9]', '', 'g'), FALSE)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    -- 2. Create Canonical Patient Care Episode
    SELECT public.generate_episode_number(v_org_id) INTO v_episode_number;

    INSERT INTO public.patient_care_episodes (
        organization_id, patient_id, episode_number, started_at,
        status, source, referral_agent_id, admission_discount_amount,
        admission_discount_reason, created_by, created_at, updated_at
    )
    VALUES (
        v_org_id,
        v_patient_id,
        v_episode_number,
        v_encounter_at,
        'ACTIVE',
        'UNIFIED_INTAKE',
        v_referral_agent_id,
        v_admission_discount,
        v_admission_discount_reason,
        v_user_id,
        NOW(),
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
            status, department_id, doctor_id, priority, admitted_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number, 'IPD',
            'ACTIVE',
            v_department_id,
            v_doctor_id,
            'NORMAL',
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
                organization_id, patient_id, visit_id, bed_id, assigned_at,
                daily_charge, status, assigned_by
            )
            VALUES (
                v_org_id, v_patient_id, v_ipd_visit_id, v_bed_id, v_encounter_at,
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
                organization_id, patient_id, visit_id, cabin_id, assigned_at,
                daily_charge, status, assigned_by
            )
            VALUES (
                v_org_id, v_patient_id, v_ipd_visit_id, v_cabin_id, v_encounter_at,
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

-- 5. Upgrade get_episode_billing_preview to query patient_care_episodes directly
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
DECLARE
    v_episode RECORD;
    v_lines JSONB := '[]'::JSONB;
    v_total NUMERIC := 0;
    v_ep_invoiced NUMERIC := 0;
    v_ep_paid NUMERIC := 0;
    v_ep_due NUMERIC := 0;
    v_life_invoiced NUMERIC := 0;
    v_life_paid NUMERIC := 0;
    v_life_due NUMERIC := 0;
    v_rec RECORD;
    v_daily_rate NUMERIC;
    v_days NUMERIC;
    v_stay_subtotal NUMERIC;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF p_episode_id IS NOT NULL THEN
        SELECT id, episode_number, started_at AS start_time, ended_at AS end_time, status,
               admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_episode
        FROM public.patient_care_episodes
        WHERE id = p_episode_id AND organization_id = p_org_id;
    ELSE
        SELECT id, episode_number, started_at AS start_time, ended_at AS end_time, status,
               admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_episode
        FROM public.patient_care_episodes
        WHERE patient_id = p_patient_id AND organization_id = p_org_id
        ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, started_at DESC
        LIMIT 1;
    END IF;

    IF v_episode.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'episode_id', NULL,
            'episode_number', NULL,
            'lines', '[]'::JSONB,
            'total', 0,
            'admission_discount_amount', 0,
            'admission_discount_reason', NULL,
            'referral_agent_id', NULL,
            'current_episode_invoiced', 0,
            'current_episode_paid', 0,
            'current_episode_due', 0,
            'lifetime_invoiced', 0,
            'lifetime_paid', 0,
            'lifetime_due', 0,
            'previous_invoiced', 0,
            'previous_paid', 0,
            'previous_due', 0
        );
    END IF;

    -- Bed / Stay Charges
    FOR v_rec IN (
        SELECT ba.id, ba.assigned_at, ba.vacated_at, ba.daily_charge,
               COALESCE(b.bed_number, c.cabin_number, 'Stay') AS resource_label
        FROM public.bed_assignments ba
        LEFT JOIN public.beds b ON b.id = ba.bed_id
        LEFT JOIN public.cabins c ON c.id = ba.cabin_id
        JOIN public.patient_visits pv ON pv.id = ba.visit_id
        WHERE pv.episode_id = v_episode.id AND ba.organization_id = p_org_id
    ) LOOP
        v_daily_rate := COALESCE(v_rec.daily_charge, 0);
        v_days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (COALESCE(v_rec.vacated_at, p_as_of) - v_rec.assigned_at)) / 86400.0));
        v_stay_subtotal := v_daily_rate * v_days;
        v_lines := v_lines || jsonb_build_object(
            'category', 'BED_CHARGES',
            'description', 'Stay: ' || v_rec.resource_label || ' (' || v_days::TEXT || ' days)',
            'quantity', v_days,
            'unit_price', v_daily_rate,
            'subtotal', v_stay_subtotal
        );
        v_total := v_total + v_stay_subtotal;
    END LOOP;

    -- Additional Episode Service Charges
    FOR v_rec IN (
        SELECT service_category, description, quantity, unit_price, subtotal
        FROM public.episode_service_charges
        WHERE episode_id = v_episode.id AND organization_id = p_org_id AND is_billed = FALSE
    ) LOOP
        v_lines := v_lines || jsonb_build_object(
            'category', v_rec.service_category,
            'description', v_rec.description,
            'quantity', v_rec.quantity,
            'unit_price', v_rec.unit_price,
            'subtotal', v_rec.subtotal
        );
        v_total := v_total + v_rec.subtotal;
    END LOOP;

    -- Financial Invariant Calculation
    SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(paid_amount), 0), COALESCE(SUM(due_amount), 0)
    INTO v_ep_invoiced, v_ep_paid, v_ep_due
    FROM public.invoices
    WHERE episode_id = v_episode.id AND organization_id = p_org_id AND is_voided = FALSE;

    SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(paid_amount), 0), COALESCE(SUM(due_amount), 0)
    INTO v_life_invoiced, v_life_paid, v_life_due
    FROM public.invoices
    WHERE patient_id = p_patient_id AND organization_id = p_org_id AND is_voided = FALSE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'episode_id', v_episode.id,
        'episode_number', v_episode.episode_number,
        'lines', v_lines,
        'total', v_total,
        'admission_discount_amount', COALESCE(v_episode.admission_discount_amount, 0),
        'admission_discount_reason', v_episode.admission_discount_reason,
        'referral_agent_id', v_episode.referral_agent_id,
        'current_episode_invoiced', v_ep_invoiced,
        'current_episode_paid', v_ep_paid,
        'current_episode_due', v_ep_due,
        'lifetime_invoiced', v_life_invoiced,
        'lifetime_paid', v_life_paid,
        'lifetime_due', v_life_due,
        'previous_invoiced', GREATEST(0, v_life_invoiced - v_ep_invoiced),
        'previous_paid', GREATEST(0, v_life_paid - v_ep_paid),
        'previous_due', GREATEST(0, v_life_due - v_ep_due)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
