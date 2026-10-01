-- ==============================================================================
-- Migration 99: Fix Beds-Wards Relationship, Concurrency, and Atomic Inpatient & Critical Care Workflows
--
-- Fixes:
-- 1. Adds ward_id and bed_type_id foreign keys from public.beds to public.wards and public.bed_types
-- 2. Seeds standard wards, bed types, and critical care units for organization
-- 3. Adds partial unique indexes to PREVENT double active bed assignments under concurrent requests
-- 4. Creates atomic stored procedures:
--    - public.admit_patient_to_bed_atomic
--    - public.vacate_or_discharge_bed_atomic
--    - public.update_bed_operational_status_atomic
--    - public.admit_critical_care_atomic
--    - public.transfer_critical_care_atomic
--    - public.discharge_critical_care_atomic
-- 5. Reloads PostgREST schema cache to eliminate PGRST200
-- ==============================================================================

DO $$
DECLARE
    v_canonical_org_id UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    -- 1. Ensure Standard Wards Exist
    INSERT INTO public.wards (id, organization_id, name, ward_type, floor_number, total_beds, created_at)
    VALUES
        ('a0000000-0001-0000-0000-000000000001'::uuid, v_canonical_org_id, 'Male General Ward', 'General', '2nd Floor', 10, NOW()),
        ('a0000000-0001-0000-0000-000000000002'::uuid, v_canonical_org_id, 'Female General Ward', 'General', '2nd Floor', 10, NOW()),
        ('a0000000-0001-0000-0000-000000000003'::uuid, v_canonical_org_id, 'Post-Operative Ward', 'Post-Op', '3rd Floor', 8, NOW()),
        ('a0000000-0001-0000-0000-000000000004'::uuid, v_canonical_org_id, 'Pediatric Ward', 'Pediatric', '3rd Floor', 8, NOW()),
        ('a0000000-0001-0000-0000-000000000005'::uuid, v_canonical_org_id, 'ICU Complex', 'ICU', '4th Floor', 6, NOW()),
        ('a0000000-0001-0000-0000-000000000006'::uuid, v_canonical_org_id, 'CCU Complex', 'CCU', '4th Floor', 6, NOW()),
        ('a0000000-0001-0000-0000-000000000007'::uuid, v_canonical_org_id, 'Private Cabins', 'Cabin', '5th Floor', 8, NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        ward_type = EXCLUDED.ward_type,
        floor_number = EXCLUDED.floor_number;

    -- 2. Ensure Standard Bed Types Exist
    INSERT INTO public.bed_types (id, organization_id, name, daily_rate, description, created_at)
    VALUES
        ('b0000000-0001-0000-0000-000000000001'::uuid, v_canonical_org_id, 'General Ward Bed', 600.00, 'Standard general admission bed with basic nursing', NOW()),
        ('b0000000-0001-0000-0000-000000000002'::uuid, v_canonical_org_id, 'Post-Op Step-Down Bed', 1200.00, 'Post-surgical monitoring bed with telemetry', NOW()),
        ('b0000000-0001-0000-0000-000000000003'::uuid, v_canonical_org_id, 'Pediatric Care Bed', 800.00, 'Pediatric cot and attendant bed', NOW()),
        ('b0000000-0001-0000-0000-000000000004'::uuid, v_canonical_org_id, 'Single AC Deluxe Cabin', 3500.00, 'Air-conditioned private cabin with sofa and attached bath', NOW()),
        ('b0000000-0001-0000-0000-000000000005'::uuid, v_canonical_org_id, 'VIP Executive Suite', 6000.00, 'VIP suite with refrigerator, patient monitor and attendant lounge', NOW()),
        ('b0000000-0001-0000-0000-000000000006'::uuid, v_canonical_org_id, 'ICU High-Dependency Bed', 7500.00, 'Intensive care bed with ventilator line and multi-para monitor', NOW()),
        ('b0000000-0001-0000-0000-000000000007'::uuid, v_canonical_org_id, 'CCU Cardiac Monitoring Bed', 6500.00, 'Coronary care bed with continuous cardiac rhythm tracking', NOW())
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        daily_rate = EXCLUDED.daily_rate;

    -- 3. Ensure Standard Critical Care Units Exist
    INSERT INTO public.critical_care_units (id, organization_id, unit_name, unit_type, floor, total_beds, daily_charge, is_active, created_at)
    VALUES
        ('c0000000-0001-0000-0000-000000000001'::uuid, v_canonical_org_id, 'Intensive Care Unit (ICU)', 'ICU', '4th Floor', 6, 7500.00, TRUE, NOW()),
        ('c0000000-0001-0000-0000-000000000002'::uuid, v_canonical_org_id, 'Coronary Care Unit (CCU)', 'CCU', '4th Floor', 4, 6500.00, TRUE, NOW()),
        ('c0000000-0001-0000-0000-000000000003'::uuid, v_canonical_org_id, 'Intensive Coronary Care Unit (ICCU)', 'ICCU', '4th Floor', 4, 6500.00, TRUE, NOW()),
        ('c0000000-0001-0000-0000-000000000004'::uuid, v_canonical_org_id, 'Surgical ICU (SICU)', 'SICU', '4th Floor', 4, 7500.00, TRUE, NOW()),
        ('c0000000-0001-0000-0000-000000000005'::uuid, v_canonical_org_id, 'Medical ICU (MICU)', 'MICU', '4th Floor', 4, 7500.00, TRUE, NOW()),
        ('c0000000-0001-0000-0000-000000000006'::uuid, v_canonical_org_id, 'Pediatric ICU (PICU)', 'PICU', '4th Floor', 4, 6000.00, TRUE, NOW())
    ON CONFLICT (id) DO UPDATE SET
        unit_name = EXCLUDED.unit_name,
        daily_charge = EXCLUDED.daily_charge;

    -- 4. Ensure Standard Cabins Exist
    INSERT INTO public.cabins (id, organization_id, cabin_number, cabin_type, floor_number, daily_rate, status, amenities, created_at)
    VALUES
        ('d0000000-0001-0000-0000-000000000001'::uuid, v_canonical_org_id, 'Cabin 501', 'AC_DELUXE', '5th Floor', 4000.00, 'VACANT', 'Air Conditioner, Attached Bath, Attendant Couch, TV', NOW()),
        ('d0000000-0001-0000-0000-000000000002'::uuid, v_canonical_org_id, 'Cabin 502', 'AC_DELUXE', '5th Floor', 4000.00, 'VACANT', 'Air Conditioner, Attached Bath, Attendant Couch, TV', NOW()),
        ('d0000000-0001-0000-0000-000000000003'::uuid, v_canonical_org_id, 'Cabin 503', 'NON_AC_STANDARD', '5th Floor', 2500.00, 'VACANT', 'Ceiling Fan, Attached Bath, Attendant Chair', NOW()),
        ('d0000000-0001-0000-0000-000000000004'::uuid, v_canonical_org_id, 'VIP Suite 505', 'VIP_SUITE', '5th Floor', 6500.00, 'VACANT', 'Executive Suite, Living Room, Refrigerator, Microwave, 2 Attached Baths', NOW())
    ON CONFLICT (id) DO NOTHING;
END $$;

-- 5. Alter beds table: Add missing foreign key columns and constraints
ALTER TABLE public.beds ADD COLUMN IF NOT EXISTS ward_id UUID;
ALTER TABLE public.beds ADD COLUMN IF NOT EXISTS bed_type_id UUID;
ALTER TABLE public.beds ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.beds ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Standardize organization_id on beds
UPDATE public.beds
SET organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Associate existing beds with corresponding wards
UPDATE public.beds
SET ward_id = 'a0000000-0001-0000-0000-000000000001'::uuid
WHERE (ward_id IS NULL) AND (ward_name ILIKE '%Male%' OR bed_number ILIKE 'MW%');

UPDATE public.beds
SET ward_id = 'a0000000-0001-0000-0000-000000000005'::uuid
WHERE (ward_id IS NULL) AND (ward_name ILIKE '%ICU%' OR bed_number ILIKE 'ICU%');

UPDATE public.beds
SET ward_id = 'a0000000-0001-0000-0000-000000000007'::uuid
WHERE (ward_id IS NULL) AND (ward_name ILIKE '%Cabin%' OR bed_number ILIKE 'Cabin%');

-- Fallback for any remaining unlinked beds
UPDATE public.beds
SET ward_id = 'a0000000-0001-0000-0000-000000000001'::uuid
WHERE ward_id IS NULL;

-- Associate bed_type_id
UPDATE public.beds
SET bed_type_id = 'b0000000-0001-0000-0000-000000000001'::uuid
WHERE bed_type_id IS NULL;

-- 6. Add Foreign Key Constraints on public.beds to public.wards & public.bed_types
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'beds_ward_id_fkey'
    ) THEN
        ALTER TABLE public.beds
            ADD CONSTRAINT beds_ward_id_fkey
            FOREIGN KEY (ward_id) REFERENCES public.wards(id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'beds_bed_type_id_fkey'
    ) THEN
        ALTER TABLE public.beds
            ADD CONSTRAINT beds_bed_type_id_fkey
            FOREIGN KEY (bed_type_id) REFERENCES public.bed_types(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_beds_ward_id ON public.beds(ward_id);
CREATE INDEX IF NOT EXISTS idx_beds_bed_type_id ON public.beds(bed_type_id);
CREATE INDEX IF NOT EXISTS idx_beds_org_status ON public.beds(organization_id, status);

-- 7. Seed Complete Standard Hospital Bed Inventory
INSERT INTO public.beds (id, organization_id, ward_id, bed_type_id, ward_name, bed_number, bed_type, daily_rate, status, is_active, created_at)
VALUES
    -- Male General Ward (2nd Floor)
    ('e0000000-0001-0000-0000-000000000101'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000001'::uuid, 'b0000000-0001-0000-0000-000000000001'::uuid, 'Male General Ward', 'MW-101', 'General', 600.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000102'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000001'::uuid, 'b0000000-0001-0000-0000-000000000001'::uuid, 'Male General Ward', 'MW-102', 'General', 600.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000103'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000001'::uuid, 'b0000000-0001-0000-0000-000000000001'::uuid, 'Male General Ward', 'MW-103', 'General', 600.00, 'CLEANING', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000104'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000001'::uuid, 'b0000000-0001-0000-0000-000000000001'::uuid, 'Male General Ward', 'MW-104', 'General', 600.00, 'VACANT', TRUE, NOW()),

    -- Female General Ward (2nd Floor)
    ('e0000000-0001-0000-0000-000000000201'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000002'::uuid, 'b0000000-0001-0000-0000-000000000001'::uuid, 'Female General Ward', 'FW-201', 'General', 600.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000202'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000002'::uuid, 'b0000000-0001-0000-0000-000000000001'::uuid, 'Female General Ward', 'FW-202', 'General', 600.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000203'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000002'::uuid, 'b0000000-0001-0000-0000-000000000001'::uuid, 'Female General Ward', 'FW-203', 'General', 600.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000204'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000002'::uuid, 'b0000000-0001-0000-0000-000000000001'::uuid, 'Female General Ward', 'FW-204', 'General', 600.00, 'VACANT', TRUE, NOW()),

    -- Post-Operative Ward (3rd Floor)
    ('e0000000-0001-0000-0000-000000000301'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000003'::uuid, 'b0000000-0001-0000-0000-000000000002'::uuid, 'Post-Operative Ward', 'PO-301', 'Post-Op', 1200.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000302'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000003'::uuid, 'b0000000-0001-0000-0000-000000000002'::uuid, 'Post-Operative Ward', 'PO-302', 'Post-Op', 1200.00, 'VACANT', TRUE, NOW()),

    -- Pediatric Ward (3rd Floor)
    ('e0000000-0001-0000-0000-000000000401'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000004'::uuid, 'b0000000-0001-0000-0000-000000000003'::uuid, 'Pediatric Ward', 'PED-401', 'Pediatric', 800.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000402'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000004'::uuid, 'b0000000-0001-0000-0000-000000000003'::uuid, 'Pediatric Ward', 'PED-402', 'Pediatric', 800.00, 'VACANT', TRUE, NOW()),

    -- ICU Complex (4th Floor)
    ('e0000000-0001-0000-0000-000000000501'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000005'::uuid, 'b0000000-0001-0000-0000-000000000006'::uuid, 'ICU Complex', 'ICU-01', 'ICU', 7500.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000502'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000005'::uuid, 'b0000000-0001-0000-0000-000000000006'::uuid, 'ICU Complex', 'ICU-02', 'ICU', 7500.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000503'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000005'::uuid, 'b0000000-0001-0000-0000-000000000006'::uuid, 'ICU Complex', 'ICU-03', 'ICU', 7500.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000504'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000005'::uuid, 'b0000000-0001-0000-0000-000000000006'::uuid, 'ICU Complex', 'ICU-04', 'ICU', 7500.00, 'VACANT', TRUE, NOW()),

    -- CCU Complex (4th Floor)
    ('e0000000-0001-0000-0000-000000000601'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000006'::uuid, 'b0000000-0001-0000-0000-000000000007'::uuid, 'CCU Complex', 'CCU-01', 'CCU', 6500.00, 'VACANT', TRUE, NOW()),
    ('e0000000-0001-0000-0000-000000000602'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0001-0000-0000-000000000006'::uuid, 'b0000000-0001-0000-0000-000000000007'::uuid, 'CCU Complex', 'CCU-02', 'CCU', 6500.00, 'VACANT', TRUE, NOW())
ON CONFLICT (id) DO UPDATE SET
    ward_id = EXCLUDED.ward_id,
    bed_type_id = EXCLUDED.bed_type_id,
    daily_rate = EXCLUDED.daily_rate;

-- 8. Concurrency Protection: Partial Unique Indexes on Active Bed & Cabin Assignments
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_bed_assignment
    ON public.bed_assignments(bed_id)
    WHERE status = 'ACTIVE' AND bed_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_cabin_assignment
    ON public.bed_assignments(cabin_id)
    WHERE status = 'ACTIVE' AND cabin_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. ATOMIC STORED PROCEDURE: admit_patient_to_bed_atomic
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admit_patient_to_bed_atomic(
    p_organization_id UUID,
    p_patient_id UUID,
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name TEXT DEFAULT NULL,
    p_chief_complaint TEXT DEFAULT NULL,
    p_admission_type VARCHAR DEFAULT 'IPD',
    p_daily_charge NUMERIC DEFAULT 0,
    p_assigned_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_bed_number TEXT;
    v_bed_status TEXT;
    v_patient_name TEXT;
    v_visit_id UUID;
    v_assignment_id UUID;
    v_charge NUMERIC := p_daily_charge;
    v_active_check UUID;
BEGIN
    -- 1. Validation: At least one of bed_id or cabin_id must be provided
    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Either bed_id or cabin_id must be provided';
    END IF;

    -- 2. Fetch patient name
    SELECT full_name INTO v_patient_name
    FROM public.patients
    WHERE id = p_patient_id;

    IF v_patient_name IS NULL THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: Patient % does not exist', p_patient_id;
    END IF;

    -- 3. Row-level Lock and Concurrency Validation
    IF p_bed_id IS NOT NULL THEN
        SELECT status, bed_number, daily_rate
        INTO v_bed_status, v_bed_number, v_charge
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'BED_NOT_FOUND: Bed % does not exist', p_bed_id;
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'BED_UNAVAILABLE: Bed % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        -- Check existing active assignment
        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE bed_id = p_bed_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED: Bed % already has an active inpatient assignment', v_bed_number;
        END IF;
    ELSE
        SELECT status, cabin_number, daily_rate
        INTO v_bed_status, v_bed_number, v_charge
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        IF v_bed_status IS NULL THEN
            RAISE EXCEPTION 'CABIN_NOT_FOUND: Cabin % does not exist', p_cabin_id;
        END IF;

        IF UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'CABIN_UNAVAILABLE: Cabin % is currently in % status and cannot accept admission', v_bed_number, v_bed_status;
        END IF;

        SELECT id INTO v_active_check
        FROM public.bed_assignments
        WHERE cabin_id = p_cabin_id AND status = 'ACTIVE'
        LIMIT 1;

        IF v_active_check IS NOT NULL THEN
            RAISE EXCEPTION 'DOUBLE_ASSIGNMENT_PREVENTED: Cabin % already has an active inpatient assignment', v_bed_number;
        END IF;
    END IF;

    IF p_daily_charge > 0 THEN
        v_charge := p_daily_charge;
    END IF;

    -- 4. Create or reuse active IPD visit
    SELECT id INTO v_visit_id
    FROM public.patient_visits
    WHERE patient_id = p_patient_id AND visit_type = 'IPD' AND status = 'ACTIVE'
    ORDER BY admitted_at DESC
    LIMIT 1;

    IF v_visit_id IS NULL THEN
        INSERT INTO public.patient_visits (
            organization_id, patient_id, visit_type, status, chief_complaint, admitted_at, doctor_id, visit_number
        ) VALUES (
            p_organization_id,
            p_patient_id,
            'IPD',
            'ACTIVE',
            COALESCE(p_chief_complaint, 'Inpatient Admission'),
            NOW(),
            p_doctor_id,
            'IPD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6)
        ) RETURNING id INTO v_visit_id;
    END IF;

    -- 5. Insert Bed Assignment Record
    INSERT INTO public.bed_assignments (
        organization_id, visit_id, patient_id, bed_id, cabin_id, assigned_at, daily_charge, status, assigned_by
    ) VALUES (
        p_organization_id,
        v_visit_id,
        p_patient_id,
        p_bed_id,
        p_cabin_id,
        COALESCE(v_charge, 0),
        'ACTIVE',
        p_assigned_by
    ) RETURNING id INTO v_assignment_id;

    -- 6. Update Bed / Cabin Status to OCCUPIED
    IF p_bed_id IS NOT NULL THEN
        UPDATE public.beds
        SET status = 'OCCUPIED',
            patient_name = v_patient_name,
            admitted_at = NOW()
        WHERE id = p_bed_id;
    ELSE
        UPDATE public.cabins
        SET status = 'OCCUPIED'
        WHERE id = p_cabin_id;
    END IF;

    -- 7. Insert Forensic Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
    ) VALUES (
        p_organization_id,
        p_assigned_by,
        'BED_ADMISSION',
        'IPD',
        'bed_assignments',
        v_assignment_id::text,
        jsonb_build_object(
            'patient_id', p_patient_id,
            'patient_name', v_patient_name,
            'bed_id', p_bed_id,
            'cabin_id', p_cabin_id,
            'bed_number', v_bed_number,
            'daily_charge', v_charge,
            'visit_id', v_visit_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'assignment_id', v_assignment_id,
        'visit_id', v_visit_id,
        'patient_id', p_patient_id,
        'bed_number', v_bed_number,
        'status', 'OCCUPIED',
        'daily_charge', v_charge
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 10. ATOMIC STORED PROCEDURE: vacate_or_discharge_bed_atomic
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vacate_or_discharge_bed_atomic(
    p_organization_id UUID,
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_vacated_by UUID DEFAULT NULL,
    p_discharge_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_assignment_rec RECORD;
    v_bed_number TEXT;
BEGIN
    IF p_bed_id IS NULL AND p_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Either bed_id or cabin_id must be provided';
    END IF;

    IF p_bed_id IS NOT NULL THEN
        SELECT id, bed_number INTO v_assignment_rec.id, v_bed_number
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        -- Update active assignment to VACATED
        UPDATE public.bed_assignments
        SET status = 'VACATED',
            vacated_at = NOW()
        WHERE bed_id = p_bed_id AND status = 'ACTIVE'
        RETURNING id, visit_id, patient_id INTO v_assignment_rec;

        -- Bed transitions immediately to CLEANING (not directly to vacant!)
        UPDATE public.beds
        SET status = 'CLEANING',
            patient_name = NULL,
            admitted_at = NULL
        WHERE id = p_bed_id;
    ELSE
        SELECT id, cabin_number INTO v_assignment_rec.id, v_bed_number
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        UPDATE public.bed_assignments
        SET status = 'VACATED',
            vacated_at = NOW()
        WHERE cabin_id = p_cabin_id AND status = 'ACTIVE'
        RETURNING id, visit_id, patient_id INTO v_assignment_rec;

        UPDATE public.cabins
        SET status = 'CLEANING'
        WHERE id = p_cabin_id;
    END IF;

    -- Update visit status if applicable
    IF v_assignment_rec.visit_id IS NOT NULL THEN
        UPDATE public.patient_visits
        SET status = 'DISCHARGED',
            discharged_at = NOW()
        WHERE id = v_assignment_rec.visit_id;
    END IF;

    -- Insert Audit Log
    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
    ) VALUES (
        p_organization_id,
        p_vacated_by,
        'BED_DISCHARGE_CLEANING',
        'IPD',
        'bed_assignments',
        COALESCE(v_assignment_rec.id::text, p_bed_id::text),
        jsonb_build_object(
            'bed_id', p_bed_id,
            'cabin_id', p_cabin_id,
            'bed_number', v_bed_number,
            'new_status', 'CLEANING',
            'notes', p_discharge_notes
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'bed_number', v_bed_number,
        'new_status', 'CLEANING',
        'assignment_id', v_assignment_rec.id
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 11. ATOMIC STORED PROCEDURE: update_bed_operational_status_atomic
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_bed_operational_status_atomic(
    p_bed_id UUID DEFAULT NULL,
    p_cabin_id UUID DEFAULT NULL,
    p_new_status VARCHAR DEFAULT 'VACANT',
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_curr_status TEXT;
    v_bed_number TEXT;
    v_target_status TEXT := UPPER(p_new_status);
BEGIN
    IF v_target_status = 'AVAILABLE' THEN
        v_target_status := 'VACANT';
    END IF;

    IF p_bed_id IS NOT NULL THEN
        SELECT status, bed_number INTO v_curr_status, v_bed_number
        FROM public.beds
        WHERE id = p_bed_id
        FOR UPDATE;

        IF v_curr_status IS NULL THEN
            RAISE EXCEPTION 'BED_NOT_FOUND: Bed % does not exist', p_bed_id;
        END IF;

        v_curr_status := UPPER(v_curr_status);
        IF v_curr_status = 'AVAILABLE' THEN v_curr_status := 'VACANT'; END IF;

        -- Enforce Legal Transitions
        IF v_target_status = 'OCCUPIED' THEN
            RAISE EXCEPTION 'ILLEGAL_TRANSITION: Cannot set bed directly to OCCUPIED. Use admit_patient_to_bed_atomic.';
        END IF;

        IF v_curr_status = 'OCCUPIED' AND v_target_status IN ('VACANT', 'MAINTENANCE') THEN
            RAISE EXCEPTION 'ILLEGAL_TRANSITION: Occupied bed must be discharged/vacated through vacate_or_discharge_bed_atomic.';
        END IF;

        IF v_curr_status = 'CLEANING' AND v_target_status NOT IN ('VACANT', 'MAINTENANCE') THEN
            RAISE EXCEPTION 'ILLEGAL_TRANSITION: Cleaning bed can only transition to VACANT or MAINTENANCE.';
        END IF;

        UPDATE public.beds
        SET status = v_target_status
        WHERE id = p_bed_id;
    ELSE
        SELECT status, cabin_number INTO v_curr_status, v_bed_number
        FROM public.cabins
        WHERE id = p_cabin_id
        FOR UPDATE;

        IF v_curr_status IS NULL THEN
            RAISE EXCEPTION 'CABIN_NOT_FOUND: Cabin % does not exist', p_cabin_id;
        END IF;

        v_curr_status := UPPER(v_curr_status);
        IF v_curr_status = 'AVAILABLE' THEN v_curr_status := 'VACANT'; END IF;

        IF v_target_status = 'OCCUPIED' THEN
            RAISE EXCEPTION 'ILLEGAL_TRANSITION: Cannot set cabin directly to OCCUPIED. Use admit_patient_to_bed_atomic.';
        END IF;

        UPDATE public.cabins
        SET status = v_target_status
        WHERE id = p_cabin_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'bed_number', v_bed_number,
        'previous_status', v_curr_status,
        'new_status', v_target_status
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 12. ATOMIC STORED PROCEDURE: admit_critical_care_atomic
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admit_critical_care_atomic(
    p_organization_id UUID,
    p_patient_id UUID,
    p_unit_id UUID,
    p_bed_number TEXT,
    p_ventilator_required BOOLEAN DEFAULT FALSE,
    p_admitting_doctor_id UUID DEFAULT NULL,
    p_initial_diagnosis TEXT DEFAULT 'Critical Care Observation Required',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admission_id UUID;
    v_matching_bed_id UUID;
    v_bed_status TEXT;
BEGIN
    -- Check matching bed in beds table
    SELECT id, status INTO v_matching_bed_id, v_bed_status
    FROM public.beds
    WHERE organization_id = p_organization_id AND bed_number = p_bed_number
    FOR UPDATE;

    IF v_matching_bed_id IS NOT NULL AND UPPER(v_bed_status) NOT IN ('VACANT', 'AVAILABLE') THEN
        RAISE EXCEPTION 'BED_UNAVAILABLE: ICU Bed % is currently in % status', p_bed_number, v_bed_status;
    END IF;

    INSERT INTO public.critical_care_admissions (
        organization_id, patient_id, unit_id, bed_number, ventilator_required,
        admitting_doctor_id, initial_diagnosis, admission_time, status, created_at
    ) VALUES (
        p_organization_id,
        p_patient_id,
        p_unit_id,
        p_bed_number,
        p_ventilator_required,
        p_admitting_doctor_id,
        p_initial_diagnosis,
        NOW(),
        'ACTIVE',
        NOW()
    ) RETURNING id INTO v_admission_id;

    IF v_matching_bed_id IS NOT NULL THEN
        UPDATE public.beds
        SET status = 'OCCUPIED',
            admitted_at = NOW()
        WHERE id = v_matching_bed_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'admission_id', v_admission_id,
        'unit_id', p_unit_id,
        'bed_number', p_bed_number,
        'status', 'ACTIVE'
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 13. ATOMIC STORED PROCEDURE: discharge_critical_care_atomic
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.discharge_critical_care_atomic(
    p_admission_id UUID,
    p_final_diagnosis TEXT,
    p_destination TEXT,
    p_clinical_notes TEXT DEFAULT NULL,
    p_discharged_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT * INTO v_rec
    FROM public.critical_care_admissions
    WHERE id = p_admission_id
    FOR UPDATE;

    IF v_rec.id IS NULL THEN
        RAISE EXCEPTION 'ADMISSION_NOT_FOUND: Critical care admission % does not exist', p_admission_id;
    END IF;

    UPDATE public.critical_care_admissions
    SET status = 'DISCHARGED',
        discharge_time = NOW()
    WHERE id = p_admission_id;

    -- Update bed to CLEANING
    UPDATE public.beds
    SET status = 'CLEANING',
        admitted_at = NULL,
        patient_name = NULL
    WHERE organization_id = v_rec.organization_id AND bed_number = v_rec.bed_number;

    RETURN jsonb_build_object(
        'success', TRUE,
        'admission_id', p_admission_id,
        'bed_number', v_rec.bed_number,
        'bed_status', 'CLEANING',
        'status', 'DISCHARGED'
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 14. ATOMIC STORED PROCEDURE: transfer_bed_or_critical_care_atomic
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_bed_or_critical_care_atomic(
    p_organization_id UUID,
    p_source_bed_id UUID DEFAULT NULL,
    p_source_cabin_id UUID DEFAULT NULL,
    p_destination_bed_id UUID DEFAULT NULL,
    p_destination_cabin_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Clinical step-down or bed transfer',
    p_doctor_id UUID DEFAULT NULL,
    p_doctor_name TEXT DEFAULT NULL,
    p_transferred_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_assign RECORD;
    v_patient_name TEXT;
    v_dest_number TEXT;
    v_dest_status TEXT;
    v_dest_rate NUMERIC := 0;
    v_new_assignment_id UUID;
    v_source_number TEXT;
BEGIN
    IF p_destination_bed_id IS NULL AND p_destination_cabin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_REQUEST: Destination bed or cabin must be selected';
    END IF;

    -- 1. Find and lock active source assignment
    IF p_source_bed_id IS NOT NULL THEN
        SELECT ba.*, b.bed_number, b.daily_rate
        INTO v_source_assign
        FROM public.bed_assignments ba
        JOIN public.beds b ON b.id = ba.bed_id
        WHERE ba.bed_id = p_source_bed_id AND ba.status = 'ACTIVE'
        FOR UPDATE OF ba, b;

        v_source_number := v_source_assign.bed_number;
    ELSIF p_source_cabin_id IS NOT NULL THEN
        SELECT ba.*, c.cabin_number AS bed_number, c.daily_rate
        INTO v_source_assign
        FROM public.bed_assignments ba
        JOIN public.cabins c ON c.id = ba.cabin_id
        WHERE ba.cabin_id = p_source_cabin_id AND ba.status = 'ACTIVE'
        FOR UPDATE OF ba, c;

        v_source_number := v_source_assign.bed_number;
    ELSE
        RAISE EXCEPTION 'INVALID_REQUEST: Source bed or cabin must be provided';
    END IF;

    IF v_source_assign.id IS NULL THEN
        RAISE EXCEPTION 'NO_ACTIVE_ASSIGNMENT: No active patient found on source bed/cabin';
    END IF;

    SELECT full_name INTO v_patient_name
    FROM public.patients
    WHERE id = v_source_assign.patient_id;

    -- 2. Lock and validate destination
    IF p_destination_bed_id IS NOT NULL THEN
        SELECT status, bed_number, daily_rate
        INTO v_dest_status, v_dest_number, v_dest_rate
        FROM public.beds
        WHERE id = p_destination_bed_id
        FOR UPDATE;

        IF v_dest_status IS NULL THEN
            RAISE EXCEPTION 'DESTINATION_NOT_FOUND: Target bed does not exist';
        END IF;

        IF UPPER(v_dest_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'DESTINATION_UNAVAILABLE: Bed % is currently in % status', v_dest_number, v_dest_status;
        END IF;
    ELSE
        SELECT status, cabin_number, daily_rate
        INTO v_dest_status, v_dest_number, v_dest_rate
        FROM public.cabins
        WHERE id = p_destination_cabin_id
        FOR UPDATE;

        IF v_dest_status IS NULL THEN
            RAISE EXCEPTION 'DESTINATION_NOT_FOUND: Target cabin does not exist';
        END IF;

        IF UPPER(v_dest_status) NOT IN ('VACANT', 'AVAILABLE') THEN
            RAISE EXCEPTION 'DESTINATION_UNAVAILABLE: Cabin % is currently in % status', v_dest_number, v_dest_status;
        END IF;
    END IF;

    -- 3. Mark source assignment TRANSFERRED
    UPDATE public.bed_assignments
    SET status = 'TRANSFERRED',
        vacated_at = NOW()
    WHERE id = v_source_assign.id;

    -- 4. Mark source bed/cabin CLEANING
    IF p_source_bed_id IS NOT NULL THEN
        UPDATE public.beds
        SET status = 'CLEANING',
            patient_name = NULL,
            admitted_at = NULL
        WHERE id = p_source_bed_id;
    ELSE
        UPDATE public.cabins
        SET status = 'CLEANING'
        WHERE id = p_source_cabin_id;
    END IF;

    -- 5. Create new assignment on destination
    INSERT INTO public.bed_assignments (
        organization_id, visit_id, patient_id, bed_id, cabin_id, assigned_at, daily_charge, status, assigned_by
    ) VALUES (
        p_organization_id,
        v_source_assign.visit_id,
        v_source_assign.patient_id,
        p_destination_bed_id,
        p_destination_cabin_id,
        NOW(),
        COALESCE(v_dest_rate, 0),
        'ACTIVE',
        p_transferred_by
    ) RETURNING id INTO v_new_assignment_id;

    -- 6. Mark destination bed OCCUPIED
    IF p_destination_bed_id IS NOT NULL THEN
        UPDATE public.beds
        SET status = 'OCCUPIED',
            patient_name = v_patient_name,
            admitted_at = NOW()
        WHERE id = p_destination_bed_id;
    ELSE
        UPDATE public.cabins
        SET status = 'OCCUPIED'
        WHERE id = p_destination_cabin_id;
    END IF;

    UPDATE public.critical_care_admissions
    SET status = 'TRANSFERRED'
    WHERE patient_id = v_source_assign.patient_id AND status = 'ACTIVE';

    INSERT INTO public.audit_logs (
        organization_id, user_id, action, module, entity_type, entity_id, new_values, created_at
    ) VALUES (
        p_organization_id,
        p_transferred_by,
        'BED_TRANSFER',
        'IPD',
        'bed_assignments',
        v_new_assignment_id::text,
        jsonb_build_object(
            'patient_id', v_source_assign.patient_id,
            'patient_name', v_patient_name,
            'source_bed', v_source_number,
            'destination_bed', v_dest_number,
            'reason', p_reason,
            'doctor_name', p_doctor_name
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'previous_assignment_id', v_source_assign.id,
        'new_assignment_id', v_new_assignment_id,
        'patient_name', v_patient_name,
        'source_bed', v_source_number,
        'destination_bed', v_dest_number,
        'status', 'TRANSFERRED'
    );
END;
$$;

-- 15. Grants and PostgREST Schema Reload
REVOKE ALL ON FUNCTION public.admit_patient_to_bed_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_patient_to_bed_atomic TO authenticated;

REVOKE ALL ON FUNCTION public.vacate_or_discharge_bed_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vacate_or_discharge_bed_atomic TO authenticated;

REVOKE ALL ON FUNCTION public.update_bed_operational_status_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_bed_operational_status_atomic TO authenticated;

REVOKE ALL ON FUNCTION public.admit_critical_care_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admit_critical_care_atomic TO authenticated;

REVOKE ALL ON FUNCTION public.discharge_critical_care_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discharge_critical_care_atomic TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_bed_or_critical_care_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_bed_or_critical_care_atomic TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bed_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bed_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.critical_care_units TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.critical_care_admissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.critical_care_observations TO authenticated;

GRANT SELECT ON public.beds TO anon;
GRANT SELECT ON public.wards TO anon;
GRANT SELECT ON public.cabins TO anon;
GRANT SELECT ON public.bed_types TO anon;
GRANT SELECT ON public.critical_care_units TO anon;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
