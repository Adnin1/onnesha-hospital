-- =====================================================================================
-- 007_DOCTORS_AND_SCHEDULES.sql
-- Doctors, doctor-department mappings, visiting schedules, slots, and commissions.
-- =====================================================================================

-- 1. Doctors Master
CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    profile_id UUID REFERENCES profiles(id),
    full_name VARCHAR(150) NOT NULL,
    degrees VARCHAR(255) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    specialization VARCHAR(150) NOT NULL,
    bmdc_reg_number VARCHAR(50) NOT NULL,
    room_number VARCHAR(30) NOT NULL,
    opd_fee NUMERIC(10, 2) NOT NULL DEFAULT 800.00,
    followup_fee NUMERIC(10, 2) NOT NULL DEFAULT 400.00,
    report_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avatar_url TEXT,
    bio TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Doctor Department Mappings
CREATE TABLE IF NOT EXISTS doctor_departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (doctor_id, department_id)
);

-- 3. Doctor Schedules (Weekly recurring visiting hours)
CREATE TABLE IF NOT EXISTS doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week VARCHAR(15) NOT NULL CHECK (day_of_week IN ('SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_tokens INT NOT NULL DEFAULT 30,
    avg_consultation_minutes INT NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (doctor_id, day_of_week, start_time)
);

-- 4. Doctor Leave Schedule (To prevent booking on leave days)
CREATE TABLE IF NOT EXISTS doctor_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Doctor Commission Rules (Configurable rules: percentage or fixed BDT)
CREATE TABLE IF NOT EXISTS doctor_commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    service_category VARCHAR(50) NOT NULL CHECK (service_category IN ('CONSULTATION', 'DIAGNOSTIC_LAB', 'DIAGNOSTIC_RAD', 'SURGERY_OT', 'IPD_VISIT')),
    commission_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE' CHECK (commission_type IN ('PERCENTAGE', 'FIXED_AMOUNT')),
    commission_value NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (doctor_id, service_category)
);

-- 6. Doctor Commission Transactions (Ledger for payout tracking)
CREATE TABLE IF NOT EXISTS doctor_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    reference_id UUID NOT NULL, -- e.g. appointment_id, invoice_item_id
    service_category VARCHAR(50) NOT NULL,
    bill_amount NUMERIC(10, 2) NOT NULL,
    commission_amount NUMERIC(10, 2) NOT NULL,
    payout_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (payout_status IN ('PENDING', 'APPROVED', 'PAID')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
