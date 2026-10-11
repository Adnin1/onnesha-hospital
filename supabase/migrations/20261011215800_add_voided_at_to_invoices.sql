-- Migration: 20261011215800_add_voided_at_to_invoices.sql
-- Ensure voided_at column exists on invoices table for audit trail and reports compatibility

ALTER TABLE IF EXISTS public.invoices 
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

-- Backfill voided_at for already voided invoices using updated_at
UPDATE public.invoices
SET voided_at = updated_at
WHERE is_voided = TRUE AND voided_at IS NULL;
