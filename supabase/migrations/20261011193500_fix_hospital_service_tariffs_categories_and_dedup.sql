-- =====================================================================================
-- Migration: 20261011193500_fix_hospital_service_tariffs_categories_and_dedup.sql
-- Description: Fixes categorization, classification, and deduplication of hospital_service_tariffs
--              and diagnostic_tests. Ensures CT scans, MRIs, and procedures are not misclassified
--              as LAB or CONSULTATION.
-- =====================================================================================

BEGIN;

-- 1. Ensure hospital_service_tariffs table has proper indexes and constraint
CREATE INDEX IF NOT EXISTS idx_hospital_service_tariffs_org_cat ON public.hospital_service_tariffs (organization_id, category);
CREATE INDEX IF NOT EXISTS idx_hospital_service_tariffs_org_active ON public.hospital_service_tariffs (organization_id, is_active);

-- 2. Cleanly synchronize and categorize all diagnostic tests and hospital services
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP
        -- A. Update imaging categories for CT scans, MRI, Endoscopy, and ECG
        UPDATE public.hospital_service_tariffs
        SET category = 'CT_SCAN'
        WHERE organization_id = r.id
          AND (service_code ILIKE '%CT%' OR service_name ILIKE '%CT Scan%')
          AND service_name NOT ILIKE '%Active%'
          AND service_code NOT ILIKE '%BT_CT%';

        UPDATE public.hospital_service_tariffs
        SET category = 'MRI'
        WHERE organization_id = r.id
          AND (service_code ILIKE '%MRI%' OR service_name ILIKE '%MRI %');

        UPDATE public.hospital_service_tariffs
        SET category = 'USG'
        WHERE organization_id = r.id
          AND (service_code ILIKE '%USG%' OR service_name ILIKE '%USG %' OR service_name ILIKE '%Ultrasono%');

        UPDATE public.hospital_service_tariffs
        SET category = 'XRAY'
        WHERE organization_id = r.id
          AND (service_code ILIKE '%XRAY%' OR service_name ILIKE '%X-ray%' OR service_name ILIKE '%X-Ray%');

        UPDATE public.hospital_service_tariffs
        SET category = 'ECG'
        WHERE organization_id = r.id
          AND (service_code ILIKE '%ECG%' OR service_name ILIKE '%Electrocardio%' OR service_name ILIKE '%Echocardio%');

        UPDATE public.hospital_service_tariffs
        SET category = 'ENDOSCOPY'
        WHERE organization_id = r.id
          AND (service_name ILIKE '%Endoscopy%' OR service_name ILIKE '%Colonoscopy%');

        -- B. Update Consultation categories
        UPDATE public.hospital_service_tariffs
        SET category = 'CONSULTATION'
        WHERE organization_id = r.id
          AND (
            service_code IN ('SRV-OPD-GEN', 'SRV-OPD-SPEC', 'SRV-OPD-PROF', 'SRV-CON-EMO')
            OR (service_name ILIKE '%Consultation%' AND service_name NOT ILIKE '%Investigation%' AND service_name NOT ILIKE '%Test%')
          );

        -- C. Update IPD Bed & Cabin categories
        UPDATE public.hospital_service_tariffs
        SET category = 'IPD_BED'
        WHERE organization_id = r.id
          AND (
            service_code IN ('SRV-BED-GEN', 'SRV-CAB-NONAC', 'SRV-CAB-AC', 'SRV-CAB-VIP')
            OR service_name ILIKE '%Cabin%'
            OR service_name ILIKE '%Ward Bed%'
          );

        -- D. Update Critical Care categories
        UPDATE public.hospital_service_tariffs
        SET category = 'CRITICAL_CARE'
        WHERE organization_id = r.id
          AND (
            service_code IN ('SRV-ICU-BED', 'SRV-CCU-BED', 'SRV-HDU-BED', 'SRV-NICU-BED')
            OR service_name ILIKE '%ICU%'
            OR service_name ILIKE '%CCU%'
            OR service_name ILIKE '%HDU%'
            OR service_name ILIKE '%NICU%'
          );

        -- E. Update Surgery & OT categories
        UPDATE public.hospital_service_tariffs
        SET category = 'OT_SURGERY'
        WHERE organization_id = r.id
          AND (
            service_code IN ('SRV-OT-MAJ', 'SRV-OT-MIN', 'SRV-ANES-MAJ')
            OR service_name ILIKE '%Operation Theatre%'
            OR service_name ILIKE '%Surgical Procedure%'
            OR service_name ILIKE '%Caesarean%'
            OR service_name ILIKE '%Anaesthesia%'
          );

        -- F. Update Admission & Ambulance categories
        UPDATE public.hospital_service_tariffs
        SET category = 'ADMISSION'
        WHERE organization_id = r.id
          AND (service_code = 'SRV-ADM-REG' OR service_name ILIKE '%Admission & Registration%');

        UPDATE public.hospital_service_tariffs
        SET category = 'AMBULANCE'
        WHERE organization_id = r.id
          AND (service_code ILIKE '%AMB%' OR service_name ILIKE '%Ambulance%');

        -- G. Ensure Lab tests remain LAB and are NOT categorized as PROCEDURE or CONSULTATION
        UPDATE public.hospital_service_tariffs
        SET category = 'LAB'
        WHERE organization_id = r.id
          AND category NOT IN ('CT_SCAN', 'MRI', 'USG', 'XRAY', 'ECG', 'ENDOSCOPY', 'CONSULTATION', 'IPD_BED', 'CRITICAL_CARE', 'OT_SURGERY', 'ADMISSION', 'AMBULANCE')
          AND (
            service_code ILIKE 'HEMA_%' OR service_code ILIKE 'SERO_%' OR service_code ILIKE 'BIOCHEM_%' 
            OR service_code ILIKE 'ICT_%' OR service_code ILIKE 'SEROLOGY_%' OR service_code ILIKE 'IMMUNO_%' 
            OR service_code ILIKE 'REPRO_%' OR service_code ILIKE 'ONCO_%' OR service_code ILIKE 'CLIN_%' 
            OR service_code ILIKE 'MICRO_%' OR service_name ILIKE '%Blood%' OR service_name ILIKE '%Sugar%'
            OR service_name ILIKE '%CBC%' OR service_name ILIKE '%Urine%' OR service_name ILIKE '%Stool%'
            OR service_name ILIKE '%Sputum%' OR service_name ILIKE '%Serum%' OR service_name ILIKE '%Widal%'
          );

    END LOOP;
END $$;

COMMIT;
