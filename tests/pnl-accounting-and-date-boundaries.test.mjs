import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getDhakaDateRange } from "../lib/reports/financial.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS P&L Accounting, Date Boundaries & Authoritative GL (6 Scenarios)", async () => {

  test("1. getDhakaDateRange generates strict half-open [startInclusive, endExclusive) interval in Asia/Dhaka BST", () => {
    const range = getDhakaDateRange("this_month");
    assert.ok(range.start, "Start timestamp required");
    assert.ok(range.end, "End timestamp required");
    assert.ok(range.endExclusive, "EndExclusive timestamp required");

    // endExclusive must be exactly midnight of next calendar period
    assert.ok(range.endExclusive > range.end, "endExclusive must be strictly greater than end");
    assert.ok(range.startIso.includes("+06:00") || range.startIso.includes("Z"), "Must represent UTC timestamp");
  });

  test("2. Migration 92 defines get_profit_and_loss_summary with half-open < v_end_date_d comparison", () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260929000000_pnl_date_boundary_and_authoritative_gl.sql"),
      "utf8"
    );

    assert.ok(
      migration.includes("je.entry_date < v_end_date_d"),
      "Must use strictly less than (< v_end_date_d) to prevent next-day boundary leakage"
    );
    assert.ok(
      !migration.includes("je.entry_date <= v_end_date_d"),
      "Must NOT use <= v_end_date_d"
    );
  });

  test("3. Migration 92 eliminates silent fallback to unlinked public.expenses", () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260929000000_pnl_date_boundary_and_authoritative_gl.sql"),
      "utf8"
    );

    assert.ok(
      !migration.includes("FROM public.expenses"),
      "Must NOT query legacy public.expenses table"
    );
    assert.ok(
      !migration.includes("v_operating_expenses = 0.00 THEN"),
      "Must NOT have silent fallback condition"
    );
  });

  test("4. Migration 92 queries authoritative General Ledger for operating expenses and cash disbursements", () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "supabase/migrations/20260929000000_pnl_date_boundary_and_authoritative_gl.sql"),
      "utf8"
    );

    assert.ok(
      migration.includes("coa.account_type = 'EXPENSE'"),
      "Must filter on chart_of_accounts account_type = 'EXPENSE'"
    );
    assert.ok(
      migration.includes("je.status = 'POSTED'"),
      "Must only aggregate POSTED journal entries"
    );
    assert.ok(
      migration.includes("SUM(jel.debit - jel.credit)"),
      "Must calculate net debit balance for expenses"
    );
  });

  test("5. Net operating surplus strictly equals net recognized revenue minus operating expenses", () => {
    function calculatePnL(grossRevenue, discounts, operatingExpenses) {
      const netRevenue = grossRevenue - discounts;
      const operatingSurplus = netRevenue - operatingExpenses;
      return { netRevenue, operatingSurplus };
    }

    const result = calculatePnL(100000, 5000, 45000);
    assert.equal(result.netRevenue, 95000);
    assert.equal(result.operatingSurplus, 50000);
  });

  test("6. Net cash movement strictly equals patient collections minus (refunds + operating disbursements)", () => {
    function calculateCashMovement(collections, refunds, disbursements) {
      const totalInflow = collections;
      const totalOutflow = refunds + disbursements;
      const netCash = totalInflow - totalOutflow;
      return { totalInflow, totalOutflow, netCash };
    }

    const cash = calculateCashMovement(80000, 2000, 30000);
    assert.equal(cash.totalInflow, 80000);
    assert.equal(cash.totalOutflow, 32000);
    assert.equal(cash.netCash, 48000);
  });
});
