-- =====================================================================================
-- Migration 44: Fix UUID aggregate function in get_current_org_id()
-- Ensures PostgreSQL type-compatibility by casting organization_id to text before MIN()
-- Pinned SECURITY DEFINER SET search_path = ''
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID;
    v_role_org_id UUID;
    v_role_org_count INT;
BEGIN
    -- 1. Explicit session GUC override
    v_org_id := NULLIF(pg_catalog.current_setting('app.current_organization_id', true), '')::uuid;

    IF v_org_id IS NOT NULL THEN
        -- If invoked by an authenticated user, verify that caller actually belongs to this organization
        IF auth.uid() IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.profiles
                WHERE id = auth.uid()
                  AND is_active = TRUE
                  AND (organization_id = v_org_id OR active_organization_id = v_org_id)
            ) AND NOT EXISTS (
                SELECT 1
                FROM public.user_roles
                WHERE user_id = auth.uid()
                  AND organization_id = v_org_id
            ) THEN
                -- Caller does not belong to the requested organization: fail closed!
                v_org_id := NULL;
            END IF;
        -- If invoked without authenticated session (anonymous / unprivileged), FAIL CLOSED
        -- Only trusted service_role backend processes are permitted to supply org without auth.uid()
        ELSIF current_user != 'service_role' AND (auth.role() IS NULL OR auth.role() != 'service_role') THEN
            v_org_id := NULL;
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
        -- PostgreSQL does not define MIN(uuid), so cast to text and convert back to uuid
        SELECT COUNT(DISTINCT organization_id), MIN(organization_id::text)::uuid
        INTO v_role_org_count, v_role_org_id
        FROM public.user_roles
        WHERE user_id = auth.uid();

        IF v_role_org_count = 1 THEN
            RETURN v_role_org_id;
        END IF;
    END IF;

    -- 3. Fail closed if not resolved
    RETURN NULL;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- Ensure execute grants
GRANT EXECUTE ON FUNCTION public.get_current_org_id() TO authenticated, service_role, anon;
