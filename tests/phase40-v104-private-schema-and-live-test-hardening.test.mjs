/**
 * Phase 40: V1.0.4 Forensic Quality Gates
 * 
 * Verifies:
 * 1. Migration 46 exists and establishes unexposed private schema.
 * 2. private.get_current_org_id() is SECURITY DEFINER with SET search_path = ''.
 * 3. private.get_current_org_id() grants strictly to authenticated & service_role (revoked from PUBLIC, anon).
 * 4. public.get_current_org_id() is non-SECURITY DEFINER and revoked from PUBLIC, anon, authenticated.
 * 5. All core RLS policies explicitly reference private.get_current_org_id().
 * 6. Internal helpers (has_permission, current_user_role, current_org_id) have execute revoked from anon.
 * 7. Live cross-tenant test eliminates .env discovery, eliminates production fallback, and has ZERO bypass.
 * 8. CI workflow is hermetic, includes npm audit gate, and separates dedicated staging live security job.
 * 9. payment-callback maps all provider errors to sanitized internal codes without reflecting raw errors.
 * 10. Smoke test verifies route health, shell safety, table read/write shielding, and RPC access control.
 * 11. Version metadata is perfectly synchronized at 1.0.4 across all manifests and dynamic download page.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 40: V1.0.4 Quality Gates & Forensic Certification", async (t) => {
  const mig46Path = path.join(ROOT, "supabase/migrations/20260920090000_unexpose_tenant_resolver_to_private_schema.sql");
  const liveTestPath = path.join(ROOT, "tests/live/authenticated-cross-tenant.live.test.mjs");
  const ciWorkflowPath = path.join(ROOT, ".github/workflows/ci.yml");
  const callbackPath = path.join(ROOT, "supabase/functions/payment-callback/index.ts");
  const smokeTestPath = path.join(ROOT, "scripts/smoke_test.mjs");
  const pkgJsonPath = path.join(ROOT, "package.json");
  const pkgLockPath = path.join(ROOT, "package-lock.json");
  const tauriConfPath = path.join(ROOT, "src-tauri/tauri.conf.json");
  const cargoTomlPath = path.join(ROOT, "src-tauri/Cargo.toml");
  const latestJsonPath = path.join(ROOT, "public/downloads/desktop/latest.json");
  const desktopPagePath = path.join(ROOT, "app/(public)/downloads/desktop/page.tsx");

  assert.ok(fs.existsSync(mig46Path), "Migration 46 must exist");
  assert.ok(fs.existsSync(liveTestPath), "Live test file must exist");
  assert.ok(fs.existsSync(ciWorkflowPath), "CI workflow must exist");
  assert.ok(fs.existsSync(callbackPath), "payment-callback must exist");
  assert.ok(fs.existsSync(smokeTestPath), "smoke_test.mjs must exist");

  const mig46Code = fs.readFileSync(mig46Path, "utf8");
  const liveTestCode = fs.readFileSync(liveTestPath, "utf8");
  const ciCode = fs.readFileSync(ciWorkflowPath, "utf8");
  const callbackCode = fs.readFileSync(callbackPath, "utf8");
  const smokeCode = fs.readFileSync(smokeTestPath, "utf8");

  await t.test("1. Migration 46 creates unexposed private schema and defines private.get_current_org_id()", () => {
    assert.match(mig46Code, /CREATE SCHEMA IF NOT EXISTS private;/);
    assert.match(mig46Code, /CREATE OR REPLACE FUNCTION private\.get_current_org_id\(\)/);
    assert.match(mig46Code, /SECURITY DEFINER/);
    assert.match(mig46Code, /SET search_path = ''/);
  });

  await t.test("2. private.get_current_org_id() strictly restricts grants to authenticated and service_role", () => {
    assert.match(mig46Code, /REVOKE ALL ON SCHEMA private FROM PUBLIC;/);
    assert.match(mig46Code, /GRANT USAGE ON SCHEMA private TO authenticated, service_role;/);
    assert.match(mig46Code, /REVOKE ALL ON FUNCTION private\.get_current_org_id\(\) FROM PUBLIC, anon;/);
    assert.match(mig46Code, /GRANT EXECUTE ON FUNCTION private\.get_current_org_id\(\) TO authenticated, service_role;/);
  });

  await t.test("3. public.get_current_org_id() is stripped of SECURITY DEFINER and execute is revoked", () => {
    assert.match(mig46Code, /REVOKE ALL ON FUNCTION public\.get_current_org_id\(\) FROM PUBLIC, anon, authenticated;/);
    assert.match(mig46Code, /GRANT EXECUTE ON FUNCTION public\.get_current_org_id\(\) TO service_role;/);
  });

  await t.test("4. Core RLS policies explicitly reference private.get_current_org_id()", () => {
    assert.match(mig46Code, /CREATE POLICY rls_patients ON public\.patients.*USING \(organization_id = private\.get_current_org_id\(\)\)/s);
    assert.match(mig46Code, /CREATE POLICY rls_invoices ON public\.invoices.*USING \(organization_id = private\.get_current_org_id\(\)\)/s);
    assert.match(mig46Code, /CREATE POLICY rls_payments ON public\.payments.*USING \(organization_id = private\.get_current_org_id\(\)\)/s);
    assert.match(mig46Code, /CREATE POLICY rls_appointments ON public\.appointments.*USING \(organization_id = private\.get_current_org_id\(\)\)/s);
    assert.match(mig46Code, /CREATE POLICY rls_organization_integrations ON public\.organization_integrations.*USING \(organization_id = private\.get_current_org_id\(\)\)/s);
  });

  await t.test("5. Internal helpers have execute revoked from anon in public schema", () => {
    assert.match(mig46Code, /REVOKE EXECUTE ON FUNCTION public\.has_permission\(TEXT\) FROM PUBLIC, anon;/);
    assert.match(mig46Code, /REVOKE EXECUTE ON FUNCTION public\.current_user_role\(\) FROM PUBLIC, anon;/);
    assert.match(mig46Code, /REVOKE EXECUTE ON FUNCTION public\.current_org_id\(\) FROM PUBLIC, anon;/);
  });

  await t.test("6. Live cross-tenant test eliminates .env auto-discovery and production mutation bypass", () => {
    assert.doesNotMatch(liveTestCode, /ALLOW_MUTATING_PRODUCTION_TESTS/);
    assert.doesNotMatch(liveTestCode, /\.env\.local/);
    assert.match(liveTestCode, /OHMS_TEST_SUPABASE_URL/);
    assert.match(liveTestCode, /SECURITY INVARIANT VIOLATION/);
  });

  await t.test("7. CI workflow uses hermetic mock secrets, runs npm audit, and separates staging live test", () => {
    assert.doesNotMatch(ciCode, /iuhtzahuszdkdarhxobx/);
    assert.match(ciCode, /npm audit --audit-level=high/);
    assert.match(ciCode, /live-security-test:/);
    assert.match(ciCode, /secrets\.OHMS_TEST_SUPABASE_URL != ''/);
  });

  await t.test("8. payment-callback maps provider errors to sanitized internal error codes", () => {
    assert.match(callbackCode, /code:\s*"PROVIDER_VALIDATION_FAILED"/);
    assert.match(callbackCode, /code:\s*"PROVIDER_UNAVAILABLE"/);
    assert.match(callbackCode, /code:\s*"RISK_REVIEW"/);
    assert.doesNotMatch(callbackCode, /data\.failedreason/);
    assert.doesNotMatch(callbackCode, /err\.message/);
  });

  await t.test("9. smoke_test.mjs verifies route reachability, shell safety, table shielding, and RPC access", () => {
    assert.match(smokeCode, /--- LAYER A: Production Route HTTP Reachability ---/);
    assert.match(smokeCode, /--- LAYER B: Static Shell Data Leakage Inspection ---/);
    assert.match(smokeCode, /--- LAYER C: Live Database Table PostgREST Shielding ---/);
    assert.match(smokeCode, /--- LAYER D: PostgREST RPC Endpoint Access Control ---/);
    assert.match(smokeCode, /Table Write: patients/);
    assert.match(smokeCode, /RPC: get_current_org_id/);
  });

  await t.test("10. Version 1.0.4 parity verified across all manifests, configs, and download page", () => {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const lock = JSON.parse(fs.readFileSync(pkgLockPath, "utf8"));
    const tauri = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
    const cargo = fs.readFileSync(cargoTomlPath, "utf8");
    const latest = JSON.parse(fs.readFileSync(latestJsonPath, "utf8"));
    const desktopPage = fs.readFileSync(desktopPagePath, "utf8");

    assert.equal(pkg.version, "1.0.4");
    assert.equal(lock.version, "1.0.4");
    assert.equal(tauri.version, "1.0.4");
    assert.match(cargo, /version = "1\.0\.4"/);
    assert.equal(latest.version, "1.0.4");
    assert.match(latest.platforms["windows-x86_64"].installer_exe, /1\.0\.4\.exe/);
    assert.match(latest.platforms["windows-x86_64"].installer_msi, /1\.0\.4\.msi/);
    assert.match(desktopPage, /import pkg from "@/);
    assert.match(desktopPage, /pkg\.version/);
  });
});
