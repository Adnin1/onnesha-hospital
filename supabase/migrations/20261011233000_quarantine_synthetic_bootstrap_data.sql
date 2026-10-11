-- Migration: 20261011233000_quarantine_synthetic_bootstrap_data.sql
-- Description: Purges and quarantines synthetic test/bootstrap operational records from production database
-- Invariant: Production operational state defaults to honest zero-records, never auto-fabricated records.

BEGIN;

-- 1. Quarantine & Purge Synthetic Accounting Journal Entries
DELETE FROM public.journal_entry_lines 
WHERE journal_entry_id IN (
    SELECT id FROM public.journal_entries 
    WHERE entry_number IN ('JE-2026-001', 'JE-2026-002', 'JE-2026-003')
);

DELETE FROM public.journal_entries 
WHERE entry_number IN ('JE-2026-001', 'JE-2026-002', 'JE-2026-003');

-- 2. Quarantine & Purge Synthetic Welfare / Scholarship Applications
DELETE FROM public.scholarship_applications 
WHERE application_number IN ('SCH-2026-001', 'SCH-2026-002', 'SCH-2026-003');

-- 3. Quarantine & Purge Synthetic Patients if no billing or clinical records exist
DELETE FROM public.patient_identifications
WHERE patient_id IN (
    SELECT id FROM public.patients
    WHERE patient_id IN ('P-10022', 'P-10034', 'P-10041')
      AND full_name IN ('Rabeya Khatun (রাবেয়া খাতুন)', 'Md. Abdul Jalil (মো. আব্দুল জলিল)', 'Fatema Begum (ফাতেমা বেগম)')
);

DELETE FROM public.patient_addresses
WHERE patient_id IN (
    SELECT id FROM public.patients
    WHERE patient_id IN ('P-10022', 'P-10034', 'P-10041')
      AND full_name IN ('Rabeya Khatun (রাবেয়া খাতুন)', 'Md. Abdul Jalil (মো. আব্দুল জলিল)', 'Fatema Begum (ফাতেমা বেগম)')
);

DELETE FROM public.patient_contacts
WHERE patient_id IN (
    SELECT id FROM public.patients
    WHERE patient_id IN ('P-10022', 'P-10034', 'P-10041')
      AND full_name IN ('Rabeya Khatun (রাবেয়া খাতুন)', 'Md. Abdul Jalil (মো. আব্দুল জলিল)', 'Fatema Begum (ফাতেমা বেগম)')
);

DELETE FROM public.patients 
WHERE patient_id IN ('P-10022', 'P-10034', 'P-10041')
  AND full_name IN ('Rabeya Khatun (রাবেয়া খাতুন)', 'Md. Abdul Jalil (মো. আব্দুল জলিল)', 'Fatema Begum (ফাতেমা বেগম)')
  AND id NOT IN (
    SELECT DISTINCT patient_id FROM public.invoices WHERE patient_id IS NOT NULL
  )
  AND id NOT IN (
    SELECT DISTINCT patient_id FROM public.patient_care_episodes WHERE patient_id IS NOT NULL
  );

-- 4. Quarantine & Purge Synthetic Purchase Requisitions & Items
DELETE FROM public.purchase_requisition_items 
WHERE requisition_id IN (
    SELECT id FROM public.purchase_requisitions 
    WHERE requisition_number IN ('PR-OT-2026-001', 'PR-PHARM-2026-002', 'PR-ICU-2026-003')
);

DELETE FROM public.purchase_requisitions 
WHERE requisition_number IN ('PR-OT-2026-001', 'PR-PHARM-2026-002', 'PR-ICU-2026-003');

-- 5. Quarantine & Purge Synthetic Goods Receipt Notes & Items
DELETE FROM public.goods_receipt_items 
WHERE grn_id IN (
    SELECT id FROM public.goods_receipt_notes 
    WHERE grn_number IN ('GRN-2026-001', 'GRN-2026-002')
);

DELETE FROM public.goods_receipt_notes 
WHERE grn_number IN ('GRN-2026-001', 'GRN-2026-002');

-- 6. Quarantine & Purge Synthetic Biomedical Devices
DELETE FROM public.biomedical_devices 
WHERE serial_number IN ('SYS-2026-XN55', 'SIE-CT-8891', 'SHM-XR-4402', 'GE-ANES-1109', 'MIN-ICU-7721', 'GE-USG-3390');

-- 7. Quarantine & Purge Synthetic Hospital Assets
DELETE FROM public.hospital_assets 
WHERE asset_code IN ('AST-MED-001', 'AST-RAD-002', 'AST-SUR-003', 'AST-ICU-004', 'AST-USG-005', 'AST-VEH-006');

COMMIT;
