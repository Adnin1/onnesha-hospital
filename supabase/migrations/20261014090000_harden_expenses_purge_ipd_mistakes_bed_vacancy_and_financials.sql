-- Migration 191: Harden Expense Purge, IPD Mistake Admission Cancellation, Bed Vacancy Drift Reconciliation, and Financial Aggregates Precision
-- Authoritative Multi-Tenant Compliance & Clinical Invariants

-- ============================================================================
-- 1. HARDEN EXPENSE PURGE & VOID RPC (delete_hospital_expense_super_admin_atomic)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_hospital_expense_super_admin_atomic(
    p_org_id UUID,
    p_expense_id UUID,
    p_admin_id UUID,
    p_reason TEXT,
    p_permanent_purge BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_admin BOOLEAN := FALSE;
    v_exp RECORD;
    v_je RECORD;
    v_rev_je_number VARCHAR(50);
    v_rev_lines JSONB := '[]'::jsonb;
    v_line RECORD;
    v_rev_res JSONB := NULL;
    v_voucher_number TEXT;
BEGIN
    -- 1. Input parameter validation
    IF p_org_id IS NULL OR p_expense_id IS NULL OR p_admin_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID, Expense ID, and Admin ID are mandatory.';
    END IF;

    IF TRIM(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'A valid deletion/void reason is mandatory and cannot be empty.';
    END IF;

    -- 2. Direct caller identity verification (allow service_role / background runner)
    IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
        RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
    END IF;

    -- 3. Role & Permission Verification
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_admin_id
          AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator', 'finance_admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1 
            FROM public.role_permissions rp
            JOIN public.permissions p ON rp.permission_id = p.id
            JOIN public.user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = p_admin_id
              AND ur.organization_id = p_org_id
              AND p.name IN ('accounting.manage', 'expenses.manage', 'expenses.delete')
        ) INTO v_is_admin;
    END IF;

    IF NOT v_is_admin AND v_caller IS NOT NULL THEN
        RAISE EXCEPTION 'Access Denied: Administrative or accounting.manage privilege required to delete or reverse expense vouchers.';
    END IF;

    -- 4. Target record acquisition with row lock
    SELECT * INTO v_exp
    FROM public.expenses
    WHERE id = p_expense_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense voucher with ID % not found in organization %.', p_expense_id, p_org_id;
    END IF;

    v_voucher_number := COALESCE(v_exp.voucher_number, 'EXP-' || SUBSTRING(p_expense_id::text, 1, 8));

    -- 5. Safe Permanent Purge handling
    IF p_permanent_purge THEN
        -- If it was POSTED or PAID and NOT voided, it must first be voided via double-entry GL reversal
        IF v_exp.status IN ('POSTED', 'PAID') THEN
            RAISE EXCEPTION 'Accounting Immutability Invariant: Active posted expense vouchers cannot be directly hard deleted. They must be voided and reversed via double-entry balancing journal first.' USING ERRCODE = '22023';
        END IF;

        -- Permanent Purge of DRAFT, PENDING_APPROVAL, VOID, or VOIDED vouchers
        DELETE FROM public.expenses
        WHERE id = p_expense_id AND organization_id = p_org_id;

        -- Record Audit Log
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, p_admin_id, 'PURGE', 'ACCOUNTING', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'status', 'PURGED', 'timestamp', NOW()),
            NOW()
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'PURGED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher permanently removed from database.'
        );
    END IF;

    -- 6. Standard Deletion vs Voiding
    IF v_exp.status IN ('DRAFT', 'PENDING_APPROVAL') THEN
        -- Safe delete of unposted draft voucher
        DELETE FROM public.expenses
        WHERE id = p_expense_id AND organization_id = p_org_id;

        -- Audit Log
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, p_admin_id, 'DELETE', 'ACCOUNTING', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'status', 'DELETED', 'timestamp', NOW()),
            NOW()
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'DELETED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Draft expense voucher successfully deleted.'
        );
    ELSIF v_exp.status IN ('VOID', 'VOIDED') THEN
        -- Voucher is already voided. Provide clean idempotency or advise permanent purge.
        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'ALREADY_VOIDED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher ' || v_voucher_number || ' is already voided. You can permanently delete it with the Permanent Purge option.'
        );
    ELSE
        -- POSTED / PAID Expense: Perform Atomic Double-Entry Reversal
        SELECT id, entry_number
        INTO v_je
        FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_id = p_expense_id AND status = 'POSTED'
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_je.id IS NOT NULL THEN
            v_rev_je_number := 'REV-' || v_je.entry_number;

            FOR v_line IN
                SELECT account_id, debit, credit, description
                FROM public.journal_entry_lines
                WHERE journal_entry_id = v_je.id
            LOOP
                v_rev_lines := v_rev_lines || jsonb_build_object(
                    'account_id', v_line.account_id,
                    'debit', v_line.credit,   -- Inverted
                    'credit', v_line.debit,   -- Inverted
                    'description', 'Reversal: ' || COALESCE(v_line.description, 'Void of ' || v_voucher_number)
                );
            END LOOP;

            IF jsonb_array_length(v_rev_lines) > 0 THEN
                v_rev_res := public.post_journal_entry_atomic(
                    p_org_id,
                    v_rev_je_number,
                    CURRENT_DATE,
                    'EXPENSE_VOID_REVERSAL',
                    p_expense_id,
                    'Void Reversal for Voucher ' || v_voucher_number || ' - ' || TRIM(p_reason),
                    v_rev_lines,
                    COALESCE(v_caller, p_admin_id)
                );

                IF v_rev_res IS NULL OR (v_rev_res->>'success')::BOOLEAN IS NOT TRUE THEN
                    RETURN jsonb_build_object(
                        'success', FALSE,
                        'error', 'Failed to post reversal journal entry: ' || COALESCE(v_rev_res->>'error', 'Unknown error')
                    );
                END IF;
            END IF;
        END IF;

        -- Mark expense status as VOIDED
        UPDATE public.expenses
        SET status = 'VOIDED',
            void_reason = TRIM(p_reason),
            updated_at = NOW()
        WHERE id = p_expense_id AND organization_id = p_org_id;

        -- Audit Log
        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, p_admin_id, 'VOID', 'ACCOUNTING', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object(
                'voucher_number', v_voucher_number,
                'reason', p_reason,
                'status', 'VOIDED',
                'reversal_journal', v_rev_res,
                'timestamp', NOW()
            ),
            NOW()
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'VOIDED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher successfully voided and double-entry reversal journal posted.',
            'reversal_journal', v_rev_res
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;


-- ============================================================================
-- 2. IPD MISTAKE ADMISSION CANCELLATION & DELETION RPC
-- ============================================================================
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
    -- 1. Validation
    IF p_org_id IS NULL OR p_visit_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID and Visit ID are mandatory.';
    END IF;

    -- 2. Authorization Verification
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
            JOIN public.permissions p ON rp.permission_id = p.id
            JOIN public.user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = COALESCE(v_caller, p_admin_id)
              AND ur.organization_id = p_org_id
              AND p.name IN ('ipd.manage', 'ipd.admit', 'ipd.discharge', 'patients.delete')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized AND v_caller IS NOT NULL THEN
        RAISE EXCEPTION 'Access Denied: Administrative or IPD management permission required to cancel/delete admission.';
    END IF;

    -- 3. Acquire Visit
    SELECT * INTO v_visit
    FROM public.patient_visits
    WHERE id = p_visit_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patient admission visit % not found in organization %.', p_visit_id, p_org_id;
    END IF;

    -- Check if visit has finalized paid invoices
    SELECT EXISTS (
        SELECT 1 FROM public.invoices
        WHERE organization_id = p_org_id
          AND patient_id = v_visit.patient_id
          AND (visit_id = p_visit_id OR (episode_id IS NOT NULL AND episode_id = v_visit.episode_id))
          AND is_voided = FALSE
          AND payment_status IN ('PAID', 'PARTIALLY_PAID')
    ) INTO v_has_billed_invoices;

    IF v_has_billed_invoices AND p_permanent_delete THEN
        RAISE EXCEPTION 'Cannot permanently delete an admission visit that has active paid financial invoices. Please cancel the admission or void the invoices first.';
    END IF;

    -- 4. Free all assigned beds & cabins atomically
    FOR v_ba IN
        SELECT id, bed_id, cabin_id
        FROM public.bed_assignments
        WHERE (visit_id = p_visit_id OR patient_id = v_visit.patient_id)
          AND organization_id = p_org_id
          AND status = 'ACTIVE'
    LOOP
        UPDATE public.bed_assignments
        SET status = 'VACATED',
            vacated_at = NOW()
        WHERE id = v_ba.id;

        IF v_ba.bed_id IS NOT NULL THEN
            UPDATE public.beds
            SET status = 'VACANT', updated_at = NOW()
            WHERE id = v_ba.bed_id AND organization_id = p_org_id;
        END IF;

        IF v_ba.cabin_id IS NOT NULL THEN
            UPDATE public.cabins
            SET status = 'VACANT', updated_at = NOW()
            WHERE id = v_ba.cabin_id AND organization_id = p_org_id;
        END IF;
    END LOOP;

    -- 5. Clean up unbilled service charges / admission fee snapshots
    IF v_visit.episode_id IS NOT NULL THEN
        DELETE FROM public.episode_service_charges
        WHERE organization_id = p_org_id
          AND episode_id = v_visit.episode_id
          AND status = 'UNBILLED';
    END IF;

    -- 6. Clean up diagnoses and discharge draft summaries
    DELETE FROM public.patient_diagnoses
    WHERE organization_id = p_org_id AND visit_id = p_visit_id;

    DELETE FROM public.discharge_summaries
    WHERE organization_id = p_org_id AND visit_id = p_visit_id;

    -- 7. Permanent Delete vs Cancel
    IF p_permanent_delete THEN
        DELETE FROM public.bed_assignments
        WHERE visit_id = p_visit_id AND organization_id = p_org_id;

        DELETE FROM public.patient_visits
        WHERE id = p_visit_id AND organization_id = p_org_id;

        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, COALESCE(v_caller, p_admin_id), 'DELETE', 'IPD', 'patient_visits', p_visit_id::text,
            to_jsonb(v_visit),
            jsonb_build_object('reason', p_reason, 'mode', 'PERMANENT_DELETE', 'timestamp', NOW()),
            NOW()
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'DELETED',
            'visit_id', p_visit_id,
            'message', 'Mistake IPD admission deleted and assigned beds vacated.'
        );
    ELSE
        UPDATE public.patient_visits
        SET status = 'CANCELLED',
            notes = COALESCE(notes || ' | ', '') || 'Cancelled: ' || TRIM(COALESCE(p_reason, 'Mistake admission entry')),
            updated_at = NOW()
        WHERE id = p_visit_id AND organization_id = p_org_id;

        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, COALESCE(v_caller, p_admin_id), 'CANCEL', 'IPD', 'patient_visits', p_visit_id::text,
            to_jsonb(v_visit),
            jsonb_build_object('reason', p_reason, 'mode', 'CANCELLED', 'timestamp', NOW()),
            NOW()
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'CANCELLED',
            'visit_id', p_visit_id,
            'message', 'IPD admission marked as CANCELLED and assigned beds vacated.'
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;


-- ============================================================================
-- 3. BED DISCHARGE ATOMIC HARDENING & AUTOMATIC VACANCY RECONCILER
-- ============================================================================
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
        IF v_caller_org IS NOT NULL AND p_org_id != v_caller_org THEN
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

    -- 7. Atomically Vacate Bed & Cabin Assignments (by visit_id OR patient_id)
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
        'consultant_name', v_final_consultant_name,
        'bmdc_reg_number', v_final_bmdc
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ipd_discharge_atomic(UUID, UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, JSONB, TEXT, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, VARCHAR, TEXT, JSONB, DATE, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_ipd_discharge_atomic(UUID, UUID, VARCHAR, TEXT, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT, TEXT, JSONB, TEXT, VARCHAR, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, NUMERIC, VARCHAR, TEXT, JSONB, DATE, DATE, UUID) TO authenticated, service_role;


-- Reconcile Ghost Bed Vacancy Drift RPC
CREATE OR REPLACE FUNCTION public.reconcile_bed_vacancy_drift_atomic(
    p_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reconciled_beds INT := 0;
    v_reconciled_cabins INT := 0;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID is mandatory.';
    END IF;

    -- Beds marked OCCUPIED that have no active bed assignment
    WITH ghost_beds AS (
        SELECT b.id
        FROM public.beds b
        WHERE b.organization_id = p_org_id
          AND b.status = 'OCCUPIED'
          AND NOT EXISTS (
              SELECT 1 FROM public.bed_assignments ba
              JOIN public.patient_visits pv ON ba.visit_id = pv.id
              WHERE ba.bed_id = b.id
                AND ba.organization_id = p_org_id
                AND ba.status = 'ACTIVE'
                AND pv.status = 'ACTIVE'
          )
    )
    UPDATE public.beds
    SET status = 'VACANT', updated_at = NOW()
    WHERE id IN (SELECT id FROM ghost_beds);

    GET DIAGNOSTICS v_reconciled_beds = ROW_COUNT;

    -- Cabins marked OCCUPIED that have no active cabin assignment
    WITH ghost_cabins AS (
        SELECT c.id
        FROM public.cabins c
        WHERE c.organization_id = p_org_id
          AND c.status = 'OCCUPIED'
          AND NOT EXISTS (
              SELECT 1 FROM public.bed_assignments ba
              JOIN public.patient_visits pv ON ba.visit_id = pv.id
              WHERE ba.cabin_id = c.id
                AND ba.organization_id = p_org_id
                AND ba.status = 'ACTIVE'
                AND pv.status = 'ACTIVE'
          )
    )
    UPDATE public.cabins
    SET status = 'VACANT', updated_at = NOW()
    WHERE id IN (SELECT id FROM ghost_cabins);

    GET DIAGNOSTICS v_reconciled_cabins = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', TRUE,
        'reconciled_beds', v_reconciled_beds,
        'reconciled_cabins', v_reconciled_cabins,
        'organization_id', p_org_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_bed_vacancy_drift_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_bed_vacancy_drift_atomic(UUID) TO authenticated, service_role;


-- ============================================================================
-- 4. FINANCIAL AGGREGATES PRECISION OVERFLOW MITIGATION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_financial_dashboard_aggregates(
    p_org_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active_org UUID;
    v_total_invoices BIGINT := 0;
    v_active_invoices BIGINT := 0;
    v_voided_invoices BIGINT := 0;
    v_gross_revenue NUMERIC(14, 2) := 0.00;
    v_total_discounts NUMERIC(14, 2) := 0.00;
    v_net_revenue NUMERIC(14, 2) := 0.00;
    v_cash_collections NUMERIC(14, 2) := 0.00;
    v_cash_refunds NUMERIC(14, 2) := 0.00;
    v_net_collections NUMERIC(14, 2) := 0.00;
    v_period_due NUMERIC(14, 2) := 0.00;
    v_historical_ar_due NUMERIC(14, 2) := 0.00;
    v_collection_rate NUMERIC(10, 2) := 0.00;
    v_due_rate NUMERIC(10, 2) := 0.00;
BEGIN
    v_active_org := public.get_current_org_id();
    
    -- Fail-closed check
    IF v_active_org IS NOT NULL AND v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch'
            USING ERRCODE = '42501';
    END IF;

    -- Aggregate invoice performance in period [p_start_date, p_end_date)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE is_voided = FALSE),
        COUNT(*) FILTER (WHERE is_voided = TRUE),
        COALESCE(SUM(subtotal) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(discount_amount) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(grand_total) FILTER (WHERE is_voided = FALSE), 0.00)
    INTO
        v_total_invoices,
        v_active_invoices,
        v_voided_invoices,
        v_gross_revenue,
        v_total_discounts,
        v_net_revenue
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    -- Aggregate actual cash/digital collections in period
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_collections
    FROM public.payments
    WHERE organization_id = p_org_id
      AND COALESCE(payment_date, created_at) >= p_start_date
      AND COALESCE(payment_date, created_at) < p_end_date;

    -- Aggregate actual refunds in period
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_refunds
    FROM public.refunds
    WHERE organization_id = p_org_id
      AND refunded_at >= p_start_date
      AND refunded_at < p_end_date;

    v_net_collections := v_cash_collections - v_cash_refunds;

    -- Period Due (uncollected on invoices issued in this period)
    SELECT COALESCE(SUM(GREATEST(0.00, inv.grand_total - 
        COALESCE((SELECT SUM(p.amount) FROM public.payments p WHERE p.invoice_id = inv.id), 0.00) +
        COALESCE((SELECT SUM(r.amount) FROM public.refunds r WHERE r.invoice_id = inv.id), 0.00)
    )), 0.00)
    INTO v_period_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.created_at >= p_start_date
      AND inv.created_at < p_end_date
      AND inv.is_voided = FALSE;

    -- True cumulative historical AR balance as of p_end_date
    SELECT COALESCE(SUM(GREATEST(0.00, inv.grand_total - 
        COALESCE((SELECT SUM(p.amount) FROM public.payments p WHERE p.invoice_id = inv.id AND COALESCE(p.payment_date, p.created_at) <= p_end_date), 0.00) +
        COALESCE((SELECT SUM(r.amount) FROM public.refunds r WHERE r.invoice_id = inv.id AND r.refunded_at <= p_end_date), 0.00)
    )), 0.00)
    INTO v_historical_ar_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.created_at <= p_end_date
      AND (inv.is_voided = FALSE OR inv.updated_at > p_end_date);

    IF v_net_revenue > 0 THEN
        v_collection_rate := ROUND((v_net_collections / v_net_revenue) * 100.0, 2);
        v_due_rate := ROUND((v_period_due / v_net_revenue) * 100.0, 2);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_org_id,
        'period_start', p_start_date,
        'period_end', p_end_date,
        'total_invoices', v_total_invoices,
        'active_invoices', v_active_invoices,
        'voided_invoices', v_voided_invoices,
        'gross_revenue', v_gross_revenue,
        'total_discounts', v_total_discounts,
        'net_revenue', v_net_revenue,
        'gross_collections', v_cash_collections,
        'total_refunds', v_cash_refunds,
        'net_collections', v_net_collections,
        'period_due', v_period_due,
        'historical_ar_due', v_historical_ar_due,
        'collection_rate_pct', v_collection_rate,
        'due_rate_pct', v_due_rate
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_financial_dashboard_aggregates(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_dashboard_aggregates(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
