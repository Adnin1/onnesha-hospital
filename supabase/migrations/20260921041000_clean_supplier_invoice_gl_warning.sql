-- =====================================================================================
-- Migration 51: 20260921041000_clean_supplier_invoice_gl_warning.sql
-- Clean unused variable warning in post_supplier_invoice_to_gl_atomic
-- =====================================================================================

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
    IF v_sinv.grn_id IS NOT NULL THEN
        SELECT * INTO v_grn FROM public.goods_receipt_notes
        WHERE id = v_sinv.grn_id AND organization_id = p_org_id;

        IF v_grn.id IS NOT NULL AND v_grn.total_received_cost > 0 THEN
            IF ABS(v_grn.total_received_cost - v_sinv.total_amount) > 0.05 THEN
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
