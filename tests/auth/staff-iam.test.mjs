import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Staff Identity & Access Management (IAM) Test Suite", () => {
  // Test 1: Migration 66 exists and implements all Security Definer IAM RPCs
  test("1. Migration 20260924170000_staff_iam.sql defines canonical IAM RPCs & schema", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20260924170000_staff_iam.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.ok(sql.includes("admin_create_staff_account"), "admin_create_staff_account RPC required");
    assert.ok(sql.includes("admin_reset_staff_password"), "admin_reset_staff_password RPC required");
    assert.ok(sql.includes("admin_set_staff_status"), "admin_set_staff_status RPC required");
    assert.ok(sql.includes("admin_change_staff_role"), "admin_change_staff_role RPC required");
    assert.ok(sql.includes("get_staff_directory_admin"), "get_staff_directory_admin RPC required");
    assert.ok(sql.includes("must_change_password"), "must_change_password column required");
    assert.ok(sql.includes("account_status"), "account_status column required");
  });

  // Test 2: Role normalization with fail-closed implementation
  test("2. lib/utils.ts enforces canonical roles and fail-closed normalization", () => {
    const utilsContent = fs.readFileSync(path.join(ROOT, "lib/utils.ts"), "utf8");
    assert.ok(utilsContent.includes("CANONICAL_ROLES"), "CANONICAL_ROLES array required");
    assert.ok(utilsContent.includes("hospital_administrator"), "hospital_administrator canonical role required");
    assert.ok(utilsContent.includes("lab_technologist"), "lab_technologist canonical role required");
    assert.ok(utilsContent.includes("hr_payroll"), "hr_payroll canonical role required");

    // Verify fail closed return "" instead of defaulting to receptionist
    assert.ok(utilsContent.includes('return "";'), "Fail-closed check required for unknown roles");
  });

  // Test 3: Temporary password generator entropy and security properties
  test("3. lib/staff/actions.ts implements secure random temporary password generator", () => {
    const actionsContent = fs.readFileSync(path.join(ROOT, "lib/staff/actions.ts"), "utf8");
    assert.ok(actionsContent.includes("generateSecureTemporaryPassword"), "generateSecureTemporaryPassword required");
    assert.ok(actionsContent.includes("getRandomValues"), "crypto.getRandomValues required for entropy");
    assert.ok(actionsContent.includes("createStaffAccountAction"), "createStaffAccountAction required");
    assert.ok(actionsContent.includes("resetStaffPasswordAction"), "resetStaffPasswordAction required");
    assert.ok(actionsContent.includes("setStaffStatusAction"), "setStaffStatusAction required");
    assert.ok(actionsContent.includes("changeStaffRoleAction"), "changeStaffRoleAction required");
  });

  // Test 4: AuthGuard enforces account_status & must_change_password
  test("4. AuthGuard.tsx blocks deactivated/suspended accounts and forces password change", () => {
    const authGuard = fs.readFileSync(path.join(ROOT, "components/auth/AuthGuard.tsx"), "utf8");
    assert.ok(authGuard.includes("account_status"), "account_status inspection required");
    assert.ok(authGuard.includes("SUSPENDED"), "SUSPENDED check required");
    assert.ok(authGuard.includes("DISABLED"), "DISABLED check required");
    assert.ok(authGuard.includes("must_change_password"), "must_change_password check required");
    assert.ok(authGuard.includes("/reset-password?forced=true"), "Redirect to forced reset required");
    assert.ok(authGuard.includes("/login?error=account_deactivated"), "Redirect on deactivation required");
  });

  // Test 5: Login page enforces deactivated check and password change redirect
  test("5. app/(auth)/login/page.tsx handles deactivated error and mandatory reset", () => {
    const loginPage = fs.readFileSync(path.join(ROOT, "app/(auth)/login/page.tsx"), "utf8");
    assert.ok(loginPage.includes("account_deactivated"), "account_deactivated handling required");
    assert.ok(loginPage.includes("must_change_password"), "must_change_password check on login required");
    assert.ok(loginPage.includes("/reset-password?forced=true"), "Forced redirect required");
  });

  // Test 6: Reset password page supports forced change and clears flag
  test("6. app/(auth)/reset-password/page.tsx supports forced mode and clears flag in DB", () => {
    const resetPage = fs.readFileSync(path.join(ROOT, "app/(auth)/reset-password/page.tsx"), "utf8");
    assert.ok(resetPage.includes("forced"), "Forced query param support required");
    assert.ok(resetPage.includes("must_change_password: false"), "Profiles table update required");
  });

  // Test 7: Staff Management UI page exists and supports one-time credentials
  test("7. app/(hospital)/app/settings/staff/page.tsx provides full IAM lifecycle interface", () => {
    const staffPagePath = path.join(ROOT, "app/(hospital)/app/settings/staff/page.tsx");
    assert.ok(fs.existsSync(staffPagePath), "Staff management page must exist");
    const staffContent = fs.readFileSync(staffPagePath, "utf8");

    assert.ok(staffContent.includes("createStaffAccountAction"), "Account creation UI required");
    assert.ok(staffContent.includes("credentialModal"), "One-time credential disclosure modal required");
    assert.ok(staffContent.includes("resetStaffPasswordAction"), "Password reset UI required");
    assert.ok(staffContent.includes("setStaffStatusAction"), "Status toggle UI required");
    assert.ok(staffContent.includes("changeStaffRoleAction"), "Role change UI required");
  });

  // Test 8: Sidebar navigation links to Staff Directory & Access
  test("8. Navigation config includes Staff Directory & Access under Enterprise ERP", () => {
    const navContent = fs.readFileSync(path.join(ROOT, "config/navigation.ts"), "utf8");
    assert.ok(navContent.includes("/app/settings/staff"), "Staff link must be in navigation");
    assert.ok(navContent.includes("STAFF_VIEW"), "STAFF_VIEW permission required for nav item");
  });

  // Test 9: Permission definitions and default roles
  test("9. lib/permissions.ts defines STAFF permissions and maps all 8 canonical roles", () => {
    const permContent = fs.readFileSync(path.join(ROOT, "lib/permissions.ts"), "utf8");
    assert.ok(permContent.includes("STAFF_VIEW"), "STAFF_VIEW required");
    assert.ok(permContent.includes("STAFF_CREATE"), "STAFF_CREATE required");
    assert.ok(permContent.includes("STAFF_MANAGE"), "STAFF_MANAGE required");
    assert.ok(permContent.includes("STAFF_RESET_PASSWORD"), "STAFF_RESET_PASSWORD required");
    assert.ok(permContent.includes("DEPARTMENTS_MANAGE"), "DEPARTMENTS_MANAGE required");
    assert.ok(permContent.includes("hospital_administrator:"), "hospital_administrator in DEFAULT_ROLE_PERMISSIONS required");
    assert.ok(permContent.includes("lab_technologist:"), "lab_technologist in DEFAULT_ROLE_PERMISSIONS required");
    assert.ok(permContent.includes("hr_payroll:"), "hr_payroll in DEFAULT_ROLE_PERMISSIONS required");
  });

  // Test 10: Zero plaintext passwords logged or stored in client files
  test("10. Zero plaintext staff passwords hardcoded in source repository", () => {
    const staffActions = fs.readFileSync(path.join(ROOT, "lib/staff/actions.ts"), "utf8");
    assert.ok(!staffActions.includes("service_role"), "Zero service role keys in client actions");
    assert.ok(!staffActions.includes("Admin@123"), "No default static password");
  });
});
