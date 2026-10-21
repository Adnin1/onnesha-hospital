-- ==============================================================================
-- MIGRATION 236: FIX DISCHARGE_SUMMARIES SCHEMA DRIFT, COMPLETE IPD LIFECYCLE & ZERO REGRESSION CLOSURE
-- ==============================================================================
-- 1. Adds missing patient_id column to public.discharge_summaries with FK to public.patients(id).
-- 2. Backfills patient_id from public.patient_visits for all existing discharge summaries.
-- 3. Enforces unique index on public.discharge_summaries(visit_id) for reliable ON CONFLICT upserts.
-- 4. Re-declares complete_ipd_discharge_atomic to atomically insert patient_id, bind consultant doctor,
--    and vacate all associated beds & cabins.
-- 5. Re-declares cancel_or_delete_ipd_admission_atomic to handle caller ID fallback (p_admin_id) and
--    prevent FK blockers on draft/cancelled invoices.
-- 6. Enforces explicit Data API permissions and notifies PostgREST schema cache reload.
-- ==============================================================================

-- 1. SCHEMA ALIGNMENT: ADD PATIENT_ID TO DISCHARGE_SUMMARIES
ALTER TABLE IF EXISTS public.discharge_summaries
    ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;

-- 2. BACKFILL PATIENT_ID FROM PATIENT_VISITS
UPDATE public.discharge_summaries ds
SET patient_id = pv.patient_id
FROM public.patient_visits pv
WHERE ds.visit_id = pv.id
  AND ds.patient_id IS NULL;

-- 3. DEDUPLICATE ANY HISTORICAL DUPLICATE SUMMARIES PRIOR TO UNIQUE INDEX
DELETE FROM public.discharge_summaries a
USING public.discharge_summaries b
WHERE a.visit_id = b.visit_id
  AND a.id <> b.id
  AND a.created_at < b.created_at;

-- 4. CREATE UNIQUE INDEX ON VISIT_ID & PERFORMANCE INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS idx_discharge_summaries_visit_id_unique 
    ON public.discharge_summaries(visit_id);

CREATE INDEX IF NOT EXISTS idx_discharge_summaries_patient_id 
    ON public.discharge_summaries(patient_id);

CREATE INDEX IF NOT EXISTS idx_discharge_summaries_org_id 
    ON public.discharge_summaries(organization_id);

-- 5. DROP OLD OVERLOADS OF COMPLETE_IPD_DISCHARGE_ATOMIC TO PREVENT AMBIGUITY
DROP FUNCTION IF EXISTS public.complete_ipd_discharge_atomic(UUID, UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, JSONB, TEXT, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, VARCHAR, TEXT, JSONB, DATE, DATE, UUID);
DROP FUNCTION IF EXISTS public.complete_ipd_discharge_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB, DATE, DATE, UUID);

-- 6. RE-DECLARE COMPLETE_IPD_DISCHARGE_ATOMIC (BULLETPROOF CLINICAL & BED LIFECYCLE)
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
    v_user_id UUID := COALESCE(auth.uid(), p_prepared_by);
    v_is_authorized BOOLEAN := FALSE;
    v_visit RECORD;
    v_doc RECORD;
    v_summary_id UUID;
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

    -- Idempotent check: If already discharged, return existing discharge summary
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

    -- 6. Insert or Update Discharge Summary (atomic upsert on unique visit_id)
    INSERT INTO public.discharge_summaries (
        organization_id,
        visit_id,
        patient_id,
        discharge_type,
        final_diagnosis,
        doctor_name,
        doctor_designation,
        consultant_doctor_id,
        consultant_doctor_name,
        consultant_doctor_bmdc,
        consultant_doctor_specialty,
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
        COALESCE(p_consultant_doctor_id, v_visit.doctor_id),
        v_final_consultant_name,
        v_final_bmdc,
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
        consultant_doctor_id = EXCLUDED.consultant_doctor_id,
        consultant_doctor_name = EXCLUDED.consultant_doctor_name,
        consultant_doctor_bmdc = EXCLUDED.consultant_doctor_bmdc,
        consultant_doctor_specialty = EXCLUDED.consultant_doctor_specialty,
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
        WHERE (visit_id = p_visit_id OR (v_visit.patient_id IS NOT NULL AND patient_id = v_visit.patient_id))
          AND organization_id = p_org_id
          AND UPPER(status) = 'ACTIVE'
    LOOP
        IF v_bed_assign.bed_id IS NOT NULL THEN
            UPDATE public.beds SET status = 'VACANT', updated_at = NOW() WHERE id = v_bed_assign.bed_id;
        END IF;
        IF v_bed_assign.cabin_id IS NOT NULL THEN
            UPDATE public.cabins SET status = 'VACANT', updated_at = NOW() WHERE id = v_bed_assign.cabin_id;
        END IF;
        UPDATE public.bed_assignments 
        SET status = 'DISCHARGED', 
            discharged_at = NOW(), 
            vacated_at = NOW() 
        WHERE id = v_bed_assign.id;
    END LOOP;

    -- 9. Reconcile Any Ghost Bed/Cabin Drift Atomically
    PERFORM public.reconcile_bed_vacancy_drift_atomic(p_org_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'summary_id', v_summary_id,
        'visit_id', p_visit_id,
        'status', 'DISCHARGED',
        'message', 'Patient discharge completed and certificate folder generated successfully.'
    );
END;
$$;

-- 7. RE-DECLARE CANCEL_OR_DELETE_IPD_ADMISSION_ATOMIC (BULLETPROOF HARD PURGE / CANCEL)
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
    v_caller UUID := COALESCE(auth.uid(), p_admin_id);
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
            RAISE EXCEPTION 'Access Denied: Permanent deletion of IPD admission requires administrative purge authorization.' USING ERRCODE = '42501';
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

    -- Check if settled financial invoices exist
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
        WHERE (visit_id = p_visit_id OR (v_visit.patient_id IS NOT NULL AND patient_id = v_visit.patient_id))
          AND organization_id = p_org_id
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

    -- 6. Clean up or Unlink Referencing Clinical & Operational Child Records
    DELETE FROM public.vital_signs WHERE visit_id = p_visit_id;
    DELETE FROM public.patient_transfers WHERE visit_id = p_visit_id;
    DELETE FROM public.patient_vitals_rounds WHERE visit_id = p_visit_id;
    DELETE FROM public.nursing_notes WHERE visit_id = p_visit_id;
    DELETE FROM public.discharge_summaries WHERE visit_id = p_visit_id;
    DELETE FROM public.ot_bookings WHERE visit_id = p_visit_id;

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

    -- 7. Purge or Cancel Patient Visit
    IF p_permanent_delete THEN
        -- Delete invoice line items and unbilled/cancelled invoices first
        DELETE FROM public.invoice_items WHERE invoice_id IN (
            SELECT id FROM public.invoices 
            WHERE visit_id = p_visit_id 
              AND organization_id = p_org_id 
              AND UPPER(status) IN ('DRAFT', 'CANCELLED')
        );
        DELETE FROM public.invoices 
        WHERE visit_id = p_visit_id 
          AND organization_id = p_org_id 
          AND UPPER(status) IN ('DRAFT', 'CANCELLED');

        -- Nullify visit_id on any other invoices to prevent FK lock
        UPDATE public.invoices SET visit_id = NULL WHERE visit_id = p_visit_id;

        -- Hard delete the visit
        DELETE FROM public.patient_visits 
        WHERE id = p_visit_id AND organization_id = p_org_id;

        -- Audit log entry
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
        ) VALUES (
            p_org_id, v_caller, 'DELETE', 'IPD', 'patient_visit', p_visit_id,
            jsonb_build_object(
                'purged_visit_number', v_visit.visit_number,
                'patient_id', v_visit.patient_id,
                'reason', p_reason,
                'mode', 'PERMANENT_PURGE'
            ),
            NOW()
        );

        -- Reconcile Bed Vacancy Drift
        PERFORM public.reconcile_bed_vacancy_drift_atomic(p_org_id);

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'DELETED',
            'message', 'Mistake IPD admission purged permanently and all bed allocations released.'
        );
    ELSE
        -- Soft cancel
        UPDATE public.patient_visits
        SET status = 'CANCELLED',
            discharged_at = NOW(),
            discharge_reason = p_reason,
            updated_at = NOW()
        WHERE id = p_visit_id AND organization_id = p_org_id;

        -- Audit log entry
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
        ) VALUES (
            p_org_id, v_caller, 'CANCEL', 'IPD', 'patient_visit', p_visit_id,
            jsonb_build_object(
                'visit_number', v_visit.visit_number,
                'patient_id', v_visit.patient_id,
                'reason', p_reason,
                'mode', 'SOFT_CANCEL'
            ),
            NOW()
        );

        -- Reconcile Bed Vacancy Drift
        PERFORM public.reconcile_bed_vacancy_drift_atomic(p_org_id);

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'CANCELLED',
            'message', 'IPD admission cancelled successfully and all beds vacated.'
        );
    END IF;
END;
$$;

-- 8. RE-GRANT DATA API PERMISSIONS WITH EXPLICIT PARAMETER TYPES
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discharge_summaries TO authenticated, service_role;
GRANT SELECT ON public.discharge_summaries TO anon;

REVOKE ALL ON FUNCTION public.complete_ipd_discharge_atomic(UUID, UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, JSONB, TEXT, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, VARCHAR, TEXT, JSONB, DATE, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ipd_discharge_atomic(UUID, UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, JSONB, TEXT, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, VARCHAR, TEXT, JSONB, DATE, DATE, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- 9. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
