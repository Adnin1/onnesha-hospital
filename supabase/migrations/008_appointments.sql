-- =====================================================================================
-- 008_APPOINTMENTS_AND_TOKENS.sql
-- Concurrency-safe appointments, token counters, live waiting queues, and calling events.
-- =====================================================================================

-- 1. Token Counters (Transaction-safe counter table per Doctor per Date)
CREATE TABLE IF NOT EXISTS token_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    counter_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_token INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, doctor_id, counter_date)
);

-- 2. Appointments Master
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    schedule_id UUID REFERENCES doctor_schedules(id),
    appointment_date DATE NOT NULL,
    slot_start_time TIME,
    token_number INT NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'WALKIN' CHECK (source IN ('ONLINE', 'WALKIN', 'PHONE', 'EMERGENCY')),
    status VARCHAR(20) NOT NULL DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'WAITING', 'IN_CHAMBER', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'EXEMPT')),
    booked_by UUID REFERENCES profiles(id),
    patient_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, doctor_id, appointment_date, token_number)
);

-- 3. Live Waiting Queue State (For Digital Screen /check-token)
CREATE TABLE IF NOT EXISTS waiting_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    room_number VARCHAR(30) NOT NULL,
    token_number INT NOT NULL,
    queue_status VARCHAR(20) NOT NULL DEFAULT 'WAITING' CHECK (queue_status IN ('WAITING', 'CALLED', 'IN_ROOM', 'COMPLETED', 'SKIPPED')),
    called_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Token Call Logs (For audit of queue progression)
CREATE TABLE IF NOT EXISTS token_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waiting_queue_id UUID NOT NULL REFERENCES waiting_queue(id) ON DELETE CASCADE,
    call_number INT NOT NULL DEFAULT 1,
    called_by UUID REFERENCES profiles(id),
    called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
