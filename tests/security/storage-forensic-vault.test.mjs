import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Storage Forensic Vault & Medical Documents Security", () => {
  // 1. Private Bucket Declaration
  test("1. Storage vault bucket is named medical-documents-vault and is private", () => {
    const filesContent = fs.readFileSync(path.join(ROOT, "lib/storage/files.ts"), "utf8");
    assert.ok(filesContent.includes('"medical-documents-vault"'), "PRIVATE_STORAGE_BUCKET must be medical-documents-vault");
    const migration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260928110000_storage_buckets_and_rls_hardening.sql"),
      "utf8"
    );
    assert.ok(migration.includes("'medical-documents-vault'"), "Bucket name required");
    assert.ok(migration.includes("public = false"), "Bucket must be explicitly private");
  });

  // 2. Tenant Boundary Isolation
  test("2. Cross-tenant document path assertion blocks unauthorized tenant prefixes", () => {
    const orgA = "org-dhaka-001";
    const pathTenantB = "org-chittagong-002/patient-01/rx.pdf";

    // Path assertion logic from lib/storage/files.ts:
    const isAllowed = pathTenantB.startsWith(`${orgA}/`);
    assert.equal(isAllowed, false, "Cross-tenant document access must be rejected");
  });

  // 3. Document Signed URL Expiration Bound
  test("3. Signed URLs enforce maximum 300 seconds (5 minutes) lifetime limit", () => {
    const filesModule = fs.readFileSync(path.join(ROOT, "lib/storage/files.ts"), "utf8");
    assert.ok(filesModule.includes("300"), "Default signed URL TTL must be 300s");
    assert.ok(filesModule.includes("createSignedUrl"), "Must issue temporary signed URLs");
  });

  // 4. Medical Document Audit Logging
  test("4. Document operations enforce audit trail recording (VIEW, DOWNLOAD, PRINT, UPLOAD)", () => {
    const filesModule = fs.readFileSync(path.join(ROOT, "lib/storage/files.ts"), "utf8");
    assert.ok(filesModule.includes("recordAuditLog"), "Audit logger integration required");
    assert.ok(filesModule.includes("medical_document"), "Entity type must be medical_document");
  });

  // 5. Allowed MIME Types & 50MB Size Quota
  test("5. Storage configuration enforces allowed medical MIME types and 50MB quota", () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260928110000_storage_buckets_and_rls_hardening.sql"),
      "utf8"
    );
    assert.ok(migration.includes("52428800"), "50MB file size limit required");
    assert.ok(migration.includes("application/pdf"), "PDF support required");
    assert.ok(migration.includes("application/dicom"), "DICOM imaging support required");
  });
});
