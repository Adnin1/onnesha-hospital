import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("OHMS System & Database Autonomous Health Diagnostic Engine Certification", async (t) => {
  // 1. Diagnostic and tenant-security migrations
  await t.test("1. Migration 181-186 files exist and secure health monitoring and incident RPCs", () => {
    const mig181 = path.join(ROOT, "supabase/migrations/20261014030000_system_health_and_database_diagnostic_engine.sql");
    const mig182 = path.join(ROOT, "supabase/migrations/20261014030500_system_health_diagnostics_update.sql");
    const mig183 = path.join(ROOT, "supabase/migrations/20261014031000_reconcile_referral_commission_row_allocations.sql");
    const mig184 = path.join(ROOT, "supabase/migrations/20261014040000_fix_beds_ward_name_and_runtime_diagnostics.sql");
    const mig186 = path.join(ROOT, "supabase/migrations/20261014050000_secure_runtime_diagnostics_and_scoped_incidents.sql");

    assert.ok(fs.existsSync(mig181), "Migration 181 must exist");
    assert.ok(fs.existsSync(mig182), "Migration 182 must exist");
    assert.ok(fs.existsSync(mig183), "Migration 183 must exist");
    assert.ok(fs.existsSync(mig184), "Migration 184 must exist");
    assert.ok(fs.existsSync(mig186), "Migration 186 must exist");

    const content184 = fs.readFileSync(mig184, "utf8");
    const content186 = fs.readFileSync(mig186, "utf8");

    // Beds schema fix and trigger
    assert.match(content184, /ALTER TABLE public\.beds ALTER COLUMN ward_name DROP NOT NULL/i);
    assert.match(content184, /CREATE OR REPLACE FUNCTION public\.trg_beds_auto_populate_ward_name/i);
    assert.match(content184, /CREATE TABLE IF NOT EXISTS public\.system_health_issues_log/i);
    assert.match(content184, /CREATE OR REPLACE FUNCTION public\.log_system_runtime_issue/i);
    assert.match(content184, /CREATE OR REPLACE FUNCTION public\.resolve_system_runtime_issue/i);
    assert.match(content184, /BED_WARD_INVENTORY_INTEGRITY_VERIFIED/i);
    assert.match(content184, /SYSTEM_RUNTIME_INCIDENTS_ZERO/i);

    // Migration 186 must remove anonymous full-table access and guard privileged RPCs.
    assert.match(content186, /REVOKE ALL PRIVILEGES ON TABLE public\.system_health_issues_log FROM PUBLIC, anon/i);
    assert.match(content186, /check_system_health_diagnostics_for_current_org/i);
    assert.match(content186, /Active organization membership is required/i);
    assert.match(content186, /Administrative permission is required/i);
    assert.match(content186, /WHEN p_issue_id IS NOT NULL THEN id = p_issue_id/i);
  });

  // 2. Diagnostics Server Action & Troubleshooter Layer
  await t.test("2. lib/diagnostics provides actions and troubleshooter with structured types", () => {
    const actionPath = path.join(ROOT, "lib/diagnostics/actions.ts");
    assert.ok(fs.existsSync(actionPath), "lib/diagnostics/actions.ts must exist");
    const content = fs.readFileSync(actionPath, "utf8");

    assert.match(content, /export async function getSystemHealthDiagnosticsAction/);
    assert.match(content, /export async function logSystemRuntimeIssueAction/);
    assert.match(content, /export async function resolveSystemRuntimeIssueAction/);
    assert.match(content, /export interface SystemHealthIssue/);
    assert.match(content, /export interface SystemHealthDiagnosticResult/);
    assert.match(content, /check_system_health_diagnostics_for_current_org/);
    assert.match(content, /DIAGNOSTIC_EMPTY_RESPONSE/);
    assert.doesNotMatch(content, /is_healthy: true,[\s\S]{0,120}health_score: 100,[\s\S]{0,120}DEFAULT_HEALTHY/);

    const troubleshooterPath = path.join(ROOT, "lib/diagnostics/troubleshooter.ts");
    assert.ok(fs.existsSync(troubleshooterPath), "lib/diagnostics/troubleshooter.ts must exist");
    const tbContent = fs.readFileSync(troubleshooterPath, "utf8");
    assert.match(tbContent, /export async function reportSystemRuntimeIncident/);
    assert.match(tbContent, /export async function resolveSystemRuntimeIncident/);
  });

  // 3. UI Component Integration
  await t.test("3. SystemHealthAlertBanner is mounted with real-time events and resolve button", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    assert.ok(fs.existsSync(bannerPath), "components/app/SystemHealthAlertBanner.tsx must exist");
    const bannerContent = fs.readFileSync(bannerPath, "utf8");

    assert.match(bannerContent, /SystemHealthAlertBanner/);
    assert.match(bannerContent, /system-health-incident-reported/);
    assert.match(bannerContent, /system-health-incident-resolved/);
    assert.match(bannerContent, /সমাধান হিসেবে চিহ্নিত করুন ও পুনঃপরীক্ষা/);
    assert.match(bannerContent, /স্বয়ংক্রিয় সিস্টেম ও ডেটাবেজ স্বাস্থ্য নিরীক্ষা/);

    const headerPath = path.join(ROOT, "components/app/HospitalHeader.tsx");
    const headerContent = fs.readFileSync(headerPath, "utf8");
    assert.match(headerContent, /<SystemHealthAlertBanner variant="badge"/);

    const layoutPath = path.join(ROOT, "app/(hospital)/app/layout.tsx");
    const layoutContent = fs.readFileSync(layoutPath, "utf8");
    assert.match(layoutContent, /<SystemHealthAlertBanner variant="banner"/);
    assert.match(layoutContent, /<RuntimeErrorMonitor\s*\/>/);

    const runtimeMonitorPath = path.join(ROOT, "components/app/RuntimeErrorMonitor.tsx");
    assert.ok(fs.existsSync(runtimeMonitorPath), "Global runtime monitor must exist");
    const runtimeMonitorContent = fs.readFileSync(runtimeMonitorPath, "utf8");
    assert.match(runtimeMonitorContent, /unhandledrejection/);
    assert.match(runtimeMonitorContent, /reportSystemRuntimeIncident/);

    const expensesActionPath = path.join(ROOT, "lib/expenses/actions.ts");
    const expensesActionContent = fs.readFileSync(expensesActionPath, "utf8");
    assert.match(expensesActionContent, /EXPENSE_VOID_POSTCONDITION_FAILED/);
    assert.match(expensesActionContent, /rpcResult\.success !== true/);
    assert.match(expensesActionContent, /reportSystemRuntimeIncident/);

    const monitorScriptPath = path.join(ROOT, "scripts/monitor-production.mjs");
    assert.ok(fs.existsSync(monitorScriptPath), "Scheduled production monitor script must exist");
    const workflowPath = path.join(ROOT, ".github/workflows/ohms-production-monitor.yml");
    assert.ok(fs.existsSync(workflowPath), "Scheduled production monitor workflow must exist");
  });

  // 4. Remote Database Live Diagnostics & Incident Lifecycle
  await t.test("4. Remote database RPC returns 100% health, detects incidents, and recovers upon resolution", async () => {
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

    const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    // Live mutating diagnostic tests must never run through the anonymous key.
    if (!url || !key) return;

    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: initData, error: initErr } = await client.rpc("check_system_health_diagnostics");
    assert.ifError(initErr);
    assert.ok(initData && typeof initData.is_healthy === "boolean", "Diagnostic engine must return a valid health result");
    assert.ok(Array.isArray(initData.issues), "Diagnostic result must contain its observed issues");

    const orgId = initData.organization_id;
    assert.ok(orgId, "Service-role diagnostic result must resolve an organization");
    const baselineIssueIds = new Set(initData.issues.map((i) => String(i.id)));
    const baselineTotal = Number(initData.total_issues || 0);
    const baselineHealthScore = Number(initData.health_score);
    const baselineHealthy = initData.is_healthy;

    let issueId = null;
    try {
      // The test deliberately injects one diagnostic-only incident, then verifies it is persisted and detected.
      const { data, error } = await client.rpc("log_system_runtime_issue", {
        p_org_id: orgId,
        p_module: "DIAGNOSTICS_REGRESSION_TEST",
        p_location: "tests/system-health-diagnostics.test.mjs",
        p_severity: "CRITICAL",
        p_error_code: "SIMULATED_TEST_ERROR",
        p_title: "Automated diagnostic regression test",
        p_reason: "Synthetic test-only incident; no patient data.",
        p_recommendation: "Resolve this temporary test incident after verification.",
      });
      assert.ifError(error);
      assert.ok(data, "Incident writer must return an incident ID");
      issueId = data;

      const { data: incidentData, error: incidentError } = await client.rpc("check_system_health_diagnostics", {
        p_org_id: orgId,
      });
      assert.ifError(incidentError);
      assert.ok(incidentData.issues.some((i) => String(i.id) === String(issueId)), "New incident must be immediately visible");
      assert.ok(Number(incidentData.total_issues) >= baselineTotal + 1, "Issue total must increase while test incident is active");
    } finally {
      if (issueId) {
        const { data: resolvedCount, error: resolveError } = await client.rpc("resolve_system_runtime_issue", {
          p_org_id: orgId,
          p_issue_id: issueId,
        });
        assert.ifError(resolveError);
        assert.equal(resolvedCount, 1, "Only the temporary test incident must be resolved");
      }
    }

    const { data: finalData, error: finalError } = await client.rpc("check_system_health_diagnostics", {
      p_org_id: orgId,
    });
    assert.ifError(finalError);
    assert.ok(finalData && typeof finalData.is_healthy === "boolean", "Final health state must be valid");
    assert.equal(Number(finalData.total_issues || 0), baselineTotal, "Resolving the test incident must restore the baseline issue count");
    assert.equal(Number(finalData.health_score), baselineHealthScore, "Resolving the test incident must restore the baseline score");
    assert.equal(finalData.is_healthy, baselineHealthy, "Resolving the test incident must restore the baseline health state");
    assert.equal(finalData.issues.some((i) => String(i.id) === String(issueId)), false, "Resolved test incident must disappear from active alerts");
    assert.ok([...baselineIssueIds].every((id) => finalData.issues.some((i) => String(i.id) === id)), "Pre-existing issues must remain visible, not be hidden by the test");
  });
});
