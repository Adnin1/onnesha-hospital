-- =====================================================================================
-- MIGRATION 245: Add discharge_reason to patient_visits
-- Authority: Synthetic Engineering Swarm (APEX Godmode v5.0)
-- Purpose:
--   1. Add discharge_reason TEXT to public.patient_visits so that soft cancellation
--      in cancel_or_delete_ipd_admission_atomic succeeds without 42703 column missing error.
-- =====================================================================================

ALTER TABLE IF EXISTS public.patient_visits
    ADD COLUMN IF NOT EXISTS discharge_reason TEXT;
