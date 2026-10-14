-- Migration 197: Harden System Runtime Incident Resolution Security & Enforce Strict Tenant Context
-- 1. Drop insecure overloaded variants
DROP FUNCTION IF EXISTS public.resolve_system_runtime_issue(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.resolve_system_runtime_issue(UUID, TEXT, UUID, TEXT);

-- 2. Create authoritative, strictly authenticated & tenant-scoped resolve_system_runtime_issue
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
BEGIN
    -- 1. Authentication & Security Enforcement:
    -- Anonymous / unauthenticated callers are strictly prohibited
    IF v_caller_role <> 'service_role' AND current_user <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHENTICATED_ACCESS_DENIED: Incident resolution requires an authenticated hospital operator session.';
        END IF;

        -- Check caller profile and bound organization
        SELECT COALESCE(active_organization_id, organization_id)
        INTO v_caller_org
        FROM public.profiles
        WHERE id = v_caller_id
        LIMIT 1;

        IF v_caller_org IS NULL THEN
            RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: No valid organization context found for caller profile.';
        END IF;

        -- Enforce tenant isolation: authenticated callers can only resolve for their own organization
        v_target_org := v_caller_org;

        -- Verify caller has hospital admin or diagnostics permission
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND (
                  r.name IN ('superadmin', 'hospital_admin', 'system_admin', 'admin')
                  OR EXISTS (
                      SELECT 1 FROM public.role_permissions rp
                      JOIN public.permissions p ON rp.permission_id = p.id
                      WHERE rp.role_id = r.id 
                        AND p.slug IN ('diagnostics.manage', 'diagnostics.view', 'settings.manage')
                  )
              )
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN_DIAGNOSTICS_ACCESS: Caller lacks permission to resolve system health incidents.';
        END IF;
    ELSE
        -- Service role execution
        IF v_target_org IS NULL THEN
            SELECT id INTO v_target_org
            FROM public.organizations
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;
    END IF;

    -- Strict check: Target org must never be null
    IF v_target_org IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_CONTEXT_REQUIRED: Target hospital organization context is required.';
    END IF;

    -- Strict check: Require at least one discriminator to prevent accidental full-table wipes
    IF p_issue_id IS NULL AND p_location IS NULL AND p_module IS NULL THEN
        RAISE EXCEPTION 'DISCRIMINATOR_REQUIRED: Must provide issue_id, location, or module to resolve specific incident.';
    END IF;

    -- Update and resolve target issues within the tenant boundary
    UPDATE public.system_health_issues_log
    SET is_resolved = TRUE,
        resolved_at = NOW(),
        lifecycle_status = 'RESOLVED_VERIFIED',
        verified_at = NOW(),
        verification_evidence = jsonb_build_object(
            'resolved_by', COALESCE(v_caller_id::text, 'service_role'),
            'resolved_at', NOW(),
            'target_org', v_target_org,
            'discriminator', jsonb_build_object(
                'issue_id', p_issue_id,
                'location', p_location,
                'module', p_module
            )
        )
    WHERE organization_id = v_target_org
      AND is_resolved = FALSE
      AND (p_issue_id IS NULL OR id = p_issue_id)
      AND (p_location IS NULL OR location = p_location)
      AND (p_module IS NULL OR module = p_module);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- 3. PERMISSIONS: Strictly authenticated and service_role ONLY. PUBLIC and anon are revoked.
REVOKE ALL ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
