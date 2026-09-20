-- =====================================================================================
-- Migration 50: 20260921040000_accounting_period_control_and_immutability.sql
-- ONNESHA HOSPITAL MANAGEMENT & ENTERPRISE RESOURCE PLANNING (OHMS ERP)
-- 1. Fiscal Periods & Accounting Period Control (public.fiscal_periods)
-- 2. Posted Journal Immutability Triggers (public.journal_entries, public.journal_entry_lines)
-- 3. Atomic Journal Entry Reversal RPC (public.reverse_journal_entry_atomic)
-- 4. Supplier Invoices & 3-Way Match (public.supplier_invoices, post_supplier_invoice_to_gl_atomic)
-- 5. Supplier Invoice Payment RPC (public.record_supplier_payment_to_gl_atomic)
-- 6. Jurisdictional Payroll Accrual to GL RPC (public.post_payroll_accrual_to_gl_atomic)
-- 7. Fixed Asset Maintenance vs Capitalization GL RPC (public.record_asset_maintenance_to_gl_atomic)
-- 8. Hardened post_journal_entry_atomic with closed-period protection
-- 9. Hardened record_pharmacy_sale_erp_atomic with FEFO non-expired batch guard
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Fiscal Periods Table & Accounting Period Control
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fiscal_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_fiscal_period_dates CHECK (start_date <= end_date),
    CONSTRAINT uq_org_fiscal_period_name UNIQUE (organization_id, period_name)
);

ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'fiscal_periods' AND policyname = 'fiscal_periods_tenant_isolation'
    ) THEN
        CREATE POLICY fiscal_periods_tenant_isolation ON public.fiscal_periods
            FOR ALL
            USING (organization_id = private.get_current_org_id())
            WITH CHECK (organization_id = private.get_current_org_id());
    END IF;
END $$;

-- Close Fiscal Period RPC
CREATE OR REPLACE FUNCTION public.close_fiscal_period(
    p_org_id UUID,
    p_period_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_period RECORD;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_period FROM public.fiscal_periods
    WHERE id = p_period_id AND organization_id = p_org_id;

    IF v_period.id IS NULL THEN
        RAISE EXCEPTION 'Fiscal period % not found', p_period_id;
    END IF;

    IF v_period.is_closed = TRUE THEN
        RAISE EXCEPTION 'Fiscal period % is already closed', v_period.period_name;
    END IF;

    UPDATE public.fiscal_periods
    SET is_closed = TRUE,
        closed_at = NOW(),
        closed_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_period_id;

    RETURN jsonb_build_object(
        'success', true,
        'period_id', p_period_id,
        'period_name', v_period.period_name,
        'is_closed', true,
        'closed_at', NOW()
    );
END;
$$;

-- Reopen Fiscal Period RPC (Super Admin only)
CREATE OR REPLACE FUNCTION public.reopen_fiscal_period(
    p_org_id UUID,
    p_period_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_period RECORD;
    v_is_super_admin BOOLEAN := FALSE;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Check Super Admin
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() AND ur.organization_id = p_org_id
          AND LOWER(r.name) = 'super_admin'
    ) INTO v_is_super_admin;

    IF v_is_super_admin IS NOT TRUE AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Access denied: Only super_admin can reopen closed fiscal periods' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_period FROM public.fiscal_periods
    WHERE id = p_period_id AND organization_id = p_org_id;

    IF v_period.id IS NULL THEN
        RAISE EXCEPTION 'Fiscal period % not found', p_period_id;
    END IF;

    UPDATE public.fiscal_periods
    SET is_closed = FALSE,
        closed_at = NULL,
        closed_by = NULL,
        updated_at = NOW()
    WHERE id = p_period_id;

    RETURN jsonb_build_object(
        'success', true,
        'period_id', p_period_id,
        'period_name', v_period.period_name,
        'is_closed', false
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 2. Posted Journal Entry Immutability Triggers
-- -------------------------------------------------------------------------------------

-- Function to prevent mutation of posted journal entries
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_journal_entry_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Error: Cannot delete posted/reversed journal entry % (ID %)',
                OLD.entry_number, OLD.id USING ERRCODE = '23506';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status IN ('POSTED', 'REVERSED') THEN
            -- Allow transition from POSTED to REVERSED ONLY when financial figures and entry number are unchanged
            IF OLD.status = 'POSTED' AND NEW.status = 'REVERSED'
               AND NEW.total_debit = OLD.total_debit
               AND NEW.total_credit = OLD.total_credit
               AND NEW.entry_number = OLD.entry_number
               AND NEW.organization_id = OLD.organization_id THEN
                RETURN NEW;
            END IF;

            RAISE EXCEPTION 'Immutable Journal Error: Cannot modify posted or reversed journal entry % (ID %)',
                OLD.entry_number, OLD.id USING ERRCODE = '23506';
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entries_immutability ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_immutability
    BEFORE UPDATE OR DELETE ON public.journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_enforce_journal_entry_immutability();

-- Function to prevent mutation of lines belonging to posted journal entries
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_journal_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent_status VARCHAR(20);
    v_parent_number VARCHAR(40);
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT status, entry_number INTO v_parent_status, v_parent_number
        FROM public.journal_entries
        WHERE id = OLD.journal_entry_id;

        IF v_parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Line Error: Cannot modify or delete lines for posted entry %',
                v_parent_number USING ERRCODE = '23506';
        END IF;

        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT status, entry_number INTO v_parent_status, v_parent_number
        FROM public.journal_entries
        WHERE id = NEW.journal_entry_id;

        IF v_parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Line Error: Cannot insert lines into already posted entry %',
                v_parent_number USING ERRCODE = '23506';
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_immutability ON public.journal_entry_lines;
CREATE TRIGGER trg_journal_lines_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_enforce_journal_line_immutability();

-- -------------------------------------------------------------------------------------
-- 3. Hardened Atomic Double-Entry Journal Posting RPC with Closed Period Protection
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
    v_elem JSONB;
    v_active_org UUID;
    v_calling_user_id UUID;
    v_has_perm BOOLEAN := FALSE;
    v_line_debit NUMERIC(14, 2);
    v_line_credit NUMERIC(14, 2);
    v_acc_id UUID;
    v_line_desc TEXT;
    v_target_date DATE;
    v_closed_period_name VARCHAR(50);
BEGIN
    v_calling_user_id := auth.uid();
    v_target_date := COALESCE(p_entry_date, CURRENT_DATE);

    -- P0 Security Hardening: Fail-Closed Organization Resolution
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Active organization context is missing or does not match target organization'
            USING ERRCODE = '42501';
    END IF;

    -- P0 Accounting Period Control: Disallow posting into closed fiscal periods
    SELECT period_name INTO v_closed_period_name
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND is_closed = TRUE
      AND v_target_date BETWEEN start_date AND end_date
    LIMIT 1;

    IF v_closed_period_name IS NOT NULL THEN
        RAISE EXCEPTION 'Accounting Period Closed: Transactions cannot be posted to closed fiscal period "%" for date %',
            v_closed_period_name, v_target_date
            USING ERRCODE = '22023';
    END IF;

    -- P0 Security: Server-side RBAC Authorization check
    IF v_calling_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles ur
                JOIN public.role_permissions rp ON ur.role_id = rp.role_id
                WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
                  AND rp.permission_key IN ('accounting.manage', 'accounting.post', '*')
            ) INTO v_has_perm;

            IF v_has_perm IS NOT TRUE THEN
                RAISE EXCEPTION 'Access denied: Caller lacks authorized accounting role or permission'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    -- Validate input lines
    IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Invalid journal: At least 2 balanced journal lines are required';
    END IF;

    -- Validate each line for debit XOR credit exclusivity
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_line_debit := COALESCE((v_elem->>'debit')::NUMERIC, 0.00);
        v_line_credit := COALESCE((v_elem->>'credit')::NUMERIC, 0.00);

        IF (v_line_debit > 0 AND v_line_credit > 0) OR (v_line_debit = 0 AND v_line_credit = 0) THEN
            RAISE EXCEPTION 'Invalid journal line: Each line must have debit > 0 XOR credit > 0 (found debit=%, credit=%)',
                v_line_debit, v_line_credit;
        END IF;

        IF v_line_debit < 0 OR v_line_credit < 0 THEN
            RAISE EXCEPTION 'Negative amounts are strictly prohibited in double-entry journal lines';
        END IF;

        v_total_debit := v_total_debit + v_line_debit;
        v_total_credit := v_total_credit + v_line_credit;
    END LOOP;

    -- Enforce Double-Entry Invariant: TOTAL DEBIT = TOTAL CREDIT
    IF v_total_debit != v_total_credit THEN
        RAISE EXCEPTION 'Unbalanced journal entry: Total Debit (%) must equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit <= 0 THEN
        RAISE EXCEPTION 'Journal entry must have a non-zero balanced amount';
    END IF;

    -- Insert journal entry header with status POSTED
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
        v_target_date,
        p_reference_type,
        p_reference_id,
        p_description,
        'POSTED',
        v_total_debit,
        v_total_credit,
        p_posted_by
    ) RETURNING id INTO v_entry_id;

    -- Insert journal entry lines
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(p_lines)
    LOOP
        v_acc_id := (v_elem->>'account_id')::UUID;
        v_line_debit := COALESCE((v_elem->>'debit')::NUMERIC, 0.00);
        v_line_credit := COALESCE((v_elem->>'credit')::NUMERIC, 0.00);
        v_line_desc := v_elem->>'description';

        IF NOT EXISTS (
            SELECT 1 FROM public.chart_of_accounts
            WHERE id = v_acc_id AND organization_id = p_org_id AND is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Account % does not exist or is inactive in organization %', v_acc_id, p_org_id;
        END IF;

        INSERT INTO public.journal_entry_lines (
            journal_entry_id,
            account_id,
            debit,
            credit,
            description
        ) VALUES (
            v_entry_id,
            v_acc_id,
            v_line_debit,
            v_line_credit,
            v_line_desc
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', v_entry_id,
        'entry_number', p_entry_number,
        'total_amount', v_total_debit
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 4. Atomic Journal Entry Reversal RPC
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_journal_entry_atomic(
    p_org_id UUID,
    p_original_entry_id UUID,
    p_reversal_reason TEXT,
    p_reversal_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_orig RECORD;
    v_rev_lines JSONB := '[]'::JSONB;
    v_line RECORD;
    v_rev_entry_number VARCHAR(60);
    v_rev_date DATE;
    v_closed_period_name VARCHAR(50);
    v_calling_user_id UUID;
    v_has_perm BOOLEAN := FALSE;
    v_rev_result JSONB;
BEGIN
    v_calling_user_id := auth.uid();
    v_rev_date := COALESCE(p_reversal_date, CURRENT_DATE);

    -- P0 Fail-Closed Tenant Check
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- P0 RBAC Check
    IF v_calling_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RAISE EXCEPTION 'Access denied: Caller lacks authorized accounting role for reversal' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Check if reversal date falls into a closed period
    SELECT period_name INTO v_closed_period_name
    FROM public.fiscal_periods
    WHERE organization_id = p_org_id
      AND is_closed = TRUE
      AND v_rev_date BETWEEN start_date AND end_date
    LIMIT 1;

    IF v_closed_period_name IS NOT NULL THEN
        RAISE EXCEPTION 'Accounting Period Closed: Reversal cannot be posted to closed fiscal period "%" for date %',
            v_closed_period_name, v_rev_date
            USING ERRCODE = '22023';
    END IF;

    -- Fetch original journal entry
    SELECT * INTO v_orig FROM public.journal_entries
    WHERE id = p_original_entry_id AND organization_id = p_org_id;

    IF v_orig.id IS NULL THEN
        RAISE EXCEPTION 'Original journal entry % not found in organization %', p_original_entry_id, p_org_id;
    END IF;

    IF v_orig.status = 'REVERSED' THEN
        RAISE EXCEPTION 'Journal entry % is already reversed', v_orig.entry_number;
    END IF;

    IF v_orig.status != 'POSTED' THEN
        RAISE EXCEPTION 'Only posted journal entries can be reversed (current status: %)', v_orig.status;
    END IF;

    IF p_reversal_reason IS NULL OR TRIM(p_reversal_reason) = '' THEN
        RAISE EXCEPTION 'Reversal reason is mandatory for forensic audit trail';
    END IF;

    -- Construct reversing lines by swapping debit and credit
    FOR v_line IN
        SELECT account_id, debit, credit, description
        FROM public.journal_entry_lines
        WHERE journal_entry_id = p_original_entry_id
    LOOP
        v_rev_lines := v_rev_lines || jsonb_build_object(
            'account_id', v_line.account_id,
            'debit', v_line.credit,       -- Swap: original credit becomes new debit
            'credit', v_line.debit,       -- Swap: original debit becomes new credit
            'description', 'Reversal: ' || COALESCE(v_line.description, v_orig.entry_number)
        );
    END LOOP;

    v_rev_entry_number := 'REV-' || v_orig.entry_number;

    -- Post the reversing journal entry
    v_rev_result := public.post_journal_entry_atomic(
        p_org_id,
        v_rev_entry_number,
        v_rev_date,
        'REVERSAL',
        p_original_entry_id,
        'Reversal of ' || v_orig.entry_number || ': ' || p_reversal_reason,
        v_rev_lines,
        auth.uid()
    );

    -- Mark original journal entry as REVERSED
    UPDATE public.journal_entries
    SET status = 'REVERSED'
    WHERE id = p_original_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'original_entry_id', p_original_entry_id,
        'original_entry_number', v_orig.entry_number,
        'reversal_entry', v_rev_result
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 5. Supplier Invoices Table & 3-Way Match Verification
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    supplier_invoice_number VARCHAR(60) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES public.medicine_suppliers(id) ON DELETE RESTRICT,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    grn_id UUID REFERENCES public.goods_receipt_notes(id) ON DELETE SET NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0),
    tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
    match_status VARCHAR(30) NOT NULL DEFAULT 'MATCHED' CHECK (match_status IN ('MATCHED', 'PRICE_DISCREPANCY', 'QTY_DISCREPANCY', 'UNMATCHED')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
    paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, supplier_id, supplier_invoice_number)
);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'supplier_invoices' AND policyname = 'supplier_invoices_tenant_isolation'
    ) THEN
        CREATE POLICY supplier_invoices_tenant_isolation ON public.supplier_invoices
            FOR ALL
            USING (organization_id = private.get_current_org_id())
            WITH CHECK (organization_id = private.get_current_org_id());
    END IF;
END $$;

-- Atomic Supplier Invoice 3-Way Match & Accounts Payable GL Posting RPC
CREATE OR REPLACE FUNCTION public.post_supplier_invoice_to_gl_atomic(
    p_org_id UUID,
    p_supplier_invoice_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_sinv RECORD;
    v_grn RECORD;
    v_po RECORD;
    v_inv_acc_id UUID;
    v_ap_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(60);
    v_res JSONB;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_sinv FROM public.supplier_invoices
    WHERE id = p_supplier_invoice_id AND organization_id = p_org_id;

    IF v_sinv.id IS NULL THEN
        RAISE EXCEPTION 'Supplier invoice % not found', p_supplier_invoice_id;
    END IF;

    -- Check if already posted to GL
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'SUPPLIER_INVOICE' AND reference_id = p_supplier_invoice_id
    ) THEN
        RAISE EXCEPTION 'Supplier invoice % is already posted to General Ledger', v_sinv.supplier_invoice_number;
    END IF;

    -- 3-Way Match Verification:
    -- If GRN is linked, verify GRN cost matches invoice total
    IF v_sinv.grn_id IS NOT NULL THEN
        SELECT * INTO v_grn FROM public.goods_receipt_notes
        WHERE id = v_sinv.grn_id AND organization_id = p_org_id;

        IF v_grn.id IS NOT NULL AND v_grn.total_received_cost > 0 THEN
            IF ABS(v_grn.total_received_cost - v_sinv.total_amount) > 0.05 THEN
                -- Mark discrepancy
                UPDATE public.supplier_invoices
                SET match_status = 'PRICE_DISCREPANCY'
                WHERE id = p_supplier_invoice_id;

                RAISE EXCEPTION '3-Way Match Failed: GRN total (%) does not match Supplier Invoice total (%)',
                    v_grn.total_received_cost, v_sinv.total_amount;
            END IF;
        END IF;
    END IF;

    -- Seed & fetch GL accounts
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_inv_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1200';
    SELECT id INTO v_ap_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2010';

    -- Build lines:
    -- 1. Debit General Hospital Inventory / Purchases (1200)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_inv_acc_id,
        'debit', v_sinv.total_amount,
        'credit', 0.00,
        'description', 'Inventory purchases from supplier invoice ' || v_sinv.supplier_invoice_number
    );

    -- 2. Credit Accounts Payable - Suppliers (2010)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_ap_acc_id,
        'debit', 0.00,
        'credit', v_sinv.total_amount,
        'description', 'Accounts Payable liability for supplier invoice ' || v_sinv.supplier_invoice_number
    );

    v_je_number := 'JE-SINV-' || v_sinv.supplier_invoice_number;

    -- Post atomic journal
    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        v_sinv.invoice_date,
        'SUPPLIER_INVOICE',
        p_supplier_invoice_id,
        'Automated 3-way match AP liability for supplier invoice ' || v_sinv.supplier_invoice_number,
        v_lines,
        auth.uid()
    );

    UPDATE public.supplier_invoices
    SET match_status = 'MATCHED'
    WHERE id = p_supplier_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'supplier_invoice_id', p_supplier_invoice_id,
        'invoice_number', v_sinv.supplier_invoice_number,
        'total_amount', v_sinv.total_amount,
        'match_status', 'MATCHED',
        'journal_entry', v_res
    );
END;
$$;

-- Atomic Supplier Payment to GL RPC
CREATE OR REPLACE FUNCTION public.record_supplier_payment_to_gl_atomic(
    p_org_id UUID,
    p_supplier_invoice_id UUID,
    p_payment_amount NUMERIC(14, 2),
    p_payment_method VARCHAR DEFAULT 'BANK',
    p_bank_acc_code VARCHAR DEFAULT '1020',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_sinv RECORD;
    v_ap_acc_id UUID;
    v_pay_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(60);
    v_new_paid NUMERIC(14, 2);
    v_new_status VARCHAR(20);
    v_res JSONB;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_sinv FROM public.supplier_invoices
    WHERE id = p_supplier_invoice_id AND organization_id = p_org_id;

    IF v_sinv.id IS NULL THEN
        RAISE EXCEPTION 'Supplier invoice % not found', p_supplier_invoice_id;
    END IF;

    IF p_payment_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    IF (v_sinv.paid_amount + p_payment_amount) > v_sinv.total_amount THEN
        RAISE EXCEPTION 'Payment amount (%) exceeds remaining unpaid balance (%)',
            p_payment_amount, (v_sinv.total_amount - v_sinv.paid_amount);
    END IF;

    -- Fetch accounts
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_ap_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2010';
    SELECT id INTO v_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = p_bank_acc_code;

    IF v_pay_acc_id IS NULL THEN
        SELECT id INTO v_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020';
    END IF;

    -- Build lines:
    -- 1. Debit Accounts Payable - Suppliers (2010) (reducing liability)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_ap_acc_id,
        'debit', p_payment_amount,
        'credit', 0.00,
        'description', 'Settlement of supplier invoice ' || v_sinv.supplier_invoice_number
    );

    -- 2. Credit Cash/Bank (reducing cash asset)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_pay_acc_id,
        'debit', 0.00,
        'credit', p_payment_amount,
        'description', 'Payment to supplier for invoice ' || v_sinv.supplier_invoice_number || ' via ' || p_payment_method
    );

    v_je_number := 'JE-SPAY-' || v_sinv.supplier_invoice_number || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- Post atomic journal
    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        CURRENT_DATE,
        'SUPPLIER_PAYMENT',
        p_supplier_invoice_id,
        COALESCE(p_notes, 'Supplier invoice disbursement payment'),
        v_lines,
        auth.uid()
    );

    v_new_paid := v_sinv.paid_amount + p_payment_amount;
    IF v_new_paid >= v_sinv.total_amount THEN
        v_new_status := 'PAID';
    ELSE
        v_new_status := 'PARTIALLY_PAID';
    END IF;

    UPDATE public.supplier_invoices
    SET paid_amount = v_new_paid,
        payment_status = v_new_status
    WHERE id = p_supplier_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'supplier_invoice_id', p_supplier_invoice_id,
        'payment_amount', p_payment_amount,
        'total_paid', v_new_paid,
        'payment_status', v_new_status,
        'journal_entry', v_res
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 6. Full Jurisdictional Payroll Accrual to GL RPC
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_payroll_accrual_to_gl_atomic(
    p_org_id UUID,
    p_payroll_run_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_run RECORD;
    v_sal_exp_id UUID;
    v_withhold_acc_id UUID;
    v_sal_payable_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(40);
    v_res JSONB;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_run FROM public.payroll_runs
    WHERE id = p_payroll_run_id AND organization_id = p_org_id;

    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'Payroll run % not found', p_payroll_run_id;
    END IF;

    IF v_run.total_gross <= 0 THEN
        RAISE EXCEPTION 'Payroll run total gross must be positive';
    END IF;

    -- Ensure Account 2025 exists in COA
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    INSERT INTO public.chart_of_accounts (organization_id, account_code, account_name, account_type)
    VALUES (p_org_id, '2025', 'Net Salaries Payable', 'LIABILITY')
    ON CONFLICT (organization_id, account_code) DO NOTHING;

    SELECT id INTO v_sal_exp_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5100';
    SELECT id INTO v_withhold_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2020';
    SELECT id INTO v_sal_payable_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2025';

    -- Line 1: Debit Gross Salaries & Wages Expense (5100)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_sal_exp_id,
        'debit', v_run.total_gross,
        'credit', 0.00,
        'description', 'Gross payroll expense for period ' || v_run.month_year
    );

    -- Line 2: Credit Employee Deductions & Tax Withholdings Liability (2020) (if any)
    IF v_run.total_deductions > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_withhold_acc_id,
            'debit', 0.00,
            'credit', v_run.total_deductions,
            'description', 'Staff tax & statutory withholdings accrued for ' || v_run.month_year
        );
    END IF;

    -- Line 3: Credit Net Salaries Payable Liability (2025)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_sal_payable_acc_id,
        'debit', 0.00,
        'credit', v_run.total_net,
        'description', 'Net salaries payable to staff for ' || v_run.month_year
    );

    v_je_number := 'JE-PAY-ACCR-' || v_run.month_year;

    -- Post atomic journal
    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        CURRENT_DATE,
        'PAYROLL_ACCRUAL',
        p_payroll_run_id,
        'Automated payroll accrual and withholdings GL posting for ' || v_run.month_year,
        v_lines,
        auth.uid()
    );

    RETURN jsonb_build_object(
        'success', true,
        'payroll_run_id', p_payroll_run_id,
        'month_year', v_run.month_year,
        'total_gross', v_run.total_gross,
        'total_deductions', v_run.total_deductions,
        'total_net', v_run.total_net,
        'journal_entry', v_res
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 7. Fixed Asset Maintenance Expense vs Capitalization to GL RPC
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_asset_maintenance_to_gl_atomic(
    p_org_id UUID,
    p_maintenance_log_id UUID,
    p_is_capitalized BOOLEAN DEFAULT FALSE,
    p_payment_account_code VARCHAR DEFAULT '1020'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_log RECORD;
    v_asset RECORD;
    v_target_debit_acc_id UUID;
    v_pay_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(40);
    v_res JSONB;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_log FROM public.asset_maintenance_logs
    WHERE id = p_maintenance_log_id AND organization_id = p_org_id;

    IF v_log.id IS NULL THEN
        RAISE EXCEPTION 'Asset maintenance log % not found', p_maintenance_log_id;
    END IF;

    IF v_log.cost <= 0 THEN
        RAISE EXCEPTION 'Maintenance log cost must be greater than zero to post to GL';
    END IF;

    SELECT * INTO v_asset FROM public.hospital_assets
    WHERE id = v_log.asset_id AND organization_id = p_org_id;

    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    -- If capitalized: Debit Fixed Assets (1500), else Debit Maintenance Expense (5300)
    IF p_is_capitalized THEN
        SELECT id INTO v_target_debit_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1500';
    ELSE
        SELECT id INTO v_target_debit_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5300';
    END IF;

    SELECT id INTO v_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = p_payment_account_code;
    IF v_pay_acc_id IS NULL THEN
        SELECT id INTO v_pay_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020';
    END IF;

    -- Line 1: Debit Asset or Expense
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_target_debit_acc_id,
        'debit', v_log.cost,
        'credit', 0.00,
        'description', CASE WHEN p_is_capitalized THEN 'Capital improvement for asset ' ELSE 'Routine maintenance expense for asset ' END || v_asset.asset_code
    );

    -- Line 2: Credit Bank/Payment Account
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_pay_acc_id,
        'debit', 0.00,
        'credit', v_log.cost,
        'description', 'Payment for maintenance of ' || v_asset.asset_code
    );

    v_je_number := 'JE-MAINT-' || v_asset.asset_code || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- Post journal
    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        v_log.maintenance_date,
        'ASSET_MAINTENANCE',
        p_maintenance_log_id,
        'Asset maintenance GL posting for ' || v_asset.asset_name || ' (' || v_log.notes || ')',
        v_lines,
        auth.uid()
    );

    -- If capitalized, increase asset current value
    IF p_is_capitalized THEN
        UPDATE public.hospital_assets
        SET current_value = current_value + v_log.cost
        WHERE id = v_asset.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'maintenance_log_id', p_maintenance_log_id,
        'is_capitalized', p_is_capitalized,
        'cost', v_log.cost,
        'journal_entry', v_res
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 8. Hardened Pharmacy Sale ERP Atomic with FEFO & Expiry Validation Guard
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_pharmacy_sale_erp_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_items JSONB, -- array of { batch_id, quantity, unit_price }
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_sale_id UUID;
    v_sale_number VARCHAR(30);
    v_item JSONB;
    v_batch_id UUID;
    v_qty INT;
    v_unit_price NUMERIC(10, 2);
    v_batch_cost NUMERIC(10, 2);
    v_expiry_date DATE;
    v_item_sale_total NUMERIC(12, 2);
    v_item_cost_total NUMERIC(12, 2);
    v_total_sale NUMERIC(12, 2) := 0.00;
    v_total_cogs NUMERIC(12, 2) := 0.00;
    v_cur_stock INT;
    v_cash_acc_id UUID;
    v_rev_acc_id UUID;
    v_cogs_acc_id UUID;
    v_inv_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(40);
    v_sale_notes TEXT;
BEGIN
    -- Fail-closed tenant validation
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Pharmacy sale must contain at least one medicine item';
    END IF;

    -- Ensure COA accounts exist
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010';
    SELECT id INTO v_rev_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '4020';
    SELECT id INTO v_cogs_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5010';
    SELECT id INTO v_inv_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1210';

    v_sale_number := 'PS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
    v_sale_notes := COALESCE(p_notes, 'Method: ' || UPPER(COALESCE(p_payment_method, 'CASH')));

    -- Create sale record
    INSERT INTO public.pharmacy_sales (
        organization_id, sale_number, patient_id, total_amount, sold_by, created_at
    ) VALUES (
        p_org_id, v_sale_number, p_patient_id, 0.00, COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID), NOW()
    ) RETURNING id INTO v_sale_id;

    -- Process each batch stock decrement and ledger transaction
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
    LOOP
        v_batch_id := (v_item->>'batch_id')::UUID;
        v_qty := (v_item->>'quantity')::INT;
        v_unit_price := (v_item->>'unit_price')::NUMERIC;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantity must be positive for batch %', v_batch_id;
        END IF;

        -- Lock batch row for concurrency safety and fetch FEFO attributes
        SELECT current_stock, purchase_rate, expiry_date
        INTO v_cur_stock, v_batch_cost, v_expiry_date
        FROM public.medicine_batches
        WHERE id = v_batch_id AND organization_id = p_org_id
        FOR UPDATE;

        IF v_cur_stock IS NULL THEN
            RAISE EXCEPTION 'Medicine batch % not found in organization', v_batch_id;
        END IF;

        -- FEFO Clinical Patient Safety Rule: Strictly reject expired batches
        IF v_expiry_date IS NOT NULL AND v_expiry_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Dispensing Error: Batch % expired on % and cannot be dispensed to patient',
                v_batch_id, v_expiry_date;
        END IF;

        IF v_cur_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock in batch %: requested %, available %', v_batch_id, v_qty, v_cur_stock;
        END IF;

        -- Deduct physical stock
        UPDATE public.medicine_batches
        SET current_stock = current_stock - v_qty
        WHERE id = v_batch_id;

        -- Insert into immutable stock ledger
        INSERT INTO public.stock_transactions (
            organization_id, batch_id, transaction_type, quantity_in, quantity_out,
            running_balance, reference_id, notes, created_by
        ) VALUES (
            p_org_id, v_batch_id, 'SALE', 0, v_qty,
            v_cur_stock - v_qty, v_sale_id, 'Pharmacy Sale ' || v_sale_number || ' (' || v_sale_notes || ')', auth.uid()
        );

        v_item_sale_total := v_unit_price * v_qty;
        v_item_cost_total := v_batch_cost * v_qty;

        v_total_sale := v_total_sale + v_item_sale_total;
        v_total_cogs := v_total_cogs + v_item_cost_total;
    END LOOP;

    -- Update final total on pharmacy sale
    UPDATE public.pharmacy_sales SET total_amount = v_total_sale WHERE id = v_sale_id;

    -- Build 4-line Balanced Double-Entry Journal:
    -- 1. Debit Cash in Hand (1010)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_cash_acc_id,
        'debit', v_total_sale,
        'credit', 0.00,
        'description', 'Cash collected for pharmacy sale ' || v_sale_number
    );

    -- 2. Credit Pharmacy Medicine Sales Revenue (4020)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_rev_acc_id,
        'debit', 0.00,
        'credit', v_total_sale,
        'description', 'Revenue from pharmacy sale ' || v_sale_number
    );

    -- 3. Debit Cost of Goods Sold - Pharmacy (5010)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_cogs_acc_id,
        'debit', v_total_cogs,
        'credit', 0.00,
        'description', 'COGS for pharmacy sale ' || v_sale_number
    );

    -- 4. Credit Medicine Inventory (1210)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_inv_acc_id,
        'debit', 0.00,
        'credit', v_total_cogs,
        'description', 'Stock reduction for pharmacy sale ' || v_sale_number
    );

    v_je_number := 'JE-PHARM-' || v_sale_number;

    -- Post atomic journal entry
    PERFORM public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        CURRENT_DATE,
        'PHARMACY_SALE',
        v_sale_id,
        'Automated pharmacy POS sale & inventory GL posting (' || v_sale_notes || ')',
        v_lines,
        auth.uid()
    );

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'sale_number', v_sale_number,
        'total_sale', v_total_sale,
        'total_cogs', v_total_cogs,
        'journal_entry_number', v_je_number
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 9. Protect RPC Access - Grant Execution only to Authenticated & Service Role
-- -------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.close_fiscal_period(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reopen_fiscal_period(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_fiscal_period(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reverse_journal_entry_atomic(UUID, UUID, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry_atomic(UUID, UUID, TEXT, DATE) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_supplier_payment_to_gl_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment_to_gl_atomic(UUID, UUID, NUMERIC, VARCHAR, VARCHAR, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.post_payroll_accrual_to_gl_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_payroll_accrual_to_gl_atomic(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_asset_maintenance_to_gl_atomic(UUID, UUID, BOOLEAN, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_asset_maintenance_to_gl_atomic(UUID, UUID, BOOLEAN, VARCHAR) TO authenticated, service_role;
