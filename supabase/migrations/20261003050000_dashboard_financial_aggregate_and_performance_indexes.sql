-- =====================================================================================
-- Migration: 20261003050000_dashboard_financial_aggregate_and_performance_indexes.sql
-- Description: 
--   1. Secure, authoritative PostgreSQL aggregation function for the central hospital dashboard
--      to eliminate client-side JavaScript iteration over all daily invoices.
--   2. High-performance covering indexes for invoice financial summaries, today-patient registration,
--      daily scheduled doctor availability, and vacant bed queries.
-- =====================================================================================

-- 1. High-Performance Dashboard Financial Aggregate RPC
CREATE OR REPLACE FUNCTION public.get_dashboard_today_financial_summary(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID;
    v_today_income NUMERIC(14, 2) := 0.00;
    v_today_due NUMERIC(14, 2) := 0.00;
    v_invoice_count BIGINT := 0;
BEGIN
    -- Strict Parameter Validation
    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date <= p_start_date THEN
        RAISE EXCEPTION 'Invalid date boundaries supplied for financial aggregate'
            USING ERRCODE = '22023';
    END IF;

    -- Strict Tenant Resolution & Authentication Check
    v_org_id := COALESCE(p_org_id, NULLIF(current_setting('app.current_organization_id', true), '')::uuid, public.get_current_org_id());

    IF v_org_id IS NULL AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access denied: Organization mismatch or unauthenticated caller'
            USING ERRCODE = '42501';
    END IF;

    -- Strict Cross-Tenant Guard
    IF p_org_id IS NOT NULL 
       AND p_org_id != COALESCE(public.get_current_org_id(), (NULLIF(current_setting('app.current_organization_id', true), ''))::uuid)
       AND COALESCE(current_setting('request.jwt.claim.role', true), '') != 'service_role'
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
        RAISE EXCEPTION 'Access denied: Cross-tenant organization access prohibited'
            USING ERRCODE = '42501';
    END IF;

    -- Database-side aggregation with covering index
    SELECT
        COALESCE(SUM(paid_amount), 0.00),
        COALESCE(SUM(due_amount), 0.00),
        COUNT(*)
    INTO
        v_today_income,
        v_today_due,
        v_invoice_count
    FROM public.invoices
    WHERE organization_id = v_org_id
      AND is_voided = FALSE
      AND created_at >= p_start_date
      AND created_at < p_end_date;

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', v_org_id,
        'today_income', v_today_income,
        'today_due', v_today_due,
        'invoice_count', v_invoice_count
    );
END;
$$;

-- Security Definer Grant & Revoke Controls
REVOKE ALL ON FUNCTION public.get_dashboard_today_financial_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_today_financial_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;

-- 2. Performance Covering Indexes
-- 2.1 Invoices financial aggregate covering index
CREATE INDEX IF NOT EXISTS idx_invoices_dashboard_financial_agg
    ON public.invoices(organization_id, created_at)
    INCLUDE (paid_amount, due_amount)
    WHERE is_voided = FALSE;

-- 2.2 Today patients registration B-tree index
CREATE INDEX IF NOT EXISTS idx_patients_org_created_at
    ON public.patients(organization_id, created_at);

-- 2.3 Today doctor schedule recurring lookup index
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_org_day_active
    ON public.doctor_schedules(organization_id, day_of_week, is_active);

-- 2.4 Vacant beds matrix lookup index
CREATE INDEX IF NOT EXISTS idx_beds_org_status_active
    ON public.beds(organization_id, status, is_active);
