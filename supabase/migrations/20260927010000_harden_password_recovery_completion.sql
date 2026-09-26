-- =====================================================================================
-- 068: Harden password recovery completion
-- Ensures a successful Supabase Auth password update also clears the application-level
-- temporary-password flag through a narrow SECURITY DEFINER RPC owned by the current user.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.complete_current_user_password_change()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    UPDATE public.profiles
    SET must_change_password = FALSE,
        updated_at = v_now
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account profile not found.';
    END IF;

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
    SELECT
        p.organization_id,
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
    FROM public.profiles p
    WHERE p.id = v_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', v_user_id,
        'must_change_password', FALSE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_current_user_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_current_user_password_change() TO authenticated;
