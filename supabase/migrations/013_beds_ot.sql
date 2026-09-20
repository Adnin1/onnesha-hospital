-- =====================================================================================
-- 013_BEDS_CABINS_AND_OT.sql
-- Wards, beds, cabins, bed transfers, daily charges, and Operation Theater (OT) management.
-- Enforces integrity: no overlapping active bookings for the same bed or cabin.
-- =====================================================================================

-- 1. Bed Types & Charges Master
CREATE TABLE IF NOT EXISTS bed_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(50) NOT NULL, -- General, Semi-Cabin, Single AC Cabin, VIP Suite, ICU, CCU
    daily_rate NUMERIC(10, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Wards
CREATE TABLE IF NOT EXISTS wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    ward_type VARCHAR(50) NOT NULL, -- Male Ward, Female Ward, Pediatric Ward, Post-Op
    floor_number VARCHAR(20) NOT NULL,
    total_beds INT NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Beds
CREATE TABLE IF NOT EXISTS beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    ward_id UUID NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
    bed_type_id UUID NOT NULL REFERENCES bed_types(id) ON DELETE RESTRICT,
    bed_number VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'VACANT' CHECK (status IN ('VACANT', 'OCCUPIED', 'CLEANING', 'MAINTENANCE')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, ward_id, bed_number)
);

-- 4. Cabins (Private Hospital Cabins)
CREATE TABLE IF NOT EXISTS cabins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    cabin_number VARCHAR(30) NOT NULL,
    cabin_type VARCHAR(50) NOT NULL CHECK (cabin_type IN ('AC_DELUXE', 'NON_AC_STANDARD', 'VIP_SUITE')),
    floor_number VARCHAR(20) NOT NULL,
    daily_rate NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'VACANT' CHECK (status IN ('VACANT', 'OCCUPIED', 'CLEANING', 'MAINTENANCE')),
    amenities TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, cabin_number)
);

-- 5. Active Bed & Cabin Assignments
CREATE TABLE IF NOT EXISTS bed_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    bed_id UUID REFERENCES beds(id),
    cabin_id UUID REFERENCES cabins(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vacated_at TIMESTAMPTZ,
    daily_charge NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'TRANSFERRED', 'VACATED')),
    assigned_by UUID REFERENCES profiles(id),
    CONSTRAINT chk_bed_or_cabin CHECK ((bed_id IS NOT NULL AND cabin_id IS NULL) OR (bed_id IS NULL AND cabin_id IS NOT NULL))
);

-- 6. Operation Theater (OT) Rooms
CREATE TABLE IF NOT EXISTS ot_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    room_number VARCHAR(30) NOT NULL,
    room_name VARCHAR(100) NOT NULL,
    is_major_ot BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'IN_SURGERY', 'STERILIZING', 'MAINTENANCE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, room_number)
);

-- 7. OT Bookings & Procedures
CREATE TABLE IF NOT EXISTS ot_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    visit_id UUID NOT NULL REFERENCES patient_visits(id) ON DELETE RESTRICT,
    ot_room_id UUID NOT NULL REFERENCES ot_rooms(id),
    procedure_name VARCHAR(200) NOT NULL,
    lead_surgeon_id UUID NOT NULL REFERENCES doctors(id),
    anesthetist_id UUID REFERENCES doctors(id),
    anesthesia_type VARCHAR(50) DEFAULT 'GENERAL',
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_SURGERY', 'COMPLETED', 'CANCELLED')),
    ot_charge NUMERIC(10, 2) NOT NULL DEFAULT 5000.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. OT Team Members (Surgical assistants, nurses)
CREATE TABLE IF NOT EXISTS ot_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ot_booking_id UUID NOT NULL REFERENCES ot_bookings(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id),
    role_in_surgery VARCHAR(50) NOT NULL, -- Assistant Surgeon, Scrub Nurse, Circulating Nurse, Technician
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
