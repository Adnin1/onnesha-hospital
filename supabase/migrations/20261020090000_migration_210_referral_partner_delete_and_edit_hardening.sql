-- =====================================================================================
-- Migration 210: Referral Partner Delete/Edit Hardening & Universal RBAC Expansion
-- Timestamp: 20261020090000
-- =====================================================================================

BEGIN;

-- 1. Ensure RLS DELETE policy exists for public.referral_agents
DROP POLICY IF EXISTS ref_agents_delete ON public.referral_agents;

CREATE POLICY ref_agents_delete ON public.referral_agents
FOR DELETE TO authenticated
USING (
    organization_id = COALESCE(private.get_current_org_id(), (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'receptionist')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
              AND rp.permission_key IN ('referral.manage', '*')
        )
    )
);

-- 2. Atomic Partner Deletion & Archival Function
CREATE OR REPLACE FUNCTION public.delete_referral_partner_atomic(
    p_agent_id UUID,
    p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
    v_org_id UUID;
    v_agent RECORD;
    v_comm_count INT;
    v_attr_count INT;
    v_settle_count INT;
BEGIN
    v_org_id := COALESCE(p_organization_id, private.get_current_org_id());
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM public.referral_agents WHERE id = p_agent_id;
    END IF;

    SELECT * INTO v_agent FROM public.referral_agents
    WHERE id = p_agent_id AND (organization_id = v_org_id OR v_org_id IS NULL);

    IF v_agent.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Referral partner not found'
        );
    END IF;

    -- Check for commissions
    SELECT COUNT(*) INTO v_comm_count
    FROM public.referral_commissions
    WHERE referral_agent_id = p_agent_id;

    -- Check for patient attributions
    SELECT COUNT(*) INTO v_attr_count
    FROM public.patient_referral_attributions
    WHERE referral_agent_id = p_agent_id;

    -- Check for settlements
    SELECT COUNT(*) INTO v_settle_count
    FROM public.referral_commission_settlements
    WHERE referral_agent_id = p_agent_id;

    -- If there are financial records, do safe archive
    IF (v_comm_count > 0 OR v_attr_count > 0 OR v_settle_count > 0) THEN
        UPDATE public.referral_agents
        SET is_active = false,
            archived_at = now(),
            updated_at = now()
        WHERE id = p_agent_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'ARCHIVED',
            'agent_code', v_agent.agent_code,
            'message', 'Partner has historical financial or clinical records. Profile safely deactivated/archived to protect financial audit integrity.'
        );
    ELSE
        -- Zero activity: clean hard delete
        DELETE FROM public.referral_agent_rates_history WHERE referral_agent_id = p_agent_id;
        DELETE FROM public.referral_agents WHERE id = p_agent_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'HARD_DELETED',
            'agent_code', v_agent.agent_code,
            'message', 'Partner profile and rate history permanently deleted.'
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_referral_partner_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_referral_partner_atomic(UUID, UUID) TO authenticated, service_role;

-- 3. Expand Receptionist and Hospital Staff Permissions in public.role_permissions
INSERT INTO public.permissions (key, module, description)
VALUES 
  ('billing.view', 'billing', 'View billing and invoices'),
  ('billing.create', 'billing', 'Create invoices and receipts'),
  ('tariffs.view', 'billing', 'View hospital service tariffs and pricing'),
  ('doctors.view', 'doctors', 'View active doctors and schedules'),
  ('referral.view', 'referral', 'View referral partners and commissions'),
  ('referral.assign', 'referral', 'Assign referral partners to patients and invoices'),
  ('referral.manage', 'referral', 'Manage referral partners and commissions'),
  ('lab.view', 'lab', 'View lab requests and test catalogs'),
  ('prescriptions.view', 'pharmacy', 'View patient prescriptions'),
  ('prescriptions.create', 'pharmacy', 'Create patient prescriptions')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.perm
FROM public.roles r
CROSS JOIN (
  VALUES 
    ('billing.view'),
    ('billing.create'),
    ('tariffs.view'),
    ('doctors.view'),
    ('referral.view'),
    ('referral.assign'),
    ('lab.view'),
    ('prescriptions.view'),
    ('prescriptions.create')
) AS p(perm)
WHERE LOWER(r.name) IN ('receptionist', 'hospital_administrator', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, 'referral.manage'
FROM public.roles r
WHERE LOWER(r.name) IN ('hospital_administrator', 'admin', 'super_admin')
ON CONFLICT DO NOTHING;

-- 4. Harden Hospital Service Tariffs SELECT RLS for Front Desk & Receptionist
DROP POLICY IF EXISTS rls_hospital_service_tariffs_select ON public.hospital_service_tariffs;

CREATE POLICY rls_hospital_service_tariffs_select ON public.hospital_service_tariffs
FOR SELECT TO authenticated, service_role
USING (
    organization_id = COALESCE(
        private.get_current_org_id(),
        (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
    OR organization_id IS NULL
);

NOTIFY pgrst, 'reload schema';

COMMIT;
