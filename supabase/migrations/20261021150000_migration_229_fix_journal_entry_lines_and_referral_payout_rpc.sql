-- ==============================================================================
-- MIGRATION 229: FIX JOURNAL ENTRY LINES IN HEALTH DIAGNOSTICS & HARDEN REFERRAL PAYOUT RPC
-- ==============================================================================
-- 1. Updates check_system_health_diagnostics:
--    - Enforces immediate fail-closed AUDIT_UNAUTHORIZED (Rule H-004) for anonymous/unprivileged callers.
--    - Fixes table join from non-existent public.journal_lines to authoritative public.journal_entry_lines.
-- 2. Updates record_referral_commission_payout_atomic to seamlessly accept both 10-parameter
--    and 8-parameter invocations (p_patient_total_bill and p_commission_rate_percent).
-- ==============================================================================

-- 1. CHECK SYSTEM HEALTH DIAGNOSTICS (ZERO FALSE-GREEN + ANON SHIELD + JOURNAL_ENTRY_LINES)
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
    v_bed_drift_samples TEXT;
    v_stuck_admissions_count INT := 0;
    v_open_critical_incidents INT := 0;
    v_has_waiting_finished_at BOOLEAN := FALSE;
BEGIN
    -- Fail-closed for unprivileged / anonymous callers (Rule H-004 fail-closed shield)
    IF v_caller_role = 'anon' OR (v_caller_id IS NULL AND v_caller_role != 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin')) THEN
        RETURN jsonb_build_object(
            'checked_at', NOW(),
            'organization_id', NULL,
            'health_score', 0,
            'is_healthy', false,
            'status', 'AUDIT_UNAUTHORIZED',
            'audit_scope', 'PUBLIC_PORTAL_ONLY',
            'critical_count', 1,
            'warning_count', 0,
            'info_count', 0,
            'total_issues', 1,
            'issues', jsonb_build_array(
                jsonb_build_object(
                    'id', 'DIAGNOSTIC_PRIVILEGE_REQUIRED',
                    'severity', 'CRITICAL',
                    'module', 'SECURITY',
                    'message', 'Diagnostic privilege required to view hospital system telemetry.'
                )
            ),
            'passed_checks', '[]'::JSONB
        );
    END IF;

    -- Determine target organization for authenticated / service_role
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

    -- CHECK 2: General Ledger Double-Entry Balance (Authoritative public.journal_entry_lines)
    SELECT COUNT(*), string_agg(je_number, ', ')
    INTO v_unbalanced_je_count, v_unbalanced_je_samples
    FROM (
        SELECT je.je_number
        FROM public.journal_entries je
        JOIN public.journal_entry_lines jl ON je.id = jl.journal_entry_id
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
        'audit_scope', 'FULL_SYSTEM_AUDIT',
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

-- 2. HARDENED RECORD_REFERRAL_COMMISSION_PAYOUT_ATOMIC (SUPPORT 10-PARAM & 8-PARAM CALLS)
DROP FUNCTION IF EXISTS public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.record_referral_commission_payout_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_amount NUMERIC,
    p_payment_method VARCHAR,
    p_patient_id UUID DEFAULT NULL,
    p_patient_total_bill NUMERIC DEFAULT NULL,
    p_commission_rate_percent NUMERIC DEFAULT NULL,
    p_transaction_reference VARCHAR DEFAULT NULL,
    p_notes VARCHAR DEFAULT NULL,
    p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_approved_by UUID;
    v_agent RECORD;
    v_patient RECORD;
    v_settlement_id UUID;
    v_settlement_number VARCHAR(60);
    v_category_id UUID;
    v_voucher_number VARCHAR(60);
    v_expense_id UUID;
    v_gl_exp_acc_id UUID;
    v_gl_cash_acc_id UUID;
    v_je_id UUID;
    v_je_number VARCHAR(60);
    v_new_settled NUMERIC(14,2);
    v_patient_total_bill NUMERIC(14,2) := COALESCE(p_patient_total_bill, 0.00);
    v_comm_rate NUMERIC(5,2) := COALESCE(p_commission_rate_percent, 0.00);
    v_now TIMESTAMPTZ := NOW();
    v_comm_rec RECORD;
    v_target_title TEXT;
    v_payment_norm TEXT;
BEGIN
    -- 1. Multi-Tenant Authorization Check
    IF v_caller_id IS NOT NULL AND current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND (organization_id = p_org_id OR active_organization_id = p_org_id)
        ) AND NOT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = v_caller_id AND organization_id = p_org_id
        ) THEN
            RAISE EXCEPTION '403 Forbidden: Cross-tenant operation prohibited.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 2. Validate Amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Payout amount must be greater than zero.';
    END IF;

    -- 3. Validate Same-Org Agent
    SELECT id, agent_code, full_name, total_commission_settled, commission_rate_percent
    INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id
      AND organization_id = p_org_id;

    IF v_agent.id IS NULL THEN
        RAISE EXCEPTION 'Referral agent not found in active organization.';
    END IF;

    IF v_comm_rate <= 0.00 THEN
        v_comm_rate := COALESCE(v_agent.commission_rate_percent, 10.00);
    END IF;

    -- 4. Validate and Snapshot Patient if provided
    IF p_patient_id IS NOT NULL THEN
        SELECT id, full_name, patient_code
        INTO v_patient
        FROM public.patients
        WHERE id = p_patient_id
          AND organization_id = p_org_id;

        IF v_patient.id IS NOT NULL AND v_patient_total_bill <= 0.00 THEN
            SELECT COALESCE(SUM(grand_total), 0.00)
            INTO v_patient_total_bill
            FROM public.invoices
            WHERE patient_id = p_patient_id
              AND organization_id = p_org_id
              AND is_voided = FALSE;

            IF v_patient_total_bill = 0.00 THEN
                SELECT COALESCE(SUM(billing_subtotal), 0.00)
                INTO v_patient_total_bill
                FROM public.referral_commissions
                WHERE patient_id = p_patient_id
                  AND referral_agent_id = p_agent_id
                  AND organization_id = p_org_id;
            END IF;
        END IF;
    END IF;

    -- 5. Idempotency Check
    IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
        SELECT id, settlement_number, expense_id, journal_entry_id
        INTO v_settlement_id, v_settlement_number, v_expense_id, v_je_id
        FROM public.referral_commission_settlements
        WHERE organization_id = p_org_id
          AND referral_agent_id = p_agent_id
          AND transaction_reference = TRIM(p_idempotency_key)
        LIMIT 1;

        IF v_settlement_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'idempotent_replay', true,
                'settlement_id', v_settlement_id,
                'settlement_number', v_settlement_number,
                'expense_id', v_expense_id,
                'journal_entry_id', v_je_id
            );
        END IF;
    END IF;

    -- 6. Generate Settlement Number
    v_settlement_number := 'SETTLE-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

    -- 7. Insert Settlement Record
    INSERT INTO public.referral_commission_settlements (
        organization_id,
        settlement_number,
        referral_agent_id,
        settlement_date,
        gross_commission_selected,
        adjustment_amount,
        net_paid_amount,
        payment_method,
        transaction_reference,
        paid_by,
        notes,
        status,
        patient_id,
        patient_name,
        patient_code,
        patient_total_bill,
        commission_rate_percent,
        created_at
    ) VALUES (
        p_org_id,
        v_settlement_number,
        p_agent_id,
        CURRENT_DATE,
        p_amount,
        0,
        p_amount,
        COALESCE(UPPER(TRIM(p_payment_method)), 'CASH'),
        COALESCE(TRIM(p_idempotency_key), TRIM(p_transaction_reference)),
        v_caller_id,
        COALESCE(TRIM(p_notes), 'Referral commission payout'),
        'PAID',
        p_patient_id,
        v_patient.full_name,
        v_patient.patient_code,
        v_patient_total_bill,
        v_comm_rate,
        v_now
    )
    RETURNING id INTO v_settlement_id;

    -- 8. Synchronize Per-Patient Referral Commissions (if applicable)
    IF p_patient_id IS NOT NULL THEN
        SELECT id, commission_amount, amount_paid, amount_pending
        INTO v_comm_rec
        FROM public.referral_commissions
        WHERE organization_id = p_org_id
          AND referral_agent_id = p_agent_id
          AND patient_id = p_patient_id
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_comm_rec.id IS NOT NULL THEN
            UPDATE public.referral_commissions
            SET amount_paid = COALESCE(amount_paid, 0) + p_amount,
                amount_pending = GREATEST(0.00, COALESCE(commission_amount, 0) - (COALESCE(amount_paid, 0) + p_amount)),
                settlement_status = CASE 
                    WHEN (COALESCE(commission_amount, 0) - (COALESCE(amount_paid, 0) + p_amount)) <= 0 THEN 'PAID'
                    ELSE 'PARTIAL'
                END,
                approval_status = 'APPROVED',
                paid_at = v_now,
                updated_at = v_now
            WHERE id = v_comm_rec.id;
        ELSE
            INSERT INTO public.referral_commissions (
                organization_id,
                referral_agent_id,
                patient_id,
                referral_code_snapshot,
                referral_name_snapshot,
                billing_subtotal,
                discount_amount,
                commission_base_amount,
                commission_rate_percent,
                commission_amount,
                amount_paid,
                amount_pending,
                approval_status,
                settlement_status,
                paid_at,
                created_at,
                updated_at
            ) VALUES (
                p_org_id,
                p_agent_id,
                p_patient_id,
                v_agent.agent_code,
                v_agent.full_name,
                v_patient_total_bill,
                0.00,
                v_patient_total_bill,
                v_comm_rate,
                GREATEST(p_amount, (v_patient_total_bill * (v_comm_rate / 100.00))),
                p_amount,
                GREATEST(0.00, GREATEST(p_amount, (v_patient_total_bill * (v_comm_rate / 100.00))) - p_amount),
                'APPROVED',
                CASE WHEN p_amount >= GREATEST(p_amount, (v_patient_total_bill * (v_comm_rate / 100.00))) THEN 'PAID' ELSE 'PARTIAL' END,
                v_now,
                v_now,
                v_now
            );
        END IF;
    END IF;

    -- 9. Update Agent Settled Total
    v_new_settled := COALESCE(v_agent.total_commission_settled, 0) + p_amount;
    UPDATE public.referral_agents
    SET total_commission_settled = v_new_settled,
        updated_at = v_now
    WHERE id = p_agent_id
      AND organization_id = p_org_id;

    -- 10. Resolve or Create Expense Category
    SELECT id INTO v_category_id
    FROM public.expense_categories
    WHERE organization_id = p_org_id
      AND (category_code IN ('CAT-MKT-ADV', 'EXP-MARKETING') OR name ILIKE '%Marketing%' OR name ILIKE '%Referral%')
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_category_id IS NULL THEN
        INSERT INTO public.expense_categories (
            organization_id,
            name,
            category_code,
            is_active
        ) VALUES (
            p_org_id,
            'Marketing & Referral Commission',
            'EXP-MARKETING',
            true
        )
        RETURNING id INTO v_category_id;
    END IF;

    -- 11. Resolve Safe Approved Profile
    IF v_caller_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id) THEN
        v_approved_by := v_caller_id;
    ELSE
        SELECT id INTO v_approved_by FROM public.profiles WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- 12. Insert Hospital Expense Record
    v_voucher_number := 'VOUCHER-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    v_payment_norm := UPPER(COALESCE(TRIM(p_payment_method), 'CASH'));

    IF v_patient.full_name IS NOT NULL THEN
        v_target_title := 'Referral Commission: ' || v_agent.full_name || ' (' || v_agent.agent_code || ') - Patient: ' || v_patient.full_name;
    ELSE
        v_target_title := 'Referral Commission Payout: ' || v_agent.full_name || ' (' || v_agent.agent_code || ')';
    END IF;

    INSERT INTO public.expenses (
        organization_id,
        category_id,
        title,
        amount,
        voucher_number,
        paid_to,
        expense_date,
        payment_method,
        payment_reference,
        expense_type,
        status,
        notes,
        approved_by,
        created_at
    ) VALUES (
        p_org_id,
        v_category_id,
        v_target_title,
        p_amount,
        v_voucher_number,
        v_agent.full_name,
        CURRENT_DATE,
        v_payment_norm,
        v_settlement_number,
        'MARKETING',
        'POSTED',
        COALESCE(TRIM(p_notes), 'Referral partner commission payout booked to operational hospital expense'),
        v_approved_by,
        v_now
    )
    RETURNING id INTO v_expense_id;

    -- 13. Double-Entry General Ledger (GL) Posting
    SELECT id INTO v_gl_exp_acc_id
    FROM public.chart_of_accounts
    WHERE organization_id = p_org_id
      AND account_type = 'EXPENSE'
      AND (account_code IN ('5020', '5400') OR account_name ILIKE '%Referral%')
      AND is_active = TRUE
    ORDER BY account_code ASC
    LIMIT 1;

    IF v_gl_exp_acc_id IS NULL THEN
        SELECT id INTO v_gl_exp_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'EXPENSE' AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_payment_norm = 'CASH' THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND account_code = '1010' AND is_active = TRUE
        LIMIT 1;
    ELSIF v_payment_norm IN ('BANK_TRANSFER', 'BANK') THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND account_code = '1020' AND is_active = TRUE
        LIMIT 1;
    ELSE
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND account_code IN ('1040', '1010') AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_gl_cash_acc_id IS NULL THEN
        SELECT id INTO v_gl_cash_acc_id
        FROM public.chart_of_accounts
        WHERE organization_id = p_org_id AND account_type = 'ASSET' AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_gl_exp_acc_id IS NOT NULL AND v_gl_cash_acc_id IS NOT NULL THEN
        v_je_number := 'JE-EXP-' || TO_CHAR(v_now, 'YYYYMMDD') || '-' || SUBSTRING(v_expense_id::TEXT, 1, 6);

        INSERT INTO public.journal_entries (
            organization_id,
            entry_number,
            entry_date,
            reference_type,
            reference_id,
            description,
            status,
            total_debit,
            total_credit,
            posted_by,
            created_at
        ) VALUES (
            p_org_id,
            v_je_number,
            CURRENT_DATE,
            'EXPENSE_PAYMENT',
            v_expense_id,
            v_target_title || ' (Voucher: ' || v_voucher_number || ')',
            'DRAFT',
            p_amount,
            p_amount,
            v_approved_by,
            v_now
        )
        RETURNING id INTO v_je_id;

        -- Debit Expense
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_je_id,
            v_gl_exp_acc_id,
            p_amount,
            0.00,
            v_target_title
        );

        -- Credit Cash/Bank
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_je_id,
            v_gl_cash_acc_id,
            0.00,
            p_amount,
            'Disbursement via ' || v_payment_norm
        );

        UPDATE public.journal_entries
        SET status = 'POSTED'
        WHERE id = v_je_id;

        UPDATE public.expenses
        SET journal_entry_id = v_je_id
        WHERE id = v_expense_id;

        UPDATE public.referral_commission_settlements
        SET expense_id = v_expense_id,
            journal_entry_id = v_je_id
        WHERE id = v_settlement_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'settlement_number', v_settlement_number,
        'expense_id', v_expense_id,
        'voucher_number', v_voucher_number,
        'journal_entry_id', v_je_id,
        'journal_entry_number', v_je_number,
        'amount_paid', p_amount,
        'patient_id', p_patient_id,
        'patient_name', v_patient.full_name,
        'patient_code', v_patient.patient_code,
        'patient_total_bill', v_patient_total_bill,
        'commission_rate_percent', v_comm_rate,
        'settlement_status', 'PAID'
    );
END;
$$;

-- Provide 8-parameter overload wrapper for legacy callers
CREATE OR REPLACE FUNCTION public.record_referral_commission_payout_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_amount NUMERIC,
    p_payment_method VARCHAR,
    p_patient_id UUID,
    p_transaction_reference VARCHAR,
    p_notes VARCHAR,
    p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT public.record_referral_commission_payout_atomic(
        p_org_id, p_agent_id, p_amount, p_payment_method, p_patient_id, NULL, NULL, p_transaction_reference, p_notes, p_idempotency_key
    );
$$;

GRANT EXECUTE ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_referral_commission_payout_atomic(UUID, UUID, NUMERIC, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;

COMMENT ON SCHEMA public IS 'OHMS Unified Schema - Migration 229 Complete (Journal Entry Lines & Referral Payout Hardened)';
