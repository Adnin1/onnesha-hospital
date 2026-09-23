-- ============================================================
-- Migration 64: Strict Phone Validation (format-before-strip),
--               Asia/Dhaka past-date gate, Department tenant-boundary,
--               Minimal-field public view projection, Live-queue semantic fix
-- Applied: 2026-09-23 20:00 UTC
-- ============================================================

-- ============================================================
-- 1. Minimal-field public_doctors_view
--    Strips: organization_id, bmdc_reg_number, is_active, is_public,
--            experience_years, bio (use public_bio only), followup_fee
--    Keeps:  id, full_name, degrees, designation, specialization,
--            room_number, opd_fee, avatar_url, public_bio,
--            department_id, department_name, department_slug
-- ============================================================
DROP VIEW IF EXISTS public.public_doctors_view CASCADE;

CREATE OR REPLACE VIEW public.public_doctors_view
WITH (security_invoker = true) AS
SELECT
    d.id,
    d.full_name,
    d.degrees,
    d.designation,
    d.specialization,
    d.room_number,
    d.opd_fee,
    d.avatar_url,
    d.public_bio,
    dept.id    AS department_id,
    dept.name  AS department_name,
    dept.slug  AS department_slug
FROM public.doctors d
JOIN public.organizations o
    ON d.organization_id = o.id
    AND o.is_active = TRUE
    AND o.is_canonical_public = TRUE
LEFT JOIN public.doctor_departments dd
    ON d.id = dd.doctor_id
    AND dd.is_primary = TRUE
LEFT JOIN public.departments dept
    ON dd.department_id = dept.id
    AND dept.is_active = TRUE
    AND dept.is_public = TRUE
WHERE d.is_active = TRUE
  AND d.is_public = TRUE;

COMMENT ON VIEW public.public_doctors_view IS
  'Minimal-projection public consultant directory. Strips internal identifiers (org_id, bmdc_reg_number), internal flags (is_public, is_active), and private financial data (followup_fee). security_invoker=true.';

REVOKE ALL ON public.public_doctors_view FROM PUBLIC;
GRANT SELECT ON public.public_doctors_view TO anon, authenticated, service_role;


-- ============================================================
-- 2. Minimal-field public_departments_view
--    Strips: organization_id, is_active, is_public, type, code
--    Keeps:  id, name, slug, description
-- ============================================================
DROP VIEW IF EXISTS public.public_departments_view CASCADE;

CREATE OR REPLACE VIEW public.public_departments_view
WITH (security_invoker = true) AS
SELECT
    dept.id,
    dept.name,
    dept.slug,
    dept.description
FROM public.departments dept
JOIN public.organizations o
    ON dept.organization_id = o.id
    AND o.is_active = TRUE
    AND o.is_canonical_public = TRUE
WHERE dept.is_active = TRUE
  AND dept.is_public = TRUE;

COMMENT ON VIEW public.public_departments_view IS
  'Minimal-projection public department list. Strips organization_id, internal type/code flags, is_active, is_public. security_invoker=true.';

REVOKE ALL ON public.public_departments_view FROM PUBLIC;
GRANT SELECT ON public.public_departments_view TO anon, authenticated, service_role;


-- ============================================================
-- 3. get_public_live_queue — fix "called_at" semantic misnaming
--    The field was labeled called_at but contained appointment
--    CREATION time. It is now renamed to "booked_at" (what it
--    actually is). Real call-time tracking requires a queue_calls
--    table which is a future operational feature.
-- ============================================================
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
  'Returns today''s active appointment queue for a public doctor. booked_at = appointment creation time in Asia/Dhaka; real "called" timestamps require a future queue_calls audit table. Uses Asia/Dhaka for date resolution.';


-- ============================================================
-- 4. Hardened book_online_appointment — FULL REPLACEMENT
--    Fixes applied vs migration 63:
--      a) Phone: validate raw format BEFORE stripping
--         Accepts only: 01XXXXXXXXX (11-digit local)
--                       +8801XXXXXXXXX or 8801XXXXXXXXX (13/14-digit intl)
--         Any other character combination is REJECTED before normalization.
--      b) Date gate: CURRENT_DATE → (timezone('Asia/Dhaka', NOW()))::DATE
--      c) Department tenant-boundary: adds d.organization_id = p_org_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.book_online_appointment(
    p_org_id            UUID,
    p_doctor_id         UUID,
    p_schedule_id       UUID,
    p_appointment_date  DATE,
    p_patient_name      TEXT,
    p_patient_phone     TEXT,
    p_patient_age       INT DEFAULT NULL,
    p_patient_gender    TEXT DEFAULT 'OTHER',
    p_patient_notes     TEXT DEFAULT NULL
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
    -- Only accepted raw formats:
    --   a) Local 11-digit:        ^01[3-9][0-9]{8}$
    --   b) Intl 13-digit:         ^8801[3-9][0-9]{8}$
    --   c) Intl 14-digit with +:  ^\+8801[3-9][0-9]{8}$
    --   Spaces and hyphens ONLY between digits are NOT accepted
    --   (avoids alpha-contamination bypass via regexp_replace).
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
    -- Final regex guard (belt-and-suspenders)
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

    -- ── Validation 5: Notes length ──────────────────────────────
    IF p_patient_notes IS NOT NULL AND length(p_patient_notes) > 500 THEN
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

    -- ── Gate 6: Leave check ─────────────────────────────────────
    SELECT EXISTS (
        SELECT 1 FROM public.doctor_leave_dates
        WHERE doctor_id = p_doctor_id
          AND organization_id = p_org_id
          AND leave_date = p_appointment_date
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
    -- CRITICAL: d.organization_id = p_org_id enforces cross-tenant isolation.
    SELECT dd.department_id INTO v_department_id
    FROM public.doctor_departments dd
    JOIN public.departments d
        ON dd.department_id = d.id
        AND d.is_active = TRUE
        AND d.organization_id = p_org_id   -- ← tenant-boundary enforcement
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

    -- ── Token counter (advisory-locked, race-safe) ──────────────
    SELECT public.get_next_token(p_org_id, p_doctor_id, p_schedule_id, p_appointment_date)
    INTO v_token;

    -- ── Insert appointment ──────────────────────────────────────
    INSERT INTO public.appointments (
        organization_id,
        doctor_id,
        schedule_id,
        department_id,
        patient_id,
        appointment_date,
        token_number,
        status,
        notes,
        is_online_booking
    ) VALUES (
        p_org_id,
        p_doctor_id,
        p_schedule_id,
        v_department_id,
        v_patient_id,
        p_appointment_date,
        v_token,
        'SCHEDULED',
        NULLIF(TRIM(COALESCE(p_patient_notes, '')), ''),
        TRUE
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

COMMENT ON FUNCTION public.book_online_appointment(UUID, UUID, UUID, DATE, TEXT, TEXT, INT, TEXT, TEXT) IS
  'Hardened public booking RPC. Fixes: (1) phone format validated BEFORE normalization (strict pattern match prevents alpha-contamination bypass), (2) past-date gate uses Asia/Dhaka local date, (3) department resolution includes organization_id tenant-boundary check.';
