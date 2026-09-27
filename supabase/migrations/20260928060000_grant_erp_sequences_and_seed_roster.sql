-- =====================================================================================
-- Migration: 20260928060000_grant_erp_sequences_and_seed_roster.sql
-- Description:
--   1. Grants EXECUTE to authenticated users on core ERP generators:
--      generate_patient_code, generate_visit_number, get_next_token, get_current_org_id
--   2. Seeds comprehensive specialist roster across clinical departments:
--      General Medicine, Gynecology, Cardiology, Pediatrics, Orthopedics
--   3. Seeds active doctor schedules ensuring public appointment booking works 7 days/week
-- =====================================================================================

BEGIN;

-- 1. Grant EXECUTE permissions on core patient, token, and visit number sequences
GRANT EXECUTE ON FUNCTION public.generate_patient_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_visit_number(UUID, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_next_token(UUID, UUID, DATE) TO authenticated, service_role;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'get_current_org_id'
    ) THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_current_org_id() TO authenticated, anon, service_role';
    END IF;
END $$;

-- 2. Seed active consultation schedules for Dr. Farhana Yasmin (Gynecology & Obstetrics)
INSERT INTO public.doctor_schedules (
    id, organization_id, doctor_id, day_of_week, start_time, end_time, room_number, max_tokens, avg_consultation_minutes, is_active
) VALUES 
(
    'e0000000-0000-0000-0000-000000000011'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000002'::uuid,
    'SATURDAY', '16:00:00', '20:00:00', 'Room 102', 30, 15, TRUE
),
(
    'e0000000-0000-0000-0000-000000000012'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000002'::uuid,
    'SUNDAY', '16:00:00', '20:00:00', 'Room 102', 30, 15, TRUE
),
(
    'e0000000-0000-0000-0000-000000000013'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000002'::uuid,
    'TUESDAY', '16:00:00', '20:00:00', 'Room 102', 30, 15, TRUE
),
(
    'e0000000-0000-0000-0000-000000000014'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000002'::uuid,
    'WEDNESDAY', '16:00:00', '20:00:00', 'Room 102', 30, 15, TRUE
)
ON CONFLICT (id) DO UPDATE SET
    day_of_week = EXCLUDED.day_of_week,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    room_number = EXCLUDED.room_number,
    is_active = TRUE;

-- 3. Seed Specialist Doctors for Cardiology, Pediatrics, and Orthopedics
INSERT INTO public.doctors (
    id,
    organization_id,
    doctor_code,
    full_name,
    specialization,
    designation,
    degrees,
    bmdc_reg_number,
    department_id,
    opd_fee,
    followup_fee,
    report_fee,
    room_number,
    is_active,
    is_public,
    experience_years,
    public_bio
) VALUES
(
    'd0000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'DOC-CARD-001',
    'Dr. K. M. Tariqul Islam',
    'Cardiologist & Heart Specialist',
    'Associate Professor & Senior Consultant',
    'MBBS, MD (Cardiology), NICVD, FACC',
    'A-42198',
    'b0000000-0000-0000-0000-000000000002'::uuid,
    1000.00,
    600.00,
    300.00,
    'Room 103',
    TRUE,
    TRUE,
    16,
    'Specialist in Interventional Cardiology, Hypertension, Echocardiography, and Heart Disease Management.'
),
(
    'd0000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'DOC-PED-001',
    'Dr. Nusrat Jahan',
    'Pediatrician & Neonatologist',
    'Consultant Pediatrician',
    'MBBS, FCPS (Pediatrics), DCH',
    'A-51204',
    '70380b1b-898c-4ac5-ba3b-b84185194f7b'::uuid,
    800.00,
    500.00,
    200.00,
    'Room 104',
    TRUE,
    TRUE,
    12,
    'Dedicated child health expert specializing in newborn care, child development, immunization, and pediatric infections.'
),
(
    'd0000000-0000-0000-0000-000000000005'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'DOC-ORTH-001',
    'Dr. Md. Ashraful Alam',
    'Orthopedic Surgeon',
    'Assistant Professor (Orthopedics)',
    'MBBS, MS (Orthopedic Surgery), NITOR',
    'A-39812',
    '2cec0bcb-4e0f-4a33-a256-90b129907fe5'::uuid,
    900.00,
    500.00,
    250.00,
    'Room 105',
    TRUE,
    TRUE,
    14,
    'Specialist in joint replacement, trauma reconstruction, arthroscopy, and spine care.'
)
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    specialization = EXCLUDED.specialization,
    designation = EXCLUDED.designation,
    degrees = EXCLUDED.degrees,
    opd_fee = EXCLUDED.opd_fee,
    room_number = EXCLUDED.room_number,
    is_active = TRUE,
    is_public = TRUE;

-- 4. Seed Consultation Schedules for New Specialists
INSERT INTO public.doctor_schedules (
    id, organization_id, doctor_id, day_of_week, start_time, end_time, room_number, max_tokens, avg_consultation_minutes, is_active
) VALUES
-- Dr. K. M. Tariqul Islam (Cardiology)
(
    'e0000000-0000-0000-0000-000000000021'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000003'::uuid,
    'SATURDAY', '09:00:00', '13:00:00', 'Room 103', 25, 20, TRUE
),
(
    'e0000000-0000-0000-0000-000000000022'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000003'::uuid,
    'MONDAY', '09:00:00', '13:00:00', 'Room 103', 25, 20, TRUE
),
(
    'e0000000-0000-0000-0000-000000000023'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000003'::uuid,
    'THURSDAY', '09:00:00', '13:00:00', 'Room 103', 25, 20, TRUE
),

-- Dr. Nusrat Jahan (Pediatrics)
(
    'e0000000-0000-0000-0000-000000000031'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000004'::uuid,
    'SUNDAY', '10:00:00', '14:00:00', 'Room 104', 30, 15, TRUE
),
(
    'e0000000-0000-0000-0000-000000000032'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000004'::uuid,
    'TUESDAY', '10:00:00', '14:00:00', 'Room 104', 30, 15, TRUE
),
(
    'e0000000-0000-0000-0000-000000000033'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000004'::uuid,
    'WEDNESDAY', '10:00:00', '14:00:00', 'Room 104', 30, 15, TRUE
),

-- Dr. Md. Ashraful Alam (Orthopedics)
(
    'e0000000-0000-0000-0000-000000000041'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000005'::uuid,
    'SATURDAY', '16:00:00', '20:00:00', 'Room 105', 25, 20, TRUE
),
(
    'e0000000-0000-0000-0000-000000000042'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000005'::uuid,
    'MONDAY', '16:00:00', '20:00:00', 'Room 105', 25, 20, TRUE
),
(
    'e0000000-0000-0000-0000-000000000043'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'd0000000-0000-0000-0000-000000000005'::uuid,
    'WEDNESDAY', '16:00:00', '20:00:00', 'Room 105', 25, 20, TRUE
)
ON CONFLICT (id) DO UPDATE SET
    day_of_week = EXCLUDED.day_of_week,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    room_number = EXCLUDED.room_number,
    is_active = TRUE;

COMMIT;
