-- =====================================================================
-- Migration 20260928110000: Storage Buckets Multi-Tenant Hardening
-- =====================================================================

DO $$
BEGIN
    -- 1. Ensure private medical-documents-vault bucket exists in storage.buckets
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'medical-documents-vault',
            'medical-documents-vault',
            false,
            52428800, -- 50 MB
            ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/dicom', 'application/octet-stream']::text[]
        )
        ON CONFLICT (id) DO UPDATE SET
            public = false,
            file_size_limit = 52428800,
            allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/dicom', 'application/octet-stream']::text[];
    END IF;
END $$;

