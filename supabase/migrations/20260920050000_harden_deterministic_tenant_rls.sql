-- =====================================================================================
-- 20260920050000_harden_deterministic_tenant_rls.sql
-- Onnesha Hospital Management System (OHMS) - Deterministic Tenant RLS Resolver Hardening
--
-- Migration 42:
-- 1. Validates caller's authenticated membership (auth.uid()) against public.profiles
--    and public.user_roles before honoring app.current_organization_id session GUC.
-- 2. When app.current_organization_id is omitted:
--    - Resolves active organization from public.profiles (active_organization_id or organization_id).
--    - If profiles has no active org, checks public.user_roles:
--      If the user belongs to EXACTLY ONE distinct organization, returns that organization.
--      If the user belongs to MULTIPLE distinct organizations or ZERO, FAILS CLOSED (returns NULL).
--    - Eliminates non-deterministic LIMIT 1 fallback to prevent cross-tenant data leaks.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_current_org_id() 
RETURNS UUID AS $$
DECLARE
    v_org_id UUID;
    v_role_org_count INTEGER;
    v_role_org_id UUID;
BEGIN
    -- 1. Explicit transaction or session setting
    BEGIN
        v_org_id := NULLIF(current_setting('app.current_organization_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_org_id := NULL;
    END;

    -- If caller supplied an organization ID in session context:
    IF v_org_id IS NOT NULL THEN
        -- If invoked by an authenticated user (JWT caller), verify their active membership
        IF auth.uid() IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() 
                  AND is_active = TRUE 
                  AND (organization_id = v_org_id OR active_organization_id = v_org_id)
                UNION
                SELECT 1 FROM public.user_roles
                WHERE user_id = auth.uid() 
                  AND organization_id = v_org_id
            ) THEN
                -- Caller does not belong to the requested organization: fail closed!
                v_org_id := NULL;
            END IF;
        END IF;

        IF v_org_id IS NOT NULL THEN
            RETURN v_org_id;
        END IF;
    END IF;

    -- 2. Authenticated user session fallback (Supabase PostgREST JWT caller)
    IF auth.uid() IS NOT NULL THEN
        -- Check active profile active_organization_id or organization_id
        SELECT COALESCE(active_organization_id, organization_id) INTO v_org_id
        FROM public.profiles
        WHERE id = auth.uid() AND is_active = TRUE;

        IF v_org_id IS NOT NULL THEN
            RETURN v_org_id;
        END IF;

        -- Fallback to distinct organization mapping in user_roles
        -- Deterministic: if and only if the user belongs to exactly one distinct organization
        SELECT COUNT(DISTINCT organization_id), MIN(organization_id)
        INTO v_role_org_count, v_role_org_id
        FROM public.user_roles
        WHERE user_id = auth.uid();

        IF v_role_org_count = 1 THEN
            RETURN v_role_org_id;
        END IF;

        -- If user has multiple distinct organizations without an active profile selection,
        -- fail closed to prevent ambiguous cross-tenant access.
        RETURN NULL;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.get_current_org_id() TO anon, authenticated, service_role;
