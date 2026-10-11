-- Migration: 20261011231500_add_date_of_birth_column_to_patients.sql
-- Ensure date_of_birth column exists on public.patients and stays in sync with dob

ALTER TABLE IF EXISTS public.patients 
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Backfill date_of_birth from dob
UPDATE public.patients
SET date_of_birth = dob
WHERE date_of_birth IS NULL AND dob IS NOT NULL;

-- Backfill dob from date_of_birth if dob is null
UPDATE public.patients
SET dob = date_of_birth
WHERE dob IS NULL AND date_of_birth IS NOT NULL;

-- Trigger to keep dob and date_of_birth in permanent two-way synchronization
CREATE OR REPLACE FUNCTION public.sync_patients_dob_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.dob IS NOT NULL AND (NEW.date_of_birth IS NULL OR NEW.date_of_birth <> NEW.dob) THEN
        NEW.date_of_birth := NEW.dob;
    ELSIF NEW.date_of_birth IS NOT NULL AND (NEW.dob IS NULL OR NEW.dob <> NEW.date_of_birth) THEN
        NEW.dob := NEW.date_of_birth;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_patients_dob ON public.patients;
CREATE TRIGGER trg_sync_patients_dob
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.sync_patients_dob_columns();

NOTIFY pgrst, 'reload schema';
