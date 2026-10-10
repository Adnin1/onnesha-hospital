-- =====================================================================================
-- Migration: 20261011043000_seed_official_diagnostic_catalog_and_tariffs.sql
-- Description:
--   Complete official overhaul of hospital diagnostic test catalog and tariffs.
--   Seeds all 16 official diagnostic categories and 191 diagnostic tests/procedures
--   with 100% exact tariffs from official Bangladesh hospital rate charts.
--   Ensures test_code uniqueness per organization, updates legacy prices, and
--   maintains full referential integrity.
-- =====================================================================================

BEGIN;

DO $$
DECLARE
    r RECORD;
    v_cat_id UUID;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP

        -- Category: HEMA (Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট))
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)', 'HEMA', 'Complete blood count, differentials, coagulation and hematological diagnostics')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: HEMA_CBC_GOVT - CBC (Govt. Rate) (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_CBC_GOVT', 'CBC (Govt. Rate)', 'Blood', 400.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_CBC_ESR - CBC With ESR (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_CBC_ESR', 'CBC With ESR', 'Blood', 500.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_CBC_PBF - CBC with Blood Film (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_CBC_PBF', 'CBC with Blood Film', 'Blood', 1000.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_PLATELET - Platelet Count (300 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_PLATELET', 'Platelet Count', 'Blood', 300.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_TCDCHBESR - TC DC HB ESR (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_TCDCHBESR', 'TC DC HB ESR', 'Blood', 500.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_BLOOD_FILM - Blood Film (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_BLOOD_FILM', 'Blood Film', 'Blood', 600.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_ESR - ESR (100 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_ESR', 'ESR', 'Blood', 100.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_HB - HB% (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_HB', 'HB%', 'Blood', 200.00, 1, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_RETIC - Reticulocyte Count (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_RETIC', 'Reticulocyte Count', 'Blood', 400.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_BT_CT - BT CT (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_BT_CT', 'BT CT', 'Blood', 400.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: HEMA_EOSINOPHIL - Ctr Eosinophil Count (300 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'HEMA_EOSINOPHIL', 'Ctr Eosinophil Count', 'Blood', 300.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: SERO_IMMUNO (Sero-Immunology Tests)
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Sero-Immunology Tests', 'SERO_IMMUNO', 'Blood typing, compatibility screening and immuno-hematology')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: SERO_BLOOD_GRP - Blood Grouping (150 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SERO_BLOOD_GRP', 'Blood Grouping', 'Blood', 150.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: SERO_CROSS_MATCH - Screening & Cross Matching (1700 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SERO_CROSS_MATCH', 'Screening & Cross Matching', 'Blood', 1700.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: BIOCHEM (Biochemistry (বায়োকেমিস্ট্রি টেস্ট))
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Biochemistry (বায়োকেমিস্ট্রি টেস্ট)', 'BIOCHEM', 'Metabolic panels, renal profile, liver enzymes, electrolytes, lipids and diabetic evaluation')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: BIO_RBS - RBS (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_RBS', 'RBS', 'Blood', 200.00, 1, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_FBS - FBS (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_FBS', 'FBS', 'Blood', 200.00, 1, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_PPBS - PPBS (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_PPBS', 'PPBS', 'Blood', 200.00, 1, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_OGTT - OGTT (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_OGTT', 'OGTT', 'Blood', 600.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_2H_ABF - 2hrs ABF (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_2H_ABF', '2hrs ABF', 'Blood', 200.00, 1, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_2H_LUNCH - 2hrs lunch (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_2H_LUNCH', '2hrs lunch', 'Blood', 200.00, 1, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_2H_DINNER - 2hrs Dinner (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_2H_DINNER', '2hrs Dinner', 'Blood', 200.00, 1, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_2H_75G_GLUC - 2hrs After 75g glucose (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_2H_75G_GLUC', '2hrs After 75g glucose', 'Blood', 200.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_HBA1C - HbA1c (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_HBA1C', 'HbA1c', 'Blood', 800.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_S_CREATININE - S. Creatinine (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_S_CREATININE', 'S. Creatinine', 'Blood', 400.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_URIC_ACID - Uric Acid (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_URIC_ACID', 'Uric Acid', 'Blood', 500.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_EGFR - eGFR (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_EGFR', 'eGFR', 'Blood', 1000.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_UREA_BUN - Urea/ BUN (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_UREA_BUN', 'Urea/ BUN', 'Blood', 500.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_CHOLESTEROL - Cholesterol (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_CHOLESTEROL', 'Cholesterol', 'Blood', 400.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_TRIGLYCERIDE - Triglycerides (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_TRIGLYCERIDE', 'Triglycerides', 'Blood', 400.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_HDL - HDL Cholesterol (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_HDL', 'HDL Cholesterol', 'Blood', 400.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_LDL - LDL Cholesterol (350 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_LDL', 'LDL Cholesterol', 'Blood', 350.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_LIPID_PROFILE - Lipid profile (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_LIPID_PROFILE', 'Lipid profile', 'Blood', 1000.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_BILIRUBIN_TDI - Bilirubin (Total/Direct/Indirect) (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_BILIRUBIN_TDI', 'Bilirubin (Total/Direct/Indirect)', 'Blood', 800.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_S_BILIRUBIN - S. Bilirubin (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_S_BILIRUBIN', 'S. Bilirubin', 'Blood', 500.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_SGPT - SGPT (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_SGPT', 'SGPT', 'Blood', 600.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_SGOT - SGOT (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_SGOT', 'SGOT', 'Blood', 600.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_ALP - ALP (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_ALP', 'ALP', 'Blood', 600.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_S_ELECTROLYTE - S. Electrolytes (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_S_ELECTROLYTE', 'S. Electrolytes', 'Blood', 1200.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_S_AMYLASE - Serum Amylase (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_S_AMYLASE', 'Serum Amylase', 'Blood', 1000.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_S_LIPASE - Serum Lipase (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_S_LIPASE', 'Serum Lipase', 'Blood', 1200.00, 3, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_TOTAL_PROTEIN - Total Protein (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_TOTAL_PROTEIN', 'Total Protein', 'Blood', 600.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_ALBUMIN - Albumin (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_ALBUMIN', 'Albumin', 'Blood', 500.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: BIO_S_CALCIUM - Serum Calcium (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'BIO_S_CALCIUM', 'Serum Calcium', 'Blood', 500.00, 2, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: ICT_VIRO (ICT Method Immunology/Virology Tests)
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'ICT Method Immunology/Virology Tests', 'ICT_VIRO', 'Rapid immuno-chromatographic diagnostic testing for viral and infectious pathogens')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: ICT_HBSAG - HBsAg (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ICT_HBSAG', 'HBsAg', 'Blood', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ICT_ANTI_HCV - Anti-HCV (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ICT_ANTI_HCV', 'Anti-HCV', 'Blood', 1200.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ICT_ANTI_HIV - Anti-HIV (1&2) (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ICT_ANTI_HIV', 'Anti-HIV (1&2)', 'Blood', 1200.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ICT_TPHA_SYPHILIS - TPHA/Syphilis (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ICT_TPHA_SYPHILIS', 'TPHA/Syphilis', 'Blood', 600.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ICT_DENGUE_NS1 - Dengue Ns1 (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ICT_DENGUE_NS1', 'Dengue Ns1', 'Blood', 500.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ICT_DENGUE_AB - Dengue (IgM, IgG) (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ICT_DENGUE_AB', 'Dengue (IgM, IgG)', 'Blood', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ICT_PREGNANCY - Pregnancy Test (250 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ICT_PREGNANCY', 'Pregnancy Test', 'Urine', 250.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: SEROLOGY (Serology Tests)
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Serology Tests', 'SEROLOGY', 'Rheumatoid factor and autoimmune serological assays')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: SERO_RA_TEST - RA Test (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SERO_RA_TEST', 'RA Test', 'Blood', 500.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: IMMUNOLOGY (Immunological Tests)
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Immunological Tests', 'IMMUNOLOGY', 'Thyroid profile, immunoglobulins, ferritin, and essential vitamin markers')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: IMM_TSH - TSH (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_TSH', 'TSH', 'Blood', 1200.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_T3 - T3 (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_T3', 'T3', 'Blood', 1200.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_T4 - T4 (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_T4', 'T4', 'Blood', 1200.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_FT3 - FT3 (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_FT3', 'FT3', 'Blood', 1400.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_FT4 - FT4 (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_FT4', 'FT4', 'Blood', 1400.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_IGE - IgE (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_IGE', 'IgE', 'Blood', 1400.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_HBA1C - HbA1c (Immunology) (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_HBA1C', 'HbA1c (Immunology)', 'Blood', 1200.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_FERRITIN - Ferritin (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_FERRITIN', 'Ferritin', 'Blood', 1200.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_VITAMIN_D - Vitamin-D (4000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_VITAMIN_D', 'Vitamin-D', 'Blood', 4000.00, 6, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: IMM_VITAMIN_B12 - Vitamin-B12 (3000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'IMM_VITAMIN_B12', 'Vitamin-B12', 'Blood', 3000.00, 6, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: REPRO_ENDO (Reproductive Endocrinology)
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Reproductive Endocrinology', 'REPRO_ENDO', 'Hormonal profiles for fertility, endocrine and reproductive health evaluation')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: ENDO_PROLACTIN - Prolactin (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ENDO_PROLACTIN', 'Prolactin', 'Blood', 1400.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ENDO_LH - LH (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ENDO_LH', 'LH', 'Blood', 1400.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ENDO_BHCG - BHCG (1500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ENDO_BHCG', 'BHCG', 'Blood', 1500.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ENDO_PROGESTERONE - Progesterone (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ENDO_PROGESTERONE', 'Progesterone', 'Blood', 1400.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ENDO_ESTRADIOL - Estradiol (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ENDO_ESTRADIOL', 'Estradiol', 'Blood', 1200.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ENDO_TESTOSTERONE - Testosterone (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ENDO_TESTOSTERONE', 'Testosterone', 'Blood', 1400.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: ONCOLOGY (Oncology (ক্যান্সার সংক্রান্ত টেস্ট))
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Oncology (ক্যান্সার সংক্রান্ত টেস্ট)', 'ONCOLOGY', 'Tumor markers and cancer screening biomarkers')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: ONCO_CA_125 - CA 125 (1500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ONCO_CA_125', 'CA 125', 'Blood', 1500.00, 6, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ONCO_CA_19_9 - CA 19.9 (1500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ONCO_CA_19_9', 'CA 19.9', 'Blood', 1500.00, 6, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ONCO_CA_15_3 - CA 15.3 (1500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ONCO_CA_15_3', 'CA 15.3', 'Blood', 1500.00, 6, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ONCO_AFP - AFP (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ONCO_AFP', 'AFP', 'Blood', 1000.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ONCO_PSA - PSA (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ONCO_PSA', 'PSA', 'Blood', 1400.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: ONCO_CEA - CEA (1100 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'ONCO_CEA', 'CEA', 'Blood', 1100.00, 4, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: CLIN_PATH (Clinical Pathology)
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Clinical Pathology', 'CLIN_PATH', 'Urine, stool, semen and scraping microscopic and physical examination')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: PATH_URINE_RME - Urine R/M/E (350 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'PATH_URINE_RME', 'Urine R/M/E', 'Urine', 350.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: PATH_URINE_PROTEIN - Urine for Protein (150 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'PATH_URINE_PROTEIN', 'Urine for Protein', 'Urine', 150.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: PATH_URINE_SUGAR - Urine for Sugar (150 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'PATH_URINE_SUGAR', 'Urine for Sugar', 'Urine', 150.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: PATH_STOOL_RME - Stool R/M/E (200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'PATH_STOOL_RME', 'Stool R/M/E', 'Stool', 200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: PATH_SEMEN_ANALYSIS - Semen Analysis (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'PATH_SEMEN_ANALYSIS', 'Semen Analysis', 'Semen', 1200.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: PATH_SKIN_SCRAPING - Skin Scraping for Fungus (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'PATH_SKIN_SCRAPING', 'Skin Scraping for Fungus', 'Skin', 400.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: MICROBIO (Microbiological Tests)
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Microbiological Tests', 'MICROBIO', 'Bacterial cultures, sensitivity testing, stain microscopy and AFB diagnostics')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: MIC_BLOOD_CS - Blood for C/S (2000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MIC_BLOOD_CS', 'Blood for C/S', 'Blood', 2000.00, 72, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MIC_URINE_CS - Urine for C/S (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MIC_URINE_CS', 'Urine for C/S', 'Urine', 1000.00, 72, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MIC_SPUTUM_CS - Sputum for C/S (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MIC_SPUTUM_CS', 'Sputum for C/S', 'Sputum', 1000.00, 72, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MIC_SPUTUM_AFB - Sputum for AFB (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MIC_SPUTUM_AFB', 'Sputum for AFB', 'Sputum', 500.00, 24, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MIC_SPUTUM_GRAM - Sputum for Gram Stain (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MIC_SPUTUM_GRAM', 'Sputum for Gram Stain', 'Sputum', 500.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: MICRO_OTHER (Microbiological Tests (Widal/Other))
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'Microbiological Tests (Widal/Other)', 'MICRO_OTHER', 'Serological parasite & pathogen antibody titers')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: MIC_TOXO_IGG - Iron Toxo-IgG (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MIC_TOXO_IGG', 'Iron Toxo-IgG', 'Blood', 1200.00, 24, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MIC_TOXO_IGM - Iron Toxo-IgM (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MIC_TOXO_IGM', 'Iron Toxo-IgM', 'Blood', 1000.00, 24, TRUE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: USG (USG (আল্ট্রাসনোগ্রাফি))
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'USG (আল্ট্রাসনোগ্রাফি)', 'USG', 'High-resolution abdominal, obstetric, pelvic and soft-tissue ultrasound scans')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: USG_TVS - USG TVS (1800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_TVS', 'USG TVS', 'None', 1800.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_LOWER_ABDOMEN - USG OF LOWER ABDOMEN (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_LOWER_ABDOMEN', 'USG OF LOWER ABDOMEN', 'None', 1200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_BOTH_BREAST - USG Both Breast (2500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_BOTH_BREAST', 'USG Both Breast', 'None', 2500.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_SINGLE_BREAST - USG Single Breast (1600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_SINGLE_BREAST', 'USG Single Breast', 'None', 1600.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_PREG_4D - USG of Pregnancy Profile 4D (2000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_PREG_4D', 'USG of Pregnancy Profile 4D', 'None', 2000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_PREG_PROFILE - USG of Pregnancy Profile (PP) (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_PREG_PROFILE', 'USG of Pregnancy Profile (PP)', 'None', 1200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_KUB_PROST_PVR - USG KUB with Prostate & Residual Volume (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_KUB_PROST_PVR', 'USG KUB with Prostate & Residual Volume', 'None', 1200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_KUB_PELVIS - USG KUB & Pelvis Organ (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_KUB_PELVIS', 'USG KUB & Pelvis Organ', 'None', 1200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_KUB_GENITOURIN - USG KUB/Gmito-Urinary (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_KUB_GENITOURIN', 'USG KUB/Gmito-Urinary', 'None', 1200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_UPPER_ABDOMEN - USG Upper Abdomen (1200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_UPPER_ABDOMEN', 'USG Upper Abdomen', 'None', 1200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_WHOLE_ABDOMEN - USG Whole Abdomen (1400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_WHOLE_ABDOMEN', 'USG Whole Abdomen', 'None', 1400.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: USG_WA_MCC_PVR_PR - USG W/A, MCC, PVR, PROST (1800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'USG_WA_MCC_PVR_PR', 'USG W/A, MCC, PVR, PROST', 'None', 1800.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: XRAY (X-RAY (ডিজিটাল এক্স-রে))
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'X-RAY (ডিজিটাল এক্স-রে)', 'XRAY', 'Digital high-definition skeletal, chest, contrast and fluoroscopy examinations')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: XRAY_RT_WRIST_BV - X-ray RT WRIST B/V (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_RT_WRIST_BV', 'X-ray RT WRIST B/V', 'None', 600.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_LT_WRIST_BV - X-ray LT WRIST B/V (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_LT_WRIST_BV', 'X-ray LT WRIST B/V', 'None', 600.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_RT_FOOT_BV - X-ray Rt Foot B/V (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_RT_FOOT_BV', 'X-ray Rt Foot B/V', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_LT_HUMERUS_BV - X-ray Lt Humerus B/V (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_LT_HUMERUS_BV', 'X-ray Lt Humerus B/V', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_SI_JOINTS_AP - X-ray of Si Joints A/P view (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_SI_JOINTS_AP', 'X-ray of Si Joints A/P view', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_RT_SHOULDER_BV - X-ray Rt Shoulder Joints B/V (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_RT_SHOULDER_BV', 'X-ray Rt Shoulder Joints B/V', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_TIBIA_FIBULA_BV - X-ray of TIBIA & FIBULA B/V (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_TIBIA_FIBULA_BV', 'X-ray of TIBIA & FIBULA B/V', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_MASTOID_TOWNE - X-ray Mastoid Townes (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_MASTOID_TOWNE', 'X-ray Mastoid Townes', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CERVICAL_SP_BOTH - X-RAY OF CERVICAL SPINE BOTH VIEW (1500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CERVICAL_SP_BOTH', 'X-RAY OF CERVICAL SPINE BOTH VIEW', 'None', 1500.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_PELVIS_BV - X-ray of Pelvis BV (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_PELVIS_BV', 'X-ray of Pelvis BV', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_PELVIS_AP - X-ray of Pelvis AP View (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_PELVIS_AP', 'X-ray of Pelvis AP View', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_LT_KNEE_BV - X-ray of Left Knee Joint B/V (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_LT_KNEE_BV', 'X-ray of Left Knee Joint B/V', 'None', 600.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_NECK - X-ray of Neck (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_NECK', 'X-ray of Neck', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_ABDOMEN_BV - X-ray of Abdomen B/V (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_ABDOMEN_BV', 'X-ray of Abdomen B/V', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CERVICAL_SP_BV - X-ray of Cervical Spine B/V (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CERVICAL_SP_BV', 'X-ray of Cervical Spine B/V', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_C_SPINE_BV - X-ray C. SPINE B/V (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_C_SPINE_BV', 'X-ray C. SPINE B/V', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_HAND_BV - X-RAY HAND B/V (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_HAND_BV', 'X-RAY HAND B/V', 'None', 600.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_NASOPHARYNX_LAT - X-ray Nasopharynx Lateral View (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_NASOPHARYNX_LAT', 'X-ray Nasopharynx Lateral View', 'None', 500.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_LS_SPINE_OBL - X-ray L/S Spine AP Lat B/V/OBLIQUE (2000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_LS_SPINE_OBL', 'X-ray L/S Spine AP Lat B/V/OBLIQUE', 'None', 2000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_DORSAL_SPINE_LAT - X-ray Dorsal Spine LAT/Both (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_DORSAL_SPINE_LAT', 'X-ray Dorsal Spine LAT/Both', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_DL_SPINE_OBL - X-ray D/L Spine LAT/Both Oblique (2000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_DL_SPINE_OBL', 'X-ray D/L Spine LAT/Both Oblique', 'None', 2000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_PELVIS_AP_BV - X-ray Pelvis AP/B/V (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_PELVIS_AP_BV', 'X-ray Pelvis AP/B/V', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_LT_FOOT_BV - X-ray Lt Foot B/V (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_LT_FOOT_BV', 'X-ray Lt Foot B/V', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_KNEE_THIGH_FEM - X-ray Knee with Thigh / femure (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_KNEE_THIGH_FEM', 'X-ray Knee with Thigh / femure', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_KNEE_JOINT_BV - X-ray Knee Joint B/V (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_KNEE_JOINT_BV', 'X-ray Knee Joint B/V', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_FEMUR_HP_KNEE - X-ray Femur (Both/Right/Left) H/P/Knee (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_FEMUR_HP_KNEE', 'X-ray Femur (Both/Right/Left) H/P/Knee', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CALCANEUM_BV - X-ray Calcaneum B/V R/L (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CALCANEUM_BV', 'X-ray Calcaneum B/V R/L', 'None', 600.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_ANKLE_JOINT_BV - X-ray Ankle Joint (Both/Right/Left) B/V (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_ANKLE_JOINT_BV', 'X-ray Ankle Joint (Both/Right/Left) B/V', 'None', 600.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_LT_SHOULDER_BV - X-ray Lt Shoulder Joints B/V (600 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_LT_SHOULDER_BV', 'X-ray Lt Shoulder Joints B/V', 'None', 600.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_ARM_BV - X-ray Arm B/V (800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_ARM_BV', 'X-ray Arm B/V', 'None', 800.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_SKULL_BV_LV_TV - X-ray Skull B/V, L/V, T/V (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_SKULL_BV_LV_TV', 'X-ray Skull B/V, L/V, T/V', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_PNS_OM_VIEW - X-ray PNS OM View (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_PNS_OM_VIEW', 'X-ray PNS OM View', 'None', 500.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CHEST_OBLIQUE - X-ray Chest Oblique Lower (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CHEST_OBLIQUE', 'X-ray Chest Oblique Lower', 'None', 500.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CHEST_LT_RT_LV - X-ray Chest Lt L/V Rt L/V (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CHEST_LT_RT_LV', 'X-ray Chest Lt L/V Rt L/V', 'None', 500.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CHEST_DECUBITUS - X-ray Chest Decubitus View (Lt, Rt) (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CHEST_DECUBITUS', 'X-ray Chest Decubitus View (Lt, Rt)', 'None', 500.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CHEST_BV_VIEW - X-ray Chest B/V View (1000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CHEST_BV_VIEW', 'X-ray Chest B/V View', 'None', 1000.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CHEST_PA_VIEW - X-ray Chest P/A View (500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CHEST_PA_VIEW', 'X-ray Chest P/A View', 'None', 500.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CONTRAST_MYELO - Contrast X-ray Full/Lumbar Myelogram (1500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CONTRAST_MYELO', 'Contrast X-ray Full/Lumbar Myelogram', 'None', 1500.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_CONTRAST_IVU_MCU - Contrast X-ray IVU/MCU (2500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_CONTRAST_IVU_MCU', 'Contrast X-ray IVU/MCU', 'None', 2500.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_IVU_POST_MICT - Contrast X-ray IVU With Post Mict Film (2200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_IVU_POST_MICT', 'Contrast X-ray IVU With Post Mict Film', 'None', 2200.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_RGU - RGU X-Ray (1800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_RGU', 'RGU X-Ray', 'None', 1800.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: XRAY_MCU - MCU X-Ray (1800 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'XRAY_MCU', 'MCU X-Ray', 'None', 1800.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: CT_SCAN (CT Scan)
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'CT Scan', 'CT_SCAN', 'Multi-slice computed tomography scans with and without IV contrast enhancement')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: CT_ANGIOGRAM_BRAIN - CT Scan of CT Angiogram Brain (12500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_ANGIOGRAM_BRAIN', 'CT Scan of CT Angiogram Brain', 'None', 12500.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_GUIDED_FNAC - CT Scan of CT Guided FNAC (5500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_GUIDED_FNAC', 'CT Scan of CT Guided FNAC', 'None', 5500.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_JOINT_BONES - CT Scan of Joint/Bones (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_JOINT_BONES', 'CT Scan of Joint/Bones', 'None', 6000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_MYELO_LS_SPINE - CT Scan of Myelo- CT of L/S Spine (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_MYELO_LS_SPINE', 'CT Scan of Myelo- CT of L/S Spine', 'None', 5000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_MYELO_DORSAL_SP - CT Scan of Myelo- CT of Dorsal Spine (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_MYELO_DORSAL_SP', 'CT Scan of Myelo- CT of Dorsal Spine', 'None', 5000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_MYELO_CERVICAL_SP - CT Scan of Myelo- CT of Cervical Spine (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_MYELO_CERVICAL_SP', 'CT Scan of Myelo- CT of Cervical Spine', 'None', 5000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_LOWER_ABD_PELVIS - CT Scan of Lower Abdomen Pelvis Organ (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_LOWER_ABD_PELVIS', 'CT Scan of Lower Abdomen Pelvis Organ', 'None', 5000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_KUB_REGION - CT Scan of KUB Region (10000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_KUB_REGION', 'CT Scan of KUB Region', 'None', 10000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_WHOLE_ABDOMEN - CT Scan of Whole Abdomen (10000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_WHOLE_ABDOMEN', 'CT Scan of Whole Abdomen', 'None', 10000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_HRCT_HBS_UPPER - CT Scan of HRCT of HBs/Upper Abdomen (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_HRCT_HBS_UPPER', 'CT Scan of HRCT of HBs/Upper Abdomen', 'None', 5000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_CHEST_MEDIASTIUM - CT Scan of Chest- Mediastium (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_CHEST_MEDIASTIUM', 'CT Scan of Chest- Mediastium', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_NECK - CT Scan of Neck (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_NECK', 'CT Scan of Neck', 'None', 5000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_NASOPHARYNX - CT Scan of Nasopharynx (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_NASOPHARYNX', 'CT Scan of Nasopharynx', 'None', 5000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_PNS - CT Scan of PNS (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_PNS', 'CT Scan of PNS', 'None', 5000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_ORBITS - CT Scan of Orbits (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_ORBITS', 'CT Scan of Orbits', 'None', 5000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_PITUITARY - CT Scan of Pituitary Region (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_PITUITARY', 'CT Scan of Pituitary Region', 'None', 5000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_BRAIN_HEAD_SKULL - CT Scan of Brain Head/Brain & Skull (3500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_BRAIN_HEAD_SKULL', 'CT Scan of Brain Head/Brain & Skull', 'None', 3500.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: CT_NASOPHARYNX_AX - CT Scan of Nasopharynx (Axial/Coronal) (5000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'CT_NASOPHARYNX_AX', 'CT Scan of Nasopharynx (Axial/Coronal)', 'None', 5000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: MRI (MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং))
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)', 'MRI', 'High-field magnetic resonance imaging of neuro, musculoskeletal and body systems')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: MRI_WHOLE_SPINE_TIM - MRI of Whole Spine (TIM) (16000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_WHOLE_SPINE_TIM', 'MRI of Whole Spine (TIM)', 'None', 16000.00, 6, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_WHOLE_BODY_TM - MRI of Whole Body (TM) (30000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_WHOLE_BODY_TM', 'MRI of Whole Body (TM)', 'None', 30000.00, 12, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_MRCP - MRI of MRCP (7000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_MRCP', 'MRI of MRCP', 'None', 7000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_BREAST_RL - MRI of Breast R/L (7000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_BREAST_RL', 'MRI of Breast R/L', 'None', 7000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_MRA_BRAIN_CAROTIC - MRI of MRA Brain/Carotic/Other (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_MRA_BRAIN_CAROTIC', 'MRI of MRA Brain/Carotic/Other', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_ANKLE_JOINT_RL - MRI of Ankle Joint R/L (7000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_ANKLE_JOINT_RL', 'MRI of Ankle Joint R/L', 'None', 7000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_KNEE_JOINT_RL - MRI of Knee Joint R/L (7000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_KNEE_JOINT_RL', 'MRI of Knee Joint R/L', 'None', 7000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_HIP_TM_JOINT - MRI of Hip/ TM Joint (7000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_HIP_TM_JOINT', 'MRI of Hip/ TM Joint', 'None', 7000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_SHOULDER_JOINT_RL - MRI of Shoulder Joint R/L (7000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_SHOULDER_JOINT_RL', 'MRI of Shoulder Joint R/L', 'None', 7000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_ELBOW_JOINT_RL - MRI of Elbow Joint R/L (7000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_ELBOW_JOINT_RL', 'MRI of Elbow Joint R/L', 'None', 7000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_KUB_REGION - MRI of KUB Region (12000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_KUB_REGION', 'MRI of KUB Region', 'None', 12000.00, 6, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_CERVICO_THORACIC - MRI of Cervico-Thoracic Spine (10000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_CERVICO_THORACIC', 'MRI of Cervico-Thoracic Spine', 'None', 10000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_LUMBO_SACRAL_SP - MRI of Lumbo Sacral Spine (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_LUMBO_SACRAL_SP', 'MRI of Lumbo Sacral Spine', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_DORSAL_SPINE - MRI of Dorsal Spine (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_DORSAL_SPINE', 'MRI of Dorsal Spine', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_CERVICAL_SPINE - MRI of Cervical Spine (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_CERVICAL_SPINE', 'MRI of Cervical Spine', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_WHOLE_ABDOMEN - MRI of Whole Abdomen (12000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_WHOLE_ABDOMEN', 'MRI of Whole Abdomen', 'None', 12000.00, 6, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_PELVIS - MRI of Pelvis (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_PELVIS', 'MRI of Pelvis', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_LOWER_ABDOMEN - MRI of Lower Abdomen (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_LOWER_ABDOMEN', 'MRI of Lower Abdomen', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_UPPER_ABDOMEN - MRI of Upper Abdomen (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_UPPER_ABDOMEN', 'MRI of Upper Abdomen', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_CHEST - MRI of Chest (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_CHEST', 'MRI of Chest', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_NECK - MRI of Neck (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_NECK', 'MRI of Neck', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_ORBITS_PNS_NASO - MRI of Orbits/PNS/Nasopharynx (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_ORBITS_PNS_NASO', 'MRI of Orbits/PNS/Nasopharynx', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_MASTOID_EAR - MRI of Mastoid/Ear (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_MASTOID_EAR', 'MRI of Mastoid/Ear', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_PITUITARY - MRI of Pituitary Region (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_PITUITARY', 'MRI of Pituitary Region', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_BRAIN_HEAD_SKULL - MRI of Brain/Head/Skull (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_BRAIN_HEAD_SKULL', 'MRI of Brain/Head/Skull', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: MRI_ORBITS_PNS_NASO_C - MRI of Orbits/PNS/Nasopharynx (Contrast) (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'MRI_ORBITS_PNS_NASO_C', 'MRI of Orbits/PNS/Nasopharynx (Contrast)', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Category: SPECIAL_DIAG (অন্যান্য বিশেষ টেস্ট (Special Diagnostic))
        INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
        VALUES (r.id, 'অন্যান্য বিশেষ টেস্ট (Special Diagnostic)', 'SPECIAL_DIAG', 'Endoscopy, colonoscopy, echocardiography, duplex color flow and cardiovascular diagnostics')
        ON CONFLICT (organization_id, category_code) DO UPDATE
        SET category_name = EXCLUDED.category_name,
            description = EXCLUDED.description
        RETURNING id INTO v_cat_id;

        -- Test: SPEC_DUPLEX_STUDY_1L - Duplex Study Upper/Lower Limb (4500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SPEC_DUPLEX_STUDY_1L', 'Duplex Study Upper/Lower Limb', 'None', 4500.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: SPEC_DUPLEX_STUDY_BOTH - Duplex Study Both (8000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SPEC_DUPLEX_STUDY_BOTH', 'Duplex Study Both', 'None', 8000.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: SPEC_ECHO_COLOR_DOPPLER - Echo Color Doppler (3200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SPEC_ECHO_COLOR_DOPPLER', 'Echo Color Doppler', 'None', 3200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: SPEC_ECHOCARDIOGRAM - Echo Cardiogram (2200 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SPEC_ECHOCARDIOGRAM', 'Echo Cardiogram', 'None', 2200.00, 2, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: SPEC_ENDOSCOPY - Endoscopy (2000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SPEC_ENDOSCOPY', 'Endoscopy', 'None', 2000.00, 3, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: SPEC_COLONOSCOPY_SHORT - Colonoscopy (Short) (4500 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SPEC_COLONOSCOPY_SHORT', 'Colonoscopy (Short)', 'None', 4500.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: SPEC_COLONOSCOPY_FULL - Colonoscopy (Full) (6000 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SPEC_COLONOSCOPY_FULL', 'Colonoscopy (Full)', 'None', 6000.00, 4, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

        -- Test: SPEC_ECG - ECG (400 TK)
        INSERT INTO public.diagnostic_tests (
            organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active
        ) VALUES (
            r.id, v_cat_id, 'SPEC_ECG', 'ECG', 'None', 400.00, 1, FALSE, TRUE
        )
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET category_id = EXCLUDED.category_id,
            test_name = EXCLUDED.test_name,
            specimen_type = EXCLUDED.specimen_type,
            price = EXCLUDED.price,
            delivery_turnaround_hours = EXCLUDED.delivery_turnaround_hours,
            has_numerical_parameters = EXCLUDED.has_numerical_parameters,
            is_active = TRUE;

    END LOOP;
END $$;

COMMIT;
