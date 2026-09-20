/**
 * Phase 52: ERP Forensic Hardening, Immutability & 3-Way Match Verification Test Suite
 * Validates Migration 52 improvements for:
 * 1. Supplier invoices default match_status 'UNMATCHED'
 * 2. Mandatory 3-way match validation before GL posting (GRN + PO + Tolerance)
 * 3. Fail-closed role authorization on close_fiscal_period & reopen_fiscal_period
 * 4. Header field immutability on journal entry reversal
 * 5. Defense against journal line-move attacks (UPDATE journal_entry_id)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 52 - ERP Forensic Hardening & Invariant Verification", async (t) => {
  const m52Path = path.join(ROOT, "supabase/migrations/20260921050000_erp_forensic_hardening.sql");
  assert.ok(fs.existsSync(m52Path), "Migration 52 file must exist");
  const m52Code = fs.readFileSync(m52Path, "utf8");

  await t.test("1. Supplier Invoices Table: Default match_status must be UNMATCHED", () => {
    assert.match(m52Code, /ALTER TABLE public\.supplier_invoices\s+ALTER COLUMN match_status SET DEFAULT 'UNMATCHED';/);
  });

  await t.test("2. Close Fiscal Period RPC: Enforces fail-closed caller role authorization", () => {
    assert.match(m52Code, /CREATE OR REPLACE FUNCTION public\.close_fiscal_period/);
    assert.match(m52Code, /IF v_calling_user_id IS NULL THEN/);
    assert.match(m52Code, /Access denied: Authentication required to close fiscal period/);
    assert.match(m52Code, /LOWER\(r\.name\) IN \('super_admin', 'admin', 'accountant', 'finance_manager'\)/);
    assert.match(m52Code, /Access denied: Caller lacks authorized role to close fiscal period/);
  });

  await t.test("3. Reopen Fiscal Period RPC: Strict fail-closed super_admin / admin authorization", () => {
    assert.match(m52Code, /CREATE OR REPLACE FUNCTION public\.reopen_fiscal_period/);
    assert.match(m52Code, /IF v_calling_user_id IS NULL THEN/);
    assert.match(m52Code, /Access denied: Authentication required to reopen fiscal period/);
    assert.match(m52Code, /LOWER\(r\.name\) IN \('super_admin', 'admin'\)/);
    assert.match(m52Code, /Access denied: Only super_admin or admin can reopen closed fiscal periods/);
  });

  await t.test("4. Journal Entry Header Immutability: Strict column-by-column equality during reversal", () => {
    assert.match(m52Code, /CREATE OR REPLACE FUNCTION public\.trg_fn_enforce_journal_entry_immutability/);
    assert.match(m52Code, /NEW\.entry_number = OLD\.entry_number/);
    assert.match(m52Code, /NEW\.organization_id = OLD\.organization_id/);
    assert.match(m52Code, /NEW\.entry_date = OLD\.entry_date/);
    assert.match(m52Code, /NEW\.total_debit = OLD\.total_debit/);
    assert.match(m52Code, /NEW\.total_credit = OLD\.total_credit/);
    assert.match(m52Code, /Cannot alter financial fields, metadata, or dates during reversal/);
  });

  await t.test("5. Journal Line Immutability: Blocks line-move attack and cross-entry injection", () => {
    assert.match(m52Code, /CREATE OR REPLACE FUNCTION public\.trg_fn_enforce_journal_line_immutability/);
    assert.match(m52Code, /NEW\.journal_entry_id != OLD\.journal_entry_id/);
    assert.match(m52Code, /Transferring lines across journal entries is strictly prohibited/);
    assert.match(m52Code, /Cannot insert lines into already posted\/reversed entry/);
    assert.match(m52Code, /Cannot modify lines belonging to posted\/reversed entry/);
  });

  await t.test("6. Hardened 3-Way Match in post_supplier_invoice_to_gl_atomic", () => {
    assert.match(m52Code, /CREATE OR REPLACE FUNCTION public\.post_supplier_invoice_to_gl_atomic/);
    // Mandatory GRN check
    assert.match(m52Code, /IF v_sinv\.grn_id IS NULL THEN/);
    assert.match(m52Code, /cannot be posted without a verified Goods Receipt Note/);
    // PO supplier matching
    assert.match(m52Code, /v_po\.supplier_id != v_sinv\.supplier_id/);
    // Price discrepancy tolerance enforcement
    assert.match(m52Code, /ABS\(v_grn\.total_received_cost - v_sinv\.total_amount\) > 0\.05/);
    assert.match(m52Code, /match_status = 'PRICE_DISCREPANCY'/);
    // Automatic transition to MATCHED
    assert.match(m52Code, /match_status = 'MATCHED'/);
  });
});
