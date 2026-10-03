-- ==============================================================================
-- OHMS Database Migration 105: Fix Database Lint Functions and Schema
-- 
-- Description:
-- 1. Ensure public.user_roles has is_active column for active role validation.
-- 2. Ensure public.lab_analyzer_transmissions has received_at timestamp column.
-- 3. Fix admit_patient_to_bed_atomic INSERT target-column vs expression mismatch (missing assigned_at NOW()).
-- 4. Fix vacate_or_discharge_bed_atomic RECORD assignment to unassigned tuple structure.
-- ==============================================================================

-- 1. Schema Extensions
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.lab_analyzer_transmissions 
ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Recreate admit_patient_to_bed_atomic with correct column-to-value count
CREATE OR REPLACE FUNCTION public.admit_patient_to_bed_atomic(
    p_organization_id UUID,
    p_patient_id UUID,
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name TEXT DEFAULT NULL,
    p_chief_complaint TEXT DEFAULT NULL,
    p_admission_type VARCHAR DEFAULT 'IPD',
    p_daily_charge NUMERIC DEFAULT 0,
    p_assigned_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_bed_number TEXT;
    v_bed_status TEXT;
    v_patient_name TEXT;
    v_visit_id UUID;
    v_assignment_id UUID;
    v_charge NUMERIC := p_daily_charge;
    v_active_check UUID;
BEGIN
    -- 1. Validation: At least one of bed_id or cabin_id must be provided
    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Either bed_id or cabin_id must be provided';
    END IF;

    -- 2. Fetch patient name
    SELECT full_name INTO v_patient_name
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_name IS NULL THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: Patient % does not exist', p_patient_id;
    END IF;

    -- 3. Row-level Lock and Concurrency Validation
    IF p_bed_id IS NOT NULL THEN
        SELECT status, bed_number, daily_rate
        INTO v_bed_status, v_bed_number, v_charge
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'BED_NOT_FOUND: Bed % does not exist', p_bed_id;
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'BED_UNAVAILABLE: Bed % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        -- Check existing active assignment
        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE bed_id = p_bed_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED: Bed % already has an active inpatient assignment', v_bed_number;
        END IF;
    ELSE
        SELECT status, cabin_number, daily_rate
        INTO v_bed_status, v_bed_number, v_charge
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'CABIN_NOT_FOUND: Cabin % does not exist', p_cabin_id;
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'CABIN_UNAVAILABLE: Cabin % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE cabin_id = p_cabin_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED: Cabin % already has an active inpatient assignment', v_bed_number;
        END IF;
    END IF;

    IF p_daily_charge > 0 THEN
        v_charge := p_daily_charge;
    END IF;

    -- 4. Create or reuse active IPD visit
    SELECT id INTO v_visit_id
    FROM public.patient_visits
    WHERE patient_id = p_patient_id AND visit_type = 'IPD' AND status = 'ACTIVE'
    ORDER BY admitted_at DESC
    LIMIT 1;

    IF v_visit_id IS NULL THEN
        INSERT INTO public.patient_visits (
            organization_id, patient_id, visit_type, status, chief_complaint, admitted_at, doctor_id, visit_number
        ) VALUES (
            p_organization_id,
            p_patient_id,
            'IPD',
            'ACTIVE',
            COALESCE(p_chief_complaint, 'Inpatient Admission'),
            NOW(),
            p_doctor_id,
            'IPD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6)
        ) RETURNING id INTO v_visit_id;
    END IF;

    -- 5. Insert Bed Assignment Record with matching columns and values
    INSERT INTO public.bed_assignments (
        organization_id, visit_id, patient_id, bed_id, cabin_id, assigned_at, daily_charge, status, assigned_by
    ) VALUES (
        p_organization_id,
        v_visit_id,
        p_patient_id,
        p_bed_id,
        p_cabin_id,
        NOW(),
        COALESCE(v_charge, 0),
        'ACTIVE',
        p_assigned_by
    ) RETURNING id INTO v_assignment_id;

    -- 6. Update Bed / Cabin Status to OCCUPIED
    IF p_bed_id IS NOT NULL THEN
        UPDATE public.beds
        SET status = 'OCCUPIED',
            patient_name = v_patient_name,
            admitted_at = NOW()
        WHERE id = p_bed_id;
    ELSE
        UPDATE public.cabins
        SET status = 'OCCUPIED'
        WHERE id = p_cabin_id;
    END IF;

    -- 7. Insert Forensic Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
    ) VALUES (
        p_organization_id,
        p_assigned_by,
        'BED_ADMISSION',
        'IPD',
        'bed_assignments',
        v_assignment_id::text,
        jsonb_build_object(
            'patient_id', p_patient_id,
            'patient_name', v_patient_name,
            'bed_id', p_bed_id,
            'cabin_id', p_cabin_id,
            'bed_number', v_bed_number,
            'daily_charge', v_charge,
            'visit_id', v_visit_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'assignment_id', v_assignment_id,
        'visit_id', v_visit_id,
        'patient_id', p_patient_id,
        'bed_number', v_bed_number,
        'status', 'OCCUPIED',
        'daily_charge', v_charge
    );
END;
$$;

-- 3. Recreate vacate_or_discharge_bed_atomic with explicit scalar variables
CREATE OR REPLACE FUNCTION public.vacate_or_discharge_bed_atomic(
    p_organization_id UUID,
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_vacated_by UUID DEFAULT NULL,
    p_discharge_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_id UUID;
    v_bed_number TEXT;
    v_assignment_id UUID;
    v_visit_id UUID;
    v_patient_id UUID;
BEGIN
    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Either bed_id or cabin_id must be provided';
    END IF;

    IF p_bed_id IS NOT NULL THEN
        SELECT id, bed_number INTO v_target_id, v_bed_number
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        -- Update active assignment to VACATED
        UPDATE public.bed_assignments
        SET status = 'VACATED',
            vacated_at = NOW()
        WHERE bed_id = p_bed_id AND status = 'ACTIVE'
        RETURNING id, visit_id, patient_id INTO v_assignment_id, v_visit_id, v_patient_id;

        -- Bed transitions immediately to CLEANING (not directly to vacant!)
        UPDATE public.beds
        SET status = 'CLEANING',
            patient_name = NULL,
            admitted_at = NULL
        WHERE id = p_bed_id;
    ELSE
        SELECT id, cabin_number INTO v_target_id, v_bed_number
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        UPDATE public.bed_assignments
        SET status = 'VACATED',
            vacated_at = NOW()
        WHERE cabin_id = p_cabin_id AND status = 'ACTIVE'
        RETURNING id, visit_id, patient_id INTO v_assignment_id, v_visit_id, v_patient_id;

        UPDATE public.cabins
        SET status = 'CLEANING'
        WHERE id = p_cabin_id;
    END IF;

    -- Update visit status if applicable
    IF v_visit_id IS NOT NULL THEN
        UPDATE public.patient_visits
        SET status = 'DISCHARGED',
            discharged_at = NOW()
        WHERE id = v_visit_id;
    END IF;

    -- Insert Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
    ) VALUES (
        p_organization_id,
        p_vacated_by,
        'BED_DISCHARGE_CLEANING',
        'IPD',
        'bed_assignments',
        COALESCE(v_assignment_id::text, p_bed_id::text, p_cabin_id::text),
        jsonb_build_object(
            'bed_id', p_bed_id,
            'cabin_id', p_cabin_id,
            'bed_number', v_bed_number,
            'new_status', 'CLEANING',
            'notes', p_discharge_notes
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'bed_number', v_bed_number,
        'new_status', 'CLEANING',
        'assignment_id', v_assignment_id
    );
END;
$$;

-- 4. Re-grant execute privileges
REVOKE ALL ON FUNCTION public.admit_patient_to_bed_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_patient_to_bed_atomic TO authenticated;

REVOKE ALL ON FUNCTION public.vacate_or_discharge_bed_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vacate_or_discharge_bed_atomic TO authenticated;
