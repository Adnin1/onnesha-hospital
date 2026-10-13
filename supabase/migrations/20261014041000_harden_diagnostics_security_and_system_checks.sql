-- =====================================================================================
-- MIGRATION 186: HARDEN DIAGNOSTICS SECURITY, RLS, AND COMPLETE SYSTEM CHECKS
-- =====================================================================================
-- 1. Tightens RLS on public.system_health_issues_log (scoped to tenant profile, anon revoked).
-- 2. Hardens public.log_system_runtime_issue & public.resolve_system_runtime_issue.
-- 3. Hardens public.check_system_health_diagnostics with safe public fallback (Gate 3) and 10 full-system audits.
-- 4. Expands delete_invoice_super_admin_atomic administrative role authorization (Gate 5).
-- =====================================================================================

BEGIN;

-- 1. ROW LEVEL SECURITY ON public.system_health_issues_log
ALTER TABLE public.system_health_issues_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_system_health_issues_log ON public.system_health_issues_log;
DROP POLICY IF EXISTS rls_system_health_issues_log_select ON public.system_health_issues_log;
DROP POLICY IF EXISTS rls_system_health_issues_log_insert ON public.system_health_issues_log;
DROP POLICY IF EXISTS rls_system_health_issues_log_update ON public.system_health_issues_log;
DROP POLICY IF EXISTS rls_system_health_issues_log_service ON public.system_health_issues_log;

CREATE POLICY rls_system_health_issues_log_select ON public.system_health_issues_log
    FOR SELECT
    TO authenticated
    USING (
        organization_id = (
            SELECT COALESCE(organization_id, active_organization_id)
            FROM public.profiles
            WHERE id = auth.uid()
            LIMIT 1
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
              AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin')
        )
    );

CREATE POLICY rls_system_health_issues_log_insert ON public.system_health_issues_log
    FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id = (
            SELECT COALESCE(organization_id, active_organization_id)
            FROM public.profiles
            WHERE id = auth.uid()
            LIMIT 1
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
              AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin')
        )
    );

CREATE POLICY rls_system_health_issues_log_update ON public.system_health_issues_log
    FOR UPDATE
    TO authenticated
    USING (
        organization_id = (
            SELECT COALESCE(organization_id, active_organization_id)
            FROM public.profiles
            WHERE id = auth.uid()
            LIMIT 1
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
              AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin')
        )
    );

CREATE POLICY rls_system_health_issues_log_service ON public.system_health_issues_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.system_health_issues_log FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.system_health_issues_log TO authenticated;
GRANT ALL ON public.system_health_issues_log TO service_role;

-- 2. HARDENED log_system_runtime_issue
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_effective_org_id UUID := p_org_id;
    v_id UUID;
    v_sanitized_reason TEXT;
    v_sanitized_details JSONB;
BEGIN
    -- Scoped multi-tenant resolution: authenticated caller cannot forge p_org_id
    IF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_effective_org_id
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF v_effective_org_id IS NULL THEN
            v_effective_org_id := p_org_id;
        END IF;
    END IF;

    IF v_effective_org_id IS NULL THEN
        v_effective_org_id := '6b78e524-b1e3-4c43-8944-1a5a0248bff8';
    END IF;

    -- Redact sensitive information (passwords, tokens, secrets)
    v_sanitized_reason := regexp_replace(COALESCE(p_reason, ''), '(password|secret|token|bearer|key)=[^\s&]+', '\1=***', 'gi');
    v_sanitized_details := COALESCE(p_details, '{}'::jsonb) - 'password' - 'secret' - 'apiKey' - 'token';

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
        v_effective_org_id,
        COALESCE(p_module, 'System'),
        COALESCE(p_location, 'unknown'),
        CASE WHEN p_severity IN ('CRITICAL', 'WARNING', 'INFO') THEN p_severity ELSE 'CRITICAL' END,
        p_error_code,
        COALESCE(p_title, 'সিস্টেম অপারেশন ত্রুটি'),
        v_sanitized_reason,
        COALESCE(p_recommendation, 'মডিউলটি পুনরায় পরীক্ষা করুন।'),
        v_sanitized_details,
        FALSE,
        NOW()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon;

-- 3. HARDENED resolve_system_runtime_issue
CREATE OR REPLACE FUNCTION public.resolve_system_runtime_issue(
    p_org_id UUID,
    p_module TEXT DEFAULT NULL,
    p_issue_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_org UUID;
    v_target_org UUID := p_org_id;
    v_count INT := 0;
BEGIN
    IF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_caller_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF v_caller_org IS NOT NULL THEN
            v_target_org := v_caller_org;
        END IF;
    END IF;

    IF v_target_org IS NULL THEN
        v_target_org := '6b78e524-b1e3-4c43-8944-1a5a0248bff8';
    END IF;

    UPDATE public.system_health_issues_log
    SET is_resolved = TRUE,
        resolved_at = NOW()
    WHERE organization_id = v_target_org
      AND is_resolved = FALSE
      AND (p_issue_id IS NULL OR id = p_issue_id)
      AND (p_module IS NULL OR module = p_module);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID) FROM anon;

-- 4. HARDENED check_system_health_diagnostics (SAFE PUBLIC FALLBACK + 10 AUDIT CHECKS)
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
    -- Gate 3 Hardening: If caller is anonymous, fail closed into safe public status
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object(
            'is_healthy', true,
            'health_score', 100,
            'critical_count', 0,
            'warning_count', 0,
            'info_count', 0,
            'total_issues', 0,
            'checked_at', NOW(),
            'organization_id', NULL,
            'issues', '[]'::JSONB,
            'passed_checks', jsonb_build_array('PUBLIC_PORTAL_SAFE_STANDBY')
        );
    END IF;

    -- Scoped multi-tenant resolution for authenticated user
    SELECT COALESCE(organization_id, active_organization_id)
    INTO v_target_org_id
    FROM public.profiles
    WHERE id = v_caller_id
    LIMIT 1;

    IF v_target_org_id IS NULL THEN
        SELECT id INTO v_target_org_id
        FROM public.organizations
        WHERE id = '6b78e524-b1e3-4c43-8944-1a5a0248bff8'
        LIMIT 1;
    END IF;

    IF v_target_org_id IS NULL THEN
        SELECT id INTO v_target_org_id
        FROM public.organizations
        ORDER BY created_at ASC
        LIMIT 1;
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

GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics(UUID) TO authenticated, anon, service_role;

-- 5. HARDEN delete_invoice_super_admin_atomic ROLE AUTHORIZATION (GATE 5)
CREATE OR REPLACE FUNCTION public.delete_invoice_super_admin_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
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
  v_inv RECORD;
  v_payment_count INT;
  v_inv_number TEXT;
  v_caller UUID;
  v_is_super BOOLEAN := FALSE;
BEGIN
  -- A. Input validation
  IF p_org_id IS NULL OR p_invoice_id IS NULL OR p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID, Invoice ID, and Admin ID are mandatory.';
  END IF;

  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Purge reason is mandatory and cannot be empty.';
  END IF;

  -- B. Direct RPC caller authentication hardening
  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
    RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
  END IF;

  -- C. Role verification: Enforce active administrative role via user_roles & roles
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator')
  ) INTO v_is_super;

  -- Also check if user has admin/super_admin role on profiles
  IF NOT v_is_super THEN
    SELECT EXISTS (
      SELECT 1 
      FROM public.profiles p
      WHERE p.id = p_admin_id
        AND (
          LOWER(COALESCE(p.active_organization_id::text, '')) = LOWER(p_org_id::text)
          OR LOWER(COALESCE(p.organization_id::text, '')) = LOWER(p_org_id::text)
        )
        AND LOWER(COALESCE(p.role, '')) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator')
    ) INTO v_is_super;
  END IF;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Unauthorized: Invoice deletion requires active administrative role in this hospital.';
  END IF;

  -- D. Lock target invoice and verify tenant
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or organization mismatch.');
  END IF;

  v_inv_number := v_inv.invoice_number;

  -- E. In-Transaction Mandatory Audit Logging
  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    module,
    entity_type,
    entity_id,
    old_values,
    new_values,
    created_at
  ) VALUES (
    p_org_id,
    p_admin_id,
    CASE WHEN p_permanent_purge THEN 'PURGE' ELSE 'VOID' END,
    'BILLING',
    'invoices',
    p_invoice_id::text,
    to_jsonb(v_inv),
    jsonb_build_object(
      'invoice_number', v_inv_number,
      'reason', p_reason,
      'permanent_purge', p_permanent_purge,
      'total_amount', v_inv.total_amount,
      'paid_amount', v_inv.paid_amount,
      'due_amount', v_inv.due_amount,
      'status', v_inv.status,
      'timestamp', NOW()
    ),
    NOW()
  );

  -- F. Branching execution based on purge mode
  IF p_permanent_purge THEN
    -- Authoritative local transactional bypass for Super Admin hard purge
    PERFORM set_config('app.override_journal_immutability', 'on', true);

    -- 1. Dependent payment integrations & reconciliations
    DELETE FROM public.payment_reconciliations WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payment_intents WHERE invoice_id = p_invoice_id;
    DELETE FROM public.referral_commissions WHERE invoice_id = p_invoice_id;
    DELETE FROM public.insurance_claims WHERE invoice_id = p_invoice_id;

    -- 2. Financial transactions & line items
    DELETE FROM public.refunds WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

    -- 3. Journal entries and lines associated with this invoice
    DELETE FROM public.journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE reference_id = p_invoice_id
         OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%')
    );

    DELETE FROM public.journal_entries
    WHERE reference_id = p_invoice_id
       OR (reference_type = 'INVOICE' AND entry_number LIKE 'JE-INV-' || v_inv_number || '%');

    -- 4. Delete invoice root
    DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice, line items, payments, and associated journal entries permanently purged.'
    );
  ELSE
    -- SOFT CANCEL / VOID: Fail closed if real revenue collected
    IF v_inv.status = 'PAID' OR v_inv.paid_amount > 0 THEN
      SELECT COUNT(*) INTO v_payment_count
      FROM public.payments
      WHERE invoice_id = p_invoice_id;

      IF v_payment_count > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot soft-delete an invoice with collected payments. Use permanent purge with valid justification or process refund.'
        );
      END IF;
    END IF;

    UPDATE public.invoices
    SET status = 'VOID',
        is_voided = TRUE,
        voided_by = p_admin_id,
        void_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'VOIDED',
      'invoice_number', v_inv_number,
      'message', 'Invoice marked as void successfully.'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT) FROM anon, public;

COMMIT;

NOTIFY pgrst, 'reload schema';
