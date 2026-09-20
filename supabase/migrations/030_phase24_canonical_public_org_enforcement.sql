-- =====================================================================================
-- 030_phase24_canonical_public_org_enforcement.sql
-- Onnesha Hospital Management System (OHMS) - Phase 24
--
-- PROBLEM:
--   book_online_appointment() currently validates organizations.is_active only.
--   This means ANY active organization UUID could be accepted for public bookings.
--   However, the public web layer sends ONLY HOSPITAL_METADATA.id
--   (a0000000-0000-0000-0000-000000000001) — the canonical public-facing org.
--
-- FIX:
--   1. Add is_canonical_public BOOLEAN to organizations table.
--   2. Mark the canonical Onnesha Hospital org as is_canonical_public = TRUE.
--   3. Replace book_online_appointment() active-only org check with:
--        a. is_active = TRUE
--        b. is_canonical_public = TRUE
--      This enforces exactly one canonical public org at the DB layer,
--      without duplicating the UUID inside function bodies.
--
-- RATIONALE:
--   - Using a schema column avoids hardcoding the org UUID in multiple function bodies.
--   - The canonical org UUID is set ONCE in seed data (019_seed_reference_data.sql).
--   - The DB rule and the public web layer (HOSPITAL_METADATA.id) now resolve
--     to the same logical constraint via the is_canonical_public flag.
-- =====================================================================================

-- =====================================================================================
-- PART 1: Add is_canonical_public flag to organizations
-- =====================================================================================

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_canonical_public BOOLEAN DEFAULT FALSE;

-- Mark the canonical public hospital organization
UPDATE public.organizations
SET is_canonical_public = TRUE
WHERE id = 'a0000000-0000-0000-0000-000000000001'::UUID;

-- Ensure exactly one canonical public org:
-- 1. Reset any stray organizations to FALSE
UPDATE public.organizations
SET is_canonical_public = FALSE
WHERE id != 'a0000000-0000-0000-0000-000000000001'::UUID
  AND is_canonical_public IS TRUE;

-- 2. Database-level partial unique index: guarantees at most ONE organization can ever have is_canonical_public = TRUE
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_canonical_public
ON public.organizations (is_canonical_public)
WHERE is_canonical_public IS TRUE;

-- =====================================================================================
-- PART 2: Replace book_online_appointment with canonical-org-enforced version
-- (search_path = '', schema-qualified, canonical public org gate)
-- =====================================================================================

DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, INT, TEXT);

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
    v_doctor_active BOOLEAN;
    v_doctor_public BOOLEAN;
    v_room_number VARCHAR;
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
    -- ================================================================
    -- Gate 0: Canonical public organization boundary enforcement.
    -- The public web layer (lib/public/actions.ts) sends HOSPITAL_METADATA.id.
    -- The DB enforces that the org is both active AND is_canonical_public = TRUE.
    -- This means NO OTHER active org can accept public bookings even if supplied.
    -- ================================================================
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

    -- Gate: Mandatory schedule
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory slot selection: p_schedule_id must be provided.');
    END IF;

    -- Gate: Not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Concurrency lock: exact canonical_org + doctor + schedule + date
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    -- Gate: Public visibility check (is_public = TRUE enforced at DB)
    SELECT is_active, is_public, room_number INTO v_doctor_active, v_doctor_public, v_room_number
    FROM public.doctors WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for public online booking.');
    END IF;

    -- Gate: Schedule ownership + org + status
    SELECT doctor_id, organization_id, max_tokens, is_active, UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active, v_schedule_day
    FROM public.doctor_schedules WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id
       OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    -- Gate: Day-of-week match
    v_day_name := UPPER(TRIM(TO_CHAR(p_appointment_date, 'DAY')));
    IF v_schedule_day != v_day_name AND v_schedule_day != TRIM(TO_CHAR(p_appointment_date, 'D')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected schedule slot is not active on the chosen day of the week.');
    END IF;

    -- Gate: Leave check
    SELECT EXISTS (SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;
    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Gate: Strict capacity (exact org + doctor + schedule + date scope; no NULL leakage)
    SELECT COUNT(*) INTO v_booked_count
    FROM public.appointments
    WHERE organization_id = p_org_id AND doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date AND schedule_id = p_schedule_id
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected doctor schedule capacity has been reached for this date.');
    END IF;

    -- Department resolution
    SELECT department_id INTO v_department_id FROM public.doctor_departments
    WHERE doctor_id = p_doctor_id LIMIT 1;
    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM public.departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Phone normalization
    v_clean_phone := regexp_replace(p_patient_phone, '[^0-9]', '', 'g');
    IF length(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := substring(v_clean_phone FROM 3);
    END IF;
    IF length(v_clean_phone) < 11 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Bangladeshi contact number.');
    END IF;

    -- Patient match or create
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM public.patients WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone LIMIT 1;

    IF v_patient_id IS NULL THEN
        v_patient_code := public.generate_patient_code(p_org_id);
        INSERT INTO public.patients (organization_id, patient_code, full_name, phone,
            normalized_phone, gender, age_years)
        VALUES (p_org_id, v_patient_code, p_patient_name, v_clean_phone, v_clean_phone,
            COALESCE(p_patient_gender, 'OTHER'), p_patient_age)
        RETURNING id INTO v_patient_id;
    END IF;

    -- Atomic token allocation
    v_token := public.get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert appointment
    INSERT INTO public.appointments (organization_id, patient_id, doctor_id, department_id,
        schedule_id, appointment_date, token_number, source, status, payment_status, patient_notes)
    VALUES (p_org_id, v_patient_id, p_doctor_id, v_department_id, p_schedule_id, p_appointment_date,
        v_token, 'ONLINE', 'WAITING', 'PENDING', p_notes)
    RETURNING id INTO v_appointment_id;

    -- Insert into waiting queue
    INSERT INTO public.waiting_queue (organization_id, appointment_id, doctor_id,
        room_number, token_number, queue_status)
    VALUES (p_org_id, v_appointment_id, p_doctor_id, COALESCE(v_room_number, ''), v_token, 'WAITING');

    -- Audit log
    INSERT INTO public.audit_logs (organization_id, action, module, entity_type, entity_id, new_values)
    VALUES (p_org_id, 'CREATE', 'PUBLIC_BOOKING', 'appointment', v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id,
            'scheduleId', p_schedule_id, 'patientCode', v_patient_code,
            'appointmentDate', p_appointment_date));

    RETURN jsonb_build_object('success', true, 'appointment_id', v_appointment_id,
        'token_number', v_token, 'patient_code', v_patient_code,
        'appointment_date', p_appointment_date, 'room_number', COALESCE(v_room_number, ''));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking request could not be processed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_online_appointment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_online_appointment TO anon, authenticated, service_role;

-- =====================================================================================
-- PART 3: Ensure book_staff_appointment_atomic has matching search_path = '' hardening
-- (Re-confirm from 029; idempotent)
-- =====================================================================================

DROP FUNCTION IF EXISTS public.book_staff_appointment_atomic(UUID, UUID, UUID, UUID, DATE, VARCHAR, TEXT);

CREATE OR REPLACE FUNCTION public.book_staff_appointment_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_doctor_id UUID,
    p_schedule_id UUID,
    p_appointment_date DATE DEFAULT CURRENT_DATE,
    p_source VARCHAR DEFAULT 'WALKIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_perm BOOLEAN;
    v_doctor_active BOOLEAN;
    v_room_number VARCHAR;
    v_department_id UUID;
    v_token INT;
    v_appointment_id UUID;
    v_patient_code VARCHAR;
    v_is_leave BOOLEAN;
    v_capacity INT;
    v_booked_count INT;
    v_schedule_doctor_id UUID;
    v_schedule_org_id UUID;
    v_schedule_active BOOLEAN;
BEGIN
    v_calling_user_id := auth.uid();
    IF v_calling_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Calling user authentication required.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_calling_user_id AND is_active = TRUE) THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: User profile inactive or non-existent.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
          AND LOWER(r.name) IN ('super_admin', 'admin', 'doctor', 'receptionist', 'nurse', 'staff')
    ) INTO v_has_perm;

    IF v_has_perm IS NOT TRUE THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON ur.role_id = rp.role_id
            WHERE ur.user_id = v_calling_user_id AND ur.organization_id = p_org_id
              AND rp.permission_key IN ('appointments.create', 'appointments.manage', '*')
        ) INTO v_has_perm;
        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Insufficient database privileges for appointment booking.');
        END IF;
    END IF;

    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory schedule selection: p_schedule_id must be provided.');
    END IF;

    SELECT patient_code INTO v_patient_code FROM public.patients
    WHERE id = p_patient_id AND organization_id = p_org_id;
    IF v_patient_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in active organization.');
    END IF;

    SELECT is_active, room_number INTO v_doctor_active, v_room_number FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;
    IF v_doctor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is inactive or not found.');
    END IF;

    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    SELECT doctor_id, organization_id, max_tokens, is_active
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active
    FROM public.doctor_schedules WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id
       OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    SELECT EXISTS (SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;
    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    IF v_capacity IS NOT NULL AND v_capacity > 0 THEN
        SELECT COUNT(*) INTO v_booked_count FROM public.appointments
        WHERE doctor_id = p_doctor_id AND appointment_date = p_appointment_date
          AND schedule_id = p_schedule_id AND status NOT IN ('CANCELLED', 'NO_SHOW');
        IF v_booked_count >= v_capacity THEN
            RETURN jsonb_build_object('success', false, 'error', 'Doctor schedule capacity reached for selected date.');
        END IF;
    END IF;

    SELECT department_id INTO v_department_id FROM public.doctor_departments
    WHERE doctor_id = p_doctor_id LIMIT 1;
    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM public.departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    v_token := public.get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    INSERT INTO public.appointments (organization_id, patient_id, doctor_id, department_id,
        schedule_id, appointment_date, token_number, source, status, payment_status, booked_by, patient_notes)
    VALUES (p_org_id, p_patient_id, p_doctor_id, v_department_id, p_schedule_id, p_appointment_date,
        v_token, COALESCE(p_source, 'WALKIN'), 'WAITING', 'PENDING', v_calling_user_id, p_notes)
    RETURNING id INTO v_appointment_id;

    INSERT INTO public.waiting_queue (organization_id, appointment_id, doctor_id,
        room_number, token_number, queue_status)
    VALUES (p_org_id, v_appointment_id, p_doctor_id, COALESCE(v_room_number, ''), v_token, 'WAITING');

    INSERT INTO public.audit_logs (organization_id, user_id, action, module, entity_type, entity_id, new_values)
    VALUES (p_org_id, v_calling_user_id, 'CREATE', 'APPOINTMENT', 'appointment', v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id,
            'patientId', p_patient_id, 'scheduleId', p_schedule_id, 'appointmentDate', p_appointment_date));

    RETURN jsonb_build_object('success', true, 'appointment_id', v_appointment_id,
        'token_number', v_token, 'patient_code', v_patient_code,
        'appointment_date', p_appointment_date, 'room_number', COALESCE(v_room_number, ''));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Staff appointment booking could not be processed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_staff_appointment_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_staff_appointment_atomic TO authenticated, service_role;
