-- ==============================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM - SEED DATA
-- Default Organization, Departments, Roles, Doctors, Beds, and Tests
-- ==============================================================================

-- 1. Default Organization
INSERT INTO public.organizations (id, name, code, phone, email, address, subscription_tier, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Onnesha Hospital & Diagnostic Complex',
  'OH',
  '01712-345678',
  'contact@onneshahospital.com',
  'Hospital Road, Main Bazar, Dhaka, Bangladesh',
  'enterprise',
  true
) ON CONFLICT DO NOTHING;

-- 2. Default Departments
INSERT INTO public.departments (id, organization_id, name, code, type, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'General Medicine', 'MED', 'clinical', true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Cardiology & Heart Care', 'CARD', 'clinical', true),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Gynecology & Obstetrics', 'GYN', 'clinical', true),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Pediatrics & Child Health', 'PED', 'clinical', true),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Orthopedic Surgery', 'ORTH', 'clinical', true),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Pathology & Biochemistry', 'PATH', 'diagnostic', true),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Radiology & Imaging', 'RAD', 'diagnostic', true)
ON CONFLICT DO NOTHING;

-- 3. System Roles
INSERT INTO public.roles (id, organization_id, name, label, description, is_system)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'super_admin', 'Super Admin', 'Full system access and tenant management', true),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'admin', 'Hospital Admin', 'Hospital operational management', true),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'doctor', 'Doctor / Consultant', 'OPD consultations, digital prescriptions, patient history', true),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'receptionist', 'Front Desk / Reception', 'Patient registration, appointments, token queue', true),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'accountant', 'Billing & Cashier', 'Invoice generation, cash collection, dues, refunds', true),
  ('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'lab_technician', 'Lab Technician', 'Sample collection, lab orders, test results', true),
  ('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'pharmacist', 'Pharmacist', 'Pharmacy POS, stock management, batch expiry', true)
ON CONFLICT DO NOTHING;

-- 4. Sample Doctors
INSERT INTO public.doctors (id, organization_id, doctor_code, full_name, specialization, designation, degrees, bmdc_reg_number, department_id, opd_fee, room_number, is_active)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'DOC-001', 'Prof. Dr. M. A. Rahman', 'Medicine Specialist', 'Senior Consultant', 'MBBS, FCPS (Medicine), MACP (USA)', 'A-12490', 'b0000000-0000-0000-0000-000000000001', 800.00, 'Room 101', true),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'DOC-002', 'Dr. Farhana Yasmin', 'Gynecologist & Obstetrician', 'Associate Professor', 'MBBS, DGO, FCPS (Gynae & Obs)', 'A-23812', 'b0000000-0000-0000-0000-000000000003', 700.00, 'Room 102', true),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'DOC-003', 'Dr. Tanvir Ahmed', 'Cardiologist', 'Consultant', 'MBBS, MD (Cardiology)', 'A-31908', 'b0000000-0000-0000-0000-000000000002', 1000.00, 'Room 103', true),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'DOC-004', 'Dr. Kazi Mahfuzur Rahman', 'Child Specialist & Pediatrician', 'Assistant Professor', 'MBBS, DCH, FCPS (Pediatrics)', 'A-19834', 'b0000000-0000-0000-0000-000000000004', 600.00, 'Room 104', true)
ON CONFLICT DO NOTHING;
