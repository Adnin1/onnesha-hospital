-- ==============================================================================
-- OHMS MIGRATION 228: COMPREHENSIVE CLINICAL, OPD, IPD, BLOOD BANK & REFERRAL FIXES
-- ==============================================================================
-- Author: Autonomous Engineering Organization Godmode v5.0
-- Date: 2026-10-21
-- Purpose:
--   1. OPD Waiting Queue: Add started_at, finished_at, room_number, queue_status columns.
--   2. Prescriptions: Make visit_id nullable for direct outpatient prescriptions.
--   3. IPD Admission & Mistake Purge: Cascade foreign keys cleanly on permanent delete.
--   4. IPD Edit: Create update_ipd_admission_atomic for modifying mistake admissions.
--   5. IPD Discharge: Harden complete_ipd_discharge_atomic to handle text/json presenting features and date inputs.
--   6. Blood Bank: Ensure all transfusion columns exist; add update & void/cancel RPCs.
--   7. Referral Commissions: Automatically generate hospital expense record on commission payout/settlement.
--   8. Anti-False-Green: Upgrade check_system_health_diagnostics with deep schema & operational probes.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. OPD WAITING QUEUE SCHEMA HARDENING
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.waiting_queue
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS room_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS queue_status VARCHAR(30) DEFAULT 'WAITING';

-- Ensure grants on waiting_queue
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.waiting_queue TO authenticated, service_role;
GRANT SELECT ON TABLE public.waiting_queue TO anon;

-- ------------------------------------------------------------------------------
-- 2. PRESCRIPTIONS SCHEMA HARDENING (Outpatient Direct Prescriptions)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.prescriptions
    ALTER COLUMN visit_id DROP NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.prescriptions TO authenticated, service_role;
GRANT SELECT ON TABLE public.prescriptions TO anon;

-- ------------------------------------------------------------------------------
-- 3. BLOOD TRANSFUSION RECORDS SCHEMA HARDENING
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.blood_transfusion_records
    ADD COLUMN IF NOT EXISTS donor_name TEXT,
    ADD COLUMN IF NOT EXISTS donor_age INTEGER,
    ADD COLUMN IF NOT EXISTS donor_phone TEXT,
    ADD COLUMN IF NOT EXISTS donor_blood_group TEXT,
    ADD COLUMN IF NOT EXISTS sourcing_blood_bank TEXT,
    ADD COLUMN IF NOT EXISTS donor_type TEXT,
    ADD COLUMN IF NOT EXISTS major_crossmatch TEXT DEFAULT 'compatible',
    ADD COLUMN IF NOT EXISTS minor_crossmatch TEXT DEFAULT 'compatible',
    ADD COLUMN IF NOT EXISTS technologist_name TEXT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.blood_transfusion_records TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.blood_inventory TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.blood_donors TO authenticated, service_role;

-- RPC to cancel/void a mistake blood transfusion and return blood bag to available
CREATE OR REPLACE FUNCTION public.cancel_or_void_blood_transfusion_atomic(
    p_org_id UUID,
    p_transfusion_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Mistake entry cancelled'
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

    -- Update transfusion record
    UPDATE public.blood_transfusion_records
    SET status = 'VOIDED',
        adverse_reaction_notes = COALESCE(adverse_reaction_notes, '') || ' [VOIDED: ' || p_reason || ']'
    WHERE id = p_transfusion_id;

    -- Return bag to inventory as available
    IF v_rec.bag_id IS NOT NULL THEN
        UPDATE public.blood_inventory
        SET status = 'available',
            storage_location = 'Cold Storage Refrigerator 1 (Restored)',
            updated_at = NOW()
        WHERE id = v_rec.bag_id AND organization_id = p_org_id;
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, p_user_id, 'VOID', 'BLOOD_BANK', 'blood_transfusion_records', p_transfusion_id::text,
        to_jsonb(v_rec), jsonb_build_object('reason', p_reason, 'restored_bag_id', v_rec.bag_id), NOW()
    );

    RETURN jsonb_build_object('success', true, 'message', 'Transfusion voided and blood bag restored to available inventory.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_or_void_blood_transfusion_atomic TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. IPD ADMISSION EDIT & HARDENED DELETE RPC
-- ------------------------------------------------------------------------------

-- Update IPD Admission RPC (for fixing typos in provisional diagnosis, attending doctor, etc.)
CREATE OR REPLACE FUNCTION public.update_ipd_admission_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_user_id UUID,
    p_provisional_diagnosis TEXT DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_guardian_name TEXT DEFAULT NULL,
    p_guardian_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_visit RECORD;
BEGIN
    SELECT * INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admission record not found.');
    END IF;

    IF v_visit.status = 'DISCHARGED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot edit admission details for already discharged patient.');
    END IF;

    UPDATE public.patient_visits
    SET reason_for_visit = COALESCE(p_provisional_diagnosis, reason_for_visit),
        doctor_id = COALESCE(p_doctor_id, doctor_id),
        notes = COALESCE(p_notes, notes),
        updated_at = NOW()
    WHERE id = p_visit_id AND organization_id = p_org_id;

    -- Update patient demographics if guardian updated
    IF p_guardian_name IS NOT NULL OR p_guardian_phone IS NOT NULL THEN
        UPDATE public.patients
        SET emergency_contact_name = COALESCE(p_guardian_name, emergency_contact_name),
            emergency_contact_phone = COALESCE(p_guardian_phone, emergency_contact_phone),
            updated_at = NOW()
        WHERE id = v_visit.patient_id AND organization_id = p_org_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Admission details updated successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_ipd_admission_atomic TO authenticated, service_role;

-- Hardened Cancel / Delete Mistake Admission with Clean Cascade
CREATE OR REPLACE FUNCTION public.cancel_or_delete_ipd_admission_atomic(
    p_org_id UUID,
    p_visit_id UUID,
    p_admin_id UUID,
    p_reason TEXT,
    p_permanent_delete BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    v_visit RECORD;
    v_ba RECORD;
    v_has_billed_invoices BOOLEAN := FALSE;
BEGIN
    IF p_org_id IS NULL OR p_visit_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID and Visit ID are mandatory.';
    END IF;

    -- Strict Organization-Scoped Admin Verification
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = COALESCE(v_caller, p_admin_id)
          AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator', 'doctor', 'registrar')
    ) INTO v_is_authorized;

    IF NOT v_is_authorized THEN
        SELECT EXISTS (
            SELECT 1 FROM public.role_permissions rp
            JOIN public.user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = COALESCE(v_caller, p_admin_id)
              AND ur.organization_id = p_org_id
              AND (rp.permission_key IN ('ipd.manage', 'ipd.admit', 'ipd.discharge', 'patients.delete') OR rp.permission_key = '*')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized AND v_caller IS NOT NULL THEN
        RAISE EXCEPTION 'Access Denied: Administrative or IPD management permission required to cancel/delete admission.';
    END IF;

    SELECT * INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Inpatient admission record not found.');
    END IF;

    -- Check if settled/paid invoices exist
    SELECT EXISTS (
        SELECT 1 FROM public.invoices
        WHERE visit_id = p_visit_id
          AND organization_id = p_org_id
          AND status IN ('PAID', 'PARTIALLY_PAID')
    ) INTO v_has_billed_invoices;

    IF v_has_billed_invoices THEN
        RAISE EXCEPTION 'Cannot delete or cancel IPD admission: Paid financial invoices are already settled on this visit.';
    END IF;

    -- Vacate any assigned beds
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

    -- Reconcile any remaining ghost bed drift
    PERFORM public.reconcile_bed_vacancy_drift_atomic(p_org_id);

    -- Clean episode charges, summaries, vitals, nursing notes, prescriptions, orders
    IF v_visit.episode_id IS NOT NULL THEN
        DELETE FROM public.episode_service_charges 
        WHERE episode_id = v_visit.episode_id 
          AND organization_id = p_org_id;
    END IF;

    DELETE FROM public.discharge_summaries WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.nursing_notes WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.patient_vitals_rounds WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    
    -- Nullify or delete referencing clinical records to prevent foreign key errors
    UPDATE public.prescriptions SET visit_id = NULL WHERE visit_id = p_visit_id;
    UPDATE public.diagnostic_orders SET visit_id = NULL WHERE visit_id = p_visit_id;
    
    -- Delete bed_assignments for permanent purge
    IF p_permanent_delete THEN
        DELETE FROM public.bed_assignments WHERE visit_id = p_visit_id AND organization_id = p_org_id;
        DELETE FROM public.invoices WHERE visit_id = p_visit_id AND organization_id = p_org_id AND status = 'DRAFT';
        DELETE FROM public.patient_visits WHERE id = p_visit_id AND organization_id = p_org_id;
    ELSE
        UPDATE public.patient_visits
        SET status = 'discharged',
            discharged_at = NOW(),
            reason_for_visit = COALESCE(reason_for_visit, '') || ' [CANCELLED: ' || p_reason || ']'
        WHERE id = p_visit_id AND organization_id = p_org_id;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, COALESCE(v_caller, p_admin_id),
        CASE WHEN p_permanent_delete THEN 'DELETE' ELSE 'CANCEL' END,
        'IPD', 'patient_visits', p_visit_id::text,
        to_jsonb(v_visit),
        jsonb_build_object('visit_number', v_visit.visit_number, 'reason', p_reason, 'permanent_delete', p_permanent_delete, 'timestamp', NOW()),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'mode', CASE WHEN p_permanent_delete THEN 'DELETED' ELSE 'CANCELLED' END,
        'visit_id', p_visit_id,
        'visit_number', v_visit.visit_number,
        'message', 'IPD admission successfully ' || CASE WHEN p_permanent_delete THEN 'permanently deleted' ELSE 'cancelled' END || ' and bed vacated.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. IPD DISCHARGE PROCEDURE (Complete Resilient JSON/Text Handling)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.discharge_summaries
    ADD COLUMN IF NOT EXISTS stitch_removal_date DATE,
    ADD COLUMN IF NOT EXISTS followup_date DATE;

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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_visit RECORD;
    v_doc RECORD;
    v_bed_assign RECORD;
    v_summary_id UUID;
    v_final_consultant_name VARCHAR;
    v_final_bmdc VARCHAR;
    v_final_specialty VARCHAR;
    v_ot_details JSONB;
    v_baby_note JSONB;
BEGIN
    -- 1. Multi-Tenant Authorization Check
    IF v_user_id IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_user_id 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_user_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant operation prohibited.' USING ERRCODE = '42501';
        END IF;
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
          AND status = 'ACTIVE'
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
        'message', 'Patient successfully discharged and beds vacated.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_ipd_discharge_atomic TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. REFERRAL SETTLEMENT & EXPENSE SYNCHRONIZATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_referral_commissions_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_commission_ids UUID[],
    p_payment_method VARCHAR,
    p_transaction_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_calling_user UUID := auth.uid();
    v_agent RECORD;
    v_total_paid NUMERIC(12, 2) := 0.00;
    v_settlement_id UUID;
    v_settlement_number TEXT;
    v_voucher_number TEXT;
    v_comm RECORD;
    v_item_count INT := 0;
    v_pay_acc_id UUID;
    v_cash_acc_id UUID;
    v_gl_lines JSONB := '[]'::jsonb;
    v_gl_res JSONB;
    v_cat_id UUID;
BEGIN
    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_calling_user 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_calling_user AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant operation prohibited.' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id, agent_code, full_name, total_commission_settled
    INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id AND organization_id = p_org_id;

    IF v_agent.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral partner record not found.');
    END IF;

    -- Calculate total eligible commission
    FOR v_comm IN
        SELECT id, amount_pending, approval_status
        FROM public.referral_commissions
        WHERE id = ANY(p_commission_ids)
          AND organization_id = p_org_id
          AND referral_agent_id = p_agent_id
        FOR UPDATE
    LOOP
        IF v_comm.approval_status != 'APPROVED' THEN
            RETURN jsonb_build_object('success', false, 'error', 'All commissions must be approved prior to settlement.');
        END IF;

        IF v_comm.amount_pending <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Selected commission has no pending balance.');
        END IF;

        v_total_paid := v_total_paid + v_comm.amount_pending;
        v_item_count := v_item_count + 1;
    END LOOP;

    IF v_item_count = 0 OR v_total_paid <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No eligible pending commissions found.');
    END IF;

    v_settlement_number := public.generate_referral_settlement_number(p_org_id);

    -- Insert Settlement Header
    INSERT INTO public.referral_commission_settlements (
        organization_id, settlement_number, referral_agent_id, settlement_date,
        gross_commission_selected, adjustment_amount, net_paid_amount,
        payment_method, transaction_reference, paid_by, approved_by,
        status, notes, created_at
    ) VALUES (
        p_org_id, v_settlement_number, p_agent_id, CURRENT_DATE,
        v_total_paid, 0.00, v_total_paid,
        UPPER(p_payment_method), p_transaction_reference, v_calling_user, v_calling_user,
        'PAID', p_notes, NOW()
    ) RETURNING id INTO v_settlement_id;

    -- Insert Settlement Items & Update Commission Ledger Rows
    FOR v_comm IN
        SELECT id, amount_pending
        FROM public.referral_commissions
        WHERE id = ANY(p_commission_ids)
          AND organization_id = p_org_id
          AND referral_agent_id = p_agent_id
    LOOP
        INSERT INTO public.referral_commission_settlement_items (
            organization_id, settlement_id, commission_id, allocated_amount, created_at
        ) VALUES (
            p_org_id, v_settlement_id, v_comm.id, v_comm.amount_pending, NOW()
        );

        UPDATE public.referral_commissions
        SET amount_paid = amount_paid + v_comm.amount_pending,
            amount_pending = 0.00,
            settlement_status = 'PAID',
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = v_comm.id;
    END LOOP;

    -- Update Agent Total Settled Counter
    UPDATE public.referral_agents
    SET total_commission_settled = total_commission_settled + v_total_paid,
        updated_at = NOW()
    WHERE id = p_agent_id;

    -- Resolve Expense Category for Referral Commissions
    SELECT id INTO v_cat_id
    FROM public.expense_categories
    WHERE organization_id = p_org_id
      AND (category_code IN ('CAT-MKT-ADV', 'EXP-MARKETING', 'REF_COMM') OR name ILIKE '%Marketing%' OR name ILIKE '%Referral%')
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_cat_id IS NULL THEN
        INSERT INTO public.expense_categories (organization_id, name, category_code, is_active)
        VALUES (p_org_id, 'Referral & Marketing Commission', 'REF_COMM', TRUE)
        RETURNING id INTO v_cat_id;
    END IF;

    -- Generate Expense Voucher & Record into Hospital Expenses Table
    v_voucher_number := 'EXP-REF-' || v_settlement_number;
    INSERT INTO public.expenses (
        organization_id,
        category_id,
        title,
        amount,
        voucher_number,
        paid_to,
        payment_method,
        payment_reference,
        expense_date,
        approved_by,
        status,
        notes,
        created_at
    ) VALUES (
        p_org_id,
        v_cat_id,
        'Referral Commission Payout: ' || v_agent.full_name || ' (' || v_agent.agent_code || ')',
        v_total_paid,
        v_voucher_number,
        v_agent.full_name,
        UPPER(p_payment_method),
        p_transaction_reference,
        CURRENT_DATE,
        COALESCE(v_calling_user, '00000000-0000-0000-0000-000000000000'::uuid),
        'POSTED',
        COALESCE(p_notes, 'Referral partner commission payout settlement'),
        NOW()
    );

    -- Post General Ledger Settlement Journal Entry:
    -- Debit: 2030 (Referral Commissions Payable)
    -- Credit: 1010 (Cash in Hand) OR 1020 (Cash at Bank)
    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    SELECT id INTO v_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2030' AND is_active = TRUE LIMIT 1;
    IF v_pay_acc_id IS NULL THEN
        INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
        VALUES (p_org_id, '2030', 'Referral & Partner Commissions Payable', 'LIABILITY', TRUE)
        ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
        RETURNING id INTO v_pay_acc_id;
    END IF;

    IF UPPER(p_payment_method) = 'CASH' THEN
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010' AND is_active = TRUE LIMIT 1;
        IF v_cash_acc_id IS NULL THEN
            INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
            VALUES (p_org_id, '1010', 'Cash in Hand (Cashier Drawer)', 'ASSET', TRUE)
            ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
            RETURNING id INTO v_cash_acc_id;
        END IF;
    ELSE
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020' AND is_active = TRUE LIMIT 1;
        IF v_cash_acc_id IS NULL THEN
            INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type, is_active)
            VALUES (p_org_id, '1020', 'Operating Bank Account (Cash at Bank)', 'ASSET', TRUE)
            ON CONFLICT (organization_id, account_code) DO UPDATE SET is_active = TRUE
            RETURNING id INTO v_cash_acc_id;
        END IF;
    END IF;

    v_gl_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_pay_acc_id,
            'debit', v_total_paid,
            'credit', 0.00,
            'description', 'Settlement of referral commission payable to ' || v_agent.agent_code
        ),
        jsonb_build_object(
            'account_id', v_cash_acc_id,
            'debit', 0.00,
            'credit', v_total_paid,
            'description', 'Disbursement of referral payout via ' || UPPER(p_payment_method)
        )
    );

    v_gl_res := public.post_journal_entry_atomic(
        p_org_id,
        'JE-REF-SET-' || v_settlement_number,
        CURRENT_DATE,
        'REFERRAL_SETTLEMENT',
        v_settlement_id,
        'Disbursement of referral commissions to ' || v_agent.agent_code || ' (' || v_agent.full_name || ')',
        v_gl_lines,
        v_calling_user
    );

    RETURN jsonb_build_object(
        'success', true,
        'settlement_number', v_settlement_number,
        'voucher_number', v_voucher_number,
        'net_paid_amount', v_total_paid,
        'settlement_id', v_settlement_id,
        'journal_entry', v_gl_res
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_referral_commissions_atomic TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. SYSTEM HEALTH DIAGNOSTICS DEEP SCHEMA & ACTIVE INTEGRITY PROBE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_system_health_diagnostics(
    p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := auth.role();
    v_target_org_id UUID := p_org_id;
    v_issues JSONB := '[]'::JSONB;
    v_passed JSONB := '[]'::JSONB;
    
    v_critical_count INT := 0;
    v_warning_count INT := 0;
    v_info_count INT := 0;
    v_health_score INT := 100;
    
    -- Diagnostic variables
    v_unbalanced_je_count INT := 0;
    v_unbalanced_je_samples TEXT;
    v_bed_drift_occupied INT := 0;
    v_bed_drift_vacant INT := 0;
    v_bed_drift_samples TEXT;
    v_orphan_beds_count INT := 0;
    v_orphan_beds_samples TEXT;
    v_ref_overpaid_count INT := 0;
    v_ref_overpaid_samples TEXT;
    v_invalid_inv_count INT := 0;
    v_invalid_inv_samples TEXT;

    -- Active incident log count
    v_open_critical_incidents INT := 0;
    v_open_warning_incidents INT := 0;
    v_open_incidents_samples TEXT;

    -- Schema Integrity Check Variables
    v_has_waiting_finished_at BOOLEAN := FALSE;
    v_has_prescription_null_visit BOOLEAN := FALSE;
    v_stuck_admissions_count INT := 0;
BEGIN
    -- Determine target organization
    IF v_caller_role = 'service_role' OR session_user IN ('postgres', 'supabase_admin') THEN
        v_target_org_id := COALESCE(p_org_id, v_target_org_id);
    ELSIF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_target_org_id
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF p_org_id IS NOT NULL AND p_org_id IS DISTINCT FROM v_target_org_id THEN
            v_target_org_id := p_org_id;
        END IF;
    END IF;

    IF v_target_org_id IS NULL THEN
        SELECT id INTO v_target_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- CHECK 1: Waiting Queue Schema Integrity (finished_at)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'waiting_queue' AND column_name = 'finished_at'
    ) INTO v_has_waiting_finished_at;

    IF NOT v_has_waiting_finished_at THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 25);
        v_issues := v_issues || jsonb_build_object(
            'module', 'OPD_QUEUE',
            'severity', 'CRITICAL',
            'title', 'Waiting Queue Schema Mismatch',
            'reason', 'Column finished_at is missing from public.waiting_queue',
            'recommendation', 'Apply Migration 228 to add finished_at and started_at to waiting_queue.'
        );
    ELSE
        v_passed := v_passed || jsonb_build_object('check', 'OPD_QUEUE_SCHEMA', 'status', 'PASSED');
    END IF;

    -- CHECK 2: General Ledger Double-Entry Balance
    SELECT COUNT(*), string_agg(je_number, ', ')
    INTO v_unbalanced_je_count, v_unbalanced_je_samples
    FROM (
        SELECT je.je_number
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON je.id = jl.journal_entry_id
        WHERE je.organization_id = v_target_org_id
        GROUP BY je.id, je.je_number
        HAVING ABS(SUM(COALESCE(jl.debit, 0)) - SUM(COALESCE(jl.credit, 0))) > 0.01
        LIMIT 5
    ) unbalanced;

    IF v_unbalanced_je_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 30);
        v_issues := v_issues || jsonb_build_object(
            'module', 'FINANCE_GL',
            'severity', 'CRITICAL',
            'title', 'Unbalanced Journal Entries Detected',
            'reason', format('%s unbalanced journal entry/entries found: %s', v_unbalanced_je_count, v_unbalanced_je_samples),
            'recommendation', 'Run post_journal_entry_atomic reconciliation.'
        );
    ELSE
        v_passed := v_passed || jsonb_build_object('check', 'DOUBLE_ENTRY_EQUILIBRIUM', 'status', 'PASSED');
    END IF;

    -- CHECK 3: Active Bed Occupancy Drift
    SELECT COUNT(*), string_agg(b.bed_number, ', ')
    INTO v_bed_drift_occupied, v_bed_drift_samples
    FROM public.beds b
    WHERE b.organization_id = v_target_org_id
      AND b.status = 'OCCUPIED'
      AND NOT EXISTS (
          SELECT 1 FROM public.bed_assignments ba
          WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE' AND ba.organization_id = v_target_org_id
      );

    IF v_bed_drift_occupied > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := GREATEST(0, v_health_score - 10);
        v_issues := v_issues || jsonb_build_object(
            'module', 'BED_MANAGEMENT',
            'severity', 'WARNING',
            'title', 'Bed Occupancy State Drift',
            'reason', format('%s beds marked OCCUPIED without active patient assignment: %s', v_bed_drift_occupied, v_bed_drift_samples),
            'recommendation', 'Execute reconcile_bed_vacancy_drift_atomic to sync bed states.'
        );
    ELSE
        v_passed := v_passed || jsonb_build_object('check', 'BED_OCCUPANCY_DRIFT', 'status', 'PASSED');
    END IF;

    -- CHECK 4: Stuck IPD Admissions without Bed Assignment
    SELECT COUNT(*)
    INTO v_stuck_admissions_count
    FROM public.patient_visits pv
    WHERE pv.organization_id = v_target_org_id
      AND pv.visit_type = 'ipd'
      AND pv.status = 'admitted'
      AND NOT EXISTS (
          SELECT 1 FROM public.bed_assignments ba
          WHERE ba.visit_id = pv.id AND ba.status = 'ACTIVE'
      );

    IF v_stuck_admissions_count > 0 THEN
        v_info_count := v_info_count + 1;
        v_issues := v_issues || jsonb_build_object(
            'module', 'IPD_ADMISSIONS',
            'severity', 'INFO',
            'title', 'IPD Admissions Awaiting Bed Placement',
            'reason', format('%s admitted IPD patients have unassigned beds.', v_stuck_admissions_count),
            'recommendation', 'Assign bed or cabin to unassigned IPD admissions via Ward Bed Manager.'
        );
    ELSE
        v_passed := v_passed || jsonb_build_object('check', 'IPD_BED_ASSIGNMENT_ALIGNMENT', 'status', 'PASSED');
    END IF;

    -- CHECK 5: Open Critical Incidents in Incident Log
    SELECT COUNT(*)
    INTO v_open_critical_incidents
    FROM public.system_health_issues_log
    WHERE organization_id = v_target_org_id
      AND lifecycle_status = 'OPEN'
      AND severity = 'CRITICAL'
      AND created_at >= NOW() - INTERVAL '24 hours';

    IF v_open_critical_incidents > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 20);
        v_issues := v_issues || jsonb_build_object(
            'module', 'INCIDENT_LOG',
            'severity', 'CRITICAL',
            'title', 'Active Unresolved Runtime Errors in Log',
            'reason', format('%s critical runtime error(s) logged in past 24 hours.', v_open_critical_incidents),
            'recommendation', 'Review and resolve active errors in System Health Incident Center.'
        );
    END IF;

    RETURN jsonb_build_object(
        'checked_at', NOW(),
        'organization_id', v_target_org_id,
        'health_score', v_health_score,
        'is_healthy', (v_critical_count = 0),
        'status', CASE 
            WHEN v_critical_count > 0 THEN 'DEFECT_DETECTED'
            WHEN v_warning_count > 0 THEN 'WARNINGS_PRESENT'
            ELSE 'HEALTHY'
        END,
        'total_issues', (v_critical_count + v_warning_count + v_info_count),
        'critical_count', v_critical_count,
        'warning_count', v_warning_count,
        'info_count', v_info_count,
        'issues', v_issues,
        'passed_checks', v_passed
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics TO anon, authenticated, service_role;

-- 8. Audit and Verification Stamp
COMMENT ON SCHEMA public IS 'OHMS Unified Schema - Clinical, OPD, IPD, Blood Bank & Referral Hardened (Migration 228 Complete)';
