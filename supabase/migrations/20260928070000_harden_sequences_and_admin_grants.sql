-- =====================================================================================
-- Migration: 20260928070000_harden_sequences_and_admin_grants.sql
-- Description:
--   1. Grants USAGE and SELECT on ALL current and future sequences in public schema
--      to authenticated and service_role roles to guarantee uninterrupted ERP sequence generation.
--   2. Revokes anonymous/public execute permissions from administrative staff management RPCs:
--      admin_create_staff_account, admin_set_staff_status, admin_change_staff_role, get_staff_directory_admin
--   3. Explicitly re-grants EXECUTE on staff management RPCs to authenticated and service_role.
--   4. Signals PostgREST to reload its schema cache immediately.
-- =====================================================================================

BEGIN;

-- 1. Ensure authenticated and service_role can draw from all sequences in schema public
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

-- 2. Revoke anonymous/public execution on sensitive administrative RPCs
REVOKE EXECUTE ON FUNCTION public.admin_create_staff_account(uuid, text, text, text, text, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_staff_status(uuid, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_change_staff_role(uuid, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_staff_directory_admin(uuid, text, text, text) FROM anon, PUBLIC;

-- 3. Explicitly grant administrative execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_create_staff_account(uuid, text, text, text, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_status(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_staff_role(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_staff_directory_admin(uuid, text, text, text) TO authenticated, service_role;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
