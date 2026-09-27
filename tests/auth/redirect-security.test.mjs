import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRedirectPath } from "../../lib/auth/safe-errors.ts";

describe("OHMS Security: Open Redirect Prevention (CWE-601)", () => {
  test("1. Allows valid local paths starting with single slash", () => {
    assert.equal(sanitizeRedirectPath("/app/dashboard"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/app/patients"), "/app/patients");
    assert.equal(sanitizeRedirectPath("/app/settings/security"), "/app/settings/security");
    assert.equal(sanitizeRedirectPath("/reset-password"), "/reset-password");
  });

  test("2. Rejects external absolute URLs and falls back safely", () => {
    assert.equal(sanitizeRedirectPath("https://evil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("http://attacker.com/steal"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("javascript:alert(1)"), "/app/dashboard");
  });

  test("3. Rejects protocol-relative double slash URLs (//evil.com)", () => {
    assert.equal(sanitizeRedirectPath("//evil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("//attacker.org/phish"), "/app/dashboard");
  });

  test("4. Rejects backslash and encoded backslash bypasses (/\\evil.com)", () => {
    assert.equal(sanitizeRedirectPath("/\\evil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("\\evil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/%5cevil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/%2f%2fevil.com"), "/app/dashboard");
  });

  test("5. Rejects null, undefined, empty string and non-string inputs", () => {
    assert.equal(sanitizeRedirectPath(null), "/app/dashboard");
    assert.equal(sanitizeRedirectPath(undefined), "/app/dashboard");
    assert.equal(sanitizeRedirectPath(""), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("   "), "/app/dashboard");
    assert.equal(sanitizeRedirectPath(123), "/app/dashboard");
  });

  test("6. Rejects uppercase and mixed-case percent encoding bypasses", () => {
    assert.equal(sanitizeRedirectPath("/%2F%2Fevil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/%5Cevil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/%2F%2fevil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/%5cEvil.com"), "/app/dashboard");
  });

  test("7. Rejects multi-level nested URL encoding (%252f%252f)", () => {
    assert.equal(sanitizeRedirectPath("/%252f%252fevil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/%255cevil.com"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/%25252f%25252fevil.com"), "/app/dashboard");
  });

  test("8. Rejects control characters and CRLF injection attempts", () => {
    assert.equal(sanitizeRedirectPath("/app/dashboard\r\nSet-Cookie: evil=1"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/app/dashboard\x00evil"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/app/dashboard\x1bevil"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("/app/dashboard\x7fevil"), "/app/dashboard");
  });

  test("9. Rejects alternative pseudo-protocols (data:, vbscript:, file:)", () => {
    assert.equal(sanitizeRedirectPath("data:text/html,<script>alert(1)</script>"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("vbscript:msgbox(1)"), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("file:///etc/passwd"), "/app/dashboard");
  });

  test("10. Preserves safe complex internal paths with queries and fragments", () => {
    assert.equal(
      sanitizeRedirectPath("/app/patients?tab=records&page=2#history"),
      "/app/patients?tab=records&page=2#history"
    );
    assert.equal(
      sanitizeRedirectPath("/reset-password?sb_flow_id=flow-123"),
      "/reset-password?sb_flow_id=flow-123"
    );
    assert.equal(
      sanitizeRedirectPath("/app/billing?invoice_id=INV-2026-001"),
      "/app/billing?invoice_id=INV-2026-001"
    );
  });
});

