-- ==============================================================================
-- OHMS Database Migration 106: Align Audit Logs and Diagnostic Results Schema
--
-- Description:
-- 1. Add details JSONB column and set module default to 'SYSTEM' on audit_logs.
-- 2. Add multi-tenant and operational columns to diagnostic_results & diagnostic_result_values.
-- 3. Recreate update_hospital_master_profile with exact parameter order and module/new_values/details.
-- ==============================================================================

-- 1. Audit Logs Schema Alignment
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS details JSONB;

DO $$
BEGIN
    ALTER TABLE public.audit_logs ALTER COLUMN module SET DEFAULT 'SYSTEM';
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. Diagnostic Results Schema Alignment
ALTER TABLE public.diagnostic_results
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.diagnostic_orders(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS result_date TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'preliminary';

ALTER TABLE public.diagnostic_result_values
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 3. Recreate update_hospital_master_profile (Preserving exact parameter names and order)
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
SET search_path = ''
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

    -- Determine caller's organization (tenant-aware, not hardcoded)
    SELECT ur.organization_id INTO v_org_id
    FROM public.user_roles ur
    WHERE ur.user_id = v_caller_id
      AND ur.is_active = TRUE
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Cannot determine caller organization. No active role assignment found.'
            USING ERRCODE = '42501';
    END IF;

    -- Update organization master record
    UPDATE public.organizations
    SET 
        name = COALESCE(NULLIF(TRIM(p_name), ''), name),
        address = COALESCE(NULLIF(TRIM(p_address), ''), address),
        phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
        email = COALESCE(NULLIF(TRIM(p_email), ''), email),
        updated_at = NOW()
    WHERE id = v_org_id;

    -- Update settings (emergency/ambulance hotlines)
    INSERT INTO public.organization_settings (
        organization_id,
        emergency_hotline,
        ambulance_hotline,
        updated_at
    )
    VALUES (
        v_org_id,
        COALESCE(NULLIF(TRIM(p_emergency_hotline), ''), ''),
        COALESCE(NULLIF(TRIM(p_ambulance_hotline), ''), ''),
        NOW()
    )
    ON CONFLICT (organization_id) DO UPDATE SET
        emergency_hotline = COALESCE(NULLIF(TRIM(p_emergency_hotline), ''), public.organization_settings.emergency_hotline),
        ambulance_hotline = COALESCE(NULLIF(TRIM(p_ambulance_hotline), ''), public.organization_settings.ambulance_hotline),
        updated_at = NOW();

    -- Audit log entry with both details and new_values populated
    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        details,
        new_values,
        created_at
    )
    VALUES (
        v_org_id,
        v_caller_id,
        'update_hospital_master_profile',
        'SETTINGS',
        'organization',
        v_org_id::text,
        jsonb_build_object(
            'name', p_name,
            'address', p_address,
            'phone', p_phone,
            'emergency_hotline', p_emergency_hotline,
            'ambulance_hotline', p_ambulance_hotline,
            'email', p_email
        ),
        jsonb_build_object(
            'name', p_name,
            'address', p_address,
            'phone', p_phone,
            'emergency_hotline', p_emergency_hotline,
            'ambulance_hotline', p_ambulance_hotline,
            'email', p_email
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'organization_id', v_org_id,
        'updated_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_hospital_master_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_hospital_master_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
