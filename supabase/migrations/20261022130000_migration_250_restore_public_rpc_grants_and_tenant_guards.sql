-- ==============================================================================
-- MIGRATION 250: RESTORE AUTHORITATIVE PUBLIC RPC GRANTS WITH STRICT CANONICAL TENANT GUARDS
-- ==============================================================================
-- 1. Context:
--    Migration 237 enforced default-deny and revoked execute on public schema from anon/PUBLIC.
--    However, it re-granted permissions to legacy procedure names, omitting the current
--    production RPCs utilized by the unauthenticated public website portals:
--      - get_public_doctors_directory(UUID)
--      - get_public_doctor_schedules(UUID, UUID)
--      - get_public_live_queue(UUID) & get_public_live_queue(UUID, UUID, DATE)
--      - get_public_token_status(UUID, TEXT, DATE)
--      - book_online_appointment(...)
--      - submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
--
-- 2. Security Hardening (Multi-Tenant Isolation):
--    All public SECDEF functions MUST strictly validate `is_canonical_public = TRUE` on the
--    target organization, preventing malicious callers from querying other hospital tenants
--    using arbitrary organization IDs.
--
-- 3. Overload Resolution & Parameter Alignment:
--    - book_online_appointment drops legacy conflicting overloads and unifies parameter
--      handling (accepts both p_patient_notes and legacy p_notes).
--    - get_public_token_status accepts both p_token_query and p_token_number.
--
-- 4. Scoped Permissions:
--    Explicitly grants EXECUTE to anon, authenticated, and service_role strictly for these
--    vetted, rate-limited, zero-PII/zero-PHI public endpoints.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. get_public_doctors_directory(UUID)
-- ------------------------------------------------------------------------------
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
                'room_number', v.room_number,
                'opd_fee', v.opd_fee,
                'avatar_url', v.avatar_url,
                'public_bio', v.public_bio,
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
    FROM public.public_doctors_view v;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_doctors_directory(UUID) IS
  'Authoritative public doctor directory RPC returning sanitized consultant data projecting only minimal public view fields.';

REVOKE ALL ON FUNCTION public.get_public_doctors_directory(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_doctors_directory(UUID) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. get_public_doctor_schedules(UUID, UUID)
-- ------------------------------------------------------------------------------
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
      AND d.is_public = TRUE
      AND o.is_active = TRUE
      AND o.is_canonical_public = TRUE;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) IS
  'Authoritative public schedule RPC returning only active schedules for approved public doctors.';

REVOKE ALL ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3. get_public_live_queue (Overload 1: Hospital-wide, 1-argument)
-- ------------------------------------------------------------------------------
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
    -- Verify organization validity, active status, AND canonical public flag
    SELECT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = p_org_id AND is_active = TRUE AND is_canonical_public = TRUE
    ) INTO v_org_exists;

    IF NOT v_org_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Invalid or unauthorized hospital organization.',
            'queue', '[]'::jsonb
        );
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
            a.token_number AS token_num,
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
          AND a.token_number IS NOT NULL
        ORDER BY a.token_number ASC
        LIMIT 50
    ) q;

    RETURN jsonb_build_object('success', true, 'queue', v_result);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to retrieve public queue projection.', 'queue', '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_public_live_queue(UUID) IS
  'Hospital-wide public waiting queue projection (1 argument) with zero PII exposure and canonical tenant guard.';

REVOKE ALL ON FUNCTION public.get_public_live_queue(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_live_queue(UUID) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3b. get_public_live_queue (Overload 2: Doctor-specific, 3-arguments)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_live_queue(
    p_org_id UUID,
    p_doctor_id UUID,
    p_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today DATE;
    v_org_active BOOLEAN;
    v_org_canonical BOOLEAN;
    v_doctor_active BOOLEAN;
    v_doctor_public BOOLEAN;
    v_result JSONB;
BEGIN
    -- Dhaka-local today
    v_today := COALESCE(p_date, (timezone('Asia/Dhaka', NOW()))::DATE);

    -- Canonical org gate
    SELECT is_active, is_canonical_public
    INTO v_org_active, v_org_canonical
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_active IS NOT TRUE OR v_org_canonical IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Invalid or unauthorized hospital organization.'
        );
    END IF;

    -- Doctor gate
    SELECT is_active, is_public
    INTO v_doctor_active, v_doctor_public
    FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Doctor is not available for public queue view.'
        );
    END IF;

    SELECT jsonb_build_object(
        'success', true,
        'date', v_today,
        'queue', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'token',      q.token_number,
                    'status',     q.status,
                    'booked_at',  TO_CHAR(timezone('Asia/Dhaka', q.created_at), 'HH12:MI AM')
                )
                ORDER BY q.token_number
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM public.appointments q
    WHERE q.organization_id = p_org_id
      AND q.doctor_id       = p_doctor_id
      AND q.appointment_date = v_today
      AND q.status NOT IN ('CANCELLED', 'NO_SHOW');

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_live_queue(UUID, UUID, DATE) IS
  'Returns today''s active appointment queue for a specific public doctor with booked_at in Asia/Dhaka.';

REVOKE ALL ON FUNCTION public.get_public_live_queue(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_live_queue(UUID, UUID, DATE) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 4. get_public_token_status(UUID, TEXT, DATE, TEXT)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_public_token_status(UUID, TEXT, DATE);
DROP FUNCTION IF EXISTS public.get_public_token_status(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_public_token_status(
    p_org_id UUID,
    p_token_query TEXT DEFAULT NULL,
    p_date DATE DEFAULT NULL,
    p_token_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_input_token TEXT;
    v_today DATE;
    v_target_date DATE;
    v_clean_str TEXT;
    v_clean_num INT := NULL;
    v_org_exists BOOLEAN;
    v_appt RECORD;
    v_other_date DATE := NULL;
    v_queue_ahead INT := 0;
    v_status_key TEXT;
    v_status_label TEXT;
BEGIN
    -- 1. Validate organization (active AND canonical public)
    SELECT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = p_org_id AND is_active = TRUE AND is_canonical_public = TRUE
    ) INTO v_org_exists;

    IF NOT v_org_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Invalid or unauthorized hospital organization.'
        );
    END IF;

    -- 2. Input normalization (support both p_token_query and p_token_number)
    v_input_token := COALESCE(NULLIF(TRIM(p_token_query), ''), NULLIF(TRIM(p_token_number), ''));
    v_clean_str := TRIM(REGEXP_REPLACE(COALESCE(v_input_token, ''), '^[#\s]+', ''));
    IF v_clean_str = '' OR LENGTH(v_clean_str) > 30 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid token number specified.'
        );
    END IF;

    -- Attempt integer parse if numeric
    BEGIN
        v_clean_num := v_clean_str::INT;
    EXCEPTION WHEN OTHERS THEN
        v_clean_num := NULL;
    END;

    -- 3. Determine target date (Asia/Dhaka timezone)
    v_today := (timezone('Asia/Dhaka', NOW()))::DATE;
    v_target_date := COALESCE(p_date, v_today);

    -- 4. Search for appointment on target date
    SELECT 
        a.id,
        a.token_number,
        a.status,
        a.appointment_date,
        d.full_name AS doctor_name,
        COALESCE(d.room_number, '') AS room_number,
        a.created_at
    INTO v_appt
    FROM public.appointments a
    JOIN public.doctors d ON d.id = a.doctor_id
    WHERE a.organization_id = p_org_id
      AND a.appointment_date = v_target_date
      AND (
          (v_clean_num IS NOT NULL AND a.token_number = v_clean_num)
          OR a.token_number::text = v_clean_str
      )
    LIMIT 1;

    -- 5. If found on target date, compute status and queue position
    IF v_appt.id IS NOT NULL THEN
        CASE 
            WHEN v_appt.status IN ('IN_CONSULTATION', 'IN_CHAMBER') THEN
                v_status_key := 'serving';
                v_status_label := 'In Consultation Room';
            WHEN v_appt.status = 'CONFIRMED' THEN
                v_status_key := 'calling';
                v_status_label := 'Now Calling';
            WHEN v_appt.status = 'COMPLETED' THEN
                v_status_key := 'done';
                v_status_label := 'Consultation Completed';
            WHEN v_appt.status IN ('CANCELLED', 'NO_SHOW') THEN
                v_status_key := 'skipped';
                v_status_label := 'Appointment Cancelled';
            ELSE
                v_status_key := 'waiting';
                v_status_label := 'Waiting in Queue';
        END CASE;

        -- Count waiting patients ahead with smaller token numbers
        IF v_status_key = 'waiting' THEN
            SELECT COUNT(*)
            INTO v_queue_ahead
            FROM public.appointments a2
            WHERE a2.organization_id = p_org_id
              AND a2.appointment_date = v_target_date
              AND a2.doctor_id = (SELECT doctor_id FROM public.appointments WHERE id = v_appt.id)
              AND a2.status IN ('WAITING', 'SCHEDULED')
              AND a2.token_number < v_appt.token_number;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'found', true,
            'token_number', '#' || v_appt.token_number::text,
            'status', v_status_key,
            'status_label', v_status_label,
            'doctor_name', v_appt.doctor_name,
            'room_number', v_appt.room_number,
            'appointment_date', v_appt.appointment_date,
            'queue_ahead', v_queue_ahead,
            'called_at', TO_CHAR(timezone('Asia/Dhaka', v_appt.created_at), 'HH12:MI AM')
        );
    END IF;

    -- 6. If not found for target date, check if exists on upcoming date
    SELECT a.appointment_date
    INTO v_other_date
    FROM public.appointments a
    WHERE a.organization_id = p_org_id
      AND (
          (v_clean_num IS NOT NULL AND a.token_number = v_clean_num)
          OR a.token_number::text = v_clean_str
      )
      AND a.appointment_date >= v_today
    ORDER BY a.appointment_date ASC
    LIMIT 1;

    IF v_other_date IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'found', false,
            'token_number', '#' || v_clean_str,
            'has_other_date', true,
            'scheduled_date', v_other_date,
            'message', 'This token is scheduled for a different date: ' || v_other_date::text
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'found', false,
        'token_number', '#' || v_clean_str,
        'has_other_date', false,
        'message', 'Token not found for today''s active consultation schedule.'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'Unable to retrieve token status at this time.'
    );
END;
$$;

COMMENT ON FUNCTION public.get_public_token_status(UUID, TEXT, DATE, TEXT) IS
  'Authoritative token status lookup RPC with zero PHI, canonical tenant validation, and dual parameter compatibility.';

REVOKE ALL ON FUNCTION public.get_public_token_status(UUID, TEXT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_token_status(UUID, TEXT, DATE, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 5. submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
-- ------------------------------------------------------------------------------
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
    -- Verify organization validity and canonical status
    SELECT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = p_org_id AND is_active = TRUE AND is_canonical_public = TRUE
    ) INTO v_org_exists;

    IF NOT v_org_exists THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Invalid or unauthorized hospital organization target.');
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
    RETURN jsonb_build_object('success', false, 'error', 'Unable to submit inquiry at this time. Please try again later.');
END;
$$;

COMMENT ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Public contact inquiry submission RPC with anti-abuse rate limiting and canonical tenant guard.';

REVOKE ALL ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 6. book_online_appointment (Drop legacy overloads, unify parameters)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, INT, TEXT);
DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.book_online_appointment(
    p_org_id            UUID,
    p_doctor_id         UUID,
    p_schedule_id       UUID,
    p_appointment_date  DATE,
    p_patient_name      TEXT,
    p_patient_phone     TEXT,
    p_patient_age       INT DEFAULT NULL,
    p_patient_gender    TEXT DEFAULT 'OTHER',
    p_patient_notes     TEXT DEFAULT NULL,
    p_notes             TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id        UUID;
    v_patient_code      VARCHAR;
    v_token             INT;
    v_department_id     UUID;
    v_appointment_id    UUID;
    v_clean_phone       VARCHAR;
    v_raw_phone         VARCHAR;
    v_trimmed_name      VARCHAR;
    v_gender_upper      VARCHAR;
    v_doctor_active     BOOLEAN;
    v_doctor_public     BOOLEAN;
    v_room_number       VARCHAR;
    v_doctor_name       VARCHAR;
    v_opd_fee           NUMERIC(10, 2);
    v_is_leave          BOOLEAN;
    v_capacity          INT;
    v_booked_count      INT;
    v_day_name          VARCHAR;
    v_schedule_day      VARCHAR;
    v_schedule_doctor_id UUID;
    v_schedule_org_id   UUID;
    v_schedule_active   BOOLEAN;
    v_org_active        BOOLEAN;
    v_org_canonical     BOOLEAN;
    v_today_dhaka       DATE;
    v_combined_notes    TEXT;
BEGIN
    -- ── Validation 1: Patient Name ──────────────────────────────
    v_trimmed_name := TRIM(COALESCE(p_patient_name, ''));
    IF length(v_trimmed_name) < 2 OR length(v_trimmed_name) > 120 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Patient name must be between 2 and 120 characters.'
        );
    END IF;

    -- ── Validation 2: Phone — STRICT FORMAT BEFORE STRIP ───────
    v_raw_phone := TRIM(COALESCE(p_patient_phone, ''));
    IF v_raw_phone !~ '^(01[3-9][0-9]{8}|8801[3-9][0-9]{8}|\+8801[3-9][0-9]{8})$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid phone format. Accepted formats: 01XXXXXXXXX, 8801XXXXXXXXX, or +8801XXXXXXXXX (Bangladeshi mobile only).'
        );
    END IF;
    -- Normalize to 11-digit local format
    v_clean_phone := CASE
        WHEN v_raw_phone LIKE '+880%' THEN substring(v_raw_phone FROM 4)
        WHEN v_raw_phone LIKE '880%'  THEN substring(v_raw_phone FROM 4)
        ELSE v_raw_phone
    END;
    -- Final regex guard
    IF v_clean_phone !~ '^01[3-9][0-9]{8}$' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid Bangladeshi mobile number after normalization. Must be 01XXXXXXXXX (operator 013-019).'
        );
    END IF;

    -- ── Validation 3: Patient Age ───────────────────────────────
    IF p_patient_age IS NOT NULL AND (p_patient_age < 0 OR p_patient_age > 125) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Patient age must be between 0 and 125 years.'
        );
    END IF;

    -- ── Validation 4: Gender ────────────────────────────────────
    v_gender_upper := UPPER(TRIM(COALESCE(p_patient_gender, 'OTHER')));
    IF v_gender_upper NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid gender specified. Must be MALE, FEMALE, or OTHER.'
        );
    END IF;

    -- ── Validation 5: Notes length (unified notes resolution) ────
    v_combined_notes := COALESCE(NULLIF(TRIM(p_patient_notes), ''), NULLIF(TRIM(p_notes), ''));
    IF v_combined_notes IS NOT NULL AND length(v_combined_notes) > 500 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Patient notes must not exceed 500 characters.'
        );
    END IF;

    -- ── Gate 0: Canonical organization boundary ─────────────────
    SELECT is_active, is_canonical_public
    INTO v_org_active, v_org_canonical
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Invalid or inactive hospital organization.'
        );
    END IF;
    IF v_org_canonical IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', '403 Forbidden: Organization is not authorized for public online booking.'
        );
    END IF;

    -- ── Gate 1: Schedule must be provided ──────────────────────
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Mandatory slot selection: p_schedule_id must be provided.'
        );
    END IF;

    -- ── Gate 2: Past-date check in Asia/Dhaka ──────────────────
    v_today_dhaka := (timezone('Asia/Dhaka', NOW()))::DATE;
    IF p_appointment_date < v_today_dhaka THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot book appointments for past dates.'
        );
    END IF;

    -- ── Concurrency Lock: doctor + date scope ──────────────────
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_appointment_date::text)
    );

    -- ── Gate 3: Doctor active, public, and profile ─────────────
    SELECT is_active, is_public, room_number, full_name, opd_fee
    INTO v_doctor_active, v_doctor_public, v_room_number, v_doctor_name, v_opd_fee
    FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Doctor is not currently available for public online booking.'
        );
    END IF;

    -- ── Gate 4: Schedule ownership and status ──────────────────
    SELECT doctor_id, organization_id, max_tokens, is_active,
           UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity,
          v_schedule_active, v_schedule_day
    FROM public.doctor_schedules
    WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Schedule slot not found.'
        );
    END IF;
    IF v_schedule_doctor_id <> p_doctor_id OR v_schedule_org_id <> p_org_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Schedule slot does not belong to the specified doctor or organization.'
        );
    END IF;
    IF v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Schedule slot is not currently active.'
        );
    END IF;

    -- ── Gate 5: Day-of-week match ───────────────────────────────
    v_day_name := UPPER(TO_CHAR(p_appointment_date, 'FMDay'));
    IF v_day_name <> v_schedule_day THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Appointment date does not match schedule day of week.'
        );
    END IF;

    -- ── Gate 6: Leave check (Accurate table: public.doctor_leaves) ───
    SELECT EXISTS (
        SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Doctor has a leave scheduled for the requested date.'
        );
    END IF;

    -- ── Gate 7: Capacity check ──────────────────────────────────
    SELECT COUNT(*) INTO v_booked_count
    FROM public.appointments
    WHERE organization_id = p_org_id
      AND doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date
      AND schedule_id = p_schedule_id
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Selected doctor schedule capacity has been reached for this date.'
        );
    END IF;

    -- ── Gate 8: Department resolution with TENANT BOUNDARY ─────
    SELECT dd.department_id INTO v_department_id
    FROM public.doctor_departments dd
    JOIN public.departments d
        ON dd.department_id = d.id
        AND d.is_active = TRUE
        AND d.organization_id = p_org_id
    WHERE dd.doctor_id = p_doctor_id
    ORDER BY dd.is_primary DESC NULLS LAST
    LIMIT 1;

    IF v_department_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Doctor department mapping is unavailable or inactive within this organization.'
        );
    END IF;

    -- ── Gate 9: Race-safe patient upsert ───────────────────────
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM public.patients
    WHERE organization_id = p_org_id
      AND normalized_phone = v_clean_phone
      AND is_deleted = FALSE
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        INSERT INTO public.patients (
            organization_id,
            full_name,
            gender,
            age,
            phone,
            normalized_phone,
            is_temporary
        ) VALUES (
            p_org_id,
            v_trimmed_name,
            v_gender_upper,
            p_patient_age,
            v_clean_phone,
            v_clean_phone,
            TRUE
        )
        ON CONFLICT (organization_id, normalized_phone)
        WHERE normalized_phone IS NOT NULL AND is_deleted = FALSE
        DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id, patient_code INTO v_patient_id, v_patient_code;
    END IF;

    -- ── Token counter (advisory-locked, race-safe 3-argument call) ──
    SELECT public.get_next_token(p_org_id, p_doctor_id, p_appointment_date)
    INTO v_token;

    -- ── Insert appointment ──────────────────────────────────────
    INSERT INTO public.appointments (
        organization_id,
        patient_id,
        doctor_id,
        department_id,
        schedule_id,
        appointment_date,
        token_number,
        source,
        status,
        payment_status,
        patient_notes
    ) VALUES (
        p_org_id,
        v_patient_id,
        p_doctor_id,
        v_department_id,
        p_schedule_id,
        p_appointment_date,
        v_token,
        'ONLINE',
        'WAITING',
        'PENDING',
        v_combined_notes
    )
    RETURNING id INTO v_appointment_id;

    RETURN jsonb_build_object(
        'success',        true,
        'appointment_id', v_appointment_id,
        'token_number',   v_token,
        'patient_code',   v_patient_code,
        'doctor_name',    v_doctor_name,
        'room_number',    v_room_number,
        'opd_fee',        v_opd_fee
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error',   'Booking failed due to an internal error. Please try again.'
    );
END;
$$;

COMMENT ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT) IS
  'Authoritative public booking RPC with canonical tenant validation, concurrency advisory locks, leave check, and unified notes parameter compatibility.';

REVOKE ALL ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 7. NOTIFY POSTGREST SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
