-- =====================================================================================
-- 20260926033000_schema_qualify_atomic_sequences.sql
-- Fix relation does not exist under empty search_path (SECURITY DEFINER safety):
-- Schema-qualify nextval calls with 'public.<sequence>'::regclass in:
-- 1. generate_employee_code
-- 2. generate_receipt_number
-- 3. generate_pharmacy_sale_number
-- 4. generate_emergency_temp_id
-- 5. generate_diagnostic_order_number
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.generate_employee_code(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'EMP-';
BEGIN
    v_seq_num := nextval('public.employee_code_seq'::regclass);
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'OH-RCT-';
BEGIN
    v_seq_num := nextval('public.receipt_code_seq'::regclass);
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_pharmacy_sale_number(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'PH-SL-';
BEGIN
    v_seq_num := nextval('public.pharmacy_sale_seq'::regclass);
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_emergency_temp_id(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(15) := 'TEMP-EMG-';
BEGIN
    v_seq_num := nextval('public.emergency_temp_seq'::regclass);
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_diagnostic_order_number(p_org_id UUID)
RETURNS VARCHAR
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
    v_seq_num BIGINT;
    v_prefix VARCHAR(10) := 'ORD-';
BEGIN
    v_seq_num := nextval('public.diagnostic_order_seq'::regclass);
    RETURN v_prefix || LPAD(v_seq_num::TEXT, 6, '0');
END;
$$;

-- Ensure execution grants
GRANT EXECUTE ON FUNCTION public.generate_employee_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_pharmacy_sale_number(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_emergency_temp_id(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_diagnostic_order_number(UUID) TO authenticated, service_role;
