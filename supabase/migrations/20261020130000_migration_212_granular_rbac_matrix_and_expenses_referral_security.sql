-- =====================================================================================
-- Migration 212: Granular RBAC Permission Matrix & Strict Expenses/Referral Security
-- Timestamp: 20261020130000
-- =====================================================================================

BEGIN;

-- 1. Ensure all new granular permission keys exist in public.permissions catalog
INSERT INTO public.permissions (key, module, description)
VALUES
  -- Expenses Granular
  ('expenses.view', 'ACCOUNTING', 'View hospital expenses, vouchers and analytics'),
  ('expenses.create', 'ACCOUNTING', 'Create new expense vouchers and disbursements'),
  ('expenses.edit', 'ACCOUNTING', 'Edit expense voucher details and categories'),
  ('expenses.delete', 'ACCOUNTING', 'Void or delete expense records'),
  ('expenses.manage', 'ACCOUNTING', 'Manage expense categories, recurring costs and budgets'),

  -- Referral Granular
  ('referral.view', 'REFERRAL', 'View referral partner profiles, metrics and commissions'),
  ('referral.create', 'REFERRAL', 'Register new referral agents and partners'),
  ('referral.edit', 'REFERRAL', 'Edit referral partner details and commission rates'),
  ('referral.delete', 'REFERRAL', 'Delete or archive referral partner profiles'),
  ('referral.assign', 'REFERRAL', 'Assign referral partners to patients and invoices'),
  ('referral.commission.view', 'REFERRAL', 'View pending and paid referral commission reports'),
  ('referral.commission.pay', 'REFERRAL', 'Approve and settle referral commission payouts'),
  ('referral.manage', 'REFERRAL', 'Full management of referral programs and policies'),

  -- Billing Granular
  ('billing.view', 'BILLING', 'View invoices and payment receipts'),
  ('billing.create', 'BILLING', 'Create new patient invoices and receipts'),
  ('billing.edit', 'BILLING', 'Edit invoice line items and details'),
  ('billing.delete', 'BILLING', 'Void or cancel patient invoices'),
  ('billing.discount', 'BILLING', 'Authorize discounts and waivers on invoices'),
  ('billing.refund', 'BILLING', 'Process refunds and returns'),
  ('billing.report', 'BILLING', 'View cashier closing and collection reports'),

  -- Patients Granular
  ('patients.view', 'PATIENTS', 'View patient list and profile records'),
  ('patients.create', 'PATIENTS', 'Register new patients with direct age and details'),
  ('patients.edit', 'PATIENTS', 'Edit patient demographics, age and contact info'),
  ('patients.delete', 'PATIENTS', 'Deactivate or delete duplicate patient profiles'),
  ('patients.history', 'PATIENTS', 'View historical medical consultations and records'),

  -- IPD & Beds Granular
  ('ipd.view', 'IPD', 'View admitted inpatient wards and cabins'),
  ('ipd.admit', 'IPD', 'Admit patients to inpatient beds/cabins'),
  ('ipd.discharge', 'IPD', 'Process inpatient patient discharges'),
  ('ipd.manage', 'IPD', 'Configure wards, cabins and admission policies'),
  ('beds.view', 'BEDS', 'View bed and cabin occupancy matrix'),
  ('beds.allocate', 'BEDS', 'Allocate or transfer patient beds'),
  ('beds.manage', 'BEDS', 'Add, edit or configure beds, cabins and daily tariffs'),

  -- Blood Bank Granular
  ('blood_bank.view', 'BLOOD_BANK', 'View blood inventory and transfusion records'),
  ('blood_bank.donor.create', 'BLOOD_BANK', 'Register blood donors with age and contact dossier'),
  ('blood_bank.crossmatch', 'BLOOD_BANK', 'Perform and verify major/minor cross-match tests'),
  ('blood_bank.issue', 'BLOOD_BANK', 'Issue screened blood bags for transfusion'),
  ('blood_bank.manage', 'BLOOD_BANK', 'Full blood bank inventory and external bank requisition control'),

  -- Laboratory Granular
  ('lab.view', 'LAB', 'View lab test requisitions and catalogs'),
  ('lab.order', 'LAB', 'Prescribe or order lab diagnostic tests'),
  ('lab.sample_collect', 'LAB', 'Mark specimen and sample collection'),
  ('lab.enter_result', 'LAB', 'Enter laboratory test parameters and values'),
  ('lab.verify', 'LAB', 'Pathologist digital sign-off and approval'),

  -- Pharmacy Granular
  ('pharmacy.view', 'PHARMACY', 'View pharmacy medicine inventory and prices'),
  ('pharmacy.sale', 'PHARMACY', 'Dispense medicines and POS cashier billing'),
  ('pharmacy.purchase', 'PHARMACY', 'Record pharmaceutical stock purchases'),
  ('pharmacy.stock_adjust', 'PHARMACY', 'Adjust damaged or expired stock'),

  -- Doctors & Staff Granular
  ('doctors.view', 'DOCTORS', 'View doctor roster and schedules'),
  ('doctors.manage', 'DOCTORS', 'Manage doctor profiles and consultation fees'),
  ('staff.view', 'IAM', 'View hospital staff directory'),
  ('staff.create', 'IAM', 'Create staff login accounts and passwords'),
  ('staff.manage', 'IAM', 'Manage staff roles, statuses and privileges'),
  ('staff.reset_password', 'IAM', 'Reset staff login credentials'),

  -- Settings & Audit
  ('settings.view', 'SETTINGS', 'View system settings and hardware monitors'),
  ('settings.manage_roles', 'SETTINGS', 'Manage granular role permissions (Super Admin Only)'),
  ('settings.audit', 'SETTINGS', 'View forensic audit logs and history'),
  ('accounting.view', 'ACCOUNTING', 'View general ledger, trial balance and journals'),
  ('accounting.manage', 'ACCOUNTING', 'Manage journal entries and reconciliation'),
  ('reports.view', 'REPORTS', 'View executive and financial P&L reports')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    module = EXCLUDED.module;

-- 2. Revoke default expenses and referral permissions from receptionist in public.role_permissions
DELETE FROM public.role_permissions rp
USING public.roles r
WHERE rp.role_id = r.id
  AND LOWER(r.name) = 'receptionist'
  AND rp.permission_key IN ('expenses.view', 'expenses.manage', 'referral.view', 'referral.manage');

-- 3. Harden RLS on public.expenses so only Super Admin or users with explicit role_permissions can access
DROP POLICY IF EXISTS rls_expenses ON public.expenses;
DROP POLICY IF EXISTS rls_expenses_select ON public.expenses;
DROP POLICY IF EXISTS rls_expenses_insert ON public.expenses;
DROP POLICY IF EXISTS rls_expenses_update ON public.expenses;
DROP POLICY IF EXISTS rls_expenses_delete ON public.expenses;

CREATE POLICY rls_expenses_select ON public.expenses
FOR SELECT TO authenticated, service_role
USING (
  organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND LOWER(r.name) = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND rp.permission_key IN ('expenses.view', 'expenses.manage', '*')
    )
  )
);

CREATE POLICY rls_expenses_insert ON public.expenses
FOR INSERT TO authenticated, service_role
WITH CHECK (
  organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND LOWER(r.name) = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND rp.permission_key IN ('expenses.create', 'expenses.manage', '*')
    )
  )
);

CREATE POLICY rls_expenses_update ON public.expenses
FOR UPDATE TO authenticated, service_role
USING (
  organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND LOWER(r.name) = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND rp.permission_key IN ('expenses.edit', 'expenses.manage', '*')
    )
  )
);

CREATE POLICY rls_expenses_delete ON public.expenses
FOR DELETE TO authenticated, service_role
USING (
  organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND LOWER(r.name) = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND rp.permission_key IN ('expenses.delete', 'expenses.manage', '*')
    )
  )
);

-- 4. Harden RLS on public.referral_agents so only Super Admin or users with explicit role_permissions can access
DROP POLICY IF EXISTS ref_agents_select ON public.referral_agents;
DROP POLICY IF EXISTS ref_agents_insert ON public.referral_agents;
DROP POLICY IF EXISTS ref_agents_update ON public.referral_agents;
DROP POLICY IF EXISTS ref_agents_delete ON public.referral_agents;

CREATE POLICY ref_agents_select ON public.referral_agents
FOR SELECT TO authenticated, service_role
USING (
  organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND LOWER(r.name) = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND rp.permission_key IN ('referral.view', 'referral.manage', 'referral.assign', '*')
    )
  )
);

CREATE POLICY ref_agents_insert ON public.referral_agents
FOR INSERT TO authenticated, service_role
WITH CHECK (
  organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND LOWER(r.name) = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND rp.permission_key IN ('referral.create', 'referral.manage', '*')
    )
  )
);

CREATE POLICY ref_agents_update ON public.referral_agents
FOR UPDATE TO authenticated, service_role
USING (
  organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND LOWER(r.name) = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND rp.permission_key IN ('referral.edit', 'referral.manage', '*')
    )
  )
);

CREATE POLICY ref_agents_delete ON public.referral_agents
FOR DELETE TO authenticated, service_role
USING (
  organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND LOWER(r.name) = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON ur.role_id = rp.role_id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND rp.permission_key IN ('referral.delete', 'referral.manage', '*')
    )
  )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
