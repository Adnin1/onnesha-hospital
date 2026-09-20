/**
 * Phase 50: Accounting Period Control, Posted Journal Immutability,
 * 3-Way Match Supplier Liability & FEFO Expiry Validation Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 50 - Accounting Period Control & Advanced ERP Integrity", async (t) => {
  const m50Path = path.join(ROOT, "supabase/migrations/20260921040000_accounting_period_control_and_immutability.sql");
  const m51Path = path.join(ROOT, "supabase/migrations/20260921041000_clean_supplier_invoice_gl_warning.sql");
  const accountingActionsPath = path.join(ROOT, "lib/accounting/actions.ts");
  const accountingPagePath = path.join(ROOT, "app/(hospital)/app/accounting/page.tsx");

  assert.ok(fs.existsSync(m50Path), "Migration 50 file must exist");
  assert.ok(fs.existsSync(m51Path), "Migration 51 file must exist");
  assert.ok(fs.existsSync(accountingActionsPath), "lib/accounting/actions.ts must exist");
  assert.ok(fs.existsSync(accountingPagePath), "app/(hospital)/app/accounting/page.tsx must exist");

  const m50Code = fs.readFileSync(m50Path, "utf8");
  const m51Code = fs.readFileSync(m51Path, "utf8");
  const actionsCode = fs.readFileSync(accountingActionsPath, "utf8");
  const pageCode = fs.readFileSync(accountingPagePath, "utf8");

  await t.test("1. Fiscal Periods Table & Period Locking RPCs", () => {
    assert.match(m50Code, /CREATE TABLE IF NOT EXISTS public\.fiscal_periods/);
    assert.match(m50Code, /period_name VARCHAR\(50\) NOT NULL/);
    assert.match(m50Code, /is_closed BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(m50Code, /check_fiscal_period_dates CHECK \(start_date <= end_date\)/);
    assert.match(m50Code, /uq_org_fiscal_period_name UNIQUE \(organization_id, period_name\)/);
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.close_fiscal_period/);
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.reopen_fiscal_period/);
  });

  await t.test("2. Closed Accounting Period Protection in Journal Posting", () => {
    assert.match(m50Code, /SELECT period_name INTO v_closed_period_name/);
    assert.match(m50Code, /FROM public\.fiscal_periods/);
    assert.match(m50Code, /AND is_closed = TRUE/);
    assert.match(m50Code, /AND v_target_date BETWEEN start_date AND end_date/);
    assert.match(m50Code, /USING ERRCODE = '22023'/);
  });

  await t.test("3. Posted Journal Entry Immutability Database Triggers", () => {
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.trg_fn_enforce_journal_entry_immutability/);
    assert.match(m50Code, /CREATE TRIGGER trg_journal_entries_immutability/);
    assert.match(m50Code, /BEFORE UPDATE OR DELETE ON public\.journal_entries/);
    assert.match(m50Code, /USING ERRCODE = '23506'/);
    // Allow status transition to REVERSED only
    assert.match(m50Code, /OLD\.status = 'POSTED' AND NEW\.status = 'REVERSED'/);
  });

  await t.test("4. Journal Line Immutability Database Triggers", () => {
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.trg_fn_enforce_journal_line_immutability/);
    assert.match(m50Code, /CREATE TRIGGER trg_journal_lines_immutability/);
    assert.match(m50Code, /BEFORE INSERT OR UPDATE OR DELETE ON public\.journal_entry_lines/);
    assert.match(m50Code, /Immutable Journal Line Error/);
  });

  await t.test("5. Atomic Journal Entry Reversal RPC", () => {
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.reverse_journal_entry_atomic/);
    // Swaps debit and credit
    assert.match(m50Code, /'debit', v_line\.credit/);
    assert.match(m50Code, /'credit', v_line\.debit/);
    assert.match(m50Code, /'REVERSED'/);
    assert.match(m50Code, /REV-/);
  });

  await t.test("6. Supplier Invoices Table & 3-Way Match AP Posting RPC", () => {
    assert.match(m50Code, /CREATE TABLE IF NOT EXISTS public\.supplier_invoices/);
    assert.match(m50Code, /match_status VARCHAR\(30\) NOT NULL DEFAULT 'MATCHED'/);
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.post_supplier_invoice_to_gl_atomic/);
    assert.match(m51Code, /CREATE OR REPLACE FUNCTION public\.post_supplier_invoice_to_gl_atomic/);
    // Verifies 3-way match
    assert.match(m51Code, /ABS\(v_grn\.total_received_cost - v_sinv\.total_amount\) > 0\.05/);
    assert.match(m51Code, /PRICE_DISCREPANCY/);
    // Debits Inventory 1200, Credits Accounts Payable 2010
    assert.match(m51Code, /account_code = '1200'/);
    assert.match(m51Code, /account_code = '2010'/);
  });

  await t.test("7. Supplier Payment to GL RPC", () => {
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.record_supplier_payment_to_gl_atomic/);
    // Debits 2010, Credits Cash/Bank
    assert.match(m50Code, /Settlement of supplier invoice/);
    assert.match(m50Code, /p_payment_amount/);
    assert.match(m50Code, /payment_status = v_new_status/);
  });

  await t.test("8. Jurisdictional Payroll Accrual to GL RPC", () => {
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.post_payroll_accrual_to_gl_atomic/);
    // Debits Gross Salary 5100, Credits Deductions 2020, Credits Net Payable 2025
    assert.match(m50Code, /account_code = '5100'/);
    assert.match(m50Code, /account_code = '2020'/);
    assert.match(m50Code, /account_code = '2025'/);
    assert.match(m50Code, /'2025', 'Net Salaries Payable', 'LIABILITY'/);
  });

  await t.test("9. Fixed Asset Maintenance Expense vs Capitalization RPC", () => {
    assert.match(m50Code, /CREATE OR REPLACE FUNCTION public\.record_asset_maintenance_to_gl_atomic/);
    assert.match(m50Code, /p_is_capitalized/);
    assert.match(m50Code, /account_code = '1500'/);
    assert.match(m50Code, /account_code = '5300'/);
  });

  await t.test("10. FEFO Non-Expired Batch Validation in Pharmacy Dispensing", () => {
    assert.match(m50Code, /v_expiry_date IS NOT NULL AND v_expiry_date < CURRENT_DATE/);
    assert.match(m50Code, /Dispensing Error: Batch % expired on % and cannot be dispensed to patient/);
  });

  await t.test("11. TypeScript Actions & Audit Trail", () => {
    assert.match(actionsCode, /export async function getFiscalPeriodsAction/);
    assert.match(actionsCode, /export async function closeFiscalPeriodAction/);
    assert.match(actionsCode, /export async function reopenFiscalPeriodAction/);
    assert.match(actionsCode, /export async function reverseJournalEntryAction/);
    assert.match(actionsCode, /export async function postSupplierInvoiceToGlAction/);
    assert.match(actionsCode, /export async function recordSupplierPaymentToGlAction/);
    assert.match(actionsCode, /export async function postPayrollAccrualToGlAction/);
    assert.match(actionsCode, /export async function recordAssetMaintenanceToGlAction/);
  });

  await t.test("12. Accounting Page UI Integration", () => {
    assert.match(pageCode, /activeTab === "PERIODS"/);
    assert.match(pageCode, /Accounting Period Control/);
    assert.match(pageCode, /handleReverseJournal/);
    assert.match(pageCode, /handleTogglePeriod/);
    assert.match(pageCode, /Undo2/);
  });
});
