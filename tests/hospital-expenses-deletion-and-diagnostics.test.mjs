import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("OHMS Hospital Expenses Atomic Deletion, Void Reversal & 24/7 Diagnostics Certification", async (t) => {
  // 1. Migration 187 Integrity & Hardening
  await t.test("1. Migration 187 exists and defines atomic expense deletion and GL reversal RPCs", () => {
    const mig187Path = path.join(ROOT, "supabase/migrations/20261014050000_harden_expenses_deletion_voiding_and_diagnostics.sql");
    assert.ok(fs.existsSync(mig187Path), "Migration 187 file must exist");
    const content = fs.readFileSync(mig187Path, "utf8");

    // RPC presence
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.delete_hospital_expense_super_admin_atomic/i);
    assert.match(content, /GRANT EXECUTE ON FUNCTION public\.void_hospital_expense_atomic/i);

    // Security & Invariants
    assert.match(content, /REVOKE ALL ON FUNCTION public\.delete_hospital_expense_super_admin_atomic.*FROM PUBLIC, anon/i);
    assert.match(content, /GRANT EXECUTE ON FUNCTION public\.delete_hospital_expense_super_admin_atomic.*TO authenticated, service_role/i);
    assert.match(content, /post_journal_entry_atomic/i, "Must trigger balanced GL reversal for posted vouchers");
    assert.match(content, /app\.override_journal_immutability/i, "Must use transaction-local override for permanent purge");
  });

  // 2. Expenses Server Actions Layer
  await t.test("2. lib/expenses/actions.ts exports deleteExpenseAction and diagnostic reporting", () => {
    const actionsPath = path.join(ROOT, "lib/expenses/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/expenses/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /export async function deleteExpenseAction/);
    assert.match(content, /delete_hospital_expense_super_admin_atomic/);
    assert.match(content, /reportSystemRuntimeIncident/);
    assert.match(content, /resolveSystemRuntimeIncident/);
  });

  // 3. Bed Actions Layer Incident Diagnostics
  await t.test("3. lib/ipd/bed-actions.ts reports and resolves diagnostic incidents on bed operations", () => {
    const bedActionsPath = path.join(ROOT, "lib/ipd/bed-actions.ts");
    assert.ok(fs.existsSync(bedActionsPath), "lib/ipd/bed-actions.ts must exist");
    const content = fs.readFileSync(bedActionsPath, "utf8");

    assert.match(content, /reportSystemRuntimeIncident/);
    assert.match(content, /resolveSystemRuntimeIncident/);
    assert.match(content, /Inpatient Beds & Cabins/);
  });

  // 4. Reactive Health Alert Banner Integration
  await t.test("4. SystemHealthAlertBanner supports ephemeral real-time incidents and resolution state", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    assert.ok(fs.existsSync(bannerPath), "components/app/SystemHealthAlertBanner.tsx must exist");
    const content = fs.readFileSync(bannerPath, "utf8");

    assert.match(content, /ephemeralIssues/);
    assert.match(content, /system-health-incident-reported/);
    assert.match(content, /system-health-incident-resolved/);
    assert.match(content, /সমস্যার স্থান \(Location\):/);
    assert.match(content, /সমস্যার কারণ ও বিবরণ \(Why \/ What\):/);
  });

  // 5. Expense UI Deletion & Void Modal
  await t.test("5. Expenses page includes voucher deletion modal and actions", () => {
    const pagePath = path.join(ROOT, "app/(hospital)/app/expenses/page.tsx");
    assert.ok(fs.existsSync(pagePath), "app/(hospital)/app/expenses/page.tsx must exist");
    const content = fs.readFileSync(pagePath, "utf8");

    assert.match(content, /deleteExpenseAction/);
    assert.match(content, /handleDeleteExpense/);
    assert.match(content, /Delete \/ Reverse Expense Voucher/);
  });

  // 6. 24/7 Automated Background Monitoring Probe & Cron
  await t.test("6. Scheduled health monitor script and GitHub Actions cron workflow exist", () => {
    const scriptPath = path.join(ROOT, "scripts/scheduled-health-check.mjs");
    assert.ok(fs.existsSync(scriptPath), "scripts/scheduled-health-check.mjs must exist");
    const scriptContent = fs.readFileSync(scriptPath, "utf8");
    assert.match(scriptContent, /check_system_health_diagnostics/);
    assert.match(scriptContent, /https:\/\/onnesha-hospital\.pages\.dev/);

    const workflowPath = path.join(ROOT, ".github/workflows/health-monitor.yml");
    assert.ok(fs.existsSync(workflowPath), ".github/workflows/health-monitor.yml must exist");
    const workflowContent = fs.readFileSync(workflowPath, "utf8");
    assert.match(workflowContent, /cron:\s*['"]\*\/\d+\s+\*\s+\*\s+\*\s+\*['"]/);
  });

  // 7. Live Supabase RPC Availability
  await t.test("7. Remote database RPC check_system_health_diagnostics is callable", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || supabaseUrl.includes("placeholder") || supabaseUrl.includes("127.0.0.1")) {
      console.log("   [Hermetic CI Mode] Skipping remote database network call");
      return;
    }

    const supabase = createClient(supabaseUrl, anonKey);
    const { data, error } = await supabase.rpc("check_system_health_diagnostics");
    assert.ifError(error);
    assert.ok(data, "RPC must return a response object");
    assert.equal(typeof data.health_score, "number");
    assert.equal(typeof data.status, "string");
  });
});
