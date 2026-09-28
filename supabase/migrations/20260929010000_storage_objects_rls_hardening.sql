-- Migration 93: Storage Objects Multi-Tenant RLS Hardening for Medical Documents Vault
-- Ensures that direct access to storage.objects is strictly isolated by organization_id

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
        -- Enable RLS on storage.objects if not already enabled
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

        -- 1. Tenant-isolated SELECT policy
        DROP POLICY IF EXISTS "medical_vault_tenant_isolation_select" ON storage.objects;
        CREATE POLICY "medical_vault_tenant_isolation_select"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
            bucket_id = 'medical-documents-vault'
            AND split_part(name, '/', 1) = COALESCE(NULLIF(current_setting('app.current_organization_id', true), ''), private.get_current_org_id())::text
        );

        -- 2. Tenant-isolated INSERT policy
        DROP POLICY IF EXISTS "medical_vault_tenant_isolation_insert" ON storage.objects;
        CREATE POLICY "medical_vault_tenant_isolation_insert"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
            bucket_id = 'medical-documents-vault'
            AND split_part(name, '/', 1) = COALESCE(NULLIF(current_setting('app.current_organization_id', true), ''), private.get_current_org_id())::text
        );

        -- 3. Tenant-isolated UPDATE policy
        DROP POLICY IF EXISTS "medical_vault_tenant_isolation_update" ON storage.objects;
        CREATE POLICY "medical_vault_tenant_isolation_update"
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (
            bucket_id = 'medical-documents-vault'
            AND split_part(name, '/', 1) = COALESCE(NULLIF(current_setting('app.current_organization_id', true), ''), private.get_current_org_id())::text
        )
        WITH CHECK (
            bucket_id = 'medical-documents-vault'
            AND split_part(name, '/', 1) = COALESCE(NULLIF(current_setting('app.current_organization_id', true), ''), private.get_current_org_id())::text
        );

        -- 4. Tenant-isolated DELETE policy (admin only)
        DROP POLICY IF EXISTS "medical_vault_tenant_isolation_delete" ON storage.objects;
        CREATE POLICY "medical_vault_tenant_isolation_delete"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
            bucket_id = 'medical-documents-vault'
            AND split_part(name, '/', 1) = COALESCE(NULLIF(current_setting('app.current_organization_id', true), ''), private.get_current_org_id())::text
        );
    END IF;
END $$;
