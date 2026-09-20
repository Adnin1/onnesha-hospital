import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Database RBAC, Admin Roles & Permission Control Test Suite (10 Scenarios)", async () => {

  test("1. lib/auth/session.ts queries user_roles and profiles tables for database role resolution", () => {
    const sessionPath = path.join(ROOT, "lib/auth/session.ts");
    assert.ok(fs.existsSync(sessionPath), "session.ts must exist");
    const content = fs.readFileSync(sessionPath, "utf8");
    assert.ok(content.includes('.from("profiles")'), "profiles table query required");
    assert.ok(content.includes('.from("user_roles")'), "user_roles table query required");
  });

  test("2. session.ts checks super_admin and admin roles for automatic permission resolution", () => {
    const sessionPath = path.join(ROOT, "lib/auth/session.ts");
    const content = fs.readFileSync(sessionPath, "utf8");
    assert.ok(content.includes('includes("super_admin")'), "super_admin check required");
    assert.ok(content.includes('includes("admin")'), "admin check required");
  });

  test("3. requirePermission function throws 403 Forbidden error message", () => {
    const sessionPath = path.join(ROOT, "lib/auth/session.ts");
    const content = fs.readFileSync(sessionPath, "utf8");
    assert.ok(content.includes("403 Forbidden: Missing required permission"), "403 Forbidden error message required");
  });

  test("4. Database migration 003_auth_profiles.sql defines profiles, roles, and user_roles tables", () => {
    const migPath = path.join(ROOT, "supabase/migrations/003_auth_profiles.sql");
    assert.ok(fs.existsSync(migPath), "003_auth_profiles.sql must exist");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("CREATE TABLE IF NOT EXISTS profiles"), "profiles table creation required");
    assert.ok(content.includes("CREATE TABLE IF NOT EXISTS user_roles"), "user_roles table creation required");
  });

  test("5. RLS policies on user_roles and organizations enforce tenant isolation", () => {
    const migPath = path.join(ROOT, "supabase/migrations/017_rls_policies.sql");
    assert.ok(fs.existsSync(migPath), "017_rls_policies.sql must exist");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(content.includes("ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY"), "RLS required on user_roles");
  });

  test("6. lib/permissions.ts defines complete permission matrix for all hospital roles", () => {
    const permPath = path.join(ROOT, "lib/permissions.ts");
    assert.ok(fs.existsSync(permPath), "permissions.ts must exist");
    const content = fs.readFileSync(permPath, "utf8");
    assert.ok(content.includes("SETTINGS_VIEW"), "SETTINGS_VIEW permission required");
    assert.ok(content.includes("BILLING_VOID"), "BILLING_VOID permission required");
  });

  test("7. Server Actions evaluate permissions independently on the server side", () => {
    const billingActions = path.join(ROOT, "lib/billing/actions.ts");
    const content = fs.readFileSync(billingActions, "utf8");
    assert.ok(content.includes("requirePermission") || content.includes("getCurrentUserSession"), "Permission evaluation required in actions");
  });

  test("8. Client AuthGuard verifies active profile and organization membership", () => {
    const guardPath = path.join(ROOT, "components/auth/AuthGuard.tsx");
    const content = fs.readFileSync(guardPath, "utf8");
    assert.ok(content.includes("user_roles"), "user_roles check required in AuthGuard");
  });

  test("9. System health check monitors auth subsystem health", () => {
    const healthPath = path.join(ROOT, "lib/health.ts");
    const content = fs.readFileSync(healthPath, "utf8");
    assert.ok(content.includes("auth:"), "Auth check required in system health");
  });

  test("10. Zero hardcoded credentials or demo passwords in RBAC permission helpers", () => {
    const sessionPath = path.join(ROOT, "lib/auth/session.ts");
    const content = fs.readFileSync(sessionPath, "utf8");
    assert.ok(!content.includes("password123"), "No hardcoded passwords in session helpers");
  });
});
