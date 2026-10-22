-- =====================================================================================
-- Migration 255: Universal RBAC RLS Security & Dynamic Permissions Real-Time Sync Seal
-- Timestamp: 20261023030000
-- =====================================================================================
-- Addresses root causes of permission desynchronization:
-- 1. Adds explicit RLS SELECT policies for `public.roles` and `public.role_permissions`
--    so authenticated staff sessions can read database-configured permissions.
-- 2. Creates authoritative SECURITY DEFINER RPC `public.get_current_user_permissions`
--    that returns the caller's active roles and permissions in 1 atomic roundtrip.
-- 3. Hardens `public.is_org_admin_or_has_permission` and `public.has_permission` to check
--    both `user_roles` AND `profiles.role` with full case/format normalization.
-- 4. Expands RLS policies on `public.referral_agents` (SELECT, INSERT, UPDATE) and
--    `public.expenses` (SELECT, INSERT) to recognize receptionists, cashiers, and
--    granular permissions assigned in Settings -> Roles & Permissions.
-- 5. Updates `public.search_referral_agents_for_billing` to explicitly permit receptionists
--    and billing/intake staff.
-- 6. Synchronizes any orphaned `profiles.role` assignments into `public.user_roles`.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. ENSURE ALL PERMISSION KEYS EXIST IN public.permissions CATALOG
-- -------------------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, description)
VALUES
  ('dashboard.view', 'dashboard', 'View executive dashboard'),
  ('patients.view', 'patients', 'View patient directory and profiles'),
  ('patients.create', 'patients', 'Create new patient records'),
  ('patients.edit', 'patients', 'Edit patient records'),
  ('patients.delete', 'patients', 'Delete or archive patient records'),
  ('patients.history', 'patients', 'View medical history'),
  ('appointments.view', 'appointments', 'View appointments schedule'),
  ('appointments.create', 'appointments', 'Book appointments'),
  ('appointments.edit', 'appointments', 'Modify appointments'),
  ('appointments.cancel', 'appointments', 'Cancel appointments'),
  ('appointments.call_token', 'appointments', 'Call and advance token queue'),
  ('doctors.view', 'doctors', 'View doctors list'),
  ('doctors.manage', 'doctors', 'Manage doctor directory and roster'),
  ('opd.view', 'opd', 'View OPD queue and consultations'),
  ('opd.consult', 'opd', 'Conduct OPD consultations'),
  ('ipd.view', 'ipd', 'View IPD admissions'),
  ('ipd.manage', 'ipd', 'Manage IPD patient lifecycle'),
  ('ipd.admit', 'ipd', 'Admit patients to IPD'),
  ('ipd.discharge', 'ipd', 'Discharge IPD patients'),
  ('emergency.view', 'emergency', 'View emergency casualty triage'),
  ('emergency.triage', 'emergency', 'Perform emergency triage'),
  ('emergency.manage', 'emergency', 'Manage emergency department'),
  ('specialties.view', 'specialties', 'View specialty clinics'),
  ('specialties.manage', 'specialties', 'Manage specialty clinics'),
  ('lab.view', 'lab', 'View diagnostic orders and results'),
  ('lab.order', 'lab', 'Order laboratory tests'),
  ('lab.sample_collect', 'lab', 'Collect diagnostic samples'),
  ('lab.enter_result', 'lab', 'Enter diagnostic test results'),
  ('lab.verify', 'lab', 'Verify and certify lab reports'),
  ('lab.manage', 'lab', 'Manage lab catalog and reagents'),
  ('radiology.view', 'radiology', 'View radiology orders'),
  ('radiology.order', 'radiology', 'Order radiology investigations'),
  ('radiology.upload', 'radiology', 'Upload DICOM and imaging scans'),
  ('radiology.report', 'radiology', 'Report radiology findings'),
  ('radiology.manage', 'radiology', 'Manage radiology modalities'),
  ('blood_bank.view', 'blood_bank', 'View blood bank inventory'),
  ('blood_bank.donor_create', 'blood_bank', 'Register blood donors'),
  ('blood_bank.crossmatch', 'blood_bank', 'Crossmatch blood compatibility'),
  ('blood_bank.issue', 'blood_bank', 'Issue blood units for transfusion'),
  ('blood_bank.manage', 'blood_bank', 'Manage blood bank stock and donor screening'),
  ('pharmacy.view', 'pharmacy', 'View pharmacy inventory and orders'),
  ('pharmacy.dispense', 'pharmacy', 'Dispense medicines at POS'),
  ('pharmacy.manage_stock', 'pharmacy', 'Manage medicine stock and batches'),
  ('pharmacy.return', 'pharmacy', 'Process pharmacy sales returns'),
  ('pharmacy.manage', 'pharmacy', 'Manage pharmacy catalog and procurement'),
  ('beds.view', 'beds', 'View bed and cabin matrix'),
  ('beds.allocate', 'beds', 'Allocate and transfer beds'),
  ('beds.manage', 'beds', 'Configure bed wards, rates and cabins'),
  ('critical_care.view', 'critical_care', 'View ICU/CCU bed status'),
  ('critical_care.manage', 'critical_care', 'Manage critical care admissions'),
  ('ot.view', 'ot', 'View operation theater schedule'),
  ('ot.book', 'ot', 'Schedule surgeries and bookings'),
  ('ot.manage', 'ot', 'Manage OT rooms and surgical teams'),
  ('prescriptions.view', 'prescriptions', 'View digital prescriptions'),
  ('prescriptions.create', 'prescriptions', 'Create digital prescriptions'),
  ('registrar.view', 'registrar', 'View medical certificates and registry'),
  ('registrar.create', 'registrar', 'Issue birth and death certificates'),
  ('registrar.manage', 'registrar', 'Manage official legal hospital registries'),
  ('ambulance.view', 'ambulance', 'View ambulance fleet and trips'),
  ('ambulance.dispatch', 'ambulance', 'Dispatch ambulance emergency trips'),
  ('ambulance.manage', 'ambulance', 'Manage fleet vehicles, drivers and maintenance'),
  ('daycare.view', 'daycare', 'View day care admissions'),
  ('daycare.admit', 'daycare', 'Admit patients for day procedures'),
  ('daycare.discharge', 'daycare', 'Discharge day care patients'),
  ('billing.view', 'billing', 'View invoices and cashier ledger'),
  ('billing.create', 'billing', 'Generate invoices and charge slips'),
  ('billing.collect', 'billing', 'Collect payments and print receipts'),
  ('billing.edit', 'billing', 'Edit existing invoices and reassign referrals'),
  ('billing.discount', 'billing', 'Apply authorized fee discounts'),
  ('billing.void', 'billing', 'Void erroneous invoices'),
  ('billing.refund', 'billing', 'Process cash/online payment refunds'),
  ('billing.report', 'billing', 'Generate cashier shift summaries'),
  ('billing.manage', 'billing', 'Manage tariff pricing and billing policies'),
  ('payments.create', 'payments', 'Record financial payments'),
  ('expenses.view', 'expenses', 'View hospital expense vouchers'),
  ('expenses.create', 'expenses', 'Create hospital expense vouchers'),
  ('expenses.edit', 'expenses', 'Modify expense vouchers'),
  ('expenses.delete', 'expenses', 'Void and delete expense vouchers'),
  ('expenses.manage', 'expenses', 'Manage expense categories and budgets'),
  ('referral.view', 'referrals', 'View referral partners and commission balances'),
  ('referral.create', 'referrals', 'Register referral partners'),
  ('referral.edit', 'referrals', 'Edit partner details and commission rates'),
  ('referral.delete', 'referrals', 'Archive and delete referral partners'),
  ('referral.assign', 'referrals', 'Assign referral partners to invoices'),
  ('referral.commission_view', 'referrals', 'View commission reports'),
  ('referral.commission_pay', 'referrals', 'Disburse commission settlements'),
  ('referral.report_view', 'referrals', 'View referral audit performance'),
  ('referral.manage', 'referrals', 'Manage referral policies and contracts'),
  ('accounting.view', 'accounting', 'View chart of accounts and journal entries'),
  ('accounting.manage', 'accounting', 'Manage journal entries and trial balance'),
  ('procurement.view', 'procurement', 'View purchase requisitions and GRN'),
  ('procurement.manage', 'procurement', 'Manage procurement approvals and vendor bills'),
  ('assets.view', 'assets', 'View fixed assets register'),
  ('assets.manage', 'assets', 'Manage biomedical asset maintenance'),
  ('biomedical.view', 'biomedical', 'View equipment calibrations and safety'),
  ('biomedical.manage', 'biomedical', 'Manage radiation safety and QC protocols'),
  ('canteen.view', 'canteen', 'View cafeteria POS and meal logs'),
  ('canteen.manage', 'canteen', 'Manage cafeteria inventory and meal tariffs'),
  ('scholarship.view', 'scholarship', 'View welfare and poor-patient concessions'),
  ('scholarship.manage', 'scholarship', 'Authorize charitable financial relief'),
  ('feedback.view', 'feedback', 'View patient feedback and complaints'),
  ('feedback.manage', 'feedback', 'Resolve and close patient grievance tickets'),
  ('hr.view', 'hr', 'View employee directory and biometric attendance'),
  ('hr.manage', 'hr', 'Manage staff payroll, shifts and attendance rosters'),
  ('reports.view', 'reports', 'View operational and financial reports'),
  ('staff.view', 'settings', 'View staff directory'),
  ('staff.manage', 'settings', 'Manage staff accounts and invitations'),
  ('settings.view', 'settings', 'View hospital configurations'),
  ('settings.manage', 'settings', 'Modify organizational hospital settings'),
  ('settings.manage_roles', 'settings', 'Manage RBAC roles and permissions'),
  ('settings.hardware', 'settings', 'Configure thermal printers and scanners')
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  description = EXCLUDED.description;

-- -------------------------------------------------------------------------------------
-- 2. RLS POLICIES FOR `public.roles` AND `public.role_permissions`
-- -------------------------------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_roles_select ON public.roles;
CREATE POLICY rls_roles_select ON public.roles
FOR SELECT TO authenticated, service_role
USING (
  organization_id = COALESCE(
    private.get_current_org_id(),
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
  )
  OR is_system = true
  OR organization_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (is_super_admin = true OR role = 'super_admin')
  )
);

DROP POLICY IF EXISTS rls_role_permissions_select ON public.role_permissions;
CREATE POLICY rls_role_permissions_select ON public.role_permissions
FOR SELECT TO authenticated, service_role
USING (
  EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id = role_permissions.role_id
      AND (
        r.organization_id = COALESCE(
          private.get_current_org_id(),
          (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
          (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
        )
        OR r.is_system = true
        OR r.organization_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND (is_super_admin = true OR role = 'super_admin')
        )
      )
  )
);

-- -------------------------------------------------------------------------------------
-- 3. AUTHORITATIVE IN-DATABASE RPC: get_current_user_permissions
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_user_permissions(p_org_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_effective_org UUID;
  v_is_super BOOLEAN := FALSE;
  v_roles TEXT[] := '{}';
  v_perms TEXT[] := '{}';
  v_profile RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized');
  END IF;

  SELECT id, organization_id, active_organization_id, role, is_super_admin
  INTO v_profile
  FROM public.profiles
  WHERE id = v_caller_id
  LIMIT 1;

  v_effective_org := COALESCE(
    p_org_id,
    private.get_current_org_id(),
    v_profile.active_organization_id,
    v_profile.organization_id
  );

  v_is_super := (
    v_profile.is_super_admin IS TRUE
    OR LOWER(TRIM(REPLACE(COALESCE(v_profile.role, ''), ' ', '_'))) = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = v_caller_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = 'super_admin'
    )
  );

  -- Collect all active normalized role names for this user
  SELECT ARRAY_AGG(DISTINCT norm_role)
  INTO v_roles
  FROM (
    SELECT LOWER(TRIM(REPLACE(r.name, ' ', '_'))) AS norm_role
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = v_caller_id
      AND (v_effective_org IS NULL OR ur.organization_id = v_effective_org OR ur.organization_id IS NULL)
      AND ur.is_active IS NOT FALSE
    UNION
    SELECT LOWER(TRIM(REPLACE(v_profile.role, ' ', '_'))) AS norm_role
    WHERE v_profile.role IS NOT NULL AND TRIM(v_profile.role) <> ''
  ) sub
  WHERE norm_role IS NOT NULL AND norm_role <> '';

  -- Collect all active permissions
  IF v_is_super THEN
    v_perms := ARRAY['*'];
  ELSE
    SELECT ARRAY_AGG(DISTINCT rp.permission_key)
    INTO v_perms
    FROM public.role_permissions rp
    WHERE rp.role_id IN (
      SELECT ur.role_id
      FROM public.user_roles ur
      WHERE ur.user_id = v_caller_id
        AND (v_effective_org IS NULL OR ur.organization_id = v_effective_org OR ur.organization_id IS NULL)
        AND ur.is_active IS NOT FALSE
      UNION
      SELECT r.id
      FROM public.roles r
      WHERE (v_effective_org IS NULL OR r.organization_id = v_effective_org OR r.organization_id IS NULL)
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = ANY(v_roles)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_caller_id,
    'organization_id', v_effective_org,
    'is_super_admin', v_is_super,
    'roles', COALESCE(v_roles, '{}'::text[]),
    'permissions', COALESCE(v_perms, '{}'::text[])
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_permissions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_user_permissions(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_permissions(UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 4. HARDEN is_org_admin_or_has_permission AND has_permission
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_admin_or_has_permission(p_org_id UUID, p_perm_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_has BOOLEAN := FALSE;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = v_caller_id 
      AND (p_org_id IS NULL OR ur.organization_id = p_org_id)
      AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller_id
      AND (p.is_super_admin = TRUE OR LOWER(TRIM(REPLACE(COALESCE(p.role, ''), ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator'))
  ) INTO v_has;

  IF v_has THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = v_caller_id 
      AND (p_org_id IS NULL OR ur.organization_id = p_org_id)
      AND (rp.permission_key = p_perm_key OR rp.permission_key = '*')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON (
      LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = LOWER(TRIM(REPLACE(p.role, ' ', '_')))
      OR LOWER(TRIM(r.name)) = LOWER(TRIM(p.role))
    )
    JOIN public.role_permissions rp ON r.id = rp.role_id
    WHERE p.id = v_caller_id
      AND (p_org_id IS NULL OR r.organization_id = p_org_id OR r.organization_id IS NULL)
      AND (rp.permission_key = p_perm_key OR rp.permission_key = '*')
  ) INTO v_has;

  RETURN v_has;
END;
$$;

REVOKE ALL ON FUNCTION public.is_org_admin_or_has_permission(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin_or_has_permission(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin_or_has_permission(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_permission(perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_has BOOLEAN := FALSE;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = v_caller_id 
      AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_caller_id
      AND (p.is_super_admin = TRUE OR LOWER(TRIM(REPLACE(COALESCE(p.role, ''), ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator'))
  ) INTO v_has;

  IF v_has THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = v_caller_id 
      AND (rp.permission_key = perm_code OR rp.permission_key = '*')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON (
      LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = LOWER(TRIM(REPLACE(p.role, ' ', '_')))
      OR LOWER(TRIM(r.name)) = LOWER(TRIM(p.role))
    )
    JOIN public.role_permissions rp ON r.id = rp.role_id
    WHERE p.id = v_caller_id
      AND (rp.permission_key = perm_code OR rp.permission_key = '*')
  ) INTO v_has;

  RETURN v_has;
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 5. HARDEN RLS POLICIES ON referral_agents
-- -------------------------------------------------------------------------------------
DROP POLICY IF EXISTS ref_agents_select ON public.referral_agents;
CREATE POLICY ref_agents_select ON public.referral_agents
FOR SELECT TO authenticated, service_role
USING (
  organization_id = COALESCE(
    private.get_current_org_id(),
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
  )
  AND (
    public.is_org_admin_or_has_permission(organization_id, 'referral.view')
    OR public.is_org_admin_or_has_permission(organization_id, 'referral.create')
    OR public.is_org_admin_or_has_permission(organization_id, 'referral.manage')
    OR public.is_org_admin_or_has_permission(organization_id, 'referral.assign')
    OR public.is_org_admin_or_has_permission(organization_id, 'billing.view')
    OR public.is_org_admin_or_has_permission(organization_id, 'billing.create')
    OR public.is_org_admin_or_has_permission(organization_id, 'patients.view')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'cashier')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin IS TRUE OR LOWER(TRIM(REPLACE(COALESCE(p.role, ''), ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'cashier'))
    )
  )
);

DROP POLICY IF EXISTS ref_agents_insert ON public.referral_agents;
CREATE POLICY ref_agents_insert ON public.referral_agents
FOR INSERT TO authenticated, service_role
WITH CHECK (
  organization_id = COALESCE(
    private.get_current_org_id(),
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
  )
  AND (
    public.is_org_admin_or_has_permission(organization_id, 'referral.create')
    OR public.is_org_admin_or_has_permission(organization_id, 'referral.manage')
    OR public.is_org_admin_or_has_permission(organization_id, 'referral.assign')
    OR public.is_org_admin_or_has_permission(organization_id, 'billing.create')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'cashier')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin IS TRUE OR LOWER(TRIM(REPLACE(COALESCE(p.role, ''), ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'cashier'))
    )
  )
);

DROP POLICY IF EXISTS ref_agents_update ON public.referral_agents;
CREATE POLICY ref_agents_update ON public.referral_agents
FOR UPDATE TO authenticated, service_role
USING (
  organization_id = COALESCE(
    private.get_current_org_id(),
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
  )
  AND (
    public.is_org_admin_or_has_permission(organization_id, 'referral.edit')
    OR public.is_org_admin_or_has_permission(organization_id, 'referral.manage')
    OR public.is_org_admin_or_has_permission(organization_id, 'referral.create')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant')
    )
  )
);

-- -------------------------------------------------------------------------------------
-- 6. HARDEN RLS POLICIES ON expenses
-- -------------------------------------------------------------------------------------
DROP POLICY IF EXISTS rls_expenses_select ON public.expenses;
CREATE POLICY rls_expenses_select ON public.expenses
FOR SELECT TO authenticated, service_role
USING (
  organization_id = COALESCE(
    private.get_current_org_id(),
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
  )
  AND (
    public.is_org_admin_or_has_permission(organization_id, 'expenses.view')
    OR public.is_org_admin_or_has_permission(organization_id, 'expenses.manage')
    OR public.is_org_admin_or_has_permission(organization_id, 'expenses.create')
    OR public.is_org_admin_or_has_permission(organization_id, 'accounting.view')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'cashier')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin IS TRUE OR LOWER(TRIM(REPLACE(COALESCE(p.role, ''), ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'cashier'))
    )
  )
);

DROP POLICY IF EXISTS rls_expenses_insert ON public.expenses;
CREATE POLICY rls_expenses_insert ON public.expenses
FOR INSERT TO authenticated, service_role
WITH CHECK (
  organization_id = COALESCE(
    private.get_current_org_id(),
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid()),
    (SELECT active_organization_id FROM public.profiles WHERE id = auth.uid())
  )
  AND (
    public.is_org_admin_or_has_permission(organization_id, 'expenses.create')
    OR public.is_org_admin_or_has_permission(organization_id, 'expenses.manage')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND ur.organization_id = expenses.organization_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'cashier')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.is_super_admin IS TRUE OR LOWER(TRIM(REPLACE(COALESCE(p.role, ''), ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist', 'cashier'))
    )
  )
);

-- -------------------------------------------------------------------------------------
-- 7. UPGRADE search_referral_agents_for_billing RPC
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_referral_agents_for_billing(
    p_org_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_code VARCHAR(40),
    full_name VARCHAR(150),
    agent_type VARCHAR(50),
    phone VARCHAR(30),
    commission_rate_percent NUMERIC(5,2),
    is_commission_eligible BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        SELECT COALESCE(active_organization_id, organization_id)
        INTO v_active_org
        FROM public.profiles
        WHERE id = v_calling_user;
    END IF;

    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    IF v_calling_user IS NOT NULL AND current_user != 'service_role' THEN
        SELECT (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.roles r ON ur.role_id = r.id
                WHERE ur.user_id = v_calling_user AND ur.organization_id = p_org_id
                  AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier', 'receptionist')
            ) OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = v_calling_user
                  AND (p.is_super_admin IS TRUE OR LOWER(TRIM(REPLACE(COALESCE(p.role, ''), ' ', '_'))) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier', 'receptionist'))
            ) OR (
                public.is_org_admin_or_has_permission(p_org_id, 'billing.create') OR
                public.is_org_admin_or_has_permission(p_org_id, 'billing.edit') OR
                public.is_org_admin_or_has_permission(p_org_id, 'billing.manage') OR
                public.is_org_admin_or_has_permission(p_org_id, 'billing.view') OR
                public.is_org_admin_or_has_permission(p_org_id, 'referral.view') OR
                public.is_org_admin_or_has_permission(p_org_id, 'referral.assign') OR
                public.is_org_admin_or_has_permission(p_org_id, 'referral.create') OR
                public.is_org_admin_or_has_permission(p_org_id, 'referral.manage') OR
                public.is_org_admin_or_has_permission(p_org_id, 'patients.create')
            )
        ) INTO v_is_authorized;

        IF v_is_authorized IS NOT TRUE THEN
            RAISE EXCEPTION '403 Forbidden: Caller lacks billing cashier/edit authority' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        ra.id,
        ra.agent_code,
        ra.full_name,
        ra.agent_type,
        ra.phone,
        ra.commission_rate_percent,
        ra.is_commission_eligible
    FROM public.referral_agents ra
    WHERE ra.organization_id = p_org_id
      AND ra.is_active = TRUE
      AND ra.archived_at IS NULL
      AND (
          p_query IS NULL 
          OR TRIM(p_query) = ''
          OR ra.agent_code ILIKE '%' || TRIM(p_query) || '%'
          OR ra.full_name ILIKE '%' || TRIM(p_query) || '%'
          OR ra.phone ILIKE '%' || TRIM(p_query) || '%'
      )
    ORDER BY ra.full_name ASC
    LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_referral_agents_for_billing(UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 8. SYNCHRONIZE ORPHANED PROFILES INTO user_roles
-- -------------------------------------------------------------------------------------
INSERT INTO public.user_roles (id, organization_id, user_id, role_id, is_active, created_at)
SELECT 
  gen_random_uuid(),
  p.organization_id,
  p.id,
  r.id,
  true,
  now()
FROM public.profiles p
JOIN public.roles r ON (
  (r.organization_id = p.organization_id OR r.organization_id IS NULL)
  AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = LOWER(TRIM(REPLACE(p.role, ' ', '_')))
)
WHERE p.organization_id IS NOT NULL 
  AND p.role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role_id = r.id AND ur.organization_id = p.organization_id
  )
ON CONFLICT (organization_id, user_id, role_id) DO NOTHING;

-- -------------------------------------------------------------------------------------
-- 9. SEED STANDARD OPERATIONAL PERMISSIONS FOR RECEPTIONIST & FRONT-DESK STAFF
-- -------------------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('dashboard.view'),
    ('patients.view'),
    ('patients.create'),
    ('patients.edit'),
    ('patients.delete'),
    ('appointments.view'),
    ('appointments.create'),
    ('appointments.edit'),
    ('appointments.cancel'),
    ('appointments.call_token'),
    ('doctors.view'),
    ('opd.view'),
    ('ipd.view'),
    ('ipd.manage'),
    ('ipd.admit'),
    ('ipd.discharge'),
    ('emergency.view'),
    ('emergency.triage'),
    ('specialties.view'),
    ('lab.view'),
    ('radiology.view'),
    ('blood_bank.view'),
    ('pharmacy.view'),
    ('beds.view'),
    ('beds.allocate'),
    ('critical_care.view'),
    ('ot.view'),
    ('prescriptions.view'),
    ('prescriptions.create'),
    ('registrar.view'),
    ('ambulance.view'),
    ('daycare.view'),
    ('billing.view'),
    ('billing.create'),
    ('billing.collect'),
    ('billing.edit'),
    ('billing.report'),
    ('payments.create'),
    ('expenses.view'),
    ('expenses.create'),
    ('referral.view'),
    ('referral.create'),
    ('referral.assign'),
    ('reports.view')
) AS perms(p_key)
WHERE LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('receptionist', 'cashier')
ON CONFLICT (role_id, permission_key) DO NOTHING;

COMMIT;
