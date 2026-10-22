-- ==============================================================================
-- OHMS PRODUCTION DATABASE HARDENING — FORWARD MIGRATION 251
-- Migration: 20261022140000_migration_251_harden_public_booking_anti_abuse_and_rate_limits.sql
-- Description: Hardens public online booking and contact inquiry RPCs with
--              transactional anti-abuse protections, per-phone rapid-fire burst
--              throttling, daily booking quota guards, and duplicate-booking
--              idempotency.
-- Authoritative Schema Target: PostgreSQL 17.6 / Supabase Link
-- Date: 2026-10-22
-- Invariants Preserved:
--   1. Zero Blanket Grants: Only certified public-facing endpoints retain anon EXECUTE.
--   2. Strict Canonical Tenant Isolation: All queries fail closed if is_canonical_public = FALSE.
--   3. Immutable Search Path: SET search_path = '' on all SECURITY DEFINER functions.
--   4. Zero PII/PHI Leakage: Pure projection of tokens and rooms, zero patient data returned.
--   5. Idempotent Double-Click Protection: Re-submitting same patient+doctor+date returns existing token.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
--    Hardened with transactional advisory lock on phone number to prevent
--    concurrency race condition on 5-inquiries-per-hour rate limit.
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
    -- Verify organization validity and canonical public status
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

    -- Concurrency serialization lock per phone to prevent concurrent bypass
    PERFORM pg_advisory_xact_lock(hashtext('contact_phone:' || v_clean_phone));

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
  'Public contact inquiry submission RPC with transactional anti-abuse rate limiting and canonical tenant guard.';

REVOKE ALL ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_contact_inquiry(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT)
--    Hardened with:
--    A. Transactional lock per phone to prevent concurrent bypass races.
--    B. Rapid-fire burst throttle (minimum 15 seconds between submissions).
--    C. Daily quota per phone number (maximum 3 active bookings per day).
--    D. Idempotent duplicate-booking check (same patient + doctor + date).
--    E. Concurrency capacity lock per doctor + date.
-- ------------------------------------------------------------------------------
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
    v_is_burst          BOOLEAN;
    v_phone_daily_count INT;
    v_existing_appt_id  UUID;
    v_existing_token    TEXT;
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

    -- ── Transactional Lock A: Serialize phone number requests ───
    PERFORM pg_advisory_xact_lock(hashtext('booking_phone:' || v_clean_phone));

    -- ── Anti-Abuse Check 1: Rapid-fire burst throttle (15 seconds) ──
    SELECT EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.patients p ON p.id = a.patient_id
        WHERE a.organization_id = p_org_id
          AND p.normalized_phone = v_clean_phone
          AND a.created_at >= NOW() - INTERVAL '15 seconds'
    ) INTO v_is_burst;

    IF v_is_burst THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Please wait a moment before booking another appointment. Rapid consecutive submissions are throttled for security.'
        );
    END IF;

    -- ── Anti-Abuse Check 2: Daily Quota (Max 3 appointments/day/phone) ──
    SELECT COUNT(*) INTO v_phone_daily_count
    FROM public.appointments a
    JOIN public.patients p ON p.id = a.patient_id
    WHERE a.organization_id = p_org_id
      AND p.normalized_phone = v_clean_phone
      AND a.appointment_date = p_appointment_date
      AND a.status IN ('WAITING', 'SCHEDULED', 'CONFIRMED', 'IN_CONSULTATION', 'IN_CHAMBER');

    IF v_phone_daily_count >= 3 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Daily booking limit reached: A maximum of 3 active appointments per mobile number is permitted per day. Please contact hospital reception for assistance.'
        );
    END IF;

    -- ── Transactional Lock B: doctor + date scope concurrency lock ───
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

    -- ── Gate 9: Race-safe patient resolution ───────────────────
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM public.patients
    WHERE organization_id = p_org_id
      AND normalized_phone = v_clean_phone
      AND is_deleted = FALSE
    LIMIT 1;

    -- ── Idempotency Check: Existing Active Appointment for same patient+doctor+date ──
    IF v_patient_id IS NOT NULL THEN
        SELECT a.id, a.token_number
        INTO v_existing_appt_id, v_existing_token
        FROM public.appointments a
        WHERE a.organization_id = p_org_id
          AND a.patient_id = v_patient_id
          AND a.doctor_id = p_doctor_id
          AND a.appointment_date = p_appointment_date
          AND a.status IN ('WAITING', 'SCHEDULED', 'CONFIRMED', 'IN_CONSULTATION', 'IN_CHAMBER')
        LIMIT 1;

        IF v_existing_appt_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success',          true,
                'already_booked',   true,
                'appointment_id',   v_existing_appt_id,
                'token_number',     v_existing_token,
                'patient_code',     v_patient_code,
                'appointment_date', p_appointment_date,
                'doctor_name',      v_doctor_name,
                'room_number',      v_room_number,
                'opd_fee',          v_opd_fee,
                'message',          'An active appointment (Token #' || v_existing_token::text || ') is already confirmed for this patient with ' || v_doctor_name || ' on this date.'
            );
        END IF;
    END IF;

    -- Upsert patient if not present
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
        'success',          true,
        'appointment_id',   v_appointment_id,
        'token_number',     v_token,
        'patient_code',     v_patient_code,
        'appointment_date', p_appointment_date,
        'doctor_name',      v_doctor_name,
        'room_number',      v_room_number,
        'opd_fee',          v_opd_fee
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error',   'Booking failed due to an internal error. Please try again.'
    );
END;
$$;

COMMENT ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT) IS
  'Authoritative public booking RPC with canonical tenant validation, concurrency advisory locks, leave check, burst throttle, daily quota, duplicate idempotency, and unified notes parameter compatibility.';

REVOKE ALL ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
