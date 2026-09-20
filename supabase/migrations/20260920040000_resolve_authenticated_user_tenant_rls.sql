-- =====================================================================================
-- 20260920040000_resolve_authenticated_user_tenant_rls.sql
-- Onnesha Hospital Management System (OHMS) - Tenant RLS Resolver Hardening
--
-- Resolves authenticated user tenant RLS by dynamically extracting the caller's
-- active organization from profiles or user_roles when app.current_organization_id
-- is not explicitly passed in session context.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_current_org_id() 
RETURNS UUID AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- 1. Explicit transaction or session setting (highest priority: internal RPCs, cron, tests)
    BEGIN
        v_org_id := NULLIF(current_setting('app.current_organization_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_org_id := NULL;
    END;

    IF v_org_id IS NOT NULL THEN
        RETURN v_org_id;
    END IF;

    -- 2. Authenticated user session (Supabase PostgREST JWT caller)
    IF auth.uid() IS NOT NULL THEN
        -- Check active profile active_organization_id or organization_id
        SELECT COALESCE(active_organization_id, organization_id) INTO v_org_id
        FROM public.profiles
        WHERE id = auth.uid() AND is_active = TRUE;

        IF v_org_id IS NOT NULL THEN
            RETURN v_org_id;
        END IF;

        -- Fallback to active organization role mapping in user_roles
        SELECT organization_id INTO v_org_id
        FROM public.user_roles
        WHERE user_id = auth.uid()
        LIMIT 1;
    END IF;

    RETURN v_org_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.get_current_org_id() TO anon, authenticated, service_role;
