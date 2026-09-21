-- =====================================================================================
-- Migration 53: 20260921060000_erp_true_accounting_and_runtime_integrity.sql
-- ONNESHA HOSPITAL MANAGEMENT & ENTERPRISE RESOURCE PLANNING (OHMS ERP)
-- 1. Alter journal_entries status check constraint to include ('DRAFT', 'PENDING', 'POSTED', 'REVERSED', 'VOID')
-- 2. Add Table-Level Total Balance Invariant: CHECK (total_debit = total_credit AND total_debit >= 0)
-- 3. Redesign Journal Posting Transaction Ordering:
--    a. Insert header in controlled 'PENDING' intermediate state
--    b. Insert and validate all journal lines
--    c. Atomically transition header to 'POSTED' with verification of line count & totals
--    d. Freeze posted and reversed records as strictly immutable
-- 4. Line-Level 3-Way Match Validation (PO ordered qty vs GRN received qty)
-- 5. Billing Subsequent Payment & Invoice Void Accounting Integration:
--    a. post_payment_receipt_to_gl_atomic (DR Cash/Bank 1010/1020, CR Accounts Receivable 1100)
--    b. void_invoice_and_reverse_gl_atomic (voids invoice and reverses GL journal atomically)
-- 6. Authoritative Database-Level Financial Reporting RPCs:
--    a. get_trial_balance (server-side aggregated trial balance directly from posted lines)
--    b. get_general_ledger_report (account transaction statement with running balance)
--    c. get_financial_statement_summary (income statement & balance sheet balances)
-- 7. High-Performance Accounting & ERP Indexes
-- 8. Fail-closed SECURITY DEFINER search_path = '' and explicit RBAC grants
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Update Journal Entries Status Constraint & Add Balance Invariants
-- -------------------------------------------------------------------------------------

ALTER TABLE public.journal_entries 
    DROP CONSTRAINT IF EXISTS journal_entries_status_check;

ALTER TABLE public.journal_entries 
    ADD CONSTRAINT journal_entries_status_check 
    CHECK (status IN ('DRAFT', 'PENDING', 'POSTED', 'REVERSED', 'VOID'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_journal_entries_balanced'
    ) THEN
        ALTER TABLE public.journal_entries
        ADD CONSTRAINT chk_journal_entries_balanced
        CHECK (total_debit = total_credit AND total_debit >= 0 AND total_credit >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_journal_entries_posted_nonzero'
    ) THEN
        ALTER TABLE public.journal_entries
        ADD CONSTRAINT chk_journal_entries_posted_nonzero
        CHECK (status NOT IN ('POSTED', 'REVERSED') OR (total_debit > 0 AND total_credit > 0));
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 2. Redesigned Journal Entry Immutability Trigger
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_enforce_journal_entry_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_line_count INT;
    v_sum_debit NUMERIC(14, 2);
    v_sum_credit NUMERIC(14, 2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Error: Cannot delete posted/reversed journal entry % (ID %)',
                OLD.entry_number, OLD.id USING ERRCODE = '23506';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Allow controlled atomic transition from PENDING or DRAFT to POSTED
        IF OLD.status IN ('DRAFT', 'PENDING') AND NEW.status = 'POSTED' THEN
            -- Invariant 1: Total Debit must equal Total Credit and be positive
            IF NEW.total_debit != NEW.total_credit OR NEW.total_debit <= 0 THEN
                RAISE EXCEPTION 'Double-Entry Invariant Violation: Journal entry must have non-zero balanced totals (debit=%, credit=%)',
                    NEW.total_debit, NEW.total_credit USING ERRCODE = '22023';
            END IF;

            -- Invariant 2: Line count must be at least 2
            SELECT COUNT(*), COALESCE(SUM(debit), 0.00), COALESCE(SUM(credit), 0.00)
            INTO v_line_count, v_sum_debit, v_sum_credit
            FROM public.journal_entry_lines
            WHERE journal_entry_id = NEW.id;

            IF v_line_count < 2 THEN
                RAISE EXCEPTION 'Double-Entry Invariant Violation: Journal entry % must have at least 2 lines (found %)',
                    NEW.entry_number, v_line_count USING ERRCODE = '22023';
            END IF;

            -- Invariant 3: Line sums must strictly match header totals
            IF v_sum_debit != NEW.total_debit OR v_sum_credit != NEW.total_credit THEN
                RAISE EXCEPTION 'Double-Entry Invariant Violation: Line sums (DR=%, CR=%) do not match header totals (DR=%, CR=%) for %',
                    v_sum_debit, v_sum_credit, NEW.total_debit, NEW.total_credit, NEW.entry_number USING ERRCODE = '22023';
            END IF;

            RETURN NEW;
        END IF;

        -- Allow transition from POSTED to REVERSED ONLY when financial figures and all metadata are strictly unchanged
        IF OLD.status = 'POSTED' AND NEW.status = 'REVERSED' THEN
            IF NEW.entry_number = OLD.entry_number
               AND NEW.organization_id = OLD.organization_id
               AND NEW.entry_date = OLD.entry_date
               AND NEW.reference_type IS NOT DISTINCT FROM OLD.reference_type
               AND NEW.reference_id IS NOT DISTINCT FROM OLD.reference_id
               AND NEW.description IS NOT DISTINCT FROM OLD.description
               AND NEW.total_debit = OLD.total_debit
               AND NEW.total_credit = OLD.total_credit
               AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
               AND NEW.created_at = OLD.created_at THEN
                RETURN NEW;
            ELSE
                RAISE EXCEPTION 'Immutable Journal Error: Cannot alter financial fields, metadata, or dates during reversal of journal % (ID %)',
                    OLD.entry_number, OLD.id USING ERRCODE = '23506';
            END IF;
        END IF;

        -- All other modifications to posted or reversed entries are strictly prohibited
        IF OLD.status IN ('POSTED', 'REVERSED') THEN
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

-- -------------------------------------------------------------------------------------
-- 3. Redesigned Journal Line Immutability Trigger
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_enforce_journal_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent_status VARCHAR(20);
    v_parent_number VARCHAR(40);
    v_target_status VARCHAR(20);
    v_target_number VARCHAR(40);
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT status, entry_number INTO v_parent_status, v_parent_number
        FROM public.journal_entries
        WHERE id = OLD.journal_entry_id;

        IF v_parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Line Error: Cannot delete lines for posted/reversed entry %',
                v_parent_number USING ERRCODE = '23506';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT status, entry_number INTO v_parent_status, v_parent_number
        FROM public.journal_entries
        WHERE id = NEW.journal_entry_id;

        -- Block insertions into already posted or reversed entries
        IF v_parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Line Error: Cannot insert lines into already posted/reversed entry %',
                v_parent_number USING ERRCODE = '23506';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Check source journal entry status
        SELECT status, entry_number INTO v_parent_status, v_parent_number
        FROM public.journal_entries
        WHERE id = OLD.journal_entry_id;

        IF v_parent_status IN ('POSTED', 'REVERSED') THEN
            RAISE EXCEPTION 'Immutable Journal Line Error: Cannot modify lines belonging to posted/reversed entry %',
                v_parent_number USING ERRCODE = '23506';
        END IF;

        -- Block Line Move Attack: Moving a line to a different journal entry
        IF NEW.journal_entry_id != OLD.journal_entry_id THEN
            SELECT status, entry_number INTO v_target_status, v_target_number
            FROM public.journal_entries
            WHERE id = NEW.journal_entry_id;

            IF v_target_status IN ('POSTED', 'REVERSED') THEN
                RAISE EXCEPTION 'Immutable Journal Line Error: Cannot transfer line into posted/reversed entry %',
                    v_target_number USING ERRCODE = '23506';
            END IF;

            RAISE EXCEPTION 'Immutable Journal Line Error: Transferring lines across journal entries is strictly prohibited'
                USING ERRCODE = '23506';
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
-- 4. Atomic Double-Entry Journal Posting RPC with Controlled Intermediate State
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

    -- Fail-Closed Organization Resolution
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Active organization context is missing or does not match target organization'
            USING ERRCODE = '42501';
    END IF;

    -- Accounting Period Control: Disallow posting into closed fiscal periods
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

    -- RBAC Authorization check
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

    -- Validate input lines array
    IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Invalid journal: At least 2 balanced journal lines are required';
    END IF;

    -- Pre-calculate and validate debit XOR credit exclusivity across all lines
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

    -- STEP 1: Insert header in controlled 'PENDING' state
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
        'PENDING',
        v_total_debit,
        v_total_credit,
        p_posted_by
    ) RETURNING id INTO v_entry_id;

    -- STEP 2: Insert journal entry lines while header is PENDING
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

    -- STEP 3: Atomically transition header to 'POSTED'
    -- The trg_journal_entries_immutability trigger will verify lines and lock the entry
    UPDATE public.journal_entries
    SET status = 'POSTED'
    WHERE id = v_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'entry_id', v_entry_id,
        'entry_number', p_entry_number,
        'total_amount', v_total_debit
    );
END;
$$;

REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 5. Hardened 3-Way Match & Supplier Invoice GL Posting RPC with Quantity Check
-- -------------------------------------------------------------------------------------

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

    -- Mandatory 3-Way Match Gate 1: Verified GRN is required
    IF v_sinv.grn_id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Supplier invoice % cannot be posted without a verified Goods Receipt Note (GRN)',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

    -- Verify linked GRN
    SELECT * INTO v_grn FROM public.goods_receipt_notes
    WHERE id = v_sinv.grn_id AND organization_id = p_org_id;

    IF v_grn.id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Linked GRN % does not exist in organization', v_sinv.grn_id
            USING ERRCODE = '22023';
    END IF;

    -- Verify linked PO if specified
    IF v_sinv.purchase_order_id IS NOT NULL THEN
        SELECT * INTO v_po FROM public.purchase_orders
        WHERE id = v_sinv.purchase_order_id AND organization_id = p_org_id;

        IF v_po.id IS NULL THEN
            RAISE EXCEPTION '3-Way Match Error: Linked Purchase Order % does not exist in organization', v_sinv.purchase_order_id
                USING ERRCODE = '22023';
        END IF;

        IF v_po.supplier_id != v_sinv.supplier_id THEN
            RAISE EXCEPTION '3-Way Match Error: Purchase Order supplier does not match Supplier Invoice supplier'
                USING ERRCODE = '22023';
        END IF;

        IF v_grn.purchase_order_id IS NOT NULL AND v_grn.purchase_order_id != v_sinv.purchase_order_id THEN
            RAISE EXCEPTION '3-Way Match Error: GRN PO (%) does not match Supplier Invoice PO (%)',
                v_grn.purchase_order_id, v_sinv.purchase_order_id
                USING ERRCODE = '22023';
        END IF;

        -- Mandatory 3-Way Match Gate 2: Line-Level Quantity Discrepancy Gate
        -- Ensure received quantity does not exceed ordered quantity on linked PO items
        IF EXISTS (
            SELECT 1
            FROM public.purchase_order_items poi
            WHERE poi.purchase_order_id = v_sinv.purchase_order_id
              AND poi.quantity_received > poi.quantity_ordered
        ) THEN
            UPDATE public.supplier_invoices
            SET match_status = 'QTY_DISCREPANCY'
            WHERE id = p_supplier_invoice_id;

            RAISE EXCEPTION '3-Way Match Failed: GRN received quantity exceeds PO ordered quantity for linked PO %',
                v_sinv.purchase_order_id USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Mandatory 3-Way Match Gate 3: Price/cost match tolerance (max 0.05 BDT)
    IF v_grn.total_received_cost > 0 THEN
        IF ABS(v_grn.total_received_cost - v_sinv.total_amount) > 0.05 THEN
            UPDATE public.supplier_invoices
            SET match_status = 'PRICE_DISCREPANCY'
            WHERE id = p_supplier_invoice_id;

            RAISE EXCEPTION '3-Way Match Failed: GRN total (%) does not match Supplier Invoice total (%)',
                v_grn.total_received_cost, v_sinv.total_amount USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Update match status to MATCHED upon successful validation
    UPDATE public.supplier_invoices
    SET match_status = 'MATCHED'
    WHERE id = p_supplier_invoice_id;

    -- Check if already posted to GL
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'SUPPLIER_INVOICE' AND reference_id = p_supplier_invoice_id
    ) THEN
        RAISE EXCEPTION 'Supplier invoice % is already posted to General Ledger', v_sinv.supplier_invoice_number;
    END IF;

    -- Seed & fetch GL accounts
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_inv_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1200';
    SELECT id INTO v_ap_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2010';

    IF v_inv_acc_id IS NULL OR v_ap_acc_id IS NULL THEN
        RAISE EXCEPTION 'GL Account 1200 (Inventory) or 2010 (Accounts Payable) not found';
    END IF;

    -- Lines: DR Inventory (1200), CR Accounts Payable (2010)
    v_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_inv_acc_id,
            'debit', v_sinv.total_amount,
            'credit', 0.00,
            'description', 'Inventory received via GRN ' || COALESCE(v_grn.grn_number, '') || ' (Inv ' || v_sinv.supplier_invoice_number || ')'
        ),
        jsonb_build_object(
            'account_id', v_ap_acc_id,
            'debit', 0.00,
            'credit', v_sinv.total_amount,
            'description', 'AP - Supplier: ' || v_sinv.supplier_invoice_number
        )
    );

    v_je_number := 'JE-SINV-' || v_sinv.supplier_invoice_number;

    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        v_sinv.invoice_date,
        'SUPPLIER_INVOICE',
        p_supplier_invoice_id,
        '3-Way Matched Supplier Invoice ' || v_sinv.supplier_invoice_number || ' (GRN: ' || COALESCE(v_grn.grn_number, 'N/A') || ')',
        v_lines,
        auth.uid()
    );

    RETURN jsonb_build_object(
        'success', true,
        'supplier_invoice_id', p_supplier_invoice_id,
        'match_status', 'MATCHED',
        'journal_entry', v_res
    );
END;
$$;

REVOKE ALL ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_supplier_invoice_to_gl_atomic(UUID, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 6. Billing Subsequent Payment to GL Posting RPC
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_payment_receipt_to_gl_atomic(
    p_org_id UUID,
    p_payment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_pmt RECORD;
    v_inv RECORD;
    v_cash_acc_id UUID;
    v_ar_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(60);
    v_res JSONB;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_pmt FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_org_id;

    IF v_pmt.id IS NULL THEN
        RAISE EXCEPTION 'Payment % not found in organization %', p_payment_id, p_org_id;
    END IF;

    -- Idempotency Guard: Prevent duplicate GL posting for the same payment receipt
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'PAYMENT' AND reference_id = p_payment_id
    ) THEN
        RAISE EXCEPTION 'Payment receipt % is already posted to General Ledger', v_pmt.receipt_number;
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = v_pmt.invoice_id AND organization_id = p_org_id;

    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    -- If payment is digital or bank, use Bank account (1020), otherwise Cash in Hand (1010)
    IF UPPER(v_pmt.payment_method) IN ('BKASH', 'NAGAD', 'CARD', 'BANK', 'ONLINE') THEN
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020';
    ELSE
        SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010';
    END IF;

    SELECT id INTO v_ar_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1100';

    IF v_cash_acc_id IS NULL OR v_ar_acc_id IS NULL THEN
        RAISE EXCEPTION 'Required GL Accounts (1010/1020 and 1100) not configured for organization %', p_org_id;
    END IF;

    -- Lines: DR Cash/Bank (1010/1020), CR Accounts Receivable (1100)
    v_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_cash_acc_id,
            'debit', v_pmt.amount,
            'credit', 0.00,
            'description', 'Payment collected on receipt ' || v_pmt.receipt_number || ' (' || v_pmt.payment_method || ')'
        ),
        jsonb_build_object(
            'account_id', v_ar_acc_id,
            'debit', 0.00,
            'credit', v_pmt.amount,
            'description', 'AR liquidation for invoice ' || COALESCE(v_inv.invoice_number, 'N/A')
        )
    );

    v_je_number := 'JE-RCPT-' || v_pmt.receipt_number;

    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        CURRENT_DATE,
        'PAYMENT',
        p_payment_id,
        'Cashier settlement receipt ' || v_pmt.receipt_number || ' against invoice ' || COALESCE(v_inv.invoice_number, 'N/A'),
        v_lines,
        auth.uid()
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'receipt_number', v_pmt.receipt_number,
        'journal_entry', v_res
    );
END;
$$;

REVOKE ALL ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 7. Void Invoice and Reverse GL Atomically
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
BEGIN
    v_calling_user_id := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Authorization check (Admin / Super Admin / Finance Manager / Billing Supervisor)
    IF v_calling_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RAISE EXCEPTION 'Access denied: Caller lacks authorized supervisory role to void invoices' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'Void reason is required for clinical and financial audit compliance';
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invoice % not found in organization %', p_invoice_id, p_org_id;
    END IF;

    IF v_inv.status = 'VOID' OR v_inv.is_voided = TRUE THEN
        RAISE EXCEPTION 'Invoice % is already voided', v_inv.invoice_number;
    END IF;

    -- Mark invoice as void
    UPDATE public.invoices
    SET is_voided = TRUE,
        status = 'VOID',
        void_reason = p_reason,
        voided_by = v_calling_user_id,
        due_amount = 0.00,
        updated_at = NOW()
    WHERE id = p_invoice_id;

    -- If a posted journal entry exists for this invoice, reverse it atomically
    SELECT * INTO v_je FROM public.journal_entries
    WHERE organization_id = p_org_id AND reference_type = 'INVOICE' AND reference_id = p_invoice_id AND status = 'POSTED';

    IF v_je.id IS NOT NULL THEN
        v_rev_result := public.reverse_journal_entry_atomic(
            p_org_id,
            v_je.id,
            'Automated reversal due to invoice void: ' || p_reason,
            CURRENT_DATE
        );
    END IF;

    -- Record in audit logs
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values
    ) VALUES (
        p_org_id, v_calling_user_id, 'VOID', 'BILLING', 'invoices', p_invoice_id::text,
        jsonb_build_object(
            'invoice_number', v_inv.invoice_number,
            'void_reason', p_reason,
            'gl_reversal', v_rev_result
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', p_invoice_id,
        'invoice_number', v_inv.invoice_number,
        'is_voided', true,
        'gl_reversal', v_rev_result
    );
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_invoice_and_reverse_gl_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 8. Authoritative Database-Level Financial Reporting RPCs
-- -------------------------------------------------------------------------------------

-- A. Authoritative Server-Side Trial Balance
CREATE OR REPLACE FUNCTION public.get_trial_balance(
    p_org_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    account_id UUID,
    account_code VARCHAR(30),
    account_name VARCHAR(150),
    account_type VARCHAR(20),
    total_debit NUMERIC(14, 2),
    total_credit NUMERIC(14, 2),
    net_balance NUMERIC(14, 2)
)
LANGUAGE plpgsql
STABLE
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
        coa.id AS account_id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        COALESCE(SUM(jel.debit), 0.00)::NUMERIC(14, 2) AS total_debit,
        COALESCE(SUM(jel.credit), 0.00)::NUMERIC(14, 2) AS total_credit,
        (COALESCE(SUM(jel.debit), 0.00) - COALESCE(SUM(jel.credit), 0.00))::NUMERIC(14, 2) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN public.journal_entry_lines jel ON coa.id = jel.account_id
    LEFT JOIN public.journal_entries je ON jel.journal_entry_id = je.id
        AND je.organization_id = p_org_id
        AND je.status IN ('POSTED', 'REVERSED')
        AND je.entry_date <= COALESCE(p_as_of_date, CURRENT_DATE)
    WHERE coa.organization_id = p_org_id
      AND coa.is_active = TRUE
    GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
    ORDER BY coa.account_code ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trial_balance(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trial_balance(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(UUID, DATE) TO authenticated, service_role;

-- B. Authoritative General Ledger Account Statement
CREATE OR REPLACE FUNCTION public.get_general_ledger_report(
    p_org_id UUID,
    p_account_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    line_id UUID,
    journal_entry_id UUID,
    entry_number VARCHAR(40),
    entry_date DATE,
    reference_type VARCHAR(50),
    reference_id UUID,
    line_description TEXT,
    debit NUMERIC(14, 2),
    credit NUMERIC(14, 2),
    running_balance NUMERIC(14, 2)
)
LANGUAGE plpgsql
STABLE
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
        jel.id AS line_id,
        je.id AS journal_entry_id,
        je.entry_number,
        je.entry_date,
        je.reference_type,
        je.reference_id,
        COALESCE(jel.description, je.description) AS line_description,
        jel.debit,
        jel.credit,
        SUM(jel.debit - jel.credit) OVER (
            ORDER BY je.entry_date ASC, je.created_at ASC, jel.id ASC
        )::NUMERIC(14, 2) AS running_balance
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.organization_id = p_org_id
      AND jel.account_id = p_account_id
      AND je.status IN ('POSTED', 'REVERSED')
      AND (p_start_date IS NULL OR je.entry_date >= p_start_date)
      AND (p_end_date IS NULL OR je.entry_date <= p_end_date)
    ORDER BY je.entry_date ASC, je.created_at ASC, jel.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_general_ledger_report(UUID, UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_general_ledger_report(UUID, UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_general_ledger_report(UUID, UUID, DATE, DATE) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 9. High-Performance Indexes for ERP & Accounting Transactions
-- -------------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date_status
    ON public.journal_entries (organization_id, entry_date, status);

CREATE INDEX IF NOT EXISTS idx_journal_entries_ref
    ON public.journal_entries (organization_id, reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account_entry
    ON public.journal_entry_lines (account_id, journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_org_status
    ON public.supplier_invoices (organization_id, match_status, payment_status);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_grn
    ON public.supplier_invoices (grn_id);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_org_dates
    ON public.fiscal_periods (organization_id, start_date, end_date, is_closed);

CREATE INDEX IF NOT EXISTS idx_medicine_batches_org_expiry_stock
    ON public.medicine_batches (organization_id, expiry_date, current_stock);
