-- =====================================================================================
-- Migration 54 (Phase 55): Secure Public Waiting Queue Projection & Hardened Contact Intake
-- Timestamp: 2026-09-21 07:00:00 UTC
-- Purpose:
--   1. Authoritative public queue RPC (get_public_live_queue):
--      - Eliminates client-side patient name masking
--      - Guarantees zero PII exposure to anonymous network visitors
--      - Enforces strict server-side projection (doctor_name, room, token, status, called_at)
--   2. Hardened public contact inquiry intake (submit_public_contact_inquiry):
--      - Enforces rate limiting per telephone number (max 5 inquiries/hour)
--      - Sanitizes and validates field lengths (name <= 120, subject <= 150, message <= 2000)
--      - Prevents unrestricted anonymous bulk insert abuse
-- =====================================================================================

-- 1. Secure Public Waiting Queue RPC
DROP FUNCTION IF EXISTS public.get_public_live_queue(UUID);

CREATE OR REPLACE FUNCTION public.get_public_live_queue(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today DATE;
    v_org_exists BOOLEAN;
    v_result JSONB;
BEGIN
    -- Verify organization validity and active status
    SELECT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = p_org_id AND is_active = TRUE
    ) INTO v_org_exists;

    IF NOT v_org_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive hospital organization.', 'queue', '[]'::jsonb);
    END IF;

    -- Compute current Dhaka date
    v_today := (timezone('Asia/Dhaka', NOW()))::DATE;

    -- Build public-safe queue projection: Zero patient names, phone numbers, or patient IDs returned
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', q.id,
                'doctor_name', q.doctor_name,
                'room_number', q.room_number,
                'token_number', '#' || q.token_num::text,
                'status', q.status_label,
                'called_at', q.formatted_time
            ) ORDER BY q.token_num ASC
        ),
        '[]'::jsonb
    ) INTO v_result
    FROM (
        SELECT 
            a.id,
            d.full_name AS doctor_name,
            COALESCE(d.room_number, '') AS room_number,
            COALESCE(a.token_number, a.serial_number) AS token_num,
            CASE 
                WHEN a.status IN ('IN_CONSULTATION', 'IN_CHAMBER') THEN 'serving'
                WHEN a.status = 'CONFIRMED' THEN 'calling'
                WHEN a.status = 'COMPLETED' THEN 'done'
                ELSE 'waiting'
            END AS status_label,
            TO_CHAR(timezone('Asia/Dhaka', a.created_at), 'HH12:MI AM') AS formatted_time
        FROM public.appointments a
        JOIN public.doctors d ON d.id = a.doctor_id
        WHERE a.organization_id = p_org_id
          AND a.appointment_date = v_today
          AND a.status IN ('WAITING', 'SCHEDULED', 'CONFIRMED', 'IN_CONSULTATION', 'IN_CHAMBER', 'COMPLETED')
          AND COALESCE(a.token_number, a.serial_number) IS NOT NULL
        ORDER BY COALESCE(a.token_number, a.serial_number) ASC
        LIMIT 50
    ) q;

    RETURN jsonb_build_object('success', true, 'queue', v_result);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to retrieve public queue projection.', 'queue', '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_live_queue(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_live_queue(UUID) TO anon, authenticated, service_role;


-- 2. Hardened Public Contact Inquiry Intake RPC with Anti-Abuse Rate Limiting
DROP FUNCTION IF EXISTS public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_public_contact_inquiry(
    p_org_id UUID,
    p_name TEXT,
    p_phone TEXT,
    p_email TEXT DEFAULT NULL,
    p_subject TEXT DEFAULT 'General Hospital Enquiry',
    p_message TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_email TEXT;
    v_clean_subject TEXT;
    v_clean_message TEXT;
    v_recent_count INT;
    v_inquiry_id UUID;
    v_org_exists BOOLEAN;
BEGIN
    -- Verify organization validity
    SELECT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = p_org_id AND is_active = TRUE
    ) INTO v_org_exists;

    IF NOT v_org_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid hospital organization target.');
    END IF;

    -- Trim and validate name
    v_clean_name := BTRIM(p_name);
    IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Name is required (minimum 2 characters).');
    END IF;
    IF length(v_clean_name) > 120 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Name exceeds maximum allowed length (120 characters).');
    END IF;

    -- Normalize and validate Bangladeshi phone number
    v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
    IF length(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := substring(v_clean_phone FROM 3);
    END IF;
    IF length(v_clean_phone) <> 11 OR NOT (v_clean_phone ~ '^01[3-9][0-9]{8}$') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Please provide a valid 11-digit Bangladeshi mobile number.');
    END IF;

    -- Optional email validation
    IF p_email IS NOT NULL AND BTRIM(p_email) <> '' THEN
        v_clean_email := LOWER(BTRIM(p_email));
        IF length(v_clean_email) > 150 OR NOT (v_clean_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid email address format.');
        END IF;
    ELSE
        v_clean_email := NULL;
    END IF;

    -- Validate subject
    v_clean_subject := BTRIM(COALESCE(p_subject, 'General Hospital Enquiry'));
    IF length(v_clean_subject) > 150 THEN
        v_clean_subject := substring(v_clean_subject FROM 1 FOR 150);
    END IF;

    -- Validate message
    v_clean_message := BTRIM(COALESCE(p_message, ''));
    IF length(v_clean_message) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message must be at least 10 characters long.');
    END IF;
    IF length(v_clean_message) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message exceeds maximum allowed length (2,000 characters).');
    END IF;

    -- Anti-Abuse Rate Limiting: Max 5 inquiries per phone number in the trailing 60 minutes
    SELECT COUNT(*) INTO v_recent_count
    FROM public.public_contact_inquiries
    WHERE phone = v_clean_phone
      AND created_at >= NOW() - INTERVAL '1 hour';

    IF v_recent_count >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Too many inquiries submitted from this number. Please wait before submitting again or call our hotline.');
    END IF;

    -- Safe insert into public_contact_inquiries
    INSERT INTO public.public_contact_inquiries (
        organization_id,
        name,
        phone,
        email,
        subject,
        message,
        status,
        created_at
    ) VALUES (
        p_org_id,
        v_clean_name,
        v_clean_phone,
        v_clean_email,
        v_clean_subject,
        v_clean_message,
        'NEW',
        NOW()
    ) RETURNING id INTO v_inquiry_id;

    RETURN jsonb_build_object('success', true, 'inquiry_id', v_inquiry_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred while saving your inquiry. Please try again.');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- 3. Additional Database Constraints for Integrity
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_inquiry_message_len'
    ) THEN
        ALTER TABLE public.public_contact_inquiries
            ADD CONSTRAINT chk_contact_inquiry_message_len
            CHECK (length(message) <= 3000 AND length(BTRIM(message)) >= 5);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_contact_inquiry_name_len'
    ) THEN
        ALTER TABLE public.public_contact_inquiries
            ADD CONSTRAINT chk_contact_inquiry_name_len
            CHECK (length(name) <= 150 AND length(BTRIM(name)) > 0);
    END IF;
END $$;
