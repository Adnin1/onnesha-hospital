-- =====================================================================================
-- Migration: 20260922160000_strict_cumulative_3way_match_and_erp_hardening.sql
-- Description:
--   1. Enforce STRICT Mandatory Line-Level 3-Way Match in post_supplier_invoice_to_gl_atomic:
--      - Zero-line aggregate fallback is PERMANENTLY REMOVED. Invoices with 0 lines fail closed.
--      - Every line must map to a valid PO line item.
--      - Cumulative PO quantity consumption across multiple invoices is strictly enforced:
--        (already_invoiced_qty + current_invoice_qty <= ordered_qty AND <= received_qty).
--      - Cumulative GRN quantity consumption is strictly enforced.
--      - Concurrent race-condition locking with PERFORM ... FOR UPDATE on PO lines and GRN lines.
--      - Header mathematical reconciliation: subtotal + tax_amount == total_amount (within 0.05 tolerance).
--   2. Add not-null constraint assertion on po_item_id in supplier_invoice_items.
-- =====================================================================================

-- Enforce po_item_id NOT NULL for strict 3-way match traceability
ALTER TABLE public.supplier_invoice_items
    ALTER COLUMN po_item_id SET NOT NULL;

-- -------------------------------------------------------------------------------------
-- Hardened Strict & Cumulative post_supplier_invoice_to_gl_atomic
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
    v_already_invoiced_qty INT := 0;
    v_already_invoiced_grn_qty INT := 0;
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

    -- Header Mathematical Reconciliation Invariant: subtotal + tax_amount == total_amount
    IF ABS((v_sinv.subtotal + v_sinv.tax_amount) - v_sinv.total_amount) > 0.05 THEN
        UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
        RAISE EXCEPTION 'Supplier invoice % header calculation discrepancy: subtotal (%) + tax (%) != total (%)',
            v_sinv.supplier_invoice_number, v_sinv.subtotal, v_sinv.tax_amount, v_sinv.total_amount USING ERRCODE = '22023';
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

    -- Lock all PO lines and GRN lines to prevent concurrent consumption races
    PERFORM 1 FROM public.purchase_order_items
    WHERE purchase_order_id = v_sinv.purchase_order_id
    FOR UPDATE;

    PERFORM 1 FROM public.goods_receipt_items
    WHERE grn_id = v_sinv.grn_id
    FOR UPDATE;

    -- ---------------------------------------------------------------------------------
    -- Mandatory Component 3: STRICT Line-Level Invariant (Zero-Line Bypass REMOVED)
    -- ---------------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_items_count
    FROM public.supplier_invoice_items
    WHERE supplier_invoice_id = p_supplier_invoice_id;

    IF v_items_count = 0 THEN
        UPDATE public.supplier_invoices SET match_status = 'UNMATCHED', updated_at = NOW() WHERE id = p_supplier_invoice_id;
        RAISE EXCEPTION '3-Way Match Strict Invariant Error: Supplier invoice % has 0 line items. True 3-way match strictly forbids header-only aggregate posting. Granular invoice line items mapping to PO and GRN lines are required.',
            v_sinv.supplier_invoice_number USING ERRCODE = '22023';
    END IF;

    -- Iterate through each invoice line item and perform strict multi-document verification
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

        -- 1. PO Line Item Verification
        SELECT * INTO v_poi FROM public.purchase_order_items
        WHERE id = v_item.po_item_id AND purchase_order_id = v_sinv.purchase_order_id;

        IF v_poi.id IS NULL THEN
            UPDATE public.supplier_invoices SET match_status = 'UNMATCHED', updated_at = NOW() WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: PO line item % does not exist in linked PO %',
                v_item.po_item_id, v_sinv.purchase_order_id USING ERRCODE = '22023';
        END IF;

        -- Medicine / Item match
        IF v_item.medicine_id IS NOT NULL AND v_poi.medicine_id IS NOT NULL AND v_item.medicine_id != v_poi.medicine_id THEN
            UPDATE public.supplier_invoices SET match_status = 'UNMATCHED', updated_at = NOW() WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Invoice line medicine % does not match PO line medicine %',
                v_item.medicine_id, v_poi.medicine_id USING ERRCODE = '22023';
        END IF;

        -- Unit Price Match Tolerance (0.05 BDT)
        IF ABS(v_item.unit_price - v_poi.unit_cost) > 0.05 THEN
            UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Invoiced unit price (%) does not match PO agreed unit cost (%) on PO line %',
                v_item.unit_price, v_poi.unit_cost, v_poi.id USING ERRCODE = '22023';
        END IF;

        -- Cumulative PO Quantity Consumption Check across all previously POSTED invoices
        SELECT COALESCE(SUM(sii_past.quantity_invoiced), 0)
        INTO v_already_invoiced_qty
        FROM public.supplier_invoice_items sii_past
        JOIN public.supplier_invoices si_past ON sii_past.supplier_invoice_id = si_past.id
        WHERE sii_past.po_item_id = v_item.po_item_id
          AND si_past.organization_id = p_org_id
          AND si_past.id != p_supplier_invoice_id
          AND si_past.status = 'POSTED';

        IF (v_already_invoiced_qty + v_item.quantity_invoiced) > v_poi.quantity_ordered THEN
            UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Cumulative invoiced quantity (% + % = %) exceeds PO ordered quantity (%) for PO line %',
                v_already_invoiced_qty, v_item.quantity_invoiced, (v_already_invoiced_qty + v_item.quantity_invoiced),
                v_poi.quantity_ordered, v_poi.id USING ERRCODE = '22023';
        END IF;

        IF (v_already_invoiced_qty + v_item.quantity_invoiced) > v_poi.quantity_received THEN
            UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
            RAISE EXCEPTION '3-Way Match Line Error: Cumulative invoiced quantity (% + % = %) exceeds PO received quantity (%) for PO line %',
                v_already_invoiced_qty, v_item.quantity_invoiced, (v_already_invoiced_qty + v_item.quantity_invoiced),
                v_poi.quantity_received, v_poi.id USING ERRCODE = '22023';
        END IF;

        -- 2. GRN Line Verification (if explicitly linked to GRN item)
        IF v_item.grn_item_id IS NOT NULL THEN
            SELECT * INTO v_gri FROM public.goods_receipt_items
            WHERE id = v_item.grn_item_id AND grn_id = v_sinv.grn_id;

            IF v_gri.id IS NULL THEN
                UPDATE public.supplier_invoices SET match_status = 'UNMATCHED', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: GRN item % does not exist on linked GRN %',
                    v_item.grn_item_id, v_sinv.grn_id USING ERRCODE = '22023';
            END IF;

            -- Cumulative GRN Quantity Consumption Check across all previously POSTED invoices
            SELECT COALESCE(SUM(sii_past.quantity_invoiced), 0)
            INTO v_already_invoiced_grn_qty
            FROM public.supplier_invoice_items sii_past
            JOIN public.supplier_invoices si_past ON sii_past.supplier_invoice_id = si_past.id
            WHERE sii_past.grn_item_id = v_item.grn_item_id
              AND si_past.organization_id = p_org_id
              AND si_past.id != p_supplier_invoice_id
              AND si_past.status = 'POSTED';

            IF (v_already_invoiced_grn_qty + v_item.quantity_invoiced) > v_gri.quantity_received THEN
                UPDATE public.supplier_invoices SET match_status = 'QTY_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
                RAISE EXCEPTION '3-Way Match Line Error: Cumulative invoiced quantity (% + % = %) exceeds GRN received quantity (%) on GRN line %',
                    v_already_invoiced_grn_qty, v_item.quantity_invoiced, (v_already_invoiced_grn_qty + v_item.quantity_invoiced),
                    v_gri.quantity_received, v_gri.id USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;

    -- Check total line subtotal against header subtotal
    IF ABS(v_calculated_subtotal - v_sinv.subtotal) > 0.05 THEN
        UPDATE public.supplier_invoices SET match_status = 'PRICE_DISCREPANCY', updated_at = NOW() WHERE id = p_supplier_invoice_id;
        RAISE EXCEPTION '3-Way Match Error: Sum of invoice lines (%) does not match invoice subtotal (%)',
            v_calculated_subtotal, v_sinv.subtotal USING ERRCODE = '22023';
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
            'description', 'Inventory received via strict 3-way match under invoice ' || v_sinv.supplier_invoice_number || ' (GRN: ' || v_grn.grn_number || ')'
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
        'Strict 3-Way Matched Supplier Invoice ' || v_sinv.supplier_invoice_number || ' (PO: ' || COALESCE(v_po.po_number, 'N/A') || ', GRN: ' || v_grn.grn_number || ')',
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
