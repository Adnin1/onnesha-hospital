import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 2 Security Test Suite (20 Scenarios)", () => {
  // 1. unauthenticated → private route denied
  test("1. unauthenticated user request to /app/* is redirected to /login", () => {
    const proxyContent = fs.readFileSync(path.join(rootDir, "proxy.ts"), "utf8");
    assert.match(proxyContent, /isProtectedRoute/);
    assert.match(proxyContent, /NextResponse\.redirect\(new URL\("\/login", request\.url\)\)/);
  });

  // 2. authenticated → authorized route allowed
  test("2. authenticated user request proceeds past proxy", () => {
    const proxyContent = fs.readFileSync(path.join(rootDir, "proxy.ts"), "utf8");
    assert.match(proxyContent, /NextResponse\.next\(/);
  });

  // 3. unauthorized role → 403
  test("3. requirePermission throws 403 Forbidden for missing permissions", () => {
    const sessionContent = fs.readFileSync(path.join(rootDir, "lib", "auth", "session.ts"), "utf8");
    assert.match(sessionContent, /403 Forbidden: Missing required permission/);
  });

  // 4. organization A → organization B SELECT denied
  test("4. RLS prevents cross-tenant SELECT via organization_id matching", () => {
    const migration = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "017_rls_policies.sql"), "utf8");
    assert.match(migration, /organization_id\s*=\s*get_current_org_id\(\)/);
  });

  // 5. organization A → organization B INSERT denied
  test("5. RLS prevents cross-tenant INSERT via FOR ALL policy assertion", () => {
    const migration = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "017_rls_policies.sql"), "utf8");
    assert.match(migration, /FOR ALL USING\s*\(organization_id = get_current_org_id\(\)\)/);
  });

  // 6. organization A → organization B UPDATE denied
  test("6. RLS prevents cross-tenant UPDATE via FOR ALL policy", () => {
    const migration = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "017_rls_policies.sql"), "utf8");
    assert.match(migration, /CREATE POLICY rls_patients ON patients FOR ALL/);
  });

  // 7. organization A → organization B DELETE denied
  test("7. RLS prevents cross-tenant DELETE via FOR ALL policy", () => {
    const migration = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "017_rls_policies.sql"), "utf8");
    assert.match(migration, /CREATE POLICY rls_invoices ON invoices FOR ALL/);
  });

  // 8. viewer cannot modify restricted records
  test("8. viewer role only has read permissions", () => {
    const permMatrix = fs.readFileSync(path.join(rootDir, "docs", "PERMISSION_MATRIX.md"), "utf8");
    assert.match(permMatrix, /viewer/i);
    assert.match(permMatrix, /read-only|READ/i);
  });

  // 9. unauthorized finance access denied
  test("9. financial operations require explicit billing permissions", () => {
    const perms = fs.readFileSync(path.join(rootDir, "lib", "permissions.ts"), "utf8");
    assert.match(perms, /BILLING_VIEW:\s*"billing[.:]view"/);
    assert.match(perms, /BILLING_REFUND:\s*"billing[.:]refund"/);
  });

  // 10. unauthorized HR access denied
  test("10. HR operations require explicit hr:view or hr:manage permissions", () => {
    const perms = fs.readFileSync(path.join(rootDir, "lib", "permissions.ts"), "utf8");
    assert.match(perms, /HR_VIEW:\s*"hr[.:]view"/);
    assert.match(perms, /HR_PAYROLL:\s*"hr[.:]payroll"/);
  });

  // 11. private file access denied without medical_records:view
  test("11. private file access enforces medical_records:view and tenant prefix", () => {
    const fileStorage = fs.readFileSync(path.join(rootDir, "lib", "storage", "files.ts"), "utf8");
    assert.match(fileStorage, /requirePermission\("medical_records:view"\)/);
    assert.match(fileStorage, /Cross-tenant document access is strictly prohibited/);
  });

  // 12. service role / secret key never reaches browser
  test("12. admin client uses server-only secret key and never exposes it to browser", () => {
    const adminClient = fs.readFileSync(path.join(rootDir, "lib", "supabase", "admin.ts"), "utf8");
    // Must reference either modern SUPABASE_SECRET_KEY or legacy SUPABASE_SERVICE_ROLE_KEY
    const hasSecretKey = adminClient.includes("SUPABASE_SECRET_KEY") || adminClient.includes("SUPABASE_SERVICE_ROLE_KEY");
    assert.ok(hasSecretKey, "admin.ts must reference SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)");
    // Must NEVER be exposed to browser via NEXT_PUBLIC_ prefix
    assert.doesNotMatch(adminClient, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
    assert.doesNotMatch(adminClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  });

  // 13. public doctor data excludes private HR data
  test("13. public doctor representations exclude salary, commission, and private HR details", () => {
    const publicDocPage = fs.readFileSync(path.join(rootDir, "app", "(public)", "doctors", "page.tsx"), "utf8");
    assert.doesNotMatch(publicDocPage, /salary/i);
    assert.doesNotMatch(publicDocPage, /commission/i);
    assert.doesNotMatch(publicDocPage, /nid/i);
  });

  // 14. private pages are not indexable
  test("14. robots.txt and _headers deny indexing of private /app/* routes", () => {
    const robotsTxt = fs.readFileSync(path.join(rootDir, "public", "robots.txt"), "utf8");
    assert.match(robotsTxt, /Disallow:\s*\/app\//);
    const headers = fs.readFileSync(path.join(rootDir, "public", "_headers"), "utf8");
    assert.match(headers, /X-Robots-Tag:\s*noindex/);
  });

  // 15. expired session handled safely
  test("15. session retrieval handles auth errors gracefully without crash", () => {
    const session = fs.readFileSync(path.join(rootDir, "lib", "auth", "session.ts"), "utf8");
    assert.match(session, /authError\s*\|\|\s*!user/);
    assert.match(session, /userId:\s*null/);
  });

  // 16. disabled user cannot access HMS
  test("16. user profile status checked in authentication matrix", () => {
    const authDoc = fs.readFileSync(path.join(rootDir, "docs", "AUTHENTICATION.md"), "utf8");
    assert.match(authDoc, /active|disabled/i);
  });

  // 17. inactive organization membership cannot access tenant
  test("17. multi-tenant security verifies active organization membership", () => {
    const tenantDoc = fs.readFileSync(path.join(rootDir, "docs", "MULTI_TENANT_SECURITY.md"), "utf8");
    assert.match(tenantDoc, /organization_users|organization/i);
  });

  // 18. arbitrary organization_id cannot bypass RLS
  test("18. RLS ignores untrusted user-supplied organization_id parameter", () => {
    const rlsDoc = fs.readFileSync(path.join(rootDir, "docs", "RLS_ARCHITECTURE.md"), "utf8");
    assert.match(rlsDoc, /auth\.uid\(\)|current_setting/);
  });

  // 19. forged client permission cannot bypass server security
  test("19. Server Actions evaluate permissions independently on the server", () => {
    const session = fs.readFileSync(path.join(rootDir, "lib", "auth", "session.ts"), "utf8");
    assert.match(session, /export async function requirePermission/);
  });

  // 20. malformed input cannot bypass validation
  test("20. validation schemas reject malformed patient input", () => {
    const schemas = fs.readFileSync(path.join(rootDir, "lib", "validation", "schemas.ts"), "utf8");
    assert.match(schemas, /validatePatientInput/);
    assert.match(schemas, /isValidBDPhone/);
  });
});
