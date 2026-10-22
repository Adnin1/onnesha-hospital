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
  assert.equal(page.includes("isAuditUnavailable ? true : Boolean(data?.passed_checks.includes(key))"), false);
  assert.match(page, /healthy বা passed হিসেবে গণ্য করা হচ্ছে না/);
  assert.match(page, /\{data\?\.passed_checks\.length \|\| 0\} \/ 10 উত্তীর্ণ/);
});


test("all privileged health paths fail closed without hard-coded tenant fallback", () => {
  const source = fs.readFileSync("lib/diagnostics/actions.ts", "utf8");
  assert.equal(source.includes("a0000000-0000-0000-0000-000000000001"), false);

  for (const fnName of [
    "logSystemRuntimeIssueAction",
    "resolveSystemRuntimeIssueAction",
    "getAuthoritativeSystemHealthAction",
    "getSystemHealthDetectorRegistryAction",
    "reconcileBedVacancyAction",
  ]) {
    const fnStart = source.indexOf(`export async function ${fnName}`);
    assert.ok(fnStart >= 0, `missing ${fnName}`);
    const nextFn = source.indexOf("\nexport async function ", fnStart + 10);
    const body = source.slice(fnStart, nextFn >= 0 ? nextFn : source.length);
    const session = body.indexOf("await getCurrentUserSession()");
    const client = body.indexOf("createClient()");
    assert.ok(session >= 0, `${fnName} must resolve authenticated session`);
    assert.ok(client < 0 || session < client, `${fnName} must resolve auth before creating Supabase client`);
  }
});
