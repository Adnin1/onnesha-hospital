import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

test("OHMS Hospital Expenses Atomic Deletion, Void Reversal & 24/7 Diagnostics Certification", async (t) => {
  // 1. Migration 187 & 188 Accounting Integrity & Hardening
  await t.test("1. Migration 187 & 188 enforce GAAP double-entry reversal immutability and exact diagnostics", () => {
    const mig187Path = path.join(ROOT, "supabase/migrations/20261014050000_harden_expenses_deletion_voiding_and_diagnostics.sql");
    const mig188Path = path.join(ROOT, "supabase/migrations/20261014060000_harden_accounting_immutability_and_exact_diagnostics.sql");
    assert.ok(fs.existsSync(mig187Path), "Migration 187 file must exist");
    assert.ok(fs.existsSync(mig188Path), "Migration 188 file must exist");

    const content188 = fs.readFileSync(mig188Path, "utf8");

    // Migration 188 Prohibits permanent purge of posted vouchers
    assert.match(
      content188,
      /Accounting Immutability Invariant: Posted expense vouchers cannot be permanently deleted/i,
      "Migration 188 must forbid permanent purge of POSTED / PAID vouchers"
    );

    // Migration 188 posts reversal without marking original journal entry as VOID (so reports balance)
    assert.match(
      content188,
      /public\.post_journal_entry_atomic/i,
      "Must trigger balanced GL reversal for posted vouchers"
    );
    assert.ok(
      !content188.includes("UPDATE public.journal_entries SET status = 'VOID'"),
      "Must not mark original journal entry VOID during reversal so both entries remain POSTED and net to zero"
    );

    // Migration 188 resolve_system_runtime_issue supports p_location and prevents blanket clearance
    assert.match(
      content188,
      /p_location\s+TEXT\s+DEFAULT\s+NULL/i,
      "resolve_system_runtime_issue must support location parameter"
    );
  });

  // 2. Expenses Server Actions Layer Hardening
  await t.test("2. lib/expenses/actions.ts exports deleteExpenseAction, passes location tags, and forbids hardcoded org fallbacks", () => {
    const actionsPath = path.join(ROOT, "lib/expenses/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/expenses/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /export async function deleteExpenseAction/);
    assert.match(content, /delete_hospital_expense_super_admin_atomic/);
    assert.match(content, /reportSystemRuntimeIncident/);
    assert.match(content, /resolveSystemRuntimeIncident/);
    assert.match(content, /lib\/expenses\/actions\.ts:deleteExpenseAction/);
    assert.match(content, /lib\/expenses\/actions\.ts:createExpenseAction/);

    // Enforce no hardcoded fallback org ID in voidExpenseAction or deleteExpenseAction
    assert.ok(
      !content.includes('session.organizationId || "6b78e524-b1e3-4c43-8944-1a5a0248bff8"'),
      "lib/expenses/actions.ts must fail closed with 401 instead of using hardcoded organizationId"
    );
  });

  // 3. Bed Actions Layer Incident Diagnostics & Tenant Boundary
  await t.test("3. lib/ipd/bed-actions.ts fails closed on missing org and reports exact incidents", () => {
    const bedActionsPath = path.join(ROOT, "lib/ipd/bed-actions.ts");
    assert.ok(fs.existsSync(bedActionsPath), "lib/ipd/bed-actions.ts must exist");
    const content = fs.readFileSync(bedActionsPath, "utf8");

    assert.match(content, /reportSystemRuntimeIncident/);
    assert.match(content, /resolveSystemRuntimeIncident/);
    assert.match(content, /lib\/ipd\/bed-actions\.ts:addBedAction/);
    assert.ok(
      !content.includes('session.organizationId || "6b78e524-b1e3-4c43-8944-1a5a0248bff8"'),
      "lib/ipd/bed-actions.ts must not have hardcoded fallback org ID"
    );
  });

  // 4. Reactive Health Alert Banner Location-Exact Matching
  await t.test("4. SystemHealthAlertBanner requires exact location or issueId and avoids premature resolution banner", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    assert.ok(fs.existsSync(bannerPath), "components/app/SystemHealthAlertBanner.tsx must exist");
    const content = fs.readFileSync(bannerPath, "utf8");

    assert.match(content, /matchedCount > 0/);
    assert.match(content, /issueId.*location.*errorCode/);
    assert.match(content, /সমস্যার স্থান \(Location\):/);
    assert.match(content, /সমস্যার কারণ ও বিবরণ \(Why \/ What\):/);
  });

  // 5. Expense UI Deletion & Void Modal Invariant Enforcement
  await t.test("5. Expenses page hides permanent purge checkbox for POSTED vouchers and labels button accurately", () => {
    const pagePath = path.join(ROOT, "app/(hospital)/app/expenses/page.tsx");
    assert.ok(fs.existsSync(pagePath), "app/(hospital)/app/expenses/page.tsx must exist");
    const content = fs.readFileSync(pagePath, "utf8");

    assert.match(content, /deleteModalExpense\.status === "DRAFT" \|\| deleteModalExpense\.status === "PENDING_APPROVAL"/);
    assert.match(content, /Confirm Void & Reverse GL/);
    assert.match(content, /অডিট ট্রেইল সুরক্ষা:/);
  });

  // 6. Zero False-Green 24/7 Automated Monitoring Probe
  await t.test("6. Scheduled health monitor script prevents false-green and reports CONFIGURATION_ERROR when unconfigured", () => {
    const scriptPath = path.join(ROOT, "scripts/scheduled-health-check.mjs");
    assert.ok(fs.existsSync(scriptPath), "scripts/scheduled-health-check.mjs must exist");
    const scriptContent = fs.readFileSync(scriptPath, "utf8");

    assert.match(scriptContent, /CONFIGURATION_ERROR/);
    assert.match(scriptContent, /dbStatus\s*=\s*dbResult\.skipped\s*\?\s*["']UNCONFIGURED["']/);
    assert.match(scriptContent, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(scriptContent, /audit_scope/);
    assert.match(scriptContent, /PUBLIC_PORTAL_ONLY/);

    const workflowPath = path.join(ROOT, ".github/workflows/health-monitor.yml");
    assert.ok(fs.existsSync(workflowPath), ".github/workflows/health-monitor.yml must exist");
    const workflowContent = fs.readFileSync(workflowPath, "utf8");
    assert.match(workflowContent, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(workflowContent, /STRICT_HEARTBEAT/);
  });

  // 7. Site Locale & Accessibility Metadata
  await t.test("7. Layout and site configuration enforce Bengali locale (bn_BD / lang='bn')", () => {
    const siteConfigPath = path.join(ROOT, "config/site.ts");
    const siteConfig = fs.readFileSync(siteConfigPath, "utf8");
    assert.match(siteConfig, /locale:\s*"bn_BD"/);

    const layoutPath = path.join(ROOT, "app/layout.tsx");
    const layout = fs.readFileSync(layoutPath, "utf8");
    assert.match(layout, /<html\s+lang="bn"/);
    assert.match(layout, /locale:\s*SITE_CONFIG\.locale/);
  });

  // 8. Live Supabase RPC Availability
  await t.test("8. Remote database RPC check_system_health_diagnostics is callable", async () => {
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
