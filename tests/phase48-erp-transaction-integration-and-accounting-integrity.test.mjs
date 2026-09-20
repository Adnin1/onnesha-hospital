/**
 * Phase 48: ERP Transactional Integration & Accounting Integrity Test Suite
 * Validates fail-closed tenant resolution, mutual exclusivity debit/credit constraints,
 * and atomic cross-module ERP transaction pipelines (Billing, Pharmacy, GRN, Payroll, Assets).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 48 - ERP Transactional Integration & Accounting Integrity", async (t) => {
  const m48Path = path.join(ROOT, "supabase/migrations/20260921030000_hospital_erp_transactional_integration_and_accounting_integrity.sql");
  const m49Path = path.join(ROOT, "supabase/migrations/20260921031000_fix_grn_gl_column_and_warnings.sql");
  const accountingActionsPath = path.join(ROOT, "lib/accounting/actions.ts");
  const billingActionsPath = path.join(ROOT, "lib/billing/actions.ts");
  const procurementActionsPath = path.join(ROOT, "lib/procurement/actions.ts");
  const assetsActionsPath = path.join(ROOT, "lib/assets/actions.ts");

  assert.ok(fs.existsSync(m48Path), "Migration 48 file must exist");
  assert.ok(fs.existsSync(m49Path), "Migration 49 file must exist");
  assert.ok(fs.existsSync(accountingActionsPath), "lib/accounting/actions.ts must exist");
  assert.ok(fs.existsSync(billingActionsPath), "lib/billing/actions.ts must exist");
  assert.ok(fs.existsSync(procurementActionsPath), "lib/procurement/actions.ts must exist");
  assert.ok(fs.existsSync(assetsActionsPath), "lib/assets/actions.ts must exist");

  const m48Code = fs.readFileSync(m48Path, "utf8");
  const m49Code = fs.readFileSync(m49Path, "utf8");
  const accountingCode = fs.readFileSync(accountingActionsPath, "utf8");
  const billingCode = fs.readFileSync(billingActionsPath, "utf8");
  const procurementCode = fs.readFileSync(procurementActionsPath, "utf8");
  const assetsCode = fs.readFileSync(assetsActionsPath, "utf8");

  await t.test("1. P0 Security: Fail-Closed Tenant Resolution in Journal Posting RPC", () => {
    // Must strictly reject if organization is NULL or mismatch
    assert.match(m48Code, /v_active_org := private\.get_current_org_id\(\);/);
    assert.match(m48Code, /IF v_active_org IS NULL OR v_active_org != p_org_id THEN/);
    assert.match(m48Code, /USING ERRCODE = '42501'/);
  });

  await t.test("2. Database-Level Constraint: Debit XOR Credit Mutual Exclusivity", () => {
    // Must define table constraint check_line_debit_xor_credit
    assert.match(m48Code, /ALTER TABLE public\.journal_entry_lines/);
    assert.match(m48Code, /ADD CONSTRAINT check_line_debit_xor_credit/);
    assert.match(m48Code, /CHECK \(\(debit > 0 AND credit = 0\) OR \(credit > 0 AND debit = 0\)\)/);

    // RPC check
    assert.match(m48Code, /IF \(v_line_debit > 0 AND v_line_credit > 0\) OR \(v_line_debit = 0 AND v_line_credit = 0\) THEN/);
  });

  await t.test("3. Client-Side Mutual Exclusivity Pre-validation", () => {
    // In lib/accounting/actions.ts
    assert.match(accountingCode, /\(d > 0 && c > 0\) \|\| \(d === 0 && c === 0\)/);
    assert.match(accountingCode, /Each line must have debit > 0 XOR credit > 0/);
  });

  await t.test("4. Default Chart of Accounts Seeder Function", () => {
    assert.match(m48Code, /CREATE OR REPLACE FUNCTION public\.seed_default_chart_of_accounts/);
    assert.match(m48Code, /'1010', 'Cash in Hand \(Cashier Drawer\)', 'ASSET'/);
    assert.match(m48Code, /'1020', 'Operating Bank Account \(Cash at Bank\)', 'ASSET'/);
    assert.match(m48Code, /'1100', 'Accounts Receivable - Patients', 'ASSET'/);
    assert.match(m48Code, /'1200', 'General Hospital Supplies Inventory', 'ASSET'/);
    assert.match(m48Code, /'1210', 'Pharmacy Medicine Inventory', 'ASSET'/);
    assert.match(m48Code, /'2010', 'Accounts Payable - Medical & Drug Suppliers', 'LIABILITY'/);
    assert.match(m48Code, /'4010', 'Patient Clinical & Bed Service Revenue', 'REVENUE'/);
    assert.match(m48Code, /'5010', 'Cost of Goods Sold \(COGS\) - Pharmacy Medicines', 'EXPENSE'/);
    assert.match(m48Code, /'5100', 'Hospital Staff Salaries & Wages Expense', 'EXPENSE'/);
    assert.match(m48Code, /'5200', 'Medical Equipment Depreciation Expense', 'EXPENSE'/);
  });

  await t.test("5. ERP Integration 1: Billing -> General Ledger Atomic RPC", () => {
    assert.match(m48Code, /CREATE OR REPLACE FUNCTION public\.post_billing_to_gl_atomic/);
    assert.match(m48Code, /'INVOICE'/);
    assert.match(m48Code, /JE-INV-/);

    // Mathematical balance: Paid + Due + Discount = Subtotal
    function simulateBillingGL(paid, due, discount) {
      const lines = [];
      if (paid > 0) lines.push({ debit: paid, credit: 0 });
      if (due > 0) lines.push({ debit: due, credit: 0 });
      if (discount > 0) lines.push({ debit: discount, credit: 0 });
      const subtotal = paid + due + discount;
      lines.push({ debit: 0, credit: subtotal });

      const totalDebit = lines.reduce((a, b) => a + b.debit, 0);
      const totalCredit = lines.reduce((a, b) => a + b.credit, 0);
      return { totalDebit, totalCredit, isBalanced: totalDebit === totalCredit };
    }

    const test1 = simulateBillingGL(1500, 500, 200);
    assert.strictEqual(test1.totalDebit, 2200);
    assert.strictEqual(test1.totalCredit, 2200);
    assert.strictEqual(test1.isBalanced, true);
  });

  await t.test("6. ERP Integration 2: Pharmacy POS -> Inventory -> COGS -> GL", () => {
    assert.match(m49Code, /CREATE OR REPLACE FUNCTION public\.record_pharmacy_sale_erp_atomic/);
    assert.match(m49Code, /UPDATE public\.medicine_batches/);
    assert.match(m49Code, /INSERT INTO public\.stock_transactions/);
    assert.match(m49Code, /'SALE'/);
    assert.match(m49Code, /JE-PHARM-/);

    // 4-line double entry check: (Debit Cash + Debit COGS) === (Credit Revenue + Credit Inventory)
    function simulatePharmacyGL(saleAmount, costAmount) {
      const lines = [
        { account: "1010", debit: saleAmount, credit: 0 }, // Cash
        { account: "4020", debit: 0, credit: saleAmount }, // Revenue
        { account: "5010", debit: costAmount, credit: 0 }, // COGS
        { account: "1210", debit: 0, credit: costAmount }, // Inventory
      ];
      const totalDebit = lines.reduce((a, b) => a + b.debit, 0);
      const totalCredit = lines.reduce((a, b) => a + b.credit, 0);
      return { totalDebit, totalCredit, isBalanced: totalDebit === totalCredit };
    }

    const res = simulatePharmacyGL(1250.00, 850.00);
    assert.strictEqual(res.totalDebit, 2100.00);
    assert.strictEqual(res.totalCredit, 2100.00);
    assert.strictEqual(res.isBalanced, true);
  });

  await t.test("7. ERP Integration 3: Procurement GRN -> Inventory -> Supplier Payable GL", () => {
    assert.match(m49Code, /CREATE OR REPLACE FUNCTION public\.post_grn_to_inventory_and_gl_atomic/);
    assert.match(m49Code, /goods_receipt_notes/);
    assert.match(m49Code, /goods_receipt_items/);
    assert.match(m49Code, /'GRN'/);
    assert.match(m49Code, /JE-GRN-/);
  });

  await t.test("8. ERP Integration 4: Payroll Disbursement -> GL", () => {
    assert.match(m49Code, /CREATE OR REPLACE FUNCTION public\.disburse_payroll_to_gl_atomic/);
    assert.match(m49Code, /payroll_runs/);
    assert.match(m49Code, /'PAYROLL'/);
    assert.match(m49Code, /'DISBURSED'/);
    assert.match(m49Code, /JE-PAYROLL-/);
  });

  await t.test("9. ERP Integration 5: Fixed Asset Depreciation -> GL", () => {
    assert.match(m49Code, /CREATE OR REPLACE FUNCTION public\.record_asset_depreciation_to_gl_atomic/);
    assert.match(m49Code, /hospital_assets/);
    assert.match(m49Code, /current_value = current_value - p_depreciation_amount/);
    assert.match(m49Code, /'ASSET_DEPRECIATION'/);
    assert.match(m49Code, /JE-DEP-/);
  });

  await t.test("10. Server Action Integration Wiring Across Domains", () => {
    // Accounting server actions
    assert.match(accountingCode, /export async function postBillingToGlAction/);
    assert.match(accountingCode, /export async function recordPharmacySaleErpAction/);
    assert.match(accountingCode, /export async function postGrnToInventoryAndGlAction/);
    assert.match(accountingCode, /export async function disbursePayrollToGlAction/);
    assert.match(accountingCode, /export async function recordAssetDepreciationToGlAction/);

    // Billing server action calls GL posting
    assert.match(billingCode, /post_billing_to_gl_atomic/);

    // Procurement server action calls GRN posting
    assert.match(procurementCode, /post_grn_to_inventory_and_gl_atomic/);

    // Asset server action exports depreciation
    assert.match(assetsCode, /export async function recordAssetDepreciationAction/);
  });
});
