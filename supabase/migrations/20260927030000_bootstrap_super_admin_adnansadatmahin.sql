-- =====================================================================================
-- Migration: 20260927030000_bootstrap_super_admin_adnansadatmahin.sql
-- Purpose:
--   1. Authoritative Super Admin Provisioning for adnansadatmahin2@gmail.com
--   2. Phone: 01629286887
--   3. Organization: Onnesha Hospital & Diagnostic Complex ('a0000000-0000-0000-0000-000000000001')
--   4. Role: super_admin ('b0000000-0000-0000-0000-000000000001')
--   5. Full linkage: auth.users, auth.identities, public.profiles, public.employees, public.user_roles
--   6. Auto-binding trigger on auth.users for permanent resilience
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_super_admin_account(
    p_email TEXT DEFAULT 'adnansadatmahin2@gmail.com',
    p_phone TEXT DEFAULT '01629286887',
    p_full_name TEXT DEFAULT 'Adnan Sadat Mahin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_email TEXT := LOWER(TRIM(p_email));
    v_clean_phone TEXT := TRIM(p_phone);
    v_full_name TEXT := TRIM(p_full_name);
    v_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_role_id UUID := 'b0000000-0000-0000-0000-000000000001'::uuid;
    v_user_id UUID;
    v_employee_id UUID;
    v_employee_code VARCHAR(30) := 'EMP-SUPERADMIN-001';
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Ensure Target Organization Exists
    INSERT INTO public.organizations (id, name, code, phone, email, address, status, is_active)
    VALUES (
        v_org_id,
        'Onnesha Hospital & Diagnostic Complex',
        'OH',
        '01712-345678',
        'info@onneshahospital.com',
        'Hospital Road, Main Bazar, Dhaka, Bangladesh',
        'ACTIVE',
        TRUE
    )
    ON CONFLICT (id) DO UPDATE SET
        is_active = TRUE,
        status = 'ACTIVE';

    -- 2. Ensure Super Admin Role Exists
    SELECT id INTO v_role_id
    FROM public.roles
    WHERE organization_id = v_org_id AND LOWER(name) IN ('super_admin', 'super admin')
    LIMIT 1;

    IF v_role_id IS NULL THEN
        v_role_id := 'b0000000-0000-0000-0000-000000000001'::uuid;
        INSERT INTO public.roles (id, organization_id, name, description, is_system)
        VALUES (v_role_id, v_org_id, 'super_admin', 'Full system access and tenant management', TRUE)
        ON CONFLICT (id) DO UPDATE SET name = 'super_admin', is_system = TRUE;
    END IF;

    -- 3. Resolve or Create auth.users Entry
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_clean_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            phone,
            phone_confirmed_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            v_user_id,
            'authenticated',
            'authenticated',
            v_clean_email,
            extensions.crypt('OnneshaHospital@2026', extensions.gen_salt('bf')),
            v_now,
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            jsonb_build_object('full_name', v_full_name, 'email_verified', TRUE),
            v_now,
            v_now,
            v_clean_phone,
            v_now
        );
    ELSE
        UPDATE auth.users
        SET email_confirmed_at = COALESCE(email_confirmed_at, v_now),
            raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', v_full_name, 'email_verified', TRUE),
            updated_at = v_now
        WHERE id = v_user_id;
    END IF;

    -- 4. Ensure auth.identities Exists
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
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email, 'email_verified', TRUE),
        'email',
        v_user_id::text,
        v_now,
        v_now,
        v_now
    )
    ON CONFLICT (provider, provider_id) DO UPDATE SET
        identity_data = jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email, 'email_verified', TRUE),
        updated_at = v_now;

    -- 5. Clear conflicting phone on other non-primary accounts to preserve UNIQUE constraint
    UPDATE public.profiles
    SET phone = phone || '-dup-' || substring(gen_random_uuid()::text from 1 for 4)
    WHERE phone = v_clean_phone AND id <> v_user_id;

    -- 6. Upsert public.profiles
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
        v_user_id,
        v_clean_phone,
        v_full_name,
        v_clean_email,
        TRUE,
        v_org_id,
        v_org_id,
        FALSE,
        'ACTIVE',
        v_employee_code,
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
        must_change_password = FALSE,
        account_status = 'ACTIVE',
        employee_id = COALESCE(profiles.employee_id, EXCLUDED.employee_id),
        updated_at = v_now;

    -- 7. Ensure Super Admin user_roles Mapping
    INSERT INTO public.user_roles (
        id,
        organization_id,
        user_id,
        role_id,
        created_at
    ) VALUES (
        gen_random_uuid(),
        v_org_id,
        v_user_id,
        v_role_id,
        v_now
    )
    ON CONFLICT (organization_id, user_id, role_id) DO NOTHING;

    -- 8. Ensure public.employees Record
    SELECT id INTO v_employee_id
    FROM public.employees
    WHERE profile_id = v_user_id OR email = v_clean_email
    LIMIT 1;

    IF v_employee_id IS NULL THEN
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
            v_user_id,
            v_employee_code,
            v_full_name,
            v_clean_phone,
            v_clean_email,
            CURRENT_DATE,
            50000.00,
            'ACTIVE',
            v_now,
            v_now
        )
        ON CONFLICT (organization_id, employee_code) DO UPDATE SET
            profile_id = v_user_id,
            full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            status = 'ACTIVE',
            updated_at = v_now;
    ELSE
        UPDATE public.employees
        SET profile_id = v_user_id,
            full_name = v_full_name,
            phone = v_clean_phone,
            email = v_clean_email,
            status = 'ACTIVE',
            updated_at = v_now
        WHERE id = v_employee_id;
    END IF;

    -- 9. Forensic Audit Entry
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
        v_user_id,
        'BOOTSTRAP',
        'IAM',
        'super_admin',
        v_user_id::text,
        jsonb_build_object(
            'email', v_clean_email,
            'phone', v_clean_phone,
            'role', 'super_admin',
            'status', 'ACTIVE'
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', v_user_id,
        'email', v_clean_email,
        'phone', v_clean_phone,
        'role', 'super_admin',
        'organization_id', v_org_id
    );
END;
$$;

-- Revoke public execution, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.bootstrap_super_admin_account FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_super_admin_account TO authenticated, service_role;

-- Execute immediately to bootstrap the Super Admin into database state
SELECT public.bootstrap_super_admin_account('adnansadatmahin2@gmail.com', '01629286887', 'Adnan Sadat Mahin');

-- =====================================================================================
-- Trigger: Automatically re-bind Super Admin identity whenever auth.users is modified
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.handle_super_admin_auth_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF LOWER(NEW.email) = 'adnansadatmahin2@gmail.com' THEN
        PERFORM public.bootstrap_super_admin_account(NEW.email, '01629286887', 'Adnan Sadat Mahin');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_super_admin_auth_sync ON auth.users;
CREATE TRIGGER trg_super_admin_auth_sync
    AFTER INSERT OR UPDATE OF email ON auth.users
    FOR EACH ROW
    WHEN (LOWER(NEW.email) = 'adnansadatmahin2@gmail.com')
    EXECUTE FUNCTION public.handle_super_admin_auth_sync();
