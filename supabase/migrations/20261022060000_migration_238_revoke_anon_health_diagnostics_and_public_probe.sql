-- =====================================================================================
-- Migration 238: SECURITY HARDENING — REMOVE ANON HEALTH DIAGNOSTICS EXPOSURE
-- =====================================================================================
-- Resolves Supabase Security Advisor finding: check_system_health_diagnostics
-- is a SECURITY DEFINER function that was granted EXECUTE to anon role.
--
-- Architecture change:
-- 1. Revoke anon execute from check_system_health_diagnostics (tenant-internal)
-- 2. Create a minimal public_health_probe() with SECURITY INVOKER that returns
--    only {status, timestamp, version} — no tenant internals
-- 3. Grant public_health_probe to anon for edge/uptime monitoring
-- =====================================================================================

-- 1. REVOKE ANON ACCESS FROM PRIVILEGED HEALTH DIAGNOSTICS
REVOKE EXECUTE ON FUNCTION public.check_system_health_diagnostics FROM anon;

-- 2. CREATE MINIMAL PUBLIC HEALTH PROBE (SECURITY INVOKER — NO PRIVILEGE ESCALATION)
CREATE OR REPLACE FUNCTION public.public_health_probe()
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'status', 'UP',
    'timestamp', now()::text,
    'service', 'ohms'
  );
$$;

-- 3. GRANT PUBLIC HEALTH PROBE TO ANON AND AUTHENTICATED
GRANT EXECUTE ON FUNCTION public.public_health_probe() TO anon, authenticated, service_role;

-- 4. ENSURE check_system_health_diagnostics REMAINS AVAILABLE TO AUTHENTICATED ONLY
GRANT EXECUTE ON FUNCTION public.check_system_health_diagnostics TO authenticated, service_role;
