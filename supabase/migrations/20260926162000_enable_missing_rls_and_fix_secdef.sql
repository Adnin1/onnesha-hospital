-- =====================================================================================
-- 20260927000000_enable_missing_rls_and_fix_secdef.sql
-- =====================================================================================
-- Fixes missing RLS enablement and missing search_path in SECURITY DEFINER functions.

-- 1. Enable RLS and add tenant isolation policies for tables missing RLS
DO $$$
DECLARE
    tbl TEXT;
    tables_with_org TEXT[] := ARRAY[
        'attendance', 'attendance_devices', 'bed_allocation_history', 'bed_allocations',
        'bed_types', 'branches', 'diagnostic_test_parameters', 'doctor_commission_rules',
        'doctor_commissions', 'doctor_departments', 'doctor_leaves', 'employee_designations',
        'expense_categories', 'inventory_transactions', 'lab_categories', 'lab_test_categories',
        'lab_test_parameters', 'lab_tests', 'leave_requests', 'leave_types', 'medicine_brands',
        'medicine_categories', 'medicine_generics', 'medicine_suppliers', 'patient_files',
        'patient_medical_history', 'payrolls', 'permissions', 'purchase_order_items',
        'sms_providers', 'stock_adjustments', 'users'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables_with_org LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS service_role_bypass_policy ON public.%I;', tbl);
        
        EXECUTE format('
            CREATE POLICY tenant_isolation_policy ON public.%I
            FOR ALL TO authenticated
            USING (organization_id = private.get_current_org_id())
            WITH CHECK (organization_id = private.get_current_org_id());
        ', tbl);

        EXECUTE format('
            CREATE POLICY service_role_bypass_policy ON public.%I
            FOR ALL TO service_role USING (true) WITH CHECK (true);
        ', tbl);
    END LOOP;
END $$$;

-- Handle the 4 tables without organization_id but bound via parents
ALTER TABLE public.ot_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_team_members FORCE ROW LEVEL SECURITY;
CREATE POLICY ot_team_members_tenant_isolation ON public.ot_team_members FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.ot_bookings p WHERE p.id = ot_booking_id AND p.organization_id = private.get_current_org_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public.ot_bookings p WHERE p.id = ot_booking_id AND p.organization_id = private.get_current_org_id()));
CREATE POLICY ot_team_members_service ON public.ot_team_members FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_items_tenant_isolation ON public.payroll_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.payroll_runs p WHERE p.id = payroll_run_id AND p.organization_id = private.get_current_org_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public.payroll_runs p WHERE p.id = payroll_run_id AND p.organization_id = private.get_current_org_id()));
CREATE POLICY payroll_items_service ON public.payroll_items FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.prescription_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY prescription_notes_tenant_isolation ON public.prescription_notes FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_id AND p.organization_id = private.get_current_org_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_id AND p.organization_id = private.get_current_org_id()));
CREATE POLICY prescription_notes_service ON public.prescription_notes FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.token_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_calls FORCE ROW LEVEL SECURITY;
CREATE POLICY token_calls_tenant_isolation ON public.token_calls FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.waiting_queue p WHERE p.id = waiting_queue_id AND p.organization_id = private.get_current_org_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public.waiting_queue p WHERE p.id = waiting_queue_id AND p.organization_id = private.get_current_org_id()));
CREATE POLICY token_calls_service ON public.token_calls FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Add this to the end of the migration file
DO $$$
DECLARE
    rec RECORD;
    cmd TEXT;
BEGIN
    FOR rec IN 
        SELECT 
            n.nspname AS schema_name,
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS args,
            proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = true
          AND n.nspname IN ('public', 'private')
          -- Check if search_path is NOT already set in proconfig
          AND (p.proconfig IS NULL OR NOT 'search_path=' = ANY(p.proconfig))
    LOOP
        cmd := format('ALTER FUNCTION %I.%I(%s) SET search_path = '''';', rec.schema_name, rec.function_name, rec.args);
        EXECUTE cmd;
    END LOOP;
END $$$;
