-- =====================================================================================
-- Migration: 20260923160000_atomic_booking_authority_and_public_views.sql
-- Description:
--   1. Recreates public.book_online_appointment RPC:
--      - Retains strict canonical org gate (is_canonical_public = true, is_active = true)
--      - Selects full_name, room_number, opd_fee directly inside the atomic transaction
--      - Returns them in the JSONB response:
--          'doctor_name', v_doctor_name,
--          'room_number', COALESCE(v_room_number, ''),
--          'opd_fee', COALESCE(v_opd_fee, 0)
--      - Eliminates the need for any secondary client-side or action-side doctor lookups.
--   2. Recreates public.public_departments_view WITH (security_invoker = true):
--      - Dynamic inner join to public.organizations o ON departments.organization_id = o.id
--        AND o.is_active = TRUE AND o.is_canonical_public = TRUE
--      - Exposes only active, public departments for canonical public tenant.
--   3. Fixes public.get_public_live_queue:
--      - Eliminates invalid reference to non-existent a.serial_number column.
--      - Uses a.token_number exclusively.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- PART 1: Atomic Booking Authority in book_online_appointment
-- -------------------------------------------------------------------------------------

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

    -- Gate 2: Not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Concurrency lock: exact canonical_org + doctor + schedule + date
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    -- Gate 3: Public visibility & doctor profile resolution (atomic single query)
    SELECT is_active, is_public, room_number, full_name, opd_fee
    INTO v_doctor_active, v_doctor_public, v_room_number, v_doctor_name, v_opd_fee
    FROM public.doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for public online booking.');
    END IF;

    -- Gate 4: Schedule ownership + org + status
    SELECT doctor_id, organization_id, max_tokens, is_active, UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active, v_schedule_day
    FROM public.doctor_schedules
    WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id
       OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    -- Gate 5: Day-of-week match
    v_day_name := UPPER(TRIM(TO_CHAR(p_appointment_date, 'DAY')));
    IF v_schedule_day != v_day_name AND v_schedule_day != TRIM(TO_CHAR(p_appointment_date, 'D')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected schedule slot is not active on the chosen day of the week.');
    END IF;

    -- Gate 6: Leave check
    SELECT EXISTS (
        SELECT 1 FROM public.doctor_leaves
        WHERE doctor_id = p_doctor_id AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;
    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Gate 7: Strict capacity (exact org + doctor + schedule + date scope)
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
            'appointmentDate', p_appointment_date, 'doctorName', v_doctor_name));

    -- Return full authoritative booking result directly
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
IS 'Authoritative atomic online appointment booking RPC returning token, patient code, doctor name, room number, and OPD fee directly.';


-- -------------------------------------------------------------------------------------
-- PART 2: Secure Public Departments View WITH (security_invoker = true)
-- -------------------------------------------------------------------------------------

DROP VIEW IF EXISTS public.public_departments_view;

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
  AND (dept.is_public = TRUE OR dept.is_public IS NULL);

COMMENT ON VIEW public.public_departments_view IS 'Public department directory dynamically linked to canonical public organization with security_invoker = true';

REVOKE ALL ON public.public_departments_view FROM PUBLIC;
GRANT SELECT ON public.public_departments_view TO anon, authenticated, service_role;


-- -------------------------------------------------------------------------------------
-- PART 3: Fix public.get_public_live_queue (Remove Invalid a.serial_number Column)
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

REVOKE ALL ON FUNCTION public.get_public_live_queue(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_live_queue(UUID) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.get_public_live_queue(UUID)
IS 'Authoritative public live queue projection sanitized of patient PII and scoped to today with strict token ordering.';
