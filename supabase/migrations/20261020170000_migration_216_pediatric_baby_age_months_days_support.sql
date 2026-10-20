-- =====================================================================================
-- Migration 216: Pediatric & Baby Age (Years, Months, Days) and Date of Birth Synchronization
-- Timestamp: 20261020170000
-- =====================================================================================

BEGIN;

-- 1. Ensure age_months and age_days columns exist on public.patients
ALTER TABLE IF EXISTS public.patients 
ADD COLUMN IF NOT EXISTS age_months INT DEFAULT 0;

ALTER TABLE IF EXISTS public.patients 
ADD COLUMN IF NOT EXISTS age_days INT DEFAULT 0;

-- 2. Enhanced Trigger Function for Two-Way DOB & Detailed Age (Years, Months, Days) Synchronization
CREATE OR REPLACE FUNCTION public.sync_patients_dob_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
    v_birth DATE;
    v_years INT;
    v_months INT;
    v_days INT;
BEGIN
    -- Step A: Bi-directional sync between dob and date_of_birth
    IF NEW.dob IS NOT NULL AND (NEW.date_of_birth IS NULL OR NEW.date_of_birth <> NEW.dob) THEN
        NEW.date_of_birth := NEW.dob;
    ELSIF NEW.date_of_birth IS NOT NULL AND (NEW.dob IS NULL OR NEW.dob <> NEW.date_of_birth) THEN
        NEW.dob := NEW.date_of_birth;
    END IF;

    -- Step B: If dob is present, compute exact age_years, age_months, and age_days
    IF NEW.dob IS NOT NULL THEN
        v_birth := NEW.dob;
        IF v_birth <= v_today THEN
            v_years := COALESCE(EXTRACT(YEAR FROM age(v_today, v_birth))::INT, 0);
            v_months := COALESCE(EXTRACT(MONTH FROM age(v_today, v_birth))::INT, 0);
            v_days := COALESCE(EXTRACT(DAY FROM age(v_today, v_birth))::INT, 0);

            NEW.age := v_years;
            NEW.age_years := v_years;
            NEW.age_months := v_months;
            NEW.age_days := v_days;
        END IF;
    -- Step C: If dob is NOT present, but age components are supplied
    ELSIF (NEW.age_years IS NOT NULL OR NEW.age IS NOT NULL OR NEW.age_months IS NOT NULL OR NEW.age_days IS NOT NULL) THEN
        v_years := COALESCE(NEW.age_years, NEW.age, 0);
        v_months := COALESCE(NEW.age_months, 0);
        v_days := COALESCE(NEW.age_days, 0);

        NEW.dob := (v_today - (v_years * INTERVAL '1 year') - (v_months * INTERVAL '1 month') - (v_days * INTERVAL '1 day'))::DATE;
        NEW.date_of_birth := NEW.dob;
        NEW.age := v_years;
        NEW.age_years := v_years;
        NEW.age_months := v_months;
        NEW.age_days := v_days;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Ensure trigger is attached
DROP TRIGGER IF EXISTS trg_sync_patients_dob ON public.patients;
CREATE TRIGGER trg_sync_patients_dob
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.sync_patients_dob_columns();

-- 4. Backfill existing patient records where dob is set
UPDATE public.patients
SET 
  age_months = COALESCE(EXTRACT(MONTH FROM age(CURRENT_DATE, dob))::INT, 0),
  age_days = COALESCE(EXTRACT(DAY FROM age(CURRENT_DATE, dob))::INT, 0)
WHERE dob IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
