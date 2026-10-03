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
    assert.ok(content.includes("/auth/confirm"), "PKCE recovery callback route required");
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

  test("16. Password completion RPC migration enforces SECURITY DEFINER, search_path='', and authenticated grant", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20260927050000_complete_password_change_rpc.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Password completion migration must exist");
    const content = fs.readFileSync(migrationPath, "utf8");
    assert.ok(content.includes("CREATE OR REPLACE FUNCTION public.complete_current_user_password_change()"), "Function definition required");
    assert.ok(content.includes("SECURITY DEFINER"), "Must be SECURITY DEFINER");
    assert.ok(content.includes("SET search_path = ''"), "Must set search_path = ''");
    assert.ok(content.includes("auth.uid()"), "Must bind caller to auth.uid()");
    assert.ok(content.includes("REVOKE ALL ON FUNCTION public.complete_current_user_password_change() FROM PUBLIC"), "Must revoke from PUBLIC");
    assert.ok(content.includes("GRANT EXECUTE ON FUNCTION public.complete_current_user_password_change() TO authenticated"), "Must grant to authenticated");
  });

  test("17. Login form email input enforces autoCapitalize='none', autoCorrect='off', spellCheck={false}, and lowercase trimming", () => {
    const loginPath = path.join(ROOT, "app/(auth)/login/page.tsx");
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(content.includes('autoCapitalize="none"'), "autoCapitalize='none' required to prevent uppercase mobile emails");
    assert.ok(content.includes('autoCorrect="off"'), "autoCorrect='off' required to prevent dictionary auto-corrections");
    assert.ok(content.includes("spellCheck={false}"), "spellCheck={false} required");
    assert.ok(content.includes("email.trim().toLowerCase()"), "email.trim().toLowerCase() required on submission");
  });

  test("18. Login form provides password visibility toggle for mobile input assurance", () => {
    const loginPath = path.join(ROOT, "app/(auth)/login/page.tsx");
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(content.includes("showPassword"), "showPassword state required");
    assert.ok(content.includes("setShowPassword"), "setShowPassword toggle required");
    assert.ok(content.includes("Eye") && content.includes("EyeOff"), "Eye and EyeOff icons required");
  });

  test("19. Cloudflare _redirects contains explicit 302 rules mapping /admin and /admin/login to /login", () => {
    const redirectsPath = path.join(ROOT, "public/_redirects");
    assert.ok(fs.existsSync(redirectsPath), "public/_redirects must exist");
    const content = fs.readFileSync(redirectsPath, "utf8");
    assert.ok(content.includes("/admin           /login          302"), "/admin redirect required");
    assert.ok(content.includes("/admin/login     /login          302"), "/admin/login redirect required");
  });

  test("20. verify-admin-account script exists and validates 9 core IAM integrity invariants", () => {
    const scriptPath = path.join(ROOT, "scripts/verify-admin-account.mjs");
    assert.ok(fs.existsSync(scriptPath), "scripts/verify-admin-account.mjs must exist");
    const content = fs.readFileSync(scriptPath, "utf8");
    assert.ok(content.includes("1. User exists in auth.users"), "auth.users check required");
    assert.ok(content.includes("2. Email is confirmed"), "email confirmed check required");
    assert.ok(content.includes("3. User is not banned"), "banned check required");
    assert.ok(content.includes("4. Profile exists in public.profiles"), "profile check required");
    assert.ok(content.includes("5. Profile is active"), "active status check required");
    assert.ok(content.includes("6. Organization ID is bound"), "org ID check required");
    assert.ok(content.includes("7. No forced password change barrier"), "forced password barrier check required");
    assert.ok(content.includes("8. Super Admin role assigned"), "super_admin role check required");
    assert.ok(content.includes("9. Employee record active"), "active employee check required");
  });

  test("21. Admin tooling enforces strict fail-closed policy with zero CLI key reveal fallback and zero default passwords", () => {
    const createScript = fs.readFileSync(path.join(ROOT, "scripts/create_admin.mjs"), "utf8");
    const verifyScript = fs.readFileSync(path.join(ROOT, "scripts/verify-admin-account.mjs"), "utf8");

    // Zero CLI reveal fallback
    assert.ok(!createScript.includes("--reveal"), "create_admin.mjs must not contain --reveal CLI key extraction");
    assert.ok(!verifyScript.includes("--reveal"), "verify-admin-account.mjs must not contain --reveal CLI key extraction");

    // Zero hardcoded default passwords
    assert.ok(!createScript.includes('targetPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "'), "create_admin.mjs must not have a default password fallback");

    // Fail-closed enforcement
    assert.ok(createScript.includes("FAIL-CLOSED: SUPABASE_SERVICE_ROLE_KEY environment variable is required"), "create_admin.mjs must fail closed without service key");
    assert.ok(verifyScript.includes("BLOCKED — Privileged verification credentials unavailable"), "verify-admin-account.mjs must fail closed without service key");
  });
});

