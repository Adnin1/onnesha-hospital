-- =====================================================================================
-- Migration 240: SECURITY HARDENING — REVOKE ANON CRON MONITORING TELEMETRY
-- =====================================================================================
-- Resolves unexempted anon-executable SECURITY DEFINER finding:
-- get_pg_cron_monitoring_telemetry exposes internal database cron execution metrics
-- and should only be available to authenticated administrators and service_role.
-- =====================================================================================

REVOKE EXECUTE ON FUNCTION public.get_pg_cron_monitoring_telemetry() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pg_cron_monitoring_telemetry() TO authenticated, service_role;
