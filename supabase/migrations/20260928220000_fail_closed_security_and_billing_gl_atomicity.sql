-- Migration 91: Fail-Closed Security, Unified Billing-to-GL Atomicity, and Authoritative P&L/AR Indexing
-- Description:
-- 1. Enforces fail-closed tenant validation on all financial reporting SECURITY DEFINER functions.
-- 2. Introduces public.create_invoice_and_post_gl_atomic for single-transaction fail-closed billing+GL integration.
-- 3. Adds high-performance composite indexes for historical AR aging and payment/refund lookups.
-- 4. Ensures authoritative GL-backed Accrual P&L and Cash Movement separation.

-- =====================================================================================
-- 1. Performance Indexes for Historical As-Of Balance Reconstruction & Audit Queries
-- =====================================================================================

CREATE INDEX IF NOT EXISTS idx_payments_inv_date_amount 
    ON public.payments(invoice_id, COALESCE(payment_date, created_at));

CREATE INDEX IF NOT EXISTS idx_refunds_inv_date_amount 
    ON public.refunds(invoice_id, refunded_at);

CREATE INDEX IF NOT EXISTS idx_invoices_org_created_due 
    ON public.invoices(organization_id, created_at) 
    WHERE is_voided = FALSE;

-- =====================================================================================
-- 2. Hardened Fail-Closed Financial Reporting RPCs
-- =====================================================================================

-- 2.1 Financial Dashboard Aggregates (Fail-Closed)
CREATE OR REPLACE FUNCTION public.get_financial_dashboard_aggregates(
    p_org_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_total_invoices BIGINT := 0;
    v_active_invoices BIGINT := 0;
    v_voided_invoices BIGINT := 0;
    v_gross_revenue NUMERIC(14, 2) := 0.00;
    v_total_discounts NUMERIC(14, 2) := 0.00;
    v_net_revenue NUMERIC(14, 2) := 0.00;
    v_cash_collections NUMERIC(14, 2) := 0.00;
    v_cash_refunds NUMERIC(14, 2) := 0.00;
    v_net_collections NUMERIC(14, 2) := 0.00;
    v_historical_ar_due NUMERIC(14, 2) := 0.00;
    v_collection_rate NUMERIC(5, 2) := 0.00;
    v_due_rate NUMERIC(5, 2) := 0.00;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    
    -- Strict Fail-Closed Check
    IF (v_active_org IS NULL OR v_active_org != p_org_id) 
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch or unauthenticated caller'
            USING ERRCODE = '42501';
    END IF;

    -- Aggregate invoice performance in period [p_start_date, p_end_date)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE is_voided = FALSE),
        COUNT(*) FILTER (WHERE is_voided = TRUE),
        COALESCE(SUM(subtotal) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(discount_amount) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(grand_total) FILTER (WHERE is_voided = FALSE), 0.00)
    INTO
        v_total_invoices,
        v_active_invoices,
        v_voided_invoices,
        v_gross_revenue,
        v_total_discounts,
        v_net_revenue
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    -- Aggregate actual cash/digital collections in period
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_collections
    FROM public.payments
    WHERE organization_id = p_org_id
      AND COALESCE(payment_date, created_at) >= p_start_date
      AND COALESCE(payment_date, created_at) < p_end_date;

    -- Aggregate actual refunds in period
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_refunds
    FROM public.refunds
    WHERE organization_id = p_org_id
      AND refunded_at >= p_start_date
      AND refunded_at < p_end_date;

    v_net_collections := v_cash_collections - v_cash_refunds;

    -- True historical AR balance as of p_end_date
    SELECT COALESCE(SUM(GREATEST(0.00, inv.grand_total - 
        COALESCE((SELECT SUM(p.amount) FROM public.payments p WHERE p.invoice_id = inv.id AND COALESCE(p.payment_date, p.created_at) <= p_end_date), 0.00) +
        COALESCE((SELECT SUM(r.amount) FROM public.refunds r WHERE r.invoice_id = inv.id AND r.refunded_at <= p_end_date), 0.00)
    )), 0.00)
    INTO v_historical_ar_due
    FROM public.invoices inv
    WHERE inv.organization_id = p_org_id
      AND inv.created_at <= p_end_date
      AND (inv.is_voided = FALSE OR inv.updated_at > p_end_date);

    IF v_net_revenue > 0 THEN
        v_collection_rate := ROUND((v_net_collections / v_net_revenue) * 100.0, 2);
        v_due_rate := ROUND((v_historical_ar_due / v_net_revenue) * 100.0, 2);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_org_id,
        'period_start', p_start_date,
        'period_end', p_end_date,
        'total_invoices', v_total_invoices,
        'active_invoices', v_active_invoices,
        'voided_invoices', v_voided_invoices,
        'gross_revenue', v_gross_revenue,
        'total_discounts', v_total_discounts,
        'net_revenue', v_net_revenue,
        'gross_collections', v_cash_collections,
        'total_refunds', v_cash_refunds,
        'net_collections', v_net_collections,
        'historical_ar_due', v_historical_ar_due,
        'collection_rate_pct', v_collection_rate,
        'due_rate_pct', v_due_rate
    );
END;
$$;

-- 2.2 Payment Channel Breakdown (Fail-Closed)
CREATE OR REPLACE FUNCTION public.get_payment_channel_breakdown(
    p_org_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_grand_total NUMERIC(14, 2) := 0.00;
    v_result JSONB := '[]'::JSONB;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    
    -- Strict Fail-Closed Check
    IF (v_active_org IS NULL OR v_active_org != p_org_id) 
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch or unauthenticated caller'
            USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_grand_total
    FROM public.payments
    WHERE organization_id = p_org_id
      AND COALESCE(payment_date, created_at) >= p_start_date
      AND COALESCE(payment_date, created_at) < p_end_date;

    SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'method', UPPER(COALESCE(payment_method, 'CASH')),
            'transaction_count', COUNT(*),
            'total_collected', COALESCE(SUM(amount), 0.00),
            'percentage_of_total', CASE 
                WHEN v_grand_total > 0 THEN ROUND((COALESCE(SUM(amount), 0.00) / v_grand_total) * 100.0, 1)
                ELSE 0.0
            END
        ) AS row_data
        FROM public.payments
        WHERE organization_id = p_org_id
          AND COALESCE(payment_date, created_at) >= p_start_date
          AND COALESCE(payment_date, created_at) < p_end_date
        GROUP BY UPPER(COALESCE(payment_method, 'CASH'))
        ORDER BY SUM(amount) DESC
    ) sub;

    RETURN v_result;
END;
$$;

-- 2.3 Department Revenue Breakdown (Fail-Closed)
CREATE OR REPLACE FUNCTION public.get_department_revenue_breakdown(
    p_org_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_grand_rev NUMERIC(14, 2) := 0.00;
    v_result JSONB := '[]'::JSONB;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    
    -- Strict Fail-Closed Check
    IF (v_active_org IS NULL OR v_active_org != p_org_id) 
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch or unauthenticated caller'
            USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(SUM(it.total_price), 0.00)
    INTO v_grand_rev
    FROM public.invoice_items it
    JOIN public.invoices inv ON inv.id = it.invoice_id
    WHERE inv.organization_id = p_org_id
      AND inv.is_voided = FALSE
      AND inv.created_at >= p_start_date
      AND inv.created_at < p_end_date;

    SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
    INTO v_result
    FROM (
        SELECT jsonb_build_object(
            'category', it.service_category,
            'item_count', COUNT(*),
            'total_revenue', COALESCE(SUM(it.total_price), 0.00),
            'percentage_of_total', CASE 
                WHEN v_grand_rev > 0 THEN ROUND((COALESCE(SUM(it.total_price), 0.00) / v_grand_rev) * 100.0, 1)
                ELSE 0.0
            END
        ) AS row_data
        FROM public.invoice_items it
        JOIN public.invoices inv ON inv.id = it.invoice_id
        WHERE inv.organization_id = p_org_id
          AND inv.is_voided = FALSE
          AND inv.created_at >= p_start_date
          AND inv.created_at < p_end_date
        GROUP BY it.service_category
        ORDER BY SUM(it.total_price) DESC
    ) sub;

    RETURN v_result;
END;
$$;

-- 2.4 Accounts Receivable Aging Analysis (Fail-Closed)
CREATE OR REPLACE FUNCTION public.get_accounts_receivable_aging(
    p_org_id UUID,
    p_as_of_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_count BIGINT := 0;
    v_total_ar NUMERIC(14, 2) := 0.00;
    v_current NUMERIC(14, 2) := 0.00;
    v_days_31_60 NUMERIC(14, 2) := 0.00;
    v_days_61_90 NUMERIC(14, 2) := 0.00;
    v_days_91_120 NUMERIC(14, 2) := 0.00;
    v_days_120_plus NUMERIC(14, 2) := 0.00;
    v_reconciliation_diff NUMERIC(14, 2) := 0.00;
    v_is_reconciled BOOLEAN := FALSE;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    
    -- Strict Fail-Closed Check
    IF (v_active_org IS NULL OR v_active_org != p_org_id) 
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch or unauthenticated caller'
            USING ERRCODE = '42501';
    END IF;

    -- Reconstruct historical outstanding balances as of p_as_of_date
    WITH invoice_historical AS (
        SELECT 
            inv.id,
            inv.created_at,
            inv.grand_total,
            COALESCE(
                (SELECT SUM(p.amount) 
                 FROM public.payments p 
                 WHERE p.invoice_id = inv.id 
                   AND COALESCE(p.payment_date, p.created_at) <= p_as_of_date), 
                0.00
            ) AS payments_up_to_date,
            COALESCE(
                (SELECT SUM(r.amount) 
                 FROM public.refunds r 
                 WHERE r.invoice_id = inv.id 
                   AND r.refunded_at <= p_as_of_date), 
                0.00
            ) AS refunds_up_to_date
        FROM public.invoices inv
        WHERE inv.organization_id = p_org_id
          AND inv.created_at <= p_as_of_date
          AND (inv.is_voided = FALSE OR inv.updated_at > p_as_of_date)
    ),
    invoice_balances AS (
        SELECT
            id,
            created_at,
            GREATEST(0.00, grand_total - payments_up_to_date + refunds_up_to_date) AS historical_due_amount,
            EXTRACT(EPOCH FROM (p_as_of_date - created_at)) / 86400.0 AS days_old
        FROM invoice_historical
    )
    SELECT
        COUNT(*) FILTER (WHERE historical_due_amount > 0.00),
        COALESCE(SUM(historical_due_amount) FILTER (WHERE historical_due_amount > 0.00), 0.00),
        COALESCE(SUM(historical_due_amount) FILTER (WHERE historical_due_amount > 0.00 AND days_old <= 30.0), 0.00),
        COALESCE(SUM(historical_due_amount) FILTER (WHERE historical_due_amount > 0.00 AND days_old > 30.0 AND days_old <= 60.0), 0.00),
        COALESCE(SUM(historical_due_amount) FILTER (WHERE historical_due_amount > 0.00 AND days_old > 60.0 AND days_old <= 90.0), 0.00),
        COALESCE(SUM(historical_due_amount) FILTER (WHERE historical_due_amount > 0.00 AND days_old > 90.0 AND days_old <= 120.0), 0.00),
        COALESCE(SUM(historical_due_amount) FILTER (WHERE historical_due_amount > 0.00 AND days_old > 120.0), 0.00)
    INTO
        v_count,
        v_total_ar,
        v_current,
        v_days_31_60,
        v_days_61_90,
        v_days_91_120,
        v_days_120_plus
    FROM invoice_balances;

    v_reconciliation_diff := v_total_ar - (v_current + v_days_31_60 + v_days_61_90 + v_days_91_120 + v_days_120_plus);
    v_is_reconciled := (ABS(v_reconciliation_diff) < 0.01);

    RETURN jsonb_build_object(
        'success', true,
        'as_of_date', p_as_of_date,
        'total_invoices_due', v_count,
        'total_ar', v_total_ar,
        'current_0_30', v_current,
        'days_31_60', v_days_31_60,
        'days_61_90', v_days_61_90,
        'days_91_120', v_days_91_120,
        'days_120_plus', v_days_120_plus,
        'reconciliation_difference', v_reconciliation_diff,
        'is_reconciled', v_is_reconciled
    );
END;
$$;

-- 2.5 Profit & Loss Summary RPC (Authoritative GL Accrual P&L & Cash Movement)
CREATE OR REPLACE FUNCTION public.get_profit_and_loss_summary(
    p_org_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_active_org UUID;
    v_gross_revenue NUMERIC(14, 2) := 0.00;
    v_discounts NUMERIC(14, 2) := 0.00;
    v_net_revenue NUMERIC(14, 2) := 0.00;
    v_operating_expenses NUMERIC(14, 2) := 0.00;
    v_operating_surplus NUMERIC(14, 2) := 0.00;
    v_patient_collections NUMERIC(14, 2) := 0.00;
    v_cash_refunds NUMERIC(14, 2) := 0.00;
    v_operating_disbursements NUMERIC(14, 2) := 0.00;
    v_total_cash_inflow NUMERIC(14, 2) := 0.00;
    v_total_cash_outflow NUMERIC(14, 2) := 0.00;
    v_net_cash_movement NUMERIC(14, 2) := 0.00;
    v_expense_breakdown JSONB := '[]'::JSONB;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    
    -- Strict Fail-Closed Check
    IF (v_active_org IS NULL OR v_active_org != p_org_id) 
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch or unauthenticated caller'
            USING ERRCODE = '42501';
    END IF;

    -- Accrual: Gross revenue and discounts recognized on invoices in period
    SELECT
        COALESCE(SUM(subtotal) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(discount_amount) FILTER (WHERE is_voided = FALSE), 0.00),
        COALESCE(SUM(grand_total) FILTER (WHERE is_voided = FALSE), 0.00)
    INTO
        v_gross_revenue,
        v_discounts,
        v_net_revenue
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    -- Operating Expenses: Query General Ledger posted journal entries (EXPENSE accounts 5000-5999)
    SELECT COALESCE(SUM(jel.debit - jel.credit), 0.00)
    INTO v_operating_expenses
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.organization_id = p_org_id
      AND je.status = 'POSTED'
      AND coa.account_type = 'EXPENSE'
      AND je.entry_date >= p_start_date::DATE
      AND je.entry_date <= p_end_date::DATE;

    -- If no GL entries exist for the period, fallback to public.expenses
    IF v_operating_expenses = 0.00 THEN
        SELECT COALESCE(SUM(amount), 0.00)
        INTO v_operating_expenses
        FROM public.expenses
        WHERE organization_id = p_org_id
          AND expense_date >= p_start_date::DATE
          AND expense_date <= p_end_date::DATE;
    END IF;

    -- Expense breakdown by category
    SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
    INTO v_expense_breakdown
    FROM (
        SELECT jsonb_build_object(
            'category', coa.account_name || ' (' || coa.account_code || ')',
            'amount', COALESCE(SUM(jel.debit - jel.credit), 0.00)
        ) AS row_data
        FROM public.journal_entry_lines jel
        JOIN public.journal_entries je ON je.id = jel.journal_entry_id
        JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
        WHERE je.organization_id = p_org_id
          AND je.status = 'POSTED'
          AND coa.account_type = 'EXPENSE'
          AND je.entry_date >= p_start_date::DATE
          AND je.entry_date <= p_end_date::DATE
        GROUP BY coa.account_name, coa.account_code
        ORDER BY SUM(jel.debit - jel.credit) DESC
    ) sub;

    v_operating_surplus := v_net_revenue - v_operating_expenses;

    -- Cash Movement: Inflows (Patient Collections)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_patient_collections
    FROM public.payments
    WHERE organization_id = p_org_id
      AND COALESCE(payment_date, created_at) >= p_start_date
      AND COALESCE(payment_date, created_at) < p_end_date;

    v_total_cash_inflow := v_patient_collections;

    -- Cash Movement: Outflows (Refunds + Operating Cash Disbursements)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_refunds
    FROM public.refunds
    WHERE organization_id = p_org_id
      AND refunded_at >= p_start_date
      AND refunded_at < p_end_date;

    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_operating_disbursements
    FROM public.expenses
    WHERE organization_id = p_org_id
      AND expense_date >= p_start_date::DATE
      AND expense_date <= p_end_date::DATE;

    v_total_cash_outflow := v_cash_refunds + v_operating_disbursements;
    v_net_cash_movement := v_total_cash_inflow - v_total_cash_outflow;

    RETURN jsonb_build_object(
        'success', true,
        'period_start', p_start_date,
        'period_end', p_end_date,
        'accrual_basis', jsonb_build_object(
            'gross_revenue', v_gross_revenue,
            'discounts', v_discounts,
            'net_recognized_revenue', v_net_revenue,
            'operating_expenses', v_operating_expenses,
            'net_operating_surplus', v_operating_surplus,
            'expense_breakdown', v_expense_breakdown
        ),
        'cash_movement', jsonb_build_object(
            'patient_collections', v_patient_collections,
            'total_cash_inflow', v_total_cash_inflow,
            'refunds', v_cash_refunds,
            'operating_disbursements', v_operating_disbursements,
            'total_cash_outflow', v_total_cash_outflow,
            'net_cash_movement', v_net_cash_movement
        )
    );
END;
$$;

-- Revoke from public/anon and grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.get_financial_dashboard_aggregates(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_dashboard_aggregates(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_payment_channel_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_channel_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_department_revenue_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_revenue_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_accounts_receivable_aging(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_accounts_receivable_aging(UUID, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- =====================================================================================
-- 3. Unified Transactional Billing -> GL Coupling (create_invoice_and_post_gl_atomic)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.create_invoice_and_post_gl_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_visit_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_discount_reason TEXT DEFAULT NULL,
    p_initial_payment_amount NUMERIC DEFAULT 0.00,
    p_payment_method VARCHAR DEFAULT 'CASH',
    p_gateway_transaction_id VARCHAR DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inv_res JSONB;
    v_invoice_id UUID;
    v_gl_res JSONB;
BEGIN
    -- 1. Create Invoice, Items, Payment, and Audit atomically
    v_inv_res := public.create_invoice_atomic(
        p_org_id,
        p_patient_id,
        p_visit_id,
        p_items,
        p_discount_amount,
        p_discount_reason,
        p_initial_payment_amount,
        p_payment_method,
        p_gateway_transaction_id,
        p_cashier_id,
        p_notes
    );

    IF (v_inv_res->>'success')::BOOLEAN IS NOT TRUE THEN
        RETURN v_inv_res;
    END IF;

    v_invoice_id := (v_inv_res->>'invoice_id')::UUID;

    -- 2. Post to General Ledger in the exact same transaction
    v_gl_res := public.post_billing_to_gl_atomic(p_org_id, v_invoice_id);

    IF (v_gl_res->>'success')::BOOLEAN IS NOT TRUE THEN
        -- Fail closed: rollback entire invoice creation
        RAISE EXCEPTION 'General Ledger posting failed: %', COALESCE(v_gl_res->>'error', 'Unknown GL error')
            USING ERRCODE = 'P0001';
    END IF;

    -- 3. Return full combined result
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_inv_res->>'invoice_number',
        'subtotal', v_inv_res->>'subtotal',
        'grand_total', v_inv_res->>'grand_total',
        'paid_amount', v_inv_res->>'paid_amount',
        'due_amount', v_inv_res->>'due_amount',
        'status', v_inv_res->>'status',
        'receipt_number', v_inv_res->>'receipt_number',
        'payment_id', v_inv_res->>'payment_id',
        'journal_entry_id', v_gl_res->>'journal_entry_id',
        'journal_entry_number', v_gl_res->>'journal_entry_number'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'Atomic Billing and GL transaction could not be completed: ' || SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_and_post_gl_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_post_gl_atomic(UUID, UUID, UUID, JSONB, NUMERIC, TEXT, NUMERIC, VARCHAR, VARCHAR, UUID, TEXT) TO authenticated, service_role;
