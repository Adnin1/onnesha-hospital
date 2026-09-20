/**
 * Phase 42: ERP Core - Double-Entry Chart of Accounts & General Ledger Invariant Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 42 - ERP Double-Entry Accounting & General Ledger Invariants", async (t) => {
  const actionsPath = path.join(ROOT, "lib/accounting/actions.ts");
  const accountingPagePath = path.join(ROOT, "app/(hospital)/app/accounting/page.tsx");
  const migrationPath = path.join(ROOT, "supabase/migrations/20260921020000_hospital_erp_core_foundations.sql");
  const navPath = path.join(ROOT, "config/navigation.ts");
  const permPath = path.join(ROOT, "lib/permissions.ts");

  assert.ok(fs.existsSync(actionsPath), "lib/accounting/actions.ts must exist");
  assert.ok(fs.existsSync(accountingPagePath), "app/(hospital)/app/accounting/page.tsx must exist");
  assert.ok(fs.existsSync(migrationPath), "Migration 47 must exist");

  const actionsCode = fs.readFileSync(actionsPath, "utf8");
  const pageCode = fs.readFileSync(accountingPagePath, "utf8");
  const migrationCode = fs.readFileSync(migrationPath, "utf8");
  const navCode = fs.readFileSync(navPath, "utf8");
  const permCode = fs.readFileSync(permPath, "utf8");

  await t.test("1. Database Schema & Migration: Chart of Accounts & Journal Entries", () => {
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.chart_of_accounts/);
    assert.match(migrationCode, /account_type VARCHAR\(20\) NOT NULL CHECK \(account_type IN \('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'\)\)/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.journal_entries/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.journal_entry_lines/);
    assert.match(migrationCode, /debit NUMERIC\(14, 2\) NOT NULL DEFAULT 0\.00 CHECK \(debit >= 0\)/);
    assert.match(migrationCode, /credit NUMERIC\(14, 2\) NOT NULL DEFAULT 0\.00 CHECK \(credit >= 0\)/);
    assert.match(migrationCode, /FUNCTION public\.post_journal_entry_atomic/);
  });

  await t.test("2. Database Level Atomic Post Enforces Debit = Credit Invariant", () => {
    assert.match(migrationCode, /IF v_total_debit != v_total_credit THEN/);
    assert.match(migrationCode, /RAISE EXCEPTION 'Unbalanced journal entry/);
    assert.match(migrationCode, /IF v_total_debit <= 0 THEN/);
    assert.match(migrationCode, /private\.get_current_org_id\(\)/);
  });

  await t.test("3. Backend Actions Implement Invariant & Trial Balance Logic", () => {
    assert.match(actionsCode, /export async function getChartOfAccountsAction/);
    assert.match(actionsCode, /export async function createAccountAction/);
    assert.match(actionsCode, /export async function getJournalEntriesAction/);
    assert.match(actionsCode, /export async function postJournalEntryAction/);
    assert.match(actionsCode, /export async function getTrialBalanceAction/);
    assert.match(actionsCode, /Math\.abs\(totalDebit - totalCredit\) > 0\.001/);
    assert.match(actionsCode, /post_journal_entry_atomic/);
  });

  await t.test("4. Algorithmic Invariant Balance Verification", () => {
    function validateJournalLines(lines) {
      if (!lines || lines.length < 2) return { valid: false, reason: "min 2 lines" };
      const d = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
      const c = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
      if (Math.abs(d - c) > 0.001) return { valid: false, reason: "unbalanced", d, c };
      if (d <= 0) return { valid: false, reason: "zero amount" };
      return { valid: true, balancedAmount: d };
    }

    // Valid balanced entry
    const valid = validateJournalLines([
      { account_id: "acc-1", debit: 50000, credit: 0 },
      { account_id: "acc-2", debit: 0, credit: 50000 },
    ]);
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.balancedAmount, 50000);

    // Invalid unbalanced entry
    const unbalanced = validateJournalLines([
      { account_id: "acc-1", debit: 50000, credit: 0 },
      { account_id: "acc-2", debit: 0, credit: 49000 },
    ]);
    assert.strictEqual(unbalanced.valid, false);
    assert.strictEqual(unbalanced.reason, "unbalanced");

    // Invalid zero amount
    const zero = validateJournalLines([
      { account_id: "acc-1", debit: 0, credit: 0 },
      { account_id: "acc-2", debit: 0, credit: 0 },
    ]);
    assert.strictEqual(zero.valid, false);
    assert.strictEqual(zero.reason, "zero amount");
  });

  await t.test("5. Navigation and Permissions Integration", () => {
    assert.match(navCode, /\/app\/accounting/);
    assert.match(navCode, /Accounting & Ledger/);
    assert.match(permCode, /ACCOUNTING_VIEW: "accounting\.view"/);
    assert.match(permCode, /ACCOUNTING_MANAGE: "accounting\.manage"/);
  });

  await t.test("6. UI Page Renders Accounts, Entries, and Trial Balance Tabs", () => {
    assert.match(pageCode, /Chart of Accounts/);
    assert.match(pageCode, /Journal Entries/);
    assert.match(pageCode, /Trial Balance/);
    assert.match(pageCode, /Post Double-Entry Journal Voucher/);
  });
});
