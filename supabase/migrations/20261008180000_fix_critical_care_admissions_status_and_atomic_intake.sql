-- ==============================================================================
-- OHMS Migration 121: Fix Critical Care Admissions Status Check & Atomic Intake
-- Date: 2026-10-08
-- Purpose:
--   1. Fix critical_care_admissions_status_check constraint to permit both
--      legacy ('admitted', 'transferred', 'discharged', 'deceased') and
--      modern ('ACTIVE', 'DISCHARGED', 'TRANSFERRED', 'DECEASED') values.
--   2. Update create_patient_intake_atomic to insert status = 'admitted' and
--      create an emergency encounter visit for Critical Care if no OPD/IPD visit
--      is selected, ensuring OT bookings and downstream services have a valid visit_id.
--   3. Upgrade get_episode_billing_preview to automatically include unbilled
--      OT Surgery procedures (ot_bookings) in the candidate invoice lines.
-- ==============================================================================

BEGIN;

-- 1. Relax/Harden critical_care_admissions_status_check constraint
ALTER TABLE public.critical_care_admissions
    DROP CONSTRAINT IF EXISTS critical_care_admissions_status_check;

ALTER TABLE public.critical_care_admissions
    ADD CONSTRAINT critical_care_admissions_status_check
    CHECK (status IN ('admitted', 'transferred', 'discharged', 'deceased', 'ACTIVE', 'DISCHARGED', 'TRANSFERRED', 'DECEASED'));

-- 2. Upgrade public.create_patient_intake_atomic
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

        -- Authoritative Bed lookup with Critical Care Unit affinity
        SELECT id, status INTO v_cc_bed_id, v_cc_bed_status
        FROM public.beds
        WHERE organization_id = v_org_id
          AND bed_number = v_bed_number
          AND is_active = TRUE
          AND (critical_care_unit_id = v_unit_id OR critical_care_unit_id IS NULL)
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
              AND bed_number = v_bed_number
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

-- 3. Upgrade public.get_episode_billing_preview with OT Surgery procedures
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
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF p_episode_id IS NOT NULL THEN
        SELECT id, episode_number, start_time, end_time, status,
               admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_episode
        FROM public.patient_episodes
        WHERE id = p_episode_id AND organization_id = p_org_id;
    ELSE
        SELECT id, episode_number, start_time, end_time, status,
               admission_discount_amount, admission_discount_reason, referral_agent_id
        INTO v_episode
        FROM public.patient_episodes
        WHERE patient_id = p_patient_id AND organization_id = p_org_id
        ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, start_time DESC
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

    -- Current Episode Invoiced vs Paid
    SELECT COALESCE(SUM(i.grand_total), 0), COALESCE(SUM(i.paid_amount), 0), COALESCE(SUM(i.due_amount), 0)
    INTO v_ep_invoiced, v_ep_paid, v_ep_due
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = p_patient_id
      AND i.episode_id = v_episode.id
      AND i.is_voided = FALSE;

    -- Lifetime Patient Invoiced vs Paid (across all historical episodes)
    SELECT COALESCE(SUM(i.grand_total), 0), COALESCE(SUM(i.paid_amount), 0), COALESCE(SUM(i.due_amount), 0)
    INTO v_life_invoiced, v_life_paid, v_life_due
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
            COALESCE(pv.opd_fee_snapshot, d.opd_fee, 0)::NUMERIC AS unit_price,
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

        -- 2. Unbilled IPD Bed or Cabin Stays
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
        JOIN public.patient_visits pv ON pv.id = ba.visit_id
        LEFT JOIN public.beds b ON b.id = ba.bed_id
        LEFT JOIN public.cabins c ON c.id = ba.cabin_id
        WHERE ba.organization_id = p_org_id
          AND pv.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = v_episode.id
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = ba.id
          )

        UNION ALL

        -- 3. Unbilled Critical Care Stays (ICU / CCU / HDU)
        SELECT
            cca.id AS source_id,
            NULL::UUID AS charge_id,
            FALSE AS is_custom_charge,
            'MISC'::TEXT AS category,
            'Critical Care - ' || COALESCE(ccu.unit_name, ccu.unit_type, 'Unit') || ' (' || cca.bed_number || ')' AS item_name,
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

        UNION ALL

        -- 5. Unbilled Operation Theatre (OT) Procedures & Surgeries
        SELECT
            ob.id AS source_id,
            NULL::UUID AS charge_id,
            FALSE AS is_custom_charge,
            'OT_SURGERY'::TEXT AS category,
            'OT Surgery - ' || COALESCE(ob.procedure_name, 'Surgical Procedure') || ' (' || COALESCE(r.room_number, 'OT Suite') || ')' AS item_name,
            COALESCE(ob.ot_charge, 0)::NUMERIC AS unit_price,
            1::NUMERIC AS quantity
        FROM public.ot_bookings ob
        JOIN public.patient_visits pv ON pv.id = ob.visit_id
        LEFT JOIN public.ot_rooms r ON r.id = ob.ot_room_id
        WHERE ob.organization_id = p_org_id
          AND pv.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
          AND pv.episode_id = v_episode.id
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
        'current_episode_invoiced', v_ep_invoiced,
        'current_episode_paid', v_ep_paid,
        'current_episode_due', GREATEST(0, v_ep_due),
        'lifetime_invoiced', v_life_invoiced,
        'lifetime_paid', v_life_paid,
        'lifetime_due', GREATEST(0, v_life_due),
        'previous_invoiced', v_ep_invoiced,
        'previous_paid', v_ep_paid,
        'previous_due', GREATEST(0, v_ep_due)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated, service_role;

COMMIT;
