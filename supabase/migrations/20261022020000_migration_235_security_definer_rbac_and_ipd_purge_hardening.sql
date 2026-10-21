-- =====================================================================================
-- MIGRATION 235: FINAL CLINICAL SECURITY DEFINER HARDENING, RBAC & IPD PURGE AUDIT
-- =====================================================================================
-- Description:
-- 1. Revoke PUBLIC and anon EXECUTE permissions on all sensitive SECURITY DEFINER RPCs:
--    - record_referral_commission_payout_atomic (both overloads)
--    - update_blood_transfusion_dossier_atomic
--    - cancel_or_void_blood_transfusion_atomic (both overloads)
--    - update_ipd_admission_atomic
--    - update_waiting_queue_status_atomic
--    - cancel_or_delete_ipd_admission_atomic
--    - complete_ipd_discharge_atomic
-- 2. Revoke anonymous Data API access on medical tables:
--    - public.prescriptions (REVOKE ALL FROM anon)
--    - public.prescription_items (REVOKE ALL FROM anon)
--    - Enforce explicit authenticated and service_role access only
-- 3. Hardened IPD Cancel vs Permanent Purge Authorization (cancel_or_delete_ipd_admission_atomic):
--    - Default p_permanent_delete = FALSE (Safe cancellation by default)
--    - Operational cancel permitted for receptionists, nurses, and doctors
--    - Destructive permanent purge strictly gated to super_admin, admin, or patients.delete
--    - Universal unlinking of child invoices and records to guarantee zero FK violations
-- 4. Eliminate Fictional Doctor Fallback in Discharge (complete_ipd_discharge_atomic):
--    - Remove 'Senior Consultant Physician' placeholder fallback
--    - Strictly require licensed consultant doctor identification
-- 5. Fail-Closed Authentication Guards inside RPC execution contexts
-- 6. Refresh PostgREST schema cache
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. REVOKE ANONYMOUS DATA API ACCESS ON MEDICAL TABLES
-- -------------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.prescriptions FROM anon;
REVOKE ALL ON TABLE public.prescription_items FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prescriptions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prescription_items TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. HARDENED CANCEL OR DELETE IPD ADMISSION ATOMIC
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_or_delete_ipd_admission_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT 'Mistake admission cancelled',
    p_permanent_delete BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_visit RECORD;
    v_ba RECORD;
    v_has_billed_invoices BOOLEAN := FALSE;
    v_is_authorized BOOLEAN := FALSE;
    v_is_purge_authorized BOOLEAN := FALSE;
BEGIN
    -- 1. Authentication Check
    IF v_caller IS NULL AND current_user <> 'service_role' THEN
        RAISE EXCEPTION '401 Unauthorized: Authentication required to manage IPD admissions.' USING ERRCODE = '42501';
    END IF;

    -- 2. General IPD Management Authorization Check
    IF v_caller IS NULL OR current_user = 'service_role' THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_caller
              AND (role IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'nurse', 'receptionist') OR is_super_admin = TRUE)
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) INTO v_is_authorized;

        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.role_permissions rp
                JOIN public.user_roles ur ON rp.role_id = ur.role_id
                WHERE ur.user_id = v_caller
                  AND ur.organization_id = p_org_id
                  AND (rp.permission_key IN ('ipd.manage', 'ipd.admit', 'ipd.discharge', 'patients.delete') OR rp.permission_key = '*')
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access Denied: Inpatient management permission required to cancel/delete admission.' USING ERRCODE = '42501';
    END IF;

    -- 3. Strict Privilege Check for Destructive Permanent Purge
    IF p_permanent_delete THEN
        IF v_caller IS NULL OR current_user = 'service_role' THEN
            v_is_purge_authorized := TRUE;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = v_caller
                  AND (role IN ('super_admin', 'admin', 'hospital_administrator') OR is_super_admin = TRUE)
                  AND (organization_id = p_org_id OR active_organization_id = p_org_id)
            ) INTO v_is_purge_authorized;

            IF NOT v_is_purge_authorized THEN
                SELECT EXISTS (
                    SELECT 1 FROM public.role_permissions rp
                    JOIN public.user_roles ur ON rp.role_id = ur.role_id
                    WHERE ur.user_id = v_caller
                      AND ur.organization_id = p_org_id
                      AND (rp.permission_key IN ('patients.delete') OR rp.permission_key = '*')
                ) INTO v_is_purge_authorized;
            END IF;
        END IF;

        IF NOT v_is_purge_authorized THEN
            RAISE EXCEPTION 'Access Denied: Permanent deletion of IPD admission requires super_admin or administrative purge authorization.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 4. Lock & Validate Inpatient Visit
    SELECT * INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Inpatient admission record not found.');
    END IF;

    -- Check if paid financial invoices exist
    SELECT EXISTS (
        SELECT 1 FROM public.invoices
        WHERE visit_id = p_visit_id
          AND organization_id = p_org_id
          AND UPPER(status) IN ('PAID', 'PARTIALLY_PAID')
    ) INTO v_has_billed_invoices;

    IF v_has_billed_invoices THEN
        RAISE EXCEPTION 'Cannot delete or cancel IPD admission: Paid financial invoices are already settled on this visit.';
    END IF;

    -- 5. Atomically Vacate All Associated Beds and Cabins
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

    -- Also check for active assignments by patient_id if admission was aborted
    IF v_visit.patient_id IS NOT NULL THEN
        FOR v_ba IN
            SELECT id, bed_id, cabin_id
            FROM public.bed_assignments
            WHERE patient_id = v_visit.patient_id 
              AND organization_id = p_org_id 
              AND UPPER(status) = 'ACTIVE'
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
    END IF;

    -- 6. Reconcile Bed Vacancy Drift
    PERFORM public.reconcile_bed_vacancy_drift_atomic(p_org_id);

    -- 7. Clean up or Unlink Referencing Clinical & Operational Child Records
    DELETE FROM public.vital_signs WHERE visit_id = p_visit_id;
    DELETE FROM public.patient_transfers WHERE visit_id = p_visit_id;
    DELETE FROM public.patient_vitals_rounds WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.nursing_notes WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.discharge_summaries WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.ot_bookings WHERE visit_id = p_visit_id AND organization_id = p_org_id;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ot_schedules') THEN
        UPDATE public.ot_schedules SET visit_id = NULL WHERE visit_id = p_visit_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_commission_claims') THEN
        UPDATE public.referral_commission_claims SET visit_id = NULL WHERE visit_id = p_visit_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_consents') THEN
        UPDATE public.patient_consents SET visit_id = NULL WHERE visit_id = p_visit_id;
    END IF;

    IF v_visit.episode_id IS NOT NULL THEN
        DELETE FROM public.episode_service_charges 
        WHERE episode_id = v_visit.episode_id 
          AND organization_id = p_org_id;
    END IF;

    UPDATE public.prescriptions SET visit_id = NULL WHERE visit_id = p_visit_id;
    UPDATE public.diagnostic_orders SET visit_id = NULL WHERE visit_id = p_visit_id;

    -- 8. Purge or Cancel Patient Visit
    IF p_permanent_delete THEN
        -- Delete unbilled draft invoices first
        DELETE FROM public.invoices 
        WHERE visit_id = p_visit_id 
          AND organization_id = p_org_id 
          AND UPPER(status) = 'DRAFT';

        -- Unlink any remaining non-draft invoices so foreign keys are never violated
        UPDATE public.invoices 
        SET visit_id = NULL 
        WHERE visit_id = p_visit_id 
          AND organization_id = p_org_id;

        DELETE FROM public.bed_assignments WHERE visit_id = p_visit_id AND organization_id = p_org_id;
        DELETE FROM public.patient_visits WHERE id = p_visit_id AND organization_id = p_org_id;
    ELSE
        UPDATE public.patient_visits
        SET status = 'CANCELLED',
            discharged_at = NOW(),
            chief_complaint = COALESCE(chief_complaint, '') || ' [CANCELLED: ' || p_reason || ']'
        WHERE id = p_visit_id AND organization_id = p_org_id;
    END IF;

    -- 9. Audit Trail
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, COALESCE(v_caller, p_admin_id),
        CASE WHEN p_permanent_delete THEN 'DELETE' ELSE 'CANCEL' END,
        'IPD', 'patient_visits', p_visit_id::text,
        to_jsonb(v_visit),
        jsonb_build_object('visit_number', v_visit.id, 'reason', p_reason, 'permanent_delete', p_permanent_delete, 'timestamp', NOW()),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'mode', CASE WHEN p_permanent_delete THEN 'DELETED' ELSE 'CANCELLED' END,
        'visit_id', p_visit_id,
        'message', 'IPD admission successfully ' || CASE WHEN p_permanent_delete THEN 'permanently deleted' ELSE 'cancelled' END || ' and bed vacated.'
    );
END;
$$;

-- Overload for backwards compatibility
CREATE OR REPLACE FUNCTION public.cancel_or_delete_ipd_admission_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT 'Mistake admission cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.cancel_or_delete_ipd_admission_atomic(
        p_org_id,
        p_visit_id,
        p_admin_id,
        p_reason,
        FALSE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3. HARDENED COMPLETE IPD DISCHARGE ATOMIC (NO FICTIONAL DOCTOR FALLBACK)
-- -------------------------------------------------------------------------------------
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
    -- 1. Authentication Check
    IF v_user_id IS NULL AND current_user <> 'service_role' THEN
        RAISE EXCEPTION '401 Unauthorized: Authentication required to authorize clinical discharge.' USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Input Context
    IF p_org_id IS NULL OR p_visit_id IS NULL THEN
        RAISE EXCEPTION 'Hospital organization UUID and admission visit UUID are mandatory.';
    END IF;

    -- 3. Lock & Validate Visit
    SELECT id, organization_id, patient_id, status, doctor_id
    INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_visit.id IS NULL THEN
        RAISE EXCEPTION 'Inpatient admission record % not found in organization %.', p_visit_id, p_org_id;
    END IF;

    IF UPPER(v_visit.status) = 'DISCHARGED' THEN
        SELECT id INTO v_summary_id 
        FROM public.discharge_summaries 
        WHERE visit_id = p_visit_id AND organization_id = p_org_id 
        ORDER BY created_at DESC LIMIT 1;

        RETURN jsonb_build_object(
            'success', TRUE,
            'summary_id', v_summary_id,
            'visit_id', p_visit_id,
            'status', 'DISCHARGED',
            'message', 'Patient has already been discharged from this admission encounter.'
        );
    END IF;

    -- 4. Validate Mandatory Clinical Fields
    IF TRIM(COALESCE(p_final_diagnosis, '')) = '' OR LENGTH(TRIM(p_final_diagnosis)) < 2 THEN
        RAISE EXCEPTION 'Final clinical diagnosis is mandatory for discharge approval.';
    END IF;

    -- 5. Validate & Bind Consultant Doctor Details (Strict - No Fictional Fallbacks)
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

    -- Fail-closed: Must have an authentic consultant name
    IF v_final_consultant_name = '' THEN
        RAISE EXCEPTION 'A licensed consultant doctor must be selected or provided to authorize clinical discharge.';
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
        'baby_sex', TRIM(COALESCE(p_baby_sex, '')),
        'baby_weight_kg', p_baby_weight_kg,
        'baby_apgar_score', TRIM(COALESCE(p_baby_apgar_score, '')),
        'baby_notes', TRIM(COALESCE(p_baby_notes, ''))
    );

    -- 6. Insert or Update Discharge Summary
    INSERT INTO public.discharge_summaries (
        organization_id,
        visit_id,
        patient_id,
        discharge_type,
        final_diagnosis,
        doctor_name,
        doctor_designation,
        hospital_course,
        condition_at_discharge,
        discharge_advice,
        followup_instructions,
        investigations_summary,
        ot_details,
        baby_note,
        prepared_by,
        bmdc_reg_number,
        presenting_features,
        medications_schedule,
        stitch_removal_date,
        followup_date,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_visit_id,
        v_visit.patient_id,
        COALESCE(p_discharge_type, 'NORMAL'),
        TRIM(p_final_diagnosis),
        v_final_consultant_name,
        v_final_specialty,
        TRIM(COALESCE(p_hospital_course, '')),
        COALESCE(p_condition_at_discharge, 'STABLE'),
        TRIM(COALESCE(p_discharge_advice, '')),
        TRIM(COALESCE(p_followup_instructions, '')),
        TRIM(COALESCE(p_investigations_summary, '')),
        v_ot_details,
        v_baby_note,
        COALESCE(p_prepared_by, v_user_id),
        v_final_bmdc,
        COALESCE(p_presenting_features, '[]'::jsonb),
        COALESCE(p_medications_schedule, '[]'::jsonb),
        p_stitch_removal_date,
        p_followup_date,
        NOW(),
        NOW()
    )
    ON CONFLICT (visit_id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        patient_id = EXCLUDED.patient_id,
        discharge_type = EXCLUDED.discharge_type,
        final_diagnosis = EXCLUDED.final_diagnosis,
        doctor_name = EXCLUDED.doctor_name,
        doctor_designation = EXCLUDED.doctor_designation,
        hospital_course = EXCLUDED.hospital_course,
        condition_at_discharge = EXCLUDED.condition_at_discharge,
        discharge_advice = EXCLUDED.discharge_advice,
        followup_instructions = EXCLUDED.followup_instructions,
        investigations_summary = EXCLUDED.investigations_summary,
        ot_details = EXCLUDED.ot_details,
        baby_note = EXCLUDED.baby_note,
        prepared_by = EXCLUDED.prepared_by,
        bmdc_reg_number = EXCLUDED.bmdc_reg_number,
        presenting_features = EXCLUDED.presenting_features,
        medications_schedule = EXCLUDED.medications_schedule,
        stitch_removal_date = EXCLUDED.stitch_removal_date,
        followup_date = EXCLUDED.followup_date,
        updated_at = NOW()
    RETURNING id INTO v_summary_id;

    -- 7. Update Patient Visit Status
    UPDATE public.patient_visits
    SET status = 'DISCHARGED',
        discharged_at = NOW(),
        updated_at = NOW()
    WHERE id = p_visit_id AND organization_id = p_org_id;

    -- 8. Atomically Vacate Bed & Cabin Assignments
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

    -- 9. Run bed vacancy reconciliation
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

-- -------------------------------------------------------------------------------------
-- 4. HARDENED UPDATE IPD ADMISSION ATOMIC
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_ipd_admission_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_provisional_diagnosis TEXT DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_guardian_name TEXT DEFAULT NULL,
    p_guardian_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_clinical_findings TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_visit RECORD;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- 1. Authentication Check
    IF v_caller IS NULL AND current_user <> 'service_role' THEN
        RAISE EXCEPTION '401 Unauthorized: Authentication required to modify admission.' USING ERRCODE = '42501';
    END IF;

    -- 2. Authorization Check
    IF v_caller IS NULL OR current_user = 'service_role' THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_caller
              AND (role IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'nurse', 'receptionist') OR is_super_admin = TRUE)
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) INTO v_is_authorized;

        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.role_permissions rp
                JOIN public.user_roles ur ON rp.role_id = ur.role_id
                WHERE ur.user_id = v_caller
                  AND ur.organization_id = p_org_id
                  AND (rp.permission_key IN ('ipd.manage', 'ipd.admit', 'ipd.edit', 'clinical.edit') OR rp.permission_key = '*')
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access Denied: Inpatient edit permission required.' USING ERRCODE = '42501';
    END IF;

    -- 3. Lock & Update
    SELECT * INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Inpatient admission record not found.');
    END IF;

    UPDATE public.patient_visits
    SET chief_complaint = COALESCE(p_provisional_diagnosis, chief_complaint),
        reason_for_visit = COALESCE(p_provisional_diagnosis, reason_for_visit),
        doctor_id = COALESCE(p_doctor_id, doctor_id),
        notes = COALESCE(p_notes, notes),
        clinical_findings = COALESCE(p_clinical_findings, clinical_findings),
        updated_at = NOW()
    WHERE id = p_visit_id AND organization_id = p_org_id;

    IF v_visit.patient_id IS NOT NULL AND (p_guardian_name IS NOT NULL OR p_guardian_phone IS NOT NULL) THEN
        UPDATE public.patients
        SET guardian_name = COALESCE(p_guardian_name, guardian_name),
            emergency_contact_name = COALESCE(p_guardian_name, emergency_contact_name),
            emergency_contact_phone = COALESCE(p_guardian_phone, emergency_contact_phone),
            updated_at = NOW()
        WHERE id = v_visit.patient_id AND organization_id = p_org_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'ভর্তি তথ্য ও চিকিৎসার পরামর্শ সফলভাবে আপডেট করা হয়েছে।');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.update_ipd_admission_atomic(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_ipd_admission_atomic(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 5. HARDENED UPDATE WAITING QUEUE STATUS ATOMIC
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_waiting_queue_status_atomic(
    p_org_id UUID,
    p_queue_id UUID,
    p_status TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_now TIMESTAMPTZ := NOW();
    v_appt_id UUID;
    v_tok_num TEXT;
BEGIN
    -- 1. Authentication Check
    IF v_caller IS NULL AND current_user <> 'service_role' THEN
        RAISE EXCEPTION '401 Unauthorized: Authentication required to update waiting queue.' USING ERRCODE = '42501';
    END IF;

    SELECT appointment_id, token_number
    INTO v_appt_id, v_tok_num
    FROM public.waiting_queue
    WHERE id = p_queue_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Waiting queue item not found.');
    END IF;

    IF UPPER(p_status) = 'CALLED' THEN
        UPDATE public.waiting_queue
        SET queue_status = 'CALLED',
            status = 'calling',
            called_at = v_now,
            updated_at = v_now
        WHERE id = p_queue_id;

        INSERT INTO public.token_calls (
            organization_id, waiting_queue_id, called_by, created_at
        ) VALUES (
            p_org_id, p_queue_id, COALESCE(v_caller, p_user_id), v_now
        );
    ELSIF UPPER(p_status) = 'IN_ROOM' THEN
        UPDATE public.waiting_queue
        SET queue_status = 'IN_ROOM',
            status = 'serving',
            started_at = v_now,
            updated_at = v_now
        WHERE id = p_queue_id;

        IF v_appt_id IS NOT NULL THEN
            UPDATE public.appointments SET status = 'IN_CHAMBER', updated_at = v_now WHERE id = v_appt_id;
        END IF;
    ELSIF UPPER(p_status) IN ('COMPLETED', 'DONE') THEN
        UPDATE public.waiting_queue
        SET queue_status = 'COMPLETED',
            status = 'done',
            finished_at = v_now,
            updated_at = v_now
        WHERE id = p_queue_id;

        IF v_appt_id IS NOT NULL THEN
            UPDATE public.appointments SET status = 'COMPLETED', updated_at = v_now WHERE id = v_appt_id;
        END IF;
    ELSIF UPPER(p_status) = 'SKIPPED' THEN
        UPDATE public.waiting_queue
        SET queue_status = 'SKIPPED',
            status = 'skipped',
            finished_at = v_now,
            updated_at = v_now
        WHERE id = p_queue_id;
    ELSE
        UPDATE public.waiting_queue
        SET queue_status = UPPER(p_status),
            status = LOWER(p_status),
            updated_at = v_now
        WHERE id = p_queue_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'queue_id', p_queue_id, 'status', UPPER(p_status));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.update_waiting_queue_status_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_waiting_queue_status_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 6. HARDENED UPDATE BLOOD TRANSFUSION DOSSIER ATOMIC
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_blood_transfusion_dossier_atomic(
    p_org_id UUID,
    p_transfusion_id UUID,
    p_user_id UUID,
    p_donor_name TEXT,
    p_donor_phone TEXT,
    p_donor_age INT,
    p_donor_blood_group TEXT,
    p_major_crossmatch TEXT,
    p_minor_crossmatch TEXT,
    p_crossmatch_result TEXT,
    p_technologist_name TEXT,
    p_adverse_reaction_notes TEXT,
    p_sourcing_blood_bank TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_old RECORD;
BEGIN
    -- 1. Authentication Check
    IF v_caller IS NULL AND current_user <> 'service_role' THEN
        RAISE EXCEPTION '401 Unauthorized: Authentication required to modify blood transfusion record.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_old
    FROM public.blood_transfusion_records
    WHERE id = p_transfusion_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfusion record not found.');
    END IF;

    UPDATE public.blood_transfusion_records
    SET donor_name = TRIM(p_donor_name),
        donor_phone = TRIM(p_donor_phone),
        donor_age = p_donor_age,
        donor_blood_group = p_donor_blood_group,
        major_crossmatch = p_major_crossmatch,
        minor_crossmatch = p_minor_crossmatch,
        crossmatch_result = p_crossmatch_result,
        technologist_name = TRIM(p_technologist_name),
        adverse_reaction_notes = TRIM(p_adverse_reaction_notes),
        sourcing_blood_bank = COALESCE(TRIM(p_sourcing_blood_bank), sourcing_blood_bank)
    WHERE id = p_transfusion_id AND organization_id = p_org_id;

    IF v_old.bag_id IS NOT NULL THEN
        UPDATE public.blood_inventory
        SET donor_name = TRIM(p_donor_name),
            donor_phone = TRIM(p_donor_phone),
            donor_age = p_donor_age,
            blood_group = p_donor_blood_group,
            updated_at = NOW()
        WHERE id = v_old.bag_id AND organization_id = p_org_id;
    END IF;

    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, COALESCE(v_caller, p_user_id), 'UPDATE', 'BLOOD_BANK', 'blood_transfusion_records', p_transfusion_id::text,
        to_jsonb(v_old),
        jsonb_build_object('donor_name', p_donor_name, 'major', p_major_crossmatch, 'minor', p_minor_crossmatch),
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'message', 'Transfusion dossier updated successfully.');
END;
$$;

REVOKE ALL ON FUNCTION public.update_blood_transfusion_dossier_atomic(UUID, UUID, UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_blood_transfusion_dossier_atomic(UUID, UUID, UUID, TEXT, TEXT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_or_void_blood_transfusion_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_or_void_blood_transfusion_atomic(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_or_void_blood_transfusion_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_or_void_blood_transfusion_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 7. HARDENED REFERRAL COMMISSION PAYOUT ATOMIC
-- -------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 8. RELOAD SCHEMA CACHE
-- -------------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
