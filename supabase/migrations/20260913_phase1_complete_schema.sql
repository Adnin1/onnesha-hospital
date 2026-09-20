-- =====================================================================================
-- ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)
-- PHASE 1: COMPLETE DATABASE ARCHITECTURE & PRODUCTION SQL MIGRATION
-- Multi-Tenant SaaS, Row Level Security (RLS), Strict Data Integrity & Audit Vault
-- =====================================================================================

-- 0. EXTENSIONS & PREREQUISITES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================================
-- DOMAIN 1: TENANCY & IDENTITY MANAGEMENT (IAM)
-- =====================================================================================

-- 1.1 Organizations (Tenants)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(30),
    email VARCHAR(150),
    address TEXT,
    logo_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TRIAL')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.2 Organization Settings (White-labeling & Operational Rules)
CREATE TABLE IF NOT EXISTS organization_settings (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Dhaka',
    patient_id_prefix VARCHAR(10) NOT NULL DEFAULT 'OH-P-',
    invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'OH-INV-',
    emergency_hotline VARCHAR(30) DEFAULT '01712-345678',
    ambulance_hotline VARCHAR(30) DEFAULT '01800-445566',
    pad_top_margin_cm NUMERIC(4, 2) DEFAULT 3.5,
    pad_bottom_margin_cm NUMERIC(4, 2) DEFAULT 2.5,
    sms_sender_id VARCHAR(30) DEFAULT 'ONNESHA',
    max_cashier_discount_pct NUMERIC(5, 2) DEFAULT 10.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.3 System & Tenant Roles
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

-- 1.4 Granular Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (role_id, permission_key)
);

-- 1.5 User Profiles (Linked with Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY, -- Maps to auth.users.id
    phone VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.6 User Organization Roles (Multi-Tenant Mapping)
CREATE TABLE IF NOT EXISTS user_organization_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, user_id, role_id)
);

-- =====================================================================================
-- DOMAIN 2: PATIENTS & CLINICAL ENCOUNTERS
-- =====================================================================================

-- 2.1 Sequences for Clean Auto-Increment Patient Codes per Tenant
CREATE SEQUENCE IF NOT EXISTS patient_code_seq START WITH 10001;

-- 2.2 Patient Registry
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_code VARCHAR(30) NOT NULL,
    nid_or_birth_cert VARCHAR(50),
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    dob DATE,
    blood_group VARCHAR(5) CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN')),
    address TEXT,
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relation VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, patient_code)
);

-- 2.3 Patient Clinical & Identification Files
CREATE TABLE IF NOT EXISTS patient_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size_bytes BIGINT,
    uploaded_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4 Clinical Encounters (OPD, IPD, Emergency Visits)
CREATE TABLE IF NOT EXISTS encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_type VARCHAR(20) NOT NULL CHECK (encounter_type IN ('OPD', 'IPD', 'EMERGENCY')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED', 'TRANSFERRED', 'CANCELLED')),
    triage_priority VARCHAR(20) DEFAULT 'GREEN' CHECK (triage_priority IN ('RED', 'YELLOW', 'GREEN')),
    chief_complaint TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================================
-- DOMAIN 3: DOCTORS, DEPARTMENTS & CHAMBER SCHEDULES
-- =====================================================================================

-- 3.1 Clinical Departments
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);

-- 3.2 Doctors Master Registry
CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES user_profiles(id),
    department_id UUID NOT NULL REFERENCES departments(id),
    full_name VARCHAR(150) NOT NULL,
    degrees VARCHAR(255) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    specialization VARCHAR(150) NOT NULL,
    room_number VARCHAR(30) NOT NULL,
    consultation_fee NUMERIC(10, 2) NOT NULL DEFAULT 800.00,
    followup_fee NUMERIC(10, 2) NOT NULL DEFAULT 400.00,
    report_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    commission_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 Doctor Chamber Schedules
CREATE TABLE IF NOT EXISTS doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week VARCHAR(15) NOT NULL CHECK (day_of_week IN ('SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_tokens INT NOT NULL DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (doctor_id, day_of_week, start_time)
);

-- =====================================================================================
-- DOMAIN 4: APPOINTMENTS & LIVE TOKEN QUEUES
-- =====================================================================================

CREATE SEQUENCE IF NOT EXISTS appointment_token_seq START WITH 1;

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    schedule_id UUID REFERENCES doctor_schedules(id),
    appointment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    token_number INT NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'WALKIN' CHECK (source IN ('ONLINE', 'WALKIN', 'PHONE')),
    status VARCHAR(20) NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'WAITING', 'IN_CHAMBER', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'EXEMPT')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, doctor_id, appointment_date, token_number)
);

-- =====================================================================================
-- DOMAIN 5: CLINICAL PRESCRIPTIONS & EMR
-- =====================================================================================

CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    pulse VARCHAR(20),
    blood_pressure VARCHAR(20),
    temperature_c NUMERIC(4, 1),
    weight_kg NUMERIC(5, 2),
    clinical_history TEXT,
    diagnosis TEXT,
    advice TEXT,
    followup_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_name VARCHAR(150) NOT NULL,
    generic_name VARCHAR(150),
    dosage VARCHAR(50) NOT NULL, -- e.g. 1+0+1
    duration VARCHAR(50) NOT NULL, -- e.g. 7 days
    instruction VARCHAR(100), -- e.g. After food
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================================
-- DOMAIN 6: DIAGNOSTIC & LABORATORY OPERATIONS
-- =====================================================================================

-- 6.1 Diagnostic Test Categories
CREATE TABLE IF NOT EXISTS lab_test_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.2 Diagnostic Tests Catalog
CREATE TABLE IF NOT EXISTS lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES lab_test_categories(id),
    test_code VARCHAR(30) NOT NULL,
    test_name VARCHAR(150) NOT NULL,
    specimen_type VARCHAR(50) NOT NULL, -- Blood, Urine, Stool, Swab, Tissue
    price NUMERIC(10, 2) NOT NULL,
    turnaround_hours INT NOT NULL DEFAULT 4,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, test_code)
);

-- 6.3 Diagnostic Test Parameters
CREATE TABLE IF NOT EXISTS lab_test_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
    parameter_name VARCHAR(150) NOT NULL,
    unit VARCHAR(30),
    reference_range_male VARCHAR(100),
    reference_range_female VARCHAR(100),
    reference_range_child VARCHAR(100),
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.4 Lab Requisition Orders
CREATE TABLE IF NOT EXISTS lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    encounter_id UUID NOT NULL REFERENCES encounters(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    test_id UUID NOT NULL REFERENCES lab_tests(id),
    referred_doctor_id UUID REFERENCES doctors(id),
    barcode VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_SAMPLE' CHECK (status IN ('PENDING_SAMPLE', 'SAMPLE_COLLECTED', 'PROCESSING', 'VERIFIED', 'DELIVERED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.5 Lab Results (Dual-Gate Verification)
CREATE TABLE IF NOT EXISTS lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
    parameter_id UUID NOT NULL REFERENCES lab_test_parameters(id),
    observed_value VARCHAR(100) NOT NULL,
    is_abnormal BOOLEAN NOT NULL DEFAULT FALSE,
    technician_id UUID REFERENCES user_profiles(id),
    entered_at TIMESTAMPTZ DEFAULT NOW(),
    verified_by UUID REFERENCES user_profiles(id),
    verified_at TIMESTAMPTZ,
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lab_order_id, parameter_id)
);

-- =====================================================================================
-- DOMAIN 7: PHARMACY & DOUBLE-ENTRY FIFO STOCK LEDGER
-- =====================================================================================

-- 7.1 Generic Names
CREATE TABLE IF NOT EXISTS medicine_generics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name VARCHAR(150) NOT NULL UNIQUE,
    therapeutic_class VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7.2 Medicine Brands Master
CREATE TABLE IF NOT EXISTS medicine_brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    generic_id UUID NOT NULL REFERENCES medicine_generics(id),
    brand_name VARCHAR(150) NOT NULL,
    dosage_form VARCHAR(50) NOT NULL, -- Tablet, Capsule, Syrup, Injection, Ointment
    strength VARCHAR(50) NOT NULL, -- 500mg, 20mg, 100ml
    manufacturer VARCHAR(150) NOT NULL,
    min_stock_alert INT NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, brand_name, dosage_form, strength)
);

-- 7.3 Medicine Batches
CREATE TABLE IF NOT EXISTS medicine_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    brand_id UUID NOT NULL REFERENCES medicine_brands(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    purchase_rate NUMERIC(10, 2) NOT NULL,
    mrp NUMERIC(10, 2) NOT NULL,
    current_stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, brand_id, batch_number)
);

-- 7.4 Immutable Double-Entry Stock Ledger
CREATE TABLE IF NOT EXISTS stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL REFERENCES medicine_batches(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('PURCHASE', 'SALE', 'SALE_RETURN', 'DAMAGE', 'EXPIRED', 'ADJUSTMENT')),
    quantity_in INT NOT NULL DEFAULT 0,
    quantity_out INT NOT NULL DEFAULT 0,
    running_balance INT NOT NULL,
    reference_id UUID, -- Links to invoice_id, grn_id, etc.
    note TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================================
-- DOMAIN 8: WARDS, CABINS, BEDS & IN-PATIENT (IPD)
-- =====================================================================================

-- 8.1 Hospital Wards & Cabin Types
CREATE TABLE IF NOT EXISTS wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    ward_type VARCHAR(50) NOT NULL CHECK (ward_type IN ('GENERAL_MALE', 'GENERAL_FEMALE', 'CABIN_AC', 'CABIN_NON_AC', 'VIP_DELUXE', 'ICU', 'CCU', 'NICU', 'POST_OPERATIVE')),
    floor_number VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8.2 Beds Master
CREATE TABLE IF NOT EXISTS beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    ward_id UUID NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
    bed_number VARCHAR(30) NOT NULL,
    daily_charge NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'VACANT' CHECK (status IN ('VACANT', 'OCCUPIED', 'MAINTENANCE', 'RESERVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, ward_id, bed_number)
);

-- 8.3 In-Patient Department (IPD) Admissions
CREATE TABLE IF NOT EXISTS ipd_admissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
    current_bed_id UUID NOT NULL REFERENCES beds(id),
    primary_doctor_id UUID NOT NULL REFERENCES doctors(id),
    admission_deposit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ADMITTED' CHECK (status IN ('ADMITTED', 'DISCHARGED', 'TRANSFERRED', 'DECEASED')),
    admitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    discharged_at TIMESTAMPTZ,
    discharge_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8.4 Bed Allocation & Shift History (For accurate hourly/daily billing)
CREATE TABLE IF NOT EXISTS bed_allocation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_id UUID NOT NULL REFERENCES ipd_admissions(id) ON DELETE CASCADE,
    bed_id UUID NOT NULL REFERENCES beds(id),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    daily_charge NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8.5 Operation Theater (OT) Bookings
CREATE TABLE IF NOT EXISTS ot_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    admission_id UUID NOT NULL REFERENCES ipd_admissions(id),
    procedure_name VARCHAR(200) NOT NULL,
    lead_surgeon_id UUID NOT NULL REFERENCES doctors(id),
    anesthetist_id UUID REFERENCES doctors(id),
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_SURGERY', 'COMPLETED', 'CANCELLED')),
    ot_charge NUMERIC(10, 2) NOT NULL DEFAULT 5000.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================================
-- DOMAIN 9: UNIFIED BILLING & FINANCIAL LEDGERS
-- =====================================================================================

CREATE SEQUENCE IF NOT EXISTS invoice_code_seq START WITH 100001;

-- 9.1 Invoices Master
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(30) NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    encounter_id UUID REFERENCES encounters(id),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_reason TEXT,
    discount_approved_by UUID REFERENCES user_profiles(id),
    payable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    due_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID', 'REFUNDED', 'VOID')),
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    voided_by UUID REFERENCES user_profiles(id),
    void_reason TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, invoice_number)
);

-- 9.2 Invoice Line Items
CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    service_type VARCHAR(30) NOT NULL CHECK (service_type IN ('CONSULTATION', 'LAB', 'PHARMACY', 'BED', 'OT', 'NURSING', 'MISC')),
    reference_id UUID, -- Links to appointment_id, lab_order_id, batch_id, etc.
    item_name VARCHAR(200) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity NUMERIC(8, 2) NOT NULL DEFAULT 1.00,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9.3 Billing Payments & Transactions Ledger
CREATE TABLE IF NOT EXISTS billing_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    transaction_number VARCHAR(50) NOT NULL,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'VISA', 'MASTERCARD', 'BANK_TRANSFER')),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('PAYMENT', 'REFUND')),
    amount NUMERIC(12, 2) NOT NULL,
    gateway_reference VARCHAR(100),
    cashier_id UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9.4 Hospital Daily Operational Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category VARCHAR(100) NOT NULL, -- Generator Diesel, Canteen, Stationaries, Repair
    title VARCHAR(200) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    voucher_number VARCHAR(50),
    paid_to VARCHAR(150),
    approved_by UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================================
-- DOMAIN 10: HR, BIOMETRIC ATTENDANCE & IMMUTABLE AUDIT VAULT
-- =====================================================================================

-- 10.1 Staff Master Records
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES user_profiles(id),
    employee_code VARCHAR(30) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    department_id UUID REFERENCES departments(id),
    designation VARCHAR(100) NOT NULL,
    joining_date DATE NOT NULL,
    biometric_device_pin VARCHAR(50) UNIQUE,
    basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 15000.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, employee_code)
);

-- 10.2 Biometric Fingerprint Punches Stream
CREATE TABLE IF NOT EXISTS attendance_punches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    device_id VARCHAR(50) NOT NULL,
    punch_timestamp TIMESTAMPTZ NOT NULL,
    punch_type VARCHAR(20) NOT NULL DEFAULT 'CHECK_IN' CHECK (punch_type IN ('CHECK_IN', 'CHECK_OUT')),
    verification_mode VARCHAR(20) NOT NULL DEFAULT 'FINGERPRINT' CHECK (verification_mode IN ('FINGERPRINT', 'FACE', 'CARD', 'MANUAL')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10.3 Monthly Payrolls
CREATE TABLE IF NOT EXISTS payrolls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    month_year VARCHAR(10) NOT NULL, -- '2026-09'
    basic_salary NUMERIC(12, 2) NOT NULL,
    allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_salary NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'PAID')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, employee_id, month_year)
);

-- 10.4 Immutable Audit Vault
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id),
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, VOID, REFUND, VERIFY
    module VARCHAR(50) NOT NULL, -- BILLING, PATIENT, PHARMACY, LAB, IPD, IAM
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce Audit Immutability at Database Engine Level (REVOKE UPDATE & DELETE)
REVOKE UPDATE, DELETE ON audit_logs FROM public;

-- =====================================================================================
-- PERFORMANCE INDEXES (Optimized for Sub-Second Multi-Tenant Queries)
-- =====================================================================================

CREATE INDEX IF NOT EXISTS idx_patients_org_code ON patients(organization_id, patient_code);
CREATE INDEX IF NOT EXISTS idx_patients_org_phone ON patients(organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_appointments_org_date ON appointments(organization_id, appointment_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_tx_org_created ON billing_transactions(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_batch ON stock_ledger(organization_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_barcode ON lab_orders(organization_id, barcode);
CREATE INDEX IF NOT EXISTS idx_beds_org_status ON beds(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_org_time ON attendance_punches(organization_id, punch_timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at DESC);

-- =====================================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organization_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicine_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE ipd_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper Function: Get Current Organization from Session
CREATE OR REPLACE FUNCTION get_current_org_id() 
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_organization_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- Apply Tenant Isolation Policies
CREATE POLICY org_isolation_patients ON patients FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_encounters ON encounters FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_appointments ON appointments FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_invoices ON invoices FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_billing_tx ON billing_transactions FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_lab_orders ON lab_orders FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_stock_ledger ON stock_ledger FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_beds ON beds FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_ipd ON ipd_admissions FOR ALL USING (organization_id = get_current_org_id());
CREATE POLICY org_isolation_audit ON audit_logs FOR ALL USING (organization_id = get_current_org_id());

-- =====================================================================================
-- INITIAL SEED FOR TENANT ZERO: ONNESHA HOSPITAL
-- =====================================================================================

INSERT INTO organizations (id, name, code, slug, phone, email, address, status)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Onnesha Hospital & Diagnostic Complex',
    'OH',
    'onnesha-hospital',
    '01712-345678',
    'contact@onneshahospital.com',
    'Holding 14, Main Road, Medical Ward, Bangladesh',
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
