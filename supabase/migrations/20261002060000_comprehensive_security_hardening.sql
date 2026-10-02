-- =====================================================================================
-- 20261002060000_comprehensive_security_hardening.sql
-- Closes ALL remaining RLS, view security_invoker, and SECURITY DEFINER gaps
-- identified during the v1.1.32 forensic security audit.
-- Forward-only, idempotent, preserves existing policies.
-- =====================================================================================

-- ========================================
-- SECTION 1: Enable RLS on all tables that were missing it
-- ========================================
-- These tables were identified as lacking RLS during the comprehensive audit.
-- Using IF EXISTS to ensure idempotency.

DO $$ 
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'permissions', 'profiles', 'doctor_departments', 'doctor_leaves',
    'token_calls', 'prescription_notes', 'diagnostic_test_parameters',
    'medicine_generics', 'medicine_categories', 'medicine_suppliers',
    'purchase_order_items', 'stock_adjustments', 'bed_types',
    'ot_team_members', 'employee_designations', 'attendance_devices',
    'leave_types', 'leave_requests', 'payroll_items', 'expense_categories',
    'inventory_transactions', 'sms_providers', 'patient_files',
    'lab_test_categories', 'lab_tests', 'lab_test_parameters',
    'medicine_brands', 'bed_allocation_history', 'payrolls',
    'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
    'purchase_requisitions', 'goods_receipt_notes', 'warehouses',
    'inventory_transfers', 'hospital_assets', 'asset_maintenance_logs',
    'nursing_notes', 'patient_vitals_rounds',
    'critical_care_admissions', 'critical_care_observations',
    'radiology_studies', 'radiology_media_stock',
    'blood_bank_inventory', 'blood_bag_issuances',
    'push_subscriptions', 'notification_outbox'
  ])
  LOOP
    -- Only enable RLS if the table actually exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

-- ========================================
-- SECTION 2: Create tenant isolation RLS policies for tables that need them
-- ========================================
-- Pattern: organization_id = get_current_org_id()
-- Only create policies for tables that have an organization_id column.

DO $$
DECLARE
  tbl TEXT;
  policy_name TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'doctor_departments', 'doctor_leaves', 'token_calls',
    'prescription_notes', 'diagnostic_test_parameters',
    'medicine_generics', 'medicine_categories', 'medicine_suppliers',
    'purchase_order_items', 'stock_adjustments', 'bed_types',
    'ot_team_members', 'employee_designations', 'leave_types',
    'leave_requests', 'payroll_items', 'expense_categories',
    'inventory_transactions', 'patient_files',
    'lab_test_categories', 'lab_tests', 'lab_test_parameters',
    'medicine_brands', 'bed_allocation_history', 'payrolls',
    'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
    'purchase_requisitions', 'goods_receipt_notes', 'warehouses',
    'inventory_transfers', 'hospital_assets', 'asset_maintenance_logs',
    'nursing_notes', 'patient_vitals_rounds',
    'critical_care_admissions', 'critical_care_observations',
    'radiology_studies', 'radiology_media_stock',
    'blood_bank_inventory', 'blood_bag_issuances',
    'notification_outbox'
  ])
  LOOP
    policy_name := 'rls_tenant_' || tbl;
    -- Only create if table exists AND has organization_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (organization_id = get_current_org_id())',
        policy_name, tbl
      );
    END IF;
  END LOOP;
END $$;

-- Profiles and permissions use user_id pattern, not organization_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    DROP POLICY IF EXISTS rls_profiles_self ON public.profiles;
    CREATE POLICY rls_profiles_self ON public.profiles
      FOR ALL USING (id = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
    DROP POLICY IF EXISTS rls_permissions_authenticated ON public.permissions;
    CREATE POLICY rls_permissions_authenticated ON public.permissions
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ========================================
-- SECTION 3: Fix views missing security_invoker = true
-- ========================================
-- Views without security_invoker bypass RLS when queried.

DO $$
DECLARE
  vw TEXT;
BEGIN
  FOR vw IN SELECT unnest(ARRAY[
    'public_doctors_view',
    'public_departments_view', 
    'audit_trail_summary'
  ])
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = vw) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', vw);
    END IF;
  END LOOP;
END $$;

-- ========================================
-- SECTION 4: Harden SECURITY DEFINER functions with SET search_path = ''
-- ========================================
-- Functions with SECURITY DEFINER are vulnerable to search_path hijacking
-- unless they have SET search_path = ''.
-- This section patches all known SECURITY DEFINER functions.

DO $$
DECLARE
  func_record RECORD;
BEGIN
  -- Find all SECURITY DEFINER functions in public schema
  FOR func_record IN 
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prosecdef = true
    -- Only patch if search_path is not already set
    AND NOT (p.proconfig IS NOT NULL AND array_to_string(p.proconfig, ',') LIKE '%search_path%')
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = ''''',
        func_record.proname, func_record.args
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log but don't fail the migration for individual function issues
      RAISE NOTICE 'Could not set search_path for function %: %', func_record.proname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ========================================
-- SECTION 5: Revoke EXECUTE from PUBLIC on sensitive RPCs
-- ========================================
-- Sensitive RPCs should only be callable by authenticated/service_role.

DO $$
DECLARE
  func_name TEXT;
BEGIN
  FOR func_name IN SELECT unnest(ARRAY[
    'generate_patient_code',
    'generate_visit_number',
    'generate_emergency_temp_id',
    'generate_invoice_number',
    'generate_appointment_token',
    'verify_and_record_online_payment',
    'update_hospital_master_profile',
    'ingest_analyzer_transmission_atomic',
    'get_current_org_id'
  ])
  LOOP
    -- Check if function exists before revoking
    IF EXISTS (
      SELECT 1 FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public' AND p.proname = func_name
    ) THEN
      -- Revoke from public/anon, grant only to authenticated and service_role
      BEGIN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM PUBLIC', func_name);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM anon', func_name);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO authenticated', func_name);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO service_role', func_name);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Grant/revoke issue for %: %', func_name, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- ========================================
-- SECTION 6: Verify get_current_org_id has safe search_path
-- ========================================
ALTER FUNCTION public.get_current_org_id() SET search_path = '';

-- ========================================
-- AUDIT NOTE
-- ========================================
-- This migration was generated as part of the v1.1.32 comprehensive security audit.
-- It addresses findings from:
--   - Missing RLS on 38+ tables
--   - 3 views missing security_invoker = true
--   - SECURITY DEFINER functions missing SET search_path = ''
--   - Overly permissive EXECUTE grants on sensitive RPCs
-- All changes are idempotent and forward-only.
