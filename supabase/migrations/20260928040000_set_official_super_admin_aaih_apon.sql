-- =====================================================================================
-- Migration: 20260928040000_set_official_super_admin_aaih_apon.sql
-- Description: Establishes aaih.apon@gmail.com as the official primary Super Admin
--              account and purges obsolete temporary/placeholder accounts while
--              preserving institutional fallback (admin@onneshahospital.com).
-- =====================================================================================

BEGIN;

DO $$
DECLARE
    v_target_email TEXT := 'aaih.apon@gmail.com';
    v_target_phone TEXT := '01781934805';
    v_target_name TEXT := 'Al Adal';
    v_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_role_id UUID := 'b0000000-0000-0000-0000-000000000001'::uuid;
    v_target_user_id UUID;
    v_obsolete_email TEXT := 'adnansadatmahin2@gmail.com';
    v_obsolete_user_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    -- 1. Locate Target Official Super Admin in auth.users
    SELECT id INTO v_target_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(v_target_email)
    LIMIT 1;

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'Target official Super Admin account (%) not found in auth.users', v_target_email;
    END IF;

    -- 2. Locate Obsolete account if present
    SELECT id INTO v_obsolete_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(v_obsolete_email)
    LIMIT 1;

    -- 3. Ensure Super Admin role exists
    SELECT id INTO v_role_id
    FROM public.roles
    WHERE organization_id = v_org_id AND LOWER(name) = 'super_admin'
    LIMIT 1;

    IF v_role_id IS NULL THEN
        v_role_id := 'b0000000-0000-0000-0000-000000000001'::uuid;
        INSERT INTO public.roles (id, organization_id, name, description, is_system)
        VALUES (v_role_id, v_org_id, 'super_admin', 'Full system access and tenant management', TRUE)
        ON CONFLICT (id) DO UPDATE SET name = 'super_admin', is_system = TRUE;
    END IF;

    -- Wildcard permission check
    INSERT INTO public.permissions (key, module, description)
    VALUES ('*', 'ALL', 'Full unrestricted super administrator permissions')
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_key)
    VALUES (v_role_id, '*')
    ON CONFLICT (role_id, permission_key) DO NOTHING;

    -- 4. Reassign all audit logs from obsolete user to official Super Admin
    IF v_obsolete_user_id IS NOT NULL THEN
        UPDATE public.audit_logs
        SET user_id = v_target_user_id
        WHERE user_id = v_obsolete_user_id;

        -- Remove obsolete employee record
        DELETE FROM public.employees
        WHERE profile_id = v_obsolete_user_id OR LOWER(email) = LOWER(v_obsolete_email);

        -- Remove obsolete role bindings
        DELETE FROM public.user_roles
        WHERE user_id = v_obsolete_user_id;

        -- Remove obsolete profile
        DELETE FROM public.profiles
        WHERE id = v_obsolete_user_id OR LOWER(email) = LOWER(v_obsolete_email);

        -- Remove obsolete auth identities & auth user
        DELETE FROM auth.identities
        WHERE user_id = v_obsolete_user_id;

        DELETE FROM auth.users
        WHERE id = v_obsolete_user_id;
    END IF;

    -- 5. Standardize Target auth.users state
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, v_now),
        email_change = '',
        phone = NULL,
        phone_confirmed_at = NULL,
        raw_user_meta_data = jsonb_build_object('full_name', v_target_name, 'email_verified', TRUE),
        raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        encrypted_password = extensions.crypt('OnneshaHospital@2026', extensions.gen_salt('bf', 10)),
        updated_at = v_now
    WHERE id = v_target_user_id;

    -- 6. Ensure auth.identities exists for official user
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_target_user_id,
        jsonb_build_object('sub', v_target_user_id::text, 'email', v_target_email, 'email_verified', TRUE),
        'email',
        v_target_user_id::text,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (provider, provider_id) DO UPDATE SET
        identity_data = jsonb_build_object('sub', v_target_user_id::text, 'email', v_target_email, 'email_verified', TRUE),
        updated_at = v_now;

    -- 7. Upsert public.profiles for official Super Admin
    INSERT INTO public.profiles (
        id,
        phone,
        full_name,
        email,
        is_active,
        organization_id,
        active_organization_id,
        must_change_password,
        account_status,
        employee_id,
        created_at,
        updated_at
    ) VALUES (
        v_target_user_id,
        v_target_phone,
        v_target_name,
        v_target_email,
        TRUE,
        v_org_id,
        v_org_id,
        TRUE,
        'ACTIVE',
        'EMP-SUPERADMIN-001',
        v_now,
        v_now
    )
    ON CONFLICT (id) DO UPDATE SET
        phone = EXCLUDED.phone,
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        is_active = TRUE,
        organization_id = v_org_id,
        active_organization_id = v_org_id,
        must_change_password = TRUE,
        account_status = 'ACTIVE',
        employee_id = 'EMP-SUPERADMIN-001',
        updated_at = v_now;

    -- 8. Assign Super Admin role to official user
    INSERT INTO public.user_roles (
        id,
        organization_id,
        user_id,
        role_id,
        created_at
    ) VALUES (
        gen_random_uuid(),
        v_org_id,
        v_target_user_id,
        v_role_id,
        v_now
    )
    ON CONFLICT (organization_id, user_id, role_id) DO NOTHING;

    -- 9. Upsert public.employees record for official Super Admin
    INSERT INTO public.employees (
        id,
        organization_id,
        profile_id,
        employee_code,
        full_name,
        phone,
        email,
        joining_date,
        basic_salary,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_org_id,
        v_target_user_id,
        'EMP-SUPERADMIN-001',
        v_target_name,
        v_target_phone,
        v_target_email,
        CURRENT_DATE,
        60000.00,
        'ACTIVE',
        v_now,
        v_now
    )
    ON CONFLICT (organization_id, employee_code) DO UPDATE SET
        profile_id = v_target_user_id,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        status = 'ACTIVE',
        updated_at = v_now;

    -- 10. Audit Log Entry
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
        v_org_id,
        v_target_user_id,
        'ESTABLISH_OFFICIAL_SUPER_ADMIN',
        'SECURITY_IAM',
        'super_admin',
        v_target_user_id::text,
        jsonb_build_object(
            'official_email', v_target_email,
            'official_name', v_target_name,
            'role', 'super_admin',
            'purged_obsolete_email', v_obsolete_email,
            'preserved_fallback_email', 'admin@onneshahospital.com',
            'timestamp', v_now
        ),
        v_now
    );

END;
$$;

COMMIT;
