-- =================================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS ERP)
-- MIGRATION 192: ZERO-FALSE-GREEN MONITORING, REAL DIAGNOSTIC PG_CRON EXECUTION,
-- MULTI-TENANT ISOLATION HARDENING & OUTBOX DIRECT INSERT PREVENTION
--
-- 1. Eliminates fake constant heartbeats ('OK', 100, 0) from database daemon.
-- 2. Implements public.run_scheduled_system_health_check(p_org_id) executing real diagnostics.
-- 3. Revokes direct INSERT on public.system_notification_outbox from authenticated users.
-- 4. Provides queue_system_notification_atomic for authoritative incident alerting.
-- 5. Hardens record_outbox_delivery_attempt_atomic against cross-tenant tampering.
-- 6. Eliminates invalid profiles.role references across all administrative RPCs.
-- 7. Fixes permission_key and column types across expenses, IPD, and billing RPCs.
-- 8. Enforces GAAP-compliant reversal-first model in delete_invoice_super_admin_atomic.
-- =================================================================================

BEGIN;

-- =================================================================================
-- PART 1: OUTBOX SECURITY & DIRECT MUTATION REVOCATION
-- =================================================================================
-- Revoke direct mutation rights from ordinary authenticated browser sessions
REVOKE INSERT, UPDATE, DELETE ON public.system_notification_outbox FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.system_notification_outbox TO authenticated;
GRANT ALL ON public.system_notification_outbox TO service_role;

-- Secure Controlled Notification Enqueue RPC
DROP FUNCTION IF EXISTS public.queue_system_notification_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.queue_system_notification_atomic(
    p_org_id UUID,
    p_incident_id UUID DEFAULT NULL,
    p_channel TEXT DEFAULT 'SYSTEM',
    p_destination TEXT DEFAULT 'admin@hospital.org',
    p_title TEXT DEFAULT 'সিস্টেম সতর্কতা নোটিফিকেশন',
    p_message TEXT DEFAULT 'সিস্টেমে একটি অস্বাভাবিক ঘটনা রেকর্ড হয়েছে।',
    p_priority TEXT DEFAULT 'HIGH',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := auth.role();
    v_is_authorized BOOLEAN := FALSE;
    v_outbox_id UUID;
    v_payload JSONB;
BEGIN
    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_REQUIRED: Organization ID must be provided';
    END IF;

    -- Trusted service_role or authenticated tenant admin
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
        RAISE EXCEPTION 'FORBIDDEN: Insufficient privileges to enqueue authoritative system notifications for organization %', p_org_id;
    END IF;

    v_payload := jsonb_build_object(
        'title', p_title,
        'message', p_message,
        'priority', p_priority,
        'metadata', p_metadata,
        'enqueued_at', NOW()
    );

    INSERT INTO public.system_notification_outbox (
        organization_id,
        incident_id,
        channel,
        destination,
        payload,
        status,
        attempt_count,
        max_attempts
    ) VALUES (
        p_org_id,
        p_incident_id,
        p_channel,
        p_destination,
        v_payload,
        'PENDING',
        0,
        3
    ) RETURNING id INTO v_outbox_id;

    RETURN v_outbox_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_system_notification_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_system_notification_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;


-- =================================================================================
-- PART 2: HARDEN record_outbox_delivery_attempt_atomic (CROSS-TENANT ISOLATION)
-- =================================================================================
CREATE OR REPLACE FUNCTION public.record_outbox_delivery_attempt_atomic(
    p_outbox_id UUID,
    p_status TEXT,
    p_error TEXT DEFAULT NULL,
    p_destination TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT := auth.role();
    v_caller_id UUID := auth.uid();
    v_outbox RECORD;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- 1. Validate status
    IF p_status NOT IN ('PENDING', 'SENT', 'FAILED', 'BLOCKED_EXTERNAL_OWNER') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Status must be PENDING, SENT, FAILED, or BLOCKED_EXTERNAL_OWNER';
    END IF;

    -- 2. Lock target outbox row FOR UPDATE
    SELECT id, organization_id, incident_id, attempt_count, max_attempts
    INTO v_outbox
    FROM public.system_notification_outbox
    WHERE id = p_outbox_id
    FOR UPDATE;

    IF v_outbox.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Outbox record not found',
            'outbox_id', p_outbox_id
        );
    END IF;

    -- 3. Strict Tenant Authorization: Caller must be service_role or admin of v_outbox.organization_id
    IF v_caller_role = 'service_role' OR current_user = 'service_role' THEN
        v_is_authorized := TRUE;
    ELSIF v_caller_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = v_outbox.organization_id
              AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator')
        ) OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = v_outbox.organization_id
              AND (rp.permission_key IN ('settings.manage', 'diagnostics.manage') OR rp.permission_key = '*')
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN: Cross-tenant or unauthorized attempt to modify notification outbox %', p_outbox_id;
    END IF;

    -- 4. Mutate record
    UPDATE public.system_notification_outbox
    SET status = p_status,
        attempt_count = attempt_count + 1,
        last_attempt_at = NOW(),
        last_error = p_error,
        sent_at = CASE WHEN p_status = 'SENT' THEN NOW() ELSE sent_at END,
        destination = COALESCE(p_destination, destination)
    WHERE id = p_outbox_id;

    -- 5. Reflect state back to incident if linked
    IF v_outbox.incident_id IS NOT NULL THEN
        UPDATE public.system_health_issues_log
        SET notification_state = CASE
                WHEN p_status = 'SENT' THEN 'SENT'
                WHEN p_status = 'BLOCKED_EXTERNAL_OWNER' THEN 'BLOCKED_GATE'
                WHEN p_status = 'FAILED' THEN 'DELIVERY_FAILED'
                ELSE notification_state
            END
        WHERE id = v_outbox.incident_id
          AND organization_id = v_outbox.organization_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'outbox_id', p_outbox_id,
        'organization_id', v_outbox.organization_id,
        'status', p_status,
        'attempts', v_outbox.attempt_count + 1
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_outbox_delivery_attempt_atomic(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_outbox_delivery_attempt_atomic(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- =================================================================================
-- PART 3: HARDEN record_monitoring_heartbeat & get_system_monitoring_status
-- =================================================================================
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
    v_caller_role TEXT := auth.role();
    v_is_authorized BOOLEAN := FALSE;
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
    END IF;

    IF v_target_org IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: Explicit organization context required to record heartbeat';
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
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_monitoring_heartbeat(UUID, TEXT, TEXT, INT, INT, TEXT, INT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_monitoring_heartbeat(UUID, TEXT, TEXT, INT, INT, TEXT, INT, JSONB) TO authenticated, service_role;


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
    v_caller_role TEXT := auth.role();
    v_target_org UUID := p_org_id;
    v_total_heartbeats INT;
    v_latest_heartbeat RECORD;
    v_pending_notifications INT;
    v_sent_notifications INT;
    v_failed_notifications INT;
    v_blocked_notifications INT;
    v_active_issues INT;
BEGIN
    IF v_caller_role = 'service_role' OR current_user = 'service_role' THEN
        v_target_org := COALESCE(p_org_id, v_target_org);
    ELSIF v_caller_id IS NOT NULL THEN
        SELECT COALESCE(organization_id, active_organization_id)
        INTO v_target_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF p_org_id IS NOT NULL AND p_org_id IS DISTINCT FROM v_target_org THEN
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
            v_target_org := p_org_id;
        END IF;
    END IF;

    IF v_target_org IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: Valid organization context required to fetch monitoring status';
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
            'blocked_owner_gates', v_blocked_notifications
        ),
        'active_issues', v_active_issues
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_monitoring_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_monitoring_status(UUID) TO authenticated, service_role;


-- =================================================================================
-- PART 4: HARDEN check_system_health_diagnostics (STRICT TENANT ISOLATION)
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
        -- Deny unauthenticated / anon callers
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

    -- Final Health Verdict
    RETURN jsonb_build_object(
        'is_healthy', (v_critical_count = 0 AND v_health_score >= 80),
        'health_score', GREATEST(0, v_health_score),
        'status', CASE 
            WHEN v_critical_count > 0 THEN 'DEFECT_DETECTED'
            WHEN v_warning_count > 0 OR v_health_score < 100 THEN 'DEGRADED'
            ELSE 'HEALTHY'
        END,
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
-- PART 5: REAL DATABASE-SIDE SCHEDULED HEALTH CHECK (ZERO FALSE GREEN)
-- =================================================================================
CREATE OR REPLACE FUNCTION public.run_scheduled_system_health_check(
    p_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_diag JSONB;
    v_status TEXT;
    v_health_score INT;
    v_critical_count INT;
    v_total_issues INT;
    v_heartbeat_id UUID;
    v_details JSONB;
BEGIN
    -- 1. Validate organization exists and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.organizations 
        WHERE id = p_org_id AND (is_active = TRUE OR status = 'ACTIVE')
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORGANIZATION_INACTIVE_OR_NOT_FOUND',
            'organization_id', p_org_id
        );
    END IF;

    -- 2. Execute REAL Diagnostic Engine
    BEGIN
        v_diag := public.check_system_health_diagnostics(p_org_id);
        
        v_status := v_diag->>'status';
        v_health_score := COALESCE((v_diag->>'health_score')::INT, 0);
        v_critical_count := COALESCE((v_diag->>'critical_count')::INT, 0);
        v_total_issues := COALESCE((v_diag->>'total_issues')::INT, 0);

        v_details := jsonb_build_object(
            'daemon', 'pg_cron',
            'tier', 'DATABASE_INTERNAL_REAL_DIAGNOSTICS',
            'critical_count', v_critical_count,
            'total_issues', v_total_issues,
            'duration_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time) * 1000)::INT,
            'timestamp', NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        -- Diagnostic execution failed: DO NOT report healthy! Record MONITOR_ERROR with score 0!
        v_status := 'MONITOR_ERROR';
        v_health_score := 0;
        v_critical_count := 1;
        v_total_issues := 1;
        v_details := jsonb_build_object(
            'daemon', 'pg_cron',
            'tier', 'DATABASE_INTERNAL_ERROR',
            'error', SQLERRM,
            'sqlstate', SQLSTATE,
            'duration_ms', EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time) * 1000)::INT,
            'timestamp', NOW()
        );
    END;

    -- 3. Record authentic heartbeat strictly from actual diagnostic results
    v_heartbeat_id := public.record_monitoring_heartbeat(
        p_org_id,
        'PG_CRON_INTERNAL',
        v_status,
        v_health_score,
        v_total_issues,
        'DB_INTERNAL_DAEMON',
        EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time) * 1000)::INT,
        v_details
    );

    RETURN jsonb_build_object(
        'success', true,
        'heartbeat_id', v_heartbeat_id,
        'organization_id', p_org_id,
        'status', v_status,
        'health_score', v_health_score,
        'total_issues', v_total_issues,
        'critical_count', v_critical_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.run_scheduled_system_health_check(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_scheduled_system_health_check(UUID) TO service_role;


-- =================================================================================
-- PART 6: PG_CRON MONITORING TELEMETRY PROBE & RE-REGISTRATION
-- =================================================================================
CREATE OR REPLACE FUNCTION public.get_pg_cron_monitoring_telemetry()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_has_cron BOOLEAN := FALSE;
    v_has_cron_job BOOLEAN := FALSE;
    v_job_id BIGINT;
    v_schedule TEXT;
    v_active BOOLEAN;
    v_job_name TEXT;
    v_recent_runs JSONB := '[]'::jsonb;
    v_sql TEXT;
    v_target_tbl TEXT;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_cron;
    IF NOT v_has_cron THEN
        RETURN jsonb_build_object(
            'available', false,
            'status', 'BLOCKED_PLATFORM_CAPABILITY',
            'reason', 'pg_cron extension is not enabled on this PostgreSQL instance'
        );
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'cron' AND table_name = 'job'
    ) INTO v_has_cron_job;

    IF NOT v_has_cron_job THEN
        RETURN jsonb_build_object(
            'available', false,
            'status', 'BLOCKED_PLATFORM_CAPABILITY',
            'reason', 'cron.job table does not exist in schema cron'
        );
    END IF;

    BEGIN
        v_target_tbl := 'cron.' || 'job';
        v_sql := format('SELECT jobid, schedule, active, jobname FROM %s WHERE jobname = $1 LIMIT 1', v_target_tbl);
        EXECUTE v_sql
        INTO v_job_id, v_schedule, v_active, v_job_name
        USING 'ohms-db-health-heartbeat';

        IF v_job_id IS NULL THEN
            RETURN jsonb_build_object(
                'available', true,
                'status', 'NOT_SCHEDULED',
                'reason', 'Job ohms-db-health-heartbeat not found in cron.job'
            );
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'cron' AND table_name = 'job_run_details') THEN
            v_target_tbl := 'cron.' || 'job_run_details';
            v_sql := format('SELECT COALESCE(jsonb_agg(jsonb_build_object(''runid'', runid, ''status'', status, ''return_message'', return_message, ''start_time'', start_time, ''end_time'', end_time)), ''[]''::jsonb) FROM (SELECT runid, status, return_message, start_time, end_time FROM %s WHERE jobid = $1 ORDER BY start_time DESC LIMIT 10) sub', v_target_tbl);
            EXECUTE v_sql
            INTO v_recent_runs
            USING v_job_id;
        END IF;

        RETURN jsonb_build_object(
            'available', true,
            'status', 'SCHEDULED',
            'job_id', v_job_id,
            'schedule', v_schedule,
            'active', v_active,
            'runs_count', jsonb_array_length(v_recent_runs),
            'recent_runs', v_recent_runs
        );
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'available', true,
            'status', 'ACCESS_DENIED_OR_TABLE_MISSING',
            'error', SQLERRM
        );
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pg_cron_monitoring_telemetry() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pg_cron_monitoring_telemetry() TO authenticated, service_role;

-- Re-register pg_cron with real diagnostic execution
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            -- Unschedule old fake constant heartbeat job
            PERFORM cron.unschedule('ohms-db-health-heartbeat')
            WHERE EXISTS (
                SELECT 1 FROM cron.job WHERE jobname = 'ohms-db-health-heartbeat'
            );

            -- Register autonomous probe that runs REAL diagnostics on each active tenant
            PERFORM cron.schedule(
                'ohms-db-health-heartbeat',
                '*/5 * * * *',
                $CRON$
                DO $TENANT_LOOP$
                DECLARE
                    org RECORD;
                BEGIN
                    FOR org IN SELECT id FROM public.organizations WHERE is_active = TRUE OR status = 'ACTIVE' LOOP
                        BEGIN
                            PERFORM public.run_scheduled_system_health_check(org.id);
                        EXCEPTION WHEN OTHERS THEN
                            RAISE WARNING 'Tenant % health check failed: %', org.id, SQLERRM;
                        END;
                    END LOOP;
                END $TENANT_LOOP$;
                $CRON$
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'pg_cron schedule registration skipped: %', SQLERRM;
        END;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension probe skipped: %', SQLERRM;
END $$;


-- =================================================================================
-- PART 7: FIX delete_hospital_expense_super_admin_atomic & cancel_or_delete_ipd
-- =================================================================================
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
    v_line RECORD;
    v_rev_je_id UUID;
    v_voucher_number TEXT;
BEGIN
    IF p_org_id IS NULL OR p_expense_id IS NULL OR p_admin_id IS NULL THEN
        RAISE EXCEPTION 'Organization ID, Expense ID, and Admin ID are mandatory.';
    END IF;

    IF TRIM(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'A valid deletion/void reason is mandatory and cannot be empty.';
    END IF;

    IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
        RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
    END IF;

    -- Strict Organization-Scoped Admin Verification
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
            JOIN public.user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = p_admin_id
              AND ur.organization_id = p_org_id
              AND (rp.permission_key IN ('accounting.manage', 'expenses.manage', 'expenses.delete') OR rp.permission_key = '*')
        ) INTO v_is_admin;
    END IF;

    IF NOT v_is_admin AND v_caller IS NOT NULL THEN
        RAISE EXCEPTION 'Unauthorized: Expense voucher deletion requires active financial administrative permissions in this organization.';
    END IF;

    SELECT * INTO v_exp
    FROM public.expenses
    WHERE id = p_expense_id AND organization_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Expense voucher record not found in specified organization.'
        );
    END IF;

    v_voucher_number := v_exp.voucher_number;

    -- Idempotent check
    IF v_exp.status IN ('VOIDED', 'VOID') AND NOT p_permanent_purge THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'ALREADY_VOIDED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher ' || v_voucher_number || ' is already voided with double-entry reversal posted.'
        );
    END IF;

    -- PERMANENT PURGE (Only allowed for VOIDED, DRAFT, or PENDING_APPROVAL)
    IF p_permanent_purge THEN
        IF v_exp.status NOT IN ('VOIDED', 'VOID', 'DRAFT', 'PENDING_APPROVAL') THEN
            RAISE EXCEPTION 'Permanent purge rejected: Active posted expense vouchers must first be VOIDED with double-entry reversal before permanent purge.';
        END IF;

        INSERT INTO public.audit_logs (
            organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
        ) VALUES (
            p_org_id, p_admin_id, 'PURGE', 'EXPENSES', 'expenses', p_expense_id::text,
            to_jsonb(v_exp),
            jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'permanent_purge', true, 'timestamp', NOW()),
            NOW()
        );

        -- Delete voucher record; balancing reversal journals in GL remain permanently intact!
        DELETE FROM public.expenses
        WHERE id = p_expense_id AND organization_id = p_org_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'mode', 'PURGED',
            'expense_id', p_expense_id,
            'voucher_number', v_voucher_number,
            'message', 'Expense voucher ' || v_voucher_number || ' permanently purged from expenses register while preserving double-entry GL audit entries.'
        );
    END IF;

    -- REVERSAL FOR POSTED/PAID/APPROVED VOUCHERS
    IF v_exp.journal_entry_id IS NOT NULL THEN
        SELECT * INTO v_je
        FROM public.journal_entries
        WHERE id = v_exp.journal_entry_id AND organization_id = p_org_id;

        IF FOUND THEN
            v_rev_je_number := 'REV-JV-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTRING(gen_random_uuid()::text FROM 1 FOR 4);

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
                posted_by
            ) VALUES (
                p_org_id,
                v_rev_je_number,
                CURRENT_DATE,
                'EXPENSE_REVERSAL',
                v_exp.id,
                'Reversal of voucher ' || v_voucher_number || ' (Reason: ' || p_reason || ')',
                'POSTED',
                COALESCE(v_je.total_debit, 0.00),
                COALESCE(v_je.total_credit, 0.00),
                p_admin_id
            ) RETURNING id INTO v_rev_je_id;

            FOR v_line IN 
                SELECT account_id, debit, credit, description
                FROM public.journal_entry_lines
                WHERE journal_entry_id = v_je.id
            LOOP
                INSERT INTO public.journal_entry_lines (
                    journal_entry_id,
                    account_id,
                    debit,
                    credit,
                    description
                ) VALUES (
                    v_rev_je_id,
                    v_line.account_id,
                    v_line.credit, -- Inverted for reversal
                    v_line.debit,  -- Inverted for reversal
                    'Reversal of ' || v_je.entry_number || ': ' || COALESCE(v_line.description, '')
                );
            END LOOP;
        END IF;
    END IF;

    UPDATE public.expenses
    SET status = 'VOIDED',
        voided_at = NOW(),
        voided_by = p_admin_id,
        void_reason = p_reason,
        notes = COALESCE(notes, '') || ' [VOIDED on ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ' by admin ' || p_admin_id::text || '. Reason: ' || p_reason || ']',
        updated_at = NOW()
    WHERE id = p_expense_id AND organization_id = p_org_id;

    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
    ) VALUES (
        p_org_id, p_admin_id, 'VOID', 'EXPENSES', 'expenses', p_expense_id::text,
        to_jsonb(v_exp),
        jsonb_build_object('voucher_number', v_voucher_number, 'reason', p_reason, 'reversal_journal_number', v_rev_je_number, 'timestamp', NOW()),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'mode', 'VOIDED',
        'expense_id', p_expense_id,
        'voucher_number', v_voucher_number,
        'message', 'Expense voucher successfully voided and double-entry reversal journal posted.',
        'reversal_journal_number', v_rev_je_number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_hospital_expense_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;


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

    -- Clean episode charges, summaries, vitals
    IF v_visit.episode_id IS NOT NULL THEN
        DELETE FROM public.episode_service_charges 
        WHERE episode_id = v_visit.episode_id 
          AND organization_id = p_org_id 
          AND status IN ('UNBILLED', 'PENDING');
    END IF;
    DELETE FROM public.discharge_summaries WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.nursing_notes WHERE visit_id = p_visit_id AND organization_id = p_org_id;
    DELETE FROM public.patient_vitals_rounds WHERE visit_id = p_visit_id AND organization_id = p_org_id;

    -- Delete or cancel visit
    IF p_permanent_delete THEN
        DELETE FROM public.patient_visits WHERE id = p_visit_id AND organization_id = p_org_id;
    ELSE
        UPDATE public.patient_visits
        SET status = 'discharged',
            discharged_at = NOW(),
            reason_for_visit = COALESCE(reason_for_visit, '') || ' [CANCELLED on ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || '. Reason: ' || p_reason || ']'
        WHERE id = p_visit_id AND organization_id = p_org_id;
    END IF;

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

REVOKE ALL ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;


-- =================================================================================
-- PART 8: GAAP-COMPLIANT REVERSAL MODEL IN delete_invoice_super_admin_atomic
-- =================================================================================
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
  v_inv_number TEXT;
  v_caller UUID;
  v_is_super BOOLEAN := FALSE;
  v_has_posted_journals BOOLEAN := FALSE;
BEGIN
  IF p_org_id IS NULL OR p_invoice_id IS NULL OR p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID, Invoice ID, and Admin ID are mandatory.';
  END IF;

  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Purge reason is mandatory and cannot be empty.';
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NOT NULL AND v_caller != p_admin_id THEN
    RAISE EXCEPTION 'Caller auth identity does not match administrative credentials.';
  END IF;

  -- Strict Organization-Scoped Admin Verification
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'super admin', 'superadmin', 'admin', 'hospital_admin', 'hospital_administrator')
  ) OR EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = p_admin_id
      AND ur.organization_id = p_org_id
      AND (rp.permission_key IN ('billing.manage', 'invoices.delete') OR rp.permission_key = '*')
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Unauthorized: Invoice deletion requires active administrative role in this hospital organization.';
  END IF;

  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id AND organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found or organization mismatch.');
  END IF;

  v_inv_number := v_inv.invoice_number;

  SELECT EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE reference_id = p_invoice_id
      AND status = 'POSTED'
  ) INTO v_has_posted_journals;

  -- Audit log
  INSERT INTO public.audit_logs (
    organization_id, user_id, action, module, entity_type, entity_id, old_values, new_values, created_at
  ) VALUES (
    p_org_id, p_admin_id,
    CASE WHEN p_permanent_purge THEN 'PURGE' ELSE 'VOID' END,
    'BILLING', 'invoices', p_invoice_id::text,
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

  -- GAAP Invariant: Never destroy posted financial history
  -- If posted journals exist, post an offsetting reversal journal via void_invoice_and_reverse_gl_atomic
  IF v_has_posted_journals THEN
    PERFORM public.void_invoice_and_reverse_gl_atomic(p_org_id, p_invoice_id, p_reason);
  END IF;

  IF p_permanent_purge THEN
    -- If draft or already voided with reversal, unlinking the invoice is permitted
    IF v_inv.status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT') AND v_inv.paid_amount > 0 THEN
      RAISE EXCEPTION 'Cannot permanently purge active settled invoice with payments. Invoice must be voided with reversal first.';
    END IF;

    DELETE FROM public.payment_reconciliations WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payment_intents WHERE invoice_id = p_invoice_id;
    DELETE FROM public.referral_commissions WHERE invoice_id = p_invoice_id;
    DELETE FROM public.insurance_claims WHERE invoice_id = p_invoice_id;
    DELETE FROM public.refunds WHERE invoice_id = p_invoice_id;
    DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoices WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'PURGED',
      'invoice_number', v_inv_number,
      'message', 'Invoice and associated sub-records unlinked while preserving double-entry GL audit entries intact.'
    );
  ELSE
    UPDATE public.invoices
    SET status = 'CANCELLED',
        notes = COALESCE(notes, '') || ' [CANCELLED on ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || ' by admin ' || p_admin_id::text || '. Reason: ' || p_reason || ']',
        updated_at = NOW()
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'CANCELLED',
      'invoice_number', v_inv_number,
      'message', 'Invoice marked as CANCELLED with double-entry journal reversal posted.'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice_super_admin_atomic(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
