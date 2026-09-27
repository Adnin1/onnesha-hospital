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

  test("5. Rejects null, undefined, empty string and returns fallback", () => {
    assert.equal(sanitizeRedirectPath(null), "/app/dashboard");
    assert.equal(sanitizeRedirectPath(undefined), "/app/dashboard");
    assert.equal(sanitizeRedirectPath(""), "/app/dashboard");
    assert.equal(sanitizeRedirectPath("   "), "/app/dashboard");
  });
});
