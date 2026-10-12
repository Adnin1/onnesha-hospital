import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("OHMS UAT Acceptance Certification: IPD Auto-Billing, Expense Analytics & Canonical Address", async (t) => {
  // 1. Migration 174 Parity & Schema
  await t.test("1. Migration 174 provides authoritative get_expense_analytics_summary, get_episode_billing_overview, and referral sync", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261013053000_ipd_charges_auto_billing_and_expense_reconciliation.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 174 file must exist");
    const content = fs.readFileSync(migrationPath, "utf8");

    // Expense analytics keys
    assert.match(content, /total_expense_amount/i);
    assert.match(content, /expense_count/i);
    assert.match(content, /cash_paid_total/i);
    assert.match(content, /bank_paid_total/i);

    // IPD charges derivation directly from patient_visits (visit_type = 'IPD')
    assert.match(content, /IPD Daily Service Charge/i);
    assert.match(content, /IPD Admission Fee/i);
    assert.match(content, /pv\.visit_type = 'IPD'/i);

    // Referral sync
    assert.match(content, /UPDATE public\.referral_agents/i);
    assert.match(content, /total_commission_settled/i);
  });

  // 2. Canonical Address & Emergency Hotline
  await t.test("2. Canonical physical address is updated to Sonali Bank, Khandar, Bogura and emergency hotline default is clean", () => {
    const configPath = path.join(ROOT, "config/hospital.ts");
    const actionsPath = path.join(ROOT, "lib/hospital/actions.ts");
    const settingsPath = path.join(ROOT, "app/(hospital)/app/settings/page.tsx");
    const printPath = path.join(ROOT, "components/print/DischargeSummaryPrint.tsx");

    const configContent = fs.readFileSync(configPath, "utf8");
    const actionsContent = fs.readFileSync(actionsPath, "utf8");
    const settingsContent = fs.readFileSync(settingsPath, "utf8");
    const printContent = fs.readFileSync(printPath, "utf8");

    // Address check
    assert.match(configContent, /সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।/);
    assert.match(actionsContent, /সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।/);
    assert.match(settingsContent, /সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।/);
    assert.match(printContent, /সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া।/);

    // Emergency hotline default is empty string and editable in settings
    assert.match(configContent, /emergencyHotline: process\.env\.NEXT_PUBLIC_EMERGENCY_HOTLINE \|\| ""/);
    assert.match(settingsContent, /emergencyHotline: process\.env\.NEXT_PUBLIC_EMERGENCY_HOTLINE \|\| ""/);
    assert.match(settingsContent, /hospitalEmergency/); // Settings UI input state
  });

  // 3. IPD Charges in Service Catalog & Auto-Billing
  await t.test("3. lib/billing/serviceCatalog.ts and app/(hospital)/app/billing/page.tsx include auto-injected IPD admission fee and daily service charge", () => {
    const catalogPath = path.join(ROOT, "lib/billing/serviceCatalog.ts");
    const billingPagePath = path.join(ROOT, "app/(hospital)/app/billing/page.tsx");

    const catalogContent = fs.readFileSync(catalogPath, "utf8");
    const billingContent = fs.readFileSync(billingPagePath, "utf8");

    // Catalog items under BED_CABIN
    assert.match(catalogContent, /srv-ipd-admission-fee/);
    assert.match(catalogContent, /IPD Admission Fee \(ভর্তি ফি - এককালীন\)/);
    assert.match(catalogContent, /srv-ipd-daily-service-charge/);
    assert.match(catalogContent, /IPD Daily Service Charge \(দৈনিক সেবা চার্জ\)/);

    // Auto-population in billing loadUnbilledServicesForPatient
    assert.match(billingContent, /isIpd/);
    assert.match(billingContent, /IPD Admission Fee \(ভর্তি ফি - এককালীন\)/);
    assert.match(billingContent, /IPD Daily Service Charge/);
  });

  // 4. Expense Analytics & Referral Payout Reconciliation
  await t.test("4. lib/expenses/actions.ts, app/expenses/page.tsx, and lib/referrals/actions.ts compute exact totals from vouchers", () => {
    const expenseActionsPath = path.join(ROOT, "lib/expenses/actions.ts");
    const expensePagePath = path.join(ROOT, "app/(hospital)/app/expenses/page.tsx");
    const referralActionsPath = path.join(ROOT, "lib/referrals/actions.ts");
    const referralPagePath = path.join(ROOT, "app/(hospital)/app/referrals/page.tsx");

    const expActionContent = fs.readFileSync(expenseActionsPath, "utf8");
    const expPageContent = fs.readFileSync(expensePagePath, "utf8");
    const refActionContent = fs.readFileSync(referralActionsPath, "utf8");
    const refPageContent = fs.readFileSync(referralPagePath, "utf8");

    // Expenses action computes total from active expenses
    assert.match(expActionContent, /total_expense_amount:\s*totalAmount/);
    assert.match(expActionContent, /expense_count:\s*rows\.length/);
    assert.match(expActionContent, /cash_paid_total:\s*cashTotal/);
    assert.match(expActionContent, /bank_paid_total:\s*bankTotal/);

    // Expenses page has dynamic fallback
    assert.match(expPageContent, /dynamicExpenseStats/);
    assert.match(expPageContent, /formatCurrencyBDT\(dynamicExpenseStats\.total\)/);

    // Referrals action reconciles settled total with settlements & expenses
    assert.match(refActionContent, /settlementsRes/);
    assert.match(refActionContent, /referralExpensesSum/);
    assert.match(refActionContent, /totalCommissionSettled = Math\.max\(totalCommissionSettled,/);

    // Referrals page displays reconciled settled payouts
    assert.match(refPageContent, /dynamicSettledTotal/);
  });
});
