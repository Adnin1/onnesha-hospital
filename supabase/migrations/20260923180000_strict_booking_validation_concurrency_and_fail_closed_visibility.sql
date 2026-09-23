-- =====================================================================================
-- Migration: 20260923180000_strict_booking_validation_concurrency_and_fail_closed_visibility.sql
-- Description:
--   1. Server-Side Input Validation in public.book_online_appointment:
--      - Trimmed patient name length must be between 2 and 120 characters.
--      - Patient phone must match strict Bangladeshi mobile format (^01[3-9][0-9]{8}$).
--      - Patient age (if provided) must be between 0 and 125.
--      - Patient gender must strictly be 'MALE', 'FEMALE', or 'OTHER'.
--      - Patient notes length must not exceed 500 characters.
--   2. Strict Department Resolution (Fail-Closed):
--      - Eliminates arbitrary fallback to any random department in the organization.
--      - If no doctor_departments mapping exists for the doctor, fails closed with a clear error.
--   3. Doctor/Day Token Serialization Advisory Lock:
--      - Broadens advisory lock from schedule-specific to (p_org_id, p_doctor_id, p_appointment_date).
--      - Ensures that all concurrent bookings for the same doctor on the same day serialize
--        their token counter and schedule capacity checks properly.
--   4. Concurrent Patient Match & Race-Safe Insert:
--      - Creates unique partial index on patients (organization_id, normalized_phone) WHERE normalized_phone IS NOT NULL.
--      - Uses ON CONFLICT (organization_id, normalized_phone) DO UPDATE to prevent duplicate patient inserts.
--   5. Hardened get_public_live_queue:
--      - Enforces organizations.is_canonical_public = TRUE and organizations.is_active = TRUE.
--      - Enforces doctors.is_active = TRUE and doctors.is_public = TRUE.
--   6. Fail-Closed Public Views & Schedules:
--      - public_doctors_view requires d.is_public = TRUE (removes IS NULL fallback).
--      - public_departments_view requires dept.is_public = TRUE (removes IS NULL fallback).
--      - get_public_doctor_schedules requires d.is_public = TRUE (removes IS NULL fallback).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- PART 1: Patient Unique Index for Concurrent Normalized Phone Safety
-- -------------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_org_normalized_phone_unique
ON public.patients (organization_id, normalized_phone)
WHERE normalized_phone IS NOT NULL AND is_deleted = FALSE;


-- -------------------------------------------------------------------------------------
-- PART 2: Fail-Closed Public Views
-- -------------------------------------------------------------------------------------

-- Recreate public_doctors_view with strict d.is_public = TRUE
DROP VIEW IF EXISTS public.public_doctors_view CASCADE;

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
    d.is_public,
    dept.id AS department_id,
    dept.name AS department_name,
    dept.slug AS department_slug
FROM public.doctors d
JOIN public.organizations o ON d.organization_id = o.id AND o.is_active = TRUE AND o.is_canonical_public = TRUE
LEFT JOIN public.doctor_departments dd ON d.id = dd.doctor_id AND dd.is_primary = TRUE
LEFT JOIN public.departments dept ON dd.department_id = dept.id AND dept.is_active = TRUE AND dept.is_public = TRUE
WHERE d.is_active = TRUE 
  AND d.is_public = TRUE;

COMMENT ON VIEW public.public_doctors_view IS 'Public consultant directory strictly filtered for active public consultants with security_invoker = true';

REVOKE ALL ON public.public_doctors_view FROM PUBLIC;
GRANT SELECT ON public.public_doctors_view TO anon, authenticated, service_role;


-- Recreate public_departments_view with strict dept.is_public = TRUE
DROP VIEW IF EXISTS public.public_departments_view CASCADE;

CREATE OR REPLACE VIEW public.public_departments_view
WITH (security_invoker = true) AS
SELECT 
    dept.id,
    dept.organization_id,
    dept.name,
    dept.code,
    dept.slug,
    dept.description,
    dept.type,
    dept.is_active,
    dept.is_public
FROM public.departments dept
JOIN public.organizations o ON dept.organization_id = o.id AND o.is_active = TRUE AND o.is_canonical_public = TRUE
WHERE dept.is_active = TRUE 
  AND dept.is_public = TRUE;

COMMENT ON VIEW public.public_departments_view IS 'Public department directory dynamically linked to canonical public organization with strict fail-closed public visibility';

REVOKE ALL ON public.public_departments_view FROM PUBLIC;
GRANT SELECT ON public.public_departments_view TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 3: Update get_public_doctor_schedules with Strict is_public = TRUE
-- -------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_public_doctor_schedules(UUID, UUID);

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

COMMENT ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) IS 'Authoritative public schedule RPC returning only active schedules for approved public doctors';

REVOKE ALL ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_doctor_schedules(UUID, UUID) TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 4: Hardened get_public_live_queue (Canonical Org + Public Active Doctor)
-- -------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_public_live_queue(UUID);

CREATE OR REPLACE FUNCTION public.get_public_live_queue(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today DATE;
    v_org_valid BOOLEAN;
    v_result JSONB;
BEGIN
    -- Verify organization validity, active status, and canonical public authority
    SELECT EXISTS (
        SELECT 1 FROM public.organizations
        WHERE id = p_org_id AND is_active = TRUE AND is_canonical_public = TRUE
    ) INTO v_org_valid;

    IF NOT v_org_valid THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Invalid or unauthorized hospital organization.', 'queue', '[]'::jsonb);
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
          AND d.is_active = TRUE
          AND d.is_public = TRUE
        ORDER BY a.token_number ASC
        LIMIT 50
    ) q;

    RETURN jsonb_build_object('success', true, 'queue', v_result);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Failed to retrieve public queue projection.', 'queue', '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_live_queue(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_live_queue(UUID) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_public_live_queue(UUID)
IS 'Authoritative public live queue projection sanitized of patient PII, gated by canonical public org and active public doctors.';


-- -------------------------------------------------------------------------------------
-- PART 5: Authoritative book_online_appointment with Server-Side Input Validation,
-- Fail-Closed Department Mapping, Concurrency Serialization, and Race-Safe Patient Upsert
-- -------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, UUID, INT, TEXT);

CREATE OR REPLACE FUNCTION public.book_online_appointment(
    p_org_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_patient_name VARCHAR,
    p_patient_phone VARCHAR,
    p_patient_gender VARCHAR,
    p_schedule_id UUID,
    p_patient_age INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id UUID;
    v_patient_code VARCHAR;
    v_token INT;
    v_department_id UUID;
    v_appointment_id UUID;
    v_clean_phone VARCHAR;
    v_trimmed_name VARCHAR;
    v_gender_upper VARCHAR;
    v_doctor_active BOOLEAN;
    v_doctor_public BOOLEAN;
    v_room_number VARCHAR;
    v_doctor_name VARCHAR;
    v_opd_fee NUMERIC(10, 2);
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_day_name VARCHAR;
    v_schedule_day VARCHAR;
    v_schedule_doctor_id UUID;
    v_schedule_org_id UUID;
    v_schedule_active BOOLEAN;
    v_org_active BOOLEAN;
    v_org_canonical BOOLEAN;
BEGIN
    -- Validation 1: Patient Name (Trimmed length 2 to 120 chars)
    v_trimmed_name := TRIM(COALESCE(p_patient_name, ''));
    IF length(v_trimmed_name) < 2 OR length(v_trimmed_name) > 120 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient name must be between 2 and 120 characters.');
    END IF;

    -- Validation 2: Phone Normalization & Bangladeshi Regex (^01[3-9][0-9]{8}$)
    v_clean_phone := regexp_replace(COALESCE(p_patient_phone, ''), '[^0-9]', '', 'g');
    IF length(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := substring(v_clean_phone FROM 3);
    END IF;
    IF v_clean_phone !~ '^01[3-9][0-9]{8}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Bangladeshi mobile number. Must be an 11-digit number starting with 013-019.');
    END IF;

    -- Validation 3: Patient Age (0 to 125 if provided)
    IF p_patient_age IS NOT NULL AND (p_patient_age < 0 OR p_patient_age > 125) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient age must be between 0 and 125 years.');
    END IF;

    -- Validation 4: Patient Gender (MALE, FEMALE, OTHER)
    v_gender_upper := UPPER(TRIM(COALESCE(p_patient_gender, 'OTHER')));
    IF v_gender_upper NOT IN ('MALE', 'FEMALE', 'OTHER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid gender specified. Must be MALE, FEMALE, or OTHER.');
    END IF;

    -- Validation 5: Notes length (max 500 chars)
    IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Notes cannot exceed 500 characters.');
    END IF;

    -- Gate 0: Canonical public organization boundary enforcement
    SELECT is_active, is_canonical_public
    INTO v_org_active, v_org_canonical
    FROM public.organizations
    WHERE id = p_org_id;

    IF v_org_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Invalid or inactive hospital organization.');
    END IF;

    IF v_org_canonical IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Organization is not authorized for public online booking.');
    END IF;

    -- Gate 1: Mandatory schedule
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory slot selection: p_schedule_id must be provided.');
    END IF;

    -- Gate 2: Appointment date must be today or in the future
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Concurrency Lock: Lock entire doctor day so all schedules serialize token counters and capacity
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_appointment_date::text)
    );

    -- Gate 3: Doctor existence, active status, public visibility, and profile resolution
    SELECT is_active, is_public, room_number, full_name, opd_fee
    INTO v_doctor_active, v_doctor_public, v_room_number, v_doctor_name, v_opd_fee
    FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for public online booking.');
    END IF;

    -- Gate 4: Schedule slot ownership, organization, and status
    SELECT doctor_id, organization_id, max_tokens, is_active, UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active, v_schedule_day
    FROM public.doctor_schedules
    WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id
       OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    -- Gate 5: Day of week verification
    v_day_name := UPPER(TRIM(TO_CHAR(p_appointment_date, 'DAY')));
    IF v_schedule_day != v_day_name AND v_schedule_day != TRIM(TO_CHAR(p_appointment_date, 'D')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected schedule slot is not active on the chosen day of the week.');
    END IF;

    -- Gate 6: Doctor leave verification
    SELECT EXISTS (
        SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;
    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Gate 7: Capacity limit check
    SELECT COUNT(*) INTO v_booked_count
    FROM public.appointments
    WHERE organization_id = p_org_id AND doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date AND schedule_id = p_schedule_id
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected doctor schedule capacity has been reached for this date.');
    END IF;

    -- Gate 8: Department Resolution (Fail-Closed: Do NOT assign arbitrary hospital department!)
    SELECT dd.department_id INTO v_department_id
    FROM public.doctor_departments dd
    JOIN public.departments d ON dd.department_id = d.id AND d.is_active = TRUE
    WHERE dd.doctor_id = p_doctor_id
    ORDER BY dd.is_primary DESC NULLS LAST
    LIMIT 1;

    IF v_department_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor department mapping is unavailable or inactive.');
    END IF;

    -- Gate 9: Race-safe patient lookup or creation
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM public.patients
    WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone AND is_deleted = FALSE
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        v_patient_code := public.generate_patient_code(p_org_id);
        INSERT INTO public.patients (
            organization_id, patient_code, full_name, phone,
            normalized_phone, gender, age_years
        )
        VALUES (
            p_org_id, v_patient_code, v_trimmed_name, v_clean_phone,
            v_clean_phone, v_gender_upper, p_patient_age
        )
        ON CONFLICT (organization_id, normalized_phone) WHERE normalized_phone IS NOT NULL AND is_deleted = FALSE
        DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id, patient_code INTO v_patient_id, v_patient_code;

        -- If ON CONFLICT returned nothing or patient_code was from update:
        IF v_patient_id IS NULL THEN
            SELECT id, patient_code INTO v_patient_id, v_patient_code
            FROM public.patients
            WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone AND is_deleted = FALSE
            LIMIT 1;
        END IF;
    END IF;

    -- Gate 10: Atomic Token Allocation
    v_token := public.get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Gate 11: Appointment Creation
    INSERT INTO public.appointments (
        organization_id, patient_id, doctor_id, department_id,
        schedule_id, appointment_date, token_number, source, status,
        payment_status, patient_notes
    )
    VALUES (
        p_org_id, v_patient_id, p_doctor_id, v_department_id,
        p_schedule_id, p_appointment_date, v_token, 'ONLINE', 'WAITING',
        'PENDING', p_notes
    )
    RETURNING id INTO v_appointment_id;

    -- Gate 12: Live Waiting Queue Insertion
    INSERT INTO public.waiting_queue (
        organization_id, appointment_id, doctor_id,
        room_number, token_number, queue_status
    )
    VALUES (
        p_org_id, v_appointment_id, p_doctor_id,
        COALESCE(v_room_number, ''), v_token, 'WAITING'
    );

    -- Gate 13: Audit Trail Log
    INSERT INTO public.audit_logs (
        organization_id, action, module, entity_type, entity_id, new_values
    )
    VALUES (
        p_org_id, 'CREATE', 'PUBLIC_BOOKING', 'appointment', v_appointment_id,
        jsonb_build_object(
            'tokenNumber', v_token,
            'doctorId', p_doctor_id,
            'scheduleId', p_schedule_id,
            'patientCode', v_patient_code,
            'appointmentDate', p_appointment_date,
            'doctorName', v_doctor_name
        )
    );

    -- Return authoritative booking projection
    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'token_number', v_token,
        'patient_code', v_patient_code,
        'appointment_date', p_appointment_date,
        'room_number', COALESCE(v_room_number, ''),
        'doctor_name', v_doctor_name,
        'opd_fee', COALESCE(v_opd_fee, 0)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking request could not be processed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_online_appointment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_online_appointment TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, UUID, INT, TEXT)
IS 'Authoritative atomic online appointment booking RPC with server-side validation, fail-closed department resolution, and concurrency serialization.';
