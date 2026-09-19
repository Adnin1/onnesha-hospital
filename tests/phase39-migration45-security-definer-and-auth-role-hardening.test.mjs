/**
 * Phase 39: Migration 45 SECURITY DEFINER, Deprecated auth.role() Elimination,
 * Error Sanitization, and Version 1.0.3 Verification Suite
 * 
 * Verifies:
 * 1. Migration 45 exists and is structurally sound.
 * 2. get_current_org_id() contains ZERO calls to deprecated auth.role() and uses safe JWT claims.
 * 3. get_current_org_id() locks search path with SET search_path = ''.
 * 4. verify_and_record_online_payment() contains ZERO calls to deprecated auth.role().
 * 5. verify_and_record_online_payment() suppresses SQLERRM leakage on error.
 * 6. verify_and_record_online_payment() strictly restricts EXECUTE to service_role.
 * 7. payment-callback implements UTF-8 byte stream processing in md5Hex.
 * 8. payment-callback strictly enforces verify_sign & verify_key on SSLCommerz IPN.
 * 9. payment-callback sanitizes x-correlation-id and redacts sensitive payload fields.
 * 10. payment-initiate sanitizes 500 error catch block and supports fresh retry for failed/expired intents.
 * 11. All version metadata is reconciled at v1.0.3 across manifests, pages, and configs.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 39: Migration 45 Hardening & Version 1.0.3 Quality Gates", async (t) => {
  const mig45Path = path.join(ROOT, "supabase/migrations/20260920080000_harden_security_definer_and_eliminate_deprecated_auth_role.sql");
  const callbackPath = path.join(ROOT, "supabase/functions/payment-callback/index.ts");
  const initiatePath = path.join(ROOT, "supabase/functions/payment-initiate/index.ts");
  const desktopPagePath = path.join(ROOT, "app/(public)/downloads/desktop/page.tsx");
  const latestJsonPath = path.join(ROOT, "public/downloads/desktop/latest.json");
  const pkgJsonPath = path.join(ROOT, "package.json");
  const tauriConfPath = path.join(ROOT, "src-tauri/tauri.conf.json");

  assert.ok(fs.existsSync(mig45Path), "Migration 45 must exist");
  assert.ok(fs.existsSync(callbackPath), "payment-callback function must exist");
  assert.ok(fs.existsSync(initiatePath), "payment-initiate function must exist");

  const mig45Code = fs.readFileSync(mig45Path, "utf8");
  const callbackCode = fs.readFileSync(callbackPath, "utf8");
  const initiateCode = fs.readFileSync(initiatePath, "utf8");

  await t.test("1. Migration 45 completely eliminates deprecated auth.role() in all functions", () => {
    const uncommentedCode = mig45Code.replace(/--.*$/gm, "");
    assert.doesNotMatch(
      uncommentedCode,
      /auth\.role\(\)/,
      "Migration 45 must not contain any calls to deprecated auth.role()"
    );
    assert.match(
      mig45Code,
      /request\.jwt\.claims/,
      "Migration 45 must inspect caller role via request.jwt.claims"
    );
  });

  await t.test("2. Migration 45 pins SET search_path = '' and maintains fail-closed resolution", () => {
    assert.match(mig45Code, /SET search_path = ''/);
    assert.match(mig45Code, /current_user != 'service_role'/);
    assert.match(mig45Code, /v_org_id := NULL;/);
  });

  await t.test("3. verify_and_record_online_payment completely suppresses SQLERRM leakage", () => {
    const uncommentedCode = mig45Code.replace(/--.*$/gm, "");
    assert.doesNotMatch(
      uncommentedCode,
      /SQLERRM/,
      "verify_and_record_online_payment must not leak internal database SQLERRM"
    );
    assert.match(
      mig45Code,
      /SETTLEMENT_INTERNAL_ERROR/,
      "verify_and_record_online_payment must return sanitized error code"
    );
  });

  await t.test("4. verify_and_record_online_payment enforces strict service_role execution grants", () => {
    assert.match(
      mig45Code,
      /REVOKE EXECUTE ON FUNCTION public\.verify_and_record_online_payment.*FROM PUBLIC, anon, authenticated;/
    );
    assert.match(
      mig45Code,
      /GRANT EXECUTE ON FUNCTION public\.verify_and_record_online_payment.*TO service_role;/
    );
  });

  await t.test("5. payment-callback implements UTF-8 byte stream processing in md5Hex", () => {
    assert.match(callbackCode, /new TextEncoder\(\)\.encode\(str\)/);
    assert.doesNotMatch(callbackCode, /str\.charCodeAt\(i\s*\/\s*8\)/);
  });

  await t.test("6. SSLCommerz IPN strictly requires verify_sign and verify_key", () => {
    assert.match(callbackCode, /MISSING_IPN_SIGNATURE/);
    assert.match(callbackCode, /verifySign\s*&&\s*verifyKey/);
  });

  await t.test("7. payment-callback sanitizes x-correlation-id and redacts sensitive payload", () => {
    assert.match(callbackCode, /sanitizeWebhookPayload/);
    assert.match(callbackCode, /\[REDACTED\]/);
    assert.match(callbackCode, /rawCorrId/);
    assert.match(callbackCode, /LEDGER_PERSISTENCE_FAILED/);
  });

  await t.test("8. payment-initiate sanitizes 500 error catch block and allows fresh retry for failed/expired intents", () => {
    assert.match(initiateCode, /existingIntent\.status !== "FAILED" && existingIntent\.status !== "EXPIRED"/);
    assert.match(initiateCode, /code:\s*"INTERNAL_ERROR"/);
    assert.doesNotMatch(initiateCode, /errorMsg\s*=\s*err instanceof Error/);
  });

  await t.test("9. Desktop download page and latest manifest match version 1.0.3", () => {
    const desktopPage = fs.readFileSync(desktopPagePath, "utf8");
    const latestJson = JSON.parse(fs.readFileSync(latestJsonPath, "utf8"));
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));

    assert.equal(pkgJson.version, "1.0.3");
    assert.equal(tauriConf.version, "1.0.3");
    assert.equal(latestJson.version, "1.0.3");
    assert.match(desktopPage, /Onnesha Hospital Desktop v1\.0\.3/);
    assert.match(desktopPage, /Onnesha-Hospital-Setup-1\.0\.3\.exe/);
    assert.match(desktopPage, /Onnesha-Hospital-1\.0\.3\.msi/);
    assert.match(latestJson.platforms["windows-x86_64"].installer_exe, /1\.0\.3\.exe/);
    assert.match(latestJson.platforms["windows-x86_64"].installer_msi, /1\.0\.3\.msi/);
  });
});
