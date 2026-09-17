-- =====================================================================================
-- 031_final_reconciliation_and_security_hardening.sql
-- Onnesha Hospital Management System (OHMS) - Final Reconciliation & Security Hardening
--
-- Restores immutable historical migration contract (001-030) and applies:
-- 1. Schema columns (doctor_schedules.room_number, appointments.booked_by, invoices.updated_at)
-- 2. Strict least-privilege RLS policies:
--    - Public SELECT ONLY for active/published organizations, departments, doctors, schedules
--    - Zero mutation rights for public/anon
--    - Staff-only authenticated mutations with USING + WITH CHECK organization isolation
-- 3. Execution security on internal helpers and payment RPC
-- =====================================================================================

-- =====================================================================================
-- PART 1: Schema Reconciliations
-- =====================================================================================

ALTER TABLE IF EXISTS public.doctor_schedules 
    ADD COLUMN IF NOT EXISTS room_number VARCHAR(50);

-- Backfill room_number from parent doctors record if null
UPDATE public.doctor_schedules ds
SET room_number = d.room_number
FROM public.doctors d
WHERE ds.doctor_id = d.id 
  AND ds.room_number IS NULL 
  AND d.room_number IS NOT NULL;

ALTER TABLE IF EXISTS public.appointments 
    ADD COLUMN IF NOT EXISTS booked_by UUID;

ALTER TABLE IF EXISTS public.invoices 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- =====================================================================================
-- PART 2: Critical RLS Policy Repair (Strict Public SELECT vs Staff Mutation Isolation)
-- =====================================================================================

-- 1. organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_organizations ON public.organizations;
DROP POLICY IF EXISTS rls_organizations_public ON public.organizations;
DROP POLICY IF EXISTS rls_organizations_staff ON public.organizations;
DROP POLICY IF EXISTS rls_organizations_tenant ON public.organizations;
DROP POLICY IF EXISTS rls_organizations_public_select ON public.organizations;
DROP POLICY IF EXISTS rls_organizations_staff_select ON public.organizations;
DROP POLICY IF EXISTS rls_organizations_staff_update ON public.organizations;

-- Public can ONLY read the active canonical public hospital profile
CREATE POLICY rls_organizations_public_select ON public.organizations
    FOR SELECT TO anon
    USING (is_active = TRUE AND is_canonical_public = TRUE);

-- Authenticated staff can read their own organization or the canonical public org
CREATE POLICY rls_organizations_staff_select ON public.organizations
    FOR SELECT TO authenticated
    USING (id = get_current_org_id() OR (is_active = TRUE AND is_canonical_public = TRUE));

-- Authenticated staff can update their own organization (no cross-tenant updates)
CREATE POLICY rls_organizations_staff_update ON public.organizations
    FOR UPDATE TO authenticated
    USING (id = get_current_org_id())
    WITH CHECK (id = get_current_org_id());

-- Explicitly revoke all write privileges on organizations from anon and public
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.organizations FROM anon, PUBLIC;

-- 2. departments
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_departments ON public.departments;
DROP POLICY IF EXISTS rls_departments_public ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff ON public.departments;
DROP POLICY IF EXISTS rls_departments_tenant ON public.departments;
DROP POLICY IF EXISTS rls_departments_public_select ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff_select ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff_insert ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff_update ON public.departments;
DROP POLICY IF EXISTS rls_departments_staff_delete ON public.departments;

-- Public can ONLY read active, public departments
CREATE POLICY rls_departments_public_select ON public.departments
    FOR SELECT TO anon
    USING (is_active = TRUE AND (is_public = TRUE OR is_public IS NULL));

-- Staff can SELECT departments belonging to their organization or public departments
CREATE POLICY rls_departments_staff_select ON public.departments
    FOR SELECT TO authenticated
    USING (organization_id = get_current_org_id() OR (is_active = TRUE AND (is_public = TRUE OR is_public IS NULL)));

-- Staff can INSERT departments into their organization
CREATE POLICY rls_departments_staff_insert ON public.departments
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = get_current_org_id());

-- Staff can UPDATE departments belonging to their organization
CREATE POLICY rls_departments_staff_update ON public.departments
    FOR UPDATE TO authenticated
    USING (organization_id = get_current_org_id())
    WITH CHECK (organization_id = get_current_org_id());

-- Staff can DELETE departments belonging to their organization
CREATE POLICY rls_departments_staff_delete ON public.departments
    FOR DELETE TO authenticated
    USING (organization_id = get_current_org_id());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.departments FROM anon, PUBLIC;

-- 3. doctors
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_doctors ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_public ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_tenant ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_public_select ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff_select ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff_insert ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff_update ON public.doctors;
DROP POLICY IF EXISTS rls_doctors_staff_delete ON public.doctors;

-- Public can ONLY read active, public doctors
CREATE POLICY rls_doctors_public_select ON public.doctors
    FOR SELECT TO anon
    USING (is_active = TRUE AND (is_public = TRUE OR is_public IS NULL));

-- Staff can SELECT doctors in their organization or public doctors
CREATE POLICY rls_doctors_staff_select ON public.doctors
    FOR SELECT TO authenticated
    USING (organization_id = get_current_org_id() OR (is_active = TRUE AND (is_public = TRUE OR is_public IS NULL)));

-- Staff can INSERT doctors into their organization
CREATE POLICY rls_doctors_staff_insert ON public.doctors
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = get_current_org_id());

-- Staff can UPDATE doctors belonging to their organization
CREATE POLICY rls_doctors_staff_update ON public.doctors
    FOR UPDATE TO authenticated
    USING (organization_id = get_current_org_id())
    WITH CHECK (organization_id = get_current_org_id());

-- Staff can DELETE doctors belonging to their organization
CREATE POLICY rls_doctors_staff_delete ON public.doctors
    FOR DELETE TO authenticated
    USING (organization_id = get_current_org_id());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.doctors FROM anon, PUBLIC;

-- 4. doctor_schedules
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_doctor_schedules ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_public ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_tenant ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_public_select ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff_select ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff_insert ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff_update ON public.doctor_schedules;
DROP POLICY IF EXISTS rls_doctor_schedules_staff_delete ON public.doctor_schedules;

-- Public can ONLY read active schedules for active, public doctors
CREATE POLICY rls_doctor_schedules_public_select ON public.doctor_schedules
    FOR SELECT TO anon
    USING (is_active = TRUE AND EXISTS (
        SELECT 1 FROM public.doctors d 
        WHERE d.id = doctor_schedules.doctor_id 
          AND d.is_active = TRUE 
          AND (d.is_public = TRUE OR d.is_public IS NULL)
    ));

-- Staff can SELECT schedules in their organization or for public doctors
CREATE POLICY rls_doctor_schedules_staff_select ON public.doctor_schedules
    FOR SELECT TO authenticated
    USING (organization_id = get_current_org_id() OR (is_active = TRUE AND EXISTS (
        SELECT 1 FROM public.doctors d 
        WHERE d.id = doctor_schedules.doctor_id 
          AND d.is_active = TRUE 
          AND (d.is_public = TRUE OR d.is_public IS NULL)
    )));

-- Staff can INSERT schedules into their organization
CREATE POLICY rls_doctor_schedules_staff_insert ON public.doctor_schedules
    FOR INSERT TO authenticated
    WITH CHECK (organization_id = get_current_org_id());

-- Staff can UPDATE schedules in their organization
CREATE POLICY rls_doctor_schedules_staff_update ON public.doctor_schedules
    FOR UPDATE TO authenticated
    USING (organization_id = get_current_org_id())
    WITH CHECK (organization_id = get_current_org_id());

-- Staff can DELETE schedules in their organization
CREATE POLICY rls_doctor_schedules_staff_delete ON public.doctor_schedules
    FOR DELETE TO authenticated
    USING (organization_id = get_current_org_id());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.doctor_schedules FROM anon, PUBLIC;

-- =====================================================================================
-- PART 3: Revoke Public Execute on Internal Generator Helpers
-- =====================================================================================

REVOKE EXECUTE ON FUNCTION public.set_patient_code() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_patient_code(UUID) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_visit_number(UUID, VARCHAR) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_next_token(UUID, UUID, DATE) FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_patient_code() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_patient_code(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_visit_number(UUID, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_token(UUID, UUID, DATE) TO service_role;

-- =====================================================================================
-- PART 4: Critical Payment Settlement RPC Hardening
-- Enforce Caller Billing Authorization, Org Isolation, Idempotency & Search Path
-- =====================================================================================

DROP FUNCTION IF EXISTS public.verify_and_record_online_payment(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, UUID);

CREATE OR REPLACE FUNCTION public.verify_and_record_online_payment(
    p_org_id UUID,
    p_intent_id UUID,
    p_provider_trx_id VARCHAR,
    p_paid_amount NUMERIC,
    p_gateway_method VARCHAR,
    p_cashier_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_perm BOOLEAN;
    v_intent RECORD;
    v_invoice RECORD;
    v_receipt_no VARCHAR;
    v_new_paid NUMERIC;
    v_new_due NUMERIC;
    v_new_status VARCHAR;
    v_payment_id UUID;
    v_cashier_uuid UUID;
BEGIN
    v_calling_user_id := auth.uid();

    -- Gate 1: Require authenticated user (or internal service_role execution)
    IF v_calling_user_id IS NULL AND current_user != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Authentication required for payment settlement.');
    END IF;

    -- Gate 2: If called by an authenticated user, enforce active profile and billing authorization
    IF v_calling_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND is_active = TRUE) THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: User profile inactive or non-existent.');
        END IF;

        -- Check organizational membership and finance/billing permissions
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'cashier', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.manage', 'billing.create', 'payments.create', '*')
            ) INTO v_has_perm;

            IF v_has_perm IS NOT TRUE THEN
                RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks billing settlement authorization.');
            END IF;
        END IF;
    END IF;

    -- Gate 3: Lock payment intent within the specified organization
    SELECT * INTO v_intent FROM public.payment_intents
    WHERE id = p_intent_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment intent not found in organization.');
    END IF;

    -- Gate 4: Idempotent return if already settled
    IF v_intent.status = 'PAID' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true, 'intent_reference', v_intent.intent_reference);
    END IF;

    -- Gate 5: Lock invoice within the same organization
    SELECT * INTO v_invoice FROM public.invoices
    WHERE id = v_intent.invoice_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated invoice not found.');
    END IF;

    -- Gate 6: Duplicate provider transaction check across all payments
    IF EXISTS (
        SELECT 1 FROM public.payments 
        WHERE gateway_transaction_id = p_provider_trx_id 
          AND organization_id = p_org_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction ID: Provider transaction has already been recorded.');
    END IF;

    -- Gate 7: Amount matching
    IF p_paid_amount != v_intent.payable_amount THEN
        INSERT INTO public.payment_reconciliations (
            organization_id, invoice_id, payment_intent_id, provider_transaction_id,
            expected_amount, received_amount, mismatch_type
        ) VALUES (
            p_org_id, v_invoice.id, v_intent.id, p_provider_trx_id,
            v_intent.payable_amount, p_paid_amount, 'AMOUNT_MISMATCH'
        );
        RETURN jsonb_build_object('success', false, 'error', 'Paid amount does not match expected payable amount.');
    END IF;

    v_new_paid := v_invoice.paid_amount + p_paid_amount;
    v_new_due := GREATEST(0, v_invoice.grand_total - v_new_paid);
    v_new_status := CASE WHEN v_new_due = 0 THEN 'PAID' ELSE 'PARTIAL' END;
    v_receipt_no := public.generate_receipt_number(p_org_id);

    v_cashier_uuid := COALESCE(
        p_cashier_id,
        v_calling_user_id,
        CASE WHEN v_invoice.created_by ~ '^[0-9a-fA-F-]{36}$' THEN v_invoice.created_by::uuid ELSE NULL END
    );

    INSERT INTO public.payments (
        organization_id, invoice_id, receipt_number, payment_method,
        amount, gateway_transaction_id, cashier_id, notes
    ) VALUES (
        p_org_id, v_invoice.id, v_receipt_no, p_gateway_method,
        p_paid_amount, p_provider_trx_id,
        v_cashier_uuid,
        'Online Gateway Settlement: ' || p_gateway_method || ' (Trx: ' || p_provider_trx_id || ')'
    ) RETURNING id INTO v_payment_id;

    UPDATE public.invoices 
    SET paid_amount = v_new_paid, 
        due_amount = v_new_due,
        status = v_new_status, 
        updated_at = NOW() 
    WHERE id = v_invoice.id;

    UPDATE public.payment_intents 
    SET status = 'PAID', 
        provider_transaction_id = p_provider_trx_id,
        verified_at = NOW(), 
        updated_at = NOW() 
    WHERE id = v_intent.id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'receipt_number', v_receipt_no,
        'new_due', v_new_due,
        'new_status', v_new_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment settlement could not be processed.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_and_record_online_payment(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_and_record_online_payment(UUID, UUID, VARCHAR, NUMERIC, VARCHAR, UUID) TO authenticated, service_role;
