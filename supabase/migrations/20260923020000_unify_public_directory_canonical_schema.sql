-- =====================================================================================
-- Migration: 20260923020000_unify_public_directory_canonical_schema.sql
-- Description:
--   1. Updates public.public_doctors_view to join with public.organizations
--      where org.is_canonical_public = TRUE (or org.id = d.organization_id).
--      This eliminates hardcoded UUIDs and allows true dynamic canonical org resolution.
--   2. Updates public.get_public_doctors_directory(p_org_id UUID) to:
--      - Require that the requested p_org_id is active AND (is_canonical_public = TRUE OR p_org_id = current_org_id)
--      - Return an empty json array '[]'::jsonb if the organization does not exist or is not authorized for public projection.
--   3. Adds public.get_public_doctor_schedules(p_org_id UUID, p_doctor_id UUID) RPC
--      to provide a single, authoritative, secure public schedule projection
--      that joins doctors and doctor_schedules in a SECURITY DEFINER context,
--      preventing client-side table probe attacks.
-- =====================================================================================

-- 1. Recreate public_doctors_view dynamically bound to canonical public organization
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
JOIN public.organizations o ON d.organization_id = o.id AND o.is_active = TRUE AND o.is_canonical_public = TRUE
LEFT JOIN public.doctor_departments dd ON d.id = dd.doctor_id AND dd.is_primary = TRUE
LEFT JOIN public.departments dept ON dd.department_id = dept.id
WHERE d.is_active = TRUE 
  AND (d.is_public = TRUE OR d.is_public IS NULL);

COMMENT ON VIEW public.public_doctors_view IS 'Public consultant directory dynamically linked to canonical public organization with security_invoker = true';

REVOKE ALL ON public.public_doctors_view FROM PUBLIC;
GRANT SELECT ON public.public_doctors_view TO anon, authenticated, service_role;

-- 2. Authoritative public doctor directory RPC
CREATE OR REPLACE FUNCTION public.get_public_doctors_directory(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
    v_is_valid_org BOOLEAN;
BEGIN
    -- Validate that requested organization is an active canonical public organization
    SELECT EXISTS (
        SELECT 1 FROM public.organizations 
        WHERE id = p_org_id AND is_active = TRUE AND is_canonical_public = TRUE
    ) INTO v_is_valid_org;

    IF NOT v_is_valid_org THEN
        RETURN '[]'::jsonb;
    END IF;

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

COMMENT ON FUNCTION public.get_public_doctors_directory(UUID) IS 'Authoritative public directory RPC returning sanitized consultant data and visiting schedules';

REVOKE ALL ON FUNCTION public.get_public_doctors_directory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_doctors_directory(UUID) TO anon, authenticated, service_role;

-- 3. Authoritative public doctor schedules RPC
CREATE OR REPLACE FUNCTION public.get_public_doctor_schedules(p_org_id UUID, p_doctor_id UUID)
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
                'id', s.id,
                'day_of_week', s.day_of_week,
                'start_time', s.start_time::text,
                'end_time', s.end_time::text,
                'max_tokens', s.max_tokens,
                'room_number', COALESCE(s.room_number, d.room_number, '')
            )
            ORDER BY s.day_of_week ASC, s.start_time ASC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM public.doctor_schedules s
    JOIN public.doctors d ON s.doctor_id = d.id
    JOIN public.organizations o ON d.organization_id = o.id
    WHERE s.organization_id = p_org_id
      AND s.doctor_id = p_doctor_id
      AND s.is_active = TRUE
      AND d.is_active = TRUE
      AND (d.is_public = TRUE OR d.is_public IS NULL)
      AND o.is_active = TRUE
      AND o.is_canonical_public = TRUE;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) IS 'Authoritative public schedule RPC returning only active schedules for approved public doctors';

REVOKE ALL ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) TO anon, authenticated, service_role;
