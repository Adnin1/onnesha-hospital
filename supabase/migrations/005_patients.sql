-- =====================================================================================
-- 005_PATIENTS_AND_RECORDS.sql
-- Patient Master, contacts, identification, addresses, files, notes, and medical history.
-- =====================================================================================

CREATE SEQUENCE IF NOT EXISTS patient_code_seq START WITH 10001;

-- 1. Patients Master
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    patient_code VARCHAR(30) NOT NULL, -- e.g. OH-000001
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    dob DATE,
    blood_group VARCHAR(10) CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN')),
    marital_status VARCHAR(20),
    occupation VARCHAR(100),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, patient_code)
);

-- 2. Patient Identifications (NID, Birth Registration, Passport)
CREATE TABLE IF NOT EXISTS patient_identifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    id_type VARCHAR(50) NOT NULL CHECK (id_type IN ('NID', 'BIRTH_CERTIFICATE', 'PASSPORT', 'DRIVING_LICENSE')),
    id_number VARCHAR(100) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Patient Addresses
CREATE TABLE IF NOT EXISTS patient_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    address_type VARCHAR(20) NOT NULL DEFAULT 'PRESENT' CHECK (address_type IN ('PRESENT', 'PERMANENT', 'OFFICE')),
    street_address TEXT NOT NULL,
    upazila_or_thana VARCHAR(100),
    district VARCHAR(100) NOT NULL DEFAULT 'Dhaka',
    division VARCHAR(100) NOT NULL DEFAULT 'Dhaka',
    post_code VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Patient Contacts (Emergency Contacts, Next of Kin)
CREATE TABLE IF NOT EXISTS patient_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    contact_name VARCHAR(150) NOT NULL,
    relationship VARCHAR(50) NOT NULL, -- Father, Mother, Spouse, Sibling, Child, Guardian
    phone VARCHAR(20) NOT NULL,
    is_primary_emergency BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Patient Clinical History & Allergies
CREATE TABLE IF NOT EXISTS patient_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    allergies TEXT,
    chronic_conditions TEXT, -- Diabetes, Hypertension, Asthma, etc.
    past_surgeries TEXT,
    family_history TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Patient Files (Uploaded EMR documents)
CREATE TABLE IF NOT EXISTS patient_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_size_bytes BIGINT,
    uploaded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Patient Clinical Notes
CREATE TABLE IF NOT EXISTS patient_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    note_type VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    note TEXT NOT NULL,
    author_id UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
