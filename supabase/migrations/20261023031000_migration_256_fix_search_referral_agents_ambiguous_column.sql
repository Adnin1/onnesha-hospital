-- =====================================================================================
-- Migration 256: Resolve Column Reference Ambiguity in search_referral_agents_for_billing
-- Timestamp: 20261023031000
-- =====================================================================================

BEGIN;

-- 1. Redefine search_referral_agents_for_billing with explicit alias to eliminate ambiguous id
CREATE OR REPLACE FUNCTION public.search_referral_agents_for_billing(
    p_org_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_code VARCHAR(40),
    full_name VARCHAR(150),
    agent_type VARCHAR(50),
    phone VARCHAR(30),
    commission_rate_percent NUMERIC(5,2),
    is_commission_eligible BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        SELECT COALESCE(prof.active_organization_id, prof.organization_id)
        INTO v_active_org
        FROM public.profiles prof
        WHERE prof.id = v_calling_user;
    END IF;

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier', 'receptionist')
            ) OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = v_calling_user
                  AND (p.is_super_admin IS TRUE OR LOWER(TRIM(REPLACE(COALESCE(p.role, ''), ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier', 'receptionist'))
            ) OR (
                public.is_org_admin_or_has_permission(p_org_id, 'billing.create') OR
                public.is_org_admin_or_has_permission(p_org_id, 'billing.edit') OR
                public.is_org_admin_or_has_permission(p_org_id, 'billing.manage') OR
                public.is_org_admin_or_has_permission(p_org_id, 'billing.view') OR
                public.is_org_admin_or_has_permission(p_org_id, 'referral.view') OR
                public.is_org_admin_or_has_permission(p_org_id, 'referral.assign') OR
                public.is_org_admin_or_has_permission(p_org_id, 'referral.create') OR
                public.is_org_admin_or_has_permission(p_org_id, 'referral.manage') OR
                public.is_org_admin_or_has_permission(p_org_id, 'patients.create')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks billing cashier/edit authority' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        ra.id,
        ra.agent_code,
        ra.full_name,
        ra.agent_type,
        ra.phone,
        ra.commission_rate_percent,
        ra.is_commission_eligible
    FROM public.referral_agents ra
    WHERE ra.organization_id = p_org_id
      AND ra.is_active = TRUE
      AND ra.archived_at IS NULL
      AND (
          p_query IS NULL 
          OR TRIM(p_query) = ''
          OR ra.agent_code ILIKE '%' || TRIM(p_query) || '%'
          OR ra.full_name ILIKE '%' || TRIM(p_query) || '%'
          OR ra.phone ILIKE '%' || TRIM(p_query) || '%'
      )
    ORDER BY ra.full_name ASC
    LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) TO authenticated, service_role;

-- 2. Redefine get_current_user_permissions with explicit typed array initialization
CREATE OR REPLACE FUNCTION public.get_current_user_permissions(p_org_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_effective_org UUID;
  v_is_super BOOLEAN := FALSE;
  v_roles TEXT[] := ARRAY[]::TEXT[];
  v_perms TEXT[] := ARRAY[]::TEXT[];
  v_profile RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized');
  END IF;

  SELECT p.id, p.organization_id, p.active_organization_id, p.role, p.is_super_admin
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_caller_id
  LIMIT 1;

  v_effective_org := COALESCE(
    p_org_id,
    private.get_current_org_id(),
    v_profile.active_organization_id,
    v_profile.organization_id
  );

  v_is_super := (
    v_profile.is_super_admin IS TRUE
    OR LOWER(TRIM(REPLACE(COALESCE(v_profile.role, ''), ' ', '_'))) = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = v_caller_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = 'super_admin'
    )
  );

  -- Collect all active normalized role names for this user
  SELECT COALESCE(ARRAY_AGG(DISTINCT norm_role), ARRAY[]::TEXT[])
  INTO v_roles
  FROM (
    SELECT LOWER(TRIM(REPLACE(r.name, ' ', '_'))) AS norm_role
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = v_caller_id
      AND (v_effective_org IS NULL OR ur.organization_id = v_effective_org OR ur.organization_id IS NULL)
      AND ur.is_active IS NOT FALSE
    UNION
    SELECT LOWER(TRIM(REPLACE(v_profile.role, ' ', '_'))) AS norm_role
    WHERE v_profile.role IS NOT NULL AND TRIM(v_profile.role) <> ''
  ) sub
  WHERE norm_role IS NOT NULL AND norm_role <> '';

  -- Collect all active permissions
  IF v_is_super THEN
    v_perms := ARRAY['*']::TEXT[];
  ELSE
    SELECT COALESCE(ARRAY_AGG(DISTINCT rp.permission_key), ARRAY[]::TEXT[])
    INTO v_perms
    FROM public.role_permissions rp
    WHERE rp.role_id IN (
      SELECT ur.role_id
      FROM public.user_roles ur
      WHERE ur.user_id = v_caller_id
        AND (v_effective_org IS NULL OR ur.organization_id = v_effective_org OR ur.organization_id IS NULL)
        AND ur.is_active IS NOT FALSE
      UNION
      SELECT r.id
      FROM public.roles r
      WHERE (v_effective_org IS NULL OR r.organization_id = v_effective_org OR r.organization_id IS NULL)
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = ANY(v_roles)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_caller_id,
    'organization_id', v_effective_org,
    'is_super_admin', v_is_super,
    'roles', COALESCE(v_roles, ARRAY[]::TEXT[]),
    'permissions', COALESCE(v_perms, ARRAY[]::TEXT[])
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_permissions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_user_permissions(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_permissions(UUID) TO authenticated, service_role;

COMMIT;
