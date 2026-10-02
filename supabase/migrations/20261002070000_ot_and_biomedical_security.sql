-- =====================================================================================
-- 20261002070000_ot_and_biomedical_security.sql
-- Hardens RLS isolation for Operation Theater (OT), Biomedical, and fixes
-- the multi-tenant biometric device PIN constraint on employees.
-- Forward-only, idempotent.
-- =====================================================================================

-- ========================================
-- SECTION 1: Operation Theater (OT) RLS Hardening
-- ========================================

DO $$
BEGIN
  -- 1. ot_rooms
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ot_rooms') THEN
    ALTER TABLE public.ot_rooms ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rls_ot_rooms ON public.ot_rooms;
    DROP POLICY IF EXISTS rls_tenant_ot_rooms ON public.ot_rooms;
    CREATE POLICY rls_ot_rooms ON public.ot_rooms FOR ALL USING (organization_id = get_current_org_id());
  END IF;

  -- 2. ot_bookings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ot_bookings') THEN
    ALTER TABLE public.ot_bookings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rls_ot_bookings ON public.ot_bookings;
    DROP POLICY IF EXISTS rls_tenant_ot_bookings ON public.ot_bookings;
    CREATE POLICY rls_ot_bookings ON public.ot_bookings FOR ALL USING (organization_id = get_current_org_id());
  END IF;
END $$;

-- ========================================
-- SECTION 2: Biomedical Devices RLS Hardening
-- ========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'biomedical_devices') THEN
    ALTER TABLE public.biomedical_devices ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rls_tenant_biomedical_devices ON public.biomedical_devices;
    CREATE POLICY rls_tenant_biomedical_devices ON public.biomedical_devices FOR ALL USING (organization_id = get_current_org_id());
  END IF;
END $$;

-- ========================================
-- SECTION 3: Multi-tenant Biometric PIN Composite Unique Constraint
-- ========================================
-- Previously, biometric_device_pin was globally unique, preventing multiple
-- hospitals in multi-tenant deployment from having matching PIN schemes (e.g. 101, 102).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employees') THEN
    -- Drop global unique constraint if present
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'employees_biometric_device_pin_key'
    ) THEN
      ALTER TABLE public.employees DROP CONSTRAINT employees_biometric_device_pin_key;
    END IF;

    -- Add composite tenant-scoped unique constraint if not already present
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'employees_org_biometric_pin_key'
    ) THEN
      ALTER TABLE public.employees ADD CONSTRAINT employees_org_biometric_pin_key UNIQUE (organization_id, biometric_device_pin);
    END IF;
  END IF;
END $$;
