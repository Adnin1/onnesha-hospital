import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("OHMS System & Database Autonomous Health Diagnostic Engine Certification", async (t) => {
  // 1. Migrations 181-186 Integrity & Hardening
  await t.test("1. Migration 181-186 files exist and provide hardened RLS & 10-point health check RPC", () => {
    const mig181 = path.join(ROOT, "supabase/migrations/20261014030000_system_health_and_database_diagnostic_engine.sql");
    const mig182 = path.join(ROOT, "supabase/migrations/20261014030500_system_health_diagnostics_update.sql");
    const mig183 = path.join(ROOT, "supabase/migrations/20261014031000_reconcile_referral_commission_row_allocations.sql");
    const mig184 = path.join(ROOT, "supabase/migrations/20261014040000_fix_beds_ward_name_and_runtime_diagnostics.sql");
    const mig185 = path.join(ROOT, "supabase/migrations/20261014040500_sync_beds_and_prioritize_org.sql");
    const mig186 = path.join(ROOT, "supabase/migrations/20261014041000_harden_diagnostics_security_and_system_checks.sql");

    assert.ok(fs.existsSync(mig181), "Migration 181 must exist");
    assert.ok(fs.existsSync(mig182), "Migration 182 must exist");
    assert.ok(fs.existsSync(mig183), "Migration 183 must exist");
    assert.ok(fs.existsSync(mig184), "Migration 184 must exist");
    assert.ok(fs.existsSync(mig185), "Migration 185 must exist");
    assert.ok(fs.existsSync(mig186), "Migration 186 must exist");

    const content186 = fs.readFileSync(mig186, "utf8");

    // RLS and security hardening
    assert.match(content186, /CREATE POLICY rls_system_health_issues_log_select ON public\.system_health_issues_log/i);
    assert.match(content186, /REVOKE ALL ON public\.system_health_issues_log FROM anon/i);
    assert.match(content186, /PUBLIC_PORTAL_SAFE_STANDBY/i);
    assert.match(content186, /PATIENT_INTAKE_ADMISSION_INTEGRITY_VERIFIED/i);
    assert.match(content186, /delete_invoice_super_admin_atomic/i);
  });

  // 2. Diagnostics Server Action & Troubleshooter Layer
  await t.test("2. lib/diagnostics provides actions, global monitoring and troubleshooter with structured types", () => {
    const actionPath = path.join(ROOT, "lib/diagnostics/actions.ts");
    assert.ok(fs.existsSync(actionPath), "lib/diagnostics/actions.ts must exist");
    const content = fs.readFileSync(actionPath, "utf8");

    assert.match(content, /export async function getSystemHealthDiagnosticsAction/);
    assert.match(content, /export async function logSystemRuntimeIssueAction/);
    assert.match(content, /export async function resolveSystemRuntimeIssueAction/);
    assert.match(content, /export interface SystemHealthIssue/);
    assert.match(content, /export interface SystemHealthDiagnosticResult/);

    const troubleshooterPath = path.join(ROOT, "lib/diagnostics/troubleshooter.ts");
    assert.ok(fs.existsSync(troubleshooterPath), "lib/diagnostics/troubleshooter.ts must exist");
    const tbContent = fs.readFileSync(troubleshooterPath, "utf8");
    assert.match(tbContent, /export async function reportSystemRuntimeIncident/);
    assert.match(tbContent, /export async function resolveSystemRuntimeIncident/);
    assert.match(tbContent, /export function setupGlobalErrorMonitoring/);
  });

  // 3. UI Component Integration & Dedicated Dashboard Page
  await t.test("3. SystemHealthAlertBanner and dedicated system-health dashboard page are fully integrated", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    assert.ok(fs.existsSync(bannerPath), "components/app/SystemHealthAlertBanner.tsx must exist");
    const bannerContent = fs.readFileSync(bannerPath, "utf8");

    assert.match(bannerContent, /SystemHealthAlertBanner/);
    assert.match(bannerContent, /system-health-incident-reported/);
    assert.match(bannerContent, /system-health-incident-resolved/);
    assert.match(bannerContent, /সমস্যা সমাধান সম্পন্ন/);
    assert.match(bannerContent, /সমাধান যাচাই করে incident resolve করুন/);

    const headerPath = path.join(ROOT, "components/app/HospitalHeader.tsx");
    const headerContent = fs.readFileSync(headerPath, "utf8");
    assert.match(headerContent, /<SystemHealthAlertBanner variant="badge"/);

    const layoutPath = path.join(ROOT, "app/(hospital)/app/layout.tsx");
    const layoutContent = fs.readFileSync(layoutPath, "utf8");
    assert.match(layoutContent, /<SystemHealthAlertBanner variant="banner"/);

    const pagePath = path.join(ROOT, "app/(hospital)/app/system-health/page.tsx");
    assert.ok(fs.existsSync(pagePath), "app/(hospital)/app/system-health/page.tsx must exist");
    const pageContent = fs.readFileSync(pagePath, "utf8");
    assert.match(pageContent, /স্বয়ংক্রিয় সিস্টেম ও ডেটাবেজ স্বাস্থ্য নিরীক্ষা ইঞ্জিন/);
    assert.match(pageContent, /১০-দফা পূর্ণাঙ্গ সিস্টেম ও ডেটাবেজ অডিট চেকলিস্ট/);
  });

  // 4. Critical Application Mutations Wired to Troubleshooter
  await t.test("4. Bed, patient, billing, and referral actions are wired to report and resolve incidents", () => {
    const bedActionsPath = path.join(ROOT, "lib/ipd/bed-actions.ts");
    const bedContent = fs.readFileSync(bedActionsPath, "utf8");
    assert.match(bedContent, /reportSystemRuntimeIncident/);
    assert.match(bedContent, /resolveSystemRuntimeIncident/);

    const patientActionsPath = path.join(ROOT, "lib/patient/actions.ts");
    const patientContent = fs.readFileSync(patientActionsPath, "utf8");
    assert.match(patientContent, /reportSystemRuntimeIncident/);
    assert.match(patientContent, /resolveSystemRuntimeIncident/);

    const billingActionsPath = path.join(ROOT, "lib/billing/actions.ts");
    const billingContent = fs.readFileSync(billingActionsPath, "utf8");
    assert.match(billingContent, /reportSystemRuntimeIncident/);
    assert.match(billingContent, /resolveSystemRuntimeIncident/);

    const referralActionsPath = path.join(ROOT, "lib/referrals/actions.ts");
    const referralContent = fs.readFileSync(referralActionsPath, "utf8");
    assert.match(referralContent, /reportSystemRuntimeIncident/);
    assert.match(referralContent, /resolveSystemRuntimeIncident/);
  });

  // 5. Remote Database Live Diagnostics
  await t.test("5. Anonymous diagnostic access is fail-closed and never reports a private database as healthy", async () => {
    const envPath = path.join(ROOT, ".env.local");
    if (!fs.existsSync(envPath)) return;

    const envContent = fs.readFileSync(envPath, "utf8");
    const env = {};
    envContent.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = match[2] || "";
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[match[1]] = val;
      }
    });

    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    // The hermetic build uses deliberately unreachable placeholder credentials.
    // Treat that environment as NOT_RUN; do not assert a live database permission result.
    if (
      url.includes("ci-hermetic-build-placeholder") ||
      key.includes("placeholder_key_not_a_real_credential")
    ) {
      return;
    }

    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Private diagnostic RPC execution itself must be denied to anonymous callers.
    // The browser action independently maps failed health reads to a degraded UNKNOWN state.
    const { data: initData, error: initErr } = await client.rpc("check_system_health_diagnostics");
    assert.ok(initErr, "Anonymous caller must not execute private health diagnostics");
    assert.equal(initData, null, "Denied private diagnostics must not disclose a health payload");
    assert.match(String(initErr.message || initErr.code || ""), /permission|execute|not allowed|unauthorized/i);
  });
});
