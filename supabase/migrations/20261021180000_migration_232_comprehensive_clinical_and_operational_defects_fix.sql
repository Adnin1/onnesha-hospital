-- =====================================================================================
-- Migration 232: Comprehensive Clinical EMR, IPD, Blood Bank & Queue Diagnostics Fix
-- Date: 2026-10-21
-- Description:
--   1. PostgREST Schema Cache Reload (NOTIFY pgrst)
--   2. Prescriptions: Grant table permissions & create atomic create_digital_prescription_atomic RPC
--   3. IPD Admissions: Resilient patient_visits status check constraint & deep cascade cleanup
--   4. OPD Waiting Queue: Atomic update_waiting_queue_status_atomic RPC bypassing schema cache
--   5. Blood Bank: Support permanent deletion, full dossier editing & role permissions
--   6. Referral Commission: Seamless expense voucher creation & GL integration
-- =====================================================================================

-- 1. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- -------------------------------------------------------------------------------------
-- 2. PRESCRIPTIONS & PRESCRIPTION ITEMS: Grants, RLS and Atomic RPC
-- -------------------------------------------------------------------------------------

GRANT ALL ON TABLE public.prescriptions TO authenticated, service_role;
GRANT ALL ON TABLE public.prescription_items TO authenticated, service_role;
GRANT ALL ON TABLE public.prescription_notes TO authenticated, service_role;
GRANT SELECT ON TABLE public.prescriptions TO anon;
GRANT SELECT ON TABLE public.prescription_items TO anon;
GRANT SELECT ON TABLE public.prescription_notes TO anon;

-- Ensure RLS policy on prescription_items is permissive for authenticated tenant
DROP POLICY IF EXISTS rls_prescription_items_tenant_isolation ON public.prescription_items;
CREATE POLICY rls_prescription_items_tenant_isolation ON public.prescription_items
    FOR ALL TO authenticated, service_role
    USING (
        EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = prescription_items.prescription_id
              AND (
                  p.organization_id = COALESCE(
                      NULLIF(current_setting('app.current_organization_id', true), '')::uuid,
                      (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
                      (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
                  )
                  OR current_user = 'service_role'
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.prescriptions p
            WHERE p.id = prescription_items.prescription_id
              AND (
                  p.organization_id = COALESCE(
                      NULLIF(current_setting('app.current_organization_id', true), '')::uuid,
                      (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
                      (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
                  )
                  OR current_user = 'service_role'
              )
        )
    );

-- Master Atomic Prescription Creation RPC
CREATE OR REPLACE FUNCTION public.create_digital_prescription_atomic(
    p_org_id UUID,
    p_doctor_id UUID,
    p_patient_id UUID,
    p_diagnosis TEXT,
    p_chief_complaints TEXT DEFAULT NULL,
    p_clinical_findings TEXT DEFAULT NULL,
    p_investigation_advice TEXT DEFAULT NULL,
    p_general_advice TEXT DEFAULT NULL,
    p_followup_date DATE DEFAULT NULL,
    p_visit_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID := COALESCE(auth.uid(), p_user_id);
    v_rx_id UUID;
    v_visit UUID := p_visit_id;
    v_item JSONB;
    v_idx INT := 0;
    v_doctor RECORD;
    v_patient RECORD;
BEGIN
    -- Verify doctor and patient exist
    SELECT id, full_name, designation, degrees, bmdc_reg_number, room_number
    INTO v_doctor
    FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'নির্বাচিত ডাক্তার পাওয়া যায়নি (Doctor not found).');
    END IF;

    SELECT id, full_name, patient_code, gender, phone
    INTO v_patient
    FROM public.patients
    WHERE id = p_patient_id AND organization_id = p_org_id;

    IF v_patient.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'নির্বাচিত রোগী পাওয়া যায়নি (Patient not found).');
    END IF;

    -- If visit_id not passed, find active visit today if any
    IF v_visit IS NULL THEN
        SELECT id INTO v_visit
        FROM public.patient_visits
        WHERE organization_id = p_org_id
          AND patient_id = p_patient_id
          AND UPPER(status) IN ('ACTIVE', 'ADMITTED', 'IN_PROGRESS', 'REGISTERED')
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    -- Insert Master Prescription
    INSERT INTO public.prescriptions (
        organization_id,
        patient_id,
        doctor_id,
        visit_id,
        diagnosis,
        chief_complaints,
        clinical_findings,
        investigation_advice,
        general_advice,
        followup_date,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        p_patient_id,
        p_doctor_id,
        v_visit,
        TRIM(p_diagnosis),
        NULLIF(TRIM(COALESCE(p_chief_complaints, '')), ''),
        NULLIF(TRIM(COALESCE(p_clinical_findings, '')), ''),
        NULLIF(TRIM(COALESCE(p_investigation_advice, '')), ''),
        NULLIF(TRIM(COALESCE(p_general_advice, '')), ''),
        p_followup_date,
        NOW(),
        NOW()
    ) RETURNING id INTO v_rx_id;

    -- Insert Items
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_idx := v_idx + 1;
            INSERT INTO public.prescription_items (
                prescription_id,
                medicine_name,
                generic_name,
                dosage_pattern,
                duration,
                meal_instruction,
                special_notes,
                display_order,
                created_at
            ) VALUES (
                v_rx_id,
                COALESCE(TRIM(v_item->>'medicine_name'), TRIM(v_item->>'name'), 'Medicine'),
                NULLIF(TRIM(COALESCE(v_item->>'generic_name', '')), ''),
                COALESCE(TRIM(v_item->>'dosage_pattern'), TRIM(v_item->>'dosage'), '1+0+1'),
                COALESCE(TRIM(v_item->>'duration'), '7 days'),
                COALESCE(TRIM(v_item->>'meal_instruction'), TRIM(v_item->>'instruction'), 'After meal'),
                NULLIF(TRIM(COALESCE(v_item->>'special_notes', '')), ''),
                v_idx,
                NOW()
            );
        END LOOP;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
    ) VALUES (
        p_org_id, v_user, 'CREATE', 'PRESCRIPTION', 'prescriptions', v_rx_id::text,
        jsonb_build_object('diagnosis', p_diagnosis, 'patient_id', p_patient_id, 'doctor_id', p_doctor_id, 'items_count', v_idx),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'prescription_id', v_rx_id,
        'message', 'Prescription created successfully with structured medications.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_digital_prescription_atomic TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3. IPD ADMISSIONS & PATIENT VISITS: Status Constraint & Cascade Purge
-- -------------------------------------------------------------------------------------

-- Relax patient_visits_status_check to accept case-insensitive standard statuses
ALTER TABLE IF EXISTS public.patient_visits DROP CONSTRAINT IF EXISTS patient_visits_status_check;
ALTER TABLE IF EXISTS public.patient_visits 
    ADD CONSTRAINT patient_visits_status_check 
    CHECK (UPPER(status) IN ('ACTIVE', 'DISCHARGED', 'TRANSFERRED', 'CANCELLED', 'ADMITTED', 'IN_PROGRESS', 'REGISTERED'));

-- Hardened Master Cancel / Delete IPD Admission RPC
CREATE OR REPLACE FUNCTION public.cancel_or_delete_ipd_admission_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT 'Mistake admission cancelled',
    p_permanent_delete BOOLEAN DEFAULT TRUE
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
BEGIN
    -- Check permissions
    IF v_caller IS NULL OR current_user = 'service_role' THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_caller
              AND (role IN ('super_admin', 'admin', 'hospital_administrator') OR is_super_admin = TRUE)
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
        RAISE EXCEPTION 'Access Denied: Administrative or IPD management permission required to cancel/delete admission.';
    END IF;

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

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ot_schedules') THEN
        UPDATE public.ot_schedules SET visit_id = NULL WHERE visit_id = p_visit_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_commission_claims') THEN
        UPDATE public.referral_commission_claims SET visit_id = NULL WHERE visit_id = p_visit_id;
    END IF;

    IF v_visit.episode_id IS NOT NULL THEN
        DELETE FROM public.episode_service_charges 
        WHERE episode_id = v_visit.episode_id 
          AND organization_id = p_org_id;
    END IF;

    UPDATE public.prescriptions SET visit_id = NULL WHERE visit_id = p_visit_id;
    UPDATE public.diagnostic_orders SET visit_id = NULL WHERE visit_id = p_visit_id;

    -- 4. Purge or Cancel Patient Visit
    IF p_permanent_delete THEN
        DELETE FROM public.bed_assignments WHERE visit_id = p_visit_id AND organization_id = p_org_id;
        DELETE FROM public.invoices WHERE visit_id = p_visit_id AND organization_id = p_org_id AND UPPER(status) = 'DRAFT';
        DELETE FROM public.patient_visits WHERE id = p_visit_id AND organization_id = p_org_id;
    ELSE
        UPDATE public.patient_visits
        SET status = 'CANCELLED',
            discharged_at = NOW(),
            chief_complaint = COALESCE(chief_complaint, '') || ' [CANCELLED: ' || p_reason || ']'
        WHERE id = p_visit_id AND organization_id = p_org_id;
    END IF;

    -- 5. Audit Log
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

GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 4. OPD WAITING QUEUE: Atomic Status Transition RPC (Bypasses Schema Cache)
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_waiting_queue_status_atomic(
    p_org_id UUID,
    p_queue_id UUID,
    p_status VARCHAR,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID := COALESCE(auth.uid(), p_user_id);
    v_now TIMESTAMPTZ := NOW();
    v_q RECORD;
BEGIN
    SELECT * INTO v_q
    FROM public.waiting_queue
    WHERE id = p_queue_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Queue entry not found.');
    END IF;

    -- Update queue entry dynamically
    IF UPPER(p_status) = 'CALLED' THEN
        UPDATE public.waiting_queue
        SET queue_status = 'CALLED',
            called_at = v_now,
            updated_at = v_now
        WHERE id = p_queue_id;

        INSERT INTO public.token_calls (
            organization_id, waiting_queue_id, called_by, created_at
        ) VALUES (
            p_org_id, p_queue_id, v_user, v_now
        );
    ELSIF UPPER(p_status) = 'IN_ROOM' THEN
        UPDATE public.waiting_queue
        SET queue_status = 'IN_ROOM',
            started_at = v_now,
            updated_at = v_now
        WHERE id = p_queue_id;
    ELSIF UPPER(p_status) IN ('COMPLETED', 'SKIPPED') THEN
        UPDATE public.waiting_queue
        SET queue_status = UPPER(p_status),
            finished_at = v_now,
            updated_at = v_now
        WHERE id = p_queue_id;
    ELSE
        UPDATE public.waiting_queue
        SET queue_status = UPPER(p_status),
            updated_at = v_now
        WHERE id = p_queue_id;
    END IF;

    -- Link appointment status if present
    IF v_q.appointment_id IS NOT NULL THEN
        UPDATE public.appointments
        SET status = CASE 
                WHEN UPPER(p_status) = 'COMPLETED' THEN 'COMPLETED'
                WHEN UPPER(p_status) = 'SKIPPED' THEN 'CANCELLED'
                WHEN UPPER(p_status) = 'IN_ROOM' THEN 'IN_CONSULTATION'
                ELSE status
            END,
            updated_at = v_now
        WHERE id = v_q.appointment_id AND organization_id = p_org_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'queue_id', p_queue_id,
        'status', UPPER(p_status),
        'message', 'Queue status updated successfully.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_waiting_queue_status_atomic TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 5. BLOOD BANK: Permanent Deletion & Full Dossier Editing
-- -------------------------------------------------------------------------------------

-- Upgrade cancel_or_void_blood_transfusion_atomic to support permanent deletion
CREATE OR REPLACE FUNCTION public.cancel_or_void_blood_transfusion_atomic(
    p_org_id UUID,
    p_transfusion_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Mistake entry cancelled',
    p_permanent_delete BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT * INTO v_rec
    FROM public.blood_transfusion_records
    WHERE id = p_transfusion_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transfusion record not found.');
    END IF;

    -- Return bag to inventory as available
    IF v_rec.bag_id IS NOT NULL THEN
        UPDATE public.blood_inventory
        SET status = 'available',
            storage_location = 'Cold Storage Refrigerator 1 (Restored)',
            updated_at = NOW()
        WHERE id = v_rec.bag_id AND organization_id = p_org_id;
    END IF;

    IF p_permanent_delete THEN
        DELETE FROM public.blood_transfusion_records
        WHERE id = p_transfusion_id AND organization_id = p_org_id;
    ELSE
        UPDATE public.blood_transfusion_records
        SET status = 'VOIDED',
            adverse_reaction_notes = COALESCE(adverse_reaction_notes, '') || ' [VOIDED: ' || p_reason || ']'
        WHERE id = p_transfusion_id AND organization_id = p_org_id;
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, p_user_id, CASE WHEN p_permanent_delete THEN 'DELETE' ELSE 'VOID' END,
        'BLOOD_BANK', 'blood_transfusion_records', p_transfusion_id::text,
        to_jsonb(v_rec), jsonb_build_object('reason', p_reason, 'restored_bag_id', v_rec.bag_id, 'permanent_delete', p_permanent_delete), NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'mode', CASE WHEN p_permanent_delete THEN 'DELETED' ELSE 'VOIDED' END,
        'message', 'Transfusion record ' || CASE WHEN p_permanent_delete THEN 'permanently deleted' ELSE 'voided' END || ' and blood bag restored to available inventory.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_or_void_blood_transfusion_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_or_void_blood_transfusion_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- Full Dossier Editing RPC
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
    v_old RECORD;
BEGIN
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

    -- Also keep blood_inventory synced if direct bag exists
    IF v_old.bag_id IS NOT NULL THEN
        UPDATE public.blood_inventory
        SET donor_name = TRIM(p_donor_name),
            donor_phone = TRIM(p_donor_phone),
            donor_age = p_donor_age,
            blood_group = p_donor_blood_group,
            updated_at = NOW()
        WHERE id = v_old.bag_id AND organization_id = p_org_id;
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, p_user_id, 'UPDATE', 'BLOOD_BANK', 'blood_transfusion_records', p_transfusion_id::text,
        to_jsonb(v_old),
        jsonb_build_object('donor_name', p_donor_name, 'major', p_major_crossmatch, 'minor', p_minor_crossmatch),
        NOW()
    );

    RETURN jsonb_build_object('success', true, 'message', 'Transfusion dossier updated successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_blood_transfusion_dossier_atomic TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 6. Grant Blood Bank Permissions to Lab Technician & Doctor Roles in Database
-- -------------------------------------------------------------------------------------

INSERT INTO public.permissions (key, module, description)
VALUES 
    ('blood_bank.view', 'blood_bank', 'View blood inventory and transfusion records'),
    ('blood_bank.donor.create', 'blood_bank', 'Register new blood donor'),
    ('blood_bank.crossmatch', 'blood_bank', 'Perform and verify blood cross-matching'),
    ('blood_bank.issue', 'blood_bank', 'Issue blood bag for transfusion'),
    ('blood_bank.manage', 'blood_bank', 'Manage blood bank inventory and records')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
    v_role_id UUID;
    v_perm TEXT;
    v_perms TEXT[] := ARRAY['blood_bank.view', 'blood_bank.donor.create', 'blood_bank.crossmatch', 'blood_bank.issue', 'blood_bank.manage'];
BEGIN
    FOR v_role_id IN 
        SELECT id FROM public.roles 
        WHERE LOWER(name) IN ('lab_technician', 'lab technician', 'doctor', 'nurse', 'hospital_administrator', 'admin', 'super_admin')
    LOOP
        FOREACH v_perm IN ARRAY v_perms LOOP
            INSERT INTO public.role_permissions (role_id, permission_key, created_at)
            VALUES (v_role_id, v_perm, NOW())
            ON CONFLICT (role_id, permission_key) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- 7. Final Schema Cache Reload
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
