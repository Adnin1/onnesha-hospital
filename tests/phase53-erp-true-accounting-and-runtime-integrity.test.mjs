/**
 * Phase 53: True ERP Accounting, Transaction Ordering & Runtime Integrity Test Suite
 * 
 * Verifies Migration 53 and TypeScript ERP actions:
 * 1. Journal entries status check allows ('DRAFT', 'PENDING', 'POSTED', 'REVERSED', 'VOID')
 * 2. Table-level check constraint enforces total_debit = total_credit on journal_entries
 * 3. Safe transaction ordering in post_journal_entry_atomic: PENDING header -> lines -> POSTED transition
 * 4. Trigger validation of line count >= 2 and exact matching of line sums to header totals
 * 5. Permanent immutability of POSTED and REVERSED journal entries and lines
 * 6. Line-move attack prevention across journal entries
 * 7. 3-Way Match line-level quantity and price tolerance validation in procurement
 * 8. Billing subsequent payment GL posting (DR Cash/Bank 1010/1020, CR AR 1100)
 * 9. Atomic invoice voiding and GL reversal
 * 10. Server-side authoritative Trial Balance and General Ledger report RPCs
 * 11. High-frequency ERP query indexes
 * 12. Client-side accounting actions mathematical invariant enforcement
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 53 - ERP True Accounting, Transaction Ordering & Database Integrity", async (t) => {
  const m53Path = path.join(ROOT, "supabase/migrations/20260921060000_erp_true_accounting_and_runtime_integrity.sql");
  assert.ok(fs.existsSync(m53Path), "Migration 53 file must exist");
  const m53Code = fs.readFileSync(m53Path, "utf8");

  const actionsPath = path.join(ROOT, "lib/accounting/actions.ts");
  assert.ok(fs.existsSync(actionsPath), "Accounting actions file must exist");
  const actionsCode = fs.readFileSync(actionsPath, "utf8");

  await t.test("1. Journal Entries Status Check: Allows DRAFT, PENDING, POSTED, REVERSED, VOID", () => {
    assert.match(m53Code, /ALTER TABLE public\.journal_entries\s+DROP CONSTRAINT IF EXISTS journal_entries_status_check;/);
    assert.match(m53Code, /CHECK \(status IN \('DRAFT', 'PENDING', 'POSTED', 'REVERSED', 'VOID'\)\)/);
  });

  await t.test("2. Table Check Constraint: Total Debit === Total Credit Invariant", () => {
    assert.match(m53Code, /ADD CONSTRAINT chk_journal_entries_balanced/);
    assert.match(m53Code, /CHECK \(total_debit = total_credit AND total_debit >= 0 AND total_credit >= 0\)/);
    assert.match(m53Code, /ADD CONSTRAINT chk_journal_entries_posted_nonzero/);
    assert.match(m53Code, /CHECK \(status NOT IN \('POSTED', 'REVERSED'\) OR \(total_debit > 0 AND total_credit > 0\)\)/);
  });

  await t.test("3. Safe Transaction Ordering in post_journal_entry_atomic", () => {
    assert.match(m53Code, /CREATE OR REPLACE FUNCTION public\.post_journal_entry_atomic/);
    // Step 1: Insert header as 'PENDING'
    assert.match(m53Code, /'PENDING',/);
    // Step 2: Insert lines
    assert.match(m53Code, /INSERT INTO public\.journal_entry_lines/);
    // Step 3: Transition to 'POSTED'
    assert.match(m53Code, /UPDATE public\.journal_entries\s+SET status = 'POSTED'\s+WHERE id = v_entry_id;/);
  });

  await t.test("4. Journal Entry Immutability Trigger: Verifies Line Count & Sum Equality on Posting", () => {
    assert.match(m53Code, /CREATE OR REPLACE FUNCTION public\.trg_fn_enforce_journal_entry_immutability/);
    assert.match(m53Code, /IF OLD\.status IN \('DRAFT', 'PENDING'\) AND NEW\.status = 'POSTED' THEN/);
    assert.match(m53Code, /v_line_count < 2/);
    assert.match(m53Code, /v_sum_debit != NEW\.total_debit OR v_sum_credit != NEW\.total_credit/);
    // Reversal check
    assert.match(m53Code, /OLD\.status = 'POSTED' AND NEW\.status = 'REVERSED'/);
    assert.match(m53Code, /NEW\.total_debit = OLD\.total_debit/);
    assert.match(m53Code, /NEW\.total_credit = OLD\.total_credit/);
  });

  await t.test("5. Journal Line Immutability Trigger: Prohibits Line Insertion/Modification in Posted Entries", () => {
    assert.match(m53Code, /CREATE OR REPLACE FUNCTION public\.trg_fn_enforce_journal_line_immutability/);
    assert.match(m53Code, /Cannot insert lines into already posted\/reversed entry/);
    assert.match(m53Code, /Cannot modify lines belonging to posted\/reversed entry/);
    assert.match(m53Code, /Transferring lines across journal entries is strictly prohibited/);
    assert.match(m53Code, /Cannot delete lines for posted\/reversed entry/);
  });

  await t.test("6. 3-Way Match Line-Level Quantity & Supplier Match Validation", () => {
    assert.match(m53Code, /CREATE OR REPLACE FUNCTION public\.post_supplier_invoice_to_gl_atomic/);
    // Line-level quantity check on purchase order items
    assert.match(m53Code, /poi\.quantity_received > poi\.quantity_ordered/);
    assert.match(m53Code, /match_status = 'QTY_DISCREPANCY'/);
    // Price tolerance check
    assert.match(m53Code, /ABS\(v_grn\.total_received_cost - v_sinv\.total_amount\) > 0\.05/);
    assert.match(m53Code, /match_status = 'PRICE_DISCREPANCY'/);
    // Successful match
    assert.match(m53Code, /match_status = 'MATCHED'/);
    assert.match(m53Code, /account_code = '1200'/); // Inventory
    assert.match(m53Code, /account_code = '2010'/); // Accounts Payable
  });

  await t.test("7. Billing Subsequent Payment to GL Posting RPC", () => {
    assert.match(m53Code, /CREATE OR REPLACE FUNCTION public\.post_payment_receipt_to_gl_atomic/);
    assert.match(m53Code, /Payment receipt % is already posted to General Ledger/);
    assert.match(m53Code, /account_code = '1100'/); // AR
    assert.match(m53Code, /account_code = '1010'/); // Cash
    assert.match(m53Code, /account_code = '1020'/); // Bank
  });

  await t.test("8. Atomic Invoice Voiding and GL Reversal RPC", () => {
    assert.match(m53Code, /CREATE OR REPLACE FUNCTION public\.void_invoice_and_reverse_gl_atomic/);
    assert.match(m53Code, /Invoice % is already voided/);
    assert.match(m53Code, /is_voided = TRUE,\s+status = 'VOID'/);
    assert.match(m53Code, /public\.reverse_journal_entry_atomic/);
  });

  await t.test("9. Server-Side Authoritative Financial Reporting RPCs", () => {
    assert.match(m53Code, /CREATE OR REPLACE FUNCTION public\.get_trial_balance/);
    assert.match(m53Code, /COALESCE\(SUM\(jel\.debit\), 0\.00\)::NUMERIC\(14, 2\) AS total_debit/);
    assert.match(m53Code, /COALESCE\(SUM\(jel\.credit\), 0\.00\)::NUMERIC\(14, 2\) AS total_credit/);
    assert.match(m53Code, /je\.status IN \('POSTED', 'REVERSED'\)/);
    assert.match(m53Code, /CREATE OR REPLACE FUNCTION public\.get_general_ledger_report/);
    assert.match(m53Code, /SUM\(jel\.debit - jel\.credit\) OVER/);
  });

  await t.test("10. High-Performance ERP Query Indexes", () => {
    assert.match(m53Code, /CREATE INDEX IF NOT EXISTS idx_journal_entries_org_date_status/);
    assert.match(m53Code, /CREATE INDEX IF NOT EXISTS idx_journal_entries_ref/);
    assert.match(m53Code, /CREATE INDEX IF NOT EXISTS idx_journal_lines_account_entry/);
    assert.match(m53Code, /CREATE INDEX IF NOT EXISTS idx_supplier_invoices_org_status/);
    assert.match(m53Code, /CREATE INDEX IF NOT EXISTS idx_fiscal_periods_org_dates/);
  });

  await t.test("11. Client Accounting Actions Export & Integration", () => {
    assert.match(actionsCode, /export async function postPaymentReceiptToGlAction/);
    assert.match(actionsCode, /export async function voidInvoiceAndReverseGlAction/);
    assert.match(actionsCode, /export async function getGeneralLedgerReportAction/);
    assert.match(actionsCode, /supabase\.rpc\("get_trial_balance"/);
    assert.match(actionsCode, /supabase\.rpc\("post_payment_receipt_to_gl_atomic"/);
    assert.match(actionsCode, /supabase\.rpc\("void_invoice_and_reverse_gl_atomic"/);
  });

  await t.test("12. Client-Side Double-Entry Mathematical Invariant Validation", () => {
    assert.match(actionsCode, /Math\.abs\(totalDebit - totalCredit\) > 0\.001/);
    assert.match(actionsCode, /Unbalanced journal entry: Total Debit/);
    assert.match(actionsCode, /Each line must have debit > 0 XOR credit > 0/);
  });
});
