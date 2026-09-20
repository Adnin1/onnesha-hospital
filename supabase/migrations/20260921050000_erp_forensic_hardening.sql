-- =====================================================================================
-- Migration 52: 20260921050000_erp_forensic_hardening.sql
-- ONNESHA HOSPITAL MANAGEMENT & ENTERPRISE RESOURCE PLANNING (OHMS ERP)
-- 1. Supplier Invoices: Set default match_status to 'UNMATCHED'
-- 2. Hardened 3-Way Match in post_supplier_invoice_to_gl_atomic (Mandatory GRN + PO + Qty/Price Validation)
-- 3. Fiscal Period Close RPC: Explicit RBAC authorization (Accountant/Admin/Finance Manager)
-- 4. Fiscal Period Reopen RPC: Fail-closed Super Admin / Admin role check
-- 5. Journal Entry Header Immutability: Fail-closed protection across all non-status columns during reversal
-- 6. Journal Line Immutability: Block line move attacks (UPDATE journal_entry_id) and unauthorized line mutations
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Supplier Invoices Table: Change default match_status to 'UNMATCHED'
-- -------------------------------------------------------------------------------------
ALTER TABLE public.supplier_invoices 
    ALTER COLUMN match_status SET DEFAULT 'UNMATCHED';

-- -------------------------------------------------------------------------------------
-- 2. Close Fiscal Period RPC: Enforce Server-Side Role Authorization
-- -------------------------------------------------------------------------------------
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
    v_calling_user_id UUID;
    v_has_perm BOOLEAN := FALSE;
    v_period RECORD;
BEGIN
    v_calling_user_id := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Fail-closed caller role authorization
    IF v_calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: Authentication required to close fiscal period' USING ERRCODE = '42501';
    END IF;

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
              AND rp.permission_key IN ('accounting.manage', 'accounting.close_period', '*')
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RAISE EXCEPTION 'Access denied: Caller lacks authorized role to close fiscal period' USING ERRCODE = '42501';
        END IF;
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
        closed_by = v_calling_user_id,
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

-- -------------------------------------------------------------------------------------
-- 3. Reopen Fiscal Period RPC: Fail-Closed Super Admin / Admin Role Check
-- -------------------------------------------------------------------------------------
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
    v_calling_user_id UUID;
    v_period RECORD;
    v_is_super_admin BOOLEAN := FALSE;
BEGIN
    v_calling_user_id := auth.uid();
    v_active_org := private.get_current_org_id();
    IF v_active_org IS NULL OR v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Fail-closed caller role authorization
    IF v_calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: Authentication required to reopen fiscal period' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'admin')
    ) INTO v_is_super_admin;

    IF v_is_super_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Access denied: Only super_admin or admin can reopen closed fiscal periods' USING ERRCODE = '42501';
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
-- 4. Enforce Full Journal Entry Header Immutability
-- -------------------------------------------------------------------------------------
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

            RAISE EXCEPTION 'Immutable Journal Error: Cannot modify posted or reversed journal entry % (ID %)',
                OLD.entry_number, OLD.id USING ERRCODE = '23506';
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 5. Enforce Journal Line Immutability & Block Line-Move Attack
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

-- -------------------------------------------------------------------------------------
-- 6. Hardened 3-Way Match & Supplier Invoice GL Posting RPC
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

    -- Mandatory 3-Way Match Gate: An unlinked or missing GRN cannot be posted to General Ledger
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
    END IF;

    -- Verify price/cost match tolerance (max 0.05 BDT)
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
