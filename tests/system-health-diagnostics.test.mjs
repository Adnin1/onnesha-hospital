import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("OHMS System & Database Autonomous Health Diagnostic Engine Certification", async (t) => {
  // 1. Migration 181, 182, 183, 184 Integrity
  await t.test("1. Migration 181/182/183/184 files exist and provide authoritative health check RPC & triggers", () => {
    const mig181 = path.join(ROOT, "supabase/migrations/20261014030000_system_health_and_database_diagnostic_engine.sql");
    const mig182 = path.join(ROOT, "supabase/migrations/20261014030500_system_health_diagnostics_update.sql");
    const mig183 = path.join(ROOT, "supabase/migrations/20261014031000_reconcile_referral_commission_row_allocations.sql");
    const mig184 = path.join(ROOT, "supabase/migrations/20261014040000_fix_beds_ward_name_and_runtime_diagnostics.sql");

    assert.ok(fs.existsSync(mig181), "Migration 181 must exist");
    assert.ok(fs.existsSync(mig182), "Migration 182 must exist");
    assert.ok(fs.existsSync(mig183), "Migration 183 must exist");
    assert.ok(fs.existsSync(mig184), "Migration 184 must exist");

    const content184 = fs.readFileSync(mig184, "utf8");

    // Beds schema fix and trigger
    assert.match(content184, /ALTER TABLE public\.beds ALTER COLUMN ward_name DROP NOT NULL/i);
    assert.match(content184, /CREATE OR REPLACE FUNCTION public\.trg_beds_auto_populate_ward_name/i);
    assert.match(content184, /CREATE TABLE IF NOT EXISTS public\.system_health_issues_log/i);
    assert.match(content184, /CREATE OR REPLACE FUNCTION public\.log_system_runtime_issue/i);
    assert.match(content184, /CREATE OR REPLACE FUNCTION public\.resolve_system_runtime_issue/i);
    assert.match(content184, /BED_WARD_INVENTORY_INTEGRITY_VERIFIED/i);
    assert.match(content184, /SYSTEM_RUNTIME_INCIDENTS_ZERO/i);
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

    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const client = createClient(url, key);

    // Initial check: must be 100% healthy
    const { data: initData, error: initErr } = await client.rpc("check_system_health_diagnostics");
    assert.ifError(initErr);
    assert.ok(initData, "Diagnostic data must be returned");
    assert.equal(initData.is_healthy, true, "Database and system must initially be healthy");
    assert.equal(initData.health_score, 100, "Health score must be 100");
    assert.equal(initData.total_issues, 0, "There must be 0 active issues");

    assert.ok(initData.passed_checks.includes("GENERAL_LEDGER_DOUBLE_ENTRY_BALANCED"));
    assert.ok(initData.passed_checks.includes("BED_OCCUPANCY_SYNCHRONIZED"));
    assert.ok(initData.passed_checks.includes("BED_WARD_INVENTORY_INTEGRITY_VERIFIED"));
    assert.ok(initData.passed_checks.includes("SYSTEM_RUNTIME_INCIDENTS_ZERO"));

    const orgId = initData.organization_id || "6b78e524-b1e3-4c43-8944-1a5a0248bff8";

    // Lifecycle step 1: Log simulated runtime error
    const { data: issueId, error: logErr } = await client.rpc("log_system_runtime_issue", {
      p_org_id: orgId,
      p_module: "BED_MANAGEMENT_TEST",
      p_location: "tests/system-health-diagnostics.test.mjs",
      p_severity: "CRITICAL",
      p_error_code: "SIMULATED_TEST_ERROR",
      p_title: "অটো-ডিটেক্টেড টেস্ট ত্রুটি",
      p_reason: "সিস্টেম টেস্টের জন্য তৈরি সিমুলেটেড ত্রুটি",
      p_recommendation: "রিসলভ আরপিসি টেস্ট করুন",
    });
    assert.ifError(logErr);
    assert.ok(issueId, "Issue ID must be returned");

    // Lifecycle step 2: Diagnostics MUST detect the incident immediately
    const { data: incidentData, error: incErr } = await client.rpc("check_system_health_diagnostics", {
      p_org_id: orgId,
    });
    assert.ifError(incErr);
    assert.equal(incidentData.is_healthy, false, "System must report unhealthy while incident active");
    assert.ok(incidentData.health_score < 100, "Health score must drop below 100");
    assert.ok(incidentData.critical_count >= 1, "Critical count must be at least 1");
    assert.ok(incidentData.issues.some((i) => i.id === issueId), "Simulated incident must be present in issues");

    // Lifecycle step 3: Resolve the incident
    const { data: resCount, error: resErr } = await client.rpc("resolve_system_runtime_issue", {
      p_org_id: orgId,
      p_issue_id: issueId,
    });
    assert.ifError(resErr);
    assert.equal(resCount, 1, "1 issue must be resolved");

    // Lifecycle step 4: Diagnostics MUST immediately clear back to 100% healthy
    const { data: clearData, error: clearErr } = await client.rpc("check_system_health_diagnostics", {
      p_org_id: orgId,
    });
    assert.ifError(clearErr);
    assert.equal(clearData.is_healthy, true, "System must recover to healthy after resolution");
    assert.equal(clearData.health_score, 100, "Health score must be restored to 100");
    assert.equal(clearData.total_issues, 0, "Active issues must be 0");
    assert.ok(clearData.passed_checks.includes("SYSTEM_RUNTIME_INCIDENTS_ZERO"));
  });
});
