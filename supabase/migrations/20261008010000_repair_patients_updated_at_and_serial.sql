-- ==============================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS) — FORWARD MIGRATION 116
-- Patient Schema Repair (updated_at, registration_serial), Multi-Service Atomic Intake,
-- Episode Additional Charges Ledger, and Flexible Episode Settlement
-- Timestamp: 2026-10-08T01:00:00Z
-- ==============================================================================

-- 1. Ensure updated_at and registration_serial columns exist on public.patients
ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS registration_serial TEXT,
    ADD COLUMN IF NOT EXISTS admission_discount_amount NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS admission_discount_reason TEXT;

CREATE SEQUENCE IF NOT EXISTS public.patient_registration_serial_seq START WITH 100001;

-- Backfill registration_serial for any existing patients missing it
UPDATE public.patients
SET registration_serial = COALESCE(registration_serial, patient_code)
WHERE registration_serial IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_org_reg_serial
    ON public.patients (organization_id, registration_serial)
    WHERE is_deleted = FALSE AND registration_serial IS NOT NULL;

-- 2. Ensure patient_care_episodes tracks admission discount and referral agent
ALTER TABLE public.patient_care_episodes
    ADD COLUMN IF NOT EXISTS admission_discount_amount NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS admission_discount_reason TEXT,
    ADD COLUMN IF NOT EXISTS referral_agent_id UUID REFERENCES public.referral_agents(id) ON DELETE SET NULL;

-- 3. Dedicated ledger for unbilled/extra episode service charges (allowing error correction, additions, edits)
CREATE TABLE IF NOT EXISTS public.episode_service_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    episode_id UUID NOT NULL REFERENCES public.patient_care_episodes(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    service_category VARCHAR(50) NOT NULL DEFAULT 'MISC' CHECK (service_category IN (
        'CONSULTATION', 'INVESTIGATION', 'PHARMACY', 'PROCEDURE', 'ROOM', 'BED', 'CABIN', 'NURSING', 'OXYGEN', 'AMBULANCE', 'MISC', 'OTHER'
    )),
    item_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    total_price NUMERIC(12,2) GENERATED ALWAYS AS (ROUND((quantity * unit_price), 2)) STORED,
    status VARCHAR(20) NOT NULL DEFAULT 'UNBILLED' CHECK (status IN ('UNBILLED', 'INVOICED', 'CANCELLED')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episode_service_charges_lookup
    ON public.episode_service_charges (organization_id, episode_id, status);

ALTER TABLE public.episode_service_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_service_charges FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS episode_service_charges_tenant ON public.episode_service_charges;
CREATE POLICY episode_service_charges_tenant ON public.episode_service_charges
    FOR ALL TO authenticated
    USING (organization_id = private.get_current_org_id())
    WITH CHECK (organization_id = private.get_current_org_id());

-- 4. Atomic RPC to Add an Unbilled Episode Service Charge
CREATE OR REPLACE FUNCTION public.add_episode_service_charge_atomic(
    p_org_id UUID,
    p_episode_id UUID,
    p_patient_id UUID,
    p_category VARCHAR,
    p_item_name VARCHAR,
    p_quantity NUMERIC,
    p_unit_price NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_charge_id UUID;
    v_clean_name TEXT := NULLIF(trim(p_item_name), '');
    v_clean_cat TEXT := UPPER(COALESCE(NULLIF(trim(p_category), ''), 'MISC'));
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'ITEM_NAME_REQUIRED';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    IF p_unit_price IS NULL OR p_unit_price < 0 THEN
        RAISE EXCEPTION 'INVALID_UNIT_PRICE';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.patient_care_episodes
        WHERE id = p_episode_id AND organization_id = p_org_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'ACTIVE_EPISODE_NOT_FOUND';
    END IF;

    INSERT INTO public.episode_service_charges (
        organization_id, episode_id, patient_id, service_category,
        item_name, quantity, unit_price, status, notes, created_by, created_at, updated_at
    )
    VALUES (
        p_org_id, p_episode_id, p_patient_id, v_clean_cat,
        v_clean_name, p_quantity, p_unit_price, 'UNBILLED', p_notes, auth.uid(), NOW(), NOW()
    )
    RETURNING id INTO v_charge_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'charge_id', v_charge_id
    );
END;
$$;

-- 5. Atomic RPC to Edit an Unbilled Episode Service Charge
CREATE OR REPLACE FUNCTION public.edit_episode_service_charge_atomic(
    p_org_id UUID,
    p_charge_id UUID,
    p_item_name VARCHAR,
    p_quantity NUMERIC,
    p_unit_price NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_name TEXT := NULLIF(trim(p_item_name), '');
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'ITEM_NAME_REQUIRED';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    IF p_unit_price IS NULL OR p_unit_price < 0 THEN
        RAISE EXCEPTION 'INVALID_UNIT_PRICE';
    END IF;

    UPDATE public.episode_service_charges
    SET item_name = v_clean_name,
        quantity = p_quantity,
        unit_price = p_unit_price,
        notes = p_notes,
        updated_at = NOW()
    WHERE id = p_charge_id
      AND organization_id = p_org_id
      AND status = 'UNBILLED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHARGE_NOT_FOUND_OR_ALREADY_INVOICED';
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'charge_id', p_charge_id);
END;
$$;

-- 6. Atomic RPC to Delete/Cancel an Unbilled Episode Service Charge
CREATE OR REPLACE FUNCTION public.delete_episode_service_charge_atomic(
    p_org_id UUID,
    p_charge_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    DELETE FROM public.episode_service_charges
    WHERE id = p_charge_id
      AND organization_id = p_org_id
      AND status = 'UNBILLED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHARGE_NOT_FOUND_OR_ALREADY_INVOICED';
    END IF;

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 7. Upgraded create_patient_intake_atomic supporting all 3 services concurrently,
-- updated_at, unique registration serial, and admission discounts.
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

    -- Case 1: Existing Patient Selection (Reuse master identity, prevent duplicate master)
    IF v_existing_patient_id IS NOT NULL THEN
        SELECT id, patient_code, COALESCE(registration_serial, patient_code)
        INTO v_patient_id, v_patient_code, v_registration_serial
        FROM public.patients
        WHERE id = v_existing_patient_id
          AND organization_id = v_org_id
          AND is_deleted = FALSE
        FOR UPDATE;

        IF v_patient_id IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NOT_FOUND';
        END IF;

        -- Update updated_at
        UPDATE public.patients
        SET updated_at = NOW()
        WHERE id = v_patient_id;
    ELSE
        -- Case 2: New Patient Master Creation
        IF NULLIF(trim(v_patient->>'full_name'), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NAME_REQUIRED';
        END IF;

        IF NULLIF(trim(v_patient->>'phone'), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_PHONE_REQUIRED';
        END IF;

        SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;
        v_registration_serial := 'REG-' ||
            TO_CHAR(v_encounter_at AT TIME ZONE 'Asia/Dhaka', 'YYYY') ||
            '-' || LPAD(nextval('public.patient_registration_serial_seq')::TEXT, 6, '0');

        v_nid := NULLIF(trim(v_patient->>'nid'), '');
        v_dob := NULLIF(v_patient->>'dob', '')::DATE;
        IF v_dob IS NOT NULL THEN
            v_age := GREATEST(0, DATE_PART('year', AGE(v_encounter_at, v_dob))::INTEGER);
        END IF;

        INSERT INTO public.patients (
            organization_id,
            patient_id,
            patient_code,
            registration_serial,
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
            admission_discount_amount,
            admission_discount_reason,
            is_deleted,
            created_by,
            created_at,
            updated_at
        )
        VALUES (
            v_org_id,
            v_patient_code,
            v_patient_code,
            v_registration_serial,
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
            COALESCE(v_admission_discount, 0),
            v_admission_discount_reason,
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

    -- Create patient-care episode if ANY service is selected
    IF COALESCE((v_services->'opd'->>'enabled')::BOOLEAN, FALSE)
       OR COALESCE((v_services->'ipd'->>'enabled')::BOOLEAN, FALSE)
       OR COALESCE((v_services->'critical_care'->>'enabled')::BOOLEAN, FALSE) THEN

        v_episode_number := 'EPI-' ||
            TO_CHAR(v_encounter_at AT TIME ZONE 'Asia/Dhaka', 'YYMM') ||
            '-' || LPAD(nextval('public.patient_care_episode_seq')::TEXT, 6, '0');

        INSERT INTO public.patient_care_episodes (
            organization_id, patient_id, episode_number, started_at, source,
            admission_discount_amount, admission_discount_reason, referral_agent_id, created_by
        )
        VALUES (
            v_org_id, v_patient_id, v_episode_number, v_encounter_at, 'UNIFIED_INTAKE',
            COALESCE(v_admission_discount, 0), v_admission_discount_reason, v_referral_agent_id, v_user_id
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

    -- Common Referral Agent Attribution
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

    -- Return comprehensive result
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
        'encounter_at', v_encounter_at
    );
END;
$$;

-- 8. Upgraded get_episode_billing_preview: includes additional service charges,
-- admission discounts, and identifies editable unbilled items.
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
    v_prev_invoiced NUMERIC := 0;
    v_prev_paid NUMERIC := 0;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF p_episode_id IS NOT NULL THEN
        SELECT * INTO v_episode
        FROM public.patient_care_episodes
        WHERE id = p_episode_id AND organization_id = p_org_id;
    ELSE
        SELECT * INTO v_episode
        FROM public.patient_care_episodes
        WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'ACTIVE'
        ORDER BY started_at DESC
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
            'previous_invoiced', 0,
            'previous_paid', 0,
            'previous_due', 0
        );
    END IF;

    SELECT COALESCE(SUM(i.grand_total), 0), COALESCE(SUM(i.paid_amount), 0)
    INTO v_prev_invoiced, v_prev_paid
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = p_patient_id
      AND i.is_voided = FALSE;

    WITH candidates AS (
        -- 1. Unbilled OPD Consultation
        SELECT
            pv.id AS source_id,
            NULL::UUID AS charge_id,
            FALSE AS is_custom_charge,
            'CONSULTATION'::TEXT AS category,
            'OPD Consultation - ' || COALESCE(d.full_name, 'Consultant') AS item_name,
            COALESCE(d.opd_fee, 0)::NUMERIC AS unit_price,
            1::NUMERIC AS quantity
        FROM public.patient_visits pv
        LEFT JOIN public.doctors d ON d.id = pv.doctor_id
        WHERE pv.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = v_episode.id
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

        -- 2. Unbilled Bed or Cabin Stays
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
            public.ohms_billable_days(ba.assigned_at, COALESCE(ba.vacated_at, p_as_of))::NUMERIC AS quantity
        FROM public.bed_assignments ba
        LEFT JOIN public.beds b ON b.id = ba.bed_id
        LEFT JOIN public.cabins c ON c.id = ba.cabin_id
        WHERE ba.organization_id = p_org_id
          AND ba.patient_id = p_patient_id
          AND ba.visit_id IN (
              SELECT id FROM public.patient_visits
              WHERE organization_id = p_org_id AND patient_id = p_patient_id AND episode_id = v_episode.id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = ba.id
          )

        UNION ALL

        -- 3. Unbilled Critical Care Admissions
        SELECT
            cca.id AS source_id,
            NULL::UUID AS charge_id,
            FALSE AS is_custom_charge,
            'MISC'::TEXT AS category,
            'Critical Care - ' || COALESCE(ccu.unit_name, ccu.unit_type) || ' (' || cca.bed_number || ')' AS item_name,
            COALESCE(ccu.daily_charge, 0)::NUMERIC AS unit_price,
            public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity
        FROM public.critical_care_admissions cca
        JOIN public.critical_care_units ccu ON ccu.id = cca.unit_id
        WHERE cca.organization_id = p_org_id
          AND cca.patient_id = p_patient_id
          AND cca.episode_id = v_episode.id
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = cca.id
          )

        UNION ALL

        -- 4. Additional Episode Service Charges (Medicines, Nursing, Tests, Procedures, etc.)
        SELECT
            esc.id AS source_id,
            esc.id AS charge_id,
            TRUE AS is_custom_charge,
            esc.service_category::TEXT AS category,
            esc.item_name AS item_name,
            esc.unit_price::NUMERIC AS unit_price,
            esc.quantity::NUMERIC AS quantity
        FROM public.episode_service_charges esc
        WHERE esc.organization_id = p_org_id
          AND esc.patient_id = p_patient_id
          AND esc.episode_id = v_episode.id
          AND esc.status = 'UNBILLED'
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = esc.id
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
            ROUND((unit_price * quantity)::NUMERIC, 2) AS total_price
        FROM candidates
    )
    SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
            'reference_id', source_id,
            'charge_id', charge_id,
            'is_custom_charge', is_custom_charge,
            'service_category', category,
            'item_name', item_name,
            'unit_price', unit_price,
            'quantity', quantity,
            'total_price', total_price
        ) ORDER BY item_name), '[]'::JSONB),
        COALESCE(SUM(total_price), 0)
    INTO v_lines, v_total
    FROM priced;

    RETURN jsonb_build_object(
        'success', TRUE,
        'episode_id', v_episode.id,
        'episode_number', v_episode.episode_number,
        'lines', v_lines,
        'total', v_total,
        'admission_discount_amount', COALESCE(v_episode.admission_discount_amount, 0),
        'admission_discount_reason', v_episode.admission_discount_reason,
        'referral_agent_id', v_episode.referral_agent_id,
        'previous_invoiced', v_prev_invoiced,
        'previous_paid', v_prev_paid,
        'previous_due', GREATEST(0, v_prev_invoiced - v_prev_paid)
    );
END;
$$;

-- 9. Upgraded create_episode_settlement_invoice_atomic: supports discount,
-- initial payment, and atomically updates episode_service_charges to INVOICED.
CREATE OR REPLACE FUNCTION public.create_episode_settlement_invoice_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_cashier_id UUID,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0.00,
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
    v_existing UUID;
    v_items JSONB;
    v_total NUMERIC;
    v_res JSONB;
    v_invoice_id UUID;
    v_eff_discount NUMERIC := GREATEST(0, COALESCE(p_discount_amount, 0));
    v_ref_id UUID := p_referral_agent_id;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- If existing active settlement invoice exists, return it
    SELECT i.id INTO v_existing
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = p_patient_id
      AND i.episode_id = p_episode_id
      AND i.is_episode_settlement = TRUE
      AND i.is_voided = FALSE
    ORDER BY i.created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        SELECT jsonb_build_object(
            'success', TRUE,
            'invoice_id', i.id,
            'invoice_number', i.invoice_number,
            'grand_total', i.grand_total,
            'paid_amount', i.paid_amount,
            'due_amount', i.due_amount,
            'status', i.status,
            'existing', TRUE
        ) INTO v_res
        FROM public.invoices i
        WHERE i.id = v_existing;
        RETURN v_res;
    END IF;

    -- Pull live unbilled preview items
    SELECT preview->'lines', (preview->>'total')::NUMERIC, (preview->>'referral_agent_id')::UUID
    INTO v_items, v_total, v_ref_id
    FROM (
        SELECT public.get_episode_billing_preview(p_org_id, p_patient_id, p_episode_id, NOW()) AS preview
    ) q;

    IF v_ref_id IS NULL THEN
        v_ref_id := p_referral_agent_id;
    END IF;

    IF COALESCE(jsonb_array_length(v_items), 0) = 0 OR COALESCE(v_total, 0) <= 0 THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'invoice_id', NULL,
            'invoice_number', NULL,
            'grand_total', 0,
            'paid_amount', 0,
            'due_amount', 0,
            'status', 'PAID',
            'existing', FALSE
        );
    END IF;

    -- Create Invoice and Post to General Ledger
    v_res := public.create_invoice_and_post_gl_atomic(
        p_org_id,
        p_patient_id,
        NULL,
        v_items,
        v_eff_discount,
        COALESCE(p_discount_reason, 'Episode settlement discount'),
        COALESCE(p_initial_payment_amount, 0),
        COALESCE(p_payment_method, 'CASH'),
        NULL,
        p_cashier_id,
        COALESCE(p_notes, 'Unified patient care episode final settlement'),
        v_ref_id,
        NULL
    );

    IF COALESCE((v_res->>'success')::BOOLEAN, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'EPISODE_SETTLEMENT_FAILED:%', COALESCE(v_res->>'error', 'unknown');
    END IF;

    v_invoice_id := (v_res->>'invoice_id')::UUID;

    -- Link invoice to episode
    UPDATE public.invoices
    SET episode_id = p_episode_id,
        is_episode_settlement = TRUE,
        updated_at = NOW()
    WHERE id = v_invoice_id;

    -- Mark included additional episode charges as INVOICED
    UPDATE public.episode_service_charges
    SET status = 'INVOICED',
        updated_at = NOW()
    WHERE episode_id = p_episode_id
      AND organization_id = p_org_id
      AND status = 'UNBILLED';

    RETURN jsonb_build_object(
        'success', TRUE,
        'invoice_id', v_invoice_id,
        'invoice_number', v_res->>'invoice_number',
        'grand_total', v_res->>'grand_total',
        'paid_amount', v_res->>'paid_amount',
        'due_amount', v_res->>'due_amount',
        'status', v_res->>'status',
        'existing', FALSE
    );
END;
$$;

-- 10. Grants and Permissions
REVOKE ALL ON FUNCTION public.add_episode_service_charge_atomic(UUID, UUID, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_episode_service_charge_atomic(UUID, UUID, UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.edit_episode_service_charge_atomic(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_episode_service_charge_atomic(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_episode_service_charge_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_episode_service_charge_atomic(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.create_episode_settlement_invoice_atomic(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_episode_settlement_invoice_atomic(UUID, UUID, UUID, UUID, NUMERIC, TEXT, NUMERIC, VARCHAR, UUID, TEXT) TO authenticated;

-- 11. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
