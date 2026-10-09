-- ==============================================================================
-- OHMS Migration 128: Permanent Unified Admission, Consultation Fee, & Episode Billing
-- Date: 2026-10-09
-- Purpose:
--   1. Fix public.doctors schema: add consultation_fee synchronized with opd_fee
--      so any query referencing consultation_fee succeeds permanently.
--   2. Fix public.create_patient_intake_atomic:
--      - Safely reference opd_fee and consultation_fee with fail-safe fallback.
--      - Insert episode_id, admitting_doctor_id, initial_diagnosis, ventilator_required
--        into public.critical_care_admissions so ICU/CCU admissions are fully linked.
--      - Support atomic OT Booking creation during unified intake.
--   3. Upgrade public.get_episode_billing_overview & get_episode_billing_preview:
--      - Automatically aggregate all 5 candidate sources: OPD, Bed/Cabin, Critical Care,
--        OT Surgeries (ot_bookings), and Additional Service Charges (episode_service_charges).
--   4. Upgrade public.create_episode_settlement_invoice_atomic_v2:
--      - Support all settlement parameters (discounts, initial payment, referral agent, notes).
--      - Atomically create settlement invoice, invoice items, and record payment.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. DOCTORS SCHEMA HARDENING: consultation_fee COLUMN & SYNCHRONIZATION
-- ------------------------------------------------------------------------------
ALTER TABLE public.doctors
    ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(10, 2) DEFAULT 800.00;

UPDATE public.doctors
SET consultation_fee = COALESCE(opd_fee, 800.00)
WHERE consultation_fee IS NULL;

CREATE OR REPLACE FUNCTION public.sync_doctor_fees()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.opd_fee IS NOT NULL AND (NEW.consultation_fee IS NULL OR NEW.consultation_fee != NEW.opd_fee) THEN
        NEW.consultation_fee := NEW.opd_fee;
    ELSIF NEW.consultation_fee IS NOT NULL AND NEW.opd_fee IS NULL THEN
        NEW.opd_fee := NEW.consultation_fee;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_doctor_fees ON public.doctors;
CREATE TRIGGER trg_sync_doctor_fees
    BEFORE INSERT OR UPDATE OF opd_fee, consultation_fee ON public.doctors
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_doctor_fees();

-- ------------------------------------------------------------------------------
-- 2. CRITICAL CARE SCHEMA HARDENING: status check & episode_id column
-- ------------------------------------------------------------------------------
ALTER TABLE public.critical_care_admissions
    ADD COLUMN IF NOT EXISTS episode_id UUID REFERENCES public.patient_care_episodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_critical_care_admissions_episode
    ON public.critical_care_admissions (organization_id, episode_id);

ALTER TABLE public.critical_care_admissions
    DROP CONSTRAINT IF EXISTS critical_care_admissions_status_check;

ALTER TABLE public.critical_care_admissions
    ADD CONSTRAINT critical_care_admissions_status_check
    CHECK (status IN ('admitted', 'transferred', 'discharged', 'deceased', 'ACTIVE', 'DISCHARGED', 'TRANSFERRED', 'DECEASED', 'ADMITTED'));

-- ------------------------------------------------------------------------------
-- 3. PERMANENT CREATE_PATIENT_INTAKE_ATOMIC
-- ------------------------------------------------------------------------------
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
    v_encounter_at TIMESTAMPTZ := COALESCE((p_request->>'encounter_at')::TIMESTAMPTZ, NOW());
    v_services JSONB := COALESCE(p_request->'services', '{}'::JSONB);
    v_patient JSONB := COALESCE(p_request->'patient', '{}'::JSONB);
    v_opd JSONB := COALESCE(v_services->'opd', '{}'::JSONB);
    v_ipd JSONB := COALESCE(v_services->'ipd', '{}'::JSONB);
    v_cc JSONB := COALESCE(v_services->'critical_care', v_services->'criticalCare', '{}'::JSONB);
    v_ot JSONB := COALESCE(v_services->'ot', '{}'::JSONB);
    v_admission_discount NUMERIC := 0;
    v_admission_discount_percent NUMERIC := 0;
    v_admission_discount_reason TEXT := NULLIF(trim(COALESCE(p_request->>'admission_discount_reason', v_patient->>'admission_discount_reason')), '');
    v_referral_agent_id UUID := NULLIF(COALESCE(p_request->>'referral_agent_id', v_ipd->>'referral_agent_id'), '')::UUID;
    v_referral_agent_code TEXT;
    v_referral_agent_name TEXT;
    v_visit_id UUID;
    v_opd_visit_id UUID;
    v_ipd_visit_id UUID;
    v_cc_visit_id UUID;
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
    v_billable_base NUMERIC := 0;
    v_opd_fee NUMERIC := 0;
    v_cc_daily_charge NUMERIC := 0;
    v_ot_charge NUMERIC := 0;
    v_ot_booking_id UUID;
    v_ot_room_id UUID;
    v_ot_surgeon_id UUID;
    v_ot_anesthetist_id UUID;
    v_ot_procedure TEXT;
    v_ot_anesthesia TEXT;
    v_ot_start TIMESTAMPTZ;
    v_ot_end TIMESTAMPTZ;
BEGIN
    -- Strict Tenant and Authentication Guard
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
    END IF;

    IF private.get_current_org_id() IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
    END IF;

    -- Validate Referral Agent if provided
    IF v_referral_agent_id IS NOT NULL THEN
        SELECT agent_code, full_name
        INTO v_referral_agent_code, v_referral_agent_name
        FROM public.referral_agents
        WHERE id = v_referral_agent_id
          AND organization_id = v_org_id
          AND is_active = TRUE;

        IF v_referral_agent_code IS NULL THEN
            RAISE EXCEPTION 'INVALID_REFERRAL_AGENT';
        END IF;
    END IF;

    -- 1. Patient Resolution / Creation
    IF v_existing_patient_id IS NOT NULL THEN
        SELECT id, patient_code, registration_serial
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE id = v_existing_patient_id
          AND organization_id = v_org_id
          AND is_deleted = FALSE;

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
        IF NULLIF(trim(v_patient->>'full_name'), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NAME_REQUIRED';
        END IF;

        IF NULLIF(trim(v_patient->>'phone'), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_PHONE_REQUIRED';
        END IF;

        v_nid := NULLIF(trim(COALESCE(v_patient->>'nid_or_birth_cert', v_patient->>'nid')), '');

        IF v_nid IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.patients
            WHERE organization_id = v_org_id
              AND is_deleted = FALSE
              AND (nid_or_birth_cert = v_nid OR nid = v_nid)
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_NID:%', v_nid;
        END IF;

        IF NULLIF(v_patient->>'dob', '') IS NOT NULL THEN
            v_dob := (v_patient->>'dob')::DATE;
            v_age := GREATEST(0, EXTRACT(YEAR FROM AGE(v_encounter_at, v_dob))::INTEGER);
        ELSE
            v_age := COALESCE((v_patient->>'age')::INTEGER, (v_patient->>'age_years')::INTEGER, 0);
        END IF;

        SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
        SELECT public.generate_patient_registration_serial(v_org_id, v_encounter_at) INTO v_registration_serial;

        INSERT INTO public.patients (
            organization_id, patient_code, registration_serial, full_name,
            phone, alternate_phone, email, gender, dob, age, age_years, blood_group,
            marital_status, occupation, nid_or_birth_cert, nid, address,
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
            NULLIF(trim(v_patient->>'emergency_contact_name'), ''),
            NULLIF(trim(v_patient->>'emergency_contact_phone'), ''),
            NULLIF(trim(v_patient->>'emergency_contact_relation'), ''),
            0,
            v_encounter_at,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_patient_id;

        IF v_nid IS NOT NULL THEN
            INSERT INTO public.patient_identifications (patient_id, id_type, id_number, is_verified)
            VALUES (v_patient_id, 'NID', regexp_replace(v_nid, '[^0-9]', '', 'g'), FALSE)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    -- Compute Billable Base for Admission Discount
    IF COALESCE((v_opd->>'enabled')::BOOLEAN, FALSE) THEN
        v_doctor_id := NULLIF(v_opd->>'doctor_id', '')::UUID;
        IF v_doctor_id IS NOT NULL THEN
            SELECT COALESCE(opd_fee, consultation_fee, 800.00) INTO v_opd_fee
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

    IF COALESCE((v_ot->>'enabled')::BOOLEAN, FALSE) THEN
        v_ot_charge := COALESCE((v_ot->>'estimatedCharge')::NUMERIC, (v_ot->>'ot_charge')::NUMERIC, 6000.00);
        v_billable_base := v_billable_base + v_ot_charge;
    END IF;

    -- Admission Discount Calculation
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

        -- Create emergency encounter visit for Critical Care if no IPD/OPD visit exists
        IF v_visit_id IS NULL THEN
            SELECT public.generate_visit_number(v_org_id, 'EMERGENCY') INTO v_visit_number;
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number, visit_type,
                status, chief_complaint, priority, admitted_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_visit_number, 'EMERGENCY',
                'ACTIVE',
                COALESCE(NULLIF(trim(v_cc->>'initial_diagnosis'), ''), 'Critical Care Admission'),
                'CRITICAL',
                v_encounter_at
            )
            RETURNING id INTO v_cc_visit_id;

            v_visit_id := v_cc_visit_id;
        END IF;

        INSERT INTO public.critical_care_admissions (
            organization_id, patient_id, episode_id, unit_id, bed_number,
            status, admission_type, admitted_at, admitting_doctor_id, initial_diagnosis,
            ventilator_required, created_by, created_at, updated_at
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_id, v_unit_id, v_bed_number,
            'ADMITTED',
            COALESCE(NULLIF(v_cc->>'admission_type', ''), 'DIRECT'),
            v_encounter_at,
            NULLIF(v_cc->>'doctor_id', '')::UUID,
            COALESCE(NULLIF(trim(v_cc->>'initial_diagnosis'), ''), 'Critical Care Admission'),
            COALESCE((v_cc->>'ventilator_required')::BOOLEAN, FALSE),
            v_user_id, NOW(), NOW()
        )
        RETURNING id INTO v_cc_admission_id;
    END IF;

    -- 6. Operation Theatre (OT) Booking
    IF COALESCE((v_ot->>'enabled')::BOOLEAN, FALSE) THEN
        v_ot_room_id := NULLIF(COALESCE(v_ot->>'roomId', v_ot->>'ot_room_id'), '')::UUID;
        v_ot_surgeon_id := NULLIF(COALESCE(v_ot->>'surgeonId', v_ot->>'lead_surgeon_id'), '')::UUID;
        v_ot_procedure := COALESCE(NULLIF(trim(COALESCE(v_ot->>'procedureName', v_ot->>'procedure_name')), ''), 'Surgical Procedure');
        v_ot_charge := COALESCE((v_ot->>'estimatedCharge')::NUMERIC, (v_ot->>'ot_charge')::NUMERIC, 6000.00);
        v_ot_anesthesia := COALESCE(NULLIF(trim(COALESCE(v_ot->>'anesthesiaType', v_ot->>'anesthesia_type')), ''), 'GENERAL');
        v_ot_start := COALESCE((v_ot->>'scheduledStart')::TIMESTAMPTZ, (v_ot->>'scheduled_start')::TIMESTAMPTZ, v_encounter_at);
        v_ot_end := v_ot_start + INTERVAL '2 hours';

        IF v_visit_id IS NULL THEN
            SELECT public.generate_visit_number(v_org_id, 'SURGERY') INTO v_visit_number;
            INSERT INTO public.patient_visits (
                organization_id, patient_id, episode_id, visit_number, visit_type,
                status, doctor_id, chief_complaint, priority, admitted_at
            )
            VALUES (
                v_org_id, v_patient_id, v_episode_id, v_visit_number, 'SURGERY',
                'ACTIVE',
                v_ot_surgeon_id,
                'Operation Theatre - ' || v_ot_procedure,
                'NORMAL',
                v_encounter_at
            )
            RETURNING id INTO v_visit_id;
        END IF;

        IF v_ot_room_id IS NOT NULL AND v_ot_surgeon_id IS NOT NULL THEN
            INSERT INTO public.ot_bookings (
                organization_id, visit_id, ot_room_id, procedure_name,
                lead_surgeon_id, anesthesia_type, scheduled_start, scheduled_end,
                status, ot_charge, created_at
            )
            VALUES (
                v_org_id, v_visit_id, v_ot_room_id, v_ot_procedure,
                v_ot_surgeon_id, v_ot_anesthesia, v_ot_start, v_ot_end,
                'SCHEDULED', v_ot_charge, NOW()
            )
            RETURNING id INTO v_ot_booking_id;
        END IF;
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
        'critical_care_visit_id', COALESCE(v_cc_visit_id, v_ipd_visit_id, v_opd_visit_id),
        'ot_booking_id', v_ot_booking_id,
        'admission_discount_amount', v_admission_discount,
        'encounter_at', v_encounter_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 4. PERMANENT GET_EPISODE_BILLING_OVERVIEW (AGGREGATES ALL 5 REVENUE STREAMS)
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
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
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
      SELECT *
        INTO v_episode
      FROM public.patient_care_episodes
      WHERE organization_id = p_org_id
        AND patient_id = v_patient_id
        AND status = 'ACTIVE'
      ORDER BY started_at DESC
      LIMIT 1;
      v_episode_id := v_episode.id;
    ELSE
      SELECT *
        INTO v_episode
      FROM public.patient_care_episodes
      WHERE id = v_episode_id
        AND organization_id = p_org_id;
    END IF;

    IF v_episode_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', TRUE,
        'episode_id', NULL,
        'episode_number', NULL,
        'patient_id', v_patient_id,
        'primary_visit_id', NULL,
        'lines', '[]'::JSONB,
        'encounters', '[]'::JSONB,
        'resources', '[]'::JSONB,
        'critical_care', '[]'::JSONB,
        'invoice_history', '[]'::JSONB,
        'total', 0,
        'admission_discount_amount', 0,
        'admission_discount_reason', NULL,
        'referral_agent_id', NULL,
        'previous_invoiced', 0,
        'previous_paid', 0,
        'previous_due', 0,
        'episode_invoiced', 0,
        'episode_paid', 0,
        'episode_due', 0
      );
    END IF;

    SELECT pv.id
      INTO v_primary_visit_id
    FROM public.patient_visits pv
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id
    ORDER BY CASE WHEN pv.visit_type = 'IPD' THEN 0 WHEN pv.visit_type = 'EMERGENCY' THEN 1 ELSE 2 END, pv.admitted_at
    LIMIT 1;

    -- 1. Encounter History
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', pv.id,
          'visit_number', pv.visit_number,
          'visit_type', pv.visit_type,
          'status', pv.status,
          'admitted_at', pv.admitted_at,
          'discharged_at', pv.discharged_at,
          'doctor_name', d.full_name,
          'department_name', dep.name,
          'chief_complaint', pv.chief_complaint,
          'opd_fee_snapshot', COALESCE(pv.opd_fee_snapshot, d.opd_fee, d.consultation_fee, 0)
        )
        ORDER BY pv.admitted_at
      ),
      '[]'::JSONB
    )
    INTO v_encounters
    FROM public.patient_visits pv
    LEFT JOIN public.doctors d ON d.id = pv.doctor_id
    LEFT JOIN public.departments dep ON dep.id = pv.department_id
    WHERE pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id;

    -- 2. Bed/Cabin History
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ba.id,
          'resource_type', CASE WHEN ba.cabin_id IS NOT NULL THEN 'CABIN' ELSE 'BED' END,
          'resource_number', COALESCE(c.cabin_number, b.bed_number),
          'ward_name', w.name,
          'assigned_at', ba.assigned_at,
          'vacated_at', ba.vacated_at,
          'status', ba.status,
          'daily_charge', ba.daily_charge
        )
        ORDER BY ba.assigned_at
      ),
      '[]'::JSONB
    )
    INTO v_resources
    FROM public.bed_assignments ba
    JOIN public.patient_visits pv
      ON pv.id = ba.visit_id
    LEFT JOIN public.beds b
      ON b.id = ba.bed_id
    LEFT JOIN public.wards w
      ON w.id = b.ward_id
    LEFT JOIN public.cabins c
      ON c.id = ba.cabin_id
    WHERE ba.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND pv.patient_id = v_patient_id
      AND pv.episode_id = v_episode_id;

    -- 3. Critical Care History
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', cca.id,
          'unit_name', u.unit_name,
          'unit_type', u.unit_type,
          'bed_number', cca.bed_number,
          'admission_time', COALESCE(cca.admission_time, cca.admitted_at),
          'discharge_time', cca.discharge_time,
          'status', cca.status,
          'daily_charge', u.daily_charge,
          'ventilator_required', cca.ventilator_required,
          'doctor_name', d.full_name,
          'initial_diagnosis', cca.initial_diagnosis
        )
        ORDER BY COALESCE(cca.admission_time, cca.admitted_at)
      ),
      '[]'::JSONB
    )
    INTO v_critical
    FROM public.critical_care_admissions cca
    LEFT JOIN public.critical_care_units u ON u.id = cca.unit_id
    LEFT JOIN public.doctors d ON d.id = cca.admitting_doctor_id
    WHERE cca.organization_id = p_org_id
      AND cca.patient_id = v_patient_id
      AND (cca.episode_id = v_episode_id OR (cca.episode_id IS NULL AND cca.status IN ('admitted', 'ACTIVE', 'ADMITTED')));

    -- 4. Billable Candidate Lines from ALL 5 Revenue Streams
    WITH candidates AS (
      -- A. OPD Consultations
      SELECT
        pv.id AS source_id,
        NULL::UUID AS charge_id,
        FALSE AS is_custom_charge,
        'CONSULTATION'::TEXT AS category,
        'OPD Consultation - ' || COALESCE(d.full_name, 'Consultant') AS item_name,
        COALESCE(pv.opd_fee_snapshot, d.opd_fee, d.consultation_fee, 0)::NUMERIC AS unit_price,
        1::NUMERIC AS quantity,
        pv.admitted_at AS started_at
      FROM public.patient_visits pv
      LEFT JOIN public.doctors d ON d.id = pv.doctor_id
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
          ' (' || cca.bed_number || ')' AS item_name,
        COALESCE(u.daily_charge, 0)::NUMERIC AS unit_price,
        public.ohms_billable_days(COALESCE(cca.admission_time, cca.admitted_at), COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity,
        COALESCE(cca.admission_time, cca.admitted_at) AS started_at
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

      -- D. Additional Episode Service Charges (Medicines, Nursing, Tests, Procedures, Equipment, etc.)
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
          ORDER BY started_at
        ),
        '[]'::JSONB
      ),
      COALESCE(SUM(total_price), 0)
    INTO v_lines, v_total
    FROM priced;

    -- Lifetime Financial Summary
    SELECT
      COALESCE(SUM(i.grand_total), 0),
      COALESCE(SUM(i.paid_amount), 0),
      COALESCE(SUM(i.due_amount), 0)
    INTO v_previous_invoiced, v_previous_paid, v_previous_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = v_patient_id
      AND i.is_voided = FALSE;

    -- Episode-only Financial Summary
    SELECT
      COALESCE(SUM(i.grand_total), 0),
      COALESCE(SUM(i.paid_amount), 0),
      COALESCE(SUM(i.due_amount), 0)
    INTO v_episode_invoiced, v_episode_paid, v_episode_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = v_patient_id
      AND i.episode_id = v_episode_id
      AND i.is_voided = FALSE;

    -- Invoice History
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'invoice_number', i.invoice_number,
          'created_at', i.created_at,
          'grand_total', i.grand_total,
          'paid_amount', i.paid_amount,
          'due_amount', i.due_amount,
          'status', i.status,
          'is_episode_settlement', i.is_episode_settlement,
          'items', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'service_category', ii.service_category,
                  'item_name', ii.item_name,
                  'unit_price', ii.unit_price,
                  'quantity', ii.quantity,
                  'total_price', ii.total_price,
                  'reference_id', ii.reference_id
                )
                ORDER BY ii.created_at
              )
              FROM public.invoice_items ii
              WHERE ii.invoice_id = i.id
            ),
            '[]'::JSONB
          ),
          'payments', COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'receipt_number', p.receipt_number,
                  'amount', p.amount,
                  'payment_method', p.payment_method,
                  'payment_date', p.payment_date
                )
                ORDER BY p.payment_date
              )
              FROM public.payments p
              WHERE p.invoice_id = i.id
            ),
            '[]'::JSONB
          )
        )
        ORDER BY i.created_at DESC
      ),
      '[]'::JSONB
    )
    INTO v_invoices
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = v_patient_id
      AND (i.episode_id = v_episode_id OR (i.episode_id IS NULL AND i.is_voided = FALSE))
      AND i.is_voided = FALSE;

    RETURN jsonb_build_object(
      'success', TRUE,
      'episode_id', v_episode_id,
      'episode_number', v_episode.episode_number,
      'patient_id', v_patient_id,
      'primary_visit_id', v_primary_visit_id,
      'lines', v_lines,
      'encounters', v_encounters,
      'resources', v_resources,
      'critical_care', v_critical,
      'invoice_history', v_invoices,
      'total', v_total,
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
      'lifetime_due', v_previous_due
    );
END;
$$;

-- Alias get_episode_billing_preview to call get_episode_billing_overview
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

REVOKE ALL ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_overview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. UPGRADED CREATE_EPISODE_SETTLEMENT_INVOICE_ATOMIC_V2
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_episode_settlement_invoice_atomic_v2(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_cashier_id UUID,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_referral_agent_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode RECORD;
    v_preview JSONB;
    v_lines JSONB;
    v_line JSONB;
    v_subtotal NUMERIC := 0;
    v_discount NUMERIC := COALESCE(p_discount_amount, 0);
    v_grand_total NUMERIC := 0;
    v_paid NUMERIC := COALESCE(p_initial_payment_amount, 0);
    v_due NUMERIC := 0;
    v_status TEXT := 'UNPAID';
    v_invoice_id UUID;
    v_invoice_number TEXT;
    v_receipt_number TEXT;
    v_payment_id UUID;
    v_primary_visit_id UUID;
    v_ref_id UUID;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT *
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
    v_subtotal := COALESCE((v_preview->>'total')::NUMERIC, 0);
    v_primary_visit_id := NULLIF(v_preview->>'primary_visit_id', '')::UUID;

    IF jsonb_array_length(v_lines) = 0 THEN
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

    -- Insert Invoice Items
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
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

      -- If custom charge, mark as BILLED
      IF COALESCE((v_line->>'is_custom_charge')::BOOLEAN, FALSE) AND v_line->>'charge_id' IS NOT NULL THEN
        UPDATE public.episode_service_charges
        SET status = 'BILLED',
            is_billed = TRUE,
            updated_at = NOW()
        WHERE id = (v_line->>'charge_id')::UUID AND organization_id = p_org_id;
      END IF;
    END LOOP;

    -- Record Initial Payment if made
    IF v_paid > 0.005 THEN
      SELECT public.generate_receipt_number(p_org_id) INTO v_receipt_number;

      INSERT INTO public.payments (
        organization_id, invoice_id, receipt_number, amount,
        payment_method, transaction_reference, payment_date,
        received_by, notes, created_at
      )
      VALUES (
        p_org_id, v_invoice_id, v_receipt_number, v_paid,
        COALESCE(p_payment_method, 'CASH'),
        p_notes, NOW(),
        p_cashier_id, 'Episode settlement payment', NOW()
      )
      RETURNING id INTO v_payment_id;
    END IF;

    RETURN jsonb_build_object(
      'success', TRUE,
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_number,
      'receipt_number', v_receipt_number,
      'grand_total', v_grand_total,
      'paid_amount', v_paid,
      'due_amount', v_due,
      'status', v_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_episode_settlement_invoice_atomic_v2(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
