-- =====================================================================================
-- OHMS Auth Recovery / IAM Forward Repair
-- Created: 2026-09-27
--
-- This migration deliberately does NOT edit or re-run older migrations.
-- It removes the insecure Super Admin auth.users trigger/function introduced by
-- 20260927030000 and performs a one-time, non-password repair of the existing
-- bootstrap identity.
--
-- Security rules:
--   * Never create/reset an auth user's password from SQL migrations.
--   * Never auto-bind a privileged role from an auth.users trigger.
--   * Only repair an already-existing Auth user.
--   * Keep Super Admin role assignment explicit and auditable.
-- =====================================================================================

BEGIN;

-- 1. Remove the privileged auth.users auto-binding mechanism.
DROP TRIGGER IF EXISTS trg_super_admin_auth_sync ON auth.users;
DROP FUNCTION IF EXISTS public.handle_super_admin_auth_sync();

-- 2. Remove the old SECURITY DEFINER bootstrap RPC. It accepted an arbitrary
--    email from an authenticated caller and could mutate auth/provisioning state.
DROP FUNCTION IF EXISTS public.bootstrap_super_admin_account(TEXT, TEXT, TEXT);

-- 3. Repair the intended existing Super Admin account without touching its
--    password or Auth credentials. If the Auth user does not exist, do nothing:
--    account creation must happen through a proper Supabase Auth admin flow.
DO $$
DECLARE
    v_email TEXT := 'adnansadatmahin2@gmail.com';
    v_phone TEXT := '01629286887';
    v_full_name TEXT := 'Adnan Sadat Mahin';
    v_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_user_id UUID;
    v_role_id UUID;
    v_profile_phone TEXT;
    v_employee_code TEXT;
BEGIN
    SELECT u.id
      INTO v_user_id
      FROM auth.users u
     WHERE LOWER(u.email) = LOWER(v_email)
     ORDER BY u.created_at ASC
     LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'OHMS IAM repair: Auth user not found for configured Super Admin email; no privileged account was created.';
        RETURN;
    END IF;

    SELECT r.id
      INTO v_role_id
      FROM public.roles r
     WHERE r.organization_id = v_org_id
       AND LOWER(r.name) = 'super_admin'
     ORDER BY r.is_system DESC, r.created_at
     LIMIT 1;

    IF v_role_id IS NULL THEN
        v_role_id := 'b0000000-0000-0000-0000-000000000001'::uuid;
        INSERT INTO public.roles (
            id, organization_id, name, description, is_system
        )
        VALUES (
            v_role_id,
            v_org_id,
            'super_admin',
            'Full system access and tenant management',
            TRUE
        )
        ON CONFLICT (id) DO UPDATE
        SET name = 'super_admin',
            organization_id = EXCLUDED.organization_id,
            description = EXCLUDED.description,
            is_system = TRUE;
    END IF;

    -- Ensure the wildcard permission exists for the resolved Super Admin role.
    INSERT INTO public.permissions (key, module, description)
    VALUES ('*', 'ALL', 'Full unrestricted super administrator permissions')
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO public.role_permissions (role_id, permission_key)
    VALUES (v_role_id, '*')
    ON CONFLICT (role_id, permission_key) DO NOTHING;

    SELECT p.phone
      INTO v_profile_phone
      FROM public.profiles p
     WHERE p.id = v_user_id
     LIMIT 1;

    -- Upsert profile. Do not change an existing phone number blindly because
    -- profiles.phone is globally UNIQUE.
    IF v_profile_phone IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.profiles
             WHERE phone = v_phone
               AND id <> v_user_id
        ) THEN
            RAISE EXCEPTION 'Cannot repair Super Admin profile: configured phone is already assigned to another profile.';
        END IF;

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
            created_at,
            updated_at
        )
        VALUES (
            v_user_id,
            v_phone,
            v_full_name,
            v_email,
            TRUE,
            v_org_id,
            v_org_id,
            FALSE,
            'ACTIVE',
            NOW(),
            NOW()
        )
        ON CONFLICT (id) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            is_active = TRUE,
            organization_id = EXCLUDED.organization_id,
            active_organization_id = EXCLUDED.active_organization_id,
            account_status = 'ACTIVE',
            updated_at = NOW();
    ELSE
        UPDATE public.profiles
           SET full_name = v_full_name,
               email = v_email,
               is_active = TRUE,
               organization_id = v_org_id,
               active_organization_id = v_org_id,
               account_status = 'ACTIVE',
               updated_at = NOW()
         WHERE id = v_user_id;
    END IF;

    -- Exactly one canonical Super Admin membership for the target organization.
    INSERT INTO public.user_roles (
        id,
        organization_id,
        user_id,
        role_id,
        created_at
    )
    VALUES (
        gen_random_uuid(),
        v_org_id,
        v_user_id,
        v_role_id,
        NOW()
    )
    ON CONFLICT (organization_id, user_id, role_id) DO NOTHING;

    -- Link an employee record when possible; never overwrite an unrelated row.
    SELECT e.employee_code
      INTO v_employee_code
      FROM public.employees e
     WHERE e.profile_id = v_user_id
        OR LOWER(e.email) = LOWER(v_email)
     ORDER BY e.created_at
     LIMIT 1;

    IF v_employee_code IS NULL THEN
        v_employee_code := public.generate_employee_code(v_org_id);

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
        )
        VALUES (
            gen_random_uuid(),
            v_org_id,
            v_user_id,
            v_employee_code,
            v_full_name,
            COALESCE(v_profile_phone, v_phone),
            v_email,
            CURRENT_DATE,
            0,
            'ACTIVE',
            NOW(),
            NOW()
        )
        ON CONFLICT (organization_id, employee_code) DO UPDATE
        SET profile_id = v_user_id,
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            status = 'ACTIVE',
            updated_at = NOW();
    ELSE
        UPDATE public.employees
           SET profile_id = v_user_id,
               full_name = v_full_name,
               email = v_email,
               status = 'ACTIVE',
               updated_at = NOW()
         WHERE employee_code = v_employee_code
           AND organization_id = v_org_id;
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
    VALUES (
        v_org_id,
        v_user_id,
        'UPDATE',
        'IAM',
        'super_admin',
        v_user_id::text,
        jsonb_build_object(
            'action', 'SUPER_ADMIN_IDENTITY_REPAIRED',
            'role', 'super_admin',
            'password_touched', FALSE,
            'auth_user_created', FALSE,
            'trigger_removed', TRUE
        ),
        NOW()
    );
END;
$$;

COMMIT;
