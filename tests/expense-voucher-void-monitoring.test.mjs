import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("expense voucher void uses an atomic, tenant-scoped accounting reversal", async (t) => {
  await t.test("migration preserves posted journal history and creates a balanced reversal", () => {
    const migrationPath = "supabase/migrations/20261014050000_fix_expense_voucher_void_and_health_diagnostics.sql";
    assert.ok(fs.existsSync(path.join(ROOT, migrationPath)), "Forward migration must be present");
    const sql = read(migrationPath);

    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.void_hospital_expense_atomic/i);
    assert.match(sql, /p_org_id UUID/i);
    assert.match(sql, /Active organization membership is required/i);
    assert.match(sql, /Accounting management permission is required/i);
    assert.match(sql, /FOR UPDATE/i);
    assert.match(sql, /EXPENSE_VOID_REVERSAL/i);
    assert.match(sql, /SET status = 'REVERSED'/i);
    assert.match(sql, /SET status = 'VOIDED'/i);
    assert.match(sql, /v_reversal_debit <> v_reversal_credit/i);
    assert.match(sql, /p_funds_recovered BOOLEAN DEFAULT FALSE/i);
    assert.match(sql, /EXPENSE_VOID_FUNDS_NOT_CONFIRMED/i);
    assert.match(sql, /to_regprocedure\('public\.void_hospital_expense_atomic\(uuid,uuid,text,uuid\)'\)/i);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.void_hospital_expense_atomic\(uuid, uuid, text, uuid\) FROM PUBLIC, anon, authenticated/i);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.void_hospital_expense_atomic[\s\S]*FROM PUBLIC/i);
    assert.match(sql, /FROM anon/i);
    assert.doesNotMatch(sql, /DELETE FROM public\.journal_entries/i);
    assert.doesNotMatch(sql, /DELETE FROM public\.journal_entry_lines/i);
  });

  await t.test("expense creation requires a configured ledger account and posts journal lines before POSTED status", () => {
    const migration = read("supabase/migrations/20261014050000_fix_expense_voucher_void_and_health_diagnostics.sql");
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.record_hospital_expense_atomic(");
    const end = migration.indexOf("$ohms_expense$;", start);
    assert.ok(start >= 0 && end > start, "replacement expense creation RPC must exist");
    const sql = migration.slice(start, end);

    assert.match(sql, /Accounting post or billing create permission is required/i);
    assert.match(sql, /Active organization membership is required to create an expense voucher/i);
    assert.match(sql, /missing an active expense account or matching cash\/bank account/i);
    assert.match(sql, /v_payment_method = 'CASH'/i);
    const lineInsert = sql.indexOf("INSERT INTO public.journal_entry_lines");
    const postTransition = sql.indexOf("UPDATE public.journal_entries\n    SET status = 'POSTED'");
    const expenseLink = sql.indexOf("UPDATE public.expenses\n    SET journal_entry_id = v_je_id");
    assert.ok(lineInsert >= 0 && postTransition > lineInsert, "balanced journal lines must be inserted while header is PENDING");
    assert.ok(expenseLink > postTransition, "expense links only after the journal is posted");
    assert.match(sql, /SET status = 'PENDING'/);
  });

  await t.test("expense listing and analytics failures enter the runtime diagnostics pipeline", () => {
    const action = read("lib/expenses/actions.ts");
    assert.match(action, /async function reportExpenseReadFailure/);
    assert.match(action, /EXPENSE_LIST_QUERY_FAILED/);
    assert.match(action, /EXPENSE_LIST_UNEXPECTED_EXCEPTION/);
    assert.match(action, /EXPENSE_ANALYTICS_QUERY_FAILED/);
    assert.match(action, /reportSystemRuntimeIncident/);
  });

  await t.test("expense creation verifies the returned expense and linked journal and does not invite duplicate retries after audit-only failure", () => {
    const action = read("lib/expenses/actions.ts");
    const start = action.indexOf("export async function createExpenseAction(");
    const end = action.indexOf("/**\n * 5. Get Expense Analytics", start);
    assert.ok(start >= 0 && end > start, "createExpenseAction must exist");
    const source = action.slice(start, end);
    assert.match(source, /EXPENSE_CREATE_RPC_FAILED/);
    assert.match(source, /EXPENSE_CREATE_NOT_CONFIRMED/);
    assert.match(source, /typeof res\.journal_entry_id === "string"/);
    assert.match(source, /EXPENSE_CREATE_AUDIT_LOG_FAILED/);
    assert.match(source, /success: true,[\s\S]*auditWarning/);
  });

  await t.test("posted voucher accounting fields cannot be edited without reversal", () => {
    const action = read("lib/expenses/actions.ts");
    const start = action.indexOf("export async function updateExpenseAction(");
    const end = action.indexOf("/**\n * 8. Archive or Toggle Expense", start);
    assert.ok(start >= 0 && end > start, "updateExpenseAction must exist");
    const source = action.slice(start, end);
    assert.match(source, /journal_entry_id/);
    assert.match(source, /isPostedOrLinked && financialChanges/);
    assert.match(source, /cannot have its title, amount, payee, category or payment method edited directly/i);
    assert.match(source, /expense_categories/);
    assert.match(source, /eq\("organization_id", session\.organizationId\)/);
    assert.match(source, /EXPENSE_UPDATE_WRITE_FAILED/);
    const page = read("app/(hospital)/app/expenses/page.tsx");
    assert.match(page, /follow-up needs attention:/);
  });

  await t.test("application never reports voucher success without database confirmation", () => {
    const source = read("lib/expenses/actions.ts");
    const start = source.indexOf("export async function voidExpenseAction(");
    const end = source.indexOf("/**\n * 7. Update an Unposted or Draft Expense", start);
    assert.ok(start >= 0 && end > start, "voidExpenseAction implementation must exist");
    const action = source.slice(start, end);

    assert.match(source, /reportSystemRuntimeIncident/);
    assert.match(action, /rpc\("void_hospital_expense_atomic"/);
    assert.match(action, /rpcResult\.success !== true/);
    assert.match(action, /EXPENSE_VOID_POSTCONDITION_FAILED/);
    assert.match(action, /maybeSingle\(\)/);
    assert.match(action, /persistedExpense\.status/);
    assert.match(action, /p_funds_recovered: fundsRecoveredConfirmed/);
  });

  await t.test("active vouchers and voided audit history have separate filters", () => {
    const action = read("lib/expenses/actions.ts");
    const page = read("app/(hospital)/app/expenses/page.tsx");
    assert.match(action, /params\?\.status === "ACTIVE"/);
    assert.match(action, /params\?\.status === "VOIDED"/);
    assert.match(page, /const \[selectedStatus, setSelectedStatus\] = useState\("ACTIVE"\)/);
    assert.match(page, /<option value="VOIDED">Voided history<\/option>/);
    assert.match(page, /<option value="ALL">All vouchers<\/option>/);
    assert.match(page, /accounting audit trail has been preserved/i);
    assert.match(page, /voidFundsRecoveredConfirmed/);
    assert.match(page, /returned to the hospital/i);
  });
});

test("system health reporting is fail-closed, tenant-aware, and honest about resolution", async (t) => {
  await t.test("health action cannot turn null/malformed results into a healthy score", () => {
    const source = read("lib/diagnostics/actions.ts");
    assert.match(source, /getCurrentUserSession\(true\)/);
    assert.match(source, /DIAGNOSTIC_AUTH_CONTEXT_MISSING/);
    assert.match(source, /DIAGNOSTIC_EMPTY_RESPONSE/);
    assert.match(source, /DIAGNOSTIC_INVALID_RESPONSE/);
    assert.match(source, /requestedOrganizationId !== activeOrganizationId/);
    assert.doesNotMatch(source, /passed_checks:\s*\["DEFAULT_HEALTHY"\]/);
  });

  await t.test("database health RPC rejects unauthenticated false-green and cross-tenant requests", () => {
    const migration = read("supabase/migrations/20261014050000_fix_expense_voucher_void_and_health_diagnostics.sql");
    assert.match(migration, /DIAGNOSTICS_AUTH_REQUIRED/);
    assert.match(migration, /v_jwt_role = 'service_role'/);
    assert.match(migration, /v_user_active_org/);
    assert.match(migration, /p_org_id IS DISTINCT FROM v_user_active_org/);
    assert.doesNotMatch(migration, /SELECT id INTO v_target_org_id[\s\S]{0,220}ORDER BY created_at ASC/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.check_system_health_diagnostics\(UUID\) FROM anon/i);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.log_system_runtime_issue/i);
    assert.match(migration, /Active organization membership is required to record a system incident/i);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.log_system_runtime_issue[\s\S]*FROM anon/i);
    assert.doesNotMatch(migration, /v_effective_org_id\s*:=\s*'6b78e524-b1e3-4c43-8944-1a5a0248bff8'/i);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.resolve_system_runtime_issue/i);
    assert.match(migration, /Administrative permission is required to resolve system incidents/i);
    assert.match(migration, /p_issue_id IS NULL/i);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.resolve_system_runtime_issue[\s\S]*FROM anon/i);
  });

  await t.test("browser incidents use the authenticated organization and stay visible until persisted", () => {
    const troubleshooter = read("lib/diagnostics/troubleshooter.ts");
    const banner = read("components/app/SystemHealthAlertBanner.tsx");
    assert.match(troubleshooter, /getCurrentUserSession\(true\)/);
    assert.match(troubleshooter, /system-health-incident-persisted/);
    assert.match(troubleshooter, /sanitizeIncidentDetails/);
    assert.match(troubleshooter, /PHONE_REDACTED/);
    assert.match(troubleshooter, /IDENTIFIER_REDACTED/);
    assert.match(troubleshooter, /UUID_REDACTED/);
    assert.doesNotMatch(troubleshooter, /defaultOrgId = "6b78e524-b1e3-4c43-8944-1a5a0248bff8"/);
    assert.match(banner, /system-health-incident-reported/);
    assert.match(banner, /system-health-incident-persisted/);
    assert.match(banner, /hasIssues = data\.is_healthy !== true \|\| data\.total_issues > 0/);
    assert.match(banner, /verification\.issues\.some/);
    assert.match(banner, /মূল database বা workflow সমস্যা ঠিক করে/);
  });
});

test("scheduled production monitoring has explicit external dependency gates", async (t) => {
  await t.test("monitor checks routes and every organization's configured diagnostic invariants", () => {
    const script = read("scripts/monitor-production.mjs");
    const workflow = read(".github/workflows/ohms-production-monitor.yml");
    assert.match(script, /check_system_health_diagnostics/);
    assert.match(script, /organizationsChecked/);
    assert.match(script, /process\.exitCode = 1/);
    assert.match(script, /OHMS_ALERT_WEBHOOK_URL is not configured/);
    assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
    assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(workflow, /OHMS_ALERT_WEBHOOK_URL/);
    assert.match(workflow, /BLOCKED_EXTERNAL_OWNER/);
  });
});
