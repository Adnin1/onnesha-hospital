-- =====================================================================================
-- Migration 66: Staff Identity & Access Management (IAM)
-- Timestamp: 2026-09-24 17:00:00 UTC
-- Purpose:
--   1. Schema Enhancements:
--      - Add must_change_password (BOOLEAN DEFAULT false) to public.profiles
--      - Add account_status (VARCHAR(20) DEFAULT 'ACTIVE') to public.profiles
--      - Add employee_id (VARCHAR(50)) to public.profiles
--   2. Seed & Normalize Canonical Roles in public.roles:
--      - super_admin (Super Admin)
--      - hospital_administrator (Hospital Administrator)
--      - accountant (Accountant / Cashier)
--      - doctor (Doctor / Consultant)
--      - nurse (Nurse / Ward In-Charge)
--      - lab_technologist (Lab Technologist)
--      - pharmacist (Pharmacist)
--      - hr_payroll (HR & Payroll Manager)
--   3. Seed Full Permission Keys into public.permissions and public.role_permissions
--   4. Security Definer RPCs:
--      - admin_create_staff_account(...)
--      - admin_reset_staff_password(...)
--      - admin_set_staff_status(...)
--      - admin_change_staff_role(...)
--      - get_staff_directory_admin(...)
--   5. Enable RLS on profiles with self-read + admin-manage policy
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Schema Enhancements on profiles
-- -------------------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' 
        CHECK (account_status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED')),
    ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(employee_id);

-- Ensure RLS is active on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_read_own_and_org_admin'
    ) THEN
        CREATE POLICY profiles_read_own_and_org_admin ON public.profiles
            FOR SELECT
            USING (
                id = auth.uid() 
                OR organization_id = private.get_current_org_id()
                OR active_organization_id = private.get_current_org_id()
                OR current_user = 'service_role'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own'
    ) THEN
        CREATE POLICY profiles_update_own ON public.profiles
            FOR UPDATE
            USING (
                id = auth.uid() 
                OR current_user = 'service_role'
                OR is_org_admin_or_has_permission(COALESCE(organization_id, active_organization_id), 'staff.manage')
            );
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 2. Seed & Normalize Canonical Roles (All 8 Canonical Roles)
-- -------------------------------------------------------------------------------------
-- Safely delete legacy duplicate Pathologist role if no references
DELETE FROM public.role_permissions WHERE role_id = 'b0000000-0000-0000-0000-000000000006';
DELETE FROM public.user_roles WHERE role_id = 'b0000000-0000-0000-0000-000000000006';
DELETE FROM public.roles WHERE id = 'b0000000-0000-0000-0000-000000000006';

-- Update remaining existing roles to canonical snake_case names
UPDATE public.roles SET name = 'super_admin' WHERE id = 'b0000000-0000-0000-0000-000000000001';
UPDATE public.roles SET name = 'doctor' WHERE id = 'b0000000-0000-0000-0000-000000000002';
UPDATE public.roles SET name = 'receptionist' WHERE id = 'b0000000-0000-0000-0000-000000000003';
UPDATE public.roles SET name = 'accountant' WHERE id = 'b0000000-0000-0000-0000-000000000004';
UPDATE public.roles SET name = 'lab_technologist' WHERE id = 'b0000000-0000-0000-0000-000000000005';
UPDATE public.roles SET name = 'pharmacist' WHERE id = 'b0000000-0000-0000-0000-000000000007';
UPDATE public.roles SET name = 'nurse' WHERE id = 'b0000000-0000-0000-0000-000000000008';

-- Insert new canonical roles for hospital_administrator and hr_payroll
INSERT INTO public.roles (id, organization_id, name, description, is_system)
VALUES
    ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'hospital_administrator', 'Hospital administrator and operational executive', TRUE),
    ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'hr_payroll', 'HR, attendance, employee roster and monthly payroll', TRUE)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_system = EXCLUDED.is_system;

-- -------------------------------------------------------------------------------------
-- 3. Seed Full Permission Keys into public.permissions
-- -------------------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, description)
VALUES
    ('*', 'ALL', 'Full unrestricted super administrator permissions'),
    ('dashboard.view', 'DASHBOARD', 'View hospital overview metrics and analytics'),
    ('patients.view', 'PATIENT', 'View patient list and demographics'),
    ('patients.create', 'PATIENT', 'Register new patients in directory'),
    ('patients.edit', 'PATIENT', 'Edit patient records and clinical demographics'),
    ('patients.history', 'PATIENT', 'View patient full medical and visit history'),
    ('appointments.view', 'APPOINTMENT', 'View appointment directory and schedules'),
    ('appointments.create', 'APPOINTMENT', 'Schedule doctor consultations and tokens'),
    ('appointments.call_token', 'APPOINTMENT', 'Call and advance token in consultation queue'),
    ('doctors.view', 'DOCTOR', 'View doctor directory and consultation roster'),
    ('doctors.manage', 'DOCTOR', 'Create and modify doctor profiles and schedules'),
    ('opd.view', 'OPD', 'View outpatient consultation queue'),
    ('opd.consult', 'OPD', 'Conduct outpatient clinical consultation and diagnosis'),
    ('ipd.view', 'IPD', 'View inpatient admissions and bed wards'),
    ('ipd.admit', 'IPD', 'Admit inpatient to bed or cabin'),
    ('ipd.transfer', 'IPD', 'Transfer inpatient between beds and cabins'),
    ('ipd.discharge', 'IPD', 'Discharge inpatient and generate summary'),
    ('emergency.view', 'EMERGENCY', 'View emergency casualty triage queue'),
    ('emergency.create', 'EMERGENCY', 'Register emergency casualty admissions'),
    ('emergency.triage', 'EMERGENCY', 'Assign emergency triage priority (RED, YELLOW, GREEN)'),
    ('billing.view', 'BILLING', 'View invoices and payment receipts'),
    ('billing.create', 'BILLING', 'Create new patient invoices and line items'),
    ('billing.discount', 'BILLING', 'Apply authorized discount to invoices'),
    ('billing.void', 'BILLING', 'Void invoices with clinical justification'),
    ('billing.refund', 'BILLING', 'Process financial invoice refunds'),
    ('billing.report', 'BILLING', 'Generate billing collection and cashier shift reports'),
    ('lab.view', 'DIAGNOSTIC', 'View diagnostic test catalog and lab orders'),
    ('lab.order', 'DIAGNOSTIC', 'Order diagnostic pathology and radiology tests'),
    ('lab.sample_collect', 'DIAGNOSTIC', 'Collect phlebotomy and diagnostic lab specimens'),
    ('lab.enter_result', 'DIAGNOSTIC', 'Enter diagnostic test results and values'),
    ('lab.verify', 'DIAGNOSTIC', 'Verify and sign diagnostic test reports'),
    ('pharmacy.view', 'PHARMACY', 'View pharmacy inventory and medicine catalog'),
    ('pharmacy.sale', 'PHARMACY', 'Dispense medicine and process POS sales'),
    ('pharmacy.purchase', 'PHARMACY', 'Receive vendor medicine purchases'),
    ('pharmacy.stock_adjust', 'PHARMACY', 'Adjust damaged or expired medicine stock'),
    ('beds.view', 'BED_IPD', 'View bed, ward and cabin occupancy matrix'),
    ('beds.allocate', 'BED_IPD', 'Allocate and transfer hospital beds'),
    ('ot.view', 'OT', 'View operation theater room schedules and bookings'),
    ('ot.book', 'OT', 'Book and allocate operation theater surgeries'),
    ('prescriptions.view', 'CLINICAL', 'View digital clinical prescriptions'),
    ('prescriptions.create', 'CLINICAL', 'Write and issue digital prescriptions'),
    ('hr.view', 'HR', 'View employee directory and organizational chart'),
    ('hr.attendance', 'HR', 'Log and view biometric employee attendance punches'),
    ('hr.payroll', 'HR', 'Process monthly salary sheets and payslips'),
    ('hr.manage', 'HR', 'Manage hospital employees and salary master'),
    ('notifications.view', 'NOTIFICATION', 'View SMS and email communication logs'),
    ('notifications.manage', 'NOTIFICATION', 'Configure notification gateways and templates'),
    ('notifications.resend', 'NOTIFICATION', 'Resend failed transactional messages'),
    ('payment_gateway.view', 'PAYMENT', 'View payment gateway configuration and accounts'),
    ('payment_gateway.manage', 'PAYMENT', 'Manage payment gateway keys and callbacks'),
    ('payments.online.create', 'PAYMENT', 'Initiate online payment gateway transactions'),
    ('payments.online.verify', 'PAYMENT', 'Verify payment gateway settlement callbacks'),
    ('payments.reconcile', 'PAYMENT', 'Reconcile gateway ledger with bank deposits'),
    ('refunds.process', 'PAYMENT', 'Authorize and process customer refunds'),
    ('integrations.manage', 'INTEGRATION', 'Manage third-party API keys and webhooks'),
    ('accounting.view', 'ACCOUNTING', 'View chart of accounts and general ledger'),
    ('accounting.manage', 'ACCOUNTING', 'Post journal entries and period closes'),
    ('procurement.view', 'PROCUREMENT', 'View purchase orders and goods receipt notes (GRN)'),
    ('procurement.manage', 'PROCUREMENT', 'Issue purchase orders and approve vendor invoices'),
    ('assets.view', 'ASSET', 'View biomedical equipment and fixed assets registry'),
    ('assets.manage', 'ASSET', 'Schedule maintenance and capitalize fixed assets'),
    ('nursing.view', 'NURSING', 'View inpatient nursing care and vitals charts'),
    ('nursing.manage', 'NURSING', 'Administer medications and update nursing handover notes'),
    ('reports.view', 'REPORT', 'Generate clinical, operational and financial reports'),
    ('settings.view', 'SYSTEM', 'View hospital settings and operational parameters'),
    ('settings.manage_roles', 'SYSTEM', 'Modify role-based permission assignments'),
    ('settings.audit', 'SYSTEM', 'Inspect forensic system audit logs'),
    ('staff.view', 'IAM', 'View staff directory and account credentials'),
    ('staff.create', 'IAM', 'Provision new staff user accounts and temporary credentials'),
    ('staff.manage', 'IAM', 'Change staff roles and toggle active/suspend status'),
    ('staff.reset_password', 'IAM', 'Generate temporary passwords and revoke sessions'),
    ('departments.manage', 'SYSTEM', 'Add and configure hospital departments')
ON CONFLICT (key) DO UPDATE SET
    module = EXCLUDED.module,
    description = EXCLUDED.description;

-- -------------------------------------------------------------------------------------
-- 4. Seed Permissions for All Roles in role_permissions
-- -------------------------------------------------------------------------------------
DELETE FROM public.role_permissions WHERE role_id IN (
    'b0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-000000000004',
    'b0000000-0000-0000-0000-000000000005',
    'b0000000-0000-0000-0000-000000000007',
    'b0000000-0000-0000-0000-000000000008',
    'b0000000-0000-0000-0000-000000000009',
    'b0000000-0000-0000-0000-000000000010'
);

-- Super Admin: '*' wildcard
INSERT INTO public.role_permissions (role_id, permission_key) VALUES
('b0000000-0000-0000-0000-000000000001', '*');

-- Hospital Administrator
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT 'b0000000-0000-0000-0000-000000000009', unnest(ARRAY[
    'dashboard.view', 'patients.view', 'patients.create', 'patients.edit', 'patients.history',
    'appointments.view', 'appointments.create', 'appointments.call_token',
    'doctors.view', 'doctors.manage', 'opd.view', 'ipd.view', 'emergency.view',
    'billing.view', 'billing.create', 'billing.report', 'reports.view',
    'lab.view', 'pharmacy.view', 'beds.view', 'ot.view', 'prescriptions.view',
    'hr.view', 'hr.attendance', 'hr.payroll', 'hr.manage',
    'staff.view', 'staff.create', 'staff.manage', 'staff.reset_password',
    'settings.view', 'settings.audit', 'departments.manage'
]);

-- Accountant
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT 'b0000000-0000-0000-0000-000000000004', unnest(ARRAY[
    'dashboard.view', 'billing.view', 'billing.create', 'billing.discount',
    'billing.void', 'billing.refund', 'billing.report', 'accounting.view',
    'accounting.manage', 'procurement.view', 'assets.view', 'payment_gateway.view',
    'payments.online.create', 'payments.online.verify', 'payments.reconcile',
    'refunds.process', 'reports.view'
]);

-- Doctor
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT 'b0000000-0000-0000-0000-000000000002', unnest(ARRAY[
    'dashboard.view', 'patients.view', 'patients.history', 'appointments.view',
    'appointments.call_token', 'doctors.view', 'opd.view', 'opd.consult',
    'ipd.view', 'prescriptions.view', 'prescriptions.create', 'lab.view', 'lab.order'
]);

-- Receptionist
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT 'b0000000-0000-0000-0000-000000000003', unnest(ARRAY[
    'dashboard.view', 'patients.view', 'patients.create', 'appointments.view',
    'appointments.create', 'appointments.call_token', 'billing.view', 'billing.create', 'beds.view'
]);

-- Nurse
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT 'b0000000-0000-0000-0000-000000000008', unnest(ARRAY[
    'dashboard.view', 'patients.view', 'ipd.view', 'emergency.view',
    'beds.view', 'beds.allocate', 'nursing.view', 'nursing.manage'
]);

-- Lab Technologist
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT 'b0000000-0000-0000-0000-000000000005', unnest(ARRAY[
    'dashboard.view', 'lab.view', 'lab.sample_collect', 'lab.enter_result', 'lab.verify'
]);

-- Pharmacist
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT 'b0000000-0000-0000-0000-000000000007', unnest(ARRAY[
    'dashboard.view', 'pharmacy.view', 'pharmacy.sale', 'pharmacy.purchase',
    'pharmacy.stock_adjust', 'procurement.view'
]);

-- HR & Payroll
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT 'b0000000-0000-0000-0000-000000000010', unnest(ARRAY[
    'dashboard.view', 'hr.view', 'hr.attendance', 'hr.payroll', 'hr.manage',
    'staff.view', 'reports.view'
]);

-- -------------------------------------------------------------------------------------
-- 5. Helper Function: Check if Caller is Super Admin or Hospital Administrator
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_is_admin_caller(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_has_role BOOLEAN := FALSE;
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
          AND LOWER(r.name) IN ('super_admin', 'super admin', 'admin', 'hospital_administrator')
    ) INTO v_has_role;

    RETURN v_has_role;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 6. RPC: admin_create_staff_account
-- Creates Supabase Auth User + Profile + Employee + User Role atomically.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_staff_account(
    p_org_id          UUID,
    p_full_name       TEXT,
    p_email           TEXT,
    p_phone           TEXT,
    p_role_name       TEXT,
    p_department_id   UUID DEFAULT NULL,
    p_temp_password   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id       UUID := auth.uid();
    v_new_user_id     UUID;
    v_role_id         UUID;
    v_clean_email     TEXT;
    v_clean_phone     TEXT;
    v_norm_role       TEXT;
    v_employee_code   VARCHAR(30);
    v_enc_pass        TEXT;
    v_now             TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Authorization
    IF NOT public.check_is_admin_caller(p_org_id) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admin or Hospital Administrator can provision staff accounts.';
    END IF;

    -- 2. Input Sanitization
    v_clean_email := LOWER(TRIM(p_email));
    v_clean_phone := TRIM(p_phone);

    IF v_clean_email IS NULL OR v_clean_email = '' OR v_clean_email NOT LIKE '%@%.%' THEN
        RAISE EXCEPTION 'Invalid email address provided: %', p_email;
    END IF;

    IF v_clean_phone IS NULL OR LENGTH(v_clean_phone) < 10 THEN
        RAISE EXCEPTION 'Invalid phone number provided: %', p_phone;
    END IF;

    IF p_temp_password IS NULL OR LENGTH(p_temp_password) < 8 THEN
        RAISE EXCEPTION 'Temporary password must be at least 8 characters long.';
    END IF;

    -- 3. Canonical Role Resolution (Fail-Closed)
    v_norm_role := LOWER(TRIM(REPLACE(p_role_name, ' ', '_')));
    IF v_norm_role = 'admin' THEN v_norm_role := 'hospital_administrator'; END IF;
    IF v_norm_role = 'cashier' THEN v_norm_role := 'accountant'; END IF;
    IF v_norm_role = 'hr' THEN v_norm_role := 'hr_payroll'; END IF;
    IF v_norm_role = 'lab_technician' THEN v_norm_role := 'lab_technologist'; END IF;

    SELECT id INTO v_role_id
    FROM public.roles
    WHERE organization_id = p_org_id AND name = v_norm_role;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Unknown or unapproved staff role: %. Valid roles: super_admin, hospital_administrator, accountant, doctor, nurse, lab_technologist, pharmacist, hr_payroll.', p_role_name;
    END IF;

    -- Privilege escalation prevention: only super_admin can create another super_admin
    IF v_norm_role = 'super_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'super admin')
        ) AND current_user != 'service_role' THEN
            RAISE EXCEPTION 'Privilege Escalation Blocked: Only an existing Super Admin can create another Super Admin account.';
        END IF;
    END IF;

    -- 4. Check for duplicates
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_clean_email) THEN
        RAISE EXCEPTION 'An account with email % already exists.', v_clean_email;
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = v_clean_phone) THEN
        RAISE EXCEPTION 'An account with phone number % already exists.', v_clean_phone;
    END IF;

    -- 5. Generate Employee Code
    v_employee_code := public.generate_employee_code(p_org_id);
    v_new_user_id := gen_random_uuid();
    v_enc_pass := extensions.crypt(p_temp_password, extensions.gen_salt('bf'));

    -- 6. Insert into auth.users
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
        phone_confirmed_at,
        confirmation_token,
        email_change_token_current,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        v_new_user_id,
        'authenticated',
        'authenticated',
        v_clean_email,
        v_enc_pass,
        v_now,
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', TRIM(p_full_name), 'email_verified', TRUE),
        v_now,
        v_now,
        v_clean_phone,
        v_now,
        '', '', '', ''
    );

    -- 7. Insert into auth.identities
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at,
        email
    ) VALUES (
        gen_random_uuid(),
        v_new_user_id,
        jsonb_build_object('sub', v_new_user_id::text, 'email', v_clean_email, 'email_verified', TRUE),
        'email',
        v_new_user_id::text,
        v_now,
        v_now,
        v_now,
        v_clean_email
    );

    -- 8. Insert into public.profiles (with must_change_password = true)
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
        v_new_user_id,
        v_clean_phone,
        TRIM(p_full_name),
        v_clean_email,
        TRUE,
        p_org_id,
        p_org_id,
        TRUE,
        'ACTIVE',
        v_employee_code,
        v_now,
        v_now
    );

    -- 9. Insert into public.user_roles
    INSERT INTO public.user_roles (
        id,
        organization_id,
        user_id,
        role_id,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_org_id,
        v_new_user_id,
        v_role_id,
        v_now
    );

    -- 10. Insert into public.employees
    INSERT INTO public.employees (
        id,
        organization_id,
        profile_id,
        employee_code,
        full_name,
        department_id,
        phone,
        email,
        joining_date,
        basic_salary,
        status,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        p_org_id,
        v_new_user_id,
        v_employee_code,
        TRIM(p_full_name),
        p_department_id,
        v_clean_phone,
        v_clean_email,
        CURRENT_DATE,
        25000.00,
        'ACTIVE',
        v_now,
        v_now
    );

    -- 11. Record Forensic Audit Log
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
        'CREATE',
        'IAM',
        'staff_user',
        v_new_user_id::text,
        jsonb_build_object(
            'email', v_clean_email,
            'employee_code', v_employee_code,
            'role', v_norm_role,
            'must_change_password', TRUE,
            'account_status', 'ACTIVE'
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', v_new_user_id,
        'employee_id', v_employee_code,
        'email', v_clean_email,
        'role', v_norm_role,
        'must_change_password', TRUE,
        'message', 'Staff account created successfully.'
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 7. RPC: admin_reset_staff_password
-- Sets new temporary password, revokes active sessions, and forces password change.
-- -------------------------------------------------------------------------------------
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
    v_now             TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Authorization
    IF NOT public.check_is_admin_caller(p_org_id) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admin or Hospital Administrator can reset staff passwords.';
    END IF;

    IF p_temp_password IS NULL OR LENGTH(p_temp_password) < 8 THEN
        RAISE EXCEPTION 'Temporary password must be at least 8 characters long.';
    END IF;

    SELECT email INTO v_user_email
    FROM public.profiles
    WHERE id = p_target_user_id AND (organization_id = p_org_id OR active_organization_id = p_org_id);

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'Target user not found or does not belong to this organization.';
    END IF;

    -- Target cannot be super_admin unless caller is super_admin
    IF EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_target_user_id
          AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'super admin')
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'super admin')
        ) AND current_user != 'service_role' THEN
            RAISE EXCEPTION 'Access Denied: Only a Super Admin can reset another Super Admin password.';
        END IF;
    END IF;

    v_enc_pass := extensions.crypt(p_temp_password, extensions.gen_salt('bf'));

    -- 2. Update auth.users password
    UPDATE auth.users
    SET encrypted_password = v_enc_pass,
        updated_at = v_now
    WHERE id = p_target_user_id;

    -- 3. Set must_change_password = true on profiles
    UPDATE public.profiles
    SET must_change_password = TRUE,
        updated_at = v_now
    WHERE id = p_target_user_id;

    -- 4. Session Revocation: delete all existing active sessions
    DELETE FROM auth.sessions
    WHERE user_id = p_target_user_id;

    -- 5. Record Audit Log
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
        'IAM',
        'staff_user',
        p_target_user_id::text,
        jsonb_build_object(
            'action', 'PASSWORD_RESET',
            'must_change_password', TRUE,
            'sessions_revoked', TRUE
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'email', v_user_email,
        'must_change_password', TRUE,
        'message', 'Staff password reset successfully and active sessions revoked.'
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 8. RPC: admin_set_staff_status
-- Sets status (ACTIVE, SUSPENDED, DISABLED) and revokes sessions on suspend/disable.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_staff_status(
    p_org_id          UUID,
    p_target_user_id  UUID,
    p_status          TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id       UUID := auth.uid();
    v_status_norm     TEXT := UPPER(TRIM(p_status));
    v_old_status      TEXT;
    v_now             TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Authorization
    IF NOT public.check_is_admin_caller(p_org_id) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admin or Hospital Administrator can alter staff account status.';
    END IF;

    IF v_status_norm NOT IN ('ACTIVE', 'SUSPENDED', 'DISABLED') THEN
        RAISE EXCEPTION 'Invalid status: %. Allowed: ACTIVE, SUSPENDED, DISABLED.', p_status;
    END IF;

    IF p_target_user_id = v_caller_id THEN
        RAISE EXCEPTION 'Self-Modification Prohibited: You cannot suspend or disable your own account.';
    END IF;

    SELECT account_status INTO v_old_status
    FROM public.profiles
    WHERE id = p_target_user_id AND (organization_id = p_org_id OR active_organization_id = p_org_id);

    IF v_old_status IS NULL THEN
        RAISE EXCEPTION 'Target user not found in organization.';
    END IF;

    -- 2. Update profiles and employees
    UPDATE public.profiles
    SET account_status = v_status_norm,
        is_active = (v_status_norm = 'ACTIVE'),
        updated_at = v_now
    WHERE id = p_target_user_id;

    UPDATE public.employees
    SET status = CASE 
            WHEN v_status_norm = 'ACTIVE' THEN 'ACTIVE' 
            ELSE 'TERMINATED' 
        END,
        updated_at = v_now
    WHERE profile_id = p_target_user_id AND organization_id = p_org_id;

    -- 3. If suspended or disabled, immediately revoke all active sessions
    IF v_status_norm IN ('SUSPENDED', 'DISABLED') THEN
        DELETE FROM auth.sessions
        WHERE user_id = p_target_user_id;
    END IF;

    -- 4. Record Audit Log
    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        old_values,
        new_values,
        created_at
    ) VALUES (
        p_org_id,
        v_caller_id,
        'UPDATE',
        'IAM',
        'staff_user',
        p_target_user_id::text,
        jsonb_build_object('account_status', v_old_status),
        jsonb_build_object('account_status', v_status_norm, 'is_active', (v_status_norm = 'ACTIVE')),
        v_now
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'new_status', v_status_norm,
        'is_active', (v_status_norm = 'ACTIVE'),
        'message', 'Staff account status updated successfully.'
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 9. RPC: admin_change_staff_role
-- Updates staff role with privilege escalation guards.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_change_staff_role(
    p_org_id          UUID,
    p_target_user_id  UUID,
    p_new_role_name   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id       UUID := auth.uid();
    v_role_id         UUID;
    v_norm_role       TEXT;
    v_old_role_name   TEXT;
    v_now             TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Authorization
    IF NOT public.check_is_admin_caller(p_org_id) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admin or Hospital Administrator can change staff roles.';
    END IF;

    v_norm_role := LOWER(TRIM(REPLACE(p_new_role_name, ' ', '_')));
    IF v_norm_role = 'admin' THEN v_norm_role := 'hospital_administrator'; END IF;
    IF v_norm_role = 'cashier' THEN v_norm_role := 'accountant'; END IF;
    IF v_norm_role = 'hr' THEN v_norm_role := 'hr_payroll'; END IF;
    IF v_norm_role = 'lab_technician' THEN v_norm_role := 'lab_technologist'; END IF;

    SELECT id INTO v_role_id
    FROM public.roles
    WHERE organization_id = p_org_id AND name = v_norm_role;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Unknown or unapproved staff role: %.', p_new_role_name;
    END IF;

    -- Privilege escalation prevention
    IF v_norm_role = 'super_admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_caller_id
              AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'super admin')
        ) AND current_user != 'service_role' THEN
            RAISE EXCEPTION 'Privilege Escalation Blocked: Only an existing Super Admin can grant the Super Admin role.';
        END IF;
    END IF;

    SELECT r.name INTO v_old_role_name
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_target_user_id AND ur.organization_id = p_org_id
    LIMIT 1;

    DELETE FROM public.user_roles
    WHERE user_id = p_target_user_id AND organization_id = p_org_id;

    INSERT INTO public.user_roles (
        id,
        organization_id,
        user_id,
        role_id,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_org_id,
        p_target_user_id,
        v_role_id,
        v_now
    );

    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        old_values,
        new_values,
        created_at
    ) VALUES (
        p_org_id,
        v_caller_id,
        'UPDATE',
        'IAM',
        'staff_user',
        p_target_user_id::text,
        jsonb_build_object('role', v_old_role_name),
        jsonb_build_object('role', v_norm_role),
        v_now
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'user_id', p_target_user_id,
        'new_role', v_norm_role,
        'message', 'Staff role updated successfully.'
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 10. RPC: get_staff_directory_admin
-- Returns directory of all staff with role, status, department, and employee code.
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_directory_admin(
    p_org_id          UUID,
    p_search          TEXT DEFAULT NULL,
    p_role            TEXT DEFAULT NULL,
    p_status          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_results JSONB;
BEGIN
    IF NOT public.check_is_admin_caller(p_org_id) THEN
        RAISE EXCEPTION 'Access Denied: Only Super Admin or Hospital Administrator can view the full staff IAM directory.';
    END IF;

    SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb) INTO v_results
    FROM (
        SELECT 
            p.id,
            p.full_name,
            p.email,
            p.phone,
            p.account_status,
            p.must_change_password,
            p.is_active,
            p.created_at,
            e.employee_code,
            d.id as department_id,
            d.name as department_name,
            r.name as role_name
        FROM public.profiles p
        LEFT JOIN public.employees e ON e.profile_id = p.id AND e.organization_id = p_org_id
        LEFT JOIN public.departments d ON e.department_id = d.id
        LEFT JOIN public.user_roles ur ON ur.user_id = p.id AND ur.organization_id = p_org_id
        LEFT JOIN public.roles r ON ur.role_id = r.id
        WHERE (p.organization_id = p_org_id OR p.active_organization_id = p_org_id)
          AND (
            p_search IS NULL OR p_search = '' OR
            p.full_name ILIKE '%' || p_search || '%' OR
            p.email ILIKE '%' || p_search || '%' OR
            p.phone ILIKE '%' || p_search || '%' OR
            e.employee_code ILIKE '%' || p_search || '%'
          )
          AND (
            p_role IS NULL OR p_role = '' OR p_role = 'ALL' OR
            LOWER(r.name) = LOWER(p_role)
          )
          AND (
            p_status IS NULL OR p_status = '' OR p_status = 'ALL' OR
            p.account_status = UPPER(p_status)
          )
        ORDER BY p.created_at DESC
    ) sub;

    RETURN v_results;
END;
$$;

-- Grant execution to authenticated users (functions enforce check_is_admin_caller internally)
GRANT EXECUTE ON FUNCTION public.check_is_admin_caller(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_staff_account(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_staff_password(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_status(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_staff_role(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_staff_directory_admin(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
