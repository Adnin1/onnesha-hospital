import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("expense voucher void is atomic, journal-preserving, tenant-scoped, and observable", async (t) => {
  await t.test("the forward migration posts a balanced reversal instead of deleting a posted journal", () => {
    const migrationPath = "supabase/migrations/20261014060000_atomic_expense_void_and_gl_reversal.sql";
    assert.ok(fs.existsSync(path.join(ROOT, migrationPath)), "Expense void migration must exist");
    const sql = read(migrationPath);

    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.void_hospital_expense_atomic/i);
    assert.match(sql, /p_org_id UUID/i);
    assert.match(sql, /Active organization membership is required/i);
    assert.match(sql, /Accounting management permission is required/i);
    assert.match(sql, /FOR UPDATE/i);
    assert.match(sql, /EXPENSE_VOID_REVERSAL/i);
    assert.match(sql, /SET status = 'POSTED'/i);
    assert.match(sql, /SET status = 'REVERSED'/i);
    assert.match(sql, /SET status = 'VOIDED'/i);
    assert.match(sql, /v_reverse_debit <> v_reverse_credit/i);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.void_hospital_expense_atomic[\s\S]*FROM PUBLIC, anon/i);
    assert.doesNotMatch(sql, /DELETE FROM public\.journal_entries/i);
    assert.doesNotMatch(sql, /DELETE FROM public\.journal_entry_lines/i);
  });

  await t.test("the action checks RPC business failures and verifies persisted state", () => {
    const action = read("lib/expenses/actions.ts");
    const start = action.indexOf("export async function voidExpenseAction(");
    const end = action.indexOf("/**\n * 7. Update an Unposted or Draft Expense", start);
    assert.ok(start >= 0 && end > start, "voidExpenseAction source should be present");
    const source = action.slice(start, end);

    assert.match(action, /import \{ reportSystemRuntimeIncident \} from "@\/lib\/diagnostics\/troubleshooter"/);
    assert.match(source, /supabase\.rpc\("void_hospital_expense_atomic"/);
    assert.match(source, /rpcResult\.success !== true/);
    assert.match(source, /EXPENSE_VOID_POSTCONDITION_FAILED/);
    assert.match(source, /maybeSingle\(\)/);
    assert.match(source, /reportVoidFailure/);
  });

  await t.test("active and voided voucher history are distinct UI filters", () => {
    const action = read("lib/expenses/actions.ts");
    const page = read("app/(hospital)/app/expenses/page.tsx");
    assert.match(action, /params\?\.status === "ACTIVE"/);
    assert.match(action, /params\?\.status === "VOIDED"/);
    assert.match(page, /const \[selectedStatus, setSelectedStatus\] = useState\("ACTIVE"\)/);
    assert.match(page, /<option value="VOIDED">Voided history<\/option>/);
    assert.match(page, /<option value="ALL">All vouchers<\/option>/);
  });
});

test("health diagnostics never silently treat a failed health check as healthy", async (t) => {
  await t.test("empty and malformed diagnostic data become an explicit degraded state", () => {
    const action = read("lib/diagnostics/actions.ts");
    assert.match(action, /diagnosticUnavailable/);
    assert.match(action, /DIAGNOSTIC_EMPTY_RESPONSE/);
    assert.match(action, /DIAGNOSTIC_INVALID_RESPONSE/);
    assert.match(action, /check_system_health_diagnostics_for_current_org/);
    assert.doesNotMatch(action, /passed_checks: \["DEFAULT_HEALTHY"\]/);
  });

  await t.test("client runtime incidents remain visible until persistence is confirmed", () => {
    const reporter = read("lib/diagnostics/troubleshooter.ts");
    const banner = read("components/app/SystemHealthAlertBanner.tsx");
    const monitor = read("components/app/RuntimeErrorMonitor.tsx");
    const layout = read("app/(hospital)/app/layout.tsx");

    assert.match(reporter, /system-health-incident-persisted/);
    assert.match(banner, /system-health-incident-reported/);
    assert.match(banner, /system-health-incident-persisted/);
    assert.match(banner, /DIAGNOSTIC_CLIENT_FETCH_FAILED/);
    assert.match(monitor, /unhandledrejection/);
    assert.match(monitor, /reportSystemRuntimeIncident/);
    assert.match(layout, /<RuntimeErrorMonitor\s*\/>/);
  });

  await t.test("scheduled monitor checks routes and each tenant, and does not hide missing secrets", () => {
    const workflow = read(".github/workflows/ohms-production-monitor.yml");
    const script = read("scripts/monitor-production.mjs");
    assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
    assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(workflow, /OHMS_ALERT_WEBHOOK_URL/);
    assert.match(script, /check_system_health_diagnostics/);
    assert.match(script, /organizationsChecked/);
    assert.match(script, /process\.exitCode = 1/);
    assert.match(script, /OHMS_ALERT_WEBHOOK_URL is not configured/);
  });
});
