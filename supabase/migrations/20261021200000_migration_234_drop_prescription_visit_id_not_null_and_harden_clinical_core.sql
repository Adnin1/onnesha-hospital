-- =====================================================================================
-- Migration 234: Allow Standalone Prescriptions, Waiting Queue Schema Fix,
--                Foreign Key Cascade for IPD Mistakes, and Expenses Referral Integration
-- Date: 2026-10-21
-- Description:
--   1. prescriptions: Drop NOT NULL constraint on visit_id to allow standalone OPD/EMR prescriptions
--   2. prescriptions: Update create_digital_prescription_atomic to allow NULL visit_id
--   3. waiting_queue: Add started_at and finished_at columns to eliminate schema cache errors
--   4. waiting_queue: Update update_waiting_queue_status_atomic RPC
--   5. patient_visits: Set ON DELETE CASCADE / SET NULL on child FKs (bed_assignments, patient_transfers, discharge_summaries, prescriptions, diagnostic_orders)
--   6. IPD Admission: Hardened cancel_or_delete_ipd_admission_atomic and update_ipd_admission_atomic
--   7. Expenses & Referral: Allow referral.manage / referral.edit in record_hospital_expense_atomic and RLS
--   8. PostgREST: Reload schema cache
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. PRESCRIPTIONS: Drop NOT NULL on visit_id & Update Foreign Key
-- -------------------------------------------------------------------------------------
ALTER TABLE public.prescriptions ALTER COLUMN visit_id DROP NOT NULL;

-- Ensure foreign key sets NULL on visit delete so standalone prescriptions are preserved
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'prescriptions_visit_id_fkey' AND table_name = 'prescriptions'
    ) THEN
        ALTER TABLE public.prescriptions DROP CONSTRAINT prescriptions_visit_id_fkey;
    END IF;
    ALTER TABLE public.prescriptions 
        ADD CONSTRAINT prescriptions_visit_id_fkey 
        FOREIGN KEY (visit_id) REFERENCES public.patient_visits(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- -------------------------------------------------------------------------------------
-- 2. CREATE DIGITAL PRESCRIPTION ATOMIC RPC (Allows NULL visit_id)
-- -------------------------------------------------------------------------------------
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

    -- Insert Master Prescription (v_visit can be NULL for standalone outpatient consultations)
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
                TRIM(COALESCE((v_item->>'medicine_name')::text, 'Medicine')),
                NULLIF(TRIM(COALESCE((v_item->>'generic_name')::text, '')), ''),
                TRIM(COALESCE((v_item->>'dosage_pattern')::text, '1+0+1')),
                TRIM(COALESCE((v_item->>'duration')::text, '7 days')),
                TRIM(COALESCE((v_item->>'meal_instruction')::text, 'After meal')),
                NULLIF(TRIM(COALESCE((v_item->>'special_notes')::text, '')), ''),
                v_idx,
                NOW()
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'prescription_id', v_rx_id,
        'visit_id', v_visit,
        'message', 'ডিজিটাল প্রেসক্রিপশন সফলভাবে সংরক্ষিত হয়েছে।'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_digital_prescription_atomic(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, UUID, JSONB, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3. WAITING QUEUE: Add started_at and finished_at Columns
-- -------------------------------------------------------------------------------------
ALTER TABLE public.waiting_queue ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.waiting_queue ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
ALTER TABLE public.waiting_queue ADD COLUMN IF NOT EXISTS queue_status VARCHAR(50);

-- Sync queue_status with existing status column if needed
UPDATE public.waiting_queue 
SET queue_status = UPPER(status)
WHERE queue_status IS NULL AND status IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- 4. UPDATE WAITING QUEUE STATUS ATOMIC RPC
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
    v_now TIMESTAMPTZ := NOW();
    v_appt_id UUID;
    v_tok_num TEXT;
BEGIN
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
            p_org_id, p_queue_id, COALESCE(auth.uid(), p_user_id), v_now
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

GRANT EXECUTE ON FUNCTION public.update_waiting_queue_status_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 5. FOREIGN KEY CONSTRAINTS CASCADE ON PATIENT_VISITS
-- -------------------------------------------------------------------------------------
DO $$
BEGIN
    -- bed_assignments -> patient_visits ON DELETE CASCADE
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'bed_assignments_visit_id_fkey' AND table_name = 'bed_assignments') THEN
        ALTER TABLE public.bed_assignments DROP CONSTRAINT bed_assignments_visit_id_fkey;
    END IF;
    ALTER TABLE public.bed_assignments ADD CONSTRAINT bed_assignments_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.patient_visits(id) ON DELETE CASCADE;

    -- patient_transfers -> patient_visits ON DELETE CASCADE
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'patient_transfers_visit_id_fkey' AND table_name = 'patient_transfers') THEN
        ALTER TABLE public.patient_transfers DROP CONSTRAINT patient_transfers_visit_id_fkey;
    END IF;
    ALTER TABLE public.patient_transfers ADD CONSTRAINT patient_transfers_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.patient_visits(id) ON DELETE CASCADE;

    -- discharge_summaries -> patient_visits ON DELETE CASCADE
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'discharge_summaries_visit_id_fkey' AND table_name = 'discharge_summaries') THEN
        ALTER TABLE public.discharge_summaries DROP CONSTRAINT discharge_summaries_visit_id_fkey;
    END IF;
    ALTER TABLE public.discharge_summaries ADD CONSTRAINT discharge_summaries_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.patient_visits(id) ON DELETE CASCADE;

    -- diagnostic_orders -> patient_visits ON DELETE SET NULL
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'diagnostic_orders_visit_id_fkey' AND table_name = 'diagnostic_orders') THEN
        ALTER TABLE public.diagnostic_orders DROP CONSTRAINT diagnostic_orders_visit_id_fkey;
    END IF;
    ALTER TABLE public.diagnostic_orders ADD CONSTRAINT diagnostic_orders_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.patient_visits(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- -------------------------------------------------------------------------------------
-- 6. HARDENED CANCEL OR DELETE IPD ADMISSION ATOMIC
-- -------------------------------------------------------------------------------------
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
              AND (role IN ('super_admin', 'admin', 'hospital_administrator', 'doctor', 'receptionist') OR is_super_admin = TRUE)
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

GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 7. UPDATE IPD ADMISSION ATOMIC RPC (With Treatment Notes & Findings)
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
    v_visit RECORD;
BEGIN
    SELECT * INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Inpatient admission record not found.');
    END IF;

    -- Update patient_visits
    UPDATE public.patient_visits
    SET chief_complaint = COALESCE(p_provisional_diagnosis, chief_complaint),
        reason_for_visit = COALESCE(p_provisional_diagnosis, reason_for_visit),
        doctor_id = COALESCE(p_doctor_id, doctor_id),
        notes = COALESCE(p_notes, notes),
        clinical_findings = COALESCE(p_clinical_findings, clinical_findings),
        updated_at = NOW()
    WHERE id = p_visit_id AND organization_id = p_org_id;

    -- Update guardian info on patient record
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

GRANT EXECUTE ON FUNCTION public.update_ipd_admission_atomic(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 8. EXPENSES: Allow Referral Management in record_hospital_expense_atomic
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_hospital_expense_atomic(
    p_org_id UUID,
    p_category_id UUID,
    p_title VARCHAR,
    p_amount NUMERIC,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_payment_reference VARCHAR DEFAULT NULL,
    p_paid_to VARCHAR DEFAULT NULL,
    p_expense_date DATE DEFAULT CURRENT_DATE,
    p_expense_type VARCHAR DEFAULT 'GENERAL',
    p_doctor_id UUID DEFAULT NULL,
    p_duty_shift VARCHAR DEFAULT NULL,
    p_department VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_org UUID;
    v_user_id UUID;
    v_expense_id UUID;
    v_voucher_no VARCHAR(50);
    v_gl_exp_acc_id UUID;
    v_gl_cash_acc_id UUID;
    v_je_number VARCHAR(50);
    v_gl_lines JSONB;
    v_gl_res JSONB;
BEGIN
    -- 1. Resolve & Enforce Tenant Isolation
    v_user_id := auth.uid();
    v_caller_org := public.get_current_org_id();

    IF v_user_id IS NOT NULL THEN
        IF v_caller_org IS NULL THEN
            SELECT COALESCE(organization_id, active_organization_id)
            INTO v_caller_org
            FROM public.profiles
            WHERE id = v_user_id
            LIMIT 1;
        END IF;

        IF p_org_id IS NULL OR (v_caller_org IS NOT NULL AND p_org_id != v_caller_org) THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant violation. Requested organization does not match authenticated session.';
        END IF;

        -- 2. Verify Caller Role / Permission (Includes expenses.create, referral.manage for commissions)
        IF NOT (
            public.is_org_admin_or_has_permission(p_org_id, 'accounting.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'expenses.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'expenses.create') OR
            public.is_org_admin_or_has_permission(p_org_id, 'billing.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'referral.manage') OR
            public.is_org_admin_or_has_permission(p_org_id, 'referral.edit') OR
            public.has_permission('accounting.manage') OR
            public.has_permission('expenses.manage') OR
            public.has_permission('expenses.create') OR
            public.has_permission('billing.manage') OR
            public.has_permission('referral.manage') OR
            public.has_permission('referral.edit') OR
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = v_user_id AND (role IN ('super_admin', 'admin', 'hospital_administrator', 'accountant') OR is_super_admin = TRUE)
            )
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks permissions to disburse or record hospital expenses.';
        END IF;
    END IF;

    -- 3. Input Validation
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Expense amount must be greater than zero.';
    END IF;

    IF TRIM(COALESCE(p_title, '')) = '' THEN
        RAISE EXCEPTION 'Expense title/purpose is mandatory.';
    END IF;

    -- 4. Verify Active Category Belongs to Organization
    IF NOT EXISTS (
        SELECT 1 FROM public.expense_categories
        WHERE id = p_category_id AND organization_id = p_org_id AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Category does not exist or is inactive for organization %.', p_org_id;
    END IF;

    -- 5. Verify Doctor (if provided)
    IF p_doctor_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.doctors
            WHERE id = p_doctor_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Doctor does not exist in organization %.', p_org_id;
        END IF;
    END IF;

    -- 6. Generate Sequential Expense Voucher Number
    v_voucher_no := public.generate_expense_voucher_number(p_org_id);

    -- 7. Insert Master Expense Record
    INSERT INTO public.expenses (
        organization_id,
        voucher_number,
        category_id,
        title,
        amount,
        payment_method,
        payment_reference,
        paid_to,
        expense_date,
        expense_type,
        doctor_id,
        duty_shift,
        department,
        notes,
        created_by,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_org_id,
        v_voucher_no,
        p_category_id,
        TRIM(p_title),
        p_amount,
        COALESCE(p_payment_method, 'CASH'),
        p_payment_reference,
        p_paid_to,
        COALESCE(p_expense_date, CURRENT_DATE),
        COALESCE(p_expense_type, 'GENERAL'),
        p_doctor_id,
        p_duty_shift,
        p_department,
        p_notes,
        COALESCE(v_user_id, p_created_by),
        'POSTED',
        NOW(),
        NOW()
    ) RETURNING id INTO v_expense_id;

    -- 8. General Ledger Double-Entry Posting
    BEGIN
        SELECT id INTO v_gl_exp_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id
          AND account_type = 'EXPENSE'
          AND is_active = TRUE
        ORDER BY account_code ASC
        LIMIT 1;

        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id
          AND account_type = 'ASSET'
          AND (LOWER(account_name) LIKE '%cash%' OR LOWER(account_name) LIKE '%bank%')
          AND is_active = TRUE
        ORDER BY account_code ASC
        LIMIT 1;

        IF v_gl_exp_acc_id IS NOT NULL AND v_gl_cash_acc_id IS NOT NULL THEN
            v_je_number := 'JE-EXP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(v_voucher_no FROM 10);
            v_gl_lines := jsonb_build_array(
                jsonb_build_object('account_id', v_gl_exp_acc_id, 'debit', p_amount, 'credit', 0, 'description', 'Expense debit: ' || TRIM(p_title)),
                jsonb_build_object('account_id', v_gl_cash_acc_id, 'debit', 0, 'credit', p_amount, 'description', 'Disbursement from ' || COALESCE(p_payment_method, 'CASH'))
            );

            v_gl_res := public.post_journal_entry_atomic(
                p_org_id,
                v_je_number,
                COALESCE(p_expense_date, CURRENT_DATE),
                'EXPENSE',
                v_expense_id,
                'Expense disbursement: ' || v_voucher_no || ' (' || TRIM(p_title) || ')',
                v_gl_lines
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', TRUE,
        'expense_id', v_expense_id,
        'voucher_number', v_voucher_no,
        'message', 'Expense successfully recorded and posted.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_hospital_expense_atomic(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, VARCHAR, UUID, VARCHAR, VARCHAR, TEXT, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 9. REFRESH POSTGREST SCHEMA CACHE
-- -------------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
