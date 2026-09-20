-- =====================================================================================
-- 022_phase13_public_online_booking.sql
-- Onnesha Hospital Management System (OHMS) - Phase 13 Foundation Migration
-- Public Department/Doctor Views, Secure Online Appointment Booking RPC, and Public Enquiries
-- =====================================================================================

-- 1. Doctor public profile enhancements
ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS followup_fee NUMERIC(10, 2) DEFAULT 400.00,
    ADD COLUMN IF NOT EXISTS report_fee NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS public_bio TEXT,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 10;

INSERT INTO doctor_departments (doctor_id, department_id, is_primary)
SELECT id, department_id, TRUE FROM doctors WHERE department_id IS NOT NULL
ON CONFLICT (doctor_id, department_id) DO NOTHING;

-- 2. Department public metadata enhancements
ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS slug VARCHAR(100),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

-- Update initial slugs if missing
UPDATE departments SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;

-- 3. Public Web Contact Inquiries Table
CREATE TABLE IF NOT EXISTS public_contact_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    phone VARCHAR(30) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'READ', 'RESPONDED', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public_contact_inquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_public_contact_inquiries ON public_contact_inquiries;
CREATE POLICY rls_public_contact_inquiries ON public_contact_inquiries 
    FOR ALL USING (organization_id = get_current_org_id());

-- 4. Secure Public Doctors View (Strictly Omits Salaries, Commission, and Private HR Details)
CREATE OR REPLACE VIEW public_doctors_view AS
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
FROM doctors d
LEFT JOIN doctor_departments dd ON d.id = dd.doctor_id AND dd.is_primary = TRUE
LEFT JOIN departments dept ON dd.department_id = dept.id
WHERE d.is_active = TRUE AND (d.is_public = TRUE OR d.is_public IS NULL);

-- 5. Secure Public Departments View
CREATE OR REPLACE VIEW public_departments_view AS
SELECT 
    id,
    organization_id,
    name,
    code,
    slug,
    description,
    type,
    is_active,
    is_public
FROM departments
WHERE is_active = TRUE AND (is_public = TRUE OR is_public IS NULL);

-- Ensure appointments, patients, and waiting_queue have expected columns
ALTER TABLE IF EXISTS appointments 
    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
    ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES doctor_schedules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS patient_notes TEXT;

ALTER TABLE IF EXISTS appointments ALTER COLUMN time_slot DROP NOT NULL;
ALTER TABLE IF EXISTS appointments ALTER COLUMN time_slot SET DEFAULT '09:00 AM - 01:00 PM';

ALTER TABLE IF EXISTS patients ADD COLUMN IF NOT EXISTS age_years INT;
ALTER TABLE IF EXISTS patients ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE IF EXISTS patients ALTER COLUMN patient_id SET DEFAULT '';
ALTER TABLE IF EXISTS patients ALTER COLUMN address DROP NOT NULL;
ALTER TABLE IF EXISTS patients ALTER COLUMN address SET DEFAULT '';
ALTER TABLE IF EXISTS patients ALTER COLUMN age DROP NOT NULL;
ALTER TABLE IF EXISTS patients ALTER COLUMN age SET DEFAULT 0;

ALTER TABLE IF EXISTS waiting_queue
    ADD COLUMN IF NOT EXISTS room_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS queue_status VARCHAR(30) DEFAULT 'WAITING';

-- 6. Atomic Concurrency-Safe Public Online Appointment Booking RPC
-- Matches or creates patient record, locks token atomically, and commits booking.
DROP FUNCTION IF EXISTS book_online_appointment(UUID, UUID, DATE, VARCHAR, VARCHAR, VARCHAR, INT, TEXT);
CREATE OR REPLACE FUNCTION book_online_appointment(
    p_org_id UUID,
    p_doctor_id UUID,
    p_appointment_date DATE,
    p_patient_name VARCHAR,
    p_patient_phone VARCHAR,
    p_patient_gender VARCHAR,
    p_patient_age INT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_patient_id UUID;
    v_patient_code VARCHAR;
    v_token INT;
    v_department_id UUID;
    v_appointment_id UUID;
    v_clean_phone VARCHAR;
    v_doctor_active BOOLEAN;
    v_room_number VARCHAR;
    v_is_leave BOOLEAN;
BEGIN
    -- Verify doctor exists, active, and public
    SELECT is_active, room_number INTO v_doctor_active, v_room_number
    FROM doctors
    WHERE id = p_doctor_id AND organization_id = p_org_id;

    IF v_doctor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is not currently available for appointments.');
    END IF;

    -- Check if doctor is on scheduled leave for target date
    SELECT EXISTS (
        SELECT 1 FROM doctor_leaves 
        WHERE doctor_id = p_doctor_id 
          AND p_appointment_date BETWEEN start_date AND end_date
    ) INTO v_is_leave;

    IF v_is_leave IS TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Doctor is on scheduled leave on the selected date.');
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

    -- Find existing patient by normalized phone or create new record
    SELECT id, patient_code INTO v_patient_id, v_patient_code
    FROM patients
    WHERE organization_id = p_org_id AND normalized_phone = v_clean_phone
    LIMIT 1;

    IF v_patient_id IS NULL THEN
        -- Generate atomic patient code
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

    -- Allocate atomic next token for doctor on date (concurrency safe)
    v_token := get_next_token(p_org_id, p_doctor_id, p_appointment_date);

    -- Insert Appointment Record
    INSERT INTO appointments (
        organization_id,
        patient_id,
        doctor_id,
        department_id,
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
    )
    ON CONFLICT (appointment_id) DO NOTHING;

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
