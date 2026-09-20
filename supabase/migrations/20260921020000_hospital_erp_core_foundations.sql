-- =====================================================================================
-- Migration 47: 20260921020000_hospital_erp_core_foundations.sql
-- HOSPITAL ENTERPRISE RESOURCE PLANNING (ERP) FOUNDATION ARCHITECTURE
-- 1. Double-Entry Chart of Accounts & General Ledger
-- 2. Procurement Requisitions & Goods Receipt Notes (GRN)
-- 3. Warehouses & Multi-Location Stock Transfers
-- 4. Fixed Assets & Medical Equipment Lifecycle
-- 5. Inpatient Nursing Notes & Vitals Rounds
-- 6. Atomic Journal Entry Posting RPC with Debit=Credit Invariant
-- 7. Strict Tenant Isolation RLS via private.get_current_org_id()
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Double-Entry Chart of Accounts & General Ledger
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    account_code VARCHAR(30) NOT NULL,
    account_name VARCHAR(150) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    parent_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, account_code)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    entry_number VARCHAR(40) NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_type VARCHAR(50), -- 'INVOICE', 'PAYMENT', 'PHARMACY_SALE', 'EXPENSE', 'PAYROLL', 'MANUAL'
    reference_id UUID,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
    total_debit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_credit NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    posted_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, entry_number)
);

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
    debit NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (debit >= 0),
    credit NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (credit >= 0),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------------------
-- 2. Hospital Procurement & Requisitions
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    requisition_number VARCHAR(40) NOT NULL,
    department_id UUID REFERENCES public.departments(id),
    requested_by UUID REFERENCES public.profiles(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CONVERTED_TO_PO')),
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'URGENT', 'EMERGENCY')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, requisition_number)
);

CREATE TABLE IF NOT EXISTS public.purchase_requisition_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
    item_name VARCHAR(200) NOT NULL,
    item_category VARCHAR(50) NOT NULL DEFAULT 'CONSUMABLE',
    quantity INT NOT NULL CHECK (quantity > 0),
    estimated_unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_unit_cost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.goods_receipt_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    grn_number VARCHAR(40) NOT NULL,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.medicine_suppliers(id) ON DELETE RESTRICT,
    received_by UUID REFERENCES public.profiles(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'VERIFIED' CHECK (status IN ('DRAFT', 'VERIFIED', 'DISCREPANCY')),
    total_received_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (total_received_cost >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, grn_number)
);

CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_id UUID NOT NULL REFERENCES public.goods_receipt_notes(id) ON DELETE CASCADE,
    item_name VARCHAR(200) NOT NULL,
    quantity_received INT NOT NULL CHECK (quantity_received > 0),
    unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC(14, 2) NOT NULL CHECK (total_cost >= 0),
    batch_number VARCHAR(100),
    expiry_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------------------
-- 3. Warehouses & Multi-Location Stock Transfers
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    warehouse_code VARCHAR(30) NOT NULL,
    warehouse_name VARCHAR(150) NOT NULL,
    location VARCHAR(200),
    manager_id UUID REFERENCES public.profiles(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, warehouse_code)
);

CREATE TABLE IF NOT EXISTS public.inventory_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    transfer_number VARCHAR(40) NOT NULL,
    source_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    destination_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    transferred_by UUID REFERENCES public.profiles(id),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, transfer_number)
);

-- -------------------------------------------------------------------------------------
-- 4. Fixed Assets & Medical Equipment Lifecycle
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hospital_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    asset_code VARCHAR(40) NOT NULL,
    asset_name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('MEDICAL_EQUIPMENT', 'DIAGNOSTIC_MACHINE', 'IT_HARDWARE', 'FURNITURE', 'VEHICLE', 'FACILITY')),
    serial_number VARCHAR(100),
    department_id UUID REFERENCES public.departments(id),
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    purchase_cost NUMERIC(14, 2) NOT NULL CHECK (purchase_cost >= 0),
    current_value NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (current_value >= 0),
    location VARCHAR(150),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'DEPRECIATED', 'DISPOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, asset_code)
);

CREATE TABLE IF NOT EXISTS public.asset_maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    asset_id UUID NOT NULL REFERENCES public.hospital_assets(id) ON DELETE CASCADE,
    maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (cost >= 0),
    performed_by VARCHAR(150),
    notes TEXT NOT NULL,
    next_service_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------------------
-- 5. Inpatient Nursing Notes & Vitals Rounds
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nursing_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES public.patient_visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    nurse_id UUID NOT NULL REFERENCES public.profiles(id),
    shift VARCHAR(20) NOT NULL CHECK (shift IN ('MORNING', 'EVENING', 'NIGHT')),
    note_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.patient_vitals_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES public.patient_visits(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    nurse_id UUID NOT NULL REFERENCES public.profiles(id),
    temperature NUMERIC(5, 2), -- Fahrenheit
    blood_pressure VARCHAR(20), -- e.g. 120/80
    pulse INT, -- bpm
    respiratory_rate INT, -- breaths/min
    spo2 NUMERIC(5, 2), -- %
    blood_glucose NUMERIC(6, 2), -- mmol/L
    round_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------------------
-- 6. Atomic Double-Entry Journal Posting RPC
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_journal_entry_atomic(
    p_org_id UUID,
    p_entry_number VARCHAR,
    p_entry_date DATE,
    p_reference_type VARCHAR,
    p_reference_id UUID,
    p_description TEXT,
    p_lines JSONB,
    p_posted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total_debit NUMERIC(14, 2) := 0.00;
    v_total_credit NUMERIC(14, 2) := 0.00;
    v_entry_id UUID;
    v_line RECORD;
    v_active_org UUID;
BEGIN
    -- Verify organization isolation via private tenant resolver
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NOT NULL AND v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Tenant violation: caller org (%) does not match target org (%)', v_active_org, p_org_id;
    END IF;

    -- Compute total debit and total credit from lines
    SELECT 
        COALESCE(SUM((elem->>'debit')::NUMERIC), 0.00),
        COALESCE(SUM((elem->>'credit')::NUMERIC), 0.00)
    INTO v_total_debit, v_total_credit
    FROM pg_catalog.jsonb_array_elements(p_lines) AS elem;

    -- Enforce Double-Entry Invariant: TOTAL DEBIT = TOTAL CREDIT
    IF v_total_debit != v_total_credit THEN
        RAISE EXCEPTION 'Unbalanced journal entry: Total Debit (%) must equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit <= 0 THEN
        RAISE EXCEPTION 'Journal entry must have a non-zero balanced amount';
    END IF;

    -- Insert journal entry header
    INSERT INTO public.journal_entries (
        organization_id,
        entry_number,
        entry_date,
        reference_type,
        reference_id,
        description,
        status,
        total_debit,
        total_credit,
        posted_by
    ) VALUES (
        p_org_id,
        p_entry_number,
        p_entry_date,
        p_reference_type,
        p_reference_id,
        p_description,
        'POSTED',
        v_total_debit,
        v_total_credit,
        p_posted_by
    ) RETURNING id INTO v_entry_id;

    -- Insert journal entry lines
    FOR v_line IN SELECT * FROM pg_catalog.jsonb_to_recordset(p_lines) AS x(
        account_id UUID,
        debit NUMERIC(14, 2),
        credit NUMERIC(14, 2),
        description TEXT
    ) LOOP
        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_entry_id,
            v_line.account_id,
            COALESCE(v_line.debit, 0.00),
            COALESCE(v_line.credit, 0.00),
            v_line.description
        );
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'entry_id', v_entry_id,
        'entry_number', p_entry_number,
        'total_debit', v_total_debit,
        'total_credit', v_total_credit
    );
END;
$$;

-- Restrict RPC execution to authenticated staff and service_role
REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) TO service_role;

-- -------------------------------------------------------------------------------------
-- 7. Row Level Security (RLS) Policy Binding via private.get_current_org_id()
-- -------------------------------------------------------------------------------------

DO $$
DECLARE
    tbl TEXT;
    erp_tables TEXT[] := ARRAY[
        'chart_of_accounts',
        'journal_entries',
        'purchase_requisitions',
        'goods_receipt_notes',
        'warehouses',
        'inventory_transfers',
        'hospital_assets',
        'asset_maintenance_logs',
        'nursing_notes',
        'patient_vitals_rounds'
    ];
BEGIN
    FOREACH tbl IN ARRAY erp_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS service_role_bypass_policy ON public.%I;', tbl);

        EXECUTE format('
            CREATE POLICY tenant_isolation_policy ON public.%I
            FOR ALL
            TO authenticated
            USING (organization_id = private.get_current_org_id())
            WITH CHECK (organization_id = private.get_current_org_id());
        ', tbl);

        EXECUTE format('
            CREATE POLICY service_role_bypass_policy ON public.%I
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
        ', tbl);
    END LOOP;
END $$;

-- Journal Entry Lines RLS (bound via journal_entry_id parent)
ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.journal_entry_lines;
DROP POLICY IF EXISTS service_role_bypass_policy ON public.journal_entry_lines;

CREATE POLICY tenant_isolation_policy ON public.journal_entry_lines
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.id = journal_entry_id
          AND je.organization_id = private.get_current_org_id()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.journal_entries je
        WHERE je.id = journal_entry_id
          AND je.organization_id = private.get_current_org_id()
    )
);

CREATE POLICY service_role_bypass_policy ON public.journal_entry_lines
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Requisition Items RLS (bound via requisition_id parent)
ALTER TABLE public.purchase_requisition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.purchase_requisition_items;
DROP POLICY IF EXISTS service_role_bypass_policy ON public.purchase_requisition_items;

CREATE POLICY tenant_isolation_policy ON public.purchase_requisition_items
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.purchase_requisitions pr
        WHERE pr.id = requisition_id
          AND pr.organization_id = private.get_current_org_id()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.purchase_requisitions pr
        WHERE pr.id = requisition_id
          AND pr.organization_id = private.get_current_org_id()
    )
);

CREATE POLICY service_role_bypass_policy ON public.purchase_requisition_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Goods Receipt Items RLS (bound via grn_id parent)
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.goods_receipt_items;
DROP POLICY IF EXISTS service_role_bypass_policy ON public.goods_receipt_items;

CREATE POLICY tenant_isolation_policy ON public.goods_receipt_items
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.goods_receipt_notes grn
        WHERE grn.id = grn_id
          AND grn.organization_id = private.get_current_org_id()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.goods_receipt_notes grn
        WHERE grn.id = grn_id
          AND grn.organization_id = private.get_current_org_id()
    )
);

CREATE POLICY service_role_bypass_policy ON public.goods_receipt_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
