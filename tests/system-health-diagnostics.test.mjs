import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("OHMS System & Database Autonomous Health Diagnostic Engine Certification", async (t) => {
  // 1. Migration 181, 182, 183 Integrity
  await t.test("1. Migration 181/182/183 files exist and provide authoritative health check RPC", () => {
    const mig181 = path.join(ROOT, "supabase/migrations/20261014030000_system_health_and_database_diagnostic_engine.sql");
    const mig182 = path.join(ROOT, "supabase/migrations/20261014030500_system_health_diagnostics_update.sql");
    const mig183 = path.join(ROOT, "supabase/migrations/20261014031000_reconcile_referral_commission_row_allocations.sql");

    assert.ok(fs.existsSync(mig181), "Migration 181 must exist");
    assert.ok(fs.existsSync(mig182), "Migration 182 must exist");
    assert.ok(fs.existsSync(mig183), "Migration 183 must exist");

    const content182 = fs.readFileSync(mig182, "utf8");

    // All 7 diagnostic check blocks
    assert.match(content182, /CREATE OR REPLACE FUNCTION public\.check_system_health_diagnostics/i);
    assert.match(content182, /GL_UNBALANCED_JOURNAL_ENTRY/i);
    assert.match(content182, /BED_OCCUPANCY_DESYNC/i);
    assert.match(content182, /REFERRAL_COMMISSION_OVERPAYMENT/i);
    assert.match(content182, /EXPENSE_UNLINKED_GL_ENTRY/i);
    assert.match(content182, /INVOICE_NEGATIVE_TOTAL/i);
    assert.match(content182, /DOCTOR_CHAMBER_UNASSIGNED/i);
    assert.match(content182, /TRIAL_BALANCE_OUT_OF_BALANCE/i);
  });

  // 2. Diagnostics Server Action Layer
  await t.test("2. lib/diagnostics/actions.ts provides getSystemHealthDiagnosticsAction with structured types", () => {
    const actionPath = path.join(ROOT, "lib/diagnostics/actions.ts");
    assert.ok(fs.existsSync(actionPath), "lib/diagnostics/actions.ts must exist");
    const content = fs.readFileSync(actionPath, "utf8");

    assert.match(content, /export async function getSystemHealthDiagnosticsAction/);
    assert.match(content, /check_system_health_diagnostics/);
    assert.match(content, /export interface SystemHealthIssue/);
    assert.match(content, /export interface SystemHealthDiagnosticResult/);
  });

  // 3. UI Component Integration
  await t.test("3. SystemHealthAlertBanner is mounted in HospitalHeader and layout", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    assert.ok(fs.existsSync(bannerPath), "components/app/SystemHealthAlertBanner.tsx must exist");
    const bannerContent = fs.readFileSync(bannerPath, "utf8");

    assert.match(bannerContent, /SystemHealthAlertBanner/);
    assert.match(bannerContent, /স্বয়ংক্রিয় সিস্টেম ও ডেটাবেজ স্বাস্থ্য নিরীক্ষা/);
    assert.match(bannerContent, /সমস্যার স্থান \(Location\)/);
    assert.match(bannerContent, /সমস্যার কারণ ও বিবরণ \(Why \/ What\)/);
    assert.match(bannerContent, /প্রস্তাবিত সমাধান \(Remediation\)/);

    const headerPath = path.join(ROOT, "components/app/HospitalHeader.tsx");
    const headerContent = fs.readFileSync(headerPath, "utf8");
    assert.match(headerContent, /<SystemHealthAlertBanner variant="badge"/);

    const layoutPath = path.join(ROOT, "app/(hospital)/app/layout.tsx");
    const layoutContent = fs.readFileSync(layoutPath, "utf8");
    assert.match(layoutContent, /<SystemHealthAlertBanner variant="banner"/);
  });

  // 4. Remote Database Live Diagnostics Execution
  await t.test("4. Remote database RPC returns 100% health and all 7 passed checks", async () => {
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
    const { data, error } = await client.rpc("check_system_health_diagnostics");

    assert.ifError(error);
    assert.ok(data, "Diagnostic data must be returned");
    assert.equal(data.is_healthy, true, "Database and system must be healthy");
    assert.equal(data.health_score, 100, "Health score must be 100");
    assert.equal(data.total_issues, 0, "There must be 0 active issues");
    assert.equal(data.critical_count, 0, "Critical issue count must be 0");
    assert.equal(data.warning_count, 0, "Warning count must be 0");

    assert.ok(data.passed_checks.includes("GENERAL_LEDGER_DOUBLE_ENTRY_BALANCED"));
    assert.ok(data.passed_checks.includes("BED_OCCUPANCY_SYNCHRONIZED"));
    assert.ok(data.passed_checks.includes("REFERRAL_COMMISSION_SETTLEMENT_PARITY"));
    assert.ok(data.passed_checks.includes("EXPENSE_JOURNAL_LINKAGE_VERIFIED"));
    assert.ok(data.passed_checks.includes("INVOICE_FINANCIAL_INVARIANTS_VERIFIED"));
    assert.ok(data.passed_checks.includes("DOCTOR_DIRECTORY_CONFIGURED"));
    assert.ok(data.passed_checks.includes("TRIAL_BALANCE_PARITY_VERIFIED"));
  });
});
