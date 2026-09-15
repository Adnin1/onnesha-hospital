-- =====================================================================================
-- 029_phase23_security_definer_search_path_hardening.sql
-- Onnesha Hospital Management System (OHMS) - Phase 23 Security Hardening
-- Upgrade all SECURITY DEFINER functions to SET search_path = '' (empty)
-- with fully schema-qualified object references, per Supabase current guidance.
-- This prevents search_path hijacking (privilege escalation via schema shadowing).
-- =====================================================================================

-- =====================================================================================
-- PART 1: Harden core identity helper functions (initial schema — no SET search_path)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.name FROM public.user_roles ur
  JOIN public.roles r ON ur.role_id = r.id
  WHERE ur.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role_id = rp.role_id
    WHERE ur.user_id = auth.uid() AND rp.permission_key = perm_code
  );
$$;

-- =====================================================================================
-- PART 2: Harden get_audit_trail_logs() + add auth guard
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_audit_trail_logs(
  p_org_id UUID,
  p_module VARCHAR DEFAULT NULL,
  p_action VARCHAR DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  organization_id UUID,
  user_id UUID,
  action VARCHAR,
  module VARCHAR,
  entity_type VARCHAR,
  entity_id VARCHAR,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR,
  user_agent TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '401 Unauthorized: Authentication required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = p_org_id
      AND LOWER(r.name) IN ('super_admin', 'admin')
  ) THEN
    RAISE EXCEPTION '403 Forbidden: Insufficient privileges to access audit logs.';
  END IF;

  RETURN QUERY
  SELECT a.id, a.organization_id, a.user_id, a.action, a.module,
         a.entity_type, a.entity_id, a.old_values, a.new_values,
         a.ip_address, a.user_agent, a.created_at
  FROM public.audit_logs a
  WHERE a.organization_id = p_org_id
    AND (p_module IS NULL OR a.module = p_module)
    AND (p_action IS NULL OR a.action = p_action)
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_audit_trail_logs FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_trail_logs TO authenticated, service_role;

-- =====================================================================================
-- PART 3: Harden verify_and_record_online_payment() + add auth guard + sanitize error
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.verify_and_record_online_payment(
    p_org_id UUID,
    p_intent_id UUID,
    p_provider_trx_id VARCHAR,
    p_paid_amount NUMERIC,
    p_gateway_method VARCHAR,
    p_cashier_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_intent RECORD;
    v_invoice RECORD;
    v_receipt_no VARCHAR;
    v_new_paid NUMERIC;
    v_new_due NUMERIC;
    v_new_status VARCHAR;
    v_payment_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', '401 Unauthorized: Authentication required.');
    END IF;

    SELECT * INTO v_intent FROM public.payment_intents
    WHERE id = p_intent_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment intent not found.');
    END IF;

    IF v_intent.status = 'PAID' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true, 'intent_reference', v_intent.intent_reference);
    END IF;

    SELECT * INTO v_invoice FROM public.invoices
    WHERE id = v_intent.invoice_id AND organization_id = p_org_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated invoice not found.');
    END IF;

    IF p_paid_amount != v_intent.payable_amount THEN
        INSERT INTO public.payment_reconciliations (
            organization_id, invoice_id, payment_intent_id, provider_transaction_id,
            expected_amount, received_amount, mismatch_type
        ) VALUES (
            p_org_id, v_invoice.id, v_intent.id, p_provider_trx_id,
            v_intent.payable_amount, p_paid_amount, 'AMOUNT_MISMATCH'
        );
        RETURN jsonb_build_object('success', false, 'error', 'Paid amount does not match expected payable amount.');
    END IF;

    v_new_paid := v_invoice.paid_amount + p_paid_amount;
    v_new_due := GREATEST(0, v_invoice.grand_total - v_new_paid);
    v_new_status := CASE WHEN v_new_due = 0 THEN 'PAID' ELSE 'PARTIAL' END;
    v_receipt_no := public.generate_receipt_number(p_org_id);

    INSERT INTO public.payments (
        organization_id, invoice_id, receipt_number, payment_method,
        amount, gateway_transaction_id, cashier_id, notes
    ) VALUES (
        p_org_id, v_invoice.id, v_receipt_no, p_gateway_method,
        p_paid_amount, p_provider_trx_id,
        COALESCE(p_cashier_id, v_invoice.created_by),
        'Online Gateway Settlement: ' || p_gateway_method || ' (Trx: ' || p_provider_trx_id || ')'
    ) RETURNING id INTO v_payment_id;

    UPDATE public.invoices SET paid_amount = v_new_paid, due_amount = v_new_due,
           status = v_new_status, updated_at = NOW() WHERE id = v_invoice.id;

    UPDATE public.payment_intents SET status = 'PAID', provider_transaction_id = p_provider_trx_id,
           verified_at = NOW(), updated_at = NOW() WHERE id = v_intent.id;

    RETURN jsonb_build_object('success', true, 'receipt_number', v_receipt_no,
        'payment_id', v_payment_id, 'invoice_number', v_invoice.invoice_number,
        'new_due', v_new_due, 'status', v_new_status);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment processing could not be completed. Please try again.');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_and_record_online_payment FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_and_record_online_payment TO authenticated, service_role;

-- =====================================================================================
-- PART 4: Canonical book_online_appointment — SET search_path = '' + schema-qualified
-- (Supersedes: 022, 027, 028 versions)
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
BEGIN
    -- Gate 10: Canonical organization boundary (cannot be bypassed by caller)
    SELECT is_active INTO v_org_active FROM public.organizations WHERE id = p_org_id;
    IF v_org_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', '403 Forbidden: Invalid or inactive hospital organization.');
    END IF;

    -- Gate: Mandatory schedule
    IF p_schedule_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory slot selection: p_schedule_id must be provided.');
    END IF;

    -- Gate: Not in the past
    IF p_appointment_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot book appointments for past dates.');
    END IF;

    -- Concurrency lock: exact org + doctor + schedule + date
    PERFORM pg_advisory_xact_lock(
        hashtext(p_org_id::text || ':' || p_doctor_id::text || ':' || p_schedule_id::text || ':' || p_appointment_date::text)
    );

    -- Gate 11: Public visibility check
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

    -- Gate 12: Strict capacity (no NULL-schedule leakage)
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
-- PART 5: Canonical book_staff_appointment_atomic — SET search_path = ''
-- (Supersedes: 027, 028 versions)
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

-- =====================================================================================
-- PART 6: Ensure doctors.is_public column with correct defaults
-- =====================================================================================

ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
UPDATE public.doctors SET is_public = TRUE WHERE is_public IS NULL AND is_active = TRUE;
UPDATE public.doctors SET is_public = FALSE WHERE is_public IS NULL AND is_active = FALSE;
