-- =====================================================================================
-- FORWARD MIGRATION: 20261011040000_harden_expenses_tariffs_and_discharge_security_v4.sql
-- Drop stale overload and align bed_assignments status to VACATED / vacated_at
-- =====================================================================================

-- Drop stale 10-argument overload of save_hospital_service_tariff_atomic
DROP FUNCTION IF EXISTS public.save_hospital_service_tariff_atomic(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, BOOLEAN);

-- Re-create complete_ipd_discharge_atomic with bed_assignments status = 'VACATED' and vacated_at = NOW()
CREATE OR REPLACE FUNCTION public.complete_ipd_discharge_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_discharge_type VARCHAR,
    p_final_diagnosis TEXT,
    p_consultant_doctor_id UUID DEFAULT NULL,
    p_consultant_name VARCHAR DEFAULT NULL,
    p_bmdc_reg_number VARCHAR DEFAULT NULL,
    p_consultant_designation VARCHAR DEFAULT NULL,
    p_hospital_course TEXT DEFAULT NULL,
    p_condition_at_discharge VARCHAR DEFAULT NULL,
    p_discharge_advice TEXT DEFAULT NULL,
    p_followup_instructions TEXT DEFAULT NULL,
    p_presenting_features JSONB DEFAULT '[]'::jsonb,
    p_investigations_summary TEXT DEFAULT NULL,
    p_operation_name VARCHAR DEFAULT NULL,
    p_operation_date DATE DEFAULT NULL,
    p_operation_time VARCHAR DEFAULT NULL,
    p_surgeon_name VARCHAR DEFAULT NULL,
    p_assistant_surgeons VARCHAR DEFAULT NULL,
    p_anaesthetist_name VARCHAR DEFAULT NULL,
    p_anaesthesia_type VARCHAR DEFAULT NULL,
    p_operative_findings TEXT DEFAULT NULL,
    p_baby_sex VARCHAR DEFAULT NULL,
    p_baby_weight_kg NUMERIC DEFAULT NULL,
    p_baby_apgar_score VARCHAR DEFAULT NULL,
    p_baby_notes TEXT DEFAULT NULL,
    p_medications_schedule JSONB DEFAULT '[]'::jsonb,
    p_stitch_removal_date DATE DEFAULT NULL,
    p_followup_date DATE DEFAULT NULL,
    p_prepared_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_org UUID;
    v_user_id UUID;
    v_visit RECORD;
    v_doc RECORD;
    v_summary_id UUID;
    v_bed_assign RECORD;
    v_final_consultant_name VARCHAR(150);
    v_final_bmdc VARCHAR(50);
    v_final_specialty VARCHAR(150);
    v_ot_details JSONB;
    v_baby_note JSONB;
BEGIN
    v_user_id := auth.uid();
    v_caller_org := public.get_current_org_id();

    -- 1. Tenant Check
    IF v_user_id IS NOT NULL THEN
        IF v_caller_org IS NULL OR p_org_id != v_caller_org THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant access violation in patient discharge.';
        END IF;

        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'ipd.discharge') OR
            public.is_org_admin_or_has_permission(p_org_id, 'ipd.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'doctors.manage') OR
            public.has_permission('ipd.discharge') OR
            public.has_permission('ipd.manage')
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Insufficient clinical permissions to discharge inpatient.';
        END IF;
    END IF;

    -- 2. Lock & Validate Visit
    SELECT id, organization_id, patient_id, status
    INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Inpatient admission record % not found in organization %.', p_visit_id, p_org_id;
    END IF;

    IF v_visit.status = 'DISCHARGED' THEN
        RAISE EXCEPTION 'Patient has already been discharged from admission encounter %.', p_visit_id;
    END IF;

    -- 3. Validate Mandatory Clinical Fields
    IF TRIM(COALESCE(p_final_diagnosis, '')) = '' OR LENGTH(TRIM(p_final_diagnosis)) < 2 THEN
        RAISE EXCEPTION 'Final clinical diagnosis is mandatory for discharge approval.';
    END IF;

    -- 4. Validate & Bind Consultant Doctor Details
    v_final_consultant_name := TRIM(COALESCE(p_consultant_name, ''));
    v_final_bmdc := TRIM(COALESCE(p_bmdc_reg_number, ''));
    v_final_specialty := TRIM(COALESCE(p_consultant_designation, ''));

    IF p_consultant_doctor_id IS NOT NULL THEN
        SELECT id, full_name, bmdc_reg_number, specialization, designation
        INTO v_doc
        FROM public.doctors
        WHERE id = p_consultant_doctor_id AND organization_id = p_org_id;

        IF v_doc.id IS NOT NULL THEN
            IF v_final_consultant_name = '' THEN
                v_final_consultant_name := v_doc.full_name;
            END IF;
            IF v_final_bmdc = '' THEN
                v_final_bmdc := COALESCE(v_doc.bmdc_reg_number, '');
            END IF;
            IF v_final_specialty = '' THEN
                v_final_specialty := COALESCE(v_doc.designation || ', ' || v_doc.specialization, v_doc.designation);
            END IF;
        END IF;
    END IF;

    IF v_final_consultant_name = '' THEN
        RAISE EXCEPTION 'Consultant Doctor name is mandatory on discharge certificate.';
    END IF;

    -- Assemble ot_details JSONB
    v_ot_details := jsonb_build_object(
        'operation_name', TRIM(COALESCE(p_operation_name, '')),
        'operation_date', p_operation_date,
        'operation_time', TRIM(COALESCE(p_operation_time, '')),
        'surgeon_name', TRIM(COALESCE(p_surgeon_name, '')),
        'assistant_surgeons', TRIM(COALESCE(p_assistant_surgeons, '')),
        'anaesthetist_name', TRIM(COALESCE(p_anaesthetist_name, '')),
        'anaesthesia_type', TRIM(COALESCE(p_anaesthesia_type, '')),
        'operative_findings', TRIM(COALESCE(p_operative_findings, ''))
    );

    -- Assemble baby_note JSONB
    v_baby_note := jsonb_build_object(
        'sex', p_baby_sex,
        'weight_kg', p_baby_weight_kg,
        'apgar_score', p_baby_apgar_score,
        'notes', TRIM(COALESCE(p_baby_notes, ''))
    );

    -- 5. Insert Discharge Summary using authentic column names
    INSERT INTO public.discharge_summaries (
        organization_id,
        visit_id,
        discharge_type,
        final_diagnosis,
        hospital_course,
        condition_at_discharge,
        discharge_advice,
        followup_instructions,
        consultant_doctor_id,
        consultant_doctor_name,
        consultant_doctor_bmdc,
        consultant_doctor_specialty,
        presenting_features,
        investigations_summary,
        ot_details,
        baby_note,
        discharge_medications,
        prepared_by,
        approved_by,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_visit_id,
        COALESCE(p_discharge_type, 'NORMAL'),
        TRIM(p_final_diagnosis),
        TRIM(p_hospital_course),
        TRIM(p_condition_at_discharge),
        TRIM(p_discharge_advice),
        TRIM(p_followup_instructions),
        p_consultant_doctor_id,
        v_final_consultant_name,
        v_final_bmdc,
        v_final_specialty,
        COALESCE(p_presenting_features, '[]'::jsonb),
        TRIM(p_investigations_summary),
        v_ot_details,
        v_baby_note,
        COALESCE(p_medications_schedule, '[]'::jsonb),
        COALESCE(v_user_id, p_prepared_by),
        COALESCE(v_user_id, p_prepared_by),
        NOW(),
        NOW()
    ) RETURNING id INTO v_summary_id;

    -- 6. Transition Visit to DISCHARGED
    UPDATE public.patient_visits
    SET status = 'DISCHARGED',
        discharged_at = NOW(),
        updated_at = NOW()
    WHERE id = p_visit_id AND organization_id = p_org_id;

    -- 7. Atomically Vacate Bed / Cabin Assignment
    FOR v_bed_assign IN
        SELECT id, bed_id, cabin_id
        FROM public.bed_assignments
        WHERE visit_id = p_visit_id AND organization_id = p_org_id AND status = 'ACTIVE'
    LOOP
        UPDATE public.bed_assignments
        SET status = 'VACATED',
            vacated_at = NOW()
        WHERE id = v_bed_assign.id;

        IF v_bed_assign.bed_id IS NOT NULL THEN
            UPDATE public.beds
            SET status = 'VACANT', updated_at = NOW()
            WHERE id = v_bed_assign.bed_id AND organization_id = p_org_id;
        END IF;

        IF v_bed_assign.cabin_id IS NOT NULL THEN
            UPDATE public.cabins
            SET status = 'VACANT', updated_at = NOW()
            WHERE id = v_bed_assign.cabin_id AND organization_id = p_org_id;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'summary_id', v_summary_id,
        'visit_id', p_visit_id,
        'status', 'DISCHARGED',
        'consultant_name', v_final_consultant_name,
        'bmdc_reg_number', v_final_bmdc
    );
END;
$$;
