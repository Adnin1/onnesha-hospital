import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20261023054617_migration_261_enforce_future_referral_commission_overpayment_guard.sql",
  "utf8"
);

test("Migration 261 adds table-level referral overpayment protection", () => {
  assert.match(migration, /ADD CONSTRAINT referral_commissions_amount_paid_not_over_commission_check/i);
  assert.match(migration, /COALESCE\(amount_paid, 0\) <= COALESCE\(commission_amount, 0\) \+ 0\.01/i);
});

test("Migration 261 preserves historical anomaly for audit using NOT VALID", () => {
  assert.match(migration, /NOT VALID/i);
  assert.match(migration, /preserving pre-existing historical anomalies/i);
});
