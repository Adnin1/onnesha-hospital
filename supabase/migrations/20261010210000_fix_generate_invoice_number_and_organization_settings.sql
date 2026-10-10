-- =====================================================================================
-- Migration 138: 20261010210000_fix_generate_invoice_number_and_organization_settings.sql
-- Fixes "relation 'organization_settings' does not exist" error during billing invoice creation
-- and guarantees fail-safe invoice number and patient code generation across all search paths.
-- =====================================================================================

-- 1. Ensure public.organization_settings table exists
CREATE TABLE IF NOT EXISTS public.organization_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    currency VARCHAR(10) DEFAULT 'BDT',
    timezone VARCHAR(50) DEFAULT 'Asia/Dhaka',
    patient_id_prefix VARCHAR(20) DEFAULT 'OH-P-',
    invoice_prefix VARCHAR(20) DEFAULT 'OH-INV-',
    max_cashier_discount_pct NUMERIC DEFAULT 10.00,
    emergency_hotline VARCHAR(50) DEFAULT '+880 1711-000000',
    ambulance_hotline VARCHAR(50) DEFAULT '+880 1712-000000',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure RLS is active with safe read policies
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_settings_select_policy" ON public.organization_settings;
CREATE POLICY "organization_settings_select_policy"
    ON public.organization_settings FOR SELECT
    TO authenticated, anon, service_role
    USING (true);

DROP POLICY IF EXISTS "organization_settings_admin_policy" ON public.organization_settings;
CREATE POLICY "organization_settings_admin_policy"
    ON public.organization_settings FOR ALL
    TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- Seed default settings for all existing organizations
INSERT INTO public.organization_settings (
    organization_id, currency, timezone, patient_id_prefix, invoice_prefix,
    emergency_hotline, ambulance_hotline
)
SELECT 
    id, 'BDT', 'Asia/Dhaka', 'OH-P-', 'OH-INV-',
    '+880 1711-000000', '+880 1712-000000'
FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

GRANT SELECT ON public.organization_settings TO authenticated, anon;
GRANT ALL ON public.organization_settings TO service_role;

-- 2. Ensure sequences exist
CREATE SEQUENCE IF NOT EXISTS public.invoice_code_seq START WITH 100001 INCREMENT BY 1;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_code_seq TO authenticated, service_role, anon;

CREATE SEQUENCE IF NOT EXISTS public.patient_code_seq START WITH 1 INCREMENT BY 1;
GRANT USAGE, SELECT ON SEQUENCE public.patient_code_seq TO authenticated, service_role, anon;

-- 3. Hardened, fail-safe public.generate_invoice_number with explicit search_path and exception handling
CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prefix VARCHAR;
    v_next_val BIGINT;
BEGIN
    BEGIN
        SELECT COALESCE(invoice_prefix, 'OH-INV-') INTO v_prefix
        FROM public.organization_settings
        WHERE organization_id = p_org_id;
    EXCEPTION WHEN OTHERS THEN
        v_prefix := 'OH-INV-';
    END;
    
    IF v_prefix IS NULL OR v_prefix = '' THEN
        v_prefix := 'OH-INV-';
    END IF;

    BEGIN
        v_next_val := nextval('public.invoice_code_seq'::regclass);
    EXCEPTION WHEN OTHERS THEN
        v_next_val := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT % 1000000000;
    END;

    RETURN v_prefix || LPAD(v_next_val::TEXT, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invoice_number(UUID) TO authenticated, service_role, anon;

-- 4. Hardened, fail-safe public.generate_patient_code with explicit search_path and exception handling
CREATE OR REPLACE FUNCTION public.generate_patient_code(p_organization_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prefix VARCHAR;
    v_next_val BIGINT;
BEGIN
    BEGIN
        SELECT COALESCE(patient_id_prefix, 'OH-P-') INTO v_prefix
        FROM public.organization_settings
        WHERE organization_id = p_organization_id;
    EXCEPTION WHEN OTHERS THEN
        v_prefix := 'OH-P-';
    END;
    
    IF v_prefix IS NULL OR v_prefix = '' THEN
        v_prefix := 'OH-P-';
    END IF;

    BEGIN
        v_next_val := nextval('public.patient_code_seq'::regclass);
    EXCEPTION WHEN OTHERS THEN
        v_next_val := FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT % 1000000000;
    END;

    RETURN v_prefix || LPAD(v_next_val::TEXT, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_patient_code(UUID) TO authenticated, service_role, anon;
