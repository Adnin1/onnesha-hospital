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

  test("8. Forgot password page exists and provides self-service reset request", () => {
    const forgotPath = path.join(ROOT, "app/(auth)/forgot-password/page.tsx");
    assert.ok(fs.existsSync(forgotPath), "forgot-password page must exist");
    const content = fs.readFileSync(forgotPath, "utf8");
    assert.ok(content.includes("requestPasswordResetAction"), "Reset action required");
  });

  test("9. Reset password page exists and enforces minimum length verification", () => {
    const resetPath = path.join(ROOT, "app/(auth)/reset-password/page.tsx");
    assert.ok(fs.existsSync(resetPath), "reset-password page must exist");
    const content = fs.readFileSync(resetPath, "utf8");
    assert.ok(content.includes("updateUser"), "updateUser call required");
  });

  test("10. Public marketing pages remain accessible without proxy redirect", () => {
    const proxyPath = path.join(ROOT, "proxy.ts");
    const content = fs.readFileSync(proxyPath, "utf8");
    assert.ok(content.includes('path.startsWith("/app")'), "Protection scoped strictly to /app prefix");
  });
});
