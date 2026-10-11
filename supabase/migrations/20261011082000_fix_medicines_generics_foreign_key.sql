-- =====================================================================================
-- Migration: 20261011082000_fix_medicines_generics_foreign_key.sql
-- Description:
--   Guarantees explicit foreign key constraint between public.medicines(generic_id)
--   and public.medicine_generics(id) for PostgREST schema cache relationship resolution.
--   Prevents "Could not find a relationship between 'medicines' and 'medicine_generics' in the schema cache".
-- =====================================================================================

BEGIN;

-- 1. Ensure table public.medicine_generics exists
CREATE TABLE IF NOT EXISTS public.medicine_generics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name VARCHAR(255) NOT NULL,
    therapeutic_class VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_medicine_generics_name UNIQUE (generic_name)
);

-- 2. Ensure table public.medicines has generic_id column
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS generic_id UUID;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS generic_name TEXT;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS dosage_form TEXT DEFAULT 'Tablet';
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS strength TEXT DEFAULT '';
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'PIECE';
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS min_stock_alert INT DEFAULT 50;

-- 3. Seed medicine_generics from existing text generic_name in medicines
INSERT INTO public.medicine_generics (generic_name)
SELECT DISTINCT TRIM(generic_name)
FROM public.medicines
WHERE generic_name IS NOT NULL AND TRIM(generic_name) != ''
ON CONFLICT (generic_name) DO NOTHING;

-- 4. Backfill medicines.generic_id where null
UPDATE public.medicines m
SET generic_id = g.id
FROM public.medicine_generics g
WHERE m.generic_id IS NULL 
  AND m.generic_name IS NOT NULL 
  AND TRIM(m.generic_name) = g.generic_name;

-- 5. Add or replace explicit Foreign Key constraint for PostgREST schema cache
DO $$
BEGIN
    -- Drop old foreign key constraint if named differently or invalid
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_medicines_generic_id'
    ) THEN
        ALTER TABLE public.medicines DROP CONSTRAINT fk_medicines_generic_id;
    END IF;

    -- Add canonical foreign key constraint
    ALTER TABLE public.medicines
    ADD CONSTRAINT fk_medicines_generic_id
    FOREIGN KEY (generic_id)
    REFERENCES public.medicine_generics(id)
    ON DELETE SET NULL;
END $$;

-- 6. Ensure medicine_batches relationship to medicines
CREATE TABLE IF NOT EXISTS public.medicine_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    medicine_id UUID,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    purchase_rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
    mrp NUMERIC(10, 2) NOT NULL DEFAULT 0,
    current_stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.medicine_batches ADD COLUMN IF NOT EXISTS medicine_id UUID;

-- If legacy column brand_id exists, copy to medicine_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'medicine_batches' 
          AND column_name = 'brand_id'
    ) THEN
        UPDATE public.medicine_batches 
        SET medicine_id = brand_id 
        WHERE medicine_id IS NULL AND brand_id IS NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_medicine_batches_medicine_id'
    ) THEN
        ALTER TABLE public.medicine_batches
        ADD CONSTRAINT fk_medicine_batches_medicine_id
        FOREIGN KEY (medicine_id)
        REFERENCES public.medicines(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- 7. Ensure RLS policies and index performance
ALTER TABLE public.medicine_generics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_batches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_medicines_generic_id ON public.medicines(generic_id);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_medicine_id ON public.medicine_batches(medicine_id);

-- Generics read policy (global reference lookup)
DROP POLICY IF EXISTS "Allow authenticated read medicine_generics" ON public.medicine_generics;
CREATE POLICY "Allow authenticated read medicine_generics"
ON public.medicine_generics FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert medicine_generics" ON public.medicine_generics;
CREATE POLICY "Allow authenticated insert medicine_generics"
ON public.medicine_generics FOR INSERT
TO authenticated
WITH CHECK (true);

-- 8. Explicitly notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
