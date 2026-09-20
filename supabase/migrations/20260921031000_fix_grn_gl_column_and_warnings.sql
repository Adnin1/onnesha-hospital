-- =====================================================================================
-- Migration 49: 20260921031000_fix_grn_gl_column_and_warnings.sql
-- Fixes column reference in post_grn_to_inventory_and_gl_atomic (total_cost / quantity_received)
-- and cleans up unused variable warnings in ERP integration functions.
-- =====================================================================================

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
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Pharmacy sale must contain at least one medicine item';
    END IF;

    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_cash_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1010';
    SELECT id INTO v_rev_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '4020';
    SELECT id INTO v_cogs_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5010';
    SELECT id INTO v_inv_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1210';

    v_sale_number := 'PS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
    v_sale_notes := COALESCE(p_notes, 'Method: ' || UPPER(COALESCE(p_payment_method, 'CASH')));

    INSERT INTO public.pharmacy_sales (
        organization_id, sale_number, patient_id, total_amount, sold_by, created_at
    ) VALUES (
        p_org_id, v_sale_number, p_patient_id, 0.00, COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID), NOW()
    ) RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
    LOOP
        v_batch_id := (v_item->>'batch_id')::UUID;
        v_qty := (v_item->>'quantity')::INT;
        v_unit_price := (v_item->>'unit_price')::NUMERIC;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'Quantity must be positive for batch %', v_batch_id;
        END IF;

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

        UPDATE public.medicine_batches
        SET current_stock = current_stock - v_qty
        WHERE id = v_batch_id;

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

    UPDATE public.pharmacy_sales SET total_amount = v_total_sale WHERE id = v_sale_id;

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_cash_acc_id,
        'debit', v_total_sale,
        'credit', 0.00,
        'description', 'Cash collected for pharmacy sale ' || v_sale_number
    );

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_rev_acc_id,
        'debit', 0.00,
        'credit', v_total_sale,
        'description', 'Revenue from pharmacy sale ' || v_sale_number
    );

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_cogs_acc_id,
        'debit', v_total_cogs,
        'credit', 0.00,
        'description', 'COGS for pharmacy sale ' || v_sale_number
    );

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_inv_acc_id,
        'debit', 0.00,
        'credit', v_total_cogs,
        'description', 'Stock reduction for pharmacy sale ' || v_sale_number
    );

    v_je_number := 'JE-PHARM-' || v_sale_number;

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

    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_inv_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1200';
    SELECT id INTO v_ap_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2010';

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_inv_acc_id,
        'debit', v_total_amount,
        'credit', 0.00,
        'description', 'Inventory received via GRN ' || v_grn.grn_number
    );

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_ap_acc_id,
        'debit', 0.00,
        'credit', v_total_amount,
        'description', 'Supplier payable liability for GRN ' || v_grn.grn_number
    );

    v_je_number := 'JE-GRN-' || v_grn.grn_number;

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

    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_sal_exp_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5100';
    SELECT id INTO v_bank_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1020';

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_sal_exp_id,
        'debit', v_run.total_net,
        'credit', 0.00,
        'description', 'Salaries & wages expense for period ' || v_run.month_year
    );

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_bank_acc_id,
        'debit', 0.00,
        'credit', v_run.total_net,
        'description', 'Payroll disbursement from bank for period ' || v_run.month_year
    );

    v_je_number := 'JE-PAYROLL-' || v_run.month_year;

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

    PERFORM public.seed_default_chart_of_accounts(p_org_id);
    SELECT id INTO v_dep_exp_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '5200';
    SELECT id INTO v_accum_dep_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1590';

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_dep_exp_id,
        'debit', p_depreciation_amount,
        'credit', 0.00,
        'description', 'Depreciation expense for asset ' || v_asset.asset_code || ' (' || v_asset.asset_name || ')'
    );

    v_lines := v_lines || jsonb_build_object(
        'account_id', v_accum_dep_id,
        'debit', 0.00,
        'credit', p_depreciation_amount,
        'description', 'Accumulated depreciation allowance for ' || v_asset.asset_code
    );

    v_je_number := 'JE-DEP-' || v_asset.asset_code || '-' || TO_CHAR(NOW(), 'YYYYMMDD');

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
