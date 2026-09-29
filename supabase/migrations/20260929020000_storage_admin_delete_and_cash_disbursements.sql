-- Migration 94: Storage Admin Delete RLS Enforcement & Cash Basis Disbursements
-- 1. Hardens storage.objects DELETE policy for medical-documents-vault to require admin role explicitly
-- 2. Corrects get_profit_and_loss_summary cash basis disbursements to reflect Cash & Bank asset account outflows

-- -------------------------------------------------------------------------------------
-- 1. Storage Objects RLS: Admin-Only DELETE Policy Enforcement
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
    v_can_manage_storage BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'storage' AND c.relname = 'objects'
          AND (
              c.relowner = (SELECT usesysid FROM pg_user WHERE usename = CURRENT_USER)
              OR EXISTS (SELECT 1 FROM pg_user WHERE usename = CURRENT_USER AND usesuper = TRUE)
          )
    ) INTO v_can_manage_storage;

    IF v_can_manage_storage THEN
        DROP POLICY IF EXISTS "medical_vault_tenant_isolation_delete" ON storage.objects;
        CREATE POLICY "medical_vault_tenant_isolation_delete"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'medical-documents-vault'
            AND split_part(name, '/', 1) = COALESCE(NULLIF(current_setting('app.current_organization_id', true), ''), private.get_current_org_id())::text
            AND (
                auth.role() = 'service_role'
                OR EXISTS (
                    SELECT 1 
                    FROM public.user_roles ur
                    JOIN public.roles r ON ur.role_id = r.id
                    WHERE ur.user_id = auth.uid()
                      AND ur.organization_id::text = split_part(storage.objects.name, '/', 1)
                      AND LOWER(r.name) IN ('admin', 'super_admin', 'hospital_administrator', 'super admin')
                )
            )
        );
    END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 2. Authoritative P&L Summary: Cash Basis Disbursements from Cash/Bank Accounts
-- -------------------------------------------------------------------------------------
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
    v_start_date_d DATE;
    v_end_date_d DATE;
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

    -- Normalize start and end boundaries to Asia/Dhaka calendar dates for DATE-column queries
    v_start_date_d := (p_start_date AT TIME ZONE 'Asia/Dhaka')::DATE;
    v_end_date_d   := (p_end_date AT TIME ZONE 'Asia/Dhaka')::DATE;

    -- Accrual: Gross revenue and discounts recognized on invoices in half-open period [start, end)
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

    -- Operating Expenses (Accrual Basis): Query General Ledger posted journal entries (EXPENSE accounts)
    -- Half-open date comparison: entry_date >= v_start_date_d AND entry_date < v_end_date_d
    SELECT COALESCE(SUM(jel.debit - jel.credit), 0.00)
    INTO v_operating_expenses
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.organization_id = p_org_id
      AND je.status = 'POSTED'
      AND coa.account_type = 'EXPENSE'
      AND je.entry_date >= v_start_date_d
      AND je.entry_date < v_end_date_d;

    -- Expense breakdown by category from authoritative General Ledger
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
          AND je.entry_date >= v_start_date_d
          AND je.entry_date < v_end_date_d
        GROUP BY coa.account_name, coa.account_code
        ORDER BY SUM(jel.debit - jel.credit) DESC
    ) sub;

    v_operating_surplus := v_net_revenue - v_operating_expenses;

    -- Cash Movement: Inflows (Patient Collections) in half-open period [start, end)
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_patient_collections
    FROM public.payments
    WHERE organization_id = p_org_id
      AND COALESCE(payment_date, created_at) >= p_start_date
      AND COALESCE(payment_date, created_at) < p_end_date;

    v_total_cash_inflow := v_patient_collections;

    -- Cash Movement: Outflows
    -- 1. Cash Refunds from public.refunds
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_cash_refunds
    FROM public.refunds
    WHERE organization_id = p_org_id
      AND refunded_at >= p_start_date
      AND refunded_at < p_end_date;

    -- 2. Operating Disbursements (Cash Basis): Credits to Cash & Bank accounts (ASSET accounts 1010-1099)
    -- Excludes patient collection receipts (PAYMENT) and refunds (REFUND) to avoid double counting
    SELECT COALESCE(SUM(jel.credit - jel.debit), 0.00)
    INTO v_operating_disbursements
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.organization_id = p_org_id
      AND je.status = 'POSTED'
      AND coa.account_type = 'ASSET'
      AND coa.account_code LIKE '10%'
      AND je.entry_date >= v_start_date_d
      AND je.entry_date < v_end_date_d
      AND (je.reference_type IS NULL OR je.reference_type NOT IN ('REFUND', 'PATIENT_REFUND', 'PAYMENT'));

    v_operating_disbursements := GREATEST(v_operating_disbursements, 0.00);

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
        'cash_basis', jsonb_build_object(
            'patient_collections', v_patient_collections,
            'total_cash_inflow', v_total_cash_inflow,
            'refunds', v_cash_refunds,
            'operating_disbursements', v_operating_disbursements,
            'total_cash_outflow', v_total_cash_outflow,
            'net_cash_movement', v_net_cash_movement
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

COMMENT ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
'Authoritative Profit & Loss summary providing accrual accounting (invoices recognized vs expenses) and true cash basis movement (collections vs Cash/Bank disbursements and refunds) with Asia/Dhaka half-open date boundaries.';

REVOKE ALL ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profit_and_loss_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;
