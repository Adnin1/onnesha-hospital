-- =====================================================================================
-- Migration: 20260922030000_harden_accounting_and_true_3way_match.sql
-- Description:
--   1. Fix get_trial_balance() LEFT JOIN date/status leakage bug via strict subquery join.
--   2. Enforce Mandatory 3-Way Match in post_supplier_invoice_to_gl_atomic (Mandatory PO + GRN + Line Integrity).
--   3. Harden post_payment_receipt_to_gl_atomic (Mandatory Invoice Check, Amount > 0, Status & Overpayment Guard).
--   4. Harden void_invoice_and_reverse_gl_atomic (Active Payments Guard, State Machine Integrity).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Fix get_trial_balance(): Strict Subquery Filtering for Posted Journals
-- -------------------------------------------------------------------------------------
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
    v_target_date DATE;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    v_target_date := COALESCE(p_as_of_date, CURRENT_DATE);

    RETURN QUERY
    SELECT 
        coa.id AS account_id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        COALESCE(SUM(posted_lines.debit), 0.00)::NUMERIC(14, 2) AS total_debit,
        COALESCE(SUM(posted_lines.credit), 0.00)::NUMERIC(14, 2) AS total_credit,
        (COALESCE(SUM(posted_lines.debit), 0.00) - COALESCE(SUM(posted_lines.credit), 0.00))::NUMERIC(14, 2) AS net_balance
    FROM public.chart_of_accounts coa
    LEFT JOIN (
        SELECT 
            jel.account_id,
            jel.debit,
            jel.credit
        FROM public.journal_entry_lines jel
        INNER JOIN public.journal_entries je ON jel.journal_entry_id = je.id
        WHERE je.organization_id = p_org_id
          AND je.status IN ('POSTED', 'REVERSED')
          AND je.entry_date <= v_target_date
    ) posted_lines ON coa.id = posted_lines.account_id
    WHERE coa.organization_id = p_org_id
      AND coa.is_active = TRUE
    GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
    ORDER BY coa.account_code ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_trial_balance(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trial_balance(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(UUID, DATE) TO authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. True 3-Way Match: Mandatory PO + GRN + Line Integrity in post_supplier_invoice_to_gl_atomic
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
        RAISE EXCEPTION 'Supplier invoice % not found in organization %', p_supplier_invoice_id, p_org_id
            USING ERRCODE = '22023';
    END IF;

    -- Concurrency & Idempotency Guard: Prevent duplicate GL postings
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'SUPPLIER_INVOICE' AND reference_id = p_supplier_invoice_id
    ) THEN
        RAISE EXCEPTION 'Supplier invoice % is already posted to General Ledger', v_sinv.supplier_invoice_number
            USING ERRCODE = '22023';
    END IF;

    -- Mandatory 3-Way Match Component 1: Verified Goods Receipt Note (GRN)
    IF v_sinv.grn_id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Supplier invoice % cannot be posted without a verified Goods Receipt Note (GRN)',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_grn FROM public.goods_receipt_notes
    WHERE id = v_sinv.grn_id AND organization_id = p_org_id;

    IF v_grn.id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Linked GRN % does not exist in organization', v_sinv.grn_id
            USING ERRCODE = '22023';
    END IF;

    IF v_grn.status NOT IN ('RECEIVED', 'VERIFIED') THEN
        RAISE EXCEPTION '3-Way Match Error: Linked GRN % is in status %, must be RECEIVED or VERIFIED',
            v_grn.grn_number, v_grn.status USING ERRCODE = '22023';
    END IF;

    -- Mandatory 3-Way Match Component 2: Verified Purchase Order (PO)
    IF v_sinv.purchase_order_id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Supplier invoice % cannot be posted without an authoritative Purchase Order (PO)',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

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

    IF v_grn.purchase_order_id IS NULL OR v_grn.purchase_order_id != v_sinv.purchase_order_id THEN
        RAISE EXCEPTION '3-Way Match Error: GRN PO (%) does not match Supplier Invoice PO (%)',
            v_grn.purchase_order_id, v_sinv.purchase_order_id
            USING ERRCODE = '22023';
    END IF;

    -- Mandatory 3-Way Match Component 3: Line-Level Quantity Discrepancy Gate
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

    -- Mandatory 3-Way Match Component 4: Price & Cost match tolerance (max 0.05 BDT)
    IF v_grn.total_received_cost > 0 THEN
        IF ABS(v_grn.total_received_cost - v_sinv.total_amount) > 0.05 THEN
            UPDATE public.supplier_invoices
            SET match_status = 'PRICE_DISCREPANCY'
            WHERE id = p_supplier_invoice_id;

            RAISE EXCEPTION '3-Way Match Failed: GRN total (%) does not match Supplier Invoice total (%)',
                v_grn.total_received_cost, v_sinv.total_amount USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Update match status to MATCHED upon successful 3-way validation
    UPDATE public.supplier_invoices
    SET match_status = 'MATCHED',
        updated_at = NOW()
    WHERE id = p_supplier_invoice_id;

    -- Seed COA if needed
    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    SELECT id INTO v_inv_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '1200';
    SELECT id INTO v_ap_acc_id FROM public.chart_of_accounts WHERE organization_id = p_org_id AND account_code = '2010';

    IF v_inv_acc_id IS NULL OR v_ap_acc_id IS NULL THEN
        RAISE EXCEPTION 'Required Accounts (1200 Inventory, 2010 Accounts Payable) not configured for organization %', p_org_id;
    END IF;

    v_lines := jsonb_build_array(
        jsonb_build_object(
            'account_id', v_inv_acc_id,
            'debit', v_sinv.total_amount,
            'credit', 0.00,
            'description', 'Inventory received via 3-way match under invoice ' || v_sinv.supplier_invoice_number || ' (GRN: ' || v_grn.grn_number || ')'
        ),
        jsonb_build_object(
            'account_id', v_ap_acc_id,
            'debit', 0.00,
            'credit', v_sinv.total_amount,
            'description', 'Accounts Payable to supplier under invoice ' || v_sinv.supplier_invoice_number
        )
    );

    v_je_number := 'JE-SINV-' || v_sinv.supplier_invoice_number;

    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        v_sinv.invoice_date,
        'SUPPLIER_INVOICE',
        p_supplier_invoice_id,
        '3-Way Matched Supplier Invoice ' || v_sinv.supplier_invoice_number || ' (PO: ' || COALESCE(v_po.po_number, 'N/A') || ', GRN: ' || v_grn.grn_number || ')',
        v_lines,
        auth.uid()
    );

    UPDATE public.supplier_invoices
    SET status = 'POSTED',
        journal_entry_id = (v_res->>'id')::UUID,
        updated_at = NOW()
    WHERE id = p_supplier_invoice_id;

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
-- 3. Hardened Payment Receipt to GL: Mandatory Invoice, Positive Amount & Overpayment Guard
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
        RAISE EXCEPTION 'Payment % not found in organization %', p_payment_id, p_org_id
            USING ERRCODE = '22023';
    END IF;

    -- Positive amount invariant
    IF v_pmt.amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be strictly positive (> 0), got %', v_pmt.amount
            USING ERRCODE = '22023';
    END IF;

    -- Payment status check
    IF UPPER(v_pmt.status) IN ('VOID', 'REFUNDED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Cannot post General Ledger for payment % with status %', v_pmt.receipt_number, v_pmt.status
            USING ERRCODE = '22023';
    END IF;

    -- Idempotency Guard: Prevent duplicate GL posting for the same payment receipt
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'PAYMENT' AND reference_id = p_payment_id
    ) THEN
        RAISE EXCEPTION 'Payment receipt % is already posted to General Ledger', v_pmt.receipt_number
            USING ERRCODE = '22023';
    END IF;

    -- Mandatory Linked Invoice Verification
    IF v_pmt.invoice_id IS NULL THEN
        RAISE EXCEPTION 'Payment receipt % cannot be posted without a linked Invoice', v_pmt.receipt_number
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = v_pmt.invoice_id AND organization_id = p_org_id;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Linked invoice % not found in organization % for payment %',
            v_pmt.invoice_id, p_org_id, v_pmt.receipt_number
            USING ERRCODE = '22023';
    END IF;

    -- Invoice Void/Cancellation Guard
    IF UPPER(v_inv.status) = 'VOID' OR v_inv.is_voided = TRUE THEN
        RAISE EXCEPTION 'Cannot post payment against voided invoice %', v_inv.invoice_number
            USING ERRCODE = '22023';
    END IF;

    -- Overpayment Guard: Prevent unapproved excess payment posting (> total_amount + 0.05 tolerance)
    IF v_pmt.amount > (v_inv.total_amount + 0.05) THEN
        RAISE EXCEPTION 'Payment amount (%) exceeds invoice total amount (%) for invoice %',
            v_pmt.amount, v_inv.total_amount, v_inv.invoice_number
            USING ERRCODE = '22023';
    END IF;

    PERFORM public.seed_default_chart_of_accounts(p_org_id);

    -- Account mapping: Bank (1020) for digital/bank, Cash in Hand (1010) otherwise
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
            'description', 'AR liquidation for invoice ' || v_inv.invoice_number
        )
    );

    v_je_number := 'JE-RCPT-' || v_pmt.receipt_number;

    v_res := public.post_journal_entry_atomic(
        p_org_id,
        v_je_number,
        CURRENT_DATE,
        'PAYMENT',
        p_payment_id,
        'Cashier settlement receipt ' || v_pmt.receipt_number || ' against invoice ' || v_inv.invoice_number,
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
-- 4. Hardened Invoice Void & Reversal: Active Payment Block & Accounting Consistency
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

    -- Authorization check (Super Admin, Admin, Accountant, Finance Manager)
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
        RAISE EXCEPTION 'Void reason is required for clinical and financial audit compliance' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = p_invoice_id AND organization_id = p_org_id;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invoice % not found in organization %', p_invoice_id, p_org_id USING ERRCODE = '22023';
    END IF;

    IF v_inv.status = 'VOID' OR v_inv.is_voided = TRUE THEN
        RAISE EXCEPTION 'Invoice % is already voided', v_inv.invoice_number USING ERRCODE = '22023';
    END IF;

    -- Active Payments Guard: Cannot void an invoice that has active settled payment receipts
    IF EXISTS (
        SELECT 1 FROM public.payments
        WHERE invoice_id = p_invoice_id
          AND organization_id = p_org_id
          AND UPPER(status) NOT IN ('VOID', 'REFUNDED', 'CANCELLED')
    ) THEN
        RAISE EXCEPTION 'Cannot void invoice % with active payment receipts. Payments must be voided or refunded first to preserve General Ledger equilibrium',
            v_inv.invoice_number USING ERRCODE = '22023';
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
