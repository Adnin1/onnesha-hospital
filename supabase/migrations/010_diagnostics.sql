-- =====================================================================================
-- 010_DIAGNOSTICS_AND_LAB.sql
-- Pathology, Biochemistry, Radiology (X-Ray, USG, ECG), parameters, samples, and verified reports.
-- =====================================================================================

-- 1. Diagnostic Categories (Pathology, Radiology, Cardiology, etc.)
CREATE TABLE IF NOT EXISTS diagnostic_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category_name VARCHAR(100) NOT NULL,
    category_code VARCHAR(30) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, category_code)
);

-- 2. Diagnostic Tests Master
CREATE TABLE IF NOT EXISTS diagnostic_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES diagnostic_categories(id) ON DELETE RESTRICT,
    test_code VARCHAR(30) NOT NULL,
    test_name VARCHAR(150) NOT NULL,
    specimen_type VARCHAR(50) NOT NULL DEFAULT 'NONE', -- Blood, Urine, Stool, Tissue, None (X-Ray/ECG)
    price NUMERIC(10, 2) NOT NULL,
    delivery_turnaround_hours INT NOT NULL DEFAULT 4,
    has_numerical_parameters BOOLEAN NOT NULL DEFAULT TRUE, -- TRUE for Blood tests, FALSE for USG/X-Ray descriptive
    report_template TEXT, -- Rich-text template for USG/X-Ray
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, test_code)
);

-- 3. Diagnostic Test Parameters (For numerical lab tests)
CREATE TABLE IF NOT EXISTS diagnostic_test_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES diagnostic_tests(id) ON DELETE CASCADE,
    parameter_name VARCHAR(150) NOT NULL,
    unit VARCHAR(30),
    reference_range_male VARCHAR(100),
    reference_range_female VARCHAR(100),
    reference_range_child VARCHAR(100),
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Diagnostic Orders
CREATE TABLE IF NOT EXISTS diagnostic_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    visit_id UUID REFERENCES patient_visits(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    referred_by_doctor_id UUID REFERENCES doctors(id),
    order_number VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ORDERED' CHECK (status IN ('ORDERED', 'PAID', 'SAMPLE_COLLECTED', 'PROCESSING', 'VERIFIED', 'DELIVERED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, order_number)
);

-- 5. Diagnostic Order Items
CREATE TABLE IF NOT EXISTS diagnostic_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES diagnostic_orders(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES diagnostic_tests(id) ON DELETE RESTRICT,
    price NUMERIC(10, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SAMPLE_COLLECTED', 'PROCESSING', 'VERIFIED', 'DELIVERED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Sample Collections (Phlebotomy Barcoding)
CREATE TABLE IF NOT EXISTS sample_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL UNIQUE REFERENCES diagnostic_order_items(id) ON DELETE CASCADE,
    barcode VARCHAR(50) NOT NULL,
    specimen_type VARCHAR(50) NOT NULL,
    collected_by UUID REFERENCES profiles(id),
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Diagnostic Results (Values or Rich Text Reports)
CREATE TABLE IF NOT EXISTS diagnostic_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES diagnostic_order_items(id) ON DELETE CASCADE,
    descriptive_findings TEXT, -- Used for X-Ray, USG, ECG findings & impression
    technician_id UUID REFERENCES profiles(id),
    entered_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Numerical Parameter Result Values
CREATE TABLE IF NOT EXISTS diagnostic_result_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES diagnostic_results(id) ON DELETE CASCADE,
    parameter_id UUID NOT NULL REFERENCES diagnostic_test_parameters(id) ON DELETE RESTRICT,
    observed_value VARCHAR(100) NOT NULL,
    is_abnormal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (result_id, parameter_id)
);

-- 9. Diagnostic Report Verifications (Pathologist Electronic Authorization)
CREATE TABLE IF NOT EXISTS diagnostic_report_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL UNIQUE REFERENCES diagnostic_order_items(id) ON DELETE CASCADE,
    verified_by UUID NOT NULL REFERENCES profiles(id),
    signature_hash VARCHAR(255) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    remarks TEXT
);
