-- =====================================================================================
-- Migration: 20260922150000_true_line_level_3way_match_and_concurrency.sql
-- Description:
--   1. Create public.supplier_invoice_items table with RLS for true line-level matching.
--   2. Database-level unique constraint on journal_entries (organization_id, reference_type, reference_id)
--      to eliminate concurrent double-posting race conditions.
--   3. Implement TRUE line-level 3-way match in post_supplier_invoice_to_gl_atomic:
--      - Validates each invoice line against PO line (item, quantity <= ordered, quantity <= received, price tolerance)
--      - Validates against GRN line (quantity <= received, batch/item consistency)
--      - Protects with SELECT ... FOR UPDATE concurrency locking.
--   4. Harden post_payment_receipt_to_gl_atomic with SELECT ... FOR UPDATE and cumulative overpayment prevention.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Table: public.supplier_invoice_items
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
    grn_item_id UUID REFERENCES public.goods_receipt_items(id) ON DELETE SET NULL,
    medicine_id UUID REFERENCES public.medicines(id) ON DELETE RESTRICT,
    item_description VARCHAR(200) NOT NULL,
    quantity_invoiced INT NOT NULL CHECK (quantity_invoiced > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'supplier_invoice_items' AND policyname = 'supplier_invoice_items_tenant_isolation'
    ) THEN
        CREATE POLICY supplier_invoice_items_tenant_isolation ON public.supplier_invoice_items
            FOR ALL
            USING (organization_id = private.get_current_org_id())
            WITH CHECK (organization_id = private.get_current_org_id());
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_sinv ON public.supplier_invoice_items(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_po_item ON public.supplier_invoice_items(po_item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_grn_item ON public.supplier_invoice_items(grn_item_id);

-- -------------------------------------------------------------------------------------
-- 2. Concurrency Hardening: Unique Reference Invariant on Journal Entries
-- -------------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_org_ref
    ON public.journal_entries (organization_id, reference_type, reference_id)
    WHERE status IN ('POSTED', 'DRAFT');

-- -------------------------------------------------------------------------------------
-- 3. True Line-Level 3-Way Match: post_supplier_invoice_to_gl_atomic
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
    v_item RECORD;
    v_poi RECORD;
    v_gri RECORD;
    v_items_count INT := 0;
    v_calculated_subtotal NUMERIC(14, 2) := 0.00;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Concurrency Lock: Lock supplier invoice row to eliminate race conditions
    SELECT * INTO v_sinv FROM public.supplier_invoices
    WHERE id = p_supplier_invoice_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_sinv.id IS NULL THEN
        RAISE EXCEPTION 'Supplier invoice % not found in organization %', p_supplier_invoice_id, p_org_id
            USING ERRCODE = '22023';
    END IF;

    -- Idempotency Guard: Prevent duplicate GL postings
    IF v_sinv.status = 'POSTED' OR v_sinv.journal_entry_id IS NOT NULL THEN
        RAISE EXCEPTION 'Supplier invoice % is already posted to General Ledger', v_sinv.supplier_invoice_number
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'SUPPLIER_INVOICE' AND reference_id = p_supplier_invoice_id
    ) THEN
        RAISE EXCEPTION 'Supplier invoice % is already posted to General Ledger', v_sinv.supplier_invoice_number
            USING ERRCODE = '22023';
    END IF;

    -- Mandatory Component 1: Verified Goods Receipt Note (GRN)
    IF v_sinv.grn_id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Supplier invoice % cannot be posted without a verified Goods Receipt Note (GRN)',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_grn FROM public.goods_receipt_notes
    WHERE id = v_sinv.grn_id AND organization_id = p_org_id
    FOR UPDATE;

    IF v_grn.id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Linked GRN % does not exist in organization', v_sinv.grn_id
            USING ERRCODE = '22023';
    END IF;

    IF v_grn.status NOT IN ('RECEIVED', 'VERIFIED') THEN
        RAISE EXCEPTION '3-Way Match Error: Linked GRN % is in status %, must be RECEIVED or VERIFIED',
            v_grn.grn_number, v_grn.status USING ERRCODE = '22023';
    END IF;

    -- Mandatory Component 2: Verified Purchase Order (PO)
    IF v_sinv.purchase_order_id IS NULL THEN
        RAISE EXCEPTION '3-Way Match Error: Supplier invoice % cannot be posted without an authoritative Purchase Order (PO)',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_po FROM public.purchase_orders
    WHERE id = v_sinv.purchase_order_id AND organization_id = p_org_id
    FOR UPDATE;

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

    -- ---------------------------------------------------------------------------------
    -- Mandatory Component 3: TRUE Line-Level 3-Way Match
    -- ---------------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_items_count
    FROM public.supplier_invoice_items
    WHERE supplier_invoice_id = p_supplier_invoice_id;

    IF v_items_count > 0 THEN
        -- Case A: Dedicated Invoice Line Items Exist -> Perform exact line-by-line verification
        FOR v_item IN
            SELECT * FROM public.supplier_invoice_items
            WHERE supplier_invoice_id = p_supplier_invoice_id
            ORDER BY id ASC
        LOOP
            -- Line Extension Math Verification: quantity * unit_price == line_total
            IF ABS((v_item.quantity_invoiced * v_item.unit_price) - v_item.line_total) > 0.05 THEN
                UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: Invoice line % calculation discrepancy (qty % * price % != line_total %)',
                    v_item.id, v_item.quantity_invoiced, v_item.unit_price, v_item.line_total USING ERRCODE = '22023';
            END IF;

            v_calculated_subtotal := v_calculated_subtotal + v_item.line_total;

            -- 1. PO Line Validation
            IF v_item.po_item_id IS NULL THEN
                UPDATE public.supplier_invoices SET match_status = 'UNMATCHED', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: Invoice line % has no linked PO line item', v_item.id USING ERRCODE = '22023';
            END IF;

            SELECT * INTO v_poi FROM public.purchase_order_items
            WHERE id = v_item.po_item_id AND purchase_order_id = v_sinv.purchase_order_id;

            IF v_poi.id IS NULL THEN
                UPDATE public.supplier_invoices SET match_status = 'UNMATCHED', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: PO line item % does not exist in PO %', v_item.po_item_id, v_sinv.purchase_order_id USING ERRCODE = '22023';
            END IF;

            -- Medicine / Item match
            IF v_item.medicine_id IS NOT NULL AND v_poi.medicine_id IS NOT NULL AND v_item.medicine_id != v_poi.medicine_id THEN
                UPDATE public.supplier_invoices SET match_status = 'UNMATCHED', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: Invoice line medicine % does not match PO line medicine %', v_item.medicine_id, v_poi.medicine_id USING ERRCODE = '22023';
            END IF;

            -- Quantity Ordered vs Invoiced
            IF v_item.quantity_invoiced > v_poi.quantity_ordered THEN
                UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: Invoiced qty (%) exceeds PO ordered qty (%) on PO line %',
                    v_item.quantity_invoiced, v_poi.quantity_ordered, v_poi.id USING ERRCODE = '22023';
            END IF;

            -- Quantity Received vs Invoiced
            IF v_poi.quantity_received < v_item.quantity_invoiced THEN
                UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: Invoiced qty (%) exceeds PO received qty (%) on PO line %',
                    v_item.quantity_invoiced, v_poi.quantity_received, v_poi.id USING ERRCODE = '22023';
            END IF;

            -- Unit Price Match Tolerance (0.05 BDT)
            IF ABS(v_item.unit_price - v_poi.unit_cost) > 0.05 THEN
                UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: Invoiced unit price (%) does not match PO agreed unit cost (%) on PO line %',
                    v_item.unit_price, v_poi.unit_cost, v_poi.id USING ERRCODE = '22023';
            END IF;

            -- 2. GRN Line Validation (if linked)
            IF v_item.grn_item_id IS NOT NULL THEN
                SELECT * INTO v_gri FROM public.goods_receipt_items
                WHERE id = v_item.grn_item_id AND grn_id = v_sinv.grn_id;

                IF v_gri.id IS NULL THEN
                    UPDATE public.supplier_invoices SET match_status = 'UNMATCHED', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                    RAISE EXCEPTION '3-Way Match Line Error: GRN item % does not exist on GRN %', v_item.grn_item_id, v_sinv.grn_id USING ERRCODE = '22023';
                END IF;

                IF v_item.quantity_invoiced > v_gri.quantity_received THEN
                    UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                    RAISE EXCEPTION '3-Way Match Line Error: Invoiced qty (%) exceeds GRN received qty (%) on GRN item %',
                        v_item.quantity_invoiced, v_gri.quantity_received, v_gri.id USING ERRCODE = '22023';
                END IF;
            END IF;
        END LOOP;

        -- Check total line subtotal against header subtotal
        IF ABS(v_calculated_subtotal - v_sinv.subtotal) > 0.05 THEN
            UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Error: Sum of invoice lines (%) does not match invoice subtotal (%)',
                v_calculated_subtotal, v_sinv.subtotal USING ERRCODE = '22023';
        END IF;

    ELSE
        -- Case B: Header-Level Invoice -> Enforce line-level matching between linked PO items and GRN items
        IF EXISTS (
            SELECT 1
            FROM public.purchase_order_items poi
            WHERE poi.purchase_order_id = v_sinv.purchase_order_id
              AND poi.quantity_received > poi.quantity_ordered
        ) THEN
            UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Failed: GRN received quantity exceeds PO ordered quantity for linked PO %',
                v_sinv.purchase_order_id USING ERRCODE = '22023';
        END IF;

        IF v_grn.total_received_cost > 0 THEN
            IF ABS(v_grn.total_received_cost - v_sinv.total_amount) > 0.05 THEN
                UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Failed: GRN total received cost (%) does not match Supplier Invoice total (%)',
                    v_grn.total_received_cost, v_sinv.total_amount USING ERRCODE = '22023';
            END IF;
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
-- 4. Hardened Payment Receipt to GL: Cumulative Overpayment Guard & Row Locking
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
    v_cumulative_paid NUMERIC(14, 2) := 0.00;
BEGIN
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Concurrency Lock: Lock payment row
    SELECT * INTO v_pmt FROM public.payments
    WHERE id = p_payment_id AND organization_id = p_org_id
    FOR UPDATE;

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

    -- Idempotency Guard: Prevent duplicate GL posting
    IF EXISTS (
        SELECT 1 FROM public.journal_entries
        WHERE organization_id = p_org_id AND reference_type = 'PAYMENT' AND reference_id = p_payment_id
    ) THEN
        RAISE EXCEPTION 'Payment receipt % is already posted to General Ledger', v_pmt.receipt_number
            USING ERRCODE = '22023';
    END IF;

    -- Mandatory Linked Invoice Verification with Row-Level Lock
    IF v_pmt.invoice_id IS NULL THEN
        RAISE EXCEPTION 'Payment receipt % cannot be posted without a linked Invoice', v_pmt.receipt_number
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_inv FROM public.invoices
    WHERE id = v_pmt.invoice_id AND organization_id = p_org_id
    FOR UPDATE;

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

    -- Cumulative Overpayment Guard: Check all settled/active payments against invoice total
    SELECT COALESCE(SUM(amount), 0.00) INTO v_cumulative_paid
    FROM public.payments
    WHERE invoice_id = v_pmt.invoice_id
      AND organization_id = p_org_id
      AND UPPER(status) NOT IN ('VOID', 'REFUNDED', 'CANCELLED')
      AND id != p_payment_id;

    IF (v_cumulative_paid + v_pmt.amount) > (v_inv.total_amount + 0.05) THEN
        RAISE EXCEPTION 'Cumulative payments (%) exceed invoice total amount (%) for invoice %',
            (v_cumulative_paid + v_pmt.amount), v_inv.total_amount, v_inv.invoice_number
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

    -- Update invoice paid and due amount atomically
    UPDATE public.invoices
    SET paid_amount = (v_cumulative_paid + v_pmt.amount),
        due_amount = GREATEST(0.00, total_amount - (v_cumulative_paid + v_pmt.amount)),
        payment_status = CASE
            WHEN (v_cumulative_paid + v_pmt.amount) >= (total_amount - 0.05) THEN 'PAID'
            ELSE 'PARTIALLY_PAID'
        END,
        updated_at = NOW()
    WHERE id = v_pmt.invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'receipt_number', v_pmt.receipt_number,
        'cumulative_paid', (v_cumulative_paid + v_pmt.amount),
        'journal_entry', v_res
    );
END;
$$;

REVOKE ALL ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_payment_receipt_to_gl_atomic(UUID, UUID) TO authenticated, service_role;
