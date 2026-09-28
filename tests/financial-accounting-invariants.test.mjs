import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getDhakaDateRange,
  filterPaymentsByPeriod,
  computePaymentChannelBreakdown,
  computeAccountsReceivableAging,
  computeProfitAndLossStatement,
  generateFinancialReportCSV,
} from "../lib/reports/financial.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Financial Accounting Invariants & Reporting Hardening (10 Scenarios)", () => {

  test("1. Calendar week boundaries in Asia/Dhaka strictly anchor to Sunday 00:00:00 BST and Saturday 23:59:59 BST", () => {
    // Reference date: Wednesday 2026-09-30 14:00:00 BST (+06:00) -> UTC is 2026-09-30 08:00:00Z
    const wednesday = new Date("2026-09-30T08:00:00.000Z");
    const { start, end, startIso, endIso } = getDhakaDateRange("this_week", undefined, undefined, wednesday);

    // In Asia/Dhaka (+06:00), 2026-09-30 is Wednesday.
    // Sunday of that week was 2026-09-27.
    // Sunday 00:00:00 BST is 2026-09-26 18:00:00 UTC.
    // Saturday 23:59:59.999 BST is 2026-10-03 17:59:59.999 UTC.
    assert.equal(start.getUTCFullYear(), 2026);
    assert.equal(start.getUTCMonth(), 8); // 8 is September
    assert.equal(start.getUTCDate(), 26);
    assert.equal(start.getUTCHours(), 18);
    assert.equal(start.getUTCMinutes(), 0);

    assert.equal(end.getUTCFullYear(), 2026);
    assert.equal(end.getUTCMonth(), 9); // 9 is October
    assert.equal(end.getUTCDate(), 3);
    assert.equal(end.getUTCHours(), 17);
    assert.equal(end.getUTCMinutes(), 59);

    assert.ok(startIso.includes("2026-09-26T18:00:00"));
    assert.ok(endIso.includes("2026-10-03T17:59:59"));
  });

  test("2. Accounts Receivable (AR) Aging Summary calculates 5 aging buckets and enforces mathematical control total invariant", () => {
    const asOf = new Date("2026-09-30T12:00:00.000Z"); // As of Sep 30, 2026

    const mockInvoices = [
      // 10 days old -> bucket current_0_30
      {
        id: "inv-1",
        created_at: new Date(asOf.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        due_amount: 5000,
        is_voided: false,
      },
      // 40 days old -> bucket days_31_60
      {
        id: "inv-2",
        created_at: new Date(asOf.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        due_amount: 3000,
        is_voided: false,
      },
      // 75 days old -> bucket days_61_90
      {
        id: "inv-3",
        created_at: new Date(asOf.getTime() - 75 * 24 * 60 * 60 * 1000).toISOString(),
        due_amount: 2500,
        is_voided: false,
      },
      // 105 days old -> bucket days_91_120
      {
        id: "inv-4",
        created_at: new Date(asOf.getTime() - 105 * 24 * 60 * 60 * 1000).toISOString(),
        due_amount: 1500,
        is_voided: false,
      },
      // 150 days old -> bucket days_120_plus
      {
        id: "inv-5",
        created_at: new Date(asOf.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString(),
        due_amount: 4000,
        is_voided: false,
      },
      // Voided invoice with due amount should be ignored
      {
        id: "inv-6",
        created_at: new Date(asOf.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        due_amount: 10000,
        is_voided: true,
      },
      // Fully paid invoice (due_amount <= 0) should be ignored
      {
        id: "inv-7",
        created_at: new Date(asOf.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        due_amount: 0,
        is_voided: false,
      },
    ];

    const aging = computeAccountsReceivableAging(mockInvoices, asOf);

    assert.equal(aging.totalInvoicesDue, 5);
    assert.equal(aging.current_0_30, 5000);
    assert.equal(aging.days_31_60, 3000);
    assert.equal(aging.days_61_90, 2500);
    assert.equal(aging.days_91_120, 1500);
    assert.equal(aging.days_120_plus, 4000);

    const expectedTotal = 5000 + 3000 + 2500 + 1500 + 4000;
    assert.equal(aging.totalAR, expectedTotal);
    assert.equal(aging.isReconciled, true, "AR aging control total must reconcile exactly with sum of buckets");
  });

  test("3. Payment channel breakdown groups transactions by actual payment transaction date, not invoice creation date", () => {
    // Reference date: 2026-09-30 BST
    const refDate = new Date("2026-09-30T10:00:00.000Z");

    const paymentRecords = [
      // Collected today via bKash
      {
        id: "pmt-1",
        invoice_id: "inv-old",
        payment_method: "BKASH",
        amount: 2500,
        payment_date: "2026-09-30T09:00:00.000Z",
      },
      // Collected today via Cash
      {
        id: "pmt-2",
        invoice_id: "inv-old-2",
        payment_method: "CASH",
        amount: 1500,
        payment_date: "2026-09-30T09:30:00.000Z",
      },
      // Collected 3 weeks ago via Nagad (outside 'today')
      {
        id: "pmt-3",
        invoice_id: "inv-old-3",
        payment_method: "NAGAD",
        amount: 4000,
        payment_date: "2026-09-05T09:30:00.000Z",
      },
    ];

    // Filter payments for 'today'
    const todayPayments = filterPaymentsByPeriod(paymentRecords, "today", undefined, undefined, refDate);
    assert.equal(todayPayments.length, 2, "Only payments with payment_date falling in today should be included");

    const breakdown = computePaymentChannelBreakdown([], todayPayments);
    const bkash = breakdown.find((b) => b.method === "BKASH");
    const cash = breakdown.find((b) => b.method === "CASH");
    const nagad = breakdown.find((b) => b.method === "NAGAD");

    assert.ok(bkash);
    assert.equal(bkash.totalCollected, 2500);
    assert.equal(bkash.transactionCount, 1);

    assert.ok(cash);
    assert.equal(cash.totalCollected, 1500);
    assert.equal(cash.transactionCount, 1);

    assert.equal(nagad, undefined, "Nagad payment outside period must not appear");
  });

  test("4. Accrual P&L separates Net Recognized Revenue and Operating Surplus from Cash Basis Flow", () => {
    const invoices = [
      {
        id: "inv-1",
        subtotal: 10000,
        discount_amount: 1000,
        grand_total: 9000,
        paid_amount: 4000, // Partial payment
        due_amount: 5000,
        is_voided: false,
      },
      {
        id: "inv-2",
        subtotal: 5000,
        discount_amount: 500,
        grand_total: 4500,
        paid_amount: 4500, // Fully paid
        due_amount: 0,
        is_voided: false,
      },
      {
        id: "inv-voided",
        subtotal: 20000,
        discount_amount: 0,
        grand_total: 20000,
        paid_amount: 0,
        due_amount: 20000,
        is_voided: true,
      },
    ];

    const operatingExpenses = [
      { category: "SALARY", amount: 6000 },
      { category: "MEDICAL_SUPPLIES", amount: 2000 },
      { category: "UTILITIES", amount: 1500 },
    ];

    const pnl = computeProfitAndLossStatement({
      invoices,
      operatingExpenses,
      periodStartIso: "2026-09-01T00:00:00.000Z",
      periodEndIso: "2026-09-30T23:59:59.999Z",
    });

    // Accrual calculations:
    // Gross: 10000 + 5000 = 15000
    // Discounts: 1000 + 500 = 1500
    // Net Recognized: 15000 - 1500 = 13500
    // Total Expenses: 6000 + 2000 + 1500 = 9500
    // Net Operating Surplus: 13500 - 9500 = 4000
    assert.equal(pnl.accrual.grossPatientRevenue, 15000);
    assert.equal(pnl.accrual.discountsAllowed, 1500);
    assert.equal(pnl.accrual.netRecognizedRevenue, 13500);
    assert.equal(pnl.accrual.operatingExpenses, 9500);
    assert.equal(pnl.accrual.netOperatingSurplus, 4000);

    // Cash calculations:
    // Collections Inflow: 4000 + 4500 = 8500
    // Net Operating Cash Flow: 8500 - 0 = 8500
    assert.equal(pnl.cash.cashCollectionsInflow, 8500);
    assert.equal(pnl.cash.netOperatingCashFlow, 8500);
  });

  test("5. CSV Report export prefixes UTF-8 BOM (\\uFEFF) and formats structured audit metadata", () => {
    const invoices = [
      {
        id: "inv-1",
        invoice_number: "INV-202609-00001",
        created_at: "2026-09-28T10:00:00.000Z",
        patient: {
          patient_code: "P-202609-00001",
          full_name: "রহিম উদ্দিন",
          phone: "01711000000",
        },
        subtotal: 1000,
        discount_amount: 100,
        grand_total: 900,
        paid_amount: 900,
        due_amount: 0,
        status: "paid",
        is_voided: false,
        void_reason: null,
      },
    ];

    const csv = generateFinancialReportCSV(invoices, {
      periodLabel: "This Month",
      organizationName: "Onnesha Hospital (Dhaka)",
      reportingBasis: "Accrual & Cash Basis",
    });

    // Check UTF-8 BOM
    assert.ok(csv.startsWith("\uFEFF"), "CSV must start with UTF-8 BOM for Microsoft Excel encoding");
    assert.ok(csv.includes("ONNESHA HOSPITAL & DIAGNOSTIC COMPLEX - FINANCIAL REPORT"));
    assert.ok(csv.includes("Asia/Dhaka (BST, UTC+6)"));
    assert.ok(csv.includes("রহিম উদ্দিন"));
    assert.ok(csv.includes("INV-202609-00001"));
  });

  test("6. Database Migration 90 includes all 5 server-authoritative financial reporting RPCs", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20260928200000_financial_intelligence_reporting_and_ar_aging.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 90 must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.ok(sql.includes("get_financial_dashboard_aggregates"), "Dashboard aggregates RPC required");
    assert.ok(sql.includes("get_payment_channel_breakdown"), "Payment channel breakdown RPC required");
    assert.ok(sql.includes("get_department_revenue_breakdown"), "Department revenue breakdown RPC required");
    assert.ok(sql.includes("get_accounts_receivable_aging"), "AR aging RPC required");
    assert.ok(sql.includes("get_profit_and_loss_summary"), "P&L summary RPC required");

    // Security checks
    assert.ok(sql.includes("SECURITY DEFINER"), "Must be SECURITY DEFINER");
    assert.ok(sql.includes("SET search_path = ''"), "Must have clean empty search_path");
    assert.ok(sql.includes("private.get_current_org_id()"), "Must check tenant org ID");
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION"), "Must revoke from PUBLIC");
  });

  test("7. Billing Action creates audit trail on GL posting errors instead of swallowing silently", () => {
    const actionsPath = path.join(ROOT, "lib/billing/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.ok(
      content.includes("glErr") || content.includes("GL posting failure") || content.includes("audit_logs"),
      "createInvoiceAction must explicitly capture GL posting error and record audit warning"
    );
  });

  test("8. Accounting Action getTrialBalanceAction enforces fail-closed execution without un-isolated fallback", () => {
    const actionsPath = path.join(ROOT, "lib/accounting/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    // Ensure fallback direct table query is eliminated
    assert.ok(
      !content.includes("journal_entry_lines.select"),
      "getTrialBalanceAction must not fallback to un-isolated journal_entry_lines select"
    );
    assert.ok(
      content.includes("get_trial_balance"),
      "getTrialBalanceAction must invoke authoritative get_trial_balance RPC"
    );
  });

  test("9. Financial Reports UI page incorporates AR Aging and True Accrual P&L components", () => {
    const pagePath = path.join(ROOT, "app/(hospital)/app/reports/page.tsx");
    const content = fs.readFileSync(pagePath, "utf8");

    assert.ok(content.includes("ar_aging"), "Must include ar_aging tab");
    assert.ok(content.includes("pnl"), "Must include pnl tab");
    assert.ok(content.includes("Asia/Dhaka"), "Must display Asia/Dhaka timezone");
    assert.ok(content.includes("Accrual Accounting Basis"), "Must support Accrual Accounting Basis");
    assert.ok(content.includes("Cash Collection Basis"), "Must support Cash Collection Basis");
  });

  test("10. Financial Period calculations handle leap years and month boundaries without NaN or invalid dates", () => {
    const leapFeb = new Date("2024-02-15T10:00:00.000Z");
    const { start: febStart, end: febEnd } = getDhakaDateRange("this_month", undefined, undefined, leapFeb);

    assert.ok(!isNaN(febStart.getTime()));
    assert.ok(!isNaN(febEnd.getTime()));
    // Feb 2024 has 29 days
    assert.equal(febEnd.getUTCDate(), 29); // In UTC it's 29th 17:59:59
  });
});
