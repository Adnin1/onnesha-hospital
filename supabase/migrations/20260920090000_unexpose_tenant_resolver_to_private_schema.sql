-- =====================================================================================
-- Migration 46: Move tenant resolver to unexposed private schema,
-- eliminate SECURITY DEFINER helpers from public schema, and enforce strict RLS.
-- =====================================================================================

-- 1. Create private schema (unexposed to PostgREST)
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Define authoritative get_current_org_id() inside private schema
CREATE OR REPLACE FUNCTION private.get_current_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID;
    v_role_org_id UUID;
    v_role_org_count INT;
    v_caller_role TEXT;
BEGIN
    -- 1. Explicit session GUC override
    v_org_id := NULLIF(pg_catalog.current_setting('app.current_organization_id', true), '')::uuid;

    IF v_org_id IS NOT NULL THEN
        -- If invoked by an authenticated user, verify that caller actually belongs to this organization
        IF auth.uid() IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.profiles
                WHERE id = auth.uid()
                  AND is_active = TRUE
                  AND (organization_id = v_org_id OR active_organization_id = v_org_id)
            ) AND NOT EXISTS (
                SELECT 1
                FROM public.user_roles
                WHERE user_id = auth.uid()
                  AND organization_id = v_org_id
            ) THEN
                -- Caller does not belong to the requested organization: fail closed!
                v_org_id := NULL;
            END IF;
        ELSE
            -- Check caller role safely from JWT claims without deprecated auth.role()
            v_caller_role := COALESCE(
                NULLIF(pg_catalog.current_setting('request.jwt.claims', true)::jsonb->>'role', ''),
                NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '')
            );

            -- If invoked without authenticated session (anonymous / unprivileged), FAIL CLOSED
            -- Only trusted service_role backend processes are permitted to supply org without auth.uid()
            IF current_user != 'service_role' AND (v_caller_role IS NULL OR v_caller_role != 'service_role') THEN
                v_org_id := NULL;
            END IF;
        END IF;

        IF v_org_id IS NOT NULL THEN
            RETURN v_org_id;
        END IF;
    END IF;

    -- 2. Authenticated user session fallback (Supabase PostgREST JWT caller)
    IF auth.uid() IS NOT NULL THEN
        -- Check active profile active_organization_id or organization_id
        SELECT COALESCE(active_organization_id, organization_id) INTO v_org_id
        FROM public.profiles
        WHERE id = auth.uid() AND is_active = TRUE;

        IF v_org_id IS NOT NULL THEN
            RETURN v_org_id;
        END IF;

        -- Fallback to distinct organization mapping in user_roles
        -- Deterministic: if and only if the user belongs to exactly one distinct organization
        SELECT COUNT(DISTINCT organization_id), MIN(organization_id::text)::uuid
        INTO v_role_org_count, v_role_org_id
        FROM public.user_roles
        WHERE user_id = auth.uid();

        IF v_role_org_count = 1 THEN
            RETURN v_role_org_id;
        END IF;
    END IF;

    -- 3. Fail closed if not resolved
    RETURN NULL;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

-- 3. Restrict permissions on private schema & function
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.get_current_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_current_org_id() TO authenticated, service_role;

-- 4. Replace public.get_current_org_id with a non-SECURITY DEFINER stub and revoke public execute
-- This ensures PostgREST RPC /rpc/get_current_org_id cannot be executed by anon or authenticated callers
CREATE OR REPLACE FUNCTION public.get_current_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
    RETURN private.get_current_org_id();
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_org_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_org_id() TO service_role;

-- 5. Audit and revoke unnecessary execute grants on internal helper functions in public schema
REVOKE EXECUTE ON FUNCTION public.has_permission(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;

-- 6. Update all Row-Level Security policies to explicitly reference private.get_current_org_id()

-- Patients & Encounters
DROP POLICY IF EXISTS rls_patients ON public.patients;
CREATE POLICY rls_patients ON public.patients FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_visits ON public.patient_visits;
CREATE POLICY rls_visits ON public.patient_visits FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Appointments & Token Queue
DROP POLICY IF EXISTS rls_appointments ON public.appointments;
CREATE POLICY rls_appointments ON public.appointments FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Invoices & Payments Ledger
DROP POLICY IF EXISTS rls_invoices ON public.invoices;
CREATE POLICY rls_invoices ON public.invoices FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_payments ON public.payments;
CREATE POLICY rls_payments ON public.payments FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Diagnostics & Lab
DROP POLICY IF EXISTS rls_diagnostic_orders ON public.diagnostic_orders;
CREATE POLICY rls_diagnostic_orders ON public.diagnostic_orders FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Pharmacy & Inventory Transactions
DROP POLICY IF EXISTS rls_pharmacy_sales ON public.pharmacy_sales;
CREATE POLICY rls_pharmacy_sales ON public.pharmacy_sales FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_stock_transactions ON public.stock_transactions;
CREATE POLICY rls_stock_transactions ON public.stock_transactions FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Beds, Cabins & Bed Assignments
DROP POLICY IF EXISTS rls_beds ON public.beds;
CREATE POLICY rls_beds ON public.beds FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_cabins ON public.cabins;
CREATE POLICY rls_cabins ON public.cabins FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_bed_assignments ON public.bed_assignments;
CREATE POLICY rls_bed_assignments ON public.bed_assignments FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- HR, Attendance, Expenses & Audit
DROP POLICY IF EXISTS rls_employees ON public.employees;
CREATE POLICY rls_employees ON public.employees FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_attendance ON public.attendance_records;
CREATE POLICY rls_attendance ON public.attendance_records FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_expenses ON public.expenses;
CREATE POLICY rls_expenses ON public.expenses FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_audit ON public.audit_logs;
CREATE POLICY rls_audit ON public.audit_logs FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Enterprise Integrations, Notifications & Payments
DROP POLICY IF EXISTS rls_organization_integrations ON public.organization_integrations;
DROP POLICY IF EXISTS rls_organization_integrations_staff ON public.organization_integrations;
CREATE POLICY rls_organization_integrations ON public.organization_integrations FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_notification_templates ON public.notification_templates;
CREATE POLICY rls_notification_templates ON public.notification_templates FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_notification_preferences ON public.notification_preferences;
CREATE POLICY rls_notification_preferences ON public.notification_preferences FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_notification_outbox ON public.notification_outbox;
CREATE POLICY rls_notification_outbox ON public.notification_outbox FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_payment_intents ON public.payment_intents;
CREATE POLICY rls_payment_intents ON public.payment_intents FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_webhook_events ON public.webhook_events;
CREATE POLICY rls_webhook_events ON public.webhook_events FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_payment_reconciliations ON public.payment_reconciliations;
CREATE POLICY rls_payment_reconciliations ON public.payment_reconciliations FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Printing Templates & Logs
DROP POLICY IF EXISTS rls_print_templates ON public.print_templates;
CREATE POLICY rls_print_templates ON public.print_templates FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_document_print_logs ON public.document_print_logs;
CREATE POLICY rls_document_print_logs ON public.document_print_logs FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Push Subscriptions
DROP POLICY IF EXISTS rls_push_subscriptions ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_tenant_isolation ON public.push_subscriptions;
CREATE POLICY rls_push_subscriptions ON public.push_subscriptions FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

-- Organization Master & User Roles
DROP POLICY IF EXISTS rls_organizations_staff_select ON public.organizations;
CREATE POLICY rls_organizations_staff_select ON public.organizations
    FOR SELECT TO authenticated, service_role
    USING (id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_organizations_staff_update ON public.organizations;
CREATE POLICY rls_organizations_staff_update ON public.organizations
    FOR UPDATE TO authenticated, service_role
    USING (id = private.get_current_org_id() AND public.is_org_admin_or_has_permission(id, 'settings.manage'))
    WITH CHECK (id = private.get_current_org_id() AND public.is_org_admin_or_has_permission(id, 'settings.manage'));

DROP POLICY IF EXISTS rls_user_roles ON public.user_roles;
CREATE POLICY rls_user_roles ON public.user_roles FOR ALL TO authenticated, service_role
    USING (organization_id = private.get_current_org_id() OR user_id = auth.uid());

-- Departments Master
DROP POLICY IF EXISTS rls_departments_staff_select ON public.departments;
CREATE POLICY rls_departments_staff_select ON public.departments
    FOR SELECT TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_departments_staff_insert ON public.departments;
CREATE POLICY rls_departments_staff_insert ON public.departments
    FOR INSERT TO authenticated, service_role
    WITH CHECK (
        organization_id = private.get_current_org_id()
        AND public.is_org_admin_or_has_permission(organization_id, 'departments.manage')
    );

DROP POLICY IF EXISTS rls_departments_staff_update ON public.departments;
CREATE POLICY rls_departments_staff_update ON public.departments
    FOR UPDATE TO authenticated, service_role
    USING (
        organization_id = private.get_current_org_id()
        AND public.is_org_admin_or_has_permission(organization_id, 'departments.manage')
    )
    WITH CHECK (
        organization_id = private.get_current_org_id()
        AND public.is_org_admin_or_has_permission(organization_id, 'departments.manage')
    );

DROP POLICY IF EXISTS rls_departments_staff_delete ON public.departments;
CREATE POLICY rls_departments_staff_delete ON public.departments
    FOR DELETE TO authenticated, service_role
    USING (
        organization_id = private.get_current_org_id()
        AND public.is_org_admin_or_has_permission(organization_id, 'departments.manage')
    );

-- Doctors Master
DROP POLICY IF EXISTS rls_doctors_staff_select ON public.doctors;
CREATE POLICY rls_doctors_staff_select ON public.doctors
    FOR SELECT TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_doctors_staff_insert ON public.doctors;
CREATE POLICY rls_doctors_staff_insert ON public.doctors
    FOR INSERT TO authenticated, service_role
    WITH CHECK (
        organization_id = private.get_current_org_id()
        AND public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
    );

DROP POLICY IF EXISTS rls_doctors_staff_update ON public.doctors;
CREATE POLICY rls_doctors_staff_update ON public.doctors
    FOR UPDATE TO authenticated, service_role
    USING (
        organization_id = private.get_current_org_id()
        AND public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
    )
    WITH CHECK (
        organization_id = private.get_current_org_id()
        AND public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
    );

DROP POLICY IF EXISTS rls_doctors_staff_delete ON public.doctors;
CREATE POLICY rls_doctors_staff_delete ON public.doctors
    FOR DELETE TO authenticated, service_role
    USING (
        organization_id = private.get_current_org_id()
        AND public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
    );

-- Doctor Schedules
DROP POLICY IF EXISTS rls_doctor_schedules_staff_select ON public.doctor_schedules;
CREATE POLICY rls_doctor_schedules_staff_select ON public.doctor_schedules
    FOR SELECT TO authenticated, service_role
    USING (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS rls_doctor_schedules_staff_insert ON public.doctor_schedules;
CREATE POLICY rls_doctor_schedules_staff_insert ON public.doctor_schedules
    FOR INSERT TO authenticated, service_role
    WITH CHECK (
        organization_id = private.get_current_org_id()
        AND (
            public.is_org_admin_or_has_permission(organization_id, 'schedules.manage')
            OR public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
        )
    );

DROP POLICY IF EXISTS rls_doctor_schedules_staff_update ON public.doctor_schedules;
CREATE POLICY rls_doctor_schedules_staff_update ON public.doctor_schedules
    FOR UPDATE TO authenticated, service_role
    USING (
        organization_id = private.get_current_org_id()
        AND (
            public.is_org_admin_or_has_permission(organization_id, 'schedules.manage')
            OR public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
        )
    )
    WITH CHECK (
        organization_id = private.get_current_org_id()
        AND (
            public.is_org_admin_or_has_permission(organization_id, 'schedules.manage')
            OR public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
        )
    );

DROP POLICY IF EXISTS rls_doctor_schedules_staff_delete ON public.doctor_schedules;
CREATE POLICY rls_doctor_schedules_staff_delete ON public.doctor_schedules
    FOR DELETE TO authenticated, service_role
    USING (
        organization_id = private.get_current_org_id()
        AND (
            public.is_org_admin_or_has_permission(organization_id, 'schedules.manage')
            OR public.is_org_admin_or_has_permission(organization_id, 'doctors.manage')
        )
    );
