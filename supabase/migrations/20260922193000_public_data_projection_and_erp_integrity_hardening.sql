-- =====================================================================================
-- Migration: 20260922193000_public_data_projection_and_erp_integrity_hardening.sql
-- Description:
--   1. Public Data Protection & Secure RPC:
--      • Re-creates public_doctors_view matching exact column signatures of 022_phase13
--      • Adds secure RPC public.get_public_doctors_directory(p_org_id)
--      • Revokes direct table SELECT from anon on sensitive doctor tables
--   2. ERP Derived Field Constraints & Sequencing:
--      • chk_payroll_net_equals_gross_minus_deductions on payroll_line_items
--      • chk_erp_po_item_total_price on erp_purchase_order_items
--      • Atomic transactional PO numbering sequence function
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SAFE PUBLIC DOCTORS PROJECTION VIEW & RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.public_doctors_view AS
SELECT 
    d.id,
    d.organization_id,
    d.full_name,
    d.degrees,
    d.designation,
    d.specialization,
    d.bmdc_reg_number,
    d.room_number,
    d.opd_fee,
    d.followup_fee,
    d.avatar_url,
    d.bio,
    d.public_bio,
    d.experience_years,
    d.is_active,
    COALESCE(d.is_public, true) AS is_public,
    dept.id AS department_id,
    dept.name AS department_name,
    dept.slug AS department_slug
FROM public.doctors d
LEFT JOIN public.doctor_departments dd ON d.id = dd.doctor_id AND dd.is_primary = TRUE
LEFT JOIN public.departments dept ON dd.department_id = dept.id
WHERE d.is_active = TRUE AND (d.is_public = TRUE OR d.is_public IS NULL);

COMMENT ON VIEW public.public_doctors_view IS 'Public consultant directory strictly filtered to omit commission/salary and internal metadata';

-- Grant access on view to anon and authenticated
REVOKE ALL ON public.public_doctors_view FROM PUBLIC;
GRANT SELECT ON public.public_doctors_view TO anon, authenticated, service_role;

-- Revoke direct anon SELECT on sensitive doctor tables if granted
REVOKE SELECT ON public.doctor_commission_rules FROM anon, PUBLIC;
REVOKE SELECT ON public.doctor_commissions FROM anon, PUBLIC;

-- Safe RPC for fetching public doctors with nested visiting schedules
CREATE OR REPLACE FUNCTION public.get_public_doctors_directory(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', v.id,
                'full_name', v.full_name,
                'degrees', v.degrees,
                'designation', v.designation,
                'specialization', v.specialization,
                'bmdc_reg_number', v.bmdc_reg_number,
                'room_number', v.room_number,
                'opd_fee', v.opd_fee,
                'followup_fee', v.followup_fee,
                'avatar_url', v.avatar_url,
                'bio', v.bio,
                'public_bio', v.public_bio,
                'experience_years', v.experience_years,
                'department_id', v.department_id,
                'department_name', COALESCE(v.department_name, 'General OPD'),
                'department_slug', COALESCE(v.department_slug, 'general-opd'),
                'schedules', COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', s.id,
                                'day_of_week', s.day_of_week,
                                'start_time', s.start_time::text,
                                'end_time', s.end_time::text,
                                'is_active', s.is_active
                            )
                        )
                        FROM public.doctor_schedules s
                        WHERE s.doctor_id = v.id AND s.is_active = true
                    ),
                    '[]'::jsonb
                )
            )
            ORDER BY v.full_name ASC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM public.public_doctors_view v
    WHERE v.organization_id = p_org_id;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_doctors_directory(UUID) IS 'Safe public directory RPC returning sanitized consultant data and visiting schedules';

REVOKE ALL ON FUNCTION public.get_public_doctors_directory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_doctors_directory(UUID) TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ERP INTEGRITY HARDENING: DERIVED INVARIANTS & CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Payroll Line Items: Enforce net_salary = gross_salary - deductions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_payroll_net_equals_gross_minus_deductions'
    ) THEN
        ALTER TABLE public.payroll_line_items
            ADD CONSTRAINT chk_payroll_net_equals_gross_minus_deductions
            CHECK (net_salary = gross_salary - deductions);
    END IF;
END $$;

-- 2b. ERP PO Items: Enforce total_price = quantity_ordered * unit_price
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_erp_po_item_total_price'
    ) THEN
        ALTER TABLE public.erp_purchase_order_items
            ADD CONSTRAINT chk_erp_po_item_total_price
            CHECK (total_price = quantity_ordered * unit_price);
    END IF;
END $$;

-- 2c. Atomic PO Number Generation Sequence
CREATE SEQUENCE IF NOT EXISTS public.seq_erp_po_number START WITH 1000 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_next_po_number(p_org_id UUID)
RETURNS VARCHAR(40)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_seq_val BIGINT;
    v_year TEXT;
    v_po_num VARCHAR(40);
BEGIN
    v_year := to_char(CURRENT_DATE, 'YYYY');
    v_seq_val := nextval('public.seq_erp_po_number');
    v_po_num := 'PO-' || v_year || '-' || lpad(v_seq_val::text, 5, '0');
    RETURN v_po_num;
END;
$$;

COMMENT ON FUNCTION public.generate_next_po_number(UUID) IS 'Thread-safe atomic PO numbering sequence generator';

REVOKE ALL ON FUNCTION public.generate_next_po_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_po_number(UUID) TO authenticated, service_role;
