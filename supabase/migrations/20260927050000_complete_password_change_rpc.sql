-- =====================================================================================
-- Migration: 20260927050000_complete_password_change_rpc.sql
-- Description: Creates the authoritative complete_current_user_password_change RPC
--              to safely clear must_change_password flag upon verified password change.
--
-- Security Controls:
--   * SECURITY DEFINER with search_path = '' (no search path hijacking)
--   * Authenticated user bound strictly via auth.uid() (no arbitrary user mutation)
--   * Explicit schema qualification for all relation references (public.profiles, public.audit_logs)
--   * Strict EXECUTE grant to authenticated role only; REVOKE from PUBLIC
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.complete_current_user_password_change()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_now TIMESTAMPTZ := clock_timestamp();
    v_org_id UUID;
BEGIN
    -- 1. Fail closed if unauthenticated
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- 2. Update strictly the authenticated caller's profile
    UPDATE public.profiles
       SET must_change_password = FALSE,
           updated_at = v_now
     WHERE id = v_user_id
 RETURNING organization_id INTO v_org_id;

    -- 3. Fail closed if profile does not exist
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account profile not found.';
    END IF;

    -- 4. Record audit log entry for forensic accountability
    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values,
        created_at
    )
    VALUES (
        v_org_id,
        v_user_id,
        'UPDATE',
        'IAM',
        'staff_user',
        v_user_id::text,
        jsonb_build_object(
            'action', 'PASSWORD_CHANGE_COMPLETED',
            'must_change_password', FALSE
        ),
        v_now
    );

    -- 5. Return structured result
    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', v_user_id,
        'must_change_password', FALSE
    );
END;
$$;

-- Revoke from public and anon, grant strictly to authenticated users
REVOKE ALL ON FUNCTION public.complete_current_user_password_change() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_current_user_password_change() TO authenticated;

