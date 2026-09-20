import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Session Security, Cookie Handling & Secrets Hygiene Test Suite (10 Scenarios)", async () => {

  test("1. lib/supabase/server.ts uses @supabase/ssr createServerClient with next/headers cookie store", () => {
    const serverPath = path.join(ROOT, "lib/supabase/server.ts");
    assert.ok(fs.existsSync(serverPath), "server.ts must exist");
    const content = fs.readFileSync(serverPath, "utf8");
    assert.ok(content.includes('from "@supabase/ssr"'), "@supabase/ssr import required");
    assert.ok(content.includes("await cookies()"), "Next.js cookies() helper required");
  });

  test("2. lib/supabase/client.ts uses @supabase/ssr createBrowserClient", () => {
    const clientPath = path.join(ROOT, "lib/supabase/client.ts");
    assert.ok(fs.existsSync(clientPath), "client.ts must exist");
    const content = fs.readFileSync(clientPath, "utf8");
    assert.ok(content.includes("createBrowserClient"), "createBrowserClient required");
  });

  test("3. lib/supabase/middleware.ts implements cookie get, set, and remove handlers", () => {
    const mwPath = path.join(ROOT, "lib/supabase/middleware.ts");
    const content = fs.readFileSync(mwPath, "utf8");
    assert.ok(content.includes("get("), "cookie get handler required");
    assert.ok(content.includes("set("), "cookie set handler required");
    assert.ok(content.includes("remove("), "cookie remove handler required");
  });

  test("4. Zero hardcoded passwords or pre-filled demo accounts in app/(auth)/login/page.tsx", () => {
    const loginPath = path.join(ROOT, "app/(auth)/login/page.tsx");
    const content = fs.readFileSync(loginPath, "utf8");
    assert.ok(!content.includes('useState("admin@onneshahospital.com")'), "No hardcoded admin email state");
    assert.ok(!content.includes('useState("••••••••")'), "No hardcoded password state");
  });

  test("5. Zero embedded Supabase service_role keys in client source files", () => {
    const clientFile = fs.readFileSync(path.join(ROOT, "lib/supabase/client.ts"), "utf8");
    const browserFile = fs.readFileSync(path.join(ROOT, "lib/supabase/browser.ts"), "utf8");
    assert.ok(!clientFile.includes("service_role"), "No service role key in client.ts");
    assert.ok(!browserFile.includes("service_role"), "No service role key in browser.ts");
  });

  test("6. public/_headers file enforces HSTS and X-Frame-Options", () => {
    const headersPath = path.join(ROOT, "public/_headers");
    assert.ok(fs.existsSync(headersPath), "_headers file must exist");
    const content = fs.readFileSync(headersPath, "utf8");
    assert.ok(content.includes("Strict-Transport-Security"), "HSTS header required");
    assert.ok(content.includes("X-Frame-Options"), "X-Frame-Options header required");
  });

  test("7. public/_headers file denies indexing of private /app/* routes", () => {
    const headersPath = path.join(ROOT, "public/_headers");
    const content = fs.readFileSync(headersPath, "utf8");
    assert.ok(content.includes("X-Robots-Tag: noindex, nofollow"), "noindex header required for private paths");
  });

  test("8. lib/auth/actions.ts uses canonical site URL fallback for password reset redirection", () => {
    const actionsPath = path.join(ROOT, "lib/auth/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("onneshahospital.com"), "Canonical site URL required in auth actions");
  });

  test("9. logoutAction signs out session and redirects to /login", () => {
    const actionsPath = path.join(ROOT, "lib/auth/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("auth.signOut()"), "signOut call required");
    assert.ok(content.includes('redirect("/login")'), "Redirect to /login required");
  });

  test("10. proxy.ts redirects unauthenticated requests on /app to /login", () => {
    const proxyPath = path.join(ROOT, "proxy.ts");
    const content = fs.readFileSync(proxyPath, "utf8");
    assert.ok(content.includes('NextResponse.redirect(new URL("/login", request.url))'), "Redirect to /login required");
  });
});
