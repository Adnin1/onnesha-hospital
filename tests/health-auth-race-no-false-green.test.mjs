import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("privileged health diagnostics resolve auth before creating the RPC client", () => {
  const source = fs.readFileSync("lib/diagnostics/actions.ts", "utf8");
  const fnStart = source.indexOf("export async function getSystemHealthDiagnosticsAction");
  const rpc = source.indexOf('supabase.rpc("check_system_health_diagnostics"', fnStart);
  const session = source.indexOf("await getCurrentUserSession()", fnStart);
  const client = source.indexOf("const supabase = createClient()", fnStart);
  assert.ok(fnStart >= 0 && session > fnStart && client > session && rpc > client);
  assert.match(source, /status: "AUDIT_UNAUTHORIZED"/);
  assert.match(source, /error: "AUTHENTICATION_REQUIRED"/);
});

test("system health UI never converts unaudited state into a fake healthy score", () => {
  const page = fs.readFileSync("app/(hospital)/app/system-health/page.tsx", "utf8");
  assert.match(page, /const isAuditUnavailable/);
  assert.match(page, /লাইভ ডায়াগনস্টিক যাচাই সম্পন্ন হয়নি/);
  assert.equal(page.includes("isAnonymousSecurityShield"), false);
  assert.equal(page.includes("? 10 : (data ? data.passed_checks.length : 0)"), false);
});
