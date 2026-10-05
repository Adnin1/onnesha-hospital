-- ==============================================================================
-- OHMS Database Migration 108: Database Reliability, RLS, and Index Hardening
--
-- Description:
-- 1. Fix Broken LIS Analyzer Policies: Replace non-existent current_user_org()
--    with authoritative private.get_current_org_id().
-- 2. Harden user_roles RLS: Eliminate privilege escalation flaw by restricting
--    INSERT/UPDATE/DELETE on user_roles to service_role or staff.manage admins.
-- 3. Harden private.get_current_org_id(): Guard against tenant spoofing via
--    profiles.active_organization_id by validating active role assignment.
-- 4. Harden 7 Sequence Generators: Convert SET search_path = public to
--    SET search_path = '' with schema-qualified function calls.
-- 5. Complete Sub-Item Tenant RLS: Add explicit policies for invoice_items,
--    prescription_items, prescription_notes, and diagnostic_order_items.
-- 6. Add High-Priority Foreign Key and Performance Indexes for optimal queries.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Fix Broken LIS Policies (Replace invalid current_user_org())
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation_lab_analyzers ON public.lab_analyzers;
CREATE POLICY tenant_isolation_lab_analyzers ON public.lab_analyzers
  FOR ALL TO authenticated, service_role
  USING (organization_id = private.get_current_org_id())
  WITH CHECK (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS tenant_isolation_lab_transmissions ON public.lab_analyzer_transmissions;
CREATE POLICY tenant_isolation_lab_transmissions ON public.lab_analyzer_transmissions
  FOR ALL TO authenticated, service_role
  USING (organization_id = private.get_current_org_id())
  WITH CHECK (organization_id = private.get_current_org_id());

DROP POLICY IF EXISTS tenant_isolation_lab_critical_alerts ON public.lab_critical_alerts;
CREATE POLICY tenant_isolation_lab_critical_alerts ON public.lab_critical_alerts
  FOR ALL TO authenticated, service_role
  USING (organization_id = private.get_current_org_id())
  WITH CHECK (organization_id = private.get_current_org_id());


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Harden user_roles RLS (Eliminate Self-Escalation Privilege Escalation)
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS rls_user_roles ON public.user_roles;
DROP POLICY IF EXISTS rls_user_roles_select ON public.user_roles;
DROP POLICY IF EXISTS rls_user_roles_insert ON public.user_roles;
DROP POLICY IF EXISTS rls_user_roles_update ON public.user_roles;
DROP POLICY IF EXISTS rls_user_roles_delete ON public.user_roles;

CREATE POLICY rls_user_roles_select ON public.user_roles
  FOR SELECT TO authenticated, service_role
  USING (organization_id = private.get_current_org_id() OR user_id = auth.uid());

CREATE POLICY rls_user_roles_insert ON public.user_roles
  FOR INSERT TO authenticated, service_role
  WITH CHECK (
    (SELECT auth.role()) = 'service_role' OR
    public.is_org_admin_or_has_permission(organization_id, 'staff.manage')
  );

CREATE POLICY rls_user_roles_update ON public.user_roles
  FOR UPDATE TO authenticated, service_role
  USING (
    (SELECT auth.role()) = 'service_role' OR
    public.is_org_admin_or_has_permission(organization_id, 'staff.manage')
  )
  WITH CHECK (
    (SELECT auth.role()) = 'service_role' OR
    public.is_org_admin_or_has_permission(organization_id, 'staff.manage')
  );

CREATE POLICY rls_user_roles_delete ON public.user_roles
  FOR DELETE TO authenticated, service_role
  USING (
    (SELECT auth.role()) = 'service_role' OR
    public.is_org_admin_or_has_permission(organization_id, 'staff.manage')
  );


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Harden private.get_current_org_id() Against Active Tenant Spoofing
-- ──────────────────────────────────────────────────────────────────────────────

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
    -- 1. Explicit session GUC override (e.g. set by backend service before running transaction)
    v_org_id := NULLIF(pg_catalog.current_setting('app.current_organization_id', true), '')::uuid;

    IF v_org_id IS NOT NULL THEN
        -- If invoked by an authenticated user, verify that caller actually belongs to this organization
        IF auth.uid() IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1
                FROM public.user_roles
                WHERE user_id = auth.uid()
                  AND organization_id = v_org_id
                  AND is_active IS NOT FALSE
            ) THEN
                -- Caller does not hold an active role in the requested organization: fail closed!
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

        -- Strict tenant validation: caller must actively hold a role in this org
        IF v_org_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.user_roles
                WHERE user_id = auth.uid()
                  AND organization_id = v_org_id
                  AND is_active IS NOT FALSE
            ) THEN
                RETURN v_org_id;
            END IF;
        END IF;

        -- Fallback to distinct organization mapping in user_roles
        -- Deterministic: if and only if the user belongs to exactly one active organization
        SELECT COUNT(DISTINCT organization_id), MIN(organization_id::text)::uuid
        INTO v_role_org_count, v_role_org_id
        FROM public.user_roles
        WHERE user_id = auth.uid() AND is_active IS NOT FALSE;

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

COMMENT ON FUNCTION private.get_current_org_id() IS
    'Authoritative tenant resolver in private schema. Hardened against profile tenant spoofing.';

REVOKE ALL ON FUNCTION private.get_current_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_current_org_id() FROM anon;
GRANT EXECUTE ON FUNCTION private.get_current_org_id() TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Harden 7 Business Number Sequence Generators (SET search_path = '')
-- ──────────────────────────────────────────────────────────────────────────────

-- 4.1 Doctor settlement number generator
CREATE OR REPLACE FUNCTION public.generate_settlement_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := pg_catalog.nextval('public.doctor_settlement_seq'::regclass);
  RETURN 'SETTLE-' || pg_catalog.lpad(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_settlement_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_settlement_number() TO authenticated, service_role;

-- 4.2 Complaint number generator
CREATE OR REPLACE FUNCTION public.generate_complaint_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := pg_catalog.nextval('public.complaint_number_seq'::regclass);
  RETURN 'CMP-' || pg_catalog.lpad(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_complaint_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_complaint_number() TO authenticated, service_role;

-- 4.3 Asset code generator
CREATE OR REPLACE FUNCTION public.generate_asset_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := pg_catalog.nextval('public.asset_code_seq'::regclass);
  RETURN 'AST-' || pg_catalog.lpad(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_asset_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_asset_code() TO authenticated, service_role;

-- 4.4 Purchase requisition number generator
CREATE OR REPLACE FUNCTION public.generate_pr_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := pg_catalog.nextval('public.purchase_requisition_seq'::regclass);
  RETURN 'PR-' || pg_catalog.lpad(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_pr_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_pr_number() TO authenticated, service_role;

-- 4.5 GRN number generator
CREATE OR REPLACE FUNCTION public.generate_grn_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := pg_catalog.nextval('public.grn_number_seq'::regclass);
  RETURN 'GRN-' || pg_catalog.lpad(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_grn_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_grn_number() TO authenticated, service_role;

-- 4.6 Referral agent code generator
CREATE OR REPLACE FUNCTION public.generate_referral_agent_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := pg_catalog.nextval('public.referral_agent_code_seq'::regclass);
  RETURN 'REF-' || pg_catalog.lpad(v_seq_num::TEXT, 4, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_referral_agent_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_referral_agent_code() TO authenticated, service_role;

-- 4.7 Journal voucher number generator
CREATE OR REPLACE FUNCTION public.generate_journal_voucher_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq_num BIGINT;
BEGIN
  v_seq_num := pg_catalog.nextval('public.journal_voucher_seq'::regclass);
  RETURN 'JV-' || pg_catalog.lpad(v_seq_num::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_journal_voucher_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_journal_voucher_number() TO authenticated, service_role;


-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Complete Sub-Item Tenant RLS Policies
-- ──────────────────────────────────────────────────────────────────────────────

-- 5.1 invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_invoice_items_tenant_isolation ON public.invoice_items;
CREATE POLICY rls_invoice_items_tenant_isolation ON public.invoice_items
  FOR ALL TO authenticated, service_role
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND inv.organization_id = private.get_current_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.id = invoice_items.invoice_id
        AND inv.organization_id = private.get_current_org_id()
    )
  );

-- 5.2 prescription_items
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_prescription_items_tenant_isolation ON public.prescription_items;
CREATE POLICY rls_prescription_items_tenant_isolation ON public.prescription_items
  FOR ALL TO authenticated, service_role
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
        AND p.organization_id = private.get_current_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_items.prescription_id
        AND p.organization_id = private.get_current_org_id()
    )
  );

-- 5.3 prescription_notes
ALTER TABLE public.prescription_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_prescription_notes_tenant_isolation ON public.prescription_notes;
CREATE POLICY rls_prescription_notes_tenant_isolation ON public.prescription_notes
  FOR ALL TO authenticated, service_role
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_notes.prescription_id
        AND p.organization_id = private.get_current_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      WHERE p.id = prescription_notes.prescription_id
        AND p.organization_id = private.get_current_org_id()
    )
  );

-- 5.4 diagnostic_order_items
ALTER TABLE public.diagnostic_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_diagnostic_order_items_tenant_isolation ON public.diagnostic_order_items;
CREATE POLICY rls_diagnostic_order_items_tenant_isolation ON public.diagnostic_order_items
  FOR ALL TO authenticated, service_role
  USING (
    organization_id = private.get_current_org_id() OR
    EXISTS (
      SELECT 1 FROM public.diagnostic_orders o
      WHERE o.id = diagnostic_order_items.order_id
        AND o.organization_id = private.get_current_org_id()
    )
  )
  WITH CHECK (
    organization_id = private.get_current_org_id() OR
    EXISTS (
      SELECT 1 FROM public.diagnostic_orders o
      WHERE o.id = diagnostic_order_items.order_id
        AND o.organization_id = private.get_current_org_id()
    )
  );


-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Add High-Priority Foreign Key and Performance Indexes
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id 
  ON public.invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoices_patient_id 
  ON public.invoices(patient_id);

CREATE INDEX IF NOT EXISTS idx_invoices_visit_id 
  ON public.invoices(visit_id);

CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription_id 
  ON public.prescription_items(prescription_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id 
  ON public.prescriptions(patient_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_org_created 
  ON public.prescriptions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_order_items_order_id 
  ON public.diagnostic_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_diagnostic_order_items_org_id 
  ON public.diagnostic_order_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_grn_id 
  ON public.goods_receipt_items(grn_id);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_je_id 
  ON public.journal_entry_lines(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_patient_documents_org_id 
  ON public.patient_documents(organization_id);

CREATE INDEX IF NOT EXISTS idx_doctors_org_id 
  ON public.doctors(organization_id);

CREATE INDEX IF NOT EXISTS idx_appointments_doc_date 
  ON public.appointments(doctor_id, appointment_date);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id 
  ON public.payments(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_org_id 
  ON public.payments(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_org 
  ON public.user_roles(user_id, organization_id);
