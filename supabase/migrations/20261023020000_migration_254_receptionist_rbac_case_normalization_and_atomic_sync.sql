-- =====================================================================================
-- Migration 254: Receptionist RBAC Case Normalization, Synchronization & Invariant Hardening
-- Timestamp: 20261023020000
-- Forward-only migration addressing case-mismatched role resolution and receptionist permissions.
-- =====================================================================================

BEGIN;

-- 1. Ensure all standard operational permissions exist in public.permissions
INSERT INTO public.permissions (key, module, description)
VALUES 
  ('patients.view', 'PATIENTS', 'View patient directory and profile details'),
  ('patients.create', 'PATIENTS', 'Register new patients during intake'),
  ('patients.edit', 'PATIENTS', 'Edit existing patient demographic information'),
  ('patients.delete', 'PATIENTS', 'Remove or archive patient profile records'),
  ('patients.manage', 'PATIENTS', 'Comprehensive patient record administration'),
  ('appointments.view', 'APPOINTMENTS', 'View doctor appointments and schedules'),
  ('appointments.create', 'APPOINTMENTS', 'Book new doctor appointment or visit slot'),
  ('appointments.call_token', 'APPOINTMENTS', 'Call patient token in queue TV display'),
  ('appointments.manage', 'APPOINTMENTS', 'Reschedule, cancel, and manage appointments'),
  ('doctors.view', 'DOCTORS', 'View doctor directory, fees, and visiting hours'),
  ('opd.view', 'OPD', 'View Outpatient Department consultation desk'),
  ('opd.manage', 'OPD', 'Manage Outpatient consultation queues and assignments'),
  ('ipd.view', 'IPD', 'View Inpatient Department bed occupancy and admissions'),
  ('ipd.manage', 'IPD', 'Manage inpatient beds, cabins, and ward configurations'),
  ('ipd.admit', 'IPD', 'Admit patient into general ward, cabin, or unit'),
  ('ipd.discharge', 'IPD', 'Execute inpatient discharge summary and clearance'),
  ('beds.view', 'BED_IPD', 'View hospital bed and cabin matrix'),
  ('beds.allocate', 'BED_IPD', 'Allocate or reassign bed to admitted patient'),
  ('beds.manage', 'BED_IPD', 'Configure hospital beds, cabins, and ward tariffs'),
  ('critical_care.view', 'CRITICAL_CARE', 'View ICU, CCU, HDU, NICU unit occupancy'),
  ('critical_care.manage', 'CRITICAL_CARE', 'Manage critical care patient bed allocations'),
  ('prescriptions.view', 'PRESCRIPTIONS', 'View digital patient prescriptions and Rx history'),
  ('prescriptions.create', 'PRESCRIPTIONS', 'Create new digital prescription or medication order'),
  ('lab.view', 'LAB_DIAGNOSTICS', 'View diagnostic test catalog and lab order queue'),
  ('lab.order', 'LAB_DIAGNOSTICS', 'Create laboratory and imaging diagnostic orders'),
  ('billing.view', 'BILLING', 'View patient bills, invoices, and payment receipts'),
  ('billing.create', 'BILLING', 'Generate intake bills and consultation invoices'),
  ('billing.collect', 'BILLING', 'Receive patient cash, card, and MFS payments'),
  ('billing.edit', 'BILLING', 'Modify invoice line items and apply adjustments'),
  ('billing.report', 'BILLING', 'View daily collection summaries and shift reports'),
  ('payments.create', 'BILLING', 'Record payment transactions and print money receipts'),
  ('referral.view', 'REFERRALS', 'Look up referral agents and partner directory'),
  ('referral.assign', 'REFERRALS', 'Attribute patient visits to referral agent'),
  ('referral.manage', 'REFERRALS', 'Manage referral agent directory and commission tiers'),
  ('blood_bank.view', 'BLOOD_BANK', 'View blood inventory and donor roster'),
  ('blood_bank.donor.create', 'BLOOD_BANK', 'Register prospective blood donors'),
  ('blood_bank.crossmatch', 'BLOOD_BANK', 'Execute blood grouping and crossmatching checks'),
  ('blood_bank.issue', 'BLOOD_BANK', 'Issue blood units for transfusion'),
  ('blood_bank.manage', 'BLOOD_BANK', 'Manage hospital blood bank stock and requests'),
  ('reports.view', 'REPORTS', 'View clinical, census, and operational reports')
ON CONFLICT (key) DO NOTHING;

-- 2. Consolidate and normalize role names in public.roles
-- Ensure canonical receptionist role exists for the primary organization
DO $$
DECLARE
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_canonical_rec_id UUID;
  v_rec_role RECORD;
BEGIN
  -- Find or choose canonical receptionist role
  SELECT id INTO v_canonical_rec_id
  FROM public.roles
  WHERE organization_id = v_org_id
    AND LOWER(TRIM(REPLACE(name, ' ', '_'))) = 'receptionist'
  ORDER BY is_system DESC, created_at ASC
  LIMIT 1;

  IF v_canonical_rec_id IS NULL THEN
    INSERT INTO public.roles (id, organization_id, name, description, is_system, created_at)
    VALUES (
      'b0000000-0000-0000-0000-000000000003',
      v_org_id,
      'receptionist',
      'Front desk registration and appointment calling',
      TRUE,
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET name = 'receptionist'
    RETURNING id INTO v_canonical_rec_id;
  ELSE
    -- Normalize name to lowercase snake_case
    UPDATE public.roles
    SET name = 'receptionist'
    WHERE id = v_canonical_rec_id;
  END IF;

  -- Re-point any user_roles referencing duplicate receptionist roles to canonical role
  FOR v_rec_role IN
    SELECT id FROM public.roles
    WHERE organization_id = v_org_id
      AND LOWER(TRIM(REPLACE(name, ' ', '_'))) = 'receptionist'
      AND id <> v_canonical_rec_id
  LOOP
    UPDATE public.user_roles
    SET role_id = v_canonical_rec_id
    WHERE role_id = v_rec_role.id;

    -- Copy permissions to canonical role
    INSERT INTO public.role_permissions (role_id, permission_key)
    SELECT v_canonical_rec_id, permission_key
    FROM public.role_permissions
    WHERE role_id = v_rec_role.id
    ON CONFLICT (role_id, permission_key) DO NOTHING;

    -- Also keep permissions on duplicate role so existing tokens/queries never fail
    INSERT INTO public.role_permissions (role_id, permission_key)
    SELECT v_rec_role.id, permission_key
    FROM public.role_permissions
    WHERE role_id = v_canonical_rec_id
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END LOOP;
END $$;

-- 3. Seed authoritative operational permissions for receptionist role
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.perm
FROM public.roles r
CROSS JOIN (
  VALUES 
    ('patients.view'),
    ('patients.create'),
    ('patients.edit'),
    ('patients.delete'),
    ('appointments.view'),
    ('appointments.create'),
    ('appointments.call_token'),
    ('appointments.manage'),
    ('doctors.view'),
    ('opd.view'),
    ('ipd.view'),
    ('ipd.manage'),
    ('ipd.admit'),
    ('ipd.discharge'),
    ('beds.view'),
    ('beds.allocate'),
    ('critical_care.view'),
    ('critical_care.manage'),
    ('prescriptions.view'),
    ('prescriptions.create'),
    ('lab.view'),
    ('lab.order'),
    ('billing.view'),
    ('billing.create'),
    ('billing.collect'),
    ('billing.report'),
    ('payments.create'),
    ('referral.view'),
    ('referral.assign'),
    ('blood_bank.view'),
    ('blood_bank.donor.create'),
    ('blood_bank.crossmatch'),
    ('blood_bank.issue'),
    ('blood_bank.manage'),
    ('reports.view')
) AS p(perm)
WHERE LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = 'receptionist'
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 4. Redefine save_role_permissions_atomic with robust case-insensitive multi-role sync
CREATE OR REPLACE FUNCTION public.save_role_permissions_atomic(
  p_org_id UUID,
  p_role_name TEXT,
  p_permission_keys TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id UUID;
  v_norm_role TEXT;
  v_perm_key TEXT;
  v_other_role RECORD;
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN := false;
BEGIN
  IF p_org_id IS NULL OR p_role_name IS NULL OR TRIM(p_role_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS: Organization ID and Role Name are required.');
  END IF;

  v_norm_role := LOWER(TRIM(REPLACE(p_role_name, ' ', '_')));

  -- 1. Trusted service_role or DB admin session
  IF (auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))) IS TRUE THEN
    v_is_authorized := true;
  -- 2. Authenticated user: Super Admin or Admin of target organization
  ELSIF v_caller_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = v_caller_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = 'super_admin'
    ) THEN
      v_is_authorized := true;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_caller_id
          AND ur.organization_id = p_org_id
          AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('admin', 'hospital_administrator')
      ) INTO v_is_authorized;
    END IF;
  ELSE
    v_is_authorized := false;
  END IF;

  IF v_is_authorized IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Only authorized administrator can modify RBAC permissions.');
  END IF;

  -- Find canonical role for target organization case-insensitively
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE organization_id = p_org_id
    AND (
      LOWER(TRIM(REPLACE(name, ' ', '_'))) = v_norm_role
      OR name = TRIM(p_role_name)
    )
  ORDER BY is_system DESC, created_at ASC
  LIMIT 1;

  IF v_role_id IS NULL THEN
    INSERT INTO public.roles (organization_id, name, description, is_system, created_at)
    VALUES (p_org_id, v_norm_role, 'Configured role: ' || v_norm_role, false, now())
    RETURNING id INTO v_role_id;
  END IF;

  -- Ensure all permission keys exist in public.permissions catalog
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
    IF p_permission_keys IS NOT NULL AND array_length(p_permission_keys, 1) > 0 THEN
      FOREACH v_perm_key IN ARRAY p_permission_keys
      LOOP
        IF v_perm_key IS NOT NULL AND TRIM(v_perm_key) <> '' THEN
          INSERT INTO public.permissions (key, module, description)
          VALUES (TRIM(v_perm_key), split_part(TRIM(v_perm_key), '.', 1), 'System permission ' || TRIM(v_perm_key))
          ON CONFLICT (key) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Synchronize to all matching role entries in this organization to guarantee zero authorization drift
  FOR v_other_role IN
    SELECT id FROM public.roles
    WHERE organization_id = p_org_id
      AND (
        LOWER(TRIM(REPLACE(name, ' ', '_'))) = v_norm_role
        OR name = TRIM(p_role_name)
      )
  LOOP
    DELETE FROM public.role_permissions WHERE role_id = v_other_role.id;

    IF p_permission_keys IS NOT NULL AND array_length(p_permission_keys, 1) > 0 THEN
      FOREACH v_perm_key IN ARRAY p_permission_keys
      LOOP
        IF v_perm_key IS NOT NULL AND TRIM(v_perm_key) <> '' THEN
          INSERT INTO public.role_permissions (role_id, permission_key)
          VALUES (v_other_role.id, TRIM(v_perm_key))
          ON CONFLICT (role_id, permission_key) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'role_id', v_role_id,
    'role_name', v_norm_role,
    'permissions_count', COALESCE(array_length(p_permission_keys, 1), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_role_permissions_atomic(UUID, TEXT, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_role_permissions_atomic(UUID, TEXT, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_role_permissions_atomic(UUID, TEXT, TEXT[]) TO authenticated, service_role;

-- 5. Redefine get_organization_role_permissions_matrix with normalized role mapping
CREATE OR REPLACE FUNCTION public.get_organization_role_permissions_matrix(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_role RECORD;
  v_perms JSONB;
  v_norm_name TEXT;
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN := false;
  v_is_super_admin BOOLEAN := false;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS: Organization ID required');
  END IF;

  -- 1. Trusted service_role or DB admin session
  IF (auth.role() = 'service_role' OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))) IS TRUE THEN
    v_is_authorized := true;
  -- 2. Authenticated user: Must be admin or hr in target organization (or global super_admin)
  ELSIF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = v_caller_id
        AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) = 'super_admin'
    ) INTO v_is_super_admin;

    IF v_is_super_admin THEN
      v_is_authorized := true;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_caller_id
          AND ur.organization_id = p_org_id
          AND LOWER(TRIM(REPLACE(r.name, ' ', '_'))) IN ('admin', 'hospital_administrator', 'hr_manager', 'hr_payroll')
      ) INTO v_is_authorized;
    END IF;
  ELSE
    v_is_authorized := false;
  END IF;

  IF v_is_authorized IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Unauthorized access to organization role matrix.');
  END IF;

  FOR v_role IN 
    SELECT r.id, r.name 
    FROM public.roles r
    WHERE r.organization_id = p_org_id
    ORDER BY r.name ASC
  LOOP
    SELECT COALESCE(jsonb_agg(rp.permission_key ORDER BY rp.permission_key), '[]'::jsonb)
    INTO v_perms
    FROM public.role_permissions rp
    WHERE rp.role_id = v_role.id;

    v_norm_name := LOWER(TRIM(REPLACE(v_role.name, ' ', '_')));

    -- Store under original name AND canonical normalized snake_case name
    v_result := jsonb_set(v_result, ARRAY[v_role.name], v_perms, true);
    IF v_norm_name <> v_role.name THEN
      v_result := jsonb_set(v_result, ARRAY[v_norm_name], v_perms, true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'matrix', v_result, 'organization_id', p_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_role_permissions_matrix(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_role_permissions_matrix(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organization_role_permissions_matrix(UUID) TO authenticated, service_role;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
