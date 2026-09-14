-- =====================================================================================
-- 028_phase22_authoritative_slot_concurrency_rbac.sql
-- Onnesha Hospital Management System (OHMS) - Phase 22 Final Production Hardening
-- 1. Authoritative Schedule Slot Validation (Mandatory p_schedule_id)
-- 2. Concurrency-Safe Capacity Lock via Transaction Advisory Locks
-- 3. DB-Level RBAC Authorization for Staff Appointment Booking RPC
-- 4. Public Organization Boundary Validation
-- 5. Strict Security Definer search_path Isolation & EXECUTE Grant Hardening
-- =====================================================================================

-- 1. Redefine book_online_appointment RPC (Authoritative Slot + Advisory Lock + Org Boundary)
CREATE OR REPLACE FUNCTION book_online_appointment(
    p_org_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_patient_name VARCHAR,
    p_patient_phone VARCHAR,
    p_patient_gender VARCHAR,
    p_schedule_id UUID DEFAULT NULL,
    p_patient_age INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
    -- Validate p_org_id boundary
    SELECT is_active INTO v_org_active
    FROM organizations
    WHERE id = p_org_id;

    IF v_org_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Invalid or inactive hospital organization.');
    END IF;

    -- Validate mandatory schedule_id parameter
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory slot selection: p_schedule_id must be provided.');
    END IF;

    -- Validate date is not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Acquire transaction advisory lock for exact org + doctor + schedule + date to serialize concurrent requests
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    -- Verify doctor exists, active, and public
    SELECT is_active, COALESCE(is_public, true), room_number 
    INTO v_doctor_active, v_doctor_public, v_room_number
    FROM doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE OR v_doctor_public IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for public online booking.');
    END IF;

    -- Verify selected schedule exists, belongs to doctor and org, and is active
    SELECT doctor_id, organization_id, max_tokens, is_active, UPPER(TRIM(day_of_week))
    INTO v_schedule_doctor_id, v_schedule_org_id, v_capacity, v_schedule_active, v_schedule_day
    FROM doctor_schedules
    WHERE id = p_schedule_id;

    IF v_schedule_doctor_id IS NULL OR v_schedule_doctor_id != p_doctor_id OR v_schedule_org_id != p_org_id OR v_schedule_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, inactive, or mismatched doctor schedule slot selected.');
    END IF;

    -- Verify schedule day matches appointment date day of week
    v_day_name := UPPER(TRIM(TO_CHAR(p_appointment_date, 'DAY')));
    IF v_schedule_day != v_day_name AND v_schedule_day != TRIM(TO_CHAR(p_appointment_date, 'D')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected schedule slot is not active on the chosen day of the week.');
    END IF;

    -- Check if doctor is on scheduled leave
    SELECT EXISTS (
        SELECT 1 FROM doctor_leaves 
        WHERE doctor_id = p_doctor_id 
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Count existing non-cancelled bookings for exact schedule and date
    SELECT COUNT(*) INTO v_booked_count
    FROM appointments
    WHERE doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date
      AND (schedule_id = p_schedule_id OR schedule_id IS NULL)
      AND status NOT IN ('CANCELLED', 'NO_SHOW');

    IF v_capacity IS NOT NULL AND v_capacity > 0 AND v_booked_count >= v_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Selected doctor schedule capacity has been reached for this date.');
    END IF;

    -- Find primary department
    SELECT department_id INTO v_department_id
    FROM doctor_departments
    WHERE doctor_id = p_doctor_id
    LIMIT 1;

    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Normalize Phone
    v_clean_phone := REGEXP_REPLACE(p_patient_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_clean_phone) = 13 AND v_clean_phone LIKE '8801%' THEN
        v_clean_phone := SUBSTRING(v_clean_phone FROM 3);
    END IF;

    IF LENGTH(v_clean_phone) < 11 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid Bangladeshi contact number.');
    END IF;

    -- Find existing patient by normalized phone or create new record
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM patients
    WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        v_patient_code := generate_patient_code(p_org_id);
        INSERT INTO patients (
            organization_id,
            patient_code,
            full_name,
            phone,
            normalized_phone,
            gender,
            age_years
        ) VALUES (
            p_org_id,
            v_patient_code,
            p_patient_name,
            v_clean_phone,
            v_clean_phone,
            COALESCE(p_patient_gender, 'OTHER'),
            p_patient_age
        )
        RETURNING id INTO v_patient_id;
    END IF;

    -- Allocate atomic next token for doctor on date
    v_token := get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert Appointment Record
    INSERT INTO appointments (
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
        p_notes
    )
    RETURNING id INTO v_appointment_id;

    -- Insert into Live Waiting Queue
    INSERT INTO waiting_queue (
        organization_id,
        appointment_id,
        doctor_id,
        room_number,
        token_number,
        queue_status
    ) VALUES (
        p_org_id,
        v_appointment_id,
        p_doctor_id,
        COALESCE(v_room_number, 'Chamber'),
        v_token,
        'WAITING'
    );

    -- Record Audit Log
    INSERT INTO audit_logs (
        organization_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_org_id,
        'CREATE',
        'PUBLIC_BOOKING',
        'appointment',
        v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id, 'scheduleId', p_schedule_id, 'patientCode', v_patient_code, 'appointmentDate', p_appointment_date)
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'token_number', v_token,
        'patient_code', v_patient_code,
        'appointment_date', p_appointment_date,
        'room_number', COALESCE(v_room_number, 'Chamber')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 2. Redefine book_staff_appointment_atomic RPC (DB-Level RBAC + Advisory Lock + Search Path)
CREATE OR REPLACE FUNCTION book_staff_appointment_atomic(
    p_org_id UUID,
    p_patient_id UUID,
    p_doctor_id UUID,
    p_schedule_id UUID DEFAULT NULL,
    p_appointment_date DATE DEFAULT CURRENT_DATE,
    p_source VARCHAR DEFAULT 'WALKIN',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_calling_user_id UUID;
    v_user_role VARCHAR;
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
BEGIN
    -- Verify calling user authentication
    v_calling_user_id := auth.uid();
    IF v_calling_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Calling user authentication required.');
    END IF;

    -- Verify caller profile belongs to p_org_id and check RBAC authorization inside DB
    SELECT role INTO v_user_role
    FROM profiles
    WHERE id = v_calling_user_id AND organization_id = p_org_id;

    IF v_user_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Calling user does not belong to active organization.');
    END IF;

    IF v_user_role NOT IN ('super_admin', 'admin', 'doctor', 'receptionist', 'nurse', 'staff') THEN
        SELECT EXISTS (
            SELECT 1 FROM user_permissions up
            JOIN permissions p ON up.permission_id = p.id
            WHERE up.user_id = v_calling_user_id AND p.name = 'appointments.create'
        ) INTO v_has_perm;

        IF v_has_perm IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Insufficient database privileges for appointment booking.');
        END IF;
    END IF;

    -- Verify patient exists in organization
    SELECT patient_code INTO v_patient_code
    FROM patients
    WHERE id = p_patient_id AND organization_id = p_org_id;

    IF v_patient_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Patient not found in active organization.');
    END IF;

    -- Verify doctor exists and is active in organization
    SELECT is_active, room_number INTO v_doctor_active, v_room_number
    FROM doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is inactive or not found.');
    END IF;

    -- Verify date is not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Acquire transaction advisory lock for concurrency safety
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || COALESCE(p_schedule_id::text, 'none') || ':' || p_appointment_date::text)
    );

    -- Check if doctor is on leave
    SELECT EXISTS (
        SELECT 1 FROM doctor_leaves
        WHERE doctor_id = p_doctor_id
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
    END IF;

    -- Check schedule capacity if schedule_id supplied
    IF p_schedule_id IS NOT NULL THEN
        SELECT max_tokens INTO v_capacity
        FROM doctor_schedules
        WHERE id = p_schedule_id AND doctor_id = p_doctor_id AND is_active = TRUE;

        IF v_capacity IS NOT NULL THEN
            SELECT COUNT(*) INTO v_booked_count
            FROM appointments
            WHERE doctor_id = p_doctor_id
              AND appointment_date = p_appointment_date
              AND (schedule_id = p_schedule_id OR schedule_id IS NULL)
              AND status NOT IN ('CANCELLED', 'NO_SHOW');

            IF v_booked_count >= v_capacity THEN
                RETURN jsonb_build_object('success', false, 'error', 'Doctor schedule capacity reached for selected date.');
            END IF;
        END IF;
    END IF;

    -- Get doctor department
    SELECT department_id INTO v_department_id
    FROM doctor_departments
    WHERE doctor_id = p_doctor_id
    LIMIT 1;

    IF v_department_id IS NULL THEN
        SELECT id INTO v_department_id FROM departments WHERE organization_id = p_org_id LIMIT 1;
    END IF;

    -- Atomic token allocation
    v_token := get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert Appointment Record
    INSERT INTO appointments (
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
        booked_by,
        patient_notes
    ) VALUES (
        p_org_id,
        p_patient_id,
        p_doctor_id,
        v_department_id,
        p_schedule_id,
        p_appointment_date,
        v_token,
        COALESCE(p_source, 'WALKIN'),
        'WAITING',
        'PENDING',
        v_calling_user_id,
        p_notes
    )
    RETURNING id INTO v_appointment_id;

    -- Insert into Live Waiting Queue
    INSERT INTO waiting_queue (
        organization_id,
        appointment_id,
        doctor_id,
        room_number,
        token_number,
        queue_status
    ) VALUES (
        p_org_id,
        v_appointment_id,
        p_doctor_id,
        COALESCE(v_room_number, 'Chamber'),
        v_token,
        'WAITING'
    );

    -- Record Audit Log
    INSERT INTO audit_logs (
        organization_id,
        user_id,
        action,
        module,
        entity_type,
        entity_id,
        new_values
    ) VALUES (
        p_org_id,
        v_calling_user_id,
        'CREATE',
        'APPOINTMENT',
        'appointment',
        v_appointment_id,
        jsonb_build_object('tokenNumber', v_token, 'doctorId', p_doctor_id, 'patientId', p_patient_id, 'appointmentDate', p_appointment_date)
    );

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'token_number', v_token,
        'patient_code', v_patient_code,
        'appointment_date', p_appointment_date,
        'room_number', COALESCE(v_room_number, 'Chamber')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 3. Security Definer EXECUTE Grant Hardening
REVOKE EXECUTE ON FUNCTION book_staff_appointment_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION book_staff_appointment_atomic TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION book_online_appointment TO anon, authenticated, service_role;
