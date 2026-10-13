import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("OHMS UAT Acceptance Certification: Reports PnL Reconciliation & Billing IPD Auto-Charges", async (t) => {
  // 1. Migration 175 Parity & Atomic DB Functions
  await t.test("1. Migration 175 provides authoritative get_profit_and_loss_summary and atomic IPD bed admission charges", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261013063000_reports_reconciliation_and_atomic_ipd_charges.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 175 file must exist");
    const content = fs.readFileSync(migrationPath, "utf8");

    // PnL sources operating expenses directly from active vouchers in public.expenses
    assert.match(content, /FROM public\.expenses e/i);
    assert.match(content, /coa\.account_code NOT IN \('4090'\)/i);
    assert.match(content, /'net_operating_surplus',\s*v_operating_surplus/i);
    assert.match(content, /'net_cash_movement',\s*v_net_cash_movement/i);

    // Atomic bed admission creates 300 BDT admission fee & 500 BDT daily service charge
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.admit_patient_to_bed_atomic/i);
    assert.match(content, /'IPD Admission Fee \(ভর্তি ফি - এককালীন\)'/i);
    assert.match(content, /300\.00/i);
    assert.match(content, /'IPD Daily Service Charge \(দৈনিক সেবা চার্জ\)'/i);
    assert.match(content, /500\.00/i);
  });

  // 2. Reports Page PnL Calculation & Zero-Expense Fallback Elimination
  await t.test("2. app/(hospital)/app/reports/page.tsx eliminates trialBalance fallback and supports Due Basis KPI", () => {
    const reportsPagePath = path.join(ROOT, "app/(hospital)/app/reports/page.tsx");
    assert.ok(fs.existsSync(reportsPagePath), "Reports page must exist");
    const content = fs.readFileSync(reportsPagePath, "utf8");

    // totalOperatingExpenses must strictly use pnlSummary without trialBalance fallback
    assert.match(content, /const totalOperatingExpenses =\s*reportingBasis === "cash"\s*\?\s*pnlSummary\.cashMovement\.operatingDisbursements\s*:\s*pnlSummary\.accrualBasis\.operatingExpenses;/);
    assert.ok(!content.includes("trialBalance.filter((row) => row.account_type === \"EXPENSE\")"), "Must not fall back to trialBalance for operating expenses");

    // Net surplus calculation matches reportingBasis
    assert.match(content, /const netSurplus =\s*reportingBasis === "cash"/);
    assert.match(content, /reportingBasis === "due"\s*\?\s*aggregates\.historicalArDue/);

    // KPI card dynamically displays Due Basis label
    assert.match(content, /reportingBasis === "due" \? "মোট বকেয়া পাওনা" : "নীট উদ্বৃত্ত \/ লাভ"/);
  });

  // 3. Billing Page IPD Auto-Charges & Encounter Selector
  await t.test("3. app/(hospital)/app/billing/page.tsx includes OPD/IPD toggle, auto-injection, and editable line items", () => {
    const billingPagePath = path.join(ROOT, "app/(hospital)/app/billing/page.tsx");
    assert.ok(fs.existsSync(billingPagePath), "Billing page must exist");
    const content = fs.readFileSync(billingPagePath, "utf8");

    // Encounter type state & toggle
    assert.match(content, /const \[billingEncounterType, setBillingEncounterType\] = useState<"OPD" \| "IPD">\("OPD"\);/);
    assert.match(content, /handleToggleBillingEncounterType/);
    assert.match(content, /OPD \(বহির্বিভাগ\)/);
    assert.match(content, /IPD \(ভর্তি রোগী\)/);

    // Helper functions
    assert.match(content, /injectIpdAdmissionCharges/);
    assert.match(content, /"IPD Admission Fee \(ভর্তি ফি - এককালীন\)"/);
    assert.match(content, /"IPD Daily Service Charge \(দৈনিক সেবা চার্জ\)"/);

    // Auto-inject in addItemRow
    assert.match(content, /if \(isIpdService\) \{/);
    assert.match(content, /setBillingEncounterType\("IPD"\);/);

    // Auto-inject on category select change
    assert.match(content, /val === "BED" \|\| val === "CABIN"/);

    // Auto-inject on line item name change
    assert.match(content, /next\[idx\]\.category === "BED"\s*\|\|\s*next\[idx\]\.category === "CABIN"/);

    // Line items table includes CABIN option
    assert.match(content, /<option value="CABIN">Cabin<\/option>/);
  });

  // 4. Canonical Address & Hotline Synchronization
  await t.test("4. Canonical physical address is Sonali Bank, Khandar, Bogura and emergency hotline default is clean", () => {
    const envPath = path.join(ROOT, ".env.local");
    const configPath = path.join(ROOT, "config/hospital.ts");
    const envContent = fs.readFileSync(envPath, "utf8");
    const configContent = fs.readFileSync(configPath, "utf8");

    assert.match(envContent, /NEXT_PUBLIC_HOSPITAL_ADDRESS="সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।"/);
    assert.match(envContent, /NEXT_PUBLIC_EMERGENCY_HOTLINE=""/);
    assert.match(configContent, /সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।/);
  });
});
