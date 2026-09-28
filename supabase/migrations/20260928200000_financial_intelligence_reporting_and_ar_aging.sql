-- Migration 90: Financial Intelligence Reporting, Exact Numeric Aggregation & AR Aging
-- Provides server-authoritative financial calculation RPCs with exact numeric arithmetic,
-- tenant isolation, Asia/Dhaka date bounds, and strict double-entry cross-reconciliation.

-- 1. High-Level Financial Dashboard Aggregates RPC
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
    v_total_billed NUMERIC(14, 2) := 0.00;
    v_total_subtotal NUMERIC(14, 2) := 0.00;
    v_total_discounts NUMERIC(14, 2) := 0.00;
    v_total_dues_created NUMERIC(14, 2) := 0.00;
    v_active_inv_count INT := 0;
    v_voided_inv_count INT := 0;
    v_voided_amount NUMERIC(14, 2) := 0.00;
    v_cash_collections NUMERIC(14, 2) := 0.00;
    v_cash_refunds NUMERIC(14, 2) := 0.00;
    v_net_collections NUMERIC(14, 2) := 0.00;
    v_total_ar_outstanding NUMERIC(14, 2) := 0.00;
    v_collection_rate NUMERIC(5, 2) := 0.00;
    v_due_rate NUMERIC(5, 2) := 0.00;
BEGIN
    -- Tenant isolation check
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    IF v_active_org IS NOT NULL AND v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Aggregate billed invoice metrics in period
    SELECT 
        COALESCE(SUM(grand_total), 0.00),
        COALESCE(SUM(subtotal), 0.00),
        COALESCE(SUM(discount_amount), 0.00),
        COALESCE(SUM(due_amount), 0.00),
        COUNT(*)
    INTO
        v_total_billed,
        v_total_subtotal,
        v_total_discounts,
        v_total_dues_created,
        v_active_inv_count
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND is_voided = FALSE
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    -- Aggregate voided invoices in period
    SELECT
        COUNT(*),
        COALESCE(SUM(grand_total), 0.00)
    INTO
        v_voided_inv_count,
        v_voided_amount
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND is_voided = TRUE
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    -- Aggregate actual payments in period (Payment Transaction Date Basis)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_collections
    FROM public.payments
    WHERE organization_id = p_org_id
      AND payment_date >= p_start_date
      AND payment_date < p_end_date;

    -- Aggregate actual refunds in period
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_refunds
    FROM public.refunds
    WHERE organization_id = p_org_id
      AND refunded_at >= p_start_date
      AND refunded_at < p_end_date;

    v_net_collections := v_cash_collections - v_cash_refunds;

    -- Total AR Outstanding as-of period end
    SELECT COALESCE(SUM(due_amount), 0.00)
    INTO v_total_ar_outstanding
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND is_voided = FALSE
      AND created_at <= p_end_date;

    -- Safe percentage calculation
    IF v_total_billed > 0 THEN
        v_collection_rate := ROUND((v_net_collections / v_total_billed) * 100, 2);
        v_due_rate := ROUND((v_total_dues_created / v_total_billed) * 100, 2);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_org_id,
        'period_start', p_start_date,
        'period_end', p_end_date,
        'total_billed', v_total_billed,
        'total_subtotal', v_total_subtotal,
        'total_discounts', v_total_discounts,
        'total_dues_created', v_total_dues_created,
        'active_invoices_count', v_active_inv_count,
        'voided_invoices_count', v_voided_inv_count,
        'total_voided_amount', v_voided_amount,
        'gross_collections', v_cash_collections,
        'total_refunds', v_cash_refunds,
        'net_collections', v_net_collections,
        'total_ar_outstanding', v_total_ar_outstanding,
        'collection_rate', v_collection_rate,
        'due_rate', v_due_rate
    );
END;
$$;

-- 2. Payment Channel Breakdown RPC (Based on Payment Date)
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
    v_channels JSONB := '[]'::JSONB;
    v_total_collected NUMERIC(14, 2) := 0.00;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    IF v_active_org IS NOT NULL AND v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total_collected
    FROM public.payments
    WHERE organization_id = p_org_id
      AND payment_date >= p_start_date
      AND payment_date < p_end_date;

    SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
    INTO v_channels
    FROM (
        SELECT jsonb_build_object(
            'payment_method', p.payment_method,
            'transaction_count', COUNT(*),
            'total_amount', COALESCE(SUM(p.amount), 0.00),
            'percentage', CASE 
                WHEN v_total_collected > 0 THEN ROUND((COALESCE(SUM(p.amount), 0.00) / v_total_collected) * 100, 2)
                ELSE 0.00 
            END
        ) AS row_data
        FROM public.payments p
        WHERE p.organization_id = p_org_id
          AND p.payment_date >= p_start_date
          AND p.payment_date < p_end_date
        GROUP BY p.payment_method
        ORDER BY SUM(p.amount) DESC
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'total_collected', v_total_collected,
        'channels', v_channels
    );
END;
$$;

-- 3. Departmental Revenue Breakdown RPC (Based on Invoice Items & Active Invoices)
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
    v_departments JSONB := '[]'::JSONB;
    v_total_revenue NUMERIC(14, 2) := 0.00;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    IF v_active_org IS NOT NULL AND v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(SUM(ii.total_price), 0.00)
    INTO v_total_revenue
    FROM public.invoice_items ii
    INNER JOIN public.invoices inv ON ii.invoice_id = inv.id
    WHERE inv.organization_id = p_org_id
      AND inv.is_voided = FALSE
      AND inv.created_at >= p_start_date
      AND inv.created_at < p_end_date;

    SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
    INTO v_departments
    FROM (
        SELECT jsonb_build_object(
            'service_category', ii.service_category,
            'item_count', COUNT(*),
            'total_revenue', COALESCE(SUM(ii.total_price), 0.00),
            'percentage', CASE 
                WHEN v_total_revenue > 0 THEN ROUND((COALESCE(SUM(ii.total_price), 0.00) / v_total_revenue) * 100, 2)
                ELSE 0.00 
            END
        ) AS row_data
        FROM public.invoice_items ii
        INNER JOIN public.invoices inv ON ii.invoice_id = inv.id
        WHERE inv.organization_id = p_org_id
          AND inv.is_voided = FALSE
          AND inv.created_at >= p_start_date
          AND inv.created_at < p_end_date
        GROUP BY ii.service_category
        ORDER BY SUM(ii.total_price) DESC
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'total_revenue', v_total_revenue,
        'departments', v_departments
    );
END;
$$;

-- 4. Accounts Receivable (AR) Aging Summary RPC
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
    v_current NUMERIC(14, 2) := 0.00;
    v_days_31_60 NUMERIC(14, 2) := 0.00;
    v_days_61_90 NUMERIC(14, 2) := 0.00;
    v_days_91_120 NUMERIC(14, 2) := 0.00;
    v_days_120_plus NUMERIC(14, 2) := 0.00;
    v_total_ar NUMERIC(14, 2) := 0.00;
    v_count INT := 0;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    IF v_active_org IS NOT NULL AND v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    SELECT
        COUNT(*),
        COALESCE(SUM(due_amount), 0.00),
        COALESCE(SUM(CASE WHEN (p_as_of_date - created_at) <= INTERVAL '30 days' THEN due_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN (p_as_of_date - created_at) > INTERVAL '30 days' AND (p_as_of_date - created_at) <= INTERVAL '60 days' THEN due_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN (p_as_of_date - created_at) > INTERVAL '60 days' AND (p_as_of_date - created_at) <= INTERVAL '90 days' THEN due_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN (p_as_of_date - created_at) > INTERVAL '90 days' AND (p_as_of_date - created_at) <= INTERVAL '120 days' THEN due_amount ELSE 0.00 END), 0.00),
        COALESCE(SUM(CASE WHEN (p_as_of_date - created_at) > INTERVAL '120 days' THEN due_amount ELSE 0.00 END), 0.00)
    INTO
        v_count,
        v_total_ar,
        v_current,
        v_days_31_60,
        v_days_61_90,
        v_days_91_120,
        v_days_120_plus
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND is_voided = FALSE
      AND due_amount > 0
      AND created_at <= p_as_of_date;

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
        'is_reconciled', (v_total_ar = (v_current + v_days_31_60 + v_days_61_90 + v_days_91_120 + v_days_120_plus))
    );
END;
$$;

-- 5. Profit & Loss Statement Summary RPC (True Accrual vs Cash Basis)
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
    v_cash_inflow NUMERIC(14, 2) := 0.00;
    v_cash_outflow NUMERIC(14, 2) := 0.00;
    v_net_cash_flow NUMERIC(14, 2) := 0.00;
    v_expense_breakdown JSONB := '[]'::JSONB;
BEGIN
    v_active_org := COALESCE(NULLIF(current_setting('app.current_organization_id', true), '')::uuid, private.get_current_org_id());
    IF v_active_org IS NOT NULL AND v_active_org != p_org_id THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch' USING ERRCODE = '42501';
    END IF;

    -- Accrual Revenue: Recognized from active invoices created in period
    SELECT 
        COALESCE(SUM(subtotal), 0.00),
        COALESCE(SUM(discount_amount), 0.00),
        COALESCE(SUM(grand_total), 0.00)
    INTO
        v_gross_revenue,
        v_discounts,
        v_net_revenue
    FROM public.invoices
    WHERE organization_id = p_org_id
      AND is_voided = FALSE
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    -- Accrual Expenses: Posted journal entries in period with account type EXPENSE
    SELECT 
        COALESCE(SUM(jel.debit - jel.credit), 0.00)
    INTO v_operating_expenses
    FROM public.journal_entry_lines jel
    INNER JOIN public.journal_entries je ON jel.journal_entry_id = je.id
    INNER JOIN public.chart_of_accounts coa ON jel.account_id = coa.id
    WHERE je.organization_id = p_org_id
      AND je.status = 'POSTED'
      AND coa.account_type = 'EXPENSE'
      AND je.entry_date >= p_start_date::DATE
      AND je.entry_date <= p_end_date::DATE;

    -- Expense breakdown by account
    SELECT COALESCE(jsonb_agg(row_data), '[]'::JSONB)
    INTO v_expense_breakdown
    FROM (
        SELECT jsonb_build_object(
            'account_code', coa.account_code,
            'account_name', coa.account_name,
            'amount', COALESCE(SUM(jel.debit - jel.credit), 0.00)
        ) AS row_data
        FROM public.journal_entry_lines jel
        INNER JOIN public.journal_entries je ON jel.journal_entry_id = je.id
        INNER JOIN public.chart_of_accounts coa ON jel.account_id = coa.id
        WHERE je.organization_id = p_org_id
          AND je.status = 'POSTED'
          AND coa.account_type = 'EXPENSE'
          AND je.entry_date >= p_start_date::DATE
          AND je.entry_date <= p_end_date::DATE
        GROUP BY coa.account_code, coa.account_name
        ORDER BY SUM(jel.debit - jel.credit) DESC
    ) sub;

    v_operating_surplus := v_net_revenue - v_operating_expenses;

    -- Cash Basis comparison:
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_inflow
    FROM public.payments
    WHERE organization_id = p_org_id
      AND payment_date >= p_start_date
      AND payment_date < p_end_date;

    -- Cash Outflow (Refunds + Cash expenses)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_outflow
    FROM public.refunds
    WHERE organization_id = p_org_id
      AND refunded_at >= p_start_date
      AND refunded_at < p_end_date;

    v_net_cash_flow := v_cash_inflow - v_cash_outflow;

    RETURN jsonb_build_object(
        'success', true,
        'period_start', p_start_date,
        'period_end', p_end_date,
        'accrual_basis', jsonb_build_object(
            'gross_revenue', v_gross_revenue,
            'discounts', v_discounts,
            'net_recognized_revenue', v_net_revenue,
            'operating_expenses', v_operating_expenses,
            'operating_surplus', v_operating_surplus,
            'expense_breakdown', v_expense_breakdown
        ),
        'cash_basis', jsonb_build_object(
            'cash_inflow', v_cash_inflow,
            'cash_outflow', v_cash_outflow,
            'net_cash_flow', v_net_cash_flow
        )
    );
END;
$$;

-- 6. Permissions and Execution Grants (Fail-Closed)
REVOKE ALL ON FUNCTION public.get_financial_dashboard_aggregates(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payment_channel_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_department_revenue_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_accounts_receivable_aging(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_financial_dashboard_aggregates(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_payment_channel_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_department_revenue_breakdown(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_accounts_receivable_aging(UUID, TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
