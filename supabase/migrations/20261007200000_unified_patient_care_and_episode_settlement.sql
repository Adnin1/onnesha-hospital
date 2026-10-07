-- =====================================================================================
-- 20261007200000_unified_patient_care_and_episode_settlement.sql
-- Unified patient intake, common care episode linkage, deterministic stay billing,
-- and settlement-before-discharge workflow.
-- =====================================================================================

CREATE SEQUENCE IF NOT EXISTS public.patient_care_episode_seq START WITH 100001;

CREATE TABLE IF NOT EXISTS public.patient_care_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    episode_number VARCHAR(40) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'CANCELLED')),
    source VARCHAR(40) NOT NULL DEFAULT 'FRONT_DESK',
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, episode_number)
);

ALTER TABLE public.patient_visits
    ADD COLUMN IF NOT EXISTS episode_id UUID REFERENCES public.patient_care_episodes(id) ON DELETE SET NULL;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS episode_id UUID REFERENCES public.patient_care_episodes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_episode_settlement BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.critical_care_admissions
    ADD COLUMN IF NOT EXISTS episode_id UUID REFERENCES public.patient_care_episodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_care_episodes_org_patient_status
    ON public.patient_care_episodes(organization_id, patient_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_visits_episode
    ON public.patient_visits(episode_id, admitted_at);

CREATE INDEX IF NOT EXISTS idx_invoices_episode
    ON public.invoices(episode_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cc_admissions_episode
    ON public.critical_care_admissions(episode_id, admission_time DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_episode_settlement_invoice
    ON public.invoices(episode_id)
    WHERE episode_id IS NOT NULL AND is_episode_settlement = TRUE AND is_voided = FALSE;

ALTER TABLE public.patient_care_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_care_episodes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_care_episodes_tenant ON public.patient_care_episodes;
CREATE POLICY patient_care_episodes_tenant ON public.patient_care_episodes
    FOR ALL TO authenticated
    USING (organization_id = private.get_current_org_id())
    WITH CHECK (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS patient_care_episodes_service ON public.patient_care_episodes;
CREATE POLICY patient_care_episodes_service ON public.patient_care_episodes
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.ohms_billable_days(
    p_started_at TIMESTAMPTZ,
    p_ended_at TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
    v_seconds NUMERIC;
BEGIN
    IF p_ended_at <= p_started_at THEN
        RETURN 1;
    END IF;
    v_seconds := EXTRACT(EPOCH FROM (p_ended_at - p_started_at));
    RETURN GREATEST(1, CEIL(v_seconds / 86400.0)::INTEGER);
END;
$$;

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

    IF v_existing_patient_id IS NOT NULL THEN
        SELECT id INTO v_patient_id
        FROM public.patients
        WHERE id = v_existing_patient_id
          AND organization_id = v_org_id
          AND is_deleted = FALSE
        FOR UPDATE;

        IF v_patient_id IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NOT_FOUND';
        END IF;

        SELECT patient_code INTO v_patient_code
        FROM public.patients
        WHERE id = v_patient_id;
    ELSE
        IF NULLIF(trim(v_patient->>'full_name'), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_NAME_REQUIRED';
        END IF;

        IF NULLIF(trim(v_patient->>'phone'), '') IS NULL THEN
            RAISE EXCEPTION 'PATIENT_PHONE_REQUIRED';
        END IF;

        SELECT public.generate_patient_code(v_org_id) INTO v_patient_code;

        INSERT INTO public.patients (
            organization_id,
            patient_code,
            full_name,
            phone,
            normalized_phone,
            email,
            gender,
            dob,
            blood_group,
            marital_status,
            occupation,
            is_deleted,
            created_by,
            created_at,
            updated_at
        )
        VALUES (
            v_org_id,
            v_patient_code,
            trim(v_patient->>'full_name'),
            trim(v_patient->>'phone'),
            regexp_replace(trim(v_patient->>'phone'), '[^0-9+]', '', 'g'),
            NULLIF(trim(v_patient->>'email'), ''),
            COALESCE(NULLIF(v_patient->>'gender', ''), 'OTHER'),
            NULLIF(v_patient->>'dob', '')::DATE,
            COALESCE(NULLIF(v_patient->>'blood_group', ''), 'UNKNOWN'),
            NULLIF(trim(v_patient->>'marital_status'), ''),
            NULLIF(trim(v_patient->>'occupation'), ''),
            FALSE,
            v_user_id,
            NOW(),
            NOW()
        )
        RETURNING id INTO v_patient_id;

        v_nid := NULLIF(trim(v_patient->>'nid'), '');
        IF v_nid IS NOT NULL THEN
            INSERT INTO public.patient_identifications (
                patient_id, id_type, id_number, is_verified
            )
            VALUES (v_patient_id, 'NID', regexp_replace(v_nid, '[^0-9]', '', 'g'), FALSE);
        END IF;

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

    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
    )
    VALUES (
        v_org_id,
        v_user_id,
        'CREATE',
        'PATIENT',
        'unified_patient_intake',
        v_patient_id::TEXT,
        jsonb_build_object(
            'patient_id', v_patient_id,
            'episode_id', v_episode_id,
            'encounter_at', v_encounter_at,
            'services', v_services
        ),
        NOW()
    );

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
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

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
    v_episode_id UUID := p_episode_id;
    v_lines JSONB := '[]'::JSONB;
    v_total NUMERIC := 0;
    v_prev_invoiced NUMERIC := 0;
    v_prev_paid NUMERIC := 0;
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF v_episode_id IS NULL THEN
        SELECT id INTO v_episode_id
        FROM public.patient_care_episodes
        WHERE organization_id = p_org_id AND patient_id = p_patient_id AND status = 'ACTIVE'
        ORDER BY started_at DESC
        LIMIT 1;
    END IF;

    IF v_episode_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'episode_id', NULL,
            'lines', '[]'::JSONB,
            'total', 0,
            'previous_invoiced', 0,
            'previous_paid', 0
        );
    END IF;

    SELECT COALESCE(SUM(i.grand_total), 0), COALESCE(SUM(i.paid_amount), 0)
    INTO v_prev_invoiced, v_prev_paid
    FROM public.invoices i
    WHERE i.organization_id = p_org_id
      AND i.patient_id = p_patient_id
      AND i.is_voided = FALSE;

    WITH candidates AS (
        SELECT
            pv.id AS source_id,
            'CONSULTATION'::TEXT AS category,
            'OPD Consultation - ' || COALESCE(d.full_name, 'Consultant') AS item_name,
            COALESCE(d.opd_fee, 0)::NUMERIC AS unit_price,
            1::NUMERIC AS quantity
        FROM public.patient_visits pv
        LEFT JOIN public.doctors d ON d.id = pv.doctor_id
        WHERE pv.organization_id = p_org_id
          AND pv.patient_id = p_patient_id
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

        SELECT
            ba.id AS source_id,
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
              WHERE organization_id = p_org_id AND patient_id = p_patient_id AND episode_id = v_episode_id
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

        SELECT
            cca.id AS source_id,
            'MISC'::TEXT AS category,
            'Critical Care - ' || COALESCE(ccu.unit_name, ccu.unit_type) || ' (' || cca.bed_number || ')' AS item_name,
            COALESCE(ccu.daily_charge, 0)::NUMERIC AS unit_price,
            public.ohms_billable_days(cca.admission_time, COALESCE(cca.discharge_time, p_as_of))::NUMERIC AS quantity
        FROM public.critical_care_admissions cca
        JOIN public.critical_care_units ccu ON ccu.id = cca.unit_id
        WHERE cca.organization_id = p_org_id
          AND cca.patient_id = p_patient_id
          AND cca.episode_id = v_episode_id
          AND NOT EXISTS (
              SELECT 1
              FROM public.invoice_items ii
              JOIN public.invoices inv ON inv.id = ii.invoice_id
              WHERE inv.organization_id = p_org_id
                AND inv.is_voided = FALSE
                AND ii.reference_id = cca.id
          )
    ),
    priced AS (
        SELECT
            source_id,
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
        'episode_id', v_episode_id,
        'lines', v_lines,
        'total', v_total,
        'previous_invoiced', v_prev_invoiced,
        'previous_paid', v_prev_paid,
        'previous_due', GREATEST(0, v_prev_invoiced - v_prev_paid)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_episode_settlement_invoice_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_episode_id UUID,
    p_cashier_id UUID
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
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

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

    SELECT preview->'lines', (preview->>'total')::NUMERIC
    INTO v_items, v_total
    FROM (
        SELECT public.get_episode_billing_preview(p_org_id, p_patient_id, p_episode_id, NOW()) AS preview
    ) q;

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

    v_res := public.create_invoice_and_post_gl_atomic(
        p_org_id,
        p_patient_id,
        NULL,
        v_items,
        0,
        'Episode final settlement',
        0,
        'CASH',
        NULL,
        p_cashier_id,
        'Unified patient care episode final settlement'
    );

    IF COALESCE((v_res->>'success')::BOOLEAN, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'EPISODE_SETTLEMENT_FAILED:%', COALESCE(v_res->>'error', 'unknown');
    END IF;

    v_invoice_id := (v_res->>'invoice_id')::UUID;

    UPDATE public.invoices
    SET episode_id = p_episode_id,
        is_episode_settlement = TRUE,
        updated_at = NOW()
    WHERE id = v_invoice_id;

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

CREATE OR REPLACE FUNCTION public.complete_episode_discharge_atomic(
    p_org_id UUID,
    p_episode_id UUID,
    p_discharge_type VARCHAR,
    p_final_diagnosis TEXT,
    p_hospital_course TEXT DEFAULT NULL,
    p_discharge_advice TEXT DEFAULT NULL,
    p_followup_instructions TEXT DEFAULT NULL,
    p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_episode RECORD;
    v_settlement RECORD;
    v_visit RECORD;
    v_assignment RECORD;
    v_cc RECORD;
    v_discharge_at TIMESTAMPTZ := NOW();
BEGIN
    IF auth.uid() IS NULL OR private.get_current_org_id() IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    SELECT * INTO v_episode
    FROM public.patient_care_episodes
    WHERE id = p_episode_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_episode.id IS NULL THEN
        RAISE EXCEPTION 'EPISODE_NOT_FOUND';
    END IF;

    IF v_episode.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'EPISODE_ALREADY_CLOSED';
    END IF;

    SELECT * INTO v_settlement
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND episode_id = p_episode_id
      AND is_episode_settlement = TRUE
      AND is_voided = FALSE
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_settlement.id IS NOT NULL AND v_settlement.due_amount > 0.005 THEN
        RAISE EXCEPTION 'SETTLEMENT_DUE:%', v_settlement.due_amount;
    END IF;

    FOR v_assignment IN
        SELECT ba.id, ba.bed_id, ba.cabin_id, ba.visit_id
        FROM public.bed_assignments ba
        JOIN public.patient_visits pv ON pv.id = ba.visit_id
        WHERE ba.organization_id = p_org_id
          AND pv.episode_id = p_episode_id
          AND ba.status = 'ACTIVE'
        FOR UPDATE OF ba
    LOOP
        PERFORM public.vacate_or_discharge_bed_atomic(
            p_org_id,
            v_assignment.bed_id,
            v_assignment.cabin_id,
            COALESCE(p_actor, auth.uid()),
            'Episode discharge and final settlement completed'
        );

        INSERT INTO public.discharge_summaries (
            visit_id, discharge_type, final_diagnosis, hospital_course,
            discharge_advice, followup_instructions, prepared_by, approved_by, created_at
        )
        VALUES (
            v_assignment.visit_id,
            p_discharge_type,
            COALESCE(NULLIF(trim(p_final_diagnosis), ''), 'Discharged after completed hospital episode'),
            p_hospital_course,
            p_discharge_advice,
            p_followup_instructions,
            COALESCE(p_actor, auth.uid()),
            COALESCE(p_actor, auth.uid()),
            NOW()
        )
        ON CONFLICT (visit_id) DO UPDATE SET
            discharge_type = EXCLUDED.discharge_type,
            final_diagnosis = EXCLUDED.final_diagnosis,
            hospital_course = EXCLUDED.hospital_course,
            discharge_advice = EXCLUDED.discharge_advice,
            followup_instructions = EXCLUDED.followup_instructions,
            approved_by = EXCLUDED.approved_by;
    END LOOP;

    FOR v_visit IN
        SELECT pv.id
        FROM public.patient_visits pv
        WHERE pv.organization_id = p_org_id
          AND pv.episode_id = p_episode_id
          AND pv.visit_type = 'IPD'
          AND pv.status = 'ACTIVE'
        FOR UPDATE
    LOOP
        UPDATE public.patient_visits
        SET status = 'DISCHARGED',
            discharged_at = v_discharge_at,
            updated_at = NOW()
        WHERE id = v_visit.id;

        INSERT INTO public.discharge_summaries (
            visit_id, discharge_type, final_diagnosis, hospital_course,
            discharge_advice, followup_instructions, prepared_by, approved_by, created_at
        )
        VALUES (
            v_visit.id,
            p_discharge_type,
            COALESCE(NULLIF(trim(p_final_diagnosis), ''), 'Discharged after completed hospital episode'),
            p_hospital_course,
            p_discharge_advice,
            p_followup_instructions,
            COALESCE(p_actor, auth.uid()),
            COALESCE(p_actor, auth.uid()),
            NOW()
        )
        ON CONFLICT (visit_id) DO UPDATE SET
            discharge_type = EXCLUDED.discharge_type,
            final_diagnosis = EXCLUDED.final_diagnosis,
            hospital_course = EXCLUDED.hospital_course,
            discharge_advice = EXCLUDED.discharge_advice,
            followup_instructions = EXCLUDED.followup_instructions,
            approved_by = EXCLUDED.approved_by;
    END LOOP;

    FOR v_cc IN
        SELECT cca.id
        FROM public.critical_care_admissions cca
        WHERE cca.organization_id = p_org_id
          AND cca.episode_id = p_episode_id
          AND cca.status IN ('ACTIVE', 'admitted')
        FOR UPDATE
    LOOP
        PERFORM public.discharge_critical_care_atomic(
            v_cc.id,
            COALESCE(NULLIF(trim(p_final_diagnosis), ''), 'Critical care completed'),
            'HOME',
            p_hospital_course,
            COALESCE(p_actor, auth.uid())
        );
    END LOOP;

    UPDATE public.patient_care_episodes
    SET status = 'CLOSED',
        ended_at = v_discharge_at,
        updated_at = NOW()
    WHERE id = p_episode_id;

    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
    )
    VALUES (
        p_org_id,
        COALESCE(p_actor, auth.uid()),
        'DISCHARGE',
        'PATIENT',
        'patient_care_episode',
        p_episode_id::TEXT,
        jsonb_build_object(
            'discharge_type', p_discharge_type,
            'final_diagnosis', p_final_diagnosis,
            'settlement_invoice_id', CASE WHEN v_settlement.id IS NULL THEN NULL ELSE v_settlement.id END
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'episode_id', p_episode_id,
        'patient_id', v_episode.patient_id,
        'discharged_at', v_discharge_at,
        'settlement_invoice_id', CASE WHEN v_settlement.id IS NULL THEN NULL ELSE v_settlement.id END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ohms_billable_days(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ohms_billable_days(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_patient_intake_atomic(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_intake_atomic(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_episode_billing_preview(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.create_episode_settlement_invoice_atomic(UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_episode_settlement_invoice_atomic(UUID, UUID, UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_episode_discharge_atomic(UUID, UUID, VARCHAR, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_episode_discharge_atomic(UUID, UUID, VARCHAR, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
