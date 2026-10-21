-- =====================================================================================
-- Migration 239: RPC REGISTRY PURGE — LEGACY 4-ARG CANCEL ADMISSION OVERLOAD
-- =====================================================================================
-- Ensures zero ambiguous overloads on cancel_or_delete_ipd_admission_atomic.
-- The canonical 5-arg signature is:
-- cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT, BOOLEAN)
-- =====================================================================================

DROP FUNCTION IF EXISTS public.cancel_or_delete_ipd_admission_atomic(UUID, UUID, UUID, TEXT);
