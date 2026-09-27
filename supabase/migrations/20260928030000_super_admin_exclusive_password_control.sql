-- =====================================================================================
-- Migration: 20260928030000_super_admin_exclusive_password_control.sql
-- Purpose:
--   1. Enforce STRICT Super Admin-only authorization for user password reset and credential control
--   2. Restrict public.admin_reset_staff_password exclusively to super_admin role
--   3. Provide comprehensive audit logging in public.audit_logs for all credential changes
--   4. Expose password status, must_change_password, and last credential update timestamp
-- =====================================================================================

-- 1. Helper to strictly verify that caller is a verified Super Admin
CREATE OR REPLACE FUNCTION public.check_is_super_admin_caller(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_super BOOLEAN := FALSE;
BEGIN
    IF v_caller IS NULL THEN
        IF current_user = 'service_role' THEN
            RETURN TRUE;
        END IF;
        RETURN FALSE;
    END IF;

    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_caller
          AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'super admin')
    ) INTO v_is_super;

    RETURN v_is_super;
END;
$$;

-- 2. Restrict staff.reset_password permission solely to super_admin
DELETE FROM public.role_permissions
WHERE permission_key = 'staff.reset_password'
  AND role_id != 'b0000000-0000-0000-0000-000000000001';

INSERT INTO public.role_permissions (role_id, permission_key)
VALUES ('b0000000-0000-0000-0000-000000000001', 'staff.reset_password')
ON CONFLICT DO NOTHING;

-- 3. Update admin_reset_staff_password to enforce SUPER ADMIN ONLY
CREATE OR REPLACE FUNCTION public.admin_reset_staff_password(
    p_org_id          UUID,
    p_target_user_id  UUID,
    p_temp_password   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id       UUID := auth.uid();
    v_enc_pass        TEXT;
    v_user_email      TEXT;
    v_user_full_name  TEXT;
    v_now             TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Strict Super Admin Check: ONLY Super Admin has authority to change/reset passwords
    IF NOT public.check_is_super_admin_caller(p_org_id) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admin has authorization to reset or change user passwords.';
    END IF;

    IF p_temp_password IS NULL OR LENGTH(p_temp_password) < 8 THEN
        RAISE EXCEPTION 'Password must be at least 8 characters long.';
    END IF;

    SELECT email, full_name INTO v_user_email, v_user_full_name
    FROM public.profiles
    WHERE id = p_target_user_id AND (organization_id = p_org_id OR active_organization_id = p_org_id);

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'Target user not found or does not belong to this organization.';
    END IF;

    -- Encrypt with bcrypt
    v_enc_pass := extensions.crypt(p_temp_password, extensions.gen_salt('bf'));

    -- 2. Update auth.users password
    UPDATE auth.users
    SET encrypted_password = v_enc_pass,
        updated_at = v_now
    WHERE id = p_target_user_id;

    -- 3. Set must_change_password = true on profiles for initial credential enforcement
    UPDATE public.profiles
    SET must_change_password = TRUE,
        updated_at = v_now
    WHERE id = p_target_user_id;

    -- 4. Session Revocation: terminate all active sessions of target user immediately
    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;

    -- 5. Record Immutable Forensic Audit Log in public.audit_logs
    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values,
        created_at
    ) VALUES (
        p_org_id,
        v_caller_id,
        'UPDATE',
        'SECURITY_IAM',
        'auth_credentials',
        p_target_user_id::text,
        jsonb_build_object(
            'event', 'ADMIN_PASSWORD_RESET',
            'target_user_id', p_target_user_id,
            'target_name', v_user_full_name,
            'target_email', v_user_email,
            'performed_by_super_admin', v_caller_id,
            'must_change_password', TRUE,
            'sessions_revoked', TRUE,
            'status', 'SUCCESS'
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'email', v_user_email,
        'full_name', v_user_full_name,
        'must_change_password', TRUE,
        'updated_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_is_super_admin_caller(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_staff_password(UUID, UUID, TEXT) TO authenticated, service_role;
