-- =====================================================================================
-- Migration 209: Expand Receptionist Role Permissions & Elevate Primary Hospital Account
-- Timestamp: 20261017020000
-- =====================================================================================

BEGIN;

-- 1. Ensure required operational permissions exist in public.permissions
INSERT INTO public.permissions (key, module, description)
VALUES 
  ('ipd.manage', 'BED_IPD', 'Manage inpatient beds, cabins, and ward configurations'),
  ('beds.manage', 'BED_IPD', 'Add, update, and remove beds and cabins'),
  ('expenses.view', 'ACCOUNTING', 'View hospital disbursements and operational expenses'),
  ('expenses.manage', 'ACCOUNTING', 'Create, update, and manage hospital expenses')
ON CONFLICT (key) DO NOTHING;

-- 2. Expand role permissions for receptionist and hospital_administrator in public.role_permissions
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.perm
FROM public.roles r
CROSS JOIN (
  VALUES 
    ('ipd.manage'),
    ('ipd.view'),
    ('ipd.admit'),
    ('ipd.discharge'),
    ('beds.allocate'),
    ('beds.manage'),
    ('patients.edit'),
    ('doctors.view'),
    ('opd.view'),
    ('billing.report'),
    ('prescriptions.view'),
    ('prescriptions.create'),
    ('expenses.view'),
    ('expenses.manage'),
    ('reports.view'),
    ('referral.manage'),
    ('referral.commission.view')
) AS p(perm)
WHERE r.name IN ('receptionist', 'hospital_administrator')
ON CONFLICT DO NOTHING;

-- 3. Elevate primary hospital account (anneshahospital@gmail.com) with full operational authority
DO $$
DECLARE
  v_user_id UUID;
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_admin_role_id UUID := 'b0000000-0000-0000-0000-000000000009';
  v_super_admin_role_id UUID := 'b0000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'anneshahospital@gmail.com' LIMIT 1;
  
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (organization_id, user_id, role_id, is_active)
    VALUES 
      (v_org_id, v_user_id, v_admin_role_id, true),
      (v_org_id, v_user_id, v_super_admin_role_id, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
