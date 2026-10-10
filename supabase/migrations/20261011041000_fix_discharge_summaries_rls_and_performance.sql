-- =====================================================================================
-- FORWARD MIGRATION: 20261011041000_fix_discharge_summaries_rls_and_performance.sql
-- Resilient RLS for discharge_summaries, hospital_service_tariffs, and expense_categories
-- supporting private.get_current_org_id(), active_organization_id, and user_roles.
-- =====================================================================================

-- 1. Resilient RLS on public.discharge_summaries
DROP POLICY IF EXISTS rls_discharge_summaries_strict ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries ON public.discharge_summaries;
DROP POLICY IF EXISTS rls_discharge_summaries_resilient ON public.discharge_summaries;

CREATE POLICY rls_discharge_summaries_resilient ON public.discharge_summaries
FOR ALL TO authenticated, service_role
USING (
    organization_id = private.get_current_org_id()
    OR organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active IS NOT FALSE)
    OR organization_id IN (SELECT COALESCE(active_organization_id, organization_id) FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE)
)
WITH CHECK (
    organization_id = private.get_current_org_id()
    OR organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active IS NOT FALSE)
    OR organization_id IN (SELECT COALESCE(active_organization_id, organization_id) FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE)
);

-- 2. Resilient RLS on public.hospital_service_tariffs
DROP POLICY IF EXISTS rls_hospital_service_tariffs_select ON public.hospital_service_tariffs;
DROP POLICY IF EXISTS rls_hospital_service_tariffs_modify ON public.hospital_service_tariffs;
DROP POLICY IF EXISTS rls_hospital_service_tariffs_resilient_select ON public.hospital_service_tariffs;
DROP POLICY IF EXISTS rls_hospital_service_tariffs_resilient_modify ON public.hospital_service_tariffs;

CREATE POLICY rls_hospital_service_tariffs_resilient_select ON public.hospital_service_tariffs
FOR SELECT TO authenticated, service_role
USING (
    organization_id = private.get_current_org_id()
    OR organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active IS NOT FALSE)
    OR organization_id IN (SELECT COALESCE(active_organization_id, organization_id) FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE)
);

CREATE POLICY rls_hospital_service_tariffs_resilient_modify ON public.hospital_service_tariffs
FOR ALL TO authenticated, service_role
USING (
    (
        organization_id = private.get_current_org_id()
        OR organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active IS NOT FALSE)
        OR organization_id IN (SELECT COALESCE(active_organization_id, organization_id) FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE)
    )
    AND (
        public.is_org_admin_or_has_permission(organization_id, 'billing.manage') OR
        public.is_org_admin_or_has_permission(organization_id, 'settings.manage') OR
        public.has_permission('billing.manage')
    )
)
WITH CHECK (
    (
        organization_id = private.get_current_org_id()
        OR organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active IS NOT FALSE)
        OR organization_id IN (SELECT COALESCE(active_organization_id, organization_id) FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE)
    )
    AND (
        public.is_org_admin_or_has_permission(organization_id, 'billing.manage') OR
        public.is_org_admin_or_has_permission(organization_id, 'settings.manage') OR
        public.has_permission('billing.manage')
    )
);

-- 3. Resilient RLS on public.expense_categories
DROP POLICY IF EXISTS rls_expense_categories_select ON public.expense_categories;
DROP POLICY IF EXISTS rls_expense_categories_manage ON public.expense_categories;
DROP POLICY IF EXISTS rls_expense_categories_resilient_select ON public.expense_categories;
DROP POLICY IF EXISTS rls_expense_categories_resilient_manage ON public.expense_categories;

CREATE POLICY rls_expense_categories_resilient_select ON public.expense_categories
FOR SELECT TO authenticated, service_role
USING (
    organization_id = private.get_current_org_id()
    OR organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active IS NOT FALSE)
    OR organization_id IN (SELECT COALESCE(active_organization_id, organization_id) FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE)
);

CREATE POLICY rls_expense_categories_resilient_manage ON public.expense_categories
FOR ALL TO authenticated, service_role
USING (
    (
        organization_id = private.get_current_org_id()
        OR organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active IS NOT FALSE)
        OR organization_id IN (SELECT COALESCE(active_organization_id, organization_id) FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE)
    )
    AND (
        public.is_org_admin_or_has_permission(organization_id, 'expenses.manage') OR
        public.is_org_admin_or_has_permission(organization_id, 'accounting.manage') OR
        public.has_permission('expenses.manage')
    )
)
WITH CHECK (
    (
        organization_id = private.get_current_org_id()
        OR organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active IS NOT FALSE)
        OR organization_id IN (SELECT COALESCE(active_organization_id, organization_id) FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE)
    )
    AND (
        public.is_org_admin_or_has_permission(organization_id, 'expenses.manage') OR
        public.is_org_admin_or_has_permission(organization_id, 'accounting.manage') OR
        public.has_permission('expenses.manage')
    )
);
