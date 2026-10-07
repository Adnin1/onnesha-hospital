-- =====================================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
-- Migration: 20261007070000_referral_affiliate_commission_subsystem.sql
-- Module: Enterprise Referral & Affiliate Partner Commission Subsystem
-- 1. Sequences & Number Generators: REF-10001+, SET-001001+
-- 2. Enhanced referral_agents schema (1-40% rate invariant, compliance flags, contact details)
-- 3. referral_rate_history (Auditable historical rate changes)
-- 4. patient_referral_attributions (Visit & encounter attribution model)
-- 5. referral_commissions (Immutable commission ledger with discount-aware base)
-- 6. referral_commission_settlements & settlement_items (Atomic multi-invoice payouts)
-- 7. Chart of Accounts: 2030 (Commissions Payable) & 5400 (Commission Expense)
-- 8. Atomic Stored Procedures:
--    - search_active_referral_agents (Narrow lookup, no financial exposure)
--    - assign_patient_referral_atomic
--    - create_referral_agent_atomic
--    - update_referral_agent_rate_atomic
--    - settle_referral_commissions_atomic (Full double-entry GL settlement)
--    - create_invoice_atomic & create_invoice_and_post_gl_atomic (Referral commission generation)
--    - admit_patient_to_bed_atomic (Integrated IPD admission referral attribution)
--    - void_invoice_and_reverse_gl_atomic (Commission reversal upon void)
-- 9. RLS & Permissions: Strict tenant isolation + Management-only financial visibility
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Sequences & Identifiers
-- -------------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.referral_agent_code_seq START WITH 10001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.referral_settlement_seq START WITH 1001 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_referral_code(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_seq_val BIGINT;
    v_code VARCHAR(40);
BEGIN
    v_seq_val := nextval('public.referral_agent_code_seq');
    v_code := 'REF-' || v_seq_val::text;
    RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_referral_settlement_number(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_seq_val BIGINT;
    v_code VARCHAR(40);
BEGIN
    v_seq_val := nextval('public.referral_settlement_seq');
    v_code := 'SET-' || LPAD(v_seq_val::text, 6, '0');
    RETURN v_code;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 2. Enhanced referral_agents Schema
-- -------------------------------------------------------------------------------------
ALTER TABLE public.referral_agents
ADD COLUMN IF NOT EXISTS email VARCHAR(150),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS professional_registration_no VARCHAR(100),
ADD COLUMN IF NOT EXISTS commission_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
ADD COLUMN IF NOT EXISTS is_commission_eligible BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS compliance_approved BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Enforce 1% - 40% Commission Invariant on referral_agents
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_referral_agent_commission_rate'
    ) THEN
        ALTER TABLE public.referral_agents
        ADD CONSTRAINT check_referral_agent_commission_rate
        CHECK (commission_rate_percent >= 1.00 AND commission_rate_percent <= 40.00);
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 3. Rate Change Audit History Table
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_rate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    referral_agent_id UUID NOT NULL REFERENCES public.referral_agents(id) ON DELETE CASCADE,
    old_rate NUMERIC(5,2) NOT NULL,
    new_rate NUMERIC(5,2) NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------------------------------
-- 4. Patient Encounter / Visit Referral Attribution Model
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_referral_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES public.patient_visits(id) ON DELETE SET NULL,
    referral_agent_id UUID NOT NULL REFERENCES public.referral_agents(id) ON DELETE RESTRICT,
    referral_code_snapshot VARCHAR(40) NOT NULL,
    referral_name_snapshot VARCHAR(150) NOT NULL,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISCHARGED', 'CANCELLED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate active attribution per encounter visit
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_active_attribution
ON public.patient_referral_attributions (organization_id, visit_id)
WHERE (visit_id IS NOT NULL AND status = 'ACTIVE');

-- -------------------------------------------------------------------------------------
-- 5. Referral Commission Ledger (Immutable Financial Snapshot)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    referral_agent_id UUID NOT NULL REFERENCES public.referral_agents(id) ON DELETE RESTRICT,
    referral_attribution_id UUID REFERENCES public.patient_referral_attributions(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES public.patient_visits(id) ON DELETE SET NULL,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    referral_code_snapshot VARCHAR(40) NOT NULL,
    referral_name_snapshot VARCHAR(150) NOT NULL,
    billing_subtotal NUMERIC(14,2) NOT NULL CHECK (billing_subtotal >= 0),
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    commission_base_amount NUMERIC(14,2) NOT NULL CHECK (commission_base_amount >= 0),
    commission_rate_percent NUMERIC(5,2) NOT NULL CHECK (commission_rate_percent >= 1.00 AND commission_rate_percent <= 40.00),
    commission_amount NUMERIC(14,2) NOT NULL CHECK (commission_amount >= 0),
    amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
    amount_pending NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (amount_pending >= 0),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    settlement_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (settlement_status IN ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED', 'REVERSED')),
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    reversed_at TIMESTAMPTZ,
    reversal_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_referral_commission_invoice UNIQUE (organization_id, invoice_id)
);

-- -------------------------------------------------------------------------------------
-- 6. Referral Commission Settlements (Header & Items)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_commission_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    settlement_number VARCHAR(40) NOT NULL,
    referral_agent_id UUID NOT NULL REFERENCES public.referral_agents(id) ON DELETE RESTRICT,
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    gross_commission_selected NUMERIC(14,2) NOT NULL CHECK (gross_commission_selected >= 0),
    adjustment_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    net_paid_amount NUMERIC(14,2) NOT NULL CHECK (net_paid_amount > 0),
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY')),
    transaction_reference VARCHAR(100),
    paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PAID' CHECK (status IN ('PENDING', 'PAID', 'CANCELLED', 'VOIDED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ref_settlement_number UNIQUE (organization_id, settlement_number)
);

CREATE TABLE IF NOT EXISTS public.referral_commission_settlement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    settlement_id UUID NOT NULL REFERENCES public.referral_commission_settlements(id) ON DELETE CASCADE,
    commission_id UUID NOT NULL REFERENCES public.referral_commissions(id) ON DELETE RESTRICT,
    allocated_amount NUMERIC(14,2) NOT NULL CHECK (allocated_amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_settlement_item UNIQUE (settlement_id, commission_id)
);

-- -------------------------------------------------------------------------------------
-- 7. High-Performance Indexes
-- -------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_referral_agents_org_active ON public.referral_agents (organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_referral_agents_code ON public.referral_agents (organization_id, agent_code);
CREATE INDEX IF NOT EXISTS idx_referral_agents_name ON public.referral_agents (organization_id, full_name);
CREATE INDEX IF NOT EXISTS idx_referral_agents_phone ON public.referral_agents (organization_id, phone);

CREATE INDEX IF NOT EXISTS idx_ref_attrib_visit ON public.patient_referral_attributions (organization_id, visit_id);
CREATE INDEX IF NOT EXISTS idx_ref_attrib_patient ON public.patient_referral_attributions (organization_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_ref_attrib_agent ON public.patient_referral_attributions (organization_id, referral_agent_id);

CREATE INDEX IF NOT EXISTS idx_ref_comm_agent_date ON public.referral_commissions (organization_id, referral_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ref_comm_invoice ON public.referral_commissions (organization_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_ref_comm_status ON public.referral_commissions (organization_id, settlement_status);
CREATE INDEX IF NOT EXISTS idx_ref_comm_patient ON public.referral_commissions (organization_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_ref_settle_agent ON public.referral_commission_settlements (organization_id, referral_agent_id, settlement_date DESC);
CREATE INDEX IF NOT EXISTS idx_ref_settle_items_comm ON public.referral_commission_settlement_items (organization_id, commission_id);

-- -------------------------------------------------------------------------------------
-- 8. Chart of Accounts Seeder Expansion (2030 & 5400)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_chart_of_accounts(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- ASSETS
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type)
    VALUES 
        (p_org_id, '1010', 'Cash in Hand (Cashier Drawer)', 'ASSET'),
        (p_org_id, '1020', 'Operating Bank Account (Cash at Bank)', 'ASSET'),
        (p_org_id, '1100', 'Accounts Receivable - Patients', 'ASSET'),
        (p_org_id, '1200', 'General Hospital Supplies Inventory', 'ASSET'),
        (p_org_id, '1210', 'Pharmacy Medicine Inventory', 'ASSET'),
        (p_org_id, '1500', 'Medical Equipment & Biomedical Machinery', 'ASSET'),
        (p_org_id, '1590', 'Accumulated Depreciation - Medical Equipment', 'ASSET')
    ON CONFLICT (organization_id, account_code) DO NOTHING;

    -- LIABILITIES
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type)
    VALUES 
        (p_org_id, '2010', 'Accounts Payable - Medical & Drug Suppliers', 'LIABILITY'),
        (p_org_id, '2020', 'Accrued Staff Salaries & Withholdings', 'LIABILITY'),
        (p_org_id, '2030', 'Referral & Partner Commissions Payable', 'LIABILITY')
    ON CONFLICT (organization_id, account_code) DO NOTHING;

    -- EQUITY
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type)
    VALUES 
        (p_org_id, '3010', 'Hospital Retained Earnings & Capital Fund', 'EQUITY')
    ON CONFLICT (organization_id, account_code) DO NOTHING;

    -- REVENUES
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type)
    VALUES 
        (p_org_id, '4010', 'Patient Clinical & Bed Service Revenue', 'REVENUE'),
        (p_org_id, '4011', 'Doctor Consultation Fees Revenue', 'REVENUE'),
        (p_org_id, '4012', 'Pathology & Diagnostic Service Revenue', 'REVENUE'),
        (p_org_id, '4020', 'Pharmacy Medicine Sales Revenue', 'REVENUE')
    ON CONFLICT (organization_id, account_code) DO NOTHING;

    -- EXPENSES
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type)
    VALUES 
        (p_org_id, '4090', 'Patient Billing Discounts Allowed', 'EXPENSE'),
        (p_org_id, '5010', 'Cost of Goods Sold (COGS) - Pharmacy Medicines', 'EXPENSE'),
        (p_org_id, '5100', 'Hospital Staff Salaries & Wages Expense', 'EXPENSE'),
        (p_org_id, '5200', 'Medical Equipment Depreciation Expense', 'EXPENSE'),
        (p_org_id, '5300', 'Hospital Facility Maintenance & Utilities', 'EXPENSE'),
        (p_org_id, '5400', 'Referral & Partner Commission Expense', 'EXPENSE')
    ON CONFLICT (organization_id, account_code) DO NOTHING;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 9. RBAC Permissions Seeding for Referral Management
-- -------------------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, description)
VALUES
    ('referral.view', 'REFERRAL', 'View referral partner directory and assigned profiles'),
    ('referral.manage', 'REFERRAL', 'Create, edit, and deactivate referral agents and rates'),
    ('referral.assign', 'REFERRAL', 'Assign referral attribution to patient admissions and visits'),
    ('referral.commission.view', 'REFERRAL', 'View referral commission financial ledger and earnings'),
    ('referral.commission.approve', 'REFERRAL', 'Approve pending doctor and partner commissions'),
    ('referral.commission.pay', 'REFERRAL', 'Execute and disburse commission settlements'),
    ('referral.commission.reverse', 'REFERRAL', 'Reverse or cancel erroneous referral commissions'),
    ('referral.report.view', 'REFERRAL', 'View referral performance and financial commission reports')
ON CONFLICT (key) DO NOTHING;

-- Grant permissions to Admin, Super Admin, Finance Manager, and Accountant
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM public.roles r
CROSS JOIN (
    VALUES 
        ('referral.view'),
        ('referral.manage'),
        ('referral.assign'),
        ('referral.commission.view'),
        ('referral.commission.approve'),
        ('referral.commission.pay'),
        ('referral.commission.reverse'),
        ('referral.report.view')
) AS p(key)
WHERE LOWER(r.name) IN ('super_admin', 'admin', 'finance_manager', 'accountant')
ON CONFLICT DO NOTHING;

-- Grant narrow view and assign permissions to Receptionist, Cashier, and Admission roles
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, p.key
FROM public.roles r
CROSS JOIN (
    VALUES 
        ('referral.view'),
        ('referral.assign')
) AS p(key)
WHERE LOWER(r.name) IN ('receptionist', 'cashier', 'nurse', 'admission_officer')
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------------------------
-- 10. Row Level Security (RLS) Configuration
-- -------------------------------------------------------------------------------------
ALTER TABLE public.referral_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commission_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commission_settlement_items ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS ref_agents_tenant_policy ON public.referral_agents;
DROP POLICY IF EXISTS ref_agents_select ON public.referral_agents;
DROP POLICY IF EXISTS ref_agents_insert ON public.referral_agents;
DROP POLICY IF EXISTS ref_agents_update ON public.referral_agents;
DROP POLICY IF EXISTS ref_agents_delete ON public.referral_agents;

-- referral_agents Policies: Management can full CRUD; authenticated staff can SELECT active
CREATE POLICY ref_agents_select ON public.referral_agents
FOR SELECT TO authenticated
USING (
    organization_id = private.get_current_org_id()
);

CREATE POLICY ref_agents_insert ON public.referral_agents
FOR INSERT TO authenticated
WITH CHECK (
    organization_id = private.get_current_org_id()
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'finance_manager', 'accountant')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
              AND rp.permission_key IN ('referral.manage', '*')
        )
    )
);

CREATE POLICY ref_agents_update ON public.referral_agents
FOR UPDATE TO authenticated
USING (
    organization_id = private.get_current_org_id()
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'finance_manager', 'accountant')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_agents.organization_id
              AND rp.permission_key IN ('referral.manage', '*')
        )
    )
);

-- patient_referral_attributions Policies
DROP POLICY IF EXISTS ref_attrib_select ON public.patient_referral_attributions;
DROP POLICY IF EXISTS ref_attrib_insert ON public.patient_referral_attributions;

CREATE POLICY ref_attrib_select ON public.patient_referral_attributions
FOR SELECT TO authenticated
USING (organization_id = private.get_current_org_id());

CREATE POLICY ref_attrib_insert ON public.patient_referral_attributions
FOR INSERT TO authenticated
WITH CHECK (organization_id = private.get_current_org_id());

-- referral_commissions Policies: Strictly Management / Finance Only
DROP POLICY IF EXISTS ref_comm_select ON public.referral_commissions;
CREATE POLICY ref_comm_select ON public.referral_commissions
FOR SELECT TO authenticated
USING (
    organization_id = private.get_current_org_id()
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_commissions.organization_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'finance_manager', 'accountant')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_commissions.organization_id
              AND rp.permission_key IN ('referral.commission.view', '*')
        )
    )
);

-- referral_commission_settlements Policies: Management / Finance Only
DROP POLICY IF EXISTS ref_settle_select ON public.referral_commission_settlements;
CREATE POLICY ref_settle_select ON public.referral_commission_settlements
FOR SELECT TO authenticated
USING (
    organization_id = private.get_current_org_id()
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_commission_settlements.organization_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'finance_manager', 'accountant')
        )
        OR EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = auth.uid() AND ur.organization_id = referral_commission_settlements.organization_id
              AND rp.permission_key IN ('referral.commission.view', 'referral.commission.pay', '*')
        )
    )
);

-- Deny anon from everything
REVOKE ALL ON public.referral_agents FROM anon, PUBLIC;
REVOKE ALL ON public.referral_rate_history FROM anon, PUBLIC;
REVOKE ALL ON public.patient_referral_attributions FROM anon, PUBLIC;
REVOKE ALL ON public.referral_commissions FROM anon, PUBLIC;
REVOKE ALL ON public.referral_commission_settlements FROM anon, PUBLIC;
REVOKE ALL ON public.referral_commission_settlement_items FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON public.referral_agents TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.referral_rate_history TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.patient_referral_attributions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.referral_commissions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.referral_commission_settlements TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.referral_commission_settlement_items TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 11. Stored Procedures: Narrow Lookup for Admission Staff
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_active_referral_agents(
    p_org_id UUID,
    p_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    agent_code VARCHAR(40),
    full_name VARCHAR(150),
    agent_type VARCHAR(30),
    phone VARCHAR(30)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT 
        ra.id,
        ra.agent_code,
        ra.full_name,
        ra.agent_type,
        ra.phone
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

REVOKE ALL ON FUNCTION public.search_active_referral_agents(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_active_referral_agents(UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 12. Stored Procedure: Atomic Referral Agent Creation & Rate History
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_referral_agent_atomic(
    p_org_id UUID,
    p_full_name VARCHAR,
    p_agent_type VARCHAR,
    p_phone VARCHAR,
    p_commission_rate NUMERIC DEFAULT 10.00,
    p_email VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_license_no VARCHAR DEFAULT NULL,
    p_is_eligible BOOLEAN DEFAULT TRUE,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_agent_code VARCHAR(40);
    v_agent_id UUID;
    v_rate NUMERIC(5,2);
    v_compliance BOOLEAN;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Strict 1% - 40% Validation
    v_rate := COALESCE(p_commission_rate, 10.00);
    IF v_rate < 1.00 OR v_rate > 40.00 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Commission rate must be between 1% and 40%.');
    END IF;

    -- Compliance default: DOCTOR agents require hospital management compliance confirmation
    IF UPPER(p_agent_type) = 'DOCTOR' THEN
        v_compliance := COALESCE(p_is_eligible, FALSE);
    ELSE
        v_compliance := TRUE;
    END IF;

    -- Generate sequential authoritative code
    v_agent_code := public.generate_referral_code(p_org_id);

    INSERT INTO public.referral_agents (
        organization_id, agent_code, full_name, agent_type, phone,
        commission_rate_percent, commission_rate_diag, commission_rate_opd, commission_rate_ipd,
        is_commission_eligible, compliance_approved, email, address,
        professional_registration_no, notes, is_active, created_at, updated_at
    ) VALUES (
        p_org_id, v_agent_code, TRIM(p_full_name), UPPER(p_agent_type), TRIM(p_phone),
        v_rate, v_rate, v_rate, v_rate,
        COALESCE(p_is_eligible, TRUE), v_compliance, p_email, p_address,
        p_license_no, p_notes, TRUE, NOW(), NOW()
    ) RETURNING id INTO v_agent_id;

    -- Record initial rate history
    INSERT INTO public.referral_rate_history (
        organization_id, referral_agent_id, old_rate, new_rate,
        effective_from, changed_by, reason, created_at
    ) VALUES (
        p_org_id, v_agent_id, 0.00, v_rate,
        NOW(), v_calling_user, 'Initial profile creation', NOW()
    );

    -- Audit log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user, 'CREATE', 'REFERRAL', 'referral_agent', v_agent_id::text,
        jsonb_build_object(
            'agent_code', v_agent_code,
            'full_name', p_full_name,
            'agent_type', p_agent_type,
            'commission_rate', v_rate
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'agent_id', v_agent_id,
        'agent_code', v_agent_code
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_referral_agent_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_referral_agent_atomic(UUID, VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, BOOLEAN, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 13. Stored Procedure: Update Agent Rate (Audited, Non-retroactive)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_referral_agent_rate_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_new_rate NUMERIC,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_old_rate NUMERIC(5,2);
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    IF p_new_rate < 1.00 OR p_new_rate > 40.00 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Commission rate must be between 1% and 40%.');
    END IF;

    SELECT commission_rate_percent INTO v_old_rate
    FROM public.referral_agents
    WHERE id = p_agent_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_old_rate IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral agent not found.');
    END IF;

    UPDATE public.referral_agents
    SET commission_rate_percent = p_new_rate,
        commission_rate_diag = p_new_rate,
        commission_rate_opd = p_new_rate,
        commission_rate_ipd = p_new_rate,
        updated_at = NOW()
    WHERE id = p_agent_id;

    INSERT INTO public.referral_rate_history (
        organization_id, referral_agent_id, old_rate, new_rate,
        effective_from, changed_by, reason, created_at
    ) VALUES (
        p_org_id, p_agent_id, v_old_rate, p_new_rate,
        NOW(), v_calling_user, COALESCE(p_reason, 'Rate updated by management'), NOW()
    );

    RETURN jsonb_build_object('success', true, 'old_rate', v_old_rate, 'new_rate', p_new_rate);
END;
$$;

REVOKE ALL ON FUNCTION public.update_referral_agent_rate_atomic(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_referral_agent_rate_atomic(UUID, UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 14. Stored Procedure: Assign Patient / Visit Referral Attribution
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_patient_referral_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL,
    p_agent_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_agent RECORD;
    v_attrib_id UUID;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    IF p_agent_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral agent ID is required.');
    END IF;

    SELECT id, agent_code, full_name, is_active INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id AND organization_id = p_org_id;

    IF v_agent.id IS NULL OR v_agent.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected referral agent is inactive or invalid.');
    END IF;

    -- Deactivate any existing active attribution for this specific visit
    IF p_visit_id IS NOT NULL THEN
        UPDATE public.patient_referral_attributions
        SET status = 'CANCELLED', updated_at = NOW()
        WHERE organization_id = p_org_id AND visit_id = p_visit_id AND status = 'ACTIVE';
    END IF;

    INSERT INTO public.patient_referral_attributions (
        organization_id, patient_id, visit_id, referral_agent_id,
        referral_code_snapshot, referral_name_snapshot, assigned_by,
        status, notes, created_at, updated_at
    ) VALUES (
        p_org_id, p_patient_id, p_visit_id, p_agent_id,
        v_agent.agent_code, v_agent.full_name, v_calling_user,
        'ACTIVE', p_notes, NOW(), NOW()
    ) RETURNING id INTO v_attrib_id;

    RETURN jsonb_build_object(
        'success', true,
        'attribution_id', v_attrib_id,
        'referral_code', v_agent.agent_code,
        'referral_name', v_agent.full_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_patient_referral_atomic(UUID, UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 15. Integrated Inpatient Admission (admit_patient_to_bed_atomic with Referral Attribution)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admit_patient_to_bed_atomic(
    p_organization_id UUID,
    p_patient_id UUID,
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name TEXT DEFAULT NULL,
    p_chief_complaint TEXT DEFAULT NULL,
    p_admission_type VARCHAR DEFAULT 'IPD',
    p_daily_charge NUMERIC DEFAULT 0,
    p_assigned_by UUID DEFAULT NULL,
    p_referral_agent_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_bed_number TEXT;
    v_bed_status TEXT;
    v_patient_name TEXT;
    v_visit_id UUID;
    v_assignment_id UUID;
    v_charge NUMERIC := p_daily_charge;
    v_active_check UUID;
    v_ref_agent RECORD;
    v_attrib_id UUID;
BEGIN
    -- 1. Validation: At least one of bed_id or cabin_id must be provided
    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Either bed_id or cabin_id must be provided';
    END IF;

    -- 2. Fetch patient name
    SELECT full_name INTO v_patient_name
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_name IS NULL THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: Patient % does not exist', p_patient_id;
    END IF;

    -- 3. Row-level Lock and Concurrency Validation
    IF p_bed_id IS NOT NULL THEN
        SELECT status, bed_number, daily_rate
        INTO v_bed_status, v_bed_number, v_charge
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'BED_NOT_FOUND: Bed % does not exist', p_bed_id;
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'BED_UNAVAILABLE: Bed % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE bed_id = p_bed_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED: Bed % already has an active inpatient assignment', v_bed_number;
        END IF;
    ELSE
        SELECT status, cabin_number, daily_rate
        INTO v_bed_status, v_bed_number, v_charge
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'CABIN_NOT_FOUND: Cabin % does not exist', p_cabin_id;
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'CABIN_UNAVAILABLE: Cabin % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE cabin_id = p_cabin_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED: Cabin % already has an active inpatient assignment', v_bed_number;
        END IF;
    END IF;

    IF p_daily_charge > 0 THEN
        v_charge := p_daily_charge;
    END IF;

    -- 4. Create or reuse active IPD visit
    SELECT id INTO v_visit_id
    FROM public.patient_visits
    WHERE patient_id = p_patient_id AND visit_type = 'IPD' AND status = 'ACTIVE'
    ORDER BY admitted_at DESC
    LIMIT 1;

    IF v_visit_id IS NULL THEN
        INSERT INTO public.patient_visits (
            organization_id, patient_id, visit_type, status, chief_complaint, admitted_at, doctor_id, visit_number
        ) VALUES (
            p_organization_id,
            p_patient_id,
            'IPD',
            'ACTIVE',
            COALESCE(p_chief_complaint, 'Inpatient Admission'),
            NOW(),
            p_doctor_id,
            'IPD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6)
        ) RETURNING id INTO v_visit_id;
    END IF;

    -- 5. Insert Bed Assignment Record
    INSERT INTO public.bed_assignments (
        organization_id, visit_id, patient_id, bed_id, cabin_id, assigned_at, daily_charge, status, assigned_by
    ) VALUES (
        p_organization_id,
        v_visit_id,
        p_patient_id,
        p_bed_id,
        p_cabin_id,
        NOW(),
        COALESCE(v_charge, 0),
        'ACTIVE',
        p_assigned_by
    ) RETURNING id INTO v_assignment_id;

    -- 6. Update Bed / Cabin Status to OCCUPIED
    IF p_bed_id IS NOT NULL THEN
        UPDATE public.beds
        SET status = 'OCCUPIED',
            patient_name = v_patient_name,
            admitted_at = NOW()
        WHERE id = p_bed_id;
    ELSE
        UPDATE public.cabins
        SET status = 'OCCUPIED'
        WHERE id = p_cabin_id;
    END IF;

    -- 7. Persist Referral Attribution atomically if referral agent provided
    IF p_referral_agent_id IS NOT NULL THEN
        SELECT id, agent_code, full_name, is_active INTO v_ref_agent
        FROM public.referral_agents
        WHERE id = p_referral_agent_id AND organization_id = p_organization_id;

        IF v_ref_agent.id IS NOT NULL AND v_ref_agent.is_active = TRUE THEN
            INSERT INTO public.patient_referral_attributions (
                organization_id, patient_id, visit_id, referral_agent_id,
                referral_code_snapshot, referral_name_snapshot, assigned_by,
                status, notes, created_at, updated_at
            ) VALUES (
                p_organization_id, p_patient_id, v_visit_id, p_referral_agent_id,
                v_ref_agent.agent_code, v_ref_agent.full_name, p_assigned_by,
                'ACTIVE', 'Attributed during IPD admission', NOW(), NOW()
            ) RETURNING id INTO v_attrib_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', v_assignment_id,
        'visit_id', v_visit_id,
        'referral_attribution_id', v_attrib_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_patient_to_bed_atomic(UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 16. Enhanced create_invoice_atomic with Automatic Referral Commission Generation
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0.00,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_gateway_transaction_id VARCHAR DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_perm BOOLEAN;
    v_item JSONB;
    v_item_cat VARCHAR;
    v_item_name VARCHAR;
    v_unit_price NUMERIC;
    v_quantity NUMERIC;
    v_item_total NUMERIC;
    v_item_ref UUID;
    v_subtotal NUMERIC := 0.00;
    v_discount NUMERIC;
    v_grand_total NUMERIC;
    v_paid NUMERIC;
    v_due NUMERIC;
    v_status VARCHAR;
    v_invoice_id UUID;
    v_invoice_number VARCHAR;
    v_receipt_number VARCHAR;
    v_payment_id UUID;
    v_cashier_uuid UUID;

    -- Referral variables
    v_ref_agent_id UUID;
    v_ref_code VARCHAR(40);
    v_ref_name VARCHAR(150);
    v_ref_type VARCHAR(30);
    v_ref_rate NUMERIC(5,2);
    v_ref_eligible BOOLEAN;
    v_ref_compliance BOOLEAN;
    v_attrib_id UUID;
    v_comm_amount NUMERIC(14,2) := 0.00;
    v_comm_id UUID;
BEGIN
    v_calling_user_id := auth.uid();

    -- Step 1: Authentication required unless internal service_role
    IF v_calling_user_id IS NULL AND current_user != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Authentication required.');
    END IF;

    -- Step 2: Check active profile and billing permissions
    IF v_calling_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND is_active = TRUE) THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: User profile inactive or non-existent.');
        END IF;

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
                  AND rp.permission_key IN ('billing.create', 'billing.manage', '*')
            ) INTO v_has_perm;

            IF v_has_perm IS NOT TRUE THEN
                RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks invoice creation authorization.');
            END IF;
        END IF;
    END IF;

    -- Step 3: Validate patient belongs to organization
    IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id AND organization_id = p_org_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in organization.');
    END IF;

    -- Step 4: Validate items JSON array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice must contain at least one line item.');
    END IF;

    -- Step 5: Compute subtotal and strictly validate item prices and quantities
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0);
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 1.0);

        IF v_unit_price < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item unit price cannot be negative.');
        END IF;

        IF v_quantity <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item quantity must be greater than zero.');
        END IF;

        v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    END LOOP;

    -- Step 6: Validate discount amount
    IF p_discount_amount IS NOT NULL AND p_discount_amount < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discount amount cannot be negative.');
    END IF;

    IF p_discount_amount IS NOT NULL AND p_discount_amount > v_subtotal THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discount amount cannot exceed invoice subtotal.');
    END IF;

    v_discount := GREATEST(0, COALESCE(p_discount_amount, 0));
    v_grand_total := GREATEST(0, v_subtotal - v_discount);

    -- Step 7: Validate initial payment amount
    IF p_initial_payment_amount IS NOT NULL AND p_initial_payment_amount < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Initial payment amount cannot be negative.');
    END IF;

    IF p_initial_payment_amount IS NOT NULL AND p_initial_payment_amount > v_grand_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'Initial payment amount exceeds invoice grand total. Overpayment is rejected.');
    END IF;

    v_paid := GREATEST(0, COALESCE(p_initial_payment_amount, 0));
    v_due := GREATEST(0, v_grand_total - v_paid);

    IF v_due = 0 AND v_grand_total > 0 THEN
        v_status := 'PAID';
    ELSIF v_paid > 0 THEN
        v_status := 'PARTIAL';
    ELSE
        v_status := 'UNPAID';
    END IF;

    -- Step 8: Pre-validate Cashier & Payment Method
    IF v_paid > 0 THEN
        IF p_cashier_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_cashier_id AND organization_id = p_org_id AND is_active = TRUE) THEN
                RETURN jsonb_build_object('success', false, 'error', 'Invalid cashier: specified cashier profile does not belong to this organization or is inactive.');
            END IF;
            v_cashier_uuid := p_cashier_id;
        ELSIF v_calling_user_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND organization_id = p_org_id AND is_active = TRUE) THEN
                v_cashier_uuid := v_calling_user_id;
            ELSE
                v_cashier_uuid := NULL;
            END IF;
        ELSE
            v_cashier_uuid := NULL;
        END IF;

        IF UPPER(COALESCE(p_payment_method, 'CASH')) = 'CASH' AND p_gateway_transaction_id IS NOT NULL AND TRIM(p_gateway_transaction_id) != '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cash payment must not have a gateway transaction ID.');
        END IF;
    END IF;

    -- Step 9: Resolve Referral Attribution (Visit first, then Patient fallback)
    IF p_visit_id IS NOT NULL THEN
        SELECT pra.referral_agent_id, ra.agent_code, ra.full_name, ra.agent_type,
               ra.commission_rate_percent, ra.is_commission_eligible, ra.compliance_approved, pra.id
        INTO v_ref_agent_id, v_ref_code, v_ref_name, v_ref_type,
             v_ref_rate, v_ref_eligible, v_ref_compliance, v_attrib_id
        FROM public.patient_referral_attributions pra
        JOIN public.referral_agents ra ON ra.id = pra.referral_agent_id
        WHERE pra.visit_id = p_visit_id
          AND pra.organization_id = p_org_id
          AND pra.status = 'ACTIVE'
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        LIMIT 1;
    END IF;

    IF v_ref_agent_id IS NULL THEN
        SELECT pra.referral_agent_id, ra.agent_code, ra.full_name, ra.agent_type,
               ra.commission_rate_percent, ra.is_commission_eligible, ra.compliance_approved, pra.id
        INTO v_ref_agent_id, v_ref_code, v_ref_name, v_ref_type,
             v_ref_rate, v_ref_eligible, v_ref_compliance, v_attrib_id
        FROM public.patient_referral_attributions pra
        JOIN public.referral_agents ra ON ra.id = pra.referral_agent_id
        WHERE pra.patient_id = p_patient_id
          AND pra.organization_id = p_org_id
          AND pra.visit_id IS NULL
          AND pra.status = 'ACTIVE'
          AND ra.is_active = TRUE
          AND ra.archived_at IS NULL
        ORDER BY pra.created_at DESC
        LIMIT 1;
    END IF;

    -- =================================================================================
    -- ALL PRE-VALIDATIONS PASSED — EXECUTE DATABASE MUTATIONS
    -- =================================================================================
    v_invoice_number := public.generate_invoice_number(p_org_id);

    -- Insert invoice master
    INSERT INTO public.invoices (
        organization_id, invoice_number, patient_id, visit_id,
        subtotal, discount_amount, discount_reason, tax_amount,
        grand_total, paid_amount, due_amount, status,
        created_by, created_at, updated_at
    ) VALUES (
        p_org_id, v_invoice_number, p_patient_id, p_visit_id,
        v_subtotal, v_discount, p_discount_reason, 0.00,
        v_grand_total, v_paid, v_due, v_status,
        v_calling_user_id, NOW(), NOW()
    ) RETURNING id INTO v_invoice_id;

    -- Insert line items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_cat := UPPER(COALESCE(v_item->>'service_category', v_item->>'category', 'MISC'));
        IF v_item_cat NOT IN ('CONSULTATION', 'LAB', 'XRAY', 'USG', 'ECG', 'PHARMACY', 'BED', 'CABIN', 'OT', 'AMBULANCE', 'MISC') THEN
            v_item_cat := 'MISC';
        END IF;
        v_item_name := COALESCE(v_item->>'item_name', v_item->>'itemName', 'Service Item');
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'unitPrice')::NUMERIC, 0);
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 1.0);
        v_item_total := v_unit_price * v_quantity;
        v_item_ref := CASE 
            WHEN (v_item->>'reference_id') ~ '^[0-9a-fA-F-]{36}$' THEN (v_item->>'reference_id')::UUID 
            WHEN (v_item->>'referenceId') ~ '^[0-9a-fA-F-]{36}$' THEN (v_item->>'referenceId')::UUID 
            ELSE NULL 
        END;

        INSERT INTO public.invoice_items (
            invoice_id, service_category, reference_id,
            item_name, unit_price, quantity, total_price, created_at
        ) VALUES (
            v_invoice_id, v_item_cat, v_item_ref,
            v_item_name, v_unit_price, v_quantity, v_item_total, NOW()
        );
    END LOOP;

    -- Record Payment if initial payment received
    IF v_paid > 0 THEN
        v_receipt_number := public.generate_receipt_number(p_org_id);
        INSERT INTO public.payments (
            organization_id, invoice_id, patient_id, amount,
            payment_method, transaction_reference, cashier_id,
            receipt_number, payment_date, created_at
        ) VALUES (
            p_org_id, v_invoice_id, p_patient_id, v_paid,
            UPPER(COALESCE(p_payment_method, 'CASH')), p_gateway_transaction_id, v_cashier_uuid,
            v_receipt_number, NOW(), NOW()
        ) RETURNING id INTO v_payment_id;
    END IF;

    -- Automatic Referral Commission Calculation & Snapshot
    -- FORMULA: commission_base = grand_total (final patient bill after approved discount)
    -- commission_amount = ROUND(commission_base * commission_rate_percent / 100, 2)
    IF v_ref_agent_id IS NOT NULL AND v_ref_eligible IS TRUE AND v_grand_total > 0 THEN
        v_comm_amount := ROUND((v_grand_total * v_ref_rate / 100.0), 2);

        IF v_comm_amount > 0 THEN
            INSERT INTO public.referral_commissions (
                organization_id, referral_agent_id, referral_attribution_id,
                patient_id, visit_id, invoice_id,
                referral_code_snapshot, referral_name_snapshot,
                billing_subtotal, discount_amount, commission_base_amount,
                commission_rate_percent, commission_amount,
                amount_paid, amount_pending,
                approval_status, settlement_status,
                created_at, updated_at
            ) VALUES (
                p_org_id, v_ref_agent_id, v_attrib_id,
                p_patient_id, p_visit_id, v_invoice_id,
                v_ref_code, v_ref_name,
                v_subtotal, v_discount, v_grand_total,
                v_ref_rate, v_comm_amount,
                0.00, v_comm_amount,
                CASE WHEN v_ref_type = 'DOCTOR' AND v_ref_compliance IS NOT TRUE THEN 'PENDING' ELSE 'APPROVED' END,
                'PENDING',
                NOW(), NOW()
            ) RETURNING id INTO v_comm_id;

            -- Update agent aggregate earned counter
            UPDATE public.referral_agents
            SET total_commission_earned = total_commission_earned + v_comm_amount,
                updated_at = NOW()
            WHERE id = v_ref_agent_id;
        END IF;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'CREATE', 'BILLING', 'invoice', v_invoice_id::text,
        jsonb_build_object(
            'invoice_number', v_invoice_number,
            'subtotal', v_subtotal,
            'discount', v_discount,
            'grand_total', v_grand_total,
            'paid', v_paid,
            'referral_code', v_ref_code,
            'commission_amount', v_comm_amount
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'subtotal', v_subtotal,
        'discount_amount', v_discount,
        'grand_total', v_grand_total,
        'paid_amount', v_paid,
        'due_amount', v_due,
        'status', v_status,
        'receipt_number', v_receipt_number,
        'payment_id', v_payment_id,
        'referral_code', v_ref_code,
        'commission_amount', v_comm_amount,
        'commission_id', v_comm_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 17. Enhanced post_billing_to_gl_atomic (Double-Entry Referral Commission Accrual)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_billing_to_gl_atomic(
    p_org_id UUID,
    p_invoice_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inv RECORD;
    v_active_org UUID;
    v_entry_number VARCHAR(40);
    v_cash_acc_id UUID;
    v_ar_acc_id UUID;
    v_rev_acc_id UUID;
    v_disc_acc_id UUID;
    v_comm_exp_acc_id UUID;
    v_comm_pay_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_res JSONB;

    v_comm RECORD;
    v_comm_entry_number VARCHAR(40);
    v_comm_lines JSONB := '[]'::JSONB;
    v_comm_res JSONB;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invoice % not found in organization %', p_invoice_id, p_org_id;
    END IF;

    -- Ensure default COA exists
    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010';
    SELECT id INTO v_ar_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1100';
    SELECT id INTO v_rev_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '4010';
    SELECT id INTO v_disc_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '4090';

    -- Invoice Primary GL Journal Entry
    IF v_inv.paid_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_cash_acc_id,
            'debit', v_inv.paid_amount,
            'credit', 0.00,
            'description', 'Payment collected on invoice ' || v_inv.invoice_number
        );
    END IF;

    IF v_inv.due_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_ar_acc_id,
            'debit', v_inv.due_amount,
            'credit', 0.00,
            'description', 'Accounts receivable for invoice ' || v_inv.invoice_number
        );
    END IF;

    IF v_inv.discount_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_disc_acc_id,
            'debit', v_inv.discount_amount,
            'credit', 0.00,
            'description', 'Discount granted on invoice ' || v_inv.invoice_number
        );
    END IF;

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_rev_acc_id,
        'debit', 0.00,
        'credit', v_inv.subtotal,
        'description', 'Revenue recognition for invoice ' || v_inv.invoice_number
    );

    v_entry_number := 'JE-INV-' || v_inv.invoice_number;

    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_entry_number,
        CURRENT_DATE,
        'INVOICE',
        p_invoice_id,
        'Automated billing GL posting for invoice ' || v_inv.invoice_number,
        v_lines,
        auth.uid()
    );

    IF (v_res->>'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_res;
    END IF;

    -- Accrue Referral Commission in General Ledger if commission generated
    SELECT * INTO v_comm
    FROM public.referral_commissions
    WHERE invoice_id = p_invoice_id AND organization_id = p_org_id;

    IF v_comm.id IS NOT NULL AND v_comm.commission_amount > 0 THEN
        SELECT id INTO v_comm_exp_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5400';
        SELECT id INTO v_comm_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2030';

        v_comm_lines := v_comm_lines || jsonb_build_object(
            'account_id', v_comm_exp_acc_id,
            'debit', v_comm.commission_amount,
            'credit', 0.00,
            'description', 'Referral commission expense for ' || v_comm.referral_code_snapshot || ' on ' || v_inv.invoice_number
        );

        v_comm_lines := v_comm_lines || jsonb_build_object(
            'account_id', v_comm_pay_acc_id,
            'debit', 0.00,
            'credit', v_comm.commission_amount,
            'description', 'Referral commission payable for ' || v_comm.referral_code_snapshot || ' on ' || v_inv.invoice_number
        );

        v_comm_entry_number := 'JE-REF-COMM-' || v_inv.invoice_number;

        v_comm_res := public.post_journal_entry_atomic(
            p_org_id,
            v_comm_entry_number,
            CURRENT_DATE,
            'REFERRAL_COMMISSION',
            v_comm.id,
            'Accrued referral commission for ' || v_comm.referral_code_snapshot || ' on invoice ' || v_inv.invoice_number,
            v_comm_lines,
            auth.uid()
        );
    END IF;

    RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 18. Stored Procedure: Settle Referral Commissions (Payouts & GL Balancing)
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_referral_commissions_atomic(
    p_org_id UUID,
    p_agent_id UUID,
    p_commission_ids UUID[],
    p_payment_method VARCHAR,
    p_transaction_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_calling_user UUID;
    v_agent RECORD;
    v_comm RECORD;
    v_settlement_id UUID;
    v_settlement_number VARCHAR(40);
    v_total_paid NUMERIC(14,2) := 0.00;
    v_item_count INT := 0;

    v_pay_acc_id UUID;
    v_cash_acc_id UUID;
    v_gl_lines JSONB := '[]'::JSONB;
    v_gl_res JSONB;
BEGIN
    v_calling_user := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Validate payment method
    IF UPPER(p_payment_method) NOT IN ('CASH', 'BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid payout payment method.');
    END IF;

    -- Validate agent exists and is eligible
    SELECT * INTO v_agent
    FROM public.referral_agents
    WHERE id = p_agent_id AND organization_id = p_org_id;

    IF v_agent.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Referral agent not found.');
    END IF;

    IF v_agent.agent_type = 'DOCTOR' AND v_agent.compliance_approved IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor referral payout requires management compliance approval before disbursement.');
    END IF;

    IF p_commission_ids IS NULL OR array_length(p_commission_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'At least one commission record must be selected for payout.');
    END IF;

    v_settlement_number := public.generate_referral_settlement_number(p_org_id);

    -- Compute total payable and lock rows
    FOR v_comm IN
        SELECT id, amount_pending, settlement_status, approval_status
        FROM public.referral_commissions
        WHERE id = ANY(p_commission_ids)
          AND organization_id = p_org_id
          AND referral_agent_id = p_agent_id
        FOR UPDATE
    LOOP
        IF v_comm.settlement_status IN ('PAID', 'CANCELLED', 'REVERSED') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cannot settle already paid, cancelled, or reversed commissions.');
        END IF;

        IF v_comm.amount_pending <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Selected commission has no pending balance.');
        END IF;

        v_total_paid := v_total_paid + v_comm.amount_pending;
        v_item_count := v_item_count + 1;
    END LOOP;

    IF v_item_count = 0 OR v_total_paid <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No eligible pending commissions found.');
    END IF;

    -- Insert Settlement Header
    INSERT INTO public.referral_commission_settlements (
        organization_id, settlement_number, referral_agent_id, settlement_date,
        gross_commission_selected, adjustment_amount, net_paid_amount,
        payment_method, transaction_reference, paid_by, approved_by,
        status, notes, created_at
    ) VALUES (
        p_org_id, v_settlement_number, p_agent_id, CURRENT_DATE,
        v_total_paid, 0.00, v_total_paid,
        UPPER(p_payment_method), p_transaction_reference, v_calling_user, v_calling_user,
        'PAID', p_notes, NOW()
    ) RETURNING id INTO v_settlement_id;

    -- Insert Settlement Items & Update Commission Ledger Rows
    FOR v_comm IN
        SELECT id, amount_pending
        FROM public.referral_commissions
        WHERE id = ANY(p_commission_ids)
          AND organization_id = p_org_id
          AND referral_agent_id = p_agent_id
    LOOP
        INSERT INTO public.referral_commission_settlement_items (
            organization_id, settlement_id, commission_id, allocated_amount, created_at
        ) VALUES (
            p_org_id, v_settlement_id, v_comm.id, v_comm.amount_pending, NOW()
        );

        UPDATE public.referral_commissions
        SET amount_paid = amount_paid + v_comm.amount_pending,
            amount_pending = 0.00,
            settlement_status = 'PAID',
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = v_comm.id;
    END LOOP;

    -- Update Agent Total Settled Counter
    UPDATE public.referral_agents
    SET total_commission_settled = total_commission_settled + v_total_paid,
        updated_at = NOW()
    WHERE id = p_agent_id;

    -- Post General Ledger Settlement Journal Entry:
    -- Debit: 2030 (Referral Commissions Payable)
    -- Credit: 1010 (Cash in Hand) OR 1020 (Cash at Bank)
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2030';

    IF UPPER(p_payment_method) = 'CASH' THEN
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010';
    ELSE
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020';
    END IF;

    v_gl_lines := v_gl_lines || jsonb_build_object(
        'account_id', v_pay_acc_id,
        'debit', v_total_paid,
        'credit', 0.00,
        'description', 'Settlement of referral commission payable to ' || v_agent.agent_code
    );

    v_gl_lines := v_gl_lines || jsonb_build_object(
        'account_id', v_cash_acc_id,
        'debit', 0.00,
        'credit', v_total_paid,
        'description', 'Disbursement of referral payout via ' || UPPER(p_payment_method)
    );

    v_gl_res := public.post_journal_entry_atomic(
        p_org_id,
        'JE-REF-SET-' || v_settlement_number,
        CURRENT_DATE,
        'REFERRAL_SETTLEMENT',
        v_settlement_id,
        'Disbursement of referral commissions to ' || v_agent.agent_code || ' (' || v_agent.full_name || ')',
        v_gl_lines,
        v_calling_user
    );

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user, 'CREATE', 'REFERRAL', 'referral_settlement', v_settlement_id::text,
        jsonb_build_object(
            'settlement_number', v_settlement_number,
            'agent_code', v_agent.agent_code,
            'total_paid', v_total_paid,
            'invoices_count', v_item_count,
            'payment_method', p_payment_method
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'settlement_number', v_settlement_number,
        'net_paid_amount', v_total_paid,
        'item_count', v_item_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_referral_commissions_atomic(UUID, UUID, UUID[], VARCHAR, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_referral_commissions_atomic(UUID, UUID, UUID[], VARCHAR, TEXT, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 19. Void Invoice & Reverse Commission Function Integration
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_invoice_and_reverse_gl_atomic(
    p_org_id UUID,
    p_invoice_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_inv RECORD;
    v_je RECORD;
    v_calling_user_id UUID;
    v_has_perm BOOLEAN := FALSE;
    v_rev_result JSONB := NULL;
    v_comm RECORD;
BEGIN
    v_calling_user_id := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Validate void permission
    IF v_calling_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('billing.void', '*')
            ) INTO v_has_perm;

            IF v_has_perm IS NOT TRUE THEN
                RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Caller lacks invoice void permission.');
            END IF;
        END IF;
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_inv.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found.');
    END IF;

    IF v_inv.is_voided IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice is already voided.');
    END IF;

    -- Mark invoice voided
    UPDATE public.invoices
    SET is_voided = TRUE,
        status = 'VOID',
        voided_by = v_calling_user_id,
        voided_at = NOW(),
        void_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_invoice_id;

    -- Reverse General Ledger Billing Journal Entry
    SELECT * INTO v_je FROM public.journal_entries
    WHERE reference_type = 'INVOICE' AND reference_id = p_invoice_id AND organization_id = p_org_id AND is_reversed = FALSE
    LIMIT 1;

    IF v_je.id IS NOT NULL THEN
        v_rev_result := public.reverse_journal_entry_atomic(p_org_id, v_je.id, 'Invoice voided: ' || COALESCE(p_reason, 'No reason specified'));
    END IF;

    -- Reverse Referral Commission if exists
    SELECT * INTO v_comm FROM public.referral_commissions
    WHERE invoice_id = p_invoice_id AND organization_id = p_org_id;

    IF v_comm.id IS NOT NULL THEN
        UPDATE public.referral_commissions
        SET settlement_status = 'CANCELLED',
            reversal_reason = 'Invoice voided: ' || COALESCE(p_reason, 'No reason specified'),
            reversed_at = NOW(),
            updated_at = NOW()
        WHERE id = v_comm.id;

        -- Decrement agent total earned counter if unpaid
        IF v_comm.settlement_status != 'PAID' THEN
            UPDATE public.referral_agents
            SET total_commission_earned = GREATEST(0, total_commission_earned - v_comm.commission_amount),
                updated_at = NOW()
            WHERE id = v_comm.referral_agent_id;
        END IF;

        -- Reverse Commission GL Journal Entry
        SELECT * INTO v_je FROM public.journal_entries
        WHERE reference_type = 'REFERRAL_COMMISSION' AND reference_id = v_comm.id AND organization_id = p_org_id AND is_reversed = FALSE
        LIMIT 1;

        IF v_je.id IS NOT NULL THEN
            PERFORM public.reverse_journal_entry_atomic(p_org_id, v_je.id, 'Commission reversed on invoice void: ' || COALESCE(p_reason, ''));
        END IF;
    END IF;

    -- Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'VOID', 'BILLING', 'invoice', p_invoice_id::text,
        jsonb_build_object(
            'reason', p_reason,
            'voided_at', NOW(),
            'commission_reversed', v_comm.id IS NOT NULL
        )
    );

    RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'is_voided', true);
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) TO authenticated, service_role;
