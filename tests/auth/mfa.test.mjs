import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS TOTP Multi-Factor Authentication (MFA & AAL2) Test Suite (10 Scenarios)", async () => {

  test("1. TOTP MFA Challenge page app/(auth)/mfa/page.tsx exists", () => {
    const mfaPath = path.join(ROOT, "app/(auth)/mfa/page.tsx");
    assert.ok(fs.existsSync(mfaPath), "mfa page must exist");
    const content = fs.readFileSync(mfaPath, "utf8");
    assert.ok(content.includes("2-Factor Security Verification"), "MFA title required");
    assert.ok(content.includes("mfa.challenge"), "mfa.challenge API call required");
    assert.ok(content.includes("mfa.verify"), "mfa.verify API call required");
  });

  test("2. MFA challenge page uses 6-digit numeric input with one-time-code autocomplete", () => {
    const mfaPath = path.join(ROOT, "app/(auth)/mfa/page.tsx");
    const content = fs.readFileSync(mfaPath, "utf8");
    assert.ok(content.includes('autoComplete="one-time-code"'), "one-time-code autocomplete required");
    assert.ok(content.includes('maxLength={6}'), "6-digit max length required");
  });

  test("3. Security settings page app/(hospital)/app/settings/security/page.tsx exists", () => {
    const secPath = path.join(ROOT, "app/(hospital)/app/settings/security/page.tsx");
    assert.ok(fs.existsSync(secPath), "security settings page must exist");
    const content = fs.readFileSync(secPath, "utf8");
    assert.ok(content.includes("Security & MFA Management"), "Page title required");
    assert.ok(content.includes("mfa.enroll"), "mfa.enroll call required");
  });

  test("4. Security settings page renders QR code and manual secret key for TOTP pairing", () => {
    const secPath = path.join(ROOT, "app/(hospital)/app/settings/security/page.tsx");
    const content = fs.readFileSync(secPath, "utf8");
    assert.ok(content.includes("qr_code"), "QR code rendering required");
    assert.ok(content.includes("secret"), "Secret key display required");
  });

  test("5. lib/auth/session.ts defines getCurrentUserSession with aalLevel property", () => {
    const sessionPath = path.join(ROOT, "lib/auth/session.ts");
    const content = fs.readFileSync(sessionPath, "utf8");
    assert.ok(content.includes("aalLevel"), "aalLevel property required in session.ts");
    assert.ok(content.includes("nextAalLevel"), "nextAalLevel property required in session.ts");
  });

  test("6. lib/auth/session.ts defines requireAAL2 helper for high-risk operation enforcement", () => {
    const sessionPath = path.join(ROOT, "lib/auth/session.ts");
    const content = fs.readFileSync(sessionPath, "utf8");
    assert.ok(content.includes("export async function requireAAL2"), "requireAAL2 function required");
  });

  test("7. Client AuthGuard component components/auth/AuthGuard.tsx exists", () => {
    const guardPath = path.join(ROOT, "components/auth/AuthGuard.tsx");
    assert.ok(fs.existsSync(guardPath), "AuthGuard component must exist");
    const content = fs.readFileSync(guardPath, "utf8");
    assert.ok(content.includes("getAuthenticatorAssuranceLevel"), "AAL check required");
    assert.ok(content.includes("/auth/mfa"), "MFA redirect path required");
  });

  test("8. Hospital layout app/(hospital)/app/layout.tsx wraps children in AuthGuard", () => {
    const layoutPath = path.join(ROOT, "app/(hospital)/app/layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf8");
    assert.ok(content.includes("<AuthGuard>"), "AuthGuard wrapping required in layout");
  });

  test("9. Security settings page allows un-enrolling TOTP factors", () => {
    const secPath = path.join(ROOT, "app/(hospital)/app/settings/security/page.tsx");
    const content = fs.readFileSync(secPath, "utf8");
    assert.ok(content.includes("mfa.unenroll"), "mfa.unenroll API call required");
  });

  test("10. MFA challenge page handles user logout option during challenge", () => {
    const mfaPath = path.join(ROOT, "app/(auth)/mfa/page.tsx");
    const content = fs.readFileSync(mfaPath, "utf8");
    assert.ok(content.includes("handleLogout"), "Logout handler required in MFA challenge");
  });
});
