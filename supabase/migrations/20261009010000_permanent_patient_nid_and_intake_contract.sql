-- ==============================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
-- Migration 127: Permanent Patient NID Contract, PostgREST Schema Reload & Intake Hardening
--
-- Solves:
-- 1. Eliminates any remaining references to public.patients.nid by standardizing on
--    public.patients.nid_or_birth_cert.
-- 2. Maintains full schema bidirectional compatibility between nid and nid_or_birth_cert.
-- 3. Recomputes admission discount authoritatively on the database from billable base.
-- 4. Notifies PostgREST to reload its schema cache (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- 1. Ensure nid_or_birth_cert column exists and is indexed
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS nid_or_birth_cert TEXT;
CREATE INDEX IF NOT EXISTS idx_patients_nid_or_birth_cert 
    ON public.patients(organization_id, nid_or_birth_cert) 
    WHERE nid_or_birth_cert IS NOT NULL AND is_deleted = FALSE;

-- 2. Bidirectional synchronization trigger between nid and nid_or_birth_cert if nid exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'nid'
    ) THEN
        -- Backfill both columns
        UPDATE public.patients 
        SET nid = nid_or_birth_cert 
        WHERE nid IS NULL AND nid_or_birth_cert IS NOT NULL;

        UPDATE public.patients 
        SET nid_or_birth_cert = nid 
        WHERE nid_or_birth_cert IS NULL AND nid IS NOT NULL;

        -- Create or replace synchronization trigger
        CREATE OR REPLACE FUNCTION public.sync_patient_nid_columns()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = ''
        AS $fn$
        BEGIN
            IF NEW.nid_or_birth_cert IS NOT NULL AND NEW.nid IS NULL THEN
                NEW.nid := NEW.nid_or_birth_cert;
            ELSIF NEW.nid IS NOT NULL AND NEW.nid_or_birth_cert IS NULL THEN
                NEW.nid_or_birth_cert := NEW.nid;
            END IF;
            RETURN NEW;
        END;
        $fn$;

        DROP TRIGGER IF EXISTS trg_sync_patient_nid_columns ON public.patients;
        CREATE TRIGGER trg_sync_patient_nid_columns
            BEFORE INSERT OR UPDATE OF nid, nid_or_birth_cert ON public.patients
            FOR EACH ROW
            EXECUTE FUNCTION public.sync_patient_nid_columns();
    END IF;
END $$;

-- 3. Recreate create_patient_intake_atomic with strict nid_or_birth_cert contract
CREATE OR REPLACE FUNCTION public.create_patient_intake_atomic(p_request JSONB)
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
    v_admission_discount NUMERIC := 0;
    v_admission_discount_percent NUMERIC := 0;
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
    v_opd_fee NUMERIC := 0;
    v_cc_daily_charge NUMERIC := 0;
    v_billable_base NUMERIC := 0;
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

    -- Extract NID/Birth Certificate number
    v_nid := NULLIF(trim(COALESCE(v_patient->>'nid_or_birth_cert', v_patient->>'nid')), '');

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
            nid_or_birth_cert = COALESCE(v_nid, nid_or_birth_cert),
            emergency_contact_name = COALESCE(v_emergency_name, emergency_contact_name),
            emergency_contact_phone = COALESCE(v_emergency_phone, emergency_contact_phone),
            emergency_contact_relation = COALESCE(v_emergency_relation, emergency_contact_relation),
            updated_at = NOW()
        WHERE id = v_patient_id;
    ELSE
        SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
        v_registration_serial := TO_CHAR(v_encounter_at, 'YYMMDD') || '-' || SUBSTRING(v_patient_code FROM 7);

        -- Strict duplicate check against nid_or_birth_cert
        IF v_nid IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.patients
            WHERE organization_id = v_org_id
              AND is_deleted = FALSE
              AND nid_or_birth_cert = v_nid
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
            marital_status, occupation, nid_or_birth_cert, address,
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

        -- Store identification record if NID is provided
        IF v_nid IS NOT NULL THEN
            INSERT INTO public.patient_identifications (patient_id, id_type, id_number, is_verified)
            VALUES (v_patient_id, 'NID', regexp_replace(v_nid, '[^0-9]', '', 'g'), FALSE)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    -- Compute Billable Base for Admission Discount re-computation
    IF COALESCE((v_opd->>'enabled')::BOOLEAN, FALSE) THEN
        v_doctor_id := NULLIF(v_opd->>'doctor_id', '')::UUID;
        IF v_doctor_id IS NOT NULL THEN
            SELECT COALESCE(consultation_fee, opd_fee, 0) INTO v_opd_fee
            FROM public.doctors
            WHERE id = v_doctor_id AND organization_id = v_org_id;
        END IF;
        v_billable_base := v_billable_base + COALESCE(v_opd_fee, 0);
    END IF;

    IF COALESCE((v_ipd->>'enabled')::BOOLEAN, FALSE) THEN
        v_bed_id := NULLIF(v_ipd->>'bed_id', '')::UUID;
        v_cabin_id := NULLIF(v_ipd->>'cabin_id', '')::UUID;
        IF v_bed_id IS NOT NULL THEN
            SELECT COALESCE(daily_rate, 0) INTO v_daily_charge
            FROM public.beds WHERE id = v_bed_id AND organization_id = v_org_id;
            v_billable_base := v_billable_base + COALESCE(v_daily_charge, 0);
        ELSIF v_cabin_id IS NOT NULL THEN
            SELECT COALESCE(daily_rate, 0) INTO v_cabin_charge
            FROM public.cabins WHERE id = v_cabin_id AND organization_id = v_org_id;
            v_billable_base := v_billable_base + COALESCE(v_cabin_charge, 0);
        END IF;
    END IF;

    IF COALESCE((v_cc->>'enabled')::BOOLEAN, FALSE) THEN
        v_unit_id := NULLIF(v_cc->>'unit_id', '')::UUID;
        IF v_unit_id IS NOT NULL THEN
            SELECT COALESCE(daily_charge, 0) INTO v_cc_daily_charge
            FROM public.critical_care_units WHERE id = v_unit_id AND organization_id = v_org_id;
            v_billable_base := v_billable_base + COALESCE(v_cc_daily_charge, 0);
        END IF;
    END IF;

    -- Authoritative Admission Discount Calculation
    v_admission_discount_percent := COALESCE(
        (p_request->>'admission_discount_percentage')::NUMERIC,
        (p_request->>'admission_discount_percent')::NUMERIC,
        (v_patient->>'admission_discount_percentage')::NUMERIC,
        (v_patient->>'admission_discount_percent')::NUMERIC,
        0
    );

    IF v_admission_discount_percent > 0 THEN
        IF v_admission_discount_percent > 100 THEN
            RAISE EXCEPTION 'DISCOUNT_PERCENTAGE_EXCEEDS_LIMIT';
        END IF;
        v_admission_discount := ROUND((v_billable_base * (v_admission_discount_percent / 100.0)), 2);
    ELSE
        v_admission_discount := COALESCE(
            (p_request->>'admission_discount_amount')::NUMERIC,
            (v_patient->>'admission_discount_amount')::NUMERIC,
            0
        );
    END IF;

    IF v_admission_discount < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_DISCOUNT_PROHIBITED';
    END IF;

    IF v_billable_base > 0 AND v_admission_discount > v_billable_base THEN
        v_admission_discount := v_billable_base;
    END IF;

    -- 2. Create Care Episode
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

        IF v_bed_id IS NOT NULL THEN
            SELECT status, bed_number, daily_rate
            INTO v_bed_status, v_bed_number, v_daily_charge
            FROM public.beds
            WHERE id = v_bed_id AND organization_id = v_org_id AND is_active = TRUE;

            IF v_bed_status IS NULL THEN
                RAISE EXCEPTION 'IPD_BED_NOT_FOUND';
            END IF;

            IF v_bed_status != 'VACANT' THEN
                RAISE EXCEPTION 'IPD_BED_NOT_VACANT';
            END IF;
        END IF;

        IF v_cabin_id IS NOT NULL THEN
            SELECT status, cabin_number, daily_rate
            INTO v_cabin_status, v_cabin_number, v_cabin_charge
            FROM public.cabins
            WHERE id = v_cabin_id AND organization_id = v_org_id AND COALESCE(is_active, TRUE) = TRUE;

            IF v_cabin_status IS NULL THEN
                RAISE EXCEPTION 'IPD_CABIN_NOT_FOUND';
            END IF;

            IF v_cabin_status != 'VACANT' THEN
                RAISE EXCEPTION 'IPD_CABIN_NOT_VACANT';
            END IF;
        END IF;

        SELECT public.generate_visit_number(v_org_id, 'IPD') INTO v_visit_number;

        INSERT INTO public.patient_visits (
            organization_id, patient_id, episode_id, visit_number, visit_type,
            status, department_id, doctor_id, chief_complaint, priority, admitted_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_visit_number, 'IPD',
            'ACTIVE',
            v_department_id,
            v_doctor_id,
            NULLIF(trim(v_ipd->>'provisional_diagnosis'), ''),
            'NORMAL',
            v_encounter_at
        )
        RETURNING id INTO v_ipd_visit_id;

        IF v_visit_id IS NULL THEN
            v_visit_id := v_ipd_visit_id;
        END IF;

        IF v_bed_id IS NOT NULL THEN
            INSERT INTO public.bed_assignments (
                organization_id, patient_id, visit_id, bed_id, status,
                admitted_at, daily_rate, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_id, v_ipd_visit_id, v_bed_id, 'ACTIVE',
                v_encounter_at, v_daily_charge, NOW(), NOW()
            )
            RETURNING id INTO v_assignment_id;

            UPDATE public.beds
            SET status = 'OCCUPIED',
                updated_at = NOW()
            WHERE id = v_bed_id AND organization_id = v_org_id;
        END IF;

        IF v_cabin_id IS NOT NULL THEN
            INSERT INTO public.bed_assignments (
                organization_id, patient_id, visit_id, cabin_id, status,
                admitted_at, daily_rate, created_at, updated_at
            )
            VALUES (
                v_org_id, v_patient_id, v_ipd_visit_id, v_cabin_id, 'ACTIVE',
                v_encounter_at, v_cabin_charge, NOW(), NOW()
            )
            RETURNING id INTO v_assignment_id;

            UPDATE public.cabins
            SET status = 'OCCUPIED',
                updated_at = NOW()
            WHERE id = v_cabin_id AND organization_id = v_org_id;

            UPDATE public.beds
            SET status = 'OCCUPIED',
                updated_at = NOW()
            WHERE cabin_id = v_cabin_id AND organization_id = v_org_id;
        END IF;
    END IF;

    -- 5. Critical Care Service Encounter
    IF COALESCE((v_cc->>'enabled')::BOOLEAN, FALSE) THEN
        v_unit_id := NULLIF(v_cc->>'unit_id', '')::UUID;
        v_bed_number := trim(COALESCE(v_cc->>'bed_number', ''));

        IF v_unit_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL_CARE_REQUIRES_UNIT';
        END IF;

        IF v_bed_number = '' THEN
            RAISE EXCEPTION 'CRITICAL_CARE_REQUIRES_BED';
        END IF;

        SELECT is_active INTO v_unit_active
        FROM public.critical_care_units
        WHERE id = v_unit_id AND organization_id = v_org_id;

        IF v_unit_active IS NULL OR v_unit_active = FALSE THEN
            RAISE EXCEPTION 'CRITICAL_CARE_UNIT_INACTIVE';
        END IF;

        SELECT id, status INTO v_cc_bed_id, v_cc_bed_status
        FROM public.beds
        WHERE organization_id = v_org_id
          AND UPPER(TRIM(bed_number)) = UPPER(TRIM(v_bed_number))
          AND is_active = TRUE
        ORDER BY
            CASE WHEN critical_care_unit_id = v_unit_id THEN 1
                 WHEN critical_care_unit_id IS NULL THEN 2
                 ELSE 3 END,
            created_at ASC
        LIMIT 1;

        IF v_cc_bed_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL_CARE_BED_NOT_FOUND:%', v_bed_number;
        END IF;

        IF v_cc_bed_status != 'VACANT' THEN
            RAISE EXCEPTION 'CRITICAL_CARE_BED_NOT_VACANT:%', v_bed_number;
        END IF;

        UPDATE public.beds
        SET status = 'OCCUPIED',
            critical_care_unit_id = COALESCE(critical_care_unit_id, v_unit_id),
            patient_name = trim(v_patient->>'full_name'),
            admitted_at = v_encounter_at,
            updated_at = NOW()
        WHERE id = v_cc_bed_id AND organization_id = v_org_id;

        INSERT INTO public.critical_care_admissions (
            organization_id, patient_id, unit_id, bed_number,
            status, admission_type, admitted_at, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_unit_id, v_bed_number,
            'ADMITTED',
            COALESCE(NULLIF(v_cc->>'admission_type', ''), 'DIRECT'),
            v_encounter_at, v_user_id, NOW(), NOW()
        )
        RETURNING id INTO v_cc_admission_id;
    END IF;

    -- Return Consolidated Intake Descriptor
    RETURN jsonb_build_object(
        'success', TRUE,
        'patient_id', v_patient_id,
        'patient_code', v_patient_code,
        'registration_serial', v_registration_serial,
        'episode_id', v_episode_id,
        'episode_number', v_episode_number,
        'opd_visit_id', v_opd_visit_id,
        'ipd_visit_id', v_ipd_visit_id,
        'ipd_assignment_id', v_assignment_id,
        'critical_care_admission_id', v_cc_admission_id,
        'critical_care_visit_id', COALESCE(v_ipd_visit_id, v_opd_visit_id),
        'admission_discount_amount', v_admission_discount,
        'encounter_at', v_encounter_at
    );
END;
$$;

-- Grant execution
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO service_role;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
