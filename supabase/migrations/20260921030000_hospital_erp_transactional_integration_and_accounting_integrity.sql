-- =====================================================================================
-- Migration 48: 20260921030000_hospital_erp_transactional_integration_and_accounting_integrity.sql
-- ONNESHA HOSPITAL MANAGEMENT & ENTERPRISE RESOURCE PLANNING (OHMS ERP)
-- 1. Table-level XOR constraint: Journal line MUST have debit > 0 XOR credit > 0 (never both, never neither)
-- 2. P0 Security: Fail-closed tenant isolation in post_journal_entry_atomic() (deny on NULL or mismatch)
-- 3. Automatic default Chart of Accounts seeder function (seed_default_chart_of_accounts)
-- 4. Atomic Cross-Module ERP Transaction Integration:
--    a. Billing -> GL (post_billing_to_gl_atomic)
--    b. Pharmacy POS -> Inventory -> COGS -> GL (record_pharmacy_sale_erp_atomic)
--    c. Procurement GRN -> Inventory -> Supplier Payable -> GL (post_grn_to_inventory_and_gl_atomic)
--    d. Payroll -> GL (disburse_payroll_to_gl_atomic)
--    e. Fixed Assets -> Depreciation -> GL (record_asset_depreciation_to_gl_atomic)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Enforce Table-Level Mutual Exclusivity Constraint on Journal Lines
-- -------------------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_line_debit_xor_credit'
    ) THEN
        ALTER TABLE public.journal_entry_lines
        ADD CONSTRAINT check_line_debit_xor_credit
        CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0));
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 2. Default Chart of Accounts Seeder Function
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
        (p_org_id, '2020', 'Accrued Staff Salaries & Withholdings', 'LIABILITY')
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
        (p_org_id, '5300', 'Hospital Facility Maintenance & Utilities', 'EXPENSE')
    ON CONFLICT (organization_id, account_code) DO NOTHING;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 3. Hardened Atomic Double-Entry Journal Posting RPC (Strict Fail-Closed)
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
BEGIN
    v_calling_user_id := auth.uid();

    -- P0 Security Hardening: Fail-Closed Organization Resolution
    -- Active organization MUST exist and MUST strictly match p_org_id.
    -- If get_current_org_id() is NULL or unequal, caller is immediately denied.
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Active organization context is missing or does not match target organization'
            USING ERRCODE = '42501';
    END IF;

    -- P0 Security: Server-side RBAC Authorization check
    IF v_calling_user_id IS NOT NULL THEN
        -- Check Role
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.roles r ON ur.role_id = r.id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND LOWER(r.name) IN ('super_admin', 'admin', 'accountant', 'finance_manager')
        ) INTO v_has_perm;

        -- Fallback check role_permissions
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
        COALESCE(p_entry_date, CURRENT_DATE),
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

        -- Verify account exists and belongs to the same organization
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
-- 4. ERP Integration 1: Atomic Billing -> General Ledger Posting RPC
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
    v_lines JSONB := '[]'::JSONB;
    v_res JSONB;
BEGIN
    -- Fail-closed tenant validation
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Fetch invoice
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

    -- Build lines:
    -- If paid > 0, Debit Cash (1010)
    IF v_inv.paid_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_cash_acc_id,
            'debit', v_inv.paid_amount,
            'credit', 0.00,
            'description', 'Payment collected on invoice ' || v_inv.invoice_number
        );
    END IF;

    -- If due > 0, Debit Accounts Receivable (1100)
    IF v_inv.due_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_ar_acc_id,
            'debit', v_inv.due_amount,
            'credit', 0.00,
            'description', 'Accounts receivable for invoice ' || v_inv.invoice_number
        );
    END IF;

    -- If discount > 0, Debit Discounts Allowed (4090)
    IF v_inv.discount_amount > 0 THEN
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_disc_acc_id,
            'debit', v_inv.discount_amount,
            'credit', 0.00,
            'description', 'Discount granted on invoice ' || v_inv.invoice_number
        );
    END IF;

    -- Credit Patient Service Revenue (4010) for gross subtotal
    -- Note: paid + due + discount = grand_total + discount = subtotal. Pure mathematical balance!
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_rev_acc_id,
        'debit', 0.00,
        'credit', v_inv.subtotal,
        'description', 'Revenue recognition for invoice ' || v_inv.invoice_number
    );

    v_entry_number := 'JE-INV-' || v_inv.invoice_number;

    -- Post journal entry
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

    RETURN v_res;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 5. ERP Integration 2: Atomic Pharmacy POS -> Inventory -> COGS -> GL RPC
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

        -- Lock batch row for concurrency safety
        SELECT current_stock, purchase_rate INTO v_cur_stock, v_batch_cost
        FROM public.medicine_batches
        WHERE id = v_batch_id AND organization_id = p_org_id
        FOR UPDATE;

        IF v_cur_stock IS NULL THEN
            RAISE EXCEPTION 'Medicine batch % not found in organization', v_batch_id;
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
-- 6. ERP Integration 3: Atomic Procurement GRN -> Inventory -> Supplier Payable -> GL
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_grn_to_inventory_and_gl_atomic(
    p_org_id UUID,
    p_grn_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_grn RECORD;
    v_total_amount NUMERIC(14, 2) := 0.00;
    v_inv_acc_id UUID;
    v_ap_acc_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(40);
    v_res JSONB;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_grn FROM public.goods_receipt_notes
    WHERE id = p_grn_id AND organization_id = p_org_id;

    IF v_grn.id IS NULL THEN
        RAISE EXCEPTION 'Goods Receipt Note % not found', p_grn_id;
    END IF;

    -- Calculate total GRN cost from goods_receipt_items
    SELECT COALESCE(SUM(total_cost), SUM(quantity_received * unit_cost), 0.00)
    INTO v_total_amount
    FROM public.goods_receipt_items
    WHERE grn_id = p_grn_id;

    IF v_total_amount <= 0 THEN
        v_total_amount := v_grn.total_received_cost;
    END IF;

    IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'GRN % has no items or zero received total cost', v_grn.grn_number;
    END IF;

    -- Seed & fetch GL accounts
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_inv_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1200';
    SELECT id INTO v_ap_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2010';

    -- Build balanced lines:
    -- 1. Debit General Hospital Supplies Inventory (1200)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_inv_acc_id,
        'debit', v_total_amount,
        'credit', 0.00,
        'description', 'Inventory received via GRN ' || v_grn.grn_number
    );

    -- 2. Credit Accounts Payable - Suppliers (2010)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_ap_acc_id,
        'debit', 0.00,
        'credit', v_total_amount,
        'description', 'Supplier payable liability for GRN ' || v_grn.grn_number
    );

    v_je_number := 'JE-GRN-' || v_grn.grn_number;

    -- Post atomic journal
    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        (v_grn.received_at)::DATE,
        'GRN',
        p_grn_id,
        'Automated Procurement GRN inventory and supplier payable GL posting',
        v_lines,
        auth.uid()
    );

    -- Update GRN status
    UPDATE public.goods_receipt_notes
    SET status = 'VERIFIED', total_received_cost = v_total_amount
    WHERE id = p_grn_id;

    RETURN jsonb_build_object(
        'success', true,
        'grn_id', p_grn_id,
        'grn_number', v_grn.grn_number,
        'total_amount', v_total_amount,
        'journal_entry', v_res
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 7. ERP Integration 4: Atomic Payroll Disbursement -> GL RPC
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.disburse_payroll_to_gl_atomic(
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
    v_bank_acc_id UUID;
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

    IF v_run.status = 'DISBURSED' THEN
        RAISE EXCEPTION 'Payroll run for % is already disbursed', v_run.month_year;
    END IF;

    IF v_run.total_net <= 0 THEN
        RAISE EXCEPTION 'Payroll run total net amount must be greater than zero';
    END IF;

    -- Seed & fetch GL accounts
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_sal_exp_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5100';
    SELECT id INTO v_bank_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020';

    -- Build lines:
    -- 1. Debit Staff Salaries & Wages Expense (5100)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_sal_exp_id,
        'debit', v_run.total_net,
        'credit', 0.00,
        'description', 'Salaries & wages expense for period ' || v_run.month_year
    );

    -- 2. Credit Operating Bank Account (1020)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_bank_acc_id,
        'debit', 0.00,
        'credit', v_run.total_net,
        'description', 'Payroll disbursement from bank for period ' || v_run.month_year
    );

    v_je_number := 'JE-PAYROLL-' || v_run.month_year;

    -- Post atomic journal
    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        CURRENT_DATE,
        'PAYROLL',
        p_payroll_run_id,
        'Automated payroll disbursement GL posting for ' || v_run.month_year,
        v_lines,
        auth.uid()
    );

    -- Mark payroll run as disbursed
    UPDATE public.payroll_runs
    SET status = 'DISBURSED', disbursed_at = NOW()
    WHERE id = p_payroll_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'payroll_run_id', p_payroll_run_id,
        'month_year', v_run.month_year,
        'total_disbursed', v_run.total_net,
        'journal_entry', v_res
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 8. ERP Integration 5: Atomic Fixed Asset Depreciation -> GL RPC
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_asset_depreciation_to_gl_atomic(
    p_org_id UUID,
    p_asset_id UUID,
    p_depreciation_amount NUMERIC(12, 2),
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_asset RECORD;
    v_dep_exp_id UUID;
    v_accum_dep_id UUID;
    v_lines JSONB := '[]'::JSONB;
    v_je_number VARCHAR(40);
    v_res JSONB;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_asset FROM public.hospital_assets
    WHERE id = p_asset_id AND organization_id = p_org_id;

    IF v_asset.id IS NULL THEN
        RAISE EXCEPTION 'Hospital asset % not found', p_asset_id;
    END IF;

    IF p_depreciation_amount <= 0 THEN
        RAISE EXCEPTION 'Depreciation amount must be greater than zero';
    END IF;

    IF p_depreciation_amount > v_asset.current_value THEN
        RAISE EXCEPTION 'Depreciation amount (%) cannot exceed current asset value (%)',
            p_depreciation_amount, v_asset.current_value;
    END IF;

    -- Seed & fetch GL accounts
    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_dep_exp_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5200';
    SELECT id INTO v_accum_dep_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1590';

    -- Build lines:
    -- 1. Debit Medical Equipment Depreciation Expense (5200)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_dep_exp_id,
        'debit', p_depreciation_amount,
        'credit', 0.00,
        'description', 'Depreciation expense for asset ' || v_asset.asset_code || ' (' || v_asset.asset_name || ')'
    );

    -- 2. Credit Accumulated Depreciation (1590)
    v_lines := v_lines || jsonb_build_object(
        'account_id', v_accum_dep_id,
        'debit', 0.00,
        'credit', p_depreciation_amount,
        'description', 'Accumulated depreciation allowance for ' || v_asset.asset_code
    );

    v_je_number := 'JE-DEP-' || v_asset.asset_code || '-' || TO_CHAR(NOW(), 'YYYYMMDD');

    -- Post atomic journal
    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        CURRENT_DATE,
        'ASSET_DEPRECIATION',
        p_asset_id,
        COALESCE(p_notes, 'Asset depreciation schedule posting for ' || v_asset.asset_name),
        v_lines,
        auth.uid()
    );

    -- Update asset current value
    UPDATE public.hospital_assets
    SET current_value = current_value - p_depreciation_amount
    WHERE id = p_asset_id;

    RETURN jsonb_build_object(
        'success', true,
        'asset_id', p_asset_id,
        'asset_code', v_asset.asset_code,
        'depreciation_amount', p_depreciation_amount,
        'new_current_value', v_asset.current_value - p_depreciation_amount,
        'journal_entry', v_res
    );
END;
$$;

-- -------------------------------------------------------------------------------------
-- 9. Protect RPC Access - Grant Execution only to Authenticated & Service Role
-- -------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(UUID, VARCHAR, DATE, VARCHAR, UUID, TEXT, JSONB, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_billing_to_gl_atomic(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_pharmacy_sale_erp_atomic(UUID, UUID, JSONB, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pharmacy_sale_erp_atomic(UUID, UUID, JSONB, VARCHAR, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.post_grn_to_inventory_and_gl_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_grn_to_inventory_and_gl_atomic(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.disburse_payroll_to_gl_atomic(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disburse_payroll_to_gl_atomic(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_asset_depreciation_to_gl_atomic(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_asset_depreciation_to_gl_atomic(UUID, UUID, NUMERIC, TEXT) TO authenticated, service_role;
