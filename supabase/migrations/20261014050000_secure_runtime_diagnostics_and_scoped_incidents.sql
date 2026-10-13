-- OHMS migration 186: secure diagnostic RPCs and enforce tenant-scoped incident lifecycle.
-- Existing health/log RPCs were SECURITY DEFINER but accepted caller-supplied organizations;
-- the incident table policy also allowed anonymous full-table access. Fail closed by default.

BEGIN;

ALTER TABLE public.system_health_issues_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_health_issues_log'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_health_issues_log', v_policy.policyname);
  END LOOP;
END
$$;

-- Only authenticated users who belong to their currently active organization can read incidents.
CREATE POLICY system_health_issues_read_active_org
ON public.system_health_issues_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur
      ON ur.user_id = p.id
     AND ur.organization_id = public.system_health_issues_log.organization_id
    WHERE p.id = auth.uid()
      AND p.is_active IS DISTINCT FROM FALSE
      AND COALESCE(p.active_organization_id, p.organization_id) = public.system_health_issues_log.organization_id
  )
);

REVOKE ALL PRIVILEGES ON TABLE public.system_health_issues_log FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.system_health_issues_log FROM authenticated;
GRANT SELECT ON TABLE public.system_health_issues_log TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.system_health_issues_log TO service_role;

-- Runtime incident writes must go through this validated RPC, never through anonymous table access.
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
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_jwt_role TEXT := COALESCE(auth.role(), '');
  v_id UUID;
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
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur
      ON ur.user_id = p.id
     AND ur.organization_id = p_org_id
    WHERE p.id = v_user_id
      AND p.is_active IS DISTINCT FROM FALSE
      AND COALESCE(p.active_organization_id, p.organization_id) = p_org_id
  ) THEN
    RAISE EXCEPTION 'Active organization membership is required to record a system incident'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(UPPER(p_severity), 'CRITICAL') NOT IN ('CRITICAL', 'WARNING', 'INFO') THEN
    RAISE EXCEPTION 'Invalid system incident severity'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(BTRIM(p_module), '') IS NULL
     OR NULLIF(BTRIM(p_location), '') IS NULL
     OR NULLIF(BTRIM(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Incident module, location and reason are required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.system_health_issues_log (
    organization_id, module, location, severity, error_code, title,
    reason, recommendation, details, is_resolved, created_at
  ) VALUES (
    p_org_id,
    LEFT(BTRIM(p_module), 120),
    LEFT(BTRIM(p_location), 240),
    COALESCE(UPPER(p_severity), 'CRITICAL'),
    LEFT(COALESCE(NULLIF(BTRIM(p_error_code), ''), 'RUNTIME_ERROR'), 100),
    LEFT(COALESCE(NULLIF(BTRIM(p_title), ''), 'System operation failed'), 240),
    LEFT(BTRIM(p_reason), 4000),
    LEFT(COALESCE(NULLIF(BTRIM(p_recommendation), ''), 'Inspect the affected workflow and database logs.'), 2000),
    COALESCE(p_details, '{}'::jsonb),
    FALSE,
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Incident resolution is privileged. An issue ID takes precedence over module-wide resolution.
CREATE OR REPLACE FUNCTION public.resolve_system_runtime_issue(
  p_org_id UUID,
  p_module TEXT DEFAULT NULL,
  p_issue_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_jwt_role TEXT := COALESCE(auth.role(), '');
  v_count INT := 0;
BEGIN
  IF p_org_id IS NULL OR (p_issue_id IS NULL AND NULLIF(BTRIM(p_module), '') IS NULL) THEN
    RAISE EXCEPTION 'A valid organization and incident ID or module are required'
      USING ERRCODE = '22023';
  END IF;

  IF v_user_id IS NULL THEN
    IF v_jwt_role <> 'service_role' THEN
      RAISE EXCEPTION 'Authentication is required to resolve system incidents'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur
      ON ur.user_id = p.id
     AND ur.organization_id = p_org_id
    JOIN public.roles r
      ON r.id = ur.role_id
    WHERE p.id = v_user_id
      AND p.is_active IS DISTINCT FROM FALSE
      AND COALESCE(p.active_organization_id, p.organization_id) = p_org_id
      AND (
        LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator')
        OR EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.role_id = ur.role_id
            AND rp.permission_key IN ('system.health.resolve', 'accounting.manage', 'settings.manage_roles', '*')
        )
      )
  ) THEN
    RAISE EXCEPTION 'Administrative permission is required to resolve system incidents'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.system_health_issues_log
  SET is_resolved = TRUE,
      resolved_at = NOW()
  WHERE organization_id = p_org_id
    AND is_resolved = FALSE
    AND (
      CASE
        WHEN p_issue_id IS NOT NULL THEN id = p_issue_id
        ELSE module = p_module
      END
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- The raw health function is a privileged engine entry point. Authenticated UI uses
-- the no-argument wrapper below, which derives organization from the verified session.
REVOKE ALL ON FUNCTION public.check_system_health_diagnostics(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.check_system_health_diagnostics_for_current_org()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to inspect organization health'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(p.active_organization_id, p.organization_id)
  INTO v_org_id
  FROM public.profiles p
  WHERE p.id = v_user_id
    AND p.is_active IS DISTINCT FROM FALSE
  LIMIT 1;

  IF v_org_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id
      AND ur.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'A valid active organization membership is required for health diagnostics'
      USING ERRCODE = '42501';
  END IF;

  v_result := public.check_system_health_diagnostics(v_org_id);

  IF v_result IS NULL OR jsonb_typeof(v_result) <> 'object' THEN
    RAISE EXCEPTION 'Health diagnostic engine returned no valid result'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.check_system_health_diagnostics_for_current_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics_for_current_org() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_system_runtime_issue(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_runtime_issue(UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
