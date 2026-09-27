import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Priority-1 Admin Authentication Test Suite (10 Scenarios)", async () => {

  test("1. Login page source contains blank initial states for email and password", () => {
    const loginPath = path.join(ROOT, "app/(auth)/login/page.tsx");
    assert.ok(fs.existsSync(loginPath), "login page must exist");
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(content.includes('const [email, setEmail] = useState("")'), "Email must default to blank");
    assert.ok(content.includes('const [password, setPassword] = useState("")'), "Password must default to blank");
  });

  test("2. Login page source contains zero demo role selection grid or mock accounts", () => {
    const loginPath = path.join(ROOT, "app/(auth)/login/page.tsx");
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(!content.includes("Test Specific Staff Role"), "Demo role header must be removed");
    assert.ok(!content.includes("setDemoRole"), "setDemoRole helper must be removed");
    assert.ok(!content.includes("1-Click Switch"), "Demo 1-click switch must be removed");
  });

  test("3. Login form includes appropriate accessibility autocomplete attributes", () => {
    const loginPath = path.join(ROOT, "app/(auth)/login/page.tsx");
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(content.includes('autoComplete="username"'), "Email autocomplete required");
    assert.ok(content.includes('autoComplete="current-password"'), "Password autocomplete required");
  });

  test("4. Safe error mapper in lib/auth/actions.ts masks internal details for invalid credentials", () => {
    const actionsPath = path.join(ROOT, "lib/auth/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("mapSafeAuthError"), "mapSafeAuthError function required");
    assert.ok(content.includes("invalid login credentials"), "Invalid credentials mapping required");
  });

  test("5. Safe error mapper handles rate limit and account disabled errors", () => {
    const actionsPath = path.join(ROOT, "lib/auth/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("too many requests") || content.includes("rate limit"), "Rate limit mapping required");
    assert.ok(content.includes("user disabled") || content.includes("user_disabled"), "User disabled mapping required");
  });

  test("6. proxy.ts checks route protection using @supabase/ssr user state without hardcoded cookie names", () => {
    const proxyPath = path.join(ROOT, "proxy.ts");
    assert.ok(fs.existsSync(proxyPath), "proxy.ts must exist");
    const content = fs.readFileSync(proxyPath, "utf8");
    assert.ok(!content.includes("sb-access-token"), "Hardcoded sb-access-token check must be removed");
    assert.ok(!content.includes("supabase-auth-token"), "Hardcoded supabase-auth-token check must be removed");
    assert.ok(content.includes("updateSession(request)"), "updateSession helper call required");
  });

  test("7. lib/supabase/middleware.ts returns refreshed response and authenticated user", () => {
    const mwPath = path.join(ROOT, "lib/supabase/middleware.ts");
    assert.ok(fs.existsSync(mwPath), "middleware.ts must exist");
    const content = fs.readFileSync(mwPath, "utf8");
    assert.ok(content.includes("createServerClient"), "@supabase/ssr createServerClient required");
    assert.ok(content.includes("supabase.auth.getUser()"), "getUser() call required");
  });

  test("8. Forgot password page uses the PKCE-safe auth callback route", () => {
    const forgotPath = path.join(ROOT, "app/(auth)/forgot-password/page.tsx");
    assert.ok(fs.existsSync(forgotPath), "forgot-password page must exist");
    const content = fs.readFileSync(forgotPath, "utf8");
    assert.ok(content.includes("resetPasswordForEmail"), "Supabase resetPasswordForEmail required");
    assert.ok(content.includes("/auth/confirm?next=/reset-password"), "PKCE recovery callback route required");
  });

  test("9. Reset password page validates a recovery session and completes the application password-change flag", () => {
    const resetPath = path.join(ROOT, "app/(auth)/reset-password/page.tsx");
    assert.ok(fs.existsSync(resetPath), "reset-password page must exist");
    const content = fs.readFileSync(resetPath, "utf8");
    assert.ok(content.includes("updateUser"), "updateUser call required");
    assert.ok(content.includes("PASSWORD_RECOVERY"), "PASSWORD_RECOVERY event handling required");
    assert.ok(content.includes("complete_current_user_password_change"), "Application password-change completion RPC required");
  });

  test("10. Recovery callback exists and rejects unsafe redirect targets", () => {
    const callbackPath = path.join(ROOT, "app/auth/confirm/page.tsx");
    assert.ok(fs.existsSync(callbackPath), "Auth recovery callback route must exist");
    const content = fs.readFileSync(callbackPath, "utf8");
    assert.ok(content.includes("exchangeCodeForSession"), "PKCE code exchange required");
    assert.ok(content.includes("startsWith(\"//\")"), "Open redirect guard required");
  });

  test("11. Public marketing pages remain accessible without proxy redirect", () => {
    const proxyPath = path.join(ROOT, "proxy.ts");
    const content = fs.readFileSync(proxyPath, "utf8");
    assert.ok(content.includes('path.startsWith("/app")'), "Protection scoped strictly to /app prefix");
  });

  test("12. Super Admin repair is forward-only and removes the insecure auth.users trigger", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20260927040000_forward_repair_auth_recovery_and_super_admin.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Forward auth/IAM repair migration must exist");
    const content = fs.readFileSync(migrationPath, "utf8");
    assert.ok(content.includes("DROP TRIGGER IF EXISTS trg_super_admin_auth_sync ON auth.users"), "Insecure auth.users trigger must be removed");
    assert.ok(content.includes("DROP FUNCTION IF EXISTS public.handle_super_admin_auth_sync()"), "Insecure auth sync function must be removed");
    assert.ok(content.includes("DROP FUNCTION IF EXISTS public.bootstrap_super_admin_account"), "Old privileged bootstrap RPC must be removed");
    assert.ok(content.includes("password_touched', FALSE"), "Repair migration must not modify passwords");
    assert.ok(!content.includes("OnneshaHospital@2026"), "No static bootstrap password may be introduced");
  });

  test("13. Recovery callback supports PKCE, OTP token hash, and hash fragment flows without automatic double consumption", () => {
    const callbackPath = path.join(ROOT, "app/auth/confirm/page.tsx");
    const content = fs.readFileSync(callbackPath, "utf8");
    assert.ok(content.includes("exchangeCodeForSession"), "PKCE exchange must be supported");
    assert.ok(content.includes("verifyOtp"), "OTP token hash must be supported");
    assert.ok(content.includes("setSession"), "Implicit hash session must be supported");
    assert.ok(content.includes("flowId ? { flowId } : undefined"), "PKCE flow ID correlation must be supported");
    assert.ok(content.includes("createRecoveryBrowserClient"), "Recovery callback must use the dedicated recovery client");
  });

  test("14. Recovery client disables automatic URL session detection because callback owns the single-use PKCE exchange", () => {
    const clientPath = path.join(ROOT, "lib/supabase/client.ts");
    const content = fs.readFileSync(clientPath, "utf8");
    assert.ok(content.includes("createRecoveryBrowserClient"), "Dedicated recovery client required");
    assert.ok(content.includes("detectSessionInUrl: false"), "Recovery client must disable automatic URL detection");
  });

  test("15. Reset page never trusts ?forced=true as an authentication bypass", () => {
    const resetPath = path.join(ROOT, "app/(auth)/reset-password/page.tsx");
    const content = fs.readFileSync(resetPath, "utf8");
    assert.ok(content.includes("supabase.auth.getUser()"), "Reset page must verify an authenticated user");
    assert.ok(content.includes("if (!hasValidSession)"), "Password update must require a verified session");
    assert.ok(!content.includes("const [hasValidSession, setHasValidSession] = useState(isForced)"), "forced query parameter must not establish a session");
    assert.ok(!content.includes('from("profiles")'), "Client must not use a direct profile-table fallback to mark completion");
  });
});

