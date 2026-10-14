-- =================================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS ERP)
-- MIGRATION 194: AUTHORITATIVE SYSTEM HEALTH ENGINE, IMMUTABLE SNAPSHOTS,
-- FAIL-CLOSED ZERO-FAKE-GREEN GOVERNANCE & CALLER OVERRIDE PREVENTION
--
-- 1. Creates public.system_authoritative_health_snapshots table for tamper-proof audit trails.
-- 2. Restricts snapshot mutations strictly to database engine and service_role.
-- 3. Hardens record_monitoring_heartbeat with fail-closed defaults (score=0, status='UNKNOWN').
-- 4. Prevents arbitrary callers from declaring 100% healthy.
-- 5. Hardens check_system_health_diagnostics to audit open incidents from system_health_issues_log.
-- 6. Enforces that ANY WARNING caps health score at <= 99 and sets status = 'DEGRADED'.
-- 7. Implements run_authoritative_system_health_check(p_org_id) where engine calculates all metrics.
-- 8. Implements get_authoritative_system_health(p_org_id, p_max_age_seconds) with STALE detection.
-- =================================================================================

BEGIN;

-- =================================================================================
-- PART 1: IMMUTABLE AUTHORITATIVE HEALTH SNAPSHOTS TABLE
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.system_authoritative_health_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    engine_version VARCHAR(32) NOT NULL DEFAULT 'v1.0.0-zero-fake-green',
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL,
    required_checks INT NOT NULL,
    passed_checks INT NOT NULL,
    failed_checks INT NOT NULL,
    unknown_checks INT NOT NULL DEFAULT 0,
    skipped_checks INT NOT NULL DEFAULT 0,
    blocked_checks INT NOT NULL DEFAULT 0,
    open_issues INT NOT NULL DEFAULT 0,
    critical_issues INT NOT NULL DEFAULT 0,
    warning_issues INT NOT NULL DEFAULT 0,
    score INT NOT NULL CHECK (score >= 0 AND score <= 100),
    status VARCHAR(50) NOT NULL CHECK (status IN (
        'HEALTHY', 'DEGRADED', 'CRITICAL', 'UNKNOWN', 
        'NOT_FULLY_VERIFIED', 'MONITOR_ERROR', 'STALE', 
        'BLOCKED_EXTERNAL_OWNER', 'BLOCKED_PLATFORM_CAPABILITY'
    )),
    source_sha VARCHAR(64),
    evidence_hash VARCHAR(64),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authoritative_health_snapshots_org_recency
    ON public.system_authoritative_health_snapshots(organization_id, created_at DESC);

ALTER TABLE public.system_authoritative_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Prohibit browser direct mutation: only trusted DB engine / service_role can insert
REVOKE INSERT, UPDATE, DELETE ON public.system_authoritative_health_snapshots FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.system_authoritative_health_snapshots TO authenticated;
GRANT ALL ON public.system_authoritative_health_snapshots TO service_role;

DROP POLICY IF EXISTS rls_health_snapshots_select ON public.system_authoritative_health_snapshots;
CREATE POLICY rls_health_snapshots_select ON public.system_authoritative_health_snapshots
    FOR SELECT TO authenticated
    USING (
        organization_id = (
            SELECT COALESCE(organization_id, active_organization_id)
            FROM public.profiles
            WHERE id = auth.uid()
            LIMIT 1
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.organization_id = system_authoritative_health_snapshots.organization_id
        )
    );

DROP POLICY IF EXISTS rls_health_snapshots_service ON public.system_authoritative_health_snapshots;
CREATE POLICY rls_health_snapshots_service ON public.system_authoritative_health_snapshots
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);


-- =================================================================================
-- PART 2: HARDEN HEARTBEAT CHECK CONSTRAINTS & DEFAULTS
-- =================================================================================
ALTER TABLE public.system_monitoring_heartbeats 
    DROP CONSTRAINT IF EXISTS chk_heartbeat_health_score;
ALTER TABLE public.system_monitoring_heartbeats 
    ADD CONSTRAINT chk_heartbeat_health_score CHECK (health_score >= 0 AND health_score <= 100);

-- Update record_monitoring_heartbeat with FAIL-CLOSED defaults
CREATE OR REPLACE FUNCTION public.record_monitoring_heartbeat(
    p_org_id UUID DEFAULT NULL,
    p_source TEXT DEFAULT 'SCHEDULED_PROBE',
    p_status TEXT DEFAULT 'UNKNOWN',
    p_health_score INT DEFAULT 0,
    p_active_issues INT DEFAULT 0,
    p_audit_scope TEXT DEFAULT 'FULL_INTERNAL_ERP',
    p_duration_ms INT DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id UUID;
    v_target_org UUID := p_org_id;
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := auth.role();
    v_is_authorized BOOLEAN := FALSE;
    v_enforced_score INT := COALESCE(p_health_score, 0);
    v_enforced_status TEXT := COALESCE(p_status, 'UNKNOWN');
BEGIN
    IF v_caller_role = 'service_role' OR current_user = 'service_role' THEN
        v_is_authorized := TRUE;
    ELSIF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_target_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF p_org_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = v_caller_id 
                  AND (organization_id = p_org_id OR active_organization_id = p_org_id)
            ) OR EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = v_caller_id
                  AND ur.organization_id = p_org_id
            ) THEN
                v_target_org := p_org_id;
                v_is_authorized := TRUE;
            ELSE
                RAISE EXCEPTION 'ORGANIZATION_CONTEXT_UNAUTHORIZED: Caller does not have access to specified organization';
            END IF;
        ELSE
            v_is_authorized := (v_target_org IS NOT NULL);
        END IF;

        -- Prevent arbitrary non-service callers from forging 100% HEALTHY score
        IF v_enforced_score >= 100 OR v_enforced_status IN ('OK', 'HEALTHY') THEN
            -- Non-service caller cannot self-report 100 without authoritative verification
            v_enforced_score := LEAST(v_enforced_score, 99);
            IF v_enforced_status = 'OK' OR v_enforced_status = 'HEALTHY' THEN
                v_enforced_status := 'UNVERIFIED_CALLER_TELEMETRY';
            END IF;
        END IF;
    END IF;

    IF v_target_org IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: Explicit organization context required to record heartbeat';
    END IF;

    -- Ensure score is bounded
    v_enforced_score := GREATEST(0, LEAST(100, v_enforced_score));

    INSERT INTO public.system_monitoring_heartbeats (
        organization_id,
        source,
        status,
        health_score,
        active_issues_count,
        audit_scope,
        duration_ms,
        details,
        recorded_at
    ) VALUES (
        v_target_org,
        COALESCE(p_source, 'SCHEDULED_PROBE'),
        v_enforced_status,
        v_enforced_score,
        COALESCE(p_active_issues, 0),
        COALESCE(p_audit_scope, 'FULL_INTERNAL_ERP'),
        p_duration_ms,
        COALESCE(p_details, '{}'::jsonb),
        NOW()
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_monitoring_heartbeat(UUID, TEXT, TEXT, INT, INT, TEXT, INT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_monitoring_heartbeat(UUID, TEXT, TEXT, INT, INT, TEXT, INT, JSONB) TO authenticated, service_role;


-- =================================================================================
-- PART 3: HARDEN check_system_health_diagnostics (ZERO-FAKE-GREEN INVARIANTS)
-- =================================================================================
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
    v_unlinked_exp_count INT := 0;
    v_unlinked_exp_samples TEXT;
    v_invalid_inv_count INT := 0;
    v_invalid_inv_samples TEXT;
    v_outbox_failures_count INT := 0;

    -- Incident log variables
    v_open_critical_incidents INT := 0;
    v_open_warning_incidents INT := 0;
    v_open_incidents_samples TEXT;

    v_is_healthy BOOLEAN := FALSE;
    v_final_status TEXT := 'UNKNOWN';
BEGIN
    -- Service role bypasses user checks
    IF v_caller_role = 'service_role' OR current_user = 'service_role' THEN
        v_target_org_id := COALESCE(p_org_id, v_target_org_id);
    ELSIF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_target_org_id
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF p_org_id IS NOT NULL AND p_org_id IS DISTINCT FROM v_target_org_id THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = v_caller_id 
                  AND (organization_id = p_org_id OR active_organization_id = p_org_id)
            ) AND NOT EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = v_caller_id
                  AND ur.organization_id = p_org_id
            ) THEN
                RAISE EXCEPTION 'ORGANIZATION_CONTEXT_UNAUTHORIZED: Caller does not have access to specified organization';
            END IF;
            v_target_org_id := p_org_id;
        END IF;
    ELSE
        -- Deny unauthenticated / anon callers: Fail-closed zero score
        RETURN jsonb_build_object(
            'is_healthy', false,
            'health_score', 0,
            'status', 'AUDIT_UNAUTHORIZED',
            'audit_scope', 'PUBLIC_PORTAL_ONLY',
            'critical_count', 1,
            'warning_count', 0,
            'info_count', 0,
            'total_issues', 1,
            'checked_at', NOW(),
            'organization_id', NULL,
            'issues', jsonb_build_array(jsonb_build_object(
                'id', 'DIAGNOSTIC_PRIVILEGE_REQUIRED',
                'severity', 'CRITICAL',
                'module', 'নিরাপত্তা ও অ্যাক্সেস নিয়ন্ত্রণ (Access Control)',
                'location', 'public.check_system_health_diagnostics()',
                'title', 'অননুমোদিত ডায়াগনস্টিক স্ক্যান (Privileged Access Required)',
                'reason', 'পাবলিক বেনামী কি (Anon Key) দিয়ে হাসপাতালের অভ্যন্তরীণ ERP ইনভ্যারিয়েন্ট অডিট করা নিষিদ্ধ।',
                'recommendation', 'সার্ভার-সাইড service_role কি অথবা হাসপাতাল অ্যাডমিন অ্যাকাউন্টে লগইন করে অডিট চালান।',
                'timestamp', NOW()
            )),
            'passed_checks', '[]'::JSONB
        );
    END IF;

    IF v_target_org_id IS NULL THEN
        RETURN jsonb_build_object(
            'is_healthy', false,
            'health_score', 0,
            'status', 'ORGANIZATION_CONTEXT_REQUIRED',
            'audit_scope', 'NONE',
            'critical_count', 1,
            'warning_count', 0,
            'info_count', 0,
            'total_issues', 1,
            'checked_at', NOW(),
            'organization_id', NULL,
            'issues', jsonb_build_array(jsonb_build_object(
                'id', 'ORGANIZATION_CONTEXT_REQUIRED',
                'severity', 'CRITICAL',
                'module', 'মাল্টি-টেন্যান্ট সিকিউরিটি (Multi-Tenant Isolation)',
                'location', 'public.check_system_health_diagnostics()',
                'title', 'টেন্যান্ট কনটেক্সট অনুপস্থিত',
                'reason', 'সঠিক organization_id ব্যতিরেকে সিস্টেম অডিট চালানো সম্ভব নয়।',
                'recommendation', 'একটি বৈধ সংস্থা আইডি প্রদান করুন।',
                'timestamp', NOW()
            )),
            'passed_checks', '[]'::JSONB
        );
    END IF;

    -- =========================================================================
    -- Check 1: Double-Entry Accounting Invariance (Debits == Credits)
    -- =========================================================================
    SELECT 
        COUNT(DISTINCT je.id),
        STRING_AGG(DISTINCT je.entry_number, ', ' ORDER BY je.entry_number)
    INTO v_unbalanced_je_count, v_unbalanced_je_samples
    FROM public.journal_entries je
    JOIN public.journal_entry_lines jel ON je.id = jel.journal_entry_id
    WHERE je.organization_id = v_target_org_id
      AND je.status = 'POSTED'
    GROUP BY je.id, je.entry_number
    HAVING ABS(SUM(jel.debit) - SUM(jel.credit)) > 0.01;

    IF v_unbalanced_je_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := v_health_score - (v_unbalanced_je_count * 15);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'GL_UNBALANCED_ENTRIES',
            'severity', 'CRITICAL',
            'module', 'হিসাবরক্ষণ ও সাধারণ লেজার (Accounting & General Ledger)',
            'location', 'public.journal_entries',
            'title', 'অভারসাম্য অ্যাকাউন্টিং জার্নাল এন্ট্রি সনাক্ত',
            'reason', 'পোস্টেড জার্নাল এন্ট্রিতে ডেবিট এবং ক্রেডিট এর পরিমাণ সমান নয় (মোট ' || v_unbalanced_je_count || 'টি)।',
            'recommendation', 'ব্যালেন্সিং জার্নাল রিভার্সাল চালান। অডিট স্যাম্পল: ' || COALESCE(v_unbalanced_je_samples, 'N/A'),
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('GL_DOUBLE_ENTRY_BALANCED');
    END IF;

    -- =========================================================================
    -- Check 2: Bed Occupancy Drift (Ghost Occupancy or Ghost Vacancy)
    -- =========================================================================
    SELECT 
        COUNT(b.id) FILTER (WHERE b.status = 'OCCUPIED' AND NOT EXISTS (
            SELECT 1 FROM public.bed_assignments ba 
            WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE' AND ba.organization_id = v_target_org_id
        )),
        COUNT(b.id) FILTER (WHERE b.status = 'VACANT' AND EXISTS (
            SELECT 1 FROM public.bed_assignments ba 
            WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE' AND ba.organization_id = v_target_org_id
        )),
        STRING_AGG(b.bed_number, ', ' ORDER BY b.bed_number)
    INTO v_bed_drift_occupied, v_bed_drift_vacant, v_bed_drift_samples
    FROM public.beds b
    WHERE b.organization_id = v_target_org_id
      AND b.is_active = TRUE
      AND (
          (b.status = 'OCCUPIED' AND NOT EXISTS (SELECT 1 FROM public.bed_assignments ba WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE' AND ba.organization_id = v_target_org_id))
          OR
          (b.status = 'VACANT' AND EXISTS (SELECT 1 FROM public.bed_assignments ba WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE' AND ba.organization_id = v_target_org_id))
      );

    IF (v_bed_drift_occupied + v_bed_drift_vacant) > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := v_health_score - ((v_bed_drift_occupied + v_bed_drift_vacant) * 5);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'BED_OCCUPANCY_DRIFT',
            'severity', 'WARNING',
            'module', 'আইপিডি ও বেড ব্যবস্থাপনা (Inpatient Care & Bed Matrix)',
            'location', 'public.beds & public.bed_assignments',
            'title', 'বেড দখল ও খালি অবস্থার অসঙ্গতি (Bed Occupancy Drift)',
            'reason', 'মোট ' || (v_bed_drift_occupied + v_bed_drift_vacant) || 'টি বেডের ফিজিক্যাল স্ট্যাটাস অ্যাক্টিভ অ্যাসাইনমেন্টের সাথে মিলছে না।',
            'recommendation', 'স্বয়ংক্রিয় বেড রিকনসিলার চালান। আক্রান্ত বেড: ' || COALESCE(v_bed_drift_samples, 'N/A'),
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('BED_OCCUPANCY_SYNCHRONIZED');
    END IF;

    -- =========================================================================
    -- Check 3: Orphan Beds (Missing Ward Linkage)
    -- =========================================================================
    SELECT 
        COUNT(b.id),
        STRING_AGG(b.bed_number, ', ' ORDER BY b.bed_number)
    INTO v_orphan_beds_count, v_orphan_beds_samples
    FROM public.beds b
    WHERE b.organization_id = v_target_org_id
      AND b.ward_id IS NULL;

    IF v_orphan_beds_count > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := v_health_score - (v_orphan_beds_count * 5);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'ORPHAN_BEDS_DETECTED',
            'severity', 'WARNING',
            'module', 'আইপিডি ও ওয়ার্ড ব্যবস্থাপনা (Ward Architecture)',
            'location', 'public.beds.ward_id',
            'title', 'ওয়ার্ডহীন বেড রেকর্ড সনাক্ত',
            'reason', 'মোট ' || v_orphan_beds_count || 'টি বেড কোনো সক্রিয় ওয়ার্ডের সাথে সংযুক্ত নেই।',
            'recommendation', 'বেডগুলোকে নির্দিষ্ট ওয়ার্ডে অ্যাসাইন করুন। স্যাম্পল: ' || COALESCE(v_orphan_beds_samples, 'N/A'),
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('BED_WARD_FOREIGN_KEYS_INTEACT');
    END IF;

    -- =========================================================================
    -- Check 4: Referral Commission Overpayment Invariant
    -- =========================================================================
    SELECT 
        COUNT(rc.id),
        STRING_AGG(COALESCE(rc.referral_code_snapshot, rc.id::text), ', ' ORDER BY rc.id)
    INTO v_ref_overpaid_count, v_ref_overpaid_samples
    FROM public.referral_commissions rc
    WHERE rc.organization_id = v_target_org_id
      AND rc.amount_paid > rc.commission_amount + 0.01;

    IF v_ref_overpaid_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := v_health_score - (v_ref_overpaid_count * 20);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'REFERRAL_OVERPAYMENT_BREACH',
            'severity', 'CRITICAL',
            'module', 'রেফারেল ও কমিশন ম্যানেজমেন্ট (Doctor Referrals)',
            'location', 'public.referral_commissions',
            'title', 'রেফারেল কমিশন অতিরিক্ত পরিশোধ সনাক্ত',
            'reason', 'মোট ' || v_ref_overpaid_count || 'টি রেফারেল রেকর্ডে প্রাপ্য কমিশনের চেয়ে বেশি পরিশোধ করা হয়েছে।',
            'recommendation', 'কমিশন পেআউট হিসেব সংশোধন করুন। স্যাম্পল: ' || COALESCE(v_ref_overpaid_samples, 'N/A'),
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('REFERRAL_COMMISSIONS_WITHIN_BOUNDS');
    END IF;

    -- =========================================================================
    -- Check 5: Unlinked Posted Expenses (Missing Journal Linkage)
    -- =========================================================================
    SELECT 
        COUNT(e.id),
        STRING_AGG(COALESCE(e.voucher_number, e.id::text), ', ' ORDER BY e.id)
    INTO v_unlinked_exp_count, v_unlinked_exp_samples
    FROM public.expenses e
    WHERE e.organization_id = v_target_org_id
      AND e.status = 'PAID'
      AND e.journal_entry_id IS NULL;

    IF v_unlinked_exp_count > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := v_health_score - (v_unlinked_exp_count * 5);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'UNLINKED_POSTED_EXPENSES',
            'severity', 'WARNING',
            'module', 'হাসপাতাল খরচ ও ভাউচার (Hospital Expenses)',
            'location', 'public.expenses.journal_entry_id',
            'title', 'লেজার-বিচ্ছিন্ন পরিশোধিত খরচ সনাক্ত',
            'reason', 'মোট ' || v_unlinked_exp_count || 'টি পরিশোধিত খরচ ভাউচারের সাথে সাধারণ লেজার জার্নাল সংযুক্ত নেই।',
            'recommendation', 'অ্যাকাউন্টিং সিনক্রোনাইজার রান করুন। ভাউচার: ' || COALESCE(v_unlinked_exp_samples, 'N/A'),
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('POSTED_EXPENSES_JOURNAL_LINKED');
    END IF;

    -- =========================================================================
    -- Check 6: Invoice Arithmetic Balance (Total == Paid + Due)
    -- =========================================================================
    SELECT 
        COUNT(i.id),
        STRING_AGG(COALESCE(i.invoice_number, i.id::text), ', ' ORDER BY i.id)
    INTO v_invalid_inv_count, v_invalid_inv_samples
    FROM public.invoices i
    WHERE i.organization_id = v_target_org_id
      AND i.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
      AND (
          ABS(i.total_amount - (i.paid_amount + i.due_amount)) > 0.05
          OR i.total_amount < 0
          OR i.paid_amount < 0
          OR i.due_amount < 0
      );

    IF v_invalid_inv_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := v_health_score - (v_invalid_inv_count * 15);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'INVOICE_ARITHMETIC_INCONSISTENCY',
            'severity', 'CRITICAL',
            'module', 'বিলিং ও ক্যাশিয়ার কালেকশন (Patient Billing)',
            'location', 'public.invoices',
            'title', 'ইনভয়েস ব্যালেন্স গাণিতিক অমিল সনাক্ত',
            'reason', 'মোট ' || v_invalid_inv_count || 'টি ইনভয়েসে মোট টাকা = পরিশোধিত + বকেয়া সূত্র ভঙ্গ হয়েছে বা ঋণাত্মক মান রয়েছে।',
            'recommendation', 'ইনভয়েস ক্যালকুলেশন রিকনসাইল করুন। ইনভয়েস: ' || COALESCE(v_invalid_inv_samples, 'N/A'),
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('INVOICE_ARITHMETIC_VERIFIED');
    END IF;

    -- =========================================================================
    -- Check 7: Notification Outbox Delivery Failures
    -- =========================================================================
    SELECT COUNT(*)
    INTO v_outbox_failures_count
    FROM public.system_notification_outbox
    WHERE organization_id = v_target_org_id
      AND status = 'FAILED'
      AND created_at >= NOW() - INTERVAL '24 hours';

    IF v_outbox_failures_count > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := v_health_score - (v_outbox_failures_count * 2);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'NOTIFICATION_DELIVERY_FAILURE',
            'severity', 'WARNING',
            'module', 'অটো অ্যালার্ট ও মেসেজিং (Notification Outbox)',
            'location', 'public.system_notification_outbox',
            'title', 'নোটিফিকেশন ডেলিভারি ব্যর্থতা সনাক্ত',
            'reason', 'বিগত ২৪ ঘণ্টায় ' || v_outbox_failures_count || 'টি সতর্কতা নোটিফিকেশন ডেলিভারি ব্যর্থ হয়েছে।',
            'recommendation', 'ওয়েবহুক URL বা যোগাযোগ প্রদানকারীর কনফিগারেশন যাচাই করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('NOTIFICATION_OUTBOX_HEALTHY');
    END IF;

    -- =========================================================================
    -- Check 8: Open Unresolved Incidents in Incident Log (Zero False-Green Law)
    -- =========================================================================
    SELECT 
        COUNT(*) FILTER (WHERE severity = 'CRITICAL'),
        COUNT(*) FILTER (WHERE severity = 'WARNING'),
        STRING_AGG(COALESCE(title, module), ', ' ORDER BY created_at DESC)
    INTO v_open_critical_incidents, v_open_warning_incidents, v_open_incidents_samples
    FROM public.system_health_issues_log
    WHERE organization_id = v_target_org_id
      AND is_resolved = FALSE
      AND lifecycle_status IN ('OPEN', 'ACKNOWLEDGED');

    IF (v_open_critical_incidents + v_open_warning_incidents) > 0 THEN
        IF v_open_critical_incidents > 0 THEN
            v_critical_count := v_critical_count + v_open_critical_incidents;
            v_health_score := v_health_score - (v_open_critical_incidents * 20);
        END IF;
        IF v_open_warning_incidents > 0 THEN
            v_warning_count := v_warning_count + v_open_warning_incidents;
            v_health_score := v_health_score - (v_open_warning_incidents * 5);
        END IF;

        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'OPEN_RUNTIME_INCIDENTS_ACTIVE',
            'severity', CASE WHEN v_open_critical_incidents > 0 THEN 'CRITICAL' ELSE 'WARNING' END,
            'module', 'সিস্টেম রানটাইম ইনসিডেন্ট লগ (Incident Management)',
            'location', 'public.system_health_issues_log',
            'title', 'সক্রিয় ও অমীমাংসিত ইনসিডেন্ট সনাক্ত (' || (v_open_critical_incidents + v_open_warning_incidents) || 'টি)',
            'reason', 'সিস্টেমে ' || v_open_critical_incidents || 'টি ক্রিটিক্যাল এবং ' || v_open_warning_incidents || 'টি ওয়ার্নিং ইনসিডেন্ট এখনও অমীমাংসিত রয়েছে। স্যাম্পল: ' || COALESCE(v_open_incidents_samples, 'N/A'),
            'recommendation', 'ইনসিডেন্টগুলো সমাধান করে রিয়েল ভেরিফিকেশন চালান।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('ZERO_OPEN_INCIDENTS_VERIFIED');
    END IF;

    -- =========================================================================
    -- STRICT 100% HEALTH INVARIANT DERIVATION
    -- =========================================================================
    -- Rule 1: Any WARNING prevents 100! (Owner Requirement: "single kono problem na thakle only 100%")
    IF v_warning_count > 0 THEN
        v_health_score := LEAST(v_health_score, 99);
    END IF;

    -- Rule 2: Any CRITICAL caps health score at 70
    IF v_critical_count > 0 THEN
        v_health_score := LEAST(v_health_score, 70);
    END IF;

    v_health_score := GREATEST(0, LEAST(100, v_health_score));

    -- Rule 3: 100% ONLY when zero critical, zero warning, zero open incidents, and score == 100
    v_is_healthy := (v_critical_count = 0 AND v_warning_count = 0 AND v_health_score = 100);
    v_final_status := CASE 
        WHEN v_critical_count > 0 THEN 'CRITICAL'
        WHEN v_warning_count > 0 OR v_health_score < 100 THEN 'DEGRADED'
        ELSE 'HEALTHY'
    END;

    RETURN jsonb_build_object(
        'is_healthy', v_is_healthy,
        'health_score', v_health_score,
        'status', v_final_status,
        'audit_scope', 'FULL_INTERNAL_ERP',
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

GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics(UUID) TO anon, authenticated, service_role;


-- =================================================================================
-- PART 4: CANONICAL AUTHORITATIVE HEALTH ENGINE (SERVER-CALCULATED, ZERO CALLER OVERRIDE)
-- =================================================================================
CREATE OR REPLACE FUNCTION public.run_authoritative_system_health_check(
    p_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_finish_time TIMESTAMPTZ;
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := auth.role();
    v_is_authorized BOOLEAN := FALSE;
    v_diag JSONB;
    v_snapshot_id UUID;
    v_heartbeat_id UUID;
    
    v_score INT := 0;
    v_status TEXT := 'UNKNOWN';
    v_critical_count INT := 0;
    v_warning_count INT := 0;
    v_total_issues INT := 0;
    v_required_checks INT := 8; -- 8 explicit domains
    v_passed_checks INT := 0;
    v_failed_checks INT := 0;
    v_evidence_hash TEXT;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_REQUIRED: Organization context must be explicitly provided';
    END IF;

    -- Verify caller authorization: service_role or authenticated tenant admin
    IF v_caller_role = 'service_role' OR current_user = 'service_role' THEN
        v_is_authorized := TRUE;
    ELSIF v_caller_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator')
        ) OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = p_org_id
              AND (rp.permission_key IN ('settings.manage', 'diagnostics.manage') OR rp.permission_key = '*')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN: Caller is not authorized to run authoritative health audit for org %', p_org_id;
    END IF;

    -- 1. Execute Real Internal Database Diagnostic Probes
    BEGIN
        v_diag := public.check_system_health_diagnostics(p_org_id);
        v_score := COALESCE((v_diag->>'health_score')::INT, 0);
        v_status := COALESCE(v_diag->>'status', 'UNKNOWN');
        v_critical_count := COALESCE((v_diag->>'critical_count')::INT, 0);
        v_warning_count := COALESCE((v_diag->>'warning_count')::INT, 0);
        v_total_issues := COALESCE((v_diag->>'total_issues')::INT, 0);
        v_passed_checks := jsonb_array_length(COALESCE(v_diag->'passed_checks', '[]'::jsonb));
        v_failed_checks := v_total_issues;
    EXCEPTION WHEN OTHERS THEN
        -- Monitor crash: Score MUST be 0 and status MONITOR_ERROR (Never optimistic!)
        v_score := 0;
        v_status := 'MONITOR_ERROR';
        v_critical_count := 1;
        v_total_issues := 1;
        v_failed_checks := 1;
        v_passed_checks := 0;
        v_diag := jsonb_build_object(
            'error', SQLERRM,
            'sqlstate', SQLSTATE,
            'status', 'MONITOR_ERROR',
            'health_score', 0
        );
    END;

    v_finish_time := clock_timestamp();
    v_evidence_hash := md5(v_diag::text || v_finish_time::text);

    -- 2. Persist Authoritative Immutable Snapshot
    INSERT INTO public.system_authoritative_health_snapshots (
        organization_id,
        engine_version,
        started_at,
        finished_at,
        required_checks,
        passed_checks,
        failed_checks,
        unknown_checks,
        skipped_checks,
        blocked_checks,
        open_issues,
        critical_issues,
        warning_issues,
        score,
        status,
        source_sha,
        evidence_hash,
        details
    ) VALUES (
        p_org_id,
        'v1.0.0-zero-fake-green',
        v_start_time,
        v_finish_time,
        v_required_checks,
        v_passed_checks,
        v_failed_checks,
        0, -- unknown
        0, -- skipped
        0, -- blocked
        v_total_issues,
        v_critical_count,
        v_warning_count,
        v_score,
        v_status,
        'authoritative-db-engine',
        v_evidence_hash,
        v_diag
    ) RETURNING id INTO v_snapshot_id;

    -- 3. Record Authoritative Server-Derived Heartbeat
    INSERT INTO public.system_monitoring_heartbeats (
        organization_id,
        source,
        status,
        health_score,
        active_issues_count,
        audit_scope,
        duration_ms,
        details,
        recorded_at
    ) VALUES (
        p_org_id,
        'AUTHORITATIVE_DB_ENGINE',
        v_status,
        v_score,
        v_total_issues,
        'FULL_INTERNAL_ERP',
        EXTRACT(EPOCH FROM (v_finish_time - v_start_time) * 1000)::INT,
        jsonb_build_object('snapshot_id', v_snapshot_id, 'evidence_hash', v_evidence_hash),
        v_finish_time
    ) RETURNING id INTO v_heartbeat_id;

    RETURN jsonb_build_object(
        'snapshot_id', v_snapshot_id,
        'heartbeat_id', v_heartbeat_id,
        'organization_id', p_org_id,
        'engine_version', 'v1.0.0-zero-fake-green',
        'health_score', v_score,
        'status', v_status,
        'is_healthy', (v_status = 'HEALTHY' AND v_score = 100),
        'critical_count', v_critical_count,
        'warning_count', v_warning_count,
        'total_issues', v_total_issues,
        'required_checks', v_required_checks,
        'passed_checks', v_passed_checks,
        'evidence_hash', v_evidence_hash,
        'started_at', v_start_time,
        'finished_at', v_finish_time,
        'diagnostics', v_diag
    );
END;
$$;

REVOKE ALL ON FUNCTION public.run_authoritative_system_health_check(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_authoritative_system_health_check(UUID) TO authenticated, service_role;


-- =================================================================================
-- PART 5: FRESHNESS CHECK & STALE DETECTION QUERY RPC
-- =================================================================================
CREATE OR REPLACE FUNCTION public.get_authoritative_system_health(
    p_org_id UUID,
    p_max_age_seconds INT DEFAULT 900
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := auth.role();
    v_effective_org UUID := p_org_id;
    v_snapshot RECORD;
    v_is_stale BOOLEAN := FALSE;
    v_age_seconds INT;
BEGIN
    IF v_caller_role != 'service_role' AND current_user != 'service_role' THEN
        IF v_caller_id IS NOT NULL THEN
            SELECT COALESCE(organization_id, active_organization_id)
            INTO v_effective_org
            FROM public.profiles
            WHERE id = v_caller_id
            LIMIT 1;

            IF p_org_id IS NOT NULL AND p_org_id IS DISTINCT FROM v_effective_org THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = v_caller_id AND ur.organization_id = p_org_id
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN: Caller cannot access health snapshots for organization %', p_org_id;
                END IF;
                v_effective_org := p_org_id;
            END IF;
        ELSE
            RAISE EXCEPTION 'UNAUTHORIZED: Authentication required to inspect authoritative system health';
        END IF;
    END IF;

    IF v_effective_org IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_REQUIRED: Valid organization context required';
    END IF;

    SELECT *
    INTO v_snapshot
    FROM public.system_authoritative_health_snapshots
    WHERE organization_id = v_effective_org
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'has_snapshot', false,
            'status', 'NOT_FULLY_VERIFIED',
            'health_score', 0,
            'is_healthy', false,
            'is_stale', false,
            'message', 'No authoritative health snapshot has been recorded for this organization.'
        );
    END IF;

    v_age_seconds := EXTRACT(EPOCH FROM (NOW() - v_snapshot.created_at))::INT;
    v_is_stale := (v_age_seconds > p_max_age_seconds);

    IF v_is_stale THEN
        -- Zero-fake-green: Stale snapshots expire! Score drops to 0 and status STALE
        RETURN jsonb_build_object(
            'has_snapshot', true,
            'snapshot_id', v_snapshot.id,
            'status', 'STALE',
            'health_score', 0,
            'is_healthy', false,
            'is_stale', true,
            'age_seconds', v_age_seconds,
            'max_allowed_age_seconds', p_max_age_seconds,
            'last_recorded_score', v_snapshot.score,
            'last_recorded_status', v_snapshot.status,
            'recorded_at', v_snapshot.created_at,
            'message', 'Latest authoritative health check has expired (> ' || p_max_age_seconds || 's). A fresh audit is required.'
        );
    END IF;

    RETURN jsonb_build_object(
        'has_snapshot', true,
        'snapshot_id', v_snapshot.id,
        'status', v_snapshot.status,
        'health_score', v_snapshot.score,
        'is_healthy', (v_snapshot.status = 'HEALTHY' AND v_snapshot.score = 100),
        'is_stale', false,
        'age_seconds', v_age_seconds,
        'required_checks', v_snapshot.required_checks,
        'passed_checks', v_snapshot.passed_checks,
        'failed_checks', v_snapshot.failed_checks,
        'critical_issues', v_snapshot.critical_issues,
        'warning_issues', v_snapshot.warning_issues,
        'open_issues', v_snapshot.open_issues,
        'evidence_hash', v_snapshot.evidence_hash,
        'recorded_at', v_snapshot.created_at,
        'details', v_snapshot.details
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_authoritative_system_health(UUID, INT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_authoritative_system_health(UUID, INT) FROM PUBLIC, anon;

COMMIT;
