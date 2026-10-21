-- ==============================================================================
-- OHMS MIGRATION 227: SUPABASE DATA API GRANTS & OCTOBER 30 DEPRECATION SHIELD
-- ==============================================================================
-- Author: Autonomous Engineering Swarm Godmode v5.0 (APEX / TRANSCEND)
-- Date: 2026-10-21
-- Purpose:
--   Supabase announced that on October 30, 2026, automatic Data API table grants
--   in the "public" schema will cease for existing projects.
--   This migration ensures complete future-proofing and immunity:
--   1. Explicitly grants SELECT, INSERT, UPDATE, DELETE on all public tables to
--      'authenticated' and 'service_role'.
--   2. Explicitly grants SELECT on public-facing portal tables to 'anon'.
--   3. Configures ALTER DEFAULT PRIVILEGES in schema public so any future table
--      or schema recreation (e.g. preview branches, local supabase db reset)
--      automatically receives explicit PostgREST/Data API privileges.
--   4. Preserves all RLS policies, multi-tenant boundaries, and Migration 226
--      least-privilege function execution security.
-- ==============================================================================

-- 1. Ensure Schema Usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Explicit Grants on Existing Tables for Authenticated and Service Role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- 3. Explicit Grants on Sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. Explicit Grants for Anonymous Role on Public Patient/Portal Tables
-- Note: Row Level Security (RLS) policies govern row-level visibility.
DO $$
DECLARE
    tbl text;
    public_portal_tables text[] := ARRAY[
        'doctors',
        'departments',
        'hospital_services',
        'hospital_service_tariffs',
        'doctor_schedules',
        'public_appointments',
        'patient_feedback',
        'emergency_helpline_contacts',
        'system_settings'
    ];
BEGIN
    FOREACH tbl IN ARRAY public_portal_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon;', tbl);
        END IF;
    END LOOP;
END $$;

-- 5. Future-Proof Default Privileges for New Tables and Sequences
-- Whenever tables or sequences are created in schema public by postgres / supabase_admin,
-- automatically assign the necessary Data API permissions.
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- 6. Audit Telemetry & Verification Marker
COMMENT ON SCHEMA public IS 'OHMS Unified Schema - Data API Hardened (Migration 227 Complete)';
