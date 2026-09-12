-- =====================================================================================
-- 019_REFERENCE_SEED_DATA.sql
-- Production baseline reference data: System roles, permissions, common BD departments,
-- payment methods, and Tenant Zero initialization (Onnesha Hospital).
-- No fake clinical or financial transactions are seeded.
-- =====================================================================================

-- 1. Initialize Tenant Zero: Onnesha Hospital
INSERT INTO organizations (id, name, code, slug, phone, email, address, status)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Onnesha Hospital & Diagnostic Complex',
    'OH',
    'onnesha-hospital',
    '01712-345678',
    'info@onneshahospital.com',
    'Hospital Road, Main Bazar, Dhaka, Bangladesh',
    'ACTIVE'
) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO organization_settings (organization_id, currency, timezone, patient_id_prefix, invoice_prefix)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'BDT',
    'Asia/Dhaka',
    'OH-P-',
    'OH-INV-'
) ON CONFLICT (organization_id) DO NOTHING;

-- 2. Populate Standard System Permissions
INSERT INTO permissions (key, module, description) VALUES
('patients.view', 'PATIENT', 'View patient directory and EMR records'),
('patients.create', 'PATIENT', 'Register new patients'),
('patients.update', 'PATIENT', 'Update patient demographic records'),
('patients.delete', 'PATIENT', 'Archive or soft-delete patient profiles'),
('appointments.view', 'APPOINTMENT', 'View doctor appointments and waiting queues'),
('appointments.create', 'APPOINTMENT', 'Book new appointments and issue serial tokens'),
('appointments.cancel', 'APPOINTMENT', 'Cancel or reschedule appointments'),
('prescriptions.write', 'CLINICAL', 'Create and sign electronic prescriptions'),
('billing.view', 'BILLING', 'View invoices, payment receipts and daily shifts'),
('billing.create', 'BILLING', 'Generate invoices and collect cashier payments'),
('billing.discount', 'BILLING', 'Apply cashier discount within permitted ceiling'),
('billing.discount_override', 'BILLING', 'Authorize manager/supervisory discount above ceiling'),
('billing.refund', 'BILLING', 'Authorize and process customer refunds'),
('billing.void', 'BILLING', 'Void erroneous invoices with mandatory audit trail'),
('lab.order', 'DIAGNOSTIC', 'Create diagnostic lab requisitions'),
('lab.collect', 'DIAGNOSTIC', 'Collect physical specimens and generate barcodes'),
('lab.result', 'DIAGNOSTIC', 'Input observed parameter result values'),
('lab.verify', 'DIAGNOSTIC', 'Electronically sign and authorize lab test reports'),
('pharmacy.view', 'PHARMACY', 'View medicine inventory and stock ledgers'),
('pharmacy.sale', 'PHARMACY', 'Dispense medicines at retail pharmacy counter'),
('pharmacy.purchase', 'PHARMACY', 'Receive purchase orders and input GRN'),
('pharmacy.adjust', 'PHARMACY', 'Perform inventory adjustments and batch write-offs'),
('ipd.admit', 'BED_IPD', 'Admit patients to wards/cabins and assign beds'),
('ipd.discharge', 'BED_IPD', 'Prepare and approve discharge summaries'),
('hr.view', 'HR', 'View employee directory and attendance logs'),
('hr.payroll', 'HR', 'Generate and approve monthly staff payroll'),
('settings.manage', 'SYSTEM', 'Manage organization settings, users and roles'),
('audit.view', 'SYSTEM', 'Inspect immutable security and financial audit logs')
ON CONFLICT (key) DO NOTHING;

-- 3. Populate Standard System Roles for Tenant Zero
INSERT INTO roles (id, organization_id, name, description, is_system) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Super Admin', 'Full administrative and financial authority', TRUE),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Doctor', 'Consultant clinical desk and prescription authority', TRUE),
('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Receptionist', 'Front desk registration and appointment calling', TRUE),
('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Cashier', 'Billing desk, invoice generation and payment receipts', TRUE),
('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Lab Technician', 'Phlebotomy and lab result entry desk', TRUE),
('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Pathologist', 'Diagnostic verification and signature authorization', TRUE),
('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Pharmacist', 'Pharmacy POS medicine dispensing and batch receiving', TRUE),
('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Nurse', 'IPD vitals logging, bed administration and care', TRUE)
ON CONFLICT (organization_id, name) DO NOTHING;

-- 4. Populate Standard Bangladesh Hospital Departments
INSERT INTO departments (organization_id, name, code, description) VALUES
('a0000000-0000-0000-0000-000000000001', 'General Medicine', 'MED', 'Internal and general medicine care'),
('a0000000-0000-0000-0000-000000000001', 'Cardiology & Heart Care', 'CARD', 'Cardiac OPD, ECG and Echo'),
('a0000000-0000-0000-0000-000000000001', 'Gynecology & Obstetrics', 'GYN', 'Maternal and womens health'),
('a0000000-0000-0000-0000-000000000001', 'Pediatrics & Child Health', 'PED', 'Newborn, infant and child care'),
('a0000000-0000-0000-0000-000000000001', 'Orthopedic Surgery', 'ORTH', 'Bone, joint and trauma surgery'),
('a0000000-0000-0000-0000-000000000001', 'Pathology & Lab Medicine', 'PATH', 'Clinical biochemistry and hematology'),
('a0000000-0000-0000-0000-000000000001', 'Radiology & Imaging', 'RAD', 'X-Ray, Ultrasonography and CT'),
('a0000000-0000-0000-0000-000000000001', 'Emergency & Critical Care', 'EMERG', '24/7 Acute trauma and resuscitation')
ON CONFLICT (organization_id, code) DO NOTHING;
