-- 20261007205000_repair_patient_demographics_schema.sql
-- Forward repair for live patient registration schema drift.
ALTER TABLE public.patients
    ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);

NOTIFY pgrst, 'reload schema';
