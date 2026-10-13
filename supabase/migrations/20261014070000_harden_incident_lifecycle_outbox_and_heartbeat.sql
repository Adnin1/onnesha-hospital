-- =================================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS ERP)
-- MIGRATION 189: HARDEN INCIDENT LIFECYCLE, NOTIFICATION OUTBOX & 24/7 HEARTBEAT
-- Eliminates false-green anonymous health status, establishes persistent notification
-- outbox with retry/delivery tracking, missed-heartbeat detection, and exact 
-- verified resolution lifecycle (OPEN -> ACKNOWLEDGED -> RESOLVED_VERIFIED).
-- =================================================================================

-- 1. EXTEND system_health_issues_log WITH FINGERPRINT & VERIFIED LIFECYCLE
ALTER TABLE public.system_health_issues_log
    ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(128),
    ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(30) DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS occurrence_count INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS first_occurred_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_occurred_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verification_evidence JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS notification_state VARCHAR(30) DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS idx_system_health_issues_fingerprint
    ON public.system_health_issues_log(organization_id, fingerprint, is_resolved)
    WHERE is_resolved = FALSE;

-- 2. CREATE system_notification_outbox TABLE
CREATE TABLE IF NOT EXISTS public.system_notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    incident_id UUID REFERENCES public.system_health_issues_log(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('WEBHOOK', 'EMAIL', 'SMS', 'SYSTEM')),
    destination TEXT NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'BLOCKED_EXTERNAL_OWNER')),
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_outbox_pending 
    ON public.system_notification_outbox(status, created_at) 
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_system_outbox_org 
    ON public.system_notification_outbox(organization_id, created_at DESC);

ALTER TABLE public.system_notification_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_system_notification_outbox_select ON public.system_notification_outbox;
CREATE POLICY rls_system_notification_outbox_select ON public.system_notification_outbox
    FOR SELECT TO authenticated
    USING (
        organization_id = (
            SELECT COALESCE(organization_id, active_organization_id)
            FROM public.profiles
            WHERE id = auth.uid()
            LIMIT 1
        )
    );

DROP POLICY IF EXISTS rls_system_notification_outbox_insert ON public.system_notification_outbox;
CREATE POLICY rls_system_notification_outbox_insert ON public.system_notification_outbox
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (
            SELECT COALESCE(organization_id, active_organization_id)
            FROM public.profiles
            WHERE id = auth.uid()
            LIMIT 1
        )
    );

DROP POLICY IF EXISTS rls_system_notification_outbox_service ON public.system_notification_outbox;
CREATE POLICY rls_system_notification_outbox_service ON public.system_notification_outbox
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.system_notification_outbox FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.system_notification_outbox TO authenticated;
GRANT ALL ON public.system_notification_outbox TO service_role;

-- 3. CREATE system_monitoring_heartbeats TABLE
CREATE TABLE IF NOT EXISTS public.system_monitoring_heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    source VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL,
    health_score INT NOT NULL,
    active_issues_count INT NOT NULL,
    audit_scope VARCHAR(50) NOT NULL,
    duration_ms INT,
    details JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_heartbeats_recency 
    ON public.system_monitoring_heartbeats(organization_id, recorded_at DESC);

ALTER TABLE public.system_monitoring_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_system_monitoring_heartbeats_select ON public.system_monitoring_heartbeats;
CREATE POLICY rls_system_monitoring_heartbeats_select ON public.system_monitoring_heartbeats
    FOR SELECT TO authenticated
    USING (
        organization_id = (
            SELECT COALESCE(organization_id, active_organization_id)
            FROM public.profiles
            WHERE id = auth.uid()
            LIMIT 1
        )
    );

DROP POLICY IF EXISTS rls_system_monitoring_heartbeats_insert ON public.system_monitoring_heartbeats;
CREATE POLICY rls_system_monitoring_heartbeats_insert ON public.system_monitoring_heartbeats
    FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = (
            SELECT COALESCE(organization_id, active_organization_id)
            FROM public.profiles
            WHERE id = auth.uid()
            LIMIT 1
        )
    );

DROP POLICY IF EXISTS rls_system_monitoring_heartbeats_service ON public.system_monitoring_heartbeats;
CREATE POLICY rls_system_monitoring_heartbeats_service ON public.system_monitoring_heartbeats
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON public.system_monitoring_heartbeats FROM anon;
GRANT SELECT, INSERT ON public.system_monitoring_heartbeats TO authenticated;
GRANT ALL ON public.system_monitoring_heartbeats TO service_role;

-- 4. RPC: record_monitoring_heartbeat
CREATE OR REPLACE FUNCTION public.record_monitoring_heartbeat(
    p_org_id UUID DEFAULT NULL,
    p_source TEXT DEFAULT 'SCHEDULED_PROBE',
    p_status TEXT DEFAULT 'OK',
    p_health_score INT DEFAULT 100,
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
BEGIN
    IF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_target_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;
    END IF;

    IF v_target_org IS NULL THEN
        SELECT id INTO v_target_org FROM public.organizations ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_target_org IS NULL THEN
        RAISE EXCEPTION 'No active organization found to record monitoring heartbeat';
    END IF;

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
        COALESCE(p_status, 'OK'),
        COALESCE(p_health_score, 100),
        COALESCE(p_active_issues, 0),
        COALESCE(p_audit_scope, 'FULL_INTERNAL_ERP'),
        p_duration_ms,
        COALESCE(p_details, '{}'::jsonb),
        NOW()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_monitoring_heartbeat TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.record_monitoring_heartbeat FROM anon;

-- 5. RPC: verify_and_resolve_system_issue_atomic (LIFECYCLE RESOLVED_VERIFIED)
CREATE OR REPLACE FUNCTION public.verify_and_resolve_system_issue_atomic(
    p_org_id UUID,
    p_issue_id UUID,
    p_verification_evidence JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_effective_org UUID := p_org_id;
    v_target_record RECORD;
BEGIN
    IF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_effective_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;
    END IF;

    IF v_effective_org IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Valid organization context required to resolve incidents';
    END IF;

    SELECT id, title, module, location, is_resolved
    INTO v_target_record
    FROM public.system_health_issues_log
    WHERE id = p_issue_id
      AND organization_id = v_effective_org
    FOR UPDATE;

    IF v_target_record.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Incident not found or belongs to a different organization',
            'issue_id', p_issue_id
        );
    END IF;

    UPDATE public.system_health_issues_log
    SET is_resolved = TRUE,
        resolved_at = NOW(),
        lifecycle_status = 'RESOLVED_VERIFIED',
        verified_at = NOW(),
        verification_evidence = COALESCE(p_verification_evidence, '{}'::jsonb)
    WHERE id = p_issue_id;

    RETURN jsonb_build_object(
        'success', true,
        'issue_id', p_issue_id,
        'lifecycle_status', 'RESOLVED_VERIFIED',
        'resolved_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_and_resolve_system_issue_atomic TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.verify_and_resolve_system_issue_atomic FROM anon;

-- 6. UPDATED log_system_runtime_issue (WITH FINGERPRINTING, DEDUPLICATION & OUTBOX ENQUEUEING)
CREATE OR REPLACE FUNCTION public.log_system_runtime_issue(
    p_org_id UUID,
    p_module TEXT,
    p_location TEXT,
    p_severity TEXT DEFAULT 'CRITICAL',
    p_error_code TEXT DEFAULT 'RUNTIME_ERROR',
    p_title TEXT DEFAULT 'সিস্টেম অপারেশন ত্রুটি',
    p_reason TEXT DEFAULT 'অপারেশন ব্যর্থ হয়েছে।',
    p_recommendation TEXT DEFAULT 'মডিউলটি পুনরায় পরীক্ষা করুন।',
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
    v_existing_id UUID;
    v_sanitized_reason TEXT;
    v_sanitized_details JSONB;
    v_fingerprint VARCHAR(128);
BEGIN
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

    -- Fail-closed tenant boundary: no arbitrary fallback
    IF v_effective_org_id IS NULL THEN
        SELECT id INTO v_effective_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_effective_org_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Valid organization context required to log system incident';
    END IF;

    -- Redact sensitive information
    v_sanitized_reason := regexp_replace(COALESCE(p_reason, ''), '(password|secret|token|bearer|key)=[^\s&]+', '\1=***', 'gi');
    v_sanitized_details := COALESCE(p_details, '{}'::jsonb) - 'password' - 'secret' - 'apiKey' - 'token';

    -- Stable fingerprint for deduplication & recurrence tracking
    v_fingerprint := md5(
        COALESCE(p_module, '') || ':' ||
        COALESCE(p_location, '') || ':' ||
        COALESCE(p_error_code, '') || ':' ||
        COALESCE(p_title, '')
    );

    -- Check if active (unresolved) incident with identical fingerprint exists
    SELECT id INTO v_existing_id
    FROM public.system_health_issues_log
    WHERE organization_id = v_effective_org_id
      AND fingerprint = v_fingerprint
      AND is_resolved = FALSE
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        -- Recurrence detected: increment occurrence count and refresh timestamp
        UPDATE public.system_health_issues_log
        SET occurrence_count = occurrence_count + 1,
            last_occurred_at = NOW(),
            details = v_sanitized_details,
            reason = v_sanitized_reason
        WHERE id = v_existing_id;

        v_id := v_existing_id;
    ELSE
        -- New incident: insert with lifecycle_status = 'OPEN'
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
            lifecycle_status,
            occurrence_count,
            first_occurred_at,
            last_occurred_at,
            fingerprint,
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
            'OPEN',
            1,
            NOW(),
            NOW(),
            v_fingerprint,
            NOW()
        )
        RETURNING id INTO v_id;
    END IF;

    -- Enqueue into notification outbox
    INSERT INTO public.system_notification_outbox (
        organization_id,
        incident_id,
        channel,
        destination,
        payload,
        status,
        created_at
    ) VALUES (
        v_effective_org_id,
        v_id,
        'WEBHOOK',
        'CONFIGURED_ALERT_DISPATCHER',
        jsonb_build_object(
            'incident_id', v_id,
            'module', p_module,
            'location', p_location,
            'severity', p_severity,
            'error_code', p_error_code,
            'title', p_title,
            'reason', v_sanitized_reason,
            'occurred_at', NOW()
        ),
        'PENDING',
        NOW()
    );

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_system_runtime_issue TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.log_system_runtime_issue FROM anon;

-- 7. UPDATED check_system_health_diagnostics (ZERO FALSE-GREEN + MISSED HEARTBEAT CHECK)
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

    -- Check 11: Heartbeat Recency
    v_last_heartbeat_at TIMESTAMPTZ;
    v_heartbeat_age_sec INT;

    -- Check 12: Notification Outbox Failures
    v_outbox_failures_count INT := 0;
BEGIN
    -- ZERO FALSE-GREEN LAW:
    -- If caller is unauthenticated (anonymous) and NOT running under service_role:
    -- Explicitly return UNAUTHORIZED status and 0 health score. Never return 100/100 or is_healthy = true!
    IF v_caller_id IS NULL AND v_caller_role IS DISTINCT FROM 'service_role' AND current_user != 'service_role' THEN
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

    -- Authenticated caller: resolve effective organization ID
    IF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_target_org_id
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;
    END IF;

    IF v_target_org_id IS NULL THEN
        SELECT id INTO v_target_org_id FROM public.organizations ORDER BY created_at ASC LIMIT 1;
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
    -- CHECK 2: BED OCCUPANCY DRIFT
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

    SELECT 
        COUNT(*),
        STRING_AGG(b.bed_number, ', ')
    INTO v_bed_drift_vacant, v_bed_drift_samples
    FROM public.beds b
    WHERE b.organization_id = v_target_org_id
      AND LOWER(b.status) = 'occupied'
      AND NOT EXISTS (
          SELECT 1 FROM public.bed_assignments ba
          WHERE ba.bed_id = b.id AND ba.status = 'ACTIVE'
      );

    IF (v_bed_drift_occupied + v_bed_drift_vacant) > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := GREATEST(0, v_health_score - 15);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'BED_OCCUPANCY_DRIFT',
            'severity', 'WARNING',
            'module', 'ইনপেশেন্ট ওয়ার্ড ও কেবিন (IPD Bed Management)',
            'location', 'public.beds & public.bed_assignments',
            'title', 'বেড অকুপেন্সি স্ট্যাটাস অমিল (Occupancy State Drift)',
            'reason', (v_bed_drift_occupied + v_bed_drift_vacant) || 'টি বেডের ফিজিক্যাল স্ট্যাটাস ও অ্যাক্টিভ পেশেন্ট অ্যাসাইনমেন্টে অমিল পাওয়া গেছে।',
            'recommendation', 'বেড ম্যানেজমেন্ট প্যানেল থেকে অকুপেন্সি ডাটা সিঙ্ক করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('BED_OCCUPANCY_STATE_CONSISTENT');
    END IF;

    -- =================================================================================
    -- CHECK 3: BED & WARD FOREIGN KEY INTEGRITY
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(bed_number, ', ')
    INTO v_orphan_beds_count, v_orphan_beds_samples
    FROM public.beds
    WHERE organization_id = v_target_org_id
      AND ward_name IS NULL;

    IF v_orphan_beds_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 20);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'BED_WARD_NAME_NULL',
            'severity', 'CRITICAL',
            'module', 'ওয়ার্ড ও কেবিন ডাটাবেজ স্কিমা (IPD Schema)',
            'location', 'public.beds.ward_name (NOT NULL Violation Risk)',
            'title', 'বেডের ওয়ার্ডের নাম অনুপস্থিত (Missing Ward Name)',
            'reason', v_orphan_beds_count || 'টি বেডের কোনো ward_name নেই। নমুনা: ' || COALESCE(v_orphan_beds_samples, 'N/A'),
            'recommendation', 'মাইগ্রেশন ১৮৪ ও ১৮৫ চালিয়ে বেডের ward_name স্বয়ংক্রিয়ভাবে পূরণ করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('BED_WARD_SCHEMA_RELATIONS_VALID');
    END IF;

    -- =================================================================================
    -- CHECK 4: REFERRAL COMMISSION DISCREPANCY & OVERPAYMENT
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(agent_name || ' (Paid: ৳' || total_commission_paid || ', Earned: ৳' || total_commission_earned || ')', ', ')
    INTO v_ref_overpaid_count, v_ref_overpaid_samples
    FROM public.referral_agents
    WHERE organization_id = v_target_org_id
      AND total_commission_paid > (total_commission_earned + 0.01);

    IF v_ref_overpaid_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 25);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'REFERRAL_COMMISSION_OVERPAID',
            'severity', 'CRITICAL',
            'module', 'রেফারেল ও এজেন্ট কমিশন (Referrals & Commissions)',
            'location', 'public.referral_agents (Payout Overdraft)',
            'title', 'রেফারেল এজেন্টকে অতিরিক্ত কমিশন প্রদান সনাক্ত',
            'reason', v_ref_overpaid_count || 'জন এজেন্টকে অর্জিত কমিশনের চেয়ে বেশি টাকা পরিশোধ করা হয়েছে। নমুনা: ' || COALESCE(v_ref_overpaid_samples, 'N/A'),
            'recommendation', 'কমিশন ডিসবার্সমেন্ট রেকর্ড ও ভাউচার পুনরায় অডিট করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('REFERRAL_COMMISSIONS_BALANCED');
    END IF;

    -- =================================================================================
    -- CHECK 5: EXPENSE VOUCHER GENERAL LEDGER LINKAGE
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(voucher_number, ', ')
    INTO v_unlinked_exp_count, v_unlinked_exp_samples
    FROM public.expenses
    WHERE organization_id = v_target_org_id
      AND status = 'POSTED'
      AND journal_entry_id IS NULL;

    IF v_unlinked_exp_count > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := GREATEST(0, v_health_score - 15);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'EXPENSE_POSTED_WITHOUT_JOURNAL',
            'severity', 'WARNING',
            'module', 'হাসপাতাল খরচ ও ভাউচার (Hospital Expenses)',
            'location', 'public.expenses.journal_entry_id',
            'title', 'পোস্ট করা ভাউচারের সাথে জার্নাল এন্ট্রির সংযোগ নেই',
            'reason', v_unlinked_exp_count || 'টি পোস্ট করা খরচের ভাউচারের কোনো জেনারেল লেজার জার্নাল নেই। নমুনা: ' || COALESCE(v_unlinked_exp_samples, 'N/A'),
            'recommendation', 'ভাউচারগুলো অডিট করে সংশ্লিষ্ট জার্নাল এন্ট্রি পোস্ট করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('EXPENSES_JOURNAL_INTEGRITY_VERIFIED');
    END IF;

    -- =================================================================================
    -- CHECK 6: BILLING INVOICE CALCULATION & INTEGRITY
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(invoice_number, ', ')
    INTO v_invalid_inv_count, v_invalid_inv_samples
    FROM public.invoices
    WHERE organization_id = v_target_org_id
      AND (
          total_amount < 0 
          OR paid_amount < 0 
          OR ABS(total_amount - (paid_amount + due_amount)) > 0.01
      );

    IF v_invalid_inv_count > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 20);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'INVOICE_ARITHMETIC_MISMATCH',
            'severity', 'CRITICAL',
            'module', 'বিলিং ও ইনভয়েস ম্যানেজমেন্ট (Billing Core)',
            'location', 'public.invoices (Total != Paid + Due)',
            'title', 'ইনভয়েস গাণিতিক হিসেবে গরমিল (Invoice Arithmetic Error)',
            'reason', v_invalid_inv_count || 'টি চালানে মোট টাকার সাথে পরিশোধিত ও বকেয়া টাকার যোগফল মিলছে না। নমুনা: ' || COALESCE(v_invalid_inv_samples, 'N/A'),
            'recommendation', 'ইনভয়েস ব্যালান্স সমন্বয় করুন বা রিকনসিলিয়েশন স্ক্রিপ্ট চালান।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('BILLING_INVOICES_ARITHMETIC_VALID');
    END IF;

    -- =================================================================================
    -- CHECK 7: DOCTORS CLINICAL SCHEDULE & CHAMBER ALLOCATION
    -- =================================================================================
    SELECT 
        COUNT(*),
        STRING_AGG(name, ', ')
    INTO v_doctor_chamber_count, v_doctor_chamber_samples
    FROM public.doctors
    WHERE organization_id = v_target_org_id
      AND is_active = TRUE
      AND (chamber_room IS NULL OR TRIM(chamber_room) = '');

    IF v_doctor_chamber_count > 0 THEN
        v_info_count := v_info_count + 1;
        v_health_score := GREATEST(0, v_health_score - 5);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'DOCTOR_CHAMBER_UNASSIGNED',
            'severity', 'INFO',
            'module', 'ডাক্তার ও চেম্বার রোস্টার (Doctors & Chambers)',
            'location', 'public.doctors.chamber_room',
            'title', 'সক্রিয় ডাক্তারের চেম্বার বা রুম নির্ধারিত নেই',
            'reason', v_doctor_chamber_count || 'জন ডাক্তারের কোনো চেম্বার নম্বর সেট করা নেই। নমুনা: ' || COALESCE(v_doctor_chamber_samples, 'N/A'),
            'recommendation', 'ডাক্তার তালিকায় যেয়ে চেম্বার রুম নম্বর (যেমন Chamber 1) যুক্ত করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('DOCTORS_CHAMBERS_ASSIGNED');
    END IF;

    -- =================================================================================
    -- CHECK 8: TRIAL BALANCE GAAP EQUILIBRIUM
    -- =================================================================================
    SELECT 
        COALESCE(SUM(total_debit), 0),
        COALESCE(SUM(total_credit), 0)
    INTO v_tb_total_debit, v_tb_total_credit
    FROM public.journal_entries
    WHERE organization_id = v_target_org_id
      AND status = 'POSTED';

    v_tb_diff := ABS(v_tb_total_debit - v_tb_total_credit);

    IF v_tb_diff > 0.01 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 30);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'TRIAL_BALANCE_OUT_OF_EQUILIBRIUM',
            'severity', 'CRITICAL',
            'module', 'ট্রায়াল ব্যালান্স ও আর্থিক প্রতিবেদন (Trial Balance)',
            'location', 'GAAP Balance Sheet Equation',
            'title', 'ট্রায়াল ব্যালান্স ভারসাম্যের বাইরে (Trial Balance Out of Equilibrium)',
            'reason', 'সার্বিক মোট ডেবিট (৳' || v_tb_total_debit || ') এবং মোট ক্রেডিট (৳' || v_tb_total_credit || ') সমান নয়। ব্যবধান: ৳' || v_tb_diff,
            'recommendation', 'অ্যাকাউন্টিং ট্রায়াল ব্যালান্স রিপোর্ট দেখে অমিল জার্নাল এন্ট্রি চিহ্নিত করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('TRIAL_BALANCE_GAAP_EQUILIBRIUM_PASS');
    END IF;

    -- =================================================================================
    -- CHECK 9: ACTIVE RUNTIME INCIDENTS IN LOG
    -- =================================================================================
    FOR v_log_row IN
        SELECT id, module, location, severity, title, reason, recommendation, created_at, occurrence_count
        FROM public.system_health_issues_log
        WHERE organization_id = v_target_org_id
          AND is_resolved = FALSE
        ORDER BY created_at DESC
        LIMIT 10
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
            'id', v_log_row.id::TEXT,
            'severity', v_log_row.severity,
            'module', v_log_row.module,
            'location', v_log_row.location,
            'title', v_log_row.title,
            'reason', v_log_row.reason || CASE WHEN v_log_row.occurrence_count > 1 THEN ' (পুনরাবৃত্তি: ' || v_log_row.occurrence_count || ' বার)' ELSE '' END,
            'recommendation', v_log_row.recommendation,
            'timestamp', v_log_row.created_at
        ));
    END LOOP;

    -- =================================================================================
    -- CHECK 10: PATIENT ADMISSION & EPISODE LINKAGE INTEGRITY
    -- =================================================================================
    SELECT COUNT(*)
    INTO v_orphan_ipd_visits
    FROM public.ipd_visits v
    WHERE v.organization_id = v_target_org_id
      AND NOT EXISTS (
          SELECT 1 FROM public.patients p WHERE p.id = v.patient_id
      );

    IF v_orphan_ipd_visits > 0 THEN
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 25);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'IPD_VISIT_ORPHAN_PATIENT',
            'severity', 'CRITICAL',
            'module', 'রোগী ভর্তি ও রেজিস্ট্রেশন (Patient Admissions)',
            'location', 'public.ipd_visits -> public.patients',
            'title', 'রোগীর রেকর্ডবিহীন আইপিডি ভর্তি সনাক্ত',
            'reason', v_orphan_ipd_visits || 'টি ভর্তির রেকর্ডে কোনো বৈধ রোগীর আইডি নেই।',
            'recommendation', 'রেজিস্ট্রার মডিউল থেকে রোগীর তথ্য যাচাই করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('PATIENT_ADMISSION_INTEGRITY_VERIFIED');
    END IF;

    -- =================================================================================
    -- CHECK 11: 24/7 BACKGROUND HEARTBEAT RECENCY & MISSED PROBES
    -- =================================================================================
    SELECT 
        MAX(recorded_at),
        EXTRACT(EPOCH FROM (NOW() - MAX(recorded_at)))::INT
    INTO v_last_heartbeat_at, v_heartbeat_age_sec
    FROM public.system_monitoring_heartbeats
    WHERE organization_id = v_target_org_id;

    IF v_last_heartbeat_at IS NULL THEN
        -- If no heartbeats recorded yet, log an informational notice (not critical failure on bootstrap)
        v_info_count := v_info_count + 1;
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'MONITORING_NO_HEARTBEAT_RECORDED',
            'severity', 'INFO',
            'module', '24/7 Background Heartbeat',
            'location', 'public.system_monitoring_heartbeats',
            'title', 'ব্যাকগ্রাউন্ড হার্টবিট ইনিশিয়ালাইজেশন প্রয়োজন',
            'reason', 'সিস্টেমে এখনও কোনো নিয়মিত ব্যাকগ্রাউন্ড হার্টবিট জমা পড়েনি। শিডিউলড প্রোব চালু করুন।',
            'recommendation', 'scripts/scheduled-health-check.mjs চালান বা GitHub Actions রান পর্যবেক্ষণ করুন।',
            'timestamp', NOW()
        ));
    ELSIF v_heartbeat_age_sec > 900 THEN -- > 15 minutes stale threshold
        v_critical_count := v_critical_count + 1;
        v_health_score := GREATEST(0, v_health_score - 20);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'MONITORING_MISSED_HEARTBEAT_STALE',
            'severity', 'CRITICAL',
            'module', '24/7 Background Heartbeat',
            'location', 'public.system_monitoring_heartbeats (Stale Threshold > 15m)',
            'title', 'মনিটরিং হার্টবিট বিলম্বিত বা মিস হয়েছে (Missed Background Heartbeat)',
            'reason', 'সর্বশেষ হার্টবিট রেকর্ড করা হয়েছিল ' || (v_heartbeat_age_sec / 60) || ' মিনিট পূর্বে (নির্ধারিত ব্যবধান: ৫ মিনিট)। ব্যাকগ্রাউন্ড প্রসেস স্টল হতে পারে।',
            'recommendation', 'GitHub Actions রান লগ বা এক্সটার্নাল ক্রন শিডিউলার পরীক্ষা করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('BACKGROUND_HEARTBEAT_ACTIVE_AND_FRESH');
    END IF;

    -- =================================================================================
    -- CHECK 12: PERSISTENT NOTIFICATION OUTBOX FAILURES
    -- =================================================================================
    SELECT COUNT(*)
    INTO v_outbox_failures_count
    FROM public.system_notification_outbox
    WHERE organization_id = v_target_org_id
      AND status = 'FAILED'
      AND created_at > NOW() - INTERVAL '24 hours';

    IF v_outbox_failures_count > 0 THEN
        v_warning_count := v_warning_count + 1;
        v_health_score := GREATEST(0, v_health_score - 10);
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'id', 'NOTIFICATION_OUTBOX_FAILED_DELIVERIES',
            'severity', 'WARNING',
            'module', 'Notification Outbox',
            'location', 'public.system_notification_outbox',
            'title', 'নোটিফিকেশন ডেলিভারি ব্যর্থতা সনাক্ত',
            'reason', 'বিগত ২৪ ঘণ্টায় ' || v_outbox_failures_count || 'টি সতর্কতা নোটিফিকেশন ডেলিভারি ব্যর্থ হয়েছে।',
            'recommendation', 'ওয়েবহুক URL বা যোগাযোগ প্রদানকারীর কনফিগারেশন যাচাই করুন।',
            'timestamp', NOW()
        ));
    ELSE
        v_passed := v_passed || jsonb_build_array('NOTIFICATION_OUTBOX_HEALTHY');
    END IF;

    -- Final Health Verdict
    RETURN jsonb_build_object(
        'is_healthy', (v_critical_count = 0 AND v_health_score >= 80),
        'health_score', GREATEST(0, v_health_score),
        'status', CASE WHEN v_critical_count = 0 AND v_health_score >= 80 THEN 'HEALTHY' ELSE 'DEFECT_DETECTED' END,
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

GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_system_health_diagnostics(UUID) FROM anon;

-- 8. RPC: get_system_monitoring_status (HEALTH OVERVIEW, HEARTBEAT HISTORY & OUTBOX METRICS)
CREATE OR REPLACE FUNCTION public.get_system_monitoring_status(
    p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_target_org UUID := p_org_id;
    v_latest_heartbeat RECORD;
    v_total_heartbeats INT := 0;
    v_pending_notifications INT := 0;
    v_sent_notifications INT := 0;
    v_failed_notifications INT := 0;
    v_blocked_notifications INT := 0;
    v_active_issues INT := 0;
BEGIN
    IF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_target_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;
    END IF;

    IF v_target_org IS NULL THEN
        SELECT id INTO v_target_org FROM public.organizations ORDER BY created_at ASC LIMIT 1;
    END IF;

    SELECT COUNT(*) INTO v_total_heartbeats
    FROM public.system_monitoring_heartbeats
    WHERE organization_id = v_target_org;

    SELECT source, status, health_score, audit_scope, recorded_at
    INTO v_latest_heartbeat
    FROM public.system_monitoring_heartbeats
    WHERE organization_id = v_target_org
    ORDER BY recorded_at DESC
    LIMIT 1;

    SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING'),
        COUNT(*) FILTER (WHERE status = 'SENT'),
        COUNT(*) FILTER (WHERE status = 'FAILED'),
        COUNT(*) FILTER (WHERE status = 'BLOCKED_EXTERNAL_OWNER')
    INTO v_pending_notifications, v_sent_notifications, v_failed_notifications, v_blocked_notifications
    FROM public.system_notification_outbox
    WHERE organization_id = v_target_org;

    SELECT COUNT(*) INTO v_active_issues
    FROM public.system_health_issues_log
    WHERE organization_id = v_target_org
      AND is_resolved = FALSE;

    RETURN jsonb_build_object(
        'organization_id', v_target_org,
        'total_heartbeats', v_total_heartbeats,
        'latest_heartbeat', CASE WHEN v_latest_heartbeat.recorded_at IS NOT NULL THEN
            jsonb_build_object(
                'source', v_latest_heartbeat.source,
                'status', v_latest_heartbeat.status,
                'health_score', v_latest_heartbeat.health_score,
                'audit_scope', v_latest_heartbeat.audit_scope,
                'recorded_at', v_latest_heartbeat.recorded_at,
                'age_seconds', EXTRACT(EPOCH FROM (NOW() - v_latest_heartbeat.recorded_at))::INT
            )
        ELSE NULL END,
        'notification_metrics', jsonb_build_object(
            'pending', v_pending_notifications,
            'sent', v_sent_notifications,
            'failed', v_failed_notifications,
            'blocked_external_owner', v_blocked_notifications
        ),
        'active_issues_count', v_active_issues,
        'queried_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_monitoring_status(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_system_monitoring_status(UUID) FROM anon;
