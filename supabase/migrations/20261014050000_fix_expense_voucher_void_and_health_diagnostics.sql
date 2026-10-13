-- OHMS migration 187: fail-closed diagnostics and accounting-safe expense voucher voiding.
-- This migration does not delete posted journals. It creates a balanced reversal.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_system_health_diagnostics(
    p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_jwt_role TEXT := COALESCE(auth.role(), '');
    v_user_active_org UUID;
    v_target_org_id UUID := p_org_id;
    v_issues JSONB := '[]'::JSONB;
    v_passed JSONB := '[]'::JSONB;
    
    v_critical_count INT := 0;
    v_warning_count INT := 0;
    v_info_count INT := 0;
    v_health_score INT := 100;
    
    -- Check 1: GL
    v_unbalanced_je_count INT := 0;
    v_unbalanced_je_samples TEXT;
    
    -- Check 2: Bed Occupancy
    v_bed_drift_occupied INT := 0;
    v_bed_drift_vacant INT := 0;
    v_bed_drift_samples TEXT;
    
    -- Check 3: Bed & Ward schema FK
    v_orphan_beds_count INT := 0;
    v_orphan_beds_samples TEXT;
    
    -- Check 4: Referral Commission
    v_ref_overpaid_count INT := 0;
    v_ref_overpaid_samples TEXT;
    
    -- Check 5: Expenses
    v_unlinked_exp_count INT := 0;
    v_unlinked_exp_samples TEXT;
    
    -- Check 6: Invoices
    v_invalid_inv_count INT := 0;
    v_invalid_inv_samples TEXT;
    
    -- Check 7: Doctors
    v_doctor_chamber_count INT := 0;
    v_doctor_chamber_samples TEXT;
    
    -- Check 8: Trial Balance
    v_tb_total_debit NUMERIC(14, 2) := 0.00;
    v_tb_total_credit NUMERIC(14, 2) := 0.00;
    v_tb_diff NUMERIC(14, 2) := 0.00;

    -- Check 9: Runtime Incidents
    v_log_row RECORD;

    -- Check 10: Patient Intake & Admission Integrity
    v_orphan_ipd_visits INT := 0;
    v_orphan_ipd_samples TEXT;

BEGIN
    -- Public visitors can only receive a generic standby response.
    -- Service-role scheduled monitoring is explicitly allowed to select one real organization.
    IF v_caller_id IS NULL AND v_jwt_role <> 'service_role' THEN
        RETURN jsonb_build_object(
            'is_healthy', FALSE,
            'health_score', 0,
            'critical_count', 0,
            'warning_count', 1,
            'info_count', 0,
            'total_issues', 1,
            'checked_at', NOW(),
            'organization_id', NULL,
            'issues', jsonb_build_array(jsonb_build_object(
                'id', 'DIAGNOSTICS_AUTH_REQUIRED',
                'severity', 'WARNING',
                'module', 'সিস্টেম ডায়াগনস্টিক ও মনিটরিং',
                'location', 'public.check_system_health_diagnostics',
                'title', 'প্রাইভেট সিস্টেম ডায়াগনস্টিকের জন্য লগইন প্রয়োজন',
                'reason', 'এই অনুরোধটি authenticated hospital session থেকে আসেনি; private database health পরীক্ষা চালানো হয়নি।',
                'recommendation', 'অনুমোদিত hospital user দিয়ে লগইন করে health dashboard পুনরায় চালান।',
                'timestamp', NOW()
            )),
            'passed_checks', '[]'::JSONB
        );
    END IF;

    IF v_jwt_role = 'service_role' THEN
        IF p_org_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.organizations o WHERE o.id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Service-role diagnostics require a valid explicit organization ID'
                USING ERRCODE = '22023';
        END IF;
        v_target_org_id := p_org_id;
    ELSE
        SELECT COALESCE(p.active_organization_id, p.organization_id)
        INTO v_user_active_org
        FROM public.profiles p
        WHERE p.id = v_caller_id
          AND p.is_active IS DISTINCT FROM FALSE
        LIMIT 1;

        IF v_user_active_org IS NULL OR NOT EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = v_user_active_org
        ) THEN
            RAISE EXCEPTION 'Active organization membership is required for system health diagnostics'
                USING ERRCODE = '42501';
        END IF;

        IF p_org_id IS NOT NULL AND p_org_id IS DISTINCT FROM v_user_active_org THEN
            RAISE EXCEPTION 'Organization mismatch: caller cannot inspect another organization'
                USING ERRCODE = '42501';
        END IF;

        v_target_org_id := v_user_active_org;
    END IF;

    -- =================================================================================
    -- CHECK 1: GENERAL LEDGER DOUBLE-ENTRY BALANCE & IMMUTABILITY
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(entry_number || ' (Deb: ৳' || total_debit || ', Cred: ৳' || total_credit || ')', ', ')
    INTO v_unbalanced_je_count, v_unbalanced_je_samples
    FROM public.journal_entries
    WHERE organization_id = v_target_org_id
      AND status = 'POSTED'
      AND ABS(COALESCE(total_debit, 0) - COALESCE(total_credit, 0)) > 0.01;

    IF v_unbalanced_je_count > 0 THEN
        v_critical_count := v_critical_count + v_unbalanced_je_count;
        v_health_score := GREATEST(0, v_health_score - (v_unbalanced_je_count * 25));
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'GL_UNBALANCED_JOURNAL_ENTRY',
            'severity', 'CRITICAL',
            'module', 'অ্যাকাউন্টিং ও সাধারণ লেজার (General Ledger)',
            'location', 'public.journal_entries (Debit/Credit Discrepancy)',
            'title', 'অসামঞ্জস্যপূর্ণ জার্নাল এন্ট্রি সনাক্ত (Unbalanced Journal Entry)',
            'reason', v_unbalanced_je_count || 'টি পোস্ট করা জার্নাল এন্ট্রিতে ডেবিট ও ক্রেডিট সমান নয়। নমুনা: ' || COALESCE(v_unbalanced_je_samples, 'N/A'),
            'recommendation', 'জার্নাল এন্ট্রি লাইনগুলোর ডেবিট ও ক্রেডিট ব্যালান্স সমন্বয় করুন। ডাবল-এন্ট্রি ব্যালান্স ব্যতিরেকে ট্রায়াল ব্যালান্স পাস হবে না।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('GENERAL_LEDGER_DOUBLE_ENTRY_BALANCED');
    END IF;

    -- =================================================================================
    -- CHECK 2: BED OCCUPANCY DRIFT (ACTIVE ASSIGNMENT VS BED STATUS)
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(b.bed_number, ', ')
    INTO v_bed_drift_occupied, v_bed_drift_samples
    FROM public.beds b
    WHERE b.organization_id = v_target_org_id
      AND LOWER(b.status) != 'occupied'
      AND EXISTS (
          SELECT 1 FROM public.bed_assignments ba
          WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE'
      );

    SELECT COUNT(*)
    INTO v_bed_drift_vacant
    FROM public.beds b
    WHERE b.organization_id = v_target_org_id
      AND LOWER(b.status) = 'occupied'
      AND NOT EXISTS (
          SELECT 1 FROM public.bed_assignments ba
          WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE'
      );

    IF v_bed_drift_occupied > 0 OR v_bed_drift_vacant > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := GREATEST(0, v_health_score - 15);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'BED_OCCUPANCY_DRIFT',
            'severity', 'WARNING',
            'module', 'আইপিডি ও বেড ব্যবস্থাপনা (Inpatient Beds)',
            'location', 'public.beds vs public.bed_assignments',
            'title', 'বেড অকুপেন্সি ও অ্যাসাইনমেন্ট অসামঞ্জস্য (Bed Status Drift)',
            'reason', 'সক্রিয় রোগী থাকা সত্ত্বেও ' || v_bed_drift_occupied || 'টি বেড OCCUPIED নেই অথবা খালি থাকা সত্ত্বেও OCCUPIED রয়ে গেছে। নমুনা: ' || COALESCE(v_bed_drift_samples, 'N/A'),
            'recommendation', 'বেড ম্যানেজমেন্ট মডিউল থেকে বেড স্ট্যাটাস আপডেট করুন অথবা ডিসচার্জ নিশ্চিত করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('BED_OCCUPANCY_STATUS_SYNCHRONIZED');
    END IF;

    -- =================================================================================
    -- CHECK 3: BED & WARD SCHEMA & FK INTEGRITY
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(b.bed_number, ', ')
    INTO v_orphan_beds_count, v_orphan_beds_samples
    FROM public.beds b
    WHERE b.organization_id = v_target_org_id
      AND (
          b.ward_id IS NULL 
          OR NOT EXISTS (SELECT 1 FROM public.wards w WHERE w.id = b.ward_id)
      );

    IF v_orphan_beds_count > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := GREATEST(0, v_health_score - 10);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'ORPHAN_BED_MISSING_WARD',
            'severity', 'WARNING',
            'module', 'আইপিডি ও বেড ব্যবস্থাপনা (Inpatient Beds & Cabins)',
            'location', 'public.beds (Missing Ward FK)',
            'title', 'ওয়ার্ডহীন বেড রেকর্ড পাওয়া গেছে (Bed Missing Ward)',
            'reason', v_orphan_beds_count || 'টি বেডের জন্য বৈধ ওয়ার্ড লিংক নেই। নমুনা: ' || COALESCE(v_orphan_beds_samples, 'N/A'),
            'recommendation', 'বেড তালিকায় গিয়ে বেডগুলোকে নির্দিষ্ট ওয়ার্ডে বরাদ্দ করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('BED_WARD_INVENTORY_INTEGRITY_VERIFIED');
    END IF;

    -- =================================================================================
    -- CHECK 4: REFERRAL COMMISSION INTEGRITY (PAID > EARNED / OVERPAID)
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(ra.full_name || ' (Paid: ৳' || ra.total_commission_settled || ' > Earned: ৳' || ra.total_commission_earned || ')', ', ')
    INTO v_ref_overpaid_count, v_ref_overpaid_samples
    FROM public.referral_agents ra
    WHERE ra.organization_id = v_target_org_id
      AND ra.is_active = TRUE
      AND ra.total_commission_settled > (ra.total_commission_earned + 0.05);

    IF v_ref_overpaid_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 20);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'REFERRAL_COMMISSION_OVERPAID',
            'severity', 'CRITICAL',
            'module', 'রেফারেল ও কমিশন ম্যানেজমেন্ট (Referral Payouts)',
            'location', 'public.referral_agents (Settled > Earned)',
            'title', 'রেফারেল এজেন্টে অতিরিক্ত পরিশোধ সনাক্ত (Commission Overpayment)',
            'reason', v_ref_overpaid_count || ' জন এজেন্টের মোট পরিশোধিত কমিশন অর্জিত কমিশনের চেয়ে বেশি। এজেন্ট: ' || COALESCE(v_ref_overpaid_samples, 'N/A'),
            'recommendation', 'রেফারেল সেটেলমেন্ট রেকর্ড ও পে-আউট হিস্ট্রি পুনঃমিলন করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('REFERRAL_COMMISSION_LEDGER_BALANCED');
    END IF;

    -- =================================================================================
    -- CHECK 5: HOSPITAL EXPENSES POSTING LINKAGE
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(e.voucher_number || ' (৳' || e.amount || ')', ', ')
    INTO v_unlinked_exp_count, v_unlinked_exp_samples
    FROM public.expenses e
    WHERE e.organization_id = v_target_org_id
      AND e.status = 'POSTED'
      AND e.amount > 0
      AND e.expense_date >= CURRENT_DATE - INTERVAL '30 days'
      AND NOT EXISTS (
          SELECT 1 FROM public.journal_entries je
          WHERE (je.reference_id = e.id OR je.description ILIKE '%' || e.voucher_number || '%')
            AND je.organization_id = v_target_org_id
      );

    IF v_unlinked_exp_count > 0 THEN
        v_info_count := v_info_count + 1;
        v_health_score := GREATEST(0, v_health_score - 5);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'EXPENSE_UNLINKED_GL_ENTRY',
            'severity', 'INFO',
            'module', 'হাসপাতাল ব্যয় ও ভাউচার (Hospital Expenses)',
            'location', 'public.expenses (Voucher without Journal Entry)',
            'title', 'লেজারবিহীন হাসপাতাল খরচ রেকর্ড (Expense Lacks Journal Entry)',
            'reason', v_unlinked_exp_count || 'টি হাসপাতাল খরচের বিপরীতে এখনো ডাবল-এন্ট্রি লেজার পোস্টিং তৈরি হয়নি। নমুনা: ' || COALESCE(v_unlinked_exp_samples, 'N/A'),
            'recommendation', 'অ্যাকাউন্টিং মডিউলে ভাউচারগুলো পোস্ট করুন যাতে পিঅ্যান্ডএল ও ট্রায়াল ব্যালান্সে শতভাগ প্রতিফলিত হয়।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('EXPENSE_JOURNAL_LINKAGE_VERIFIED');
    END IF;

    -- =================================================================================
    -- CHECK 6: INVOICE FINANCIAL INVARIANTS & INTEGRITY
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(inv.invoice_number, ', ')
    INTO v_invalid_inv_count, v_invalid_inv_samples
    FROM public.invoices inv
    WHERE inv.organization_id = v_target_org_id
      AND inv.is_voided = FALSE
      AND (inv.grand_total < 0 OR inv.due_amount < 0 OR inv.paid_amount < 0);

    IF v_invalid_inv_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 20);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'INVOICE_NEGATIVE_TOTAL',
            'severity', 'CRITICAL',
            'module', 'বিলিং ও ক্যাশিয়ার কালেকশন (Patient Billing)',
            'location', 'public.invoices (Negative Amounts)',
            'title', 'নেগেটিভ ইনভয়েস অ্যামাউন্ট সনাক্ত (Negative Invoice Amount Detected)',
            'reason', v_invalid_inv_count || 'টি সক্রিয় ইনভয়েসে নেগেটিভ অ্যামাউন্ট পাওয়া গেছে। ইনভয়েস #: ' || COALESCE(v_invalid_inv_samples, 'N/A'),
            'recommendation', 'বিলিং মডিউল থেকে ইনভয়েস সংশোধন অথবা রিফান্ড হিসেবে নতুন ভাউচার করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('INVOICE_FINANCIAL_INVARIANTS_VERIFIED');
    END IF;

    -- =================================================================================
    -- CHECK 7: ACTIVE DOCTOR DIRECTORY CONFIGURATION
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(d.full_name, ', ')
    INTO v_doctor_chamber_count, v_doctor_chamber_samples
    FROM public.doctors d
    WHERE d.organization_id = v_target_org_id
      AND d.is_active = TRUE
      AND (d.room_number IS NULL OR TRIM(d.room_number) = '' OR d.room_number = 'N/A');

    IF v_doctor_chamber_count > 0 THEN
        v_info_count := v_info_count + 1;
        v_health_score := GREATEST(0, v_health_score - 5);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'DOCTOR_CHAMBER_UNASSIGNED',
            'severity', 'INFO',
            'module', 'চিকিৎসক ডিরেক্টরি ও ওপিডি (Doctors & OPD)',
            'location', 'public.doctors (Active without Room/Chamber)',
            'title', 'চিকিৎসকের চেম্বার নম্বর অপ্রস্তুত (Doctor Chamber Unassigned)',
            'reason', v_doctor_chamber_count || ' জন সক্রিয় চিকিৎসকের চেম্বার নম্বর বা রুম নির্ধারিত নেই। চিকিৎসক: ' || COALESCE(v_doctor_chamber_samples, 'N/A'),
            'recommendation', 'ডক্টরস মডিউলে গিয়ে চিকিৎসকের চেম্বার বরাদ্দ করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('DOCTOR_DIRECTORY_CONFIGURED');
    END IF;

    -- =================================================================================
    -- CHECK 8: TRIAL BALANCE LEDGER PARITY
    -- =================================================================================
    BEGIN
        SELECT 
            COALESCE(SUM(total_debit), 0.00),
            COALESCE(SUM(total_credit), 0.00)
        INTO v_tb_total_debit, v_tb_total_credit
        FROM public.get_trial_balance(v_target_org_id, CURRENT_DATE);

        v_tb_diff := ABS(v_tb_total_debit - v_tb_total_credit);

        IF v_tb_diff > 0.05 THEN
            v_critical_count := v_critical_count + 1;
            v_health_score := GREATEST(0, v_health_score - 25);
            v_issues := v_issues || jsonb_build_array(jsonb_build_object(
                'id', 'TRIAL_BALANCE_OUT_OF_BALANCE',
                'severity', 'CRITICAL',
                'module', 'আর্থিক বিবরণী ও ট্রায়াল ব্যালান্স (Trial Balance)',
                'location', 'public.get_trial_balance()',
                'title', 'ট্রায়াল ব্যালান্স অমিল (Trial Balance Out of Balance)',
                'reason', 'ট্রায়াল ব্যালান্সে মোট ডেবিট (৳' || v_tb_total_debit || ') ও মোট ক্রেডিট (৳' || v_tb_total_credit || ') এর ব্যবধান ৳' || v_tb_diff,
                'recommendation', 'চার্ট অব অ্যাকাউন্টস ও পোস্টিং জার্নাল যাচাই করুন।',
                'timestamp', NOW()
            ));
        ELSE
            v_passed := v_passed || jsonb_build_array('TRIAL_BALANCE_PARITY_VERIFIED');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_passed := v_passed || jsonb_build_array('TRIAL_BALANCE_CHECK_DEFERRED');
    END;

    -- =================================================================================
    -- CHECK 9: ACTIVE SYSTEM RUNTIME INCIDENTS MONITOR
    -- =================================================================================
    FOR v_log_row IN
        SELECT id, module, location, severity, error_code, title, reason, recommendation, created_at
        FROM public.system_health_issues_log
        WHERE organization_id = v_target_org_id
          AND is_resolved = FALSE
        ORDER BY created_at DESC
        LIMIT 20
    LOOP
        IF v_log_row.severity = 'CRITICAL' THEN
            v_critical_count := v_critical_count + 1;
            v_health_score := GREATEST(0, v_health_score - 20);
        ELSIF v_log_row.severity = 'WARNING' THEN
            v_warning_count := v_warning_count + 1;
            v_health_score := GREATEST(0, v_health_score - 10);
        ELSE
            v_info_count := v_info_count + 1;
            v_health_score := GREATEST(0, v_health_score - 5);
        END IF;

        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', v_log_row.id::text,
            'severity', v_log_row.severity,
            'module', v_log_row.module,
            'location', v_log_row.location,
            'title', v_log_row.title,
            'reason', v_log_row.reason,
            'recommendation', v_log_row.recommendation,
            'timestamp', v_log_row.created_at
        ));
    END LOOP;

    IF v_critical_count = 0 AND v_warning_count = 0 THEN
        v_passed := v_passed || jsonb_build_array('SYSTEM_RUNTIME_INCIDENTS_ZERO');
    END IF;

    -- =================================================================================
    -- CHECK 10: PATIENT INTAKE & ADMISSION LINKAGE INTEGRITY
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(v.id::text, ', ')
    INTO v_orphan_ipd_visits, v_orphan_ipd_samples
    FROM public.ipd_visits v
    WHERE v.organization_id = v_target_org_id
      AND NOT EXISTS (
          SELECT 1 FROM public.patients p
          WHERE p.id = v.patient_id
      );

    IF v_orphan_ipd_visits > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 20);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'ORPHAN_IPD_VISIT_MISSING_PATIENT',
            'severity', 'CRITICAL',
            'module', 'রোগী ভর্তি ও রেজিস্ট্রেশন (Patient Intake & Admissions)',
            'location', 'public.ipd_visits (Missing Patient FK)',
            'title', 'রোগীহীন ভর্তি রেকর্ড সনাক্ত (Admission without Patient)',
            'reason', v_orphan_ipd_visits || 'টি আইপিডি অ্যাডমিশন রেকর্ডে রোগী পাওয়া যায়নি। নমুনা: ' || COALESCE(v_orphan_ipd_samples, 'N/A'),
            'recommendation', 'রেজিস্ট্রার মডিউলে রোগীর আইডি লিঙ্ক করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('PATIENT_INTAKE_ADMISSION_INTEGRITY_VERIFIED');
    END IF;

    -- Return comprehensive diagnosis
    RETURN jsonb_build_object(
        'is_healthy', (v_critical_count = 0 AND v_warning_count = 0),
        'health_score', GREATEST(0, v_health_score),
        'critical_count', v_critical_count,
        'warning_count', v_warning_count,
        'info_count', v_info_count,
        'total_issues', (v_critical_count + v_warning_count + v_info_count),
        'checked_at', NOW(),
        'organization_id', v_target_org_id,
        'issues', v_issues,
        'passed_checks', v_passed
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_system_health_diagnostics(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_system_health_diagnostics(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.void_hospital_expense_atomic(
    p_org_id UUID,
    p_expense_id UUID,
    p_void_reason TEXT,
    p_voided_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_active_org UUID;
    v_has_permission BOOLEAN := FALSE;
    v_expense RECORD;
    v_original_je RECORD;
    v_reversal_je_id UUID;
    v_reversal_entry_number VARCHAR(60);
    v_line_count INTEGER := 0;
    v_line_debit NUMERIC(14, 2) := 0;
    v_line_credit NUMERIC(14, 2) := 0;
    v_reversal_debit NUMERIC(14, 2) := 0;
    v_reversal_credit NUMERIC(14, 2) := 0;
BEGIN
    IF v_user_id IS NULL OR p_voided_by IS DISTINCT FROM v_user_id THEN
        RAISE EXCEPTION 'An authenticated caller must authorize the expense voucher operation'
            USING ERRCODE = '42501';
    END IF;

    IF p_org_id IS NULL OR p_expense_id IS NULL
       OR NULLIF(BTRIM(p_void_reason), '') IS NULL
       OR LENGTH(BTRIM(p_void_reason)) < 4 THEN
        RAISE EXCEPTION 'Organization, expense and a void reason of at least 4 characters are required'
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(p.active_organization_id, p.organization_id)
    INTO v_active_org
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.is_active IS DISTINCT FROM FALSE
    LIMIT 1;

    IF v_active_org IS NULL OR v_active_org IS DISTINCT FROM p_org_id
       OR NOT EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = v_user_id
            AND ur.organization_id = p_org_id
       ) THEN
        RAISE EXCEPTION 'Active organization membership is required to void this voucher'
            USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = v_user_id
          AND ur.organization_id = p_org_id
          AND (
            LOWER(REPLACE(r.name, ' ', '_')) IN ('super_admin', 'admin', 'accountant', 'finance_manager', 'hospital_administrator')
            OR EXISTS (
                SELECT 1
                FROM public.role_permissions rp
                WHERE rp.role_id = ur.role_id
                  AND rp.permission_key IN ('accounting.manage', '*')
            )
          )
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
        RAISE EXCEPTION 'Accounting management permission is required to void an expense voucher'
            USING ERRCODE = '42501';
    END IF;

    SELECT e.*
    INTO v_expense
    FROM public.expenses e
    WHERE e.id = p_expense_id
      AND e.organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Expense voucher was not found in the active organization.'
        );
    END IF;

    IF UPPER(COALESCE(v_expense.status, '')) IN ('VOID', 'VOIDED') THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'status', v_expense.status,
            'already_voided', TRUE,
            'message', 'Voucher was already voided; no duplicate reversal was created.'
        );
    END IF;

    -- Find the authoritative journal by stored link first, then source identity.
    SELECT je.*
    INTO v_original_je
    FROM public.journal_entries je
    WHERE je.organization_id = p_org_id
      AND (
        je.id = v_expense.journal_entry_id
        OR (je.reference_id = p_expense_id AND je.reference_type IN ('EXPENSE_PAYMENT', 'EXPENSE'))
      )
    ORDER BY CASE WHEN je.id = v_expense.journal_entry_id THEN 0 ELSE 1 END,
             je.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        IF UPPER(COALESCE(v_expense.status, '')) IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED') THEN
            UPDATE public.expenses
            SET status = 'VOIDED',
                voided_at = NOW(),
                voided_by = v_user_id,
                void_reason = BTRIM(p_void_reason),
                updated_at = NOW()
            WHERE id = p_expense_id
              AND organization_id = p_org_id;

            RETURN jsonb_build_object(
                'success', TRUE,
                'status', 'VOIDED',
                'message', 'Unposted voucher was voided; no general-ledger reversal was required.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'This posted voucher has no linked journal entry. It was not changed; repair the ledger linkage before retrying.'
        );
    END IF;

    IF v_original_je.status <> 'POSTED' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'The linked journal is not POSTED. No voucher status was changed; review the journal and existing reversal history.'
        );
    END IF;

    IF v_original_je.total_debit IS NULL
       OR v_original_je.total_credit IS NULL
       OR v_original_je.total_debit <= 0
       OR v_original_je.total_debit <> v_original_je.total_credit THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'The source journal is not balanced. The voucher was not changed; reconcile the source journal first.'
        );
    END IF;

    SELECT COUNT(*), COALESCE(SUM(jel.debit), 0), COALESCE(SUM(jel.credit), 0)
    INTO v_line_count, v_line_debit, v_line_credit
    FROM public.journal_entry_lines jel
    WHERE jel.journal_entry_id = v_original_je.id;

    IF v_line_count < 2
       OR v_line_debit <> v_original_je.total_debit
       OR v_line_credit <> v_original_je.total_credit THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Source journal lines do not reconcile to the journal header. The voucher was not changed.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.journal_entry_lines jel
        LEFT JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
        WHERE jel.journal_entry_id = v_original_je.id
          AND (coa.id IS NULL OR coa.organization_id IS DISTINCT FROM p_org_id)
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'The source journal includes a missing or cross-organization account. The voucher was not changed.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.journal_entries prior_reversal
        WHERE prior_reversal.organization_id = p_org_id
          AND prior_reversal.reference_type = 'EXPENSE_VOID_REVERSAL'
          AND prior_reversal.reference_id = p_expense_id
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'A reversal journal already exists for this voucher but the voucher is not voided. No duplicate reversal was created; reconcile this inconsistency.'
        );
    END IF;

    v_reversal_entry_number :=
        'JE-EXP-VOID-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
        UPPER(SUBSTRING(REPLACE(GEN_RANDOM_UUID()::TEXT, '-', ''), 1, 8));

    -- Preserve the original journal and create a separate balanced reversing entry.
    INSERT INTO public.journal_entries (
        organization_id, entry_number, entry_date, reference_type, reference_id,
        description, narration, status, total_debit, total_credit, posted_by, created_by
    ) VALUES (
        p_org_id,
        v_reversal_entry_number,
        CURRENT_DATE,
        'EXPENSE_VOID_REVERSAL',
        p_expense_id,
        'Reversal of expense voucher ' || COALESCE(v_expense.voucher_number, p_expense_id::TEXT),
        'Reversal of expense voucher ' || COALESCE(v_expense.voucher_number, p_expense_id::TEXT) ||
            '. Reason: ' || BTRIM(p_void_reason),
        'PENDING',
        v_original_je.total_credit,
        v_original_je.total_debit,
        v_user_id,
        v_user_id
    )
    RETURNING id INTO v_reversal_je_id;

    INSERT INTO public.journal_entry_lines (
        journal_entry_id, account_id, debit, credit, description
    )
    SELECT
        v_reversal_je_id,
        jel.account_id,
        jel.credit,
        jel.debit,
        'Expense void reversal: ' || COALESCE(jel.description, v_expense.title, 'Expense')
    FROM public.journal_entry_lines jel
    WHERE jel.journal_entry_id = v_original_je.id;

    SELECT COALESCE(SUM(jel.debit), 0), COALESCE(SUM(jel.credit), 0)
    INTO v_reversal_debit, v_reversal_credit
    FROM public.journal_entry_lines jel
    WHERE jel.journal_entry_id = v_reversal_je_id;

    IF v_reversal_debit <> v_original_je.total_credit
       OR v_reversal_credit <> v_original_je.total_debit
       OR v_reversal_debit <> v_reversal_credit THEN
        RAISE EXCEPTION 'Generated expense reversal is not balanced; transaction rolled back'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.journal_entries
    SET status = 'POSTED'
    WHERE id = v_reversal_je_id
      AND organization_id = p_org_id
      AND status = 'PENDING';

    UPDATE public.journal_entries
    SET status = 'REVERSED'
    WHERE id = v_original_je.id
      AND organization_id = p_org_id
      AND status = 'POSTED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source journal could not be marked REVERSED; operation rolled back'
            USING ERRCODE = '40001';
    END IF;

    UPDATE public.expenses
    SET status = 'VOIDED',
        voided_at = NOW(),
        voided_by = v_user_id,
        void_reason = BTRIM(p_void_reason),
        updated_at = NOW()
    WHERE id = p_expense_id
      AND organization_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense voucher could not be marked VOIDED; operation rolled back'
            USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'VOIDED',
        'voucher_number', v_expense.voucher_number,
        'source_journal_id', v_original_je.id,
        'reversal_journal_id', v_reversal_je_id,
        'reversal_entry_number', v_reversal_entry_number,
        'message', 'Voucher voided with a balanced reversal. Original journal and audit history were preserved.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.void_hospital_expense_atomic(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_hospital_expense_atomic(UUID, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_hospital_expense_atomic(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_system_runtime_issue(
    p_org_id UUID,
    p_module TEXT,
    p_location TEXT,
    p_severity TEXT,
    p_error_code TEXT,
    p_title TEXT,
    p_reason TEXT,
    p_recommendation TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $ohms$
DECLARE
    v_user_id UUID := auth.uid();
    v_jwt_role TEXT := COALESCE(auth.role(), '');
    v_active_org UUID;
    v_effective_org UUID;
    v_incident_id UUID;
    v_clean_reason TEXT;
    v_clean_title TEXT;
    v_clean_location TEXT;
    v_clean_recommendation TEXT;
    v_clean_details JSONB;
BEGIN
    IF p_org_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.organizations o WHERE o.id = p_org_id
    ) THEN
        RAISE EXCEPTION 'A valid organization is required to record a system incident'
            USING ERRCODE = '22023';
    END IF;

    IF v_user_id IS NULL THEN
        IF v_jwt_role <> 'service_role' THEN
            RAISE EXCEPTION 'Authentication is required to record a system incident'
                USING ERRCODE = '42501';
        END IF;
        -- Only the private service-role monitor may explicitly choose an organization.
        v_effective_org := p_org_id;
    ELSE
        SELECT COALESCE(p.active_organization_id, p.organization_id)
        INTO v_active_org
        FROM public.profiles p
        WHERE p.id = v_user_id
          AND p.is_active IS DISTINCT FROM FALSE
        LIMIT 1;

        IF v_active_org IS NULL
           OR v_active_org IS DISTINCT FROM p_org_id
           OR NOT EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = v_user_id
                  AND ur.organization_id = p_org_id
           ) THEN
            RAISE EXCEPTION 'Active organization membership is required to record a system incident'
                USING ERRCODE = '42501';
        END IF;

        v_effective_org := v_active_org;
    END IF;

    IF NULLIF(BTRIM(p_module), '') IS NULL
       OR NULLIF(BTRIM(p_location), '') IS NULL
       OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
        RAISE EXCEPTION 'Incident module, location and reason are required'
            USING ERRCODE = '22023';
    END IF;

    IF COALESCE(UPPER(p_severity), 'CRITICAL') NOT IN ('CRITICAL', 'WARNING', 'INFO') THEN
        RAISE EXCEPTION 'Invalid incident severity'
            USING ERRCODE = '22023';
    END IF;

    v_clean_reason := LEFT(BTRIM(p_reason), 4000);
    v_clean_reason := regexp_replace(
        v_clean_reason,
        '(password|secret|access_token|refresh_token|service_role|api[_-]?key|authorization|bearer)[[:space:]]*[:=][[:space:]]*[^[:space:],;&]+',
        '\1=[REDACTED]',
        'gi'
    );
    v_clean_reason := regexp_replace(v_clean_reason, 'https?://[^[:space:]]+', '[URL_REDACTED]', 'gi');
    v_clean_reason := regexp_replace(v_clean_reason, '(\+?8801[3-9][0-9]{8}|01[3-9][0-9]{8})', '[PHONE_REDACTED]', 'g');
    v_clean_reason := regexp_replace(v_clean_reason, '[0-9]{10,17}', '[IDENTIFIER_REDACTED]', 'g');
    v_clean_reason := regexp_replace(v_clean_reason, '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', '[UUID_REDACTED]', 'gi');

    v_clean_title := LEFT(COALESCE(NULLIF(BTRIM(p_title), ''), 'System operation failed'), 240);
    v_clean_title := regexp_replace(v_clean_title, '(\+?8801[3-9][0-9]{8}|01[3-9][0-9]{8})', '[PHONE_REDACTED]', 'g');
    v_clean_title := regexp_replace(v_clean_title, '[0-9]{10,17}', '[IDENTIFIER_REDACTED]', 'g');
    v_clean_title := regexp_replace(v_clean_title, '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', '[UUID_REDACTED]', 'gi');

    v_clean_location := LEFT(BTRIM(p_location), 240);
    v_clean_location := regexp_replace(v_clean_location, '(\+?8801[3-9][0-9]{8}|01[3-9][0-9]{8})', '[PHONE_REDACTED]', 'g');
    v_clean_location := regexp_replace(v_clean_location, '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', '[UUID_REDACTED]', 'gi');

    v_clean_recommendation := LEFT(COALESCE(NULLIF(BTRIM(p_recommendation), ''), 'Inspect the affected workflow and database logs.'), 2000);
    v_clean_recommendation := regexp_replace(v_clean_recommendation, '(\+?8801[3-9][0-9]{8}|01[3-9][0-9]{8})', '[PHONE_REDACTED]', 'g');
    v_clean_recommendation := regexp_replace(v_clean_recommendation, '[0-9]{10,17}', '[IDENTIFIER_REDACTED]', 'g');
    v_clean_recommendation := regexp_replace(v_clean_recommendation, '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', '[UUID_REDACTED]', 'gi');

    SELECT COALESCE(
        jsonb_object_agg(details.key, details.value),
        '{}'::jsonb
    )
    INTO v_clean_details
    FROM jsonb_each(
        CASE
            WHEN jsonb_typeof(COALESCE(p_details, '{}'::jsonb)) = 'object'
            THEN COALESCE(p_details, '{}'::jsonb)
            ELSE '{}'::jsonb
        END
    ) AS details(key, value)
    WHERE LOWER(details.key) !~ '(password|secret|token|api.?key|authorization|phone|mobile|nid|patient|diagnosis|medical|bill|email|name)'
      AND details.key NOT IN ('access_token', 'refresh_token', 'service_role_key');

    INSERT INTO public.system_health_issues_log (
        organization_id,
        module,
        location,
        severity,
        error_code,
        title,
        reason,
        recommendation,
        details,
        is_resolved,
        created_at
    ) VALUES (
        v_effective_org,
        LEFT(BTRIM(p_module), 120),
        v_clean_location,
        COALESCE(UPPER(p_severity), 'CRITICAL'),
        LEFT(COALESCE(NULLIF(BTRIM(p_error_code), ''), 'RUNTIME_ERROR'), 100),
        v_clean_title,
        v_clean_reason,
        v_clean_recommendation,
        v_clean_details,
        FALSE,
        NOW()
    )
    RETURNING id INTO v_incident_id;

    RETURN v_incident_id;
END;
$ohms$;

REVOKE ALL ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_system_runtime_issue(
    p_org_id UUID,
    p_module TEXT DEFAULT NULL,
    p_issue_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $ohms$
DECLARE
    v_user_id UUID := auth.uid();
    v_jwt_role TEXT := COALESCE(auth.role(), '');
    v_active_org UUID;
    v_authorized BOOLEAN := FALSE;
    v_count INTEGER := 0;
BEGIN
    -- Never use a hardcoded organization or infer one from table ordering.
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to resolve system incidents'
            USING ERRCODE = '42501';
    END IF;

    IF p_org_id IS NULL OR p_issue_id IS NULL THEN
        RAISE EXCEPTION 'An organization and one explicit incident ID are required'
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(p.active_organization_id, p.organization_id)
    INTO v_active_org
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.is_active IS DISTINCT FROM FALSE
    LIMIT 1;

    IF v_active_org IS NULL
       OR v_active_org IS DISTINCT FROM p_org_id
       OR NOT EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = v_user_id
            AND ur.organization_id = p_org_id
       ) THEN
        RAISE EXCEPTION 'Active organization membership is required to resolve this incident'
            USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = v_user_id
          AND ur.organization_id = p_org_id
          AND (
            LOWER(REPLACE(r.name, ' ', '_')) IN ('super_admin', 'admin', 'hospital_administrator')
            OR EXISTS (
                SELECT 1
                FROM public.role_permissions rp
                WHERE rp.role_id = ur.role_id
                  AND rp.permission_key IN (
                    'system.health.resolve',
                    'accounting.manage',
                    'settings.manage_roles',
                    '*'
                  )
            )
          )
    ) INTO v_authorized;

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'Administrative permission is required to resolve system incidents'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.system_health_issues_log
    SET is_resolved = TRUE,
        resolved_at = NOW()
    WHERE organization_id = p_org_id
      AND id = p_issue_id
      AND is_resolved = FALSE
      AND (p_module IS NULL OR module = p_module);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$ohms$;

REVOKE ALL ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
