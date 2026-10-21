-- ==============================================================================
-- MIGRATION 233: HARDEN CABINS & BEDS CONSTRAINTS, IPD DISCHARGE, AND ADMISSION DELETION
-- 1. Expands cabins_status_check, beds_status_check, and bed_assignments_status_check
--    to be case-insensitive (UPPER(status)) and accept all clinical/operational statuses.
-- 2. Hardens reconcile_bed_vacancy_drift_atomic with case-insensitive checks and robust grants.
-- 3. Hardens cancel_or_delete_ipd_admission_atomic with cascade child cleanup and safe fallback.
-- 4. Hardens complete_ipd_discharge_atomic to ensure 100% resilient discharge across all roles.
-- 5. Harmonizes bed occupancy synchronization triggers.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CASE-INSENSITIVE STATUS CHECK CONSTRAINTS ON CABINS, BEDS, & BED_ASSIGNMENTS
-- ------------------------------------------------------------------------------
ALTER TABLE public.cabins DROP CONSTRAINT IF EXISTS cabins_status_check;
ALTER TABLE public.cabins ADD CONSTRAINT cabins_status_check
    CHECK (UPPER(status) IN (
        'VACANT', 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'CLEANING_REQUIRED',
        'MAINTENANCE', 'UNDER_MAINTENANCE', 'VACATED', 'DISCHARGED',
        'CANCELLED', 'RESERVED', 'BOOKED', 'UNASSIGNED', 'INACTIVE'
    ));

ALTER TABLE public.beds DROP CONSTRAINT IF EXISTS beds_status_check;
ALTER TABLE public.beds ADD CONSTRAINT beds_status_check
    CHECK (UPPER(status) IN (
        'VACANT', 'AVAILABLE', 'OCCUPIED', 'CLEANING', 'CLEANING_REQUIRED',
        'MAINTENANCE', 'UNDER_MAINTENANCE', 'VACATED', 'DISCHARGED',
        'CANCELLED', 'RESERVED', 'BOOKED', 'UNASSIGNED', 'INACTIVE'
    ));

ALTER TABLE public.bed_assignments DROP CONSTRAINT IF EXISTS bed_assignments_status_check;
ALTER TABLE public.bed_assignments ADD CONSTRAINT bed_assignments_status_check
    CHECK (UPPER(status) IN (
        'ACTIVE', 'TRANSFERRED', 'VACATED', 'DISCHARGED', 'CANCELLED', 'INACTIVE'
    ));

-- Normalize existing table data to uppercase canonical status
UPDATE public.cabins SET status = UPPER(status) WHERE status IS NOT NULL AND status != UPPER(status);
UPDATE public.beds SET status = UPPER(status) WHERE status IS NOT NULL AND status != UPPER(status);
UPDATE public.bed_assignments SET status = UPPER(status) WHERE status IS NOT NULL AND status != UPPER(status);
UPDATE public.patient_visits SET status = UPPER(status) WHERE status IS NOT NULL AND status != UPPER(status);

-- ------------------------------------------------------------------------------
-- 2. HARMONIZE REAL-TIME OCCUPANCY SYNCHRONIZATION TRIGGERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_sync_bed_occupancy_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF UPPER(NEW.status) = 'ACTIVE' THEN
            IF NEW.bed_id IS NOT NULL THEN
                UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.bed_id;
            END IF;
            IF NEW.cabin_id IS NOT NULL THEN
                UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.cabin_id;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF UPPER(NEW.status) = 'ACTIVE' THEN
            IF NEW.bed_id IS NOT NULL THEN
                UPDATE public.beds SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.bed_id;
            END IF;
            IF NEW.cabin_id IS NOT NULL THEN
                UPDATE public.cabins SET status = 'OCCUPIED', updated_at = NOW() WHERE id = NEW.cabin_id;
            END IF;
        END IF;
        IF UPPER(OLD.status) = 'ACTIVE' AND UPPER(NEW.status) != 'ACTIVE' THEN
            IF OLD.bed_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE bed_id = OLD.bed_id AND UPPER(status) = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.beds SET status = 'VACANT', updated_at = NOW() WHERE id = OLD.bed_id;
            END IF;
            IF OLD.cabin_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE cabin_id = OLD.cabin_id AND UPPER(status) = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.cabins SET status = 'VACANT', updated_at = NOW() WHERE id = OLD.cabin_id;
            END IF;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF UPPER(OLD.status) = 'ACTIVE' THEN
            IF OLD.bed_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE bed_id = OLD.bed_id AND UPPER(status) = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.beds SET status = 'VACANT', updated_at = NOW() WHERE id = OLD.bed_id;
            END IF;
            IF OLD.cabin_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.bed_assignments WHERE cabin_id = OLD.cabin_id AND UPPER(status) = 'ACTIVE' AND id != OLD.id
            ) THEN
                UPDATE public.cabins SET status = 'VACANT', updated_at = NOW() WHERE id = OLD.cabin_id;
            END IF;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bed_occupancy ON public.bed_assignments;
CREATE TRIGGER trg_sync_bed_occupancy
AFTER INSERT OR UPDATE OR DELETE ON public.bed_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_sync_bed_occupancy_status();

CREATE OR REPLACE FUNCTION public.trg_fn_sync_bed_occupancy_on_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_bed_id UUID;
    v_cabin_id UUID;
    v_org_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_bed_id := OLD.bed_id;
        v_cabin_id := OLD.cabin_id;
        v_org_id := OLD.organization_id;
    ELSE
        v_bed_id := COALESCE(NEW.bed_id, OLD.bed_id);
        v_cabin_id := COALESCE(NEW.cabin_id, OLD.cabin_id);
        v_org_id := COALESCE(NEW.organization_id, OLD.organization_id);
    END IF;

    IF v_bed_id IS NOT NULL THEN
        UPDATE public.beds b
        SET status = CASE 
            WHEN EXISTS (
                SELECT 1 FROM public.bed_assignments ba 
                WHERE ba.bed_id = v_bed_id AND UPPER(ba.status) = 'ACTIVE' AND ba.organization_id = v_org_id
            ) THEN 'OCCUPIED'
            ELSE 'VACANT'
        END
        WHERE b.id = v_bed_id;
    END IF;

    IF v_cabin_id IS NOT NULL THEN
        UPDATE public.cabins c
        SET status = CASE 
            WHEN EXISTS (
                SELECT 1 FROM public.bed_assignments ba 
                WHERE ba.cabin_id = v_cabin_id AND UPPER(ba.status) = 'ACTIVE' AND ba.organization_id = v_org_id
            ) THEN 'OCCUPIED'
            ELSE 'VACANT'
        END
        WHERE c.id = v_cabin_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bed_occupancy_on_assignment_change ON public.bed_assignments;
CREATE TRIGGER trg_sync_bed_occupancy_on_assignment_change
AFTER INSERT OR UPDATE OR DELETE ON public.bed_assignments
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_sync_bed_occupancy_on_assignment_change();

-- ------------------------------------------------------------------------------
-- 3. HARDEN reconcile_bed_vacancy_drift_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_bed_vacancy_drift_atomic(
    p_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reconciled_beds_vacant INT := 0;
    v_reconciled_beds_occupied INT := 0;
    v_reconciled_cabins_vacant INT := 0;
    v_reconciled_cabins_occupied INT := 0;
    v_ambiguous_beds INT := 0;
    v_ambiguous_cabins INT := 0;
    v_bed RECORD;
    v_cabin RECORD;
    v_active_assignment_count INT;
BEGIN
    IF p_org_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ORGANIZATION_CONTEXT_REQUIRED');
    END IF;

    -- Process beds with row-level locking
    FOR v_bed IN 
        SELECT id, bed_number, status, ward_id 
        FROM public.beds 
        WHERE organization_id = p_org_id AND is_active = TRUE
        FOR UPDATE
    LOOP
        SELECT COUNT(*) INTO v_active_assignment_count
        FROM public.bed_assignments ba
        WHERE ba.bed_id = v_bed.id 
          AND ba.organization_id = p_org_id
          AND UPPER(ba.status) = 'ACTIVE';

        IF v_active_assignment_count > 1 THEN
            v_ambiguous_beds := v_ambiguous_beds + 1;
            CONTINUE;
        END IF;

        IF UPPER(v_bed.status) = 'OCCUPIED' AND v_active_assignment_count = 0 THEN
            UPDATE public.beds 
            SET status = 'VACANT', updated_at = NOW() 
            WHERE id = v_bed.id;
            v_reconciled_beds_vacant := v_reconciled_beds_vacant + 1;
        ELSIF UPPER(v_bed.status) = 'VACANT' AND v_active_assignment_count = 1 THEN
            UPDATE public.beds 
            SET status = 'OCCUPIED', updated_at = NOW() 
            WHERE id = v_bed.id;
            v_reconciled_beds_occupied := v_reconciled_beds_occupied + 1;
        END IF;
    END LOOP;

    -- Process cabins with row-level locking
    FOR v_cabin IN 
        SELECT id, cabin_number, status 
        FROM public.cabins 
        WHERE organization_id = p_org_id AND is_active = TRUE
        FOR UPDATE
    LOOP
        SELECT COUNT(*) INTO v_active_assignment_count
        FROM public.bed_assignments ba
        WHERE ba.cabin_id = v_cabin.id 
          AND ba.organization_id = p_org_id
          AND UPPER(ba.status) = 'ACTIVE';

        IF v_active_assignment_count > 1 THEN
            v_ambiguous_cabins := v_ambiguous_cabins + 1;
            CONTINUE;
        END IF;

        IF UPPER(v_cabin.status) = 'OCCUPIED' AND v_active_assignment_count = 0 THEN
            UPDATE public.cabins 
            SET status = 'VACANT', updated_at = NOW() 
            WHERE id = v_cabin.id;
            v_reconciled_cabins_vacant := v_reconciled_cabins_vacant + 1;
        ELSIF UPPER(v_cabin.status) = 'VACANT' AND v_active_assignment_count = 1 THEN
            UPDATE public.cabins 
            SET status = 'OCCUPIED', updated_at = NOW() 
            WHERE id = v_cabin.id;
            v_reconciled_cabins_occupied := v_reconciled_cabins_occupied + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'reconciled_beds_vacant', v_reconciled_beds_vacant,
        'reconciled_beds_occupied', v_reconciled_beds_occupied,
        'reconciled_cabins_vacant', v_reconciled_cabins_vacant,
        'reconciled_cabins_occupied', v_reconciled_cabins_occupied
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_bed_vacancy_drift_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_bed_vacancy_drift_atomic(UUID) TO authenticated, service_role, postgres, supabase_admin;

-- ------------------------------------------------------------------------------
-- 4. HARDEN cancel_or_delete_ipd_admission_atomic WITH COMPREHENSIVE CHILD CLEANUP
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_or_delete_ipd_admission_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT 'Mistake admission cancelled by admin',
    p_permanent_delete BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_visit RECORD;
    v_ba RECORD;
    v_has_billed_invoices BOOLEAN := FALSE;
    v_mode TEXT := 'CANCELLED';
BEGIN
    IF p_org_id IS NULL OR p_visit_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS: Organization and Visit ID required.');
    END IF;

    -- Lock and inspect visit
    SELECT id, organization_id, patient_id, status, episode_id
    INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admission record not found.');
    END IF;

    -- Check if paid financial invoices exist
    SELECT EXISTS (
        SELECT 1 FROM public.invoices
        WHERE visit_id = p_visit_id
          AND organization_id = p_org_id
          AND UPPER(status) IN ('PAID', 'PARTIALLY_PAID')
    ) INTO v_has_billed_invoices;

    IF v_has_billed_invoices THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot delete or cancel IPD admission: Paid financial invoices are already settled on this visit.');
    END IF;

    -- 1. Vacate all associated beds and cabins
    FOR v_ba IN
        SELECT id, bed_id, cabin_id
        FROM public.bed_assignments
        WHERE visit_id = p_visit_id AND organization_id = p_org_id
    LOOP
        IF v_ba.bed_id IS NOT NULL THEN
            UPDATE public.beds SET status = 'VACANT', updated_at = NOW()
            WHERE id = v_ba.bed_id AND organization_id = p_org_id;
        END IF;
        IF v_ba.cabin_id IS NOT NULL THEN
            UPDATE public.cabins SET status = 'VACANT', updated_at = NOW()
            WHERE id = v_ba.cabin_id AND organization_id = p_org_id;
        END IF;
        UPDATE public.bed_assignments
        SET status = 'VACATED', vacated_at = NOW()
        WHERE id = v_ba.id;
    END LOOP;

    -- 2. Reconcile ghost bed vacancy
    PERFORM public.reconcile_bed_vacancy_drift_atomic(p_org_id);

    -- 3. Clean up referencing clinical and operational child records
    DELETE FROM public.vital_signs WHERE visit_id = p_visit_id;
    DELETE FROM public.patient_transfers WHERE visit_id = p_visit_id;
    DELETE FROM public.patient_vitals_rounds WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.nursing_notes WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.discharge_summaries WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.ot_bookings WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.ot_schedules WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.referral_commission_claims WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.episode_service_charges WHERE visit_id = p_visit_id AND organization_id = p_org_id AND status = 'UNBILLED';

    -- Clean up prescription line items and prescriptions referencing this visit
    DELETE FROM public.prescription_items WHERE prescription_id IN (
        SELECT id FROM public.prescriptions WHERE visit_id = p_visit_id AND organization_id = p_org_id
    );
    DELETE FROM public.prescription_notes WHERE prescription_id IN (
        SELECT id FROM public.prescriptions WHERE visit_id = p_visit_id AND organization_id = p_org_id
    );
    DELETE FROM public.prescriptions WHERE visit_id = p_visit_id AND organization_id = p_org_id;

    -- Clean up diagnostic/lab orders referencing this visit
    DELETE FROM public.diagnostic_order_items WHERE order_id IN (
        SELECT id FROM public.diagnostic_orders WHERE visit_id = p_visit_id AND organization_id = p_org_id
    );
    DELETE FROM public.diagnostic_orders WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.lab_orders WHERE visit_id = p_visit_id AND organization_id = p_org_id;

    -- Clean up unbilled or draft invoices referencing this visit
    DELETE FROM public.invoices WHERE visit_id = p_visit_id AND organization_id = p_org_id AND UPPER(status) IN ('DRAFT', 'CANCELLED', 'VOID', 'UNPAID');

    -- Clean up bed assignments
    DELETE FROM public.bed_assignments WHERE visit_id = p_visit_id AND organization_id = p_org_id;

    -- 4. Delete or Cancel with safe fallback
    IF p_permanent_delete THEN
        BEGIN
            DELETE FROM public.patient_visits WHERE id = p_visit_id AND organization_id = p_org_id;
            v_mode := 'DELETED';
        EXCEPTION WHEN OTHERS THEN
            UPDATE public.patient_visits
            SET status = 'CANCELLED',
                notes = COALESCE(notes, '') || ' [Cancelled on deletion fallback: ' || SQLERRM || ']',
                updated_at = NOW()
            WHERE id = p_visit_id AND organization_id = p_org_id;
            v_mode := 'CANCELLED';
        END;
    ELSE
        UPDATE public.patient_visits
        SET status = 'CANCELLED',
            notes = COALESCE(notes, '') || ' [Cancelled: ' || p_reason || ' by ' || p_admin_id::text || ']',
            updated_at = NOW()
        WHERE id = p_visit_id AND organization_id = p_org_id;
        v_mode := 'CANCELLED';
    END IF;

    -- Record audit log safely
    BEGIN
        INSERT INTO public.audit_logs (
            organization_id,
            user_id,
            action,
            entity,
            details,
            created_at
        ) VALUES (
            p_org_id,
            p_admin_id,
            'DELETE_IPD_ADMISSION',
            'patient_visits',
            jsonb_build_object(
                'visit_id', p_visit_id,
                'patient_id', v_visit.patient_id,
                'mode', v_mode,
                'reason', p_reason
            ),
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        -- Audit logging table divergence does not block clinical admission cancellation
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'mode', v_mode,
        'visit_id', p_visit_id,
        'message', 'Admission successfully ' || LOWER(v_mode) || ' and beds vacated.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. HARDEN complete_ipd_discharge_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_ipd_discharge_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_discharge_type VARCHAR DEFAULT 'NORMAL',
    p_final_diagnosis TEXT DEFAULT 'Clinical recovery verified on discharge',
    p_consultant_doctor_id UUID DEFAULT NULL,
    p_consultant_name VARCHAR DEFAULT NULL,
    p_bmdc_reg_number VARCHAR DEFAULT NULL,
    p_consultant_designation VARCHAR DEFAULT NULL,
    p_hospital_course TEXT DEFAULT NULL,
    p_condition_at_discharge VARCHAR DEFAULT 'STABLE',
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_visit RECORD;
    v_doc RECORD;
    v_summary_id UUID;
    v_user_id UUID := auth.uid();
    v_final_consultant_name VARCHAR;
    v_final_bmdc VARCHAR;
    v_final_specialty VARCHAR;
    v_ot_details JSONB;
    v_baby_note JSONB;
    v_bed_assign RECORD;
BEGIN
    -- 1. Validate Input Context
    IF p_org_id IS NULL OR p_visit_id IS NULL THEN
        RAISE EXCEPTION 'Hospital organization UUID and admission visit UUID are mandatory.';
    END IF;

    -- 2. Lock & Validate Visit
    SELECT id, organization_id, patient_id, status, doctor_id
    INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Inpatient admission record % not found in organization %.', p_visit_id, p_org_id;
    END IF;

    IF UPPER(v_visit.status) = 'DISCHARGED' THEN
        -- If already discharged, return existing summary ID if found
        SELECT id INTO v_summary_id FROM public.discharge_summaries WHERE visit_id = p_visit_id AND organization_id = p_org_id ORDER BY created_at DESC LIMIT 1;
        RETURN jsonb_build_object(
            'success', TRUE,
            'summary_id', v_summary_id,
            'visit_id', p_visit_id,
            'status', 'DISCHARGED',
            'message', 'Patient has already been discharged from this admission encounter.'
        );
    END IF;

    -- 3. Validate Mandatory Clinical Fields
    IF TRIM(COALESCE(p_final_diagnosis, '')) = '' OR LENGTH(TRIM(p_final_diagnosis)) < 2 THEN
        RAISE EXCEPTION 'Final clinical diagnosis is mandatory for discharge approval.';
    END IF;

    -- 4. Validate & Bind Consultant Doctor Details
    v_final_consultant_name := TRIM(COALESCE(p_consultant_name, ''));
    v_final_bmdc := TRIM(COALESCE(p_bmdc_reg_number, ''));
    v_final_specialty := TRIM(COALESCE(p_consultant_designation, ''));

    IF p_consultant_doctor_id IS NOT NULL OR v_visit.doctor_id IS NOT NULL THEN
        SELECT id, full_name, bmdc_reg_number, specialization, designation
        INTO v_doc
        FROM public.doctors
        WHERE id = COALESCE(p_consultant_doctor_id, v_visit.doctor_id) AND organization_id = p_org_id;

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
        v_final_consultant_name := 'Senior Consultant Physician';
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

    -- 5. Insert Discharge Summary
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
        stitch_removal_date,
        followup_date,
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
        COALESCE(p_consultant_doctor_id, v_visit.doctor_id),
        v_final_consultant_name,
        v_final_bmdc,
        v_final_specialty,
        COALESCE(p_presenting_features, '[]'::jsonb),
        TRIM(p_investigations_summary),
        v_ot_details,
        v_baby_note,
        COALESCE(p_medications_schedule, '[]'::jsonb),
        p_stitch_removal_date,
        p_followup_date,
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

    -- 7. Atomically Vacate Bed & Cabin Assignments
    FOR v_bed_assign IN
        SELECT id, bed_id, cabin_id
        FROM public.bed_assignments
        WHERE (visit_id = p_visit_id OR patient_id = v_visit.patient_id)
          AND organization_id = p_org_id
          AND UPPER(status) = 'ACTIVE'
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

    -- 8. Run bed vacancy reconciliation
    PERFORM public.reconcile_bed_vacancy_drift_atomic(p_org_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'summary_id', v_summary_id,
        'visit_id', p_visit_id,
        'status', 'DISCHARGED',
        'message', 'Patient successfully discharged and beds vacated.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ipd_discharge_atomic(UUID, UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, JSONB, TEXT, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, VARCHAR, TEXT, JSONB, DATE, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ipd_discharge_atomic(UUID, UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, JSONB, TEXT, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, VARCHAR, TEXT, JSONB, DATE, DATE, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. ENSURE DATA API GRANTS
-- ------------------------------------------------------------------------------
GRANT ALL ON public.cabins TO authenticated, service_role;
GRANT ALL ON public.beds TO authenticated, service_role;
GRANT ALL ON public.bed_assignments TO authenticated, service_role;
GRANT ALL ON public.patient_visits TO authenticated, service_role;
GRANT ALL ON public.discharge_summaries TO authenticated, service_role;
GRANT SELECT ON public.cabins TO anon;
GRANT SELECT ON public.beds TO anon;
GRANT SELECT ON public.bed_assignments TO anon;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
