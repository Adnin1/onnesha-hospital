import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getDhakaDateRange } from "../lib/reports/financial.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

test("cash register day boundaries follow Asia/Dhaka and exclude the next hospital day", () => {
  // 2026-10-23 12:00 in Dhaka is 2026-10-23T06:00:00Z.
  const { startIso, endExclusiveIso } = getDhakaDateRange(
    "today",
    undefined,
    undefined,
    new Date("2026-10-23T06:00:00.000Z")
  );

  assert.equal(startIso, "2026-10-22T18:00:00.000Z");
  assert.equal(endExclusiveIso, "2026-10-23T18:00:00.000Z");
});

test("daily cashier summary uses bounded date queries and propagates query failures", () => {
  const source = fs.readFileSync(path.join(ROOT, "lib/billing/actions.ts"), "utf8");

  assert.match(source, /getDhakaDateRange\("today"\)/);
  assert.match(source, /\.gte\("payment_date", todayStartIso\)[\s\S]*?\.lt\("payment_date", tomorrowStartIso\)/);
  assert.match(source, /\.gte\("created_at", todayStartIso\)[\s\S]*?\.lt\("created_at", tomorrowStartIso\)/);
  assert.match(source, /if \(paymentsError\)[\s\S]*?success: false/);
  assert.match(source, /if \(invoicesError\)[\s\S]*?success: false/);
});

test("invoice initial-payment intent does not silently become full payment after item changes", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "app", "(hospital)", "app", "billing", "page.tsx"),
    "utf8"
  );

  assert.match(source, /useState<"DUE" \| "FULL" \| "CUSTOM">\("FULL"\)/);
  assert.match(source, /initialPaymentMode === "FULL"\) return netTotal/);
  assert.match(source, /initialPaymentMode === "DUE"\) return 0/);
  assert.match(source, /setInitialPaymentMode\("FULL"\)/);
  assert.match(source, /setInitialPaymentMode\("DUE"\)/);
  assert.match(source, /setInitialPaymentMode\("CUSTOM"\)/);
  assert.match(source, /initialPaymentAmount > netTotal/);
  assert.doesNotMatch(source, /recalcTotals\(next\)/);
});
