-- =====================================================================================
-- Migration: 20260922213000_doctors_view_security_invoker_and_anon_shield.sql
-- Description:
--   1. Re-creates public.public_doctors_view with WITH (security_invoker = true)
--      and explicit WHERE clause restricting to canonical public organization.
--   2. Enforces that anon callers cannot see unapproved or cross-tenant doctor rows.
--   3. Guarantees that public_doctors_view adheres strictly to the security_invoker
--      Row-Level Security semantics of PostgreSQL 15+.
-- =====================================================================================

-- Recreate public_doctors_view with WITH (security_invoker = true)
CREATE OR REPLACE VIEW public.public_doctors_view
WITH (security_invoker = true) AS
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
WHERE d.is_active = TRUE 
  AND (d.is_public = TRUE OR d.is_public IS NULL)
  AND d.organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

COMMENT ON VIEW public.public_doctors_view IS 'Public consultant directory with security_invoker = true, canonical org boundary, and sanitized projection';

-- Permissions on the view
REVOKE ALL ON public.public_doctors_view FROM PUBLIC;
GRANT SELECT ON public.public_doctors_view TO anon, authenticated, service_role;
