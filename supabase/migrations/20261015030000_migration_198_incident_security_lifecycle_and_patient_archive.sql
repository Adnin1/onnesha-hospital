-- =================================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS ERP)
-- MIGRATION 198: INCIDENT SECURITY LIFECYCLE, TENANT HARDENING & PATIENT ARCHIVE
-- 1. Eliminates service_role first-organization fallback (ORGANIZATION_CONTEXT_REQUIRED).
-- 2. Enforces strict tenant-scoped role authorization (ur.organization_id = target_org).
-- 3. Revokes diagnostics.view from incident mutation/resolution authority.
-- 4. Replaces direct RESOLVED_VERIFIED mutation with true lifecycle:
--    OPEN -> ACKNOWLEDGED -> REMEDIATION_PENDING -> VERIFYING -> RESOLVED_VERIFIED.
-- 5. Implements authoritative verify_system_incident_resolution RPC with domain reproducers.
-- 6. Implements acknowledge_system_incident RPC (is_resolved remains FALSE).
-- 7. Adds patient archive columns (is_deleted, deleted_at, deleted_by, deletion_reason).
-- =================================================================================

-- 1. PATIENT ARCHIVE / SOFT-DELETE SCHEMA FOUNDATION
ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_is_deleted_org 
    ON public.patients (organization_id, is_deleted);

-- 2. INCIDENT ACKNOWLEDGEMENT RPC (OPERATOR ACKNOWLEDGEMENT)
-- Sets lifecycle_status = 'ACKNOWLEDGED', records audit evidence, but is_resolved REMAINS FALSE.
CREATE OR REPLACE FUNCTION public.acknowledge_system_incident(
    p_incident_id UUID,
    p_org_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := auth.role();
    v_caller_org UUID;
    v_target_org UUID := p_org_id;
    v_incident RECORD;
BEGIN
    -- Security Check: Anonymous / unauthenticated callers strictly prohibited
    IF v_caller_role <> 'service_role' AND current_user <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHENTICATED_ACCESS_DENIED: Incident acknowledgement requires an authenticated operator session.';
        END IF;

        SELECT COALESCE(active_organization_id, organization_id)
        INTO v_caller_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF v_caller_org IS NULL THEN
            RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: No valid organization context found for caller profile.';
        END IF;

        IF p_org_id IS NOT NULL AND p_org_id <> v_caller_org THEN
            RAISE EXCEPTION 'TENANT_VIOLATION_DENIED: Cannot acknowledge incidents belonging to another hospital organization.';
        END IF;

        v_target_org := v_caller_org;

        -- Strict tenant-scoped role authorization (diagnostics.view is strictly denied)
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = v_target_org
              AND (
                  r.name IN ('superadmin', 'hospital_admin', 'system_admin', 'admin')
                  OR EXISTS (
                      SELECT 1 FROM public.role_permissions rp
                      JOIN public.permissions p ON rp.permission_id = p.id
                      WHERE rp.role_id = r.id 
                        AND p.slug IN ('diagnostics.manage', 'incident.resolve', 'settings.manage')
                  )
              )
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_DIAGNOSTICS_ACCESS: Caller lacks explicit management authority to acknowledge system incidents.';
        END IF;
    ELSE
        -- Service role execution: Explicit organization context is mandatory (NO first-org fallback)
        IF v_target_org IS NULL THEN
            RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: Explicit target organization UUID is mandatory for service_role incident acknowledgement.';
        END IF;
    END IF;

    -- Load exact incident
    SELECT * INTO v_incident
    FROM public.system_health_issues_log
    WHERE id = p_incident_id
      AND organization_id = v_target_org;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INCIDENT_NOT_FOUND: No incident found matching id % for organization %.', p_incident_id, v_target_org;
    END IF;

    -- Update lifecycle state to ACKNOWLEDGED (is_resolved remains FALSE!)
    UPDATE public.system_health_issues_log
    SET lifecycle_status = 'ACKNOWLEDGED',
        last_occurred_at = NOW(),
        verification_evidence = jsonb_set(
            COALESCE(verification_evidence, '{}'::jsonb),
            '{acknowledgement}',
            jsonb_build_object(
                'acknowledged_by', COALESCE(v_caller_id::text, 'service_role'),
                'acknowledged_at', NOW(),
                'notes', COALESCE(p_notes, 'Operator acknowledged incident for remediation.')
            )
        )
    WHERE id = p_incident_id
      AND organization_id = v_target_org;

    RETURN jsonb_build_object(
        'success', true,
        'incident_id', p_incident_id,
        'lifecycle_status', 'ACKNOWLEDGED',
        'is_resolved', false,
        'message', 'Incident acknowledged. Remains open until verified.'
    );
END;
$$;

-- 3. AUTHORITATIVE INCIDENT VERIFICATION RPC (REPRODUCER / DOMAIN AUDIT)
-- Loads exact incident, tests domain invariant conditions, and only sets
-- lifecycle_status = 'RESOLVED_VERIFIED' and is_resolved = TRUE if verified clean.
CREATE OR REPLACE FUNCTION public.verify_system_incident_resolution(
    p_incident_id UUID,
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
    v_caller_org UUID;
    v_target_org UUID := p_org_id;
    v_incident RECORD;
    v_violation_count INT := 0;
    v_violation_details TEXT := '';
    v_verified BOOLEAN := FALSE;
BEGIN
    -- Security Check
    IF v_caller_role <> 'service_role' AND current_user <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHENTICATED_ACCESS_DENIED: Incident verification requires an authenticated operator session.';
        END IF;

        SELECT COALESCE(active_organization_id, organization_id)
        INTO v_caller_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF v_caller_org IS NULL THEN
            RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: No valid organization context found for caller profile.';
        END IF;

        IF p_org_id IS NOT NULL AND p_org_id <> v_caller_org THEN
            RAISE EXCEPTION 'TENANT_VIOLATION_DENIED: Cannot verify incidents belonging to another hospital organization.';
        END IF;

        v_target_org := v_caller_org;

        -- Strict tenant-scoped role authorization (diagnostics.view is strictly denied)
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = v_target_org
              AND (
                  r.name IN ('superadmin', 'hospital_admin', 'system_admin', 'admin')
                  OR EXISTS (
                      SELECT 1 FROM public.role_permissions rp
                      JOIN public.permissions p ON rp.permission_id = p.id
                      WHERE rp.role_id = r.id 
                        AND p.slug IN ('diagnostics.manage', 'incident.resolve', 'settings.manage')
                  )
              )
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_DIAGNOSTICS_ACCESS: Caller lacks explicit authority to verify system incidents.';
        END IF;
    ELSE
        -- Service role execution: Explicit organization context is mandatory (NO first-org fallback)
        IF v_target_org IS NULL THEN
            RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: Explicit target organization UUID is mandatory for service_role incident verification.';
        END IF;
    END IF;

    -- Load exact persisted incident
    SELECT * INTO v_incident
    FROM public.system_health_issues_log
    WHERE id = p_incident_id
      AND organization_id = v_target_org;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INCIDENT_NOT_FOUND: No incident found matching id % for organization %.', p_incident_id, v_target_org;
    END IF;

    -- -------------------------------------------------------------------------
    -- DOMAIN VERIFICATION REPRODUCERS
    -- -------------------------------------------------------------------------
    
    -- Case 1: Billing & Invoice Arithmetic
    IF v_incident.module = 'BILLING' 
       OR v_incident.location LIKE '%invoice%' 
       OR v_incident.fingerprint LIKE '%INVOICE%'
       OR v_incident.fingerprint LIKE '%ARITHMETIC%' THEN
        SELECT COUNT(*), STRING_AGG(invoice_number, ', ')
        INTO v_violation_count, v_violation_details
        FROM public.invoices
        WHERE organization_id = v_target_org
          AND (status IS NULL OR status <> 'CANCELLED')
          AND (
              ABS(grand_total - (COALESCE(paid_amount, 0) + COALESCE(due_amount, 0))) > 0.05
              OR COALESCE(due_amount, 0) < -0.05
              OR COALESCE(paid_amount, 0) < -0.05
          );

        IF v_violation_count = 0 THEN
            v_verified := TRUE;
        END IF;

    -- Case 2: General Ledger & Accounting Inbalance
    ELSIF v_incident.module = 'ACCOUNTING' 
       OR v_incident.location LIKE '%journal%' 
       OR v_incident.fingerprint LIKE '%JOURNAL%' THEN
        SELECT COUNT(*)
        INTO v_violation_count
        FROM (
            SELECT je.id
            FROM public.journal_entries je
            JOIN public.journal_entry_lines jel ON je.id = jel.journal_entry_id
            WHERE je.organization_id = v_target_org
              AND je.status = 'POSTED'
            GROUP BY je.id
            HAVING ABS(SUM(jel.debit) - SUM(jel.credit)) > 0.01
        ) unb;

        IF v_violation_count = 0 THEN
            v_verified := TRUE;
        END IF;

    -- Case 3: Bed Inventory Drift
    ELSIF v_incident.module = 'BEDS' 
       OR v_incident.location LIKE '%bed%' 
       OR v_incident.fingerprint LIKE '%BED%' THEN
        SELECT COUNT(*)
        INTO v_violation_count
        FROM public.beds b
        LEFT JOIN public.admissions a ON b.id = a.bed_id AND a.status = 'ADMITTED'
        WHERE b.organization_id = v_target_org
          AND b.status = 'OCCUPIED' AND a.id IS NULL;

        IF v_violation_count = 0 THEN
            v_verified := TRUE;
        END IF;

    -- Case 4: Default / Generic Diagnostic Incident
    ELSE
        -- For other general runtime incidents, verify that no active unresolved
        -- trigger failure or outbox delivery error remains for this fingerprint
        IF v_incident.fingerprint IS NOT NULL THEN
            SELECT COUNT(*)
            INTO v_violation_count
            FROM public.system_notification_outbox
            WHERE organization_id = v_target_org
              AND incident_id = p_incident_id
              AND status = 'FAILED'
              AND attempt_count >= max_attempts;
        ELSE
            v_violation_count := 0;
        END IF;

        IF v_violation_count = 0 THEN
            v_verified := TRUE;
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- LIFECYCLE TRANSITION BASED ON EMPIRICAL VERIFICATION
    -- -------------------------------------------------------------------------
    IF v_verified THEN
        UPDATE public.system_health_issues_log
        SET is_resolved = TRUE,
            resolved_at = NOW(),
            lifecycle_status = 'RESOLVED_VERIFIED',
            verified_at = NOW(),
            verification_evidence = jsonb_set(
                COALESCE(verification_evidence, '{}'::jsonb),
                '{verification}',
                jsonb_build_object(
                    'verifier', COALESCE(v_caller_id::text, 'service_role'),
                    'verified_at', NOW(),
                    'verdict', 'PASS',
                    'reproducer_violation_count', 0
                )
            )
        WHERE id = p_incident_id
          AND organization_id = v_target_org;

        RETURN jsonb_build_object(
            'success', true,
            'verified', true,
            'incident_id', p_incident_id,
            'lifecycle_status', 'RESOLVED_VERIFIED',
            'is_resolved', true,
            'message', 'Incident verified clean and marked RESOLVED_VERIFIED.'
        );
    ELSE
        -- Verification FAILED: Keep unresolved and mark REMEDIATION_PENDING
        UPDATE public.system_health_issues_log
        SET is_resolved = FALSE,
            lifecycle_status = 'REMEDIATION_PENDING',
            last_occurred_at = NOW(),
            verification_evidence = jsonb_set(
                COALESCE(verification_evidence, '{}'::jsonb),
                '{verification}',
                jsonb_build_object(
                    'verifier', COALESCE(v_caller_id::text, 'service_role'),
                    'verified_at', NOW(),
                    'verdict', 'FAIL',
                    'reproducer_violation_count', v_violation_count,
                    'details', v_violation_details
                )
            )
        WHERE id = p_incident_id
          AND organization_id = v_target_org;

        RETURN jsonb_build_object(
            'success', false,
            'verified', false,
            'incident_id', p_incident_id,
            'lifecycle_status', 'REMEDIATION_PENDING',
            'is_resolved', false,
            'violation_count', v_violation_count,
            'error', 'Authoritative verification failed. Underlying condition still active in tenant database.'
        );
    END IF;
END;
$$;

-- 4. HARDENED resolve_system_runtime_issue (UPGRADE TO STRICT SECURITY & LIFECYCLE)
-- Removes service_role first-org fallback, strictly enforces caller organization binding,
-- and routes single incident resolution through authoritative verification.
CREATE OR REPLACE FUNCTION public.resolve_system_runtime_issue(
    p_org_id UUID DEFAULT NULL,
    p_module TEXT DEFAULT NULL,
    p_issue_id UUID DEFAULT NULL,
    p_location TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT := auth.role();
    v_caller_org UUID;
    v_target_org UUID := p_org_id;
    v_count INT := 0;
    v_rec RECORD;
    v_verif JSONB;
BEGIN
    -- Security Check
    IF v_caller_role <> 'service_role' AND current_user <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHENTICATED_ACCESS_DENIED: Incident resolution requires an authenticated operator session.';
        END IF;

        SELECT COALESCE(active_organization_id, organization_id)
        INTO v_caller_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF v_caller_org IS NULL THEN
            RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: No valid organization context found for caller profile.';
        END IF;

        IF p_org_id IS NOT NULL AND p_org_id <> v_caller_org THEN
            RAISE EXCEPTION 'TENANT_VIOLATION_DENIED: Cannot resolve incidents belonging to another hospital organization.';
        END IF;

        v_target_org := v_caller_org;

        -- Strict tenant-scoped role authorization (diagnostics.view is strictly denied)
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = v_target_org
              AND (
                  r.name IN ('superadmin', 'hospital_admin', 'system_admin', 'admin')
                  OR EXISTS (
                      SELECT 1 FROM public.role_permissions rp
                      JOIN public.permissions p ON rp.permission_id = p.id
                      WHERE rp.role_id = r.id 
                        AND p.slug IN ('diagnostics.manage', 'incident.resolve', 'settings.manage')
                  )
              )
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_DIAGNOSTICS_ACCESS: Caller lacks explicit authority to resolve system health incidents.';
        END IF;
    ELSE
        -- Service role execution: Explicit organization context is mandatory (NO first-org fallback)
        IF v_target_org IS NULL THEN
            RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: Target hospital organization context is required for service_role.';
        END IF;
    END IF;

    -- Require at least one discriminator to prevent accidental full-table wipes
    IF p_issue_id IS NULL AND p_location IS NULL AND p_module IS NULL THEN
        RAISE EXCEPTION 'DISCRIMINATOR_REQUIRED: Must provide issue_id, location, or module to target specific incidents.';
    END IF;

    -- If targeting a single incident, execute authoritative verification
    IF p_issue_id IS NOT NULL THEN
        v_verif := public.verify_system_incident_resolution(p_issue_id, v_target_org);
        IF (v_verif->>'verified')::boolean = TRUE THEN
            RETURN 1;
        ELSE
            RETURN 0;
        END IF;
    END IF;

    -- If targeting by module or location, iterate through candidate incidents and verify each
    FOR v_rec IN 
        SELECT id FROM public.system_health_issues_log
        WHERE organization_id = v_target_org
          AND is_resolved = FALSE
          AND (p_location IS NULL OR location = p_location)
          AND (p_module IS NULL OR module = p_module)
    LOOP
        v_verif := public.verify_system_incident_resolution(v_rec.id, v_target_org);
        IF (v_verif->>'verified')::boolean = TRUE THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$;

-- 5. PERMISSIONS & ROLE GRANTS
REVOKE ALL ON FUNCTION public.acknowledge_system_incident(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_system_incident(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_system_incident_resolution(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_system_incident_resolution(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
