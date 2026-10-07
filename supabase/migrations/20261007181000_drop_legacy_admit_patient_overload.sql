-- =====================================================================================
-- 20261007181000_drop_legacy_admit_patient_overload.sql
-- Onnesha Hospital Management System (OHMS) - Migration 111
--
-- Drop legacy 10-parameter overload of admit_patient_to_bed_atomic to eliminate
-- PostgREST PGRST203 function overload ambiguity. The canonical authoritative 11-parameter
-- function (including p_referral_agent_id UUID DEFAULT NULL) remains active.
-- =====================================================================================

DROP FUNCTION IF EXISTS public.admit_patient_to_bed_atomic(
    UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, VARCHAR, NUMERIC, UUID
);
