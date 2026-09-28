import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  validateAndCanonicalizeStoragePath,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "../lib/storage/validation.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Medical Storage Authorization & RLS Verification (8 Scenarios)", async () => {

  test("1. validateAndCanonicalizeStoragePath enforces exact tenant and patient directory boundary", () => {
    const orgId = "11111111-1111-1111-1111-111111111111";
    const patientId = "22222222-2222-2222-2222-222222222222";

    const validPath = `${orgId}/${patientId}/scan-001.pdf`;
    const checkValid = validateAndCanonicalizeStoragePath(validPath, orgId, patientId);
    assert.equal(checkValid.valid, true);
    assert.equal(checkValid.canonicalPath, validPath);
  });

  test("2. validateAndCanonicalizeStoragePath rejects cross-tenant directory traversal", () => {
    const orgId = "11111111-1111-1111-1111-111111111111";
    const patientId = "22222222-2222-2222-2222-222222222222";

    // Attempt traversal to another tenant
    const forgedPath = `${orgId}/${patientId}/../../other-org/other-patient/doc.pdf`;
    const checkForged = validateAndCanonicalizeStoragePath(forgedPath, orgId, patientId);
    assert.equal(checkForged.valid, false);
    assert.ok(checkForged.error?.includes("path traversal") || checkForged.error?.includes("Illegal"));
  });

  test("3. validateAndCanonicalizeStoragePath rejects organization mismatch in path prefix", () => {
    const orgA = "11111111-1111-1111-1111-111111111111";
    const orgB = "33333333-3333-3333-3333-333333333333";
    const patientId = "22222222-2222-2222-2222-222222222222";

    const mismatchedPath = `${orgB}/${patientId}/prescription.pdf`;
    const checkMismatched = validateAndCanonicalizeStoragePath(mismatchedPath, orgA, patientId);
    assert.equal(checkMismatched.valid, false);
    assert.ok(checkMismatched.error?.includes("Cross-tenant storage path is strictly prohibited"));
  });

  test("4. validateAndCanonicalizeStoragePath rejects patient mismatch in path prefix", () => {
    const orgId = "11111111-1111-1111-1111-111111111111";
    const patientA = "22222222-2222-2222-2222-222222222222";
    const patientB = "44444444-4444-4444-4444-444444444444";

    const mismatchedPath = `${orgId}/${patientB}/prescription.pdf`;
    const checkMismatched = validateAndCanonicalizeStoragePath(mismatchedPath, orgId, patientA);
    assert.equal(checkMismatched.valid, false);
    assert.ok(checkMismatched.error?.includes("Document path does not match authorized patient"));
  });

  test("5. MIME whitelist strictly limits medical document formats to PDF, PNG, JPEG, and DICOM", () => {
    assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.has("application/pdf"));
    assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.has("image/jpeg"));
    assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.has("image/png"));
    assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.has("application/dicom"));

    // Dangerous executable or script MIME types must be rejected
    assert.equal(ALLOWED_DOCUMENT_MIME_TYPES.has("application/javascript"), false);
    assert.equal(ALLOWED_DOCUMENT_MIME_TYPES.has("text/html"), false);
    assert.equal(ALLOWED_DOCUMENT_MIME_TYPES.has("application/x-sh"), false);
    assert.equal(ALLOWED_DOCUMENT_MIME_TYPES.has("application/octet-stream"), false);
  });

  test("6. Maximum document upload size is bounded at exactly 50 megabytes", () => {
    assert.equal(MAX_FILE_SIZE_BYTES, 50 * 1024 * 1024);
  });

  test("7. lib/storage/files.ts contains authoritative session, organization, and patient boundary checks", () => {
    const filesCode = fs.readFileSync(path.join(ROOT, "lib/storage/files.ts"), "utf8");
    assert.ok(filesCode.includes("requireStorageAccessAuthorization"), "Must define authoritative authorization guard");
    assert.ok(filesCode.includes("session.organizationId !== params.organizationId"), "Must enforce tenant matching");
    assert.ok(filesCode.includes("isPrivilegedRole"), "Must verify privileged roles");
    assert.ok(filesCode.includes("hasExplicitPermission"), "Must verify explicit permissions");
    assert.ok(filesCode.includes(".from(\"patients\")"), "Must verify patient organization membership");
    assert.ok(filesCode.includes("recordAuditLog"), "Must record audit logs on view/download and upload");
  });

  test("8. Supabase storage migrations define private bucket and multi-tenant RLS policies", () => {
    const bucketMigration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260928110000_storage_buckets_and_rls_hardening.sql"),
      "utf8"
    );
    assert.ok(bucketMigration.includes("medical-documents-vault"), "Must configure medical-documents-vault bucket");
    assert.ok(bucketMigration.includes("public = false"), "Bucket must be private (public = false)");

    const rlsMigration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260929010000_storage_objects_rls_hardening.sql"),
      "utf8"
    );
    assert.ok(rlsMigration.includes("CREATE POLICY \"medical_vault_tenant_isolation_select\""), "Must define select RLS policy on storage.objects");
    assert.ok(rlsMigration.includes("CREATE POLICY \"medical_vault_tenant_isolation_insert\""), "Must define insert RLS policy on storage.objects");
  });

  test("9. Migration 94 hardens storage.objects DELETE policy with strict admin role verification", () => {
    const rlsAdminMigration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260929020000_storage_admin_delete_and_cash_disbursements.sql"),
      "utf8"
    );
    assert.ok(
      rlsAdminMigration.includes("CREATE POLICY \"medical_vault_tenant_isolation_delete\""),
      "Must define delete policy on storage.objects"
    );
    assert.ok(
      rlsAdminMigration.includes("LOWER(r.name) IN ('admin', 'super_admin', 'hospital_administrator', 'super admin')"),
      "Must enforce admin role authorization for document deletion"
    );
  });

  test("10. lib/storage/files.ts compensates upload if audit log recording fails", () => {
    const filesCode = fs.readFileSync(path.join(ROOT, "lib/storage/files.ts"), "utf8");
    assert.ok(
      filesCode.includes(".remove([canonicalPath])"),
      "Must compensate and delete uploaded file if audit log fails"
    );
    assert.ok(
      !filesCode.includes('params.permissionKey === "medical_records:view"'),
      "Must not use literal permissionKey comparison bypass"
    );
  });
});

