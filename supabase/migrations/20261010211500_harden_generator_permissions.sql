-- Migration 139: Harden execution permissions on generate_patient_code and generate_invoice_number
-- Enforce that anonymous callers cannot execute internal code generators.

REVOKE EXECUTE ON FUNCTION public.generate_patient_code(UUID) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(UUID) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.generate_patient_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number(UUID) TO authenticated, service_role;
