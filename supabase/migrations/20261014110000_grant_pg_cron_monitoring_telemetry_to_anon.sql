-- =================================================================================
-- Migration 193: Grant get_pg_cron_monitoring_telemetry() to anon
-- Description: Enables external health probes and scheduled GitHub Actions monitors
-- to inspect the background pg_cron scheduler status safely without service_role credentials.
-- The function returns strictly non-sensitive telemetry (extension availability and job status).
-- =================================================================================

GRANT EXECUTE ON FUNCTION public.get_pg_cron_monitoring_telemetry() TO anon;

COMMENT ON FUNCTION public.get_pg_cron_monitoring_telemetry() IS 
'Safe telemetry function for background cron scheduler inspection. Accessible to anon, authenticated, and service_role.';
