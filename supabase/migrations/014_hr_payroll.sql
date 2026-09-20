-- =====================================================================================
-- 014_HR_ATTENDANCE_AND_PAYROLL.sql
-- Staff registry, departments, biometric fingerprint devices, attendance punches, and payroll.
-- Designed for Bangladesh labor practices and hardware-agnostic attendance integration.
-- =====================================================================================

-- 1. Employee Designations Master
CREATE TABLE IF NOT EXISTS employee_designations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    title VARCHAR(100) NOT NULL,
    department_id UUID REFERENCES departments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Employees Master
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    profile_id UUID REFERENCES profiles(id),
    employee_code VARCHAR(30) NOT NULL, -- e.g. EMP-001
    full_name VARCHAR(150) NOT NULL,
    designation_id UUID REFERENCES employee_designations(id),
    department_id UUID REFERENCES departments(id),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    joining_date DATE NOT NULL,
    biometric_device_pin VARCHAR(50) UNIQUE,
    basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 15000.00,
    house_rent NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    medical_allowance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, employee_code)
);

-- 3. Biometric Attendance Devices Master (ZKTeco, Realtime, Anviz, etc.)
CREATE TABLE IF NOT EXISTS attendance_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    device_name VARCHAR(100) NOT NULL,
    device_ip VARCHAR(50) NOT NULL,
    port INT NOT NULL DEFAULT 4370,
    device_location VARCHAR(100) NOT NULL, -- Reception, Main Gate, OT entrance
    auth_token VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_ping_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Biometric Attendance Punch Records
CREATE TABLE IF NOT EXISTS attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    device_id UUID REFERENCES attendance_devices(id),
    punch_time TIMESTAMPTZ NOT NULL,
    punch_type VARCHAR(20) NOT NULL DEFAULT 'CHECK_IN' CHECK (punch_type IN ('CHECK_IN', 'CHECK_OUT')),
    verification_mode VARCHAR(20) NOT NULL DEFAULT 'FINGERPRINT' CHECK (verification_mode IN ('FINGERPRINT', 'FACE', 'CARD', 'MANUAL')),
    is_late BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Leave Management
CREATE TABLE IF NOT EXISTS leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(50) NOT NULL, -- Casual, Sick, Maternity, Earned
    annual_quota_days INT NOT NULL DEFAULT 14,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Payroll Runs & Items
CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    month_year VARCHAR(10) NOT NULL, -- e.g. 2026-09
    total_gross NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_net NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'DISBURSED')),
    prepared_by UUID REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id),
    disbursed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, month_year)
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    basic_salary NUMERIC(12, 2) NOT NULL,
    allowances NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    deductions NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_salary NUMERIC(12, 2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (payroll_run_id, employee_id)
);
