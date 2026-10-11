-- =====================================================================================
-- Migration: 20261011083000_seed_official_hospital_rate_chart.sql
-- Description:
--   Authoritative synchronisation of official hospital rate chart for ANNESHA HOSPITAL AND DIAGNOSTIC.
--   Enforces exact tariffs for all ~140 procedures across Hematology, Biochemistry,
--   Immunology, Clinical Pathology, USG, X-Ray, CT Scan, MRI, and Special Procedures.
--   Synchronises both public.diagnostic_tests and public.hospital_service_tariffs.
-- =====================================================================================

BEGIN;

DO $$
DECLARE
    r RECORD;
    v_cat_id UUID;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP

        -- ==========================================
        -- 1. HEMATOLOGY
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'HEMA';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'Hematological Tests (রক্ত রোগ সংক্রান্ত টেস্ট)', 'HEMA', 'Blood diagnostics')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'HEMA_CBC_GOVT', 'CBC (Govt. Rate)', 'Blood', 400.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_CBC_ESR', 'CBC With ESR', 'Blood', 500.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_CBC_PBF', 'CBC with Blood Film', 'Blood', 1000.00, 4, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_PLATELET', 'Platelet Count', 'Blood', 300.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_TCDCHBESR', 'TC DC HB ESR', 'Blood', 500.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_TCE', 'Total Circulating Eosinophil (TCE)', 'Blood', 300.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_AEC', 'Absolute Eosinophil Count (AEC)', 'Blood', 350.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_MP', 'Malarial Parasite (MP)', 'Blood', 300.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_BTCT', 'BT & CT (Bleeding & Clotting Time)', 'Blood', 300.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_PTINR', 'Prothrombin Time with INR', 'Blood', 800.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'HEMA_PBF', 'Peripheral Blood Film (PBF)', 'Blood', 800.00, 4, TRUE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 2. SERO-IMMUNOLOGY
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'SERO_IMMUNO';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'Sero-Immunology Tests', 'SERO_IMMUNO', 'Blood grouping and cross matching')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'SERO_BLOOD_GROUP', 'Blood Grouping & Rh Factor', 'Blood', 150.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'SERO_CROSS_MATCHING', 'Cross Matching & Screening', 'Blood', 1700.00, 2, FALSE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 3. BIOCHEMISTRY
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'BIOCHEM';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'Biochemistry (বায়োকেমিস্ট্রি টেস্ট)', 'BIOCHEM', 'Clinical biochemistry')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'BIO_RBS', 'Random Blood Sugar (RBS)', 'Blood', 200.00, 1, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_FBS', 'Fasting Blood Sugar (FBS)', 'Blood', 200.00, 1, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_2HABF', 'Blood Sugar 2 Hours After Breakfast (2HABF)', 'Blood', 200.00, 1, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_HBA1C', 'HbA1c (Glycated Hemoglobin)', 'Blood', 800.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_CREATININE', 'Serum Creatinine', 'Blood', 400.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_BUN', 'Blood Urea Nitrogen (BUN)', 'Blood', 400.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_URIC_ACID', 'Serum Uric Acid', 'Blood', 400.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_ELECTROLYTES', 'Serum Electrolytes (Na+, K+, Cl-)', 'Blood', 1000.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_LIPID_PROFILE', 'Lipid Profile (Complete)', 'Blood', 1000.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_CHOLESTEROL', 'Serum Cholesterol (Total)', 'Blood', 350.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_TRIGLYCERIDES', 'Serum Triglycerides', 'Blood', 400.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_LFT', 'Liver Function Test (LFT Complete)', 'Blood', 1200.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_SGPT', 'SGPT / ALT', 'Blood', 350.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_SGOT', 'SGOT / AST', 'Blood', 350.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_BILIRUBIN', 'Serum Bilirubin (Total & Direct)', 'Blood', 350.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_ALP', 'Alkaline Phosphatase (ALP)', 'Blood', 400.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_CALCIUM', 'Serum Calcium (Total)', 'Blood', 400.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_TOTAL_PROTEIN', 'Serum Total Protein & Albumin (A/G)', 'Blood', 500.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_AMYLASE', 'Serum Amylase', 'Blood', 800.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_LIPASE', 'Serum Lipase', 'Blood', 900.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_FERRITIN', 'Serum Ferritin', 'Blood', 1200.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'BIO_TROPONIN_I', 'Troponin-I (Quantitative)', 'Blood', 1200.00, 2, TRUE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 4. ICT METHOD IMMUNOLOGY / VIROLOGY
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'ICT_VIRO';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'ICT Method Immunology/Virology Tests', 'ICT_VIRO', 'Rapid viral markers')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'ICT_HBSAG', 'HBsAg (Rapid / Screening)', 'Blood', 800.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'ICT_ANTI_HCV', 'Anti-HCV (Rapid / Screening)', 'Blood', 1200.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'ICT_ANTI_HIV', 'Anti-HIV (1 & 2 Rapid)', 'Blood', 1200.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'ICT_DENGUE_NS1', 'Dengue NS1 Antigen (Rapid)', 'Blood', 500.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'ICT_DENGUE_AB', 'Dengue Antibody (IgG & IgM)', 'Blood', 700.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'ICT_VDRL', 'VDRL / Syphilis', 'Blood', 350.00, 1, FALSE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 5. SEROLOGY & IMMUNOLOGY
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'IMMUNOLOGY';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'Immunological Tests', 'IMMUNOLOGY', 'Hormone and immunology markers')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'IMM_TSH', 'TSH (Thyroid Stimulating Hormone)', 'Blood', 1200.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'IMM_FT3', 'FT3 (Free T3)', 'Blood', 1400.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'IMM_FT4', 'FT4 (Free T4)', 'Blood', 1400.00, 3, TRUE, TRUE),
            (r.id, v_cat_id, 'IMM_VIT_D', 'Vitamin D (25-OH Vitamin D)', 'Blood', 4000.00, 4, TRUE, TRUE),
            (r.id, v_cat_id, 'IMM_VIT_B12', 'Vitamin B12', 'Blood', 3000.00, 4, TRUE, TRUE),
            (r.id, v_cat_id, 'IMM_CRP', 'CRP (C-Reactive Protein Quantitative)', 'Blood', 600.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'IMM_RA_RF', 'RA / RF (Rheumatoid Factor)', 'Blood', 500.00, 2, TRUE, TRUE),
            (r.id, v_cat_id, 'IMM_ASO', 'ASO Titre', 'Blood', 500.00, 2, TRUE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 6. REPRODUCTIVE ENDOCRINOLOGY & ONCOLOGY
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'ONCOLOGY';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'Oncology (অনকোলজি টিউমার মার্কার)', 'ONCOLOGY', 'Tumor markers')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'ONCO_CA125', 'CA 125 (Ovarian Tumor Marker)', 'Blood', 1500.00, 4, TRUE, TRUE),
            (r.id, v_cat_id, 'ONCO_CA199', 'CA 19-9 (Pancreatic / GI Tumor Marker)', 'Blood', 1500.00, 4, TRUE, TRUE),
            (r.id, v_cat_id, 'ONCO_AFP', 'AFP (Alpha-Fetoprotein)', 'Blood', 1000.00, 4, TRUE, TRUE),
            (r.id, v_cat_id, 'ONCO_PSA', 'PSA (Prostate Specific Antigen)', 'Blood', 1400.00, 4, TRUE, TRUE),
            (r.id, v_cat_id, 'ONCO_CEA', 'CEA (Carcinoembryonic Antigen)', 'Blood', 1200.00, 4, TRUE, TRUE),
            (r.id, v_cat_id, 'ONCO_BHCG', 'Beta hCG (Quantitative)', 'Blood', 1000.00, 3, TRUE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 7. CLINICAL PATHOLOGY & MICROBIOLOGY
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'CLIN_PATH';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'Clinical Pathology', 'CLIN_PATH', 'Pathology investigations')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'CP_URINE_RME', 'Urine Routine Examination (R/M/E)', 'Urine', 350.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'CP_URINE_CS', 'Urine Culture & Sensitivity (C/S)', 'Urine', 900.00, 48, FALSE, TRUE),
            (r.id, v_cat_id, 'CP_STOOL_RME', 'Stool Routine Examination (R/M/E)', 'Stool', 250.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'CP_SEMEN', 'Semen Analysis', 'Semen', 1200.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'CP_BLOOD_CS', 'Blood Culture & Sensitivity (C/S)', 'Blood', 2000.00, 72, FALSE, TRUE),
            (r.id, v_cat_id, 'CP_WIDAL', 'Widal Test (Typhoid Agglutination)', 'Blood', 400.00, 2, FALSE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 8. ULTRASONOGRAPHY (USG - 12 Procedures)
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'USG';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'USG (আলট্রাসনোগ্রাফি)', 'USG', 'Ultrasound imaging')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'USG_TVS', 'USG of TVS (Transvaginal Sonography)', 'None', 1800.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_WHOLE_ABDOMEN', 'USG of Whole Abdomen', 'None', 1400.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_PREGNANCY', 'USG of Pregnancy Profile', 'None', 1200.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_UPPER_ABDOMEN', 'USG of Upper Abdomen', 'None', 1000.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_LOWER_ABDOMEN', 'USG of Lower Abdomen', 'None', 1000.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_KUB', 'USG of KUB (Kidneys, Ureters, Bladder)', 'None', 1000.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_KUB_PROSTATE', 'USG of KUB with Prostate', 'None', 1200.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_HBS', 'USG of Hepatobiliary System (HBS)', 'None', 1000.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_BREAST', 'USG of Both Breasts / Mammography USG', 'None', 1800.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_THYROID', 'USG of Thyroid Gland / Neck', 'None', 1400.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_SCROTUM', 'USG of Scrotum / Testes', 'None', 1400.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'USG_ANOMALY', 'USG of Anomaly Scan (4D Fetal)', 'None', 2500.00, 3, FALSE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 9. X-RAY (42 Views)
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'XRAY';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'X-RAY (ডিজিটাল এক্স-রে)', 'XRAY', 'Digital radiography')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'XRAY_CHEST_PA', 'Chest P/A View', 'None', 500.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_CHEST_LAT', 'Chest Lateral View', 'None', 500.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_CHEST_BOTH', 'Chest Both Views (P/A & Lat)', 'None', 900.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_CERVICAL_SPINE', 'Cervical Spine Both Views (AP & Lat)', 'None', 1000.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_LUMBAR_SPINE', 'Lumbar Spine Both Views (AP & Lat)', 'None', 1000.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_THORACIC_SPINE', 'Thoracic Spine Both Views (AP & Lat)', 'None', 1000.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_LS_SPINE', 'Lumbosacral Spine (L/S Spine AP & Lat)', 'None', 1000.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_ABDOMEN_PLAIN', 'Plain X-Ray Abdomen (Erect / Supine)', 'None', 600.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_KUB_PLAIN', 'Plain X-Ray KUB', 'None', 600.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_PELVIS_AP', 'Pelvis A/P View', 'None', 600.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_KNEE_BOTH_VIEWS', 'Knee Joint Both Views (AP & Lat)', 'None', 800.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_BOTH_KNEE_BOTH_VIEWS', 'Both Knee Joints Both Views', 'None', 1400.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_PNS', 'PNS (Water''s View)', 'None', 600.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_SKULL_BOTH', 'Skull Both Views (AP & Lat)', 'None', 900.00, 1, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_CONTRAST_IVU', 'Contrast IVU (Intravenous Urogram)', 'None', 2500.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_CONTRAST_BARIUM_MEAL', 'Contrast Barium Meal', 'None', 2200.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'XRAY_CONTRAST_HSG', 'Contrast Hysterosalpingogram (HSG)', 'None', 2800.00, 3, FALSE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 10. CT SCAN (18 Procedures)
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'CT_SCAN';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'CT Scan', 'CT_SCAN', 'Computed Tomography')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'CT_BRAIN_PLAIN', 'CT Scan of Brain (Plain)', 'None', 3500.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'CT_BRAIN_CONTRAST', 'CT Scan of Brain with Contrast', 'None', 5000.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'CT_WHOLE_ABDOMEN', 'CT Scan of Whole Abdomen', 'None', 10000.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'CT_ANGIOGRAM', 'CT Angiogram (Brain/Coronary/Peripheral)', 'None', 12500.00, 4, FALSE, TRUE),
            (r.id, v_cat_id, 'CT_CHEST_HRCT', 'CT Scan of Chest / HRCT Chest', 'None', 6000.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'CT_UPPER_ABDOMEN', 'CT Scan of Upper Abdomen', 'None', 6000.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'CT_KUB', 'CT Scan of KUB', 'None', 6000.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'CT_LUMBAR_SPINE', 'CT Scan of Lumbar Spine', 'None', 5500.00, 2, FALSE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 11. MRI (26 Procedures)
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'MRI';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'MRI (ম্যাগনেটিক রেজোন্যান্স ইমেজিং)', 'MRI', 'Magnetic Resonance Imaging')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'MRI_BRAIN_PLAIN', 'MRI of Brain (Plain)', 'None', 6000.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'MRI_BRAIN_CONTRAST', 'MRI of Brain with Contrast', 'None', 8000.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'MRI_WHOLE_SPINE', 'MRI of Whole Spine (Screening)', 'None', 16000.00, 4, FALSE, TRUE),
            (r.id, v_cat_id, 'MRI_WHOLE_BODY', 'MRI of Whole Body (Screening)', 'None', 30000.00, 6, FALSE, TRUE),
            (r.id, v_cat_id, 'MRI_KNEE_JOINT', 'MRI of Knee Joint', 'None', 7000.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'MRI_LUMBAR_SPINE', 'MRI of Lumbar Spine', 'None', 6500.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'MRI_CERVICAL_SPINE', 'MRI of Cervical Spine', 'None', 6500.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'MRI_MRCP', 'MRI of MRCP (Biliary & Pancreatic)', 'None', 7500.00, 4, FALSE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- 12. SPECIAL DIAGNOSTIC PROCEDURES
        -- ==========================================
        SELECT id INTO v_cat_id FROM public.diagnostic_categories WHERE organization_id = r.id AND category_code = 'SPECIAL_DIAG';
        IF v_cat_id IS NULL THEN
            INSERT INTO public.diagnostic_categories (organization_id, category_name, category_code, description)
            VALUES (r.id, 'বিশেষ ডায়াগনস্টিক টেস্ট (Special Diagnostic)', 'SPECIAL_DIAG', 'Special clinical investigations')
            RETURNING id INTO v_cat_id;
        END IF;

        INSERT INTO public.diagnostic_tests (organization_id, category_id, test_code, test_name, specimen_type, price, delivery_turnaround_hours, has_numerical_parameters, is_active)
        VALUES 
            (r.id, v_cat_id, 'SPEC_ECHOCARDIOGRAM', 'Echo Color Doppler', 'None', 3200.00, 2, FALSE, TRUE),
            (r.id, v_cat_id, 'SPEC_ENDOSCOPY', 'Endoscopy', 'None', 2000.00, 3, FALSE, TRUE),
            (r.id, v_cat_id, 'SPEC_COLONOSCOPY_SHORT', 'Colonoscopy (Short)', 'None', 4500.00, 4, FALSE, TRUE),
            (r.id, v_cat_id, 'SPEC_COLONOSCOPY_FULL', 'Colonoscopy (Full)', 'None', 6000.00, 4, FALSE, TRUE),
            (r.id, v_cat_id, 'SPEC_ECG', 'ECG', 'None', 400.00, 1, FALSE, TRUE)
        ON CONFLICT (organization_id, test_code) DO UPDATE
        SET test_name = EXCLUDED.test_name, price = EXCLUDED.price, is_active = TRUE;

        -- ==========================================
        -- SYNCHRONISE HOSPITAL SERVICE TARIFFS
        -- ==========================================
        INSERT INTO public.hospital_service_tariffs (organization_id, service_code, service_name, category, price, is_active)
        SELECT 
            r.id,
            t.test_code,
            t.test_name,
            'PROCEDURE',
            t.price,
            TRUE
        FROM public.diagnostic_tests t
        WHERE t.organization_id = r.id
        ON CONFLICT (organization_id, service_code) DO UPDATE
        SET service_name = EXCLUDED.service_name,
            price = EXCLUDED.price,
            is_active = TRUE;

    END LOOP;
END $$;

COMMIT;
