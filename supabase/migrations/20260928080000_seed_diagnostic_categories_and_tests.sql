-- =====================================================================================
-- Migration: 20260928080000_seed_diagnostic_categories_and_tests.sql
-- Description:
--   Seeds standard Bangladeshi hospital diagnostic categories, test master catalog,
--   and clinical reference parameters with idempotent ON CONFLICT handling.
-- =====================================================================================

BEGIN;

-- 1. Seed Diagnostic Categories
INSERT INTO public.diagnostic_categories (
    id, organization_id, category_name, category_code, description
) VALUES
(
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Hematology',
    'HEMA',
    'Complete blood analysis, cell counts, differential and coagulation profiles'
),
(
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Biochemistry',
    'BIOCHEM',
    'Metabolic panels, renal profile, liver enzymes, lipids and diabetic evaluation'
),
(
    'c0000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Clinical Pathology',
    'CLIN_PATH',
    'Urine, stool, and bodily fluid microscopic and biochemical analyses'
),
(
    'c0000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Radiology & Imaging',
    'RAD_IMG',
    'Digital X-Ray, high-resolution ultrasonography and diagnostic scans'
),
(
    'c0000000-0000-0000-0000-000000000005'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'Cardiology Diagnostics',
    'CARD_DIAG',
    '12-Lead Electrocardiogram, Echocardiogram and cardiovascular non-invasive diagnostics'
)
ON CONFLICT (organization_id, category_code) DO UPDATE
SET category_name = EXCLUDED.category_name,
    description = EXCLUDED.description;

-- 2. Seed Standard Diagnostic Tests Master
INSERT INTO public.diagnostic_tests (
    id, organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
) VALUES
-- Hematology
(
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'CBC_ESR',
    'Complete Blood Count (CBC) with ESR',
    'Blood',
    400.00,
    3,
    TRUE,
    TRUE
),
-- Biochemistry
(
    'b1000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'RBS',
    'Random Blood Sugar (RBS)',
    'Blood',
    150.00,
    1,
    TRUE,
    TRUE
),
(
    'b1000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'FBS',
    'Fasting Blood Sugar (FBS)',
    'Blood',
    150.00,
    1,
    TRUE,
    TRUE
),
(
    'b1000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'S_CREAT',
    'Serum Creatinine',
    'Blood',
    350.00,
    2,
    TRUE,
    TRUE
),
(
    'b1000000-0000-0000-0000-000000000005'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'LIPID',
    'Lipid Profile (Cholesterol, HDL, LDL, Triglycerides)',
    'Blood',
    1000.00,
    4,
    TRUE,
    TRUE
),
(
    'b1000000-0000-0000-0000-000000000006'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'SGPT_ALT',
    'Serum Glutamic Pyruvic Transaminase (SGPT/ALT)',
    'Blood',
    400.00,
    2,
    TRUE,
    TRUE
),
(
    'b1000000-0000-0000-0000-000000000007'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'ELECTRO',
    'Serum Electrolytes (Na+, K+, Cl-)',
    'Blood',
    800.00,
    3,
    TRUE,
    TRUE
),
-- Clinical Pathology
(
    'b1000000-0000-0000-0000-000000000008'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000003'::uuid,
    'URINE_RME',
    'Urine Routine & Microscopic Examination (R/M/E)',
    'Urine',
    250.00,
    2,
    TRUE,
    TRUE
),
-- Radiology & Imaging
(
    'b1000000-0000-0000-0000-000000000009'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000004'::uuid,
    'XRAY_CHEST',
    'Digital X-Ray Chest (P/A View)',
    'NONE',
    600.00,
    2,
    FALSE,
    TRUE
),
(
    'b1000000-0000-0000-0000-000000000010'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000004'::uuid,
    'USG_WHOLE_ABD',
    'Ultrasonography (USG) of Whole Abdomen',
    'NONE',
    1500.00,
    2,
    FALSE,
    TRUE
),
-- Cardiology
(
    'b1000000-0000-0000-0000-000000000011'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000005'::uuid,
    'ECG_12',
    '12-Lead Electrocardiogram (ECG)',
    'NONE',
    300.00,
    1,
    FALSE,
    TRUE
)
ON CONFLICT (organization_id, test_code) DO UPDATE
SET test_name = EXCLUDED.test_name,
    price = EXCLUDED.price,
    specimen_type = EXCLUDED.specimen_type,
    is_active = TRUE;

-- 3. Seed CBC Parameters
INSERT INTO public.diagnostic_test_parameters (
    id, test_id, parameter_name, unit, reference_range_male, reference_range_female, reference_range_child, display_order
) VALUES
(
    'f1000000-0000-0000-0000-000000000001'::uuid,
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'Hemoglobin (Hb)',
    'g/dL',
    '13.5 - 17.5',
    '12.0 - 15.5',
    '11.0 - 14.5',
    1
),
(
    'f1000000-0000-0000-0000-000000000002'::uuid,
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'Erythrocyte Sedimentation Rate (ESR)',
    'mm/1st hr',
    '0 - 15',
    '0 - 20',
    '0 - 10',
    2
),
(
    'f1000000-0000-0000-0000-000000000003'::uuid,
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'Total White Blood Cell Count (WBC)',
    '/cu mm',
    '4,000 - 11,000',
    '4,000 - 11,000',
    '5,000 - 15,000',
    3
),
(
    'f1000000-0000-0000-0000-000000000004'::uuid,
    'b1000000-0000-0000-0000-000000000001'::uuid,
    'Platelet Count',
    'x 10^3/uL',
    '150 - 450',
    '150 - 450',
    '150 - 450',
    4
),
-- Serum Creatinine Parameter
(
    'f1000000-0000-0000-0000-000000000005'::uuid,
    'b1000000-0000-0000-0000-000000000004'::uuid,
    'Serum Creatinine',
    'mg/dL',
    '0.7 - 1.3',
    '0.5 - 1.1',
    '0.3 - 0.7',
    1
),
-- Blood Glucose Parameter
(
    'f1000000-0000-0000-0000-000000000006'::uuid,
    'b1000000-0000-0000-0000-000000000002'::uuid,
    'Random Blood Sugar (RBS)',
    'mmol/L',
    '4.0 - 7.8',
    '4.0 - 7.8',
    '4.0 - 7.0',
    1
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
