-- Migration 118: Authoritative Critical-Care Bed Binding, Referral Performance Analytics,
-- and Doctor Ethics Compliance Hardening.
-- Forward-only migration adhering to Supabase zero-trust standards:
--   - Pinned search_path = '' on all SECURITY DEFINER functions
--   - Schema qualification for all table references
--   - Strict tenant boundary checking via private.get_current_org_id()
--   - Revocation of PUBLIC and anon execution grants

-- ==============================================================================
-- 1. CRITICAL CARE BED BINDING SCHEMA EXTENSION
-- ==============================================================================
ALTER TABLE public.beds
    ADD COLUMN IF NOT EXISTS critical_care_unit_id UUID REFERENCES public.critical_care_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_beds_critical_care_unit_id ON public.beds(critical_care_unit_id);

-- Backfill existing beds with critical care unit assignments based on unit type
UPDATE public.beds b
SET critical_care_unit_id = ccu.id
FROM public.critical_care_units ccu
WHERE b.organization_id = ccu.organization_id
  AND b.critical_care_unit_id IS NULL
  AND (
    b.bed_number ILIKE '%' || ccu.unit_type || '%'
    OR EXISTS (
      SELECT 1 FROM public.wards w
      WHERE w.id = b.ward_id AND w.name ILIKE '%' || ccu.unit_type || '%'
    )
  );

-- ==============================================================================
-- 2. DOCTOR REFERRAL COMPLIANCE & ETHICS GOVERNANCE
-- ==============================================================================
ALTER TABLE public.referral_agents
    ADD COLUMN IF NOT EXISTS bmdc_ethics_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS compliance_notes TEXT;

-- ==============================================================================
-- 3. UPGRADED create_patient_intake_atomic WITH AUTHORITATIVE CC BED BINDING &
--    EPISODE REFERRAL ATTRIBUTION CONTINUITY
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
            RAISE EXCEPTION 'REFERRAL_AGENT_NOT_FOUND_OR_INACTIVE';
        END IF;
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

        -- Record Authoritative Referral Attribution for this episode
        IF v_referral_agent_id IS NOT NULL THEN
            INSERT INTO public.patient_referral_attributions (
                organization_id, patient_id, referral_agent_id, referral_code_snapshot,
                referral_name_snapshot, assigned_by, assigned_at, status, notes
            )
            VALUES (
                v_org_id, v_patient_id, v_referral_agent_id, v_referral_agent_code,
                v_referral_agent_name, v_user_id, v_encounter_at, 'ACTIVE',
                'Attributed via Unified Patient Intake (Episode ' || v_episode_number || ')'
            );
        END IF;
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

    -- 2. IPD Bed/Cabin Service Encounter
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
        'ipd_assignment_id', v_assignment_id,
        'critical_care_admission_id', v_cc_admission_id,
        'encounter_at', v_encounter_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated, service_role;

-- ==============================================================================
-- 4. SERVER-SIDE REFERRAL PERFORMANCE ANALYTICS RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_referral_performance_analytics(
    p_org_id UUID,
    p_agent_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user UUID;
    v_active_org UUID;
    v_is_authorized BOOLEAN := FALSE;
    v_start TIMESTAMPTZ := COALESCE(p_start_date, NOW() - INTERVAL '1 year');
    v_end TIMESTAMPTZ := COALESCE(p_end_date, NOW());
    v_summary JSONB;
    v_monthly JSONB;
    v_yearly JSONB;
    v_top_agents JSONB;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Verify management / finance authority
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant')
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('referral.manage', 'referral.commission.view', '*')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks referral analytics authority' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- A. Overall Summary KPI Metrics
    SELECT jsonb_build_object(
        'total_referred_patients', COUNT(DISTINCT pra.patient_id),
        'total_admissions', COUNT(DISTINCT pe.id),
        'opd_referrals', COUNT(DISTINCT pv.id) FILTER (WHERE pv.visit_type = 'OPD'),
        'ipd_referrals', COUNT(DISTINCT pv.id) FILTER (WHERE pv.visit_type = 'IPD'),
        'critical_care_referrals', COUNT(DISTINCT cca.id),
        'gross_revenue', COALESCE(SUM(rc.billing_subtotal), 0),
        'total_discount', COALESCE(SUM(rc.discount_amount), 0),
        'net_revenue', COALESCE(SUM(rc.commission_base_amount), 0),
        'commission_earned', COALESCE(SUM(rc.commission_amount), 0),
        'commission_approved', COALESCE(SUM(rc.commission_amount) FILTER (WHERE rc.approval_status = 'APPROVED'), 0),
        'commission_paid', COALESCE(SUM(rc.amount_paid), 0),
        'commission_outstanding', COALESCE(SUM(rc.commission_amount) - SUM(rc.amount_paid), 0)
    )
    INTO v_summary
    FROM public.patient_referral_attributions pra
    LEFT JOIN public.patient_care_episodes pe 
      ON pe.patient_id = pra.patient_id AND pe.organization_id = p_org_id
    LEFT JOIN public.patient_visits pv 
      ON pv.episode_id = pe.id AND pv.organization_id = p_org_id
    LEFT JOIN public.critical_care_admissions cca 
      ON cca.episode_id = pe.id AND cca.organization_id = p_org_id
    LEFT JOIN public.referral_commissions rc 
      ON rc.referral_agent_id = pra.referral_agent_id AND rc.organization_id = p_org_id
    WHERE pra.organization_id = p_org_id
      AND (p_agent_id IS NULL OR pra.referral_agent_id = p_agent_id)
      AND pra.assigned_at >= v_start
      AND pra.assigned_at <= v_end;

    -- B. Monthly Performance Aggregation
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'year_month', m.ym,
                'year', m.yr,
                'month', m.mo,
                'month_name', TO_CHAR(m.month_date, 'Mon YYYY'),
                'referred_patients', m.pat_count,
                'gross_revenue', m.gross,
                'discount_amount', m.discount,
                'net_revenue', m.net,
                'commission_earned', m.comm_earned,
                'commission_paid', m.comm_paid
            )
            ORDER BY m.ym ASC
        ),
        '[]'::JSONB
    )
    INTO v_monthly
    FROM (
        SELECT 
            TO_CHAR(rc.created_at, 'YYYY-MM') as ym,
            EXTRACT(YEAR FROM rc.created_at)::INT as yr,
            EXTRACT(MONTH FROM rc.created_at)::INT as mo,
            DATE_TRUNC('month', rc.created_at) as month_date,
            COUNT(DISTINCT rc.patient_id) as pat_count,
            COALESCE(SUM(rc.billing_subtotal), 0) as gross,
            COALESCE(SUM(rc.discount_amount), 0) as discount,
            COALESCE(SUM(rc.commission_base_amount), 0) as net,
            COALESCE(SUM(rc.commission_amount), 0) as comm_earned,
            COALESCE(SUM(rc.amount_paid), 0) as comm_paid
        FROM public.referral_commissions rc
        WHERE rc.organization_id = p_org_id
          AND (p_agent_id IS NULL OR rc.referral_agent_id = p_agent_id)
          AND rc.created_at >= v_start
          AND rc.created_at <= v_end
        GROUP BY TO_CHAR(rc.created_at, 'YYYY-MM'), EXTRACT(YEAR FROM rc.created_at), EXTRACT(MONTH FROM rc.created_at), DATE_TRUNC('month', rc.created_at)
    ) m;

    -- C. Yearly Performance Aggregation
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'year', y.yr,
                'referred_patients', y.pat_count,
                'gross_revenue', y.gross,
                'discount_amount', y.discount,
                'net_revenue', y.net,
                'commission_earned', y.comm_earned,
                'commission_paid', y.comm_paid
            )
            ORDER BY y.yr DESC
        ),
        '[]'::JSONB
    )
    INTO v_yearly
    FROM (
        SELECT 
            EXTRACT(YEAR FROM rc.created_at)::INT as yr,
            COUNT(DISTINCT rc.patient_id) as pat_count,
            COALESCE(SUM(rc.billing_subtotal), 0) as gross,
            COALESCE(SUM(rc.discount_amount), 0) as discount,
            COALESCE(SUM(rc.commission_base_amount), 0) as net,
            COALESCE(SUM(rc.commission_amount), 0) as comm_earned,
            COALESCE(SUM(rc.amount_paid), 0) as comm_paid
        FROM public.referral_commissions rc
        WHERE rc.organization_id = p_org_id
          AND (p_agent_id IS NULL OR rc.referral_agent_id = p_agent_id)
        GROUP BY EXTRACT(YEAR FROM rc.created_at)
    ) y;

    -- D. Top Performing Agents in Selected Window
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'agent_id', a.id,
                'agent_code', a.agent_code,
                'full_name', a.full_name,
                'agent_type', a.agent_type,
                'patient_count', a.pat_count,
                'net_revenue', a.net,
                'commission_earned', a.comm_earned,
                'commission_paid', a.comm_paid,
                'compliance_approved', a.compliance_approved,
                'bmdc_ethics_acknowledged', a.bmdc_ethics_acknowledged
            )
            ORDER BY a.net DESC
        ),
        '[]'::JSONB
    )
    INTO v_top_agents
    FROM (
        SELECT 
            ra.id,
            ra.agent_code,
            ra.full_name,
            ra.agent_type,
            ra.compliance_approved,
            ra.bmdc_ethics_acknowledged,
            COUNT(DISTINCT rc.patient_id) as pat_count,
            COALESCE(SUM(rc.commission_base_amount), 0) as net,
            COALESCE(SUM(rc.commission_amount), 0) as comm_earned,
            COALESCE(SUM(rc.amount_paid), 0) as comm_paid
        FROM public.referral_agents ra
        LEFT JOIN public.referral_commissions rc 
          ON rc.referral_agent_id = ra.id AND rc.organization_id = p_org_id
          AND rc.created_at >= v_start AND rc.created_at <= v_end
        WHERE ra.organization_id = p_org_id
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        GROUP BY ra.id, ra.agent_code, ra.full_name, ra.agent_type, ra.compliance_approved, ra.bmdc_ethics_acknowledged
        LIMIT 20
    ) a;

    RETURN jsonb_build_object(
        'success', TRUE,
        'time_window', jsonb_build_object('start', v_start, 'end', v_end),
        'summary', v_summary,
        'monthly', v_monthly,
        'yearly', v_yearly,
        'top_agents', v_top_agents
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_performance_analytics(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_performance_analytics(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- ==============================================================================
-- 5. SAFE REFERRAL DIRECTORY PROJECTION RPC (ZERO FINANCIAL EXPOSURE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_referral_agents_safe_directory(
    p_org_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_code VARCHAR(40),
    full_name VARCHAR(150),
    agent_type VARCHAR(30),
    phone VARCHAR(30),
    email VARCHAR(100),
    is_active BOOLEAN,
    compliance_approved BOOLEAN,
    bmdc_ethics_acknowledged BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        ra.id,
        ra.agent_code,
        ra.full_name,
        ra.agent_type,
        ra.phone,
        ra.email,
        ra.is_active,
        ra.compliance_approved,
        ra.bmdc_ethics_acknowledged,
        ra.created_at
    FROM public.referral_agents ra
    WHERE ra.organization_id = p_org_id
      AND ra.is_active = TRUE
      AND ra.archived_at IS NULL
      AND (
          p_query IS NULL 
          OR TRIM(p_query) = '' 
          OR ra.agent_code ILIKE '%' || TRIM(p_query) || '%'
          OR ra.full_name ILIKE '%' || TRIM(p_query) || '%'
          OR ra.phone ILIKE '%' || TRIM(p_query) || '%'
      )
    ORDER BY ra.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_agents_safe_directory(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_agents_safe_directory(UUID, TEXT) TO authenticated, service_role;
