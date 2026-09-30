-- ==============================================================================
-- Migration: 20261001020000_real_hospital_master_data_and_admin_controls.sql
-- Migration 97: Real Approved Hospital Master Data & Super Admin Control Controls
-- 
-- Canonical Approved Hospital Data:
--   Name: Annesha Hospital and Diagnostic Center
--   Bangla: অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার
--   Address: সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া
--   Phone: 01718835623
--   Emergency Hotline: 01718835623
--   Ambulance Hotline: 01904210065
--   Official / Transactional Email: aaih.apon@gmail.com
-- ==============================================================================

DO $$
DECLARE
    v_canonical_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    -- 1. Update Core Organization Master Record
    UPDATE public.organizations
    SET 
        name = 'Annesha Hospital and Diagnostic Center',
        phone = '01718835623',
        email = 'aaih.apon@gmail.com',
        address = 'সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া',
        updated_at = NOW()
    WHERE id = v_canonical_org_id;

    -- 2. Update / Upsert Organization Settings Hotlines
    INSERT INTO public.organization_settings (
        organization_id,
        emergency_hotline,
        ambulance_hotline,
        updated_at
    )
    VALUES (
        v_canonical_org_id,
        '01718835623',
        '01904210065',
        NOW()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
        emergency_hotline = '01718835623',
        ambulance_hotline = '01904210065',
        updated_at = NOW();

END $$;

-- 3. Super Admin RPC Function for Full Master Profile Control
CREATE OR REPLACE FUNCTION public.update_hospital_master_profile(
    p_name TEXT,
    p_address TEXT,
    p_phone TEXT,
    p_emergency_hotline TEXT,
    p_ambulance_hotline TEXT,
    p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_org_id UUID;
    v_role_names TEXT[];
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    -- Require authentication
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update hospital master data.'
            USING ERRCODE = '42501';
    END IF;

    -- Verify Super Admin or Hospital Administrator role
    SELECT COALESCE(array_agg(r.name::text), ARRAY[]::text[])
    INTO v_role_names
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = v_caller_id
      AND ur.is_active = TRUE;

    IF 'super_admin' = ANY(v_role_names) 
       OR 'hospital_administrator' = ANY(v_role_names) 
       OR 'admin' = ANY(v_role_names) THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Access denied: only Super Admin or Hospital Administrator can modify master hospital profile.'
            USING ERRCODE = '42501';
    END IF;

    -- Target canonical organization
    v_org_id := 'a0000000-0000-0000-0000-000000000001'::uuid;

    -- Update organization
    UPDATE public.organizations
    SET 
        name = COALESCE(NULLIF(TRIM(p_name), ''), name),
        phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
        email = COALESCE(NULLIF(TRIM(p_email), ''), email),
        address = COALESCE(NULLIF(TRIM(p_address), ''), address),
        updated_at = NOW()
    WHERE id = v_org_id;

    -- Update settings
    UPDATE public.organization_settings
    SET 
        emergency_hotline = COALESCE(NULLIF(TRIM(p_emergency_hotline), ''), emergency_hotline),
        ambulance_hotline = COALESCE(NULLIF(TRIM(p_ambulance_hotline), ''), ambulance_hotline),
        updated_at = NOW()
    WHERE organization_id = v_org_id;

    -- Return updated profile
    RETURN jsonb_build_object(
        'success', TRUE,
        'organization_id', v_org_id,
        'updated_at', NOW()
    );
END;
$$;

-- Grant execution to authenticated users (role check inside function protects it)
GRANT EXECUTE ON FUNCTION public.update_hospital_master_profile TO authenticated;
