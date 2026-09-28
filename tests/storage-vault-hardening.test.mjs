import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAndCanonicalizeStoragePath,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  PRIVATE_STORAGE_BUCKET,
} from "../lib/storage/validation.ts";

describe("OHMS Storage Vault Hardening & Tenant Isolation Guard", () => {
  const TEST_ORG = "e2e81111-2222-3333-4444-555566667777";
  const TEST_PATIENT = "P-202609-00101";

  test("1. Valid path with matching tenant and patient passes canonicalization", () => {
    const raw = `${TEST_ORG}/${TEST_PATIENT}/blood_report_2026.pdf`;
    const res = validateAndCanonicalizeStoragePath(raw, TEST_ORG, TEST_PATIENT);
    assert.equal(res.valid, true);
    assert.equal(res.canonicalPath, raw);
  });

  test("2. Path traversal attempts are strictly rejected (../, ..\\, encoded)", () => {
    const traversalPayloads = [
      `../etc/passwd`,
      `${TEST_ORG}/../${TEST_PATIENT}/doc.pdf`,
      `${TEST_ORG}\\${TEST_PATIENT}\\doc.pdf`,
      `${TEST_ORG}/%2e%2e/doc.pdf`,
      `${TEST_ORG}/%2F/doc.pdf`,
      `/${TEST_ORG}/${TEST_PATIENT}/doc.pdf`,
      `${TEST_ORG}/${TEST_PATIENT}/doc.pdf\0.exe`,
    ];

    for (const p of traversalPayloads) {
      const res = validateAndCanonicalizeStoragePath(p, TEST_ORG, TEST_PATIENT);
      assert.equal(res.valid, false, `Payload must be rejected: ${p}`);
      assert.ok(res.error, "Error message required");
    }
  });

  test("3. Cross-tenant path is strictly rejected", () => {
    const alienOrg = "99999999-9999-9999-9999-999999999999";
    const raw = `${alienOrg}/${TEST_PATIENT}/doc.pdf`;
    const res = validateAndCanonicalizeStoragePath(raw, TEST_ORG, TEST_PATIENT);
    assert.equal(res.valid, false);
    assert.match(res.error || "", /Cross-tenant/i);
  });

  test("4. Mismatched patient path is strictly rejected", () => {
    const raw = `${TEST_ORG}/P-OTHER-00999/doc.pdf`;
    const res = validateAndCanonicalizeStoragePath(raw, TEST_ORG, TEST_PATIENT);
    assert.equal(res.valid, false);
    assert.match(res.error || "", /authorized patient/i);
  });

  test("5. Filenames with hidden extensions or illegal characters are rejected", () => {
    const illegalFilenames = [
      `${TEST_ORG}/${TEST_PATIENT}/.hidden_file`,
      `${TEST_ORG}/${TEST_PATIENT}/file with spaces.pdf`,
      `${TEST_ORG}/${TEST_PATIENT}/file;drop.pdf`,
    ];

    for (const f of illegalFilenames) {
      const res = validateAndCanonicalizeStoragePath(f, TEST_ORG, TEST_PATIENT);
      assert.equal(res.valid, false, `Filename must be rejected: ${f}`);
    }
  });

  test("6. MIME whitelist accepts clinical documents (PDF, JPEG, PNG, DICOM) and rejects executables/scripts", () => {
    assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.has("application/pdf"));
    assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.has("image/jpeg"));
    assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.has("image/png"));
    assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.has("application/dicom"));

    assert.ok(!ALLOWED_DOCUMENT_MIME_TYPES.has("text/html"));
    assert.ok(!ALLOWED_DOCUMENT_MIME_TYPES.has("application/javascript"));
    assert.ok(!ALLOWED_DOCUMENT_MIME_TYPES.has("application/x-msdownload"));
    assert.ok(!ALLOWED_DOCUMENT_MIME_TYPES.has("application/octet-stream"));
  });

  test("7. Maximum file size constant is strictly capped at 50MB", () => {
    assert.equal(MAX_FILE_SIZE_BYTES, 50 * 1024 * 1024);
    assert.equal(PRIVATE_STORAGE_BUCKET, "medical-documents-vault");
  });
});
