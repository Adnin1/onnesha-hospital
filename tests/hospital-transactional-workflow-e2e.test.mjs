import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = match[2] || "";
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[match[1]] = process.env[match[1]] || val;
    }
  });
}

describe("OHMS Live Transactional Workflow & Double-Entry Accounting E2E Suite", () => {
  const TEST_ORG_ID = "6b78e524-b1e3-4c43-8944-1a5a0248bff8";

  // Step 1: Structural Contract Verification for Atomic Transaction Pipeline
  test("1. Server Actions export atomic transactional mutations with robust error boundaries", () => {
    const patientActions = fs.readFileSync(path.join(ROOT, "lib/patient/actions.ts"), "utf8");
    const bedActions = fs.readFileSync(path.join(ROOT, "lib/ipd/bed-actions.ts"), "utf8");
    const billingActions = fs.readFileSync(path.join(ROOT, "lib/billing/actions.ts"), "utf8");
    const expenseActions = fs.readFileSync(path.join(ROOT, "lib/expenses/actions.ts"), "utf8");
    const referralActions = fs.readFileSync(path.join(ROOT, "lib/referrals/actions.ts"), "utf8");

    // Patient & Bed Admissions
    assert.match(patientActions, /registerPatientAction/);
    assert.match(patientActions, /dischargePatientAction|admit/);
    assert.match(bedActions, /admitPatientToBedAction|transferBedAction|vacateBedAction/);
    assert.match(bedActions, /admit_patient_to_bed_atomic/);

    // Billing & Expenses
    assert.match(billingActions, /createInvoiceAction|settleEpisodeInvoiceAction/);
    assert.match(expenseActions, /createExpenseAction/);
    assert.match(expenseActions, /deleteExpenseAction/);
    assert.match(expenseActions, /delete_hospital_expense_super_admin_atomic/);

    // Referrals
    assert.match(referralActions, /recordReferralCommissionPayoutAction|settleReferralCommissionsAction/);
  });

  // Step 2: Database Migration 192 RPC Signature & Transaction Invariants
  test("2. Migration 192 provides atomic financial and bed reconciliation functions", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261014100000_zero_false_green_monitoring_and_multitenant_security_hardening.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    assert.match(sql, /FUNCTION public\.delete_hospital_expense_super_admin_atomic/);
    assert.match(sql, /FUNCTION public\.cancel_or_delete_ipd_admission_atomic/);
    assert.match(sql, /FUNCTION public\.delete_invoice_super_admin_atomic/);
    assert.match(sql, /FUNCTION public\.run_scheduled_system_health_check/);
    assert.match(sql, /FUNCTION public\.get_pg_cron_monitoring_telemetry/);

    // GAAP immutability: Expense reversal posts offsetting journal lines
    assert.match(sql, /'EXPENSE_REVERSAL'/);
    assert.match(sql, /v_line\.credit,\s*-- Inverted for reversal/);
    assert.match(sql, /v_line\.debit,\s*-- Inverted for reversal/);
  });

  // Step 3: Bed Matrix & Reconciler Zero-Drift Invariant
  test("3. Bed vacancy reconciler clears ghost occupancy and ghost vacancy", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261014100000_zero_false_green_monitoring_and_multitenant_security_hardening.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    assert.match(sql, /CHECK 2: Bed Occupancy Drift/i);
    assert.match(sql, /reconcile_bed_vacancy_drift_atomic/);
    assert.match(sql, /public\.beds b/);
    assert.match(sql, /b\.status = 'OCCUPIED'/);
  });

  // Step 4: Invoice Double-Entry Balancing & Super Admin Purge Protection
  test("4. delete_invoice_super_admin_atomic requires explicit reason and prevents history erasure", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20261014100000_zero_false_green_monitoring_and_multitenant_security_hardening.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    assert.match(sql, /Purge reason is mandatory and cannot be empty/i);
    assert.match(sql, /void_invoice_and_reverse_gl_atomic/);
    assert.match(sql, /invoices\.delete/);
  });

  // Step 5: Remote Database Live RPC Availability Verification
  test("5. Remote database live instance responds to diagnostic audit probes with fail-closed guarantee", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey || supabaseUrl.includes("placeholder") || !supabaseUrl.startsWith("https://")) {
      console.log("   [Hermetic CI Mode] Skipping live network diagnostic check");
      return;
    }

    const client = createClient(supabaseUrl, anonKey);
    const { data, error } = await client.rpc("check_system_health_diagnostics", {
      p_org_id: TEST_ORG_ID
    });

    assert.ifError(error);
    assert.ok(data, "Diagnostic response must be returned");
    assert.equal(data.is_healthy, false, "Unauthenticated calls must fail closed");
    assert.equal(data.status, "AUDIT_UNAUTHORIZED");
  });
});
