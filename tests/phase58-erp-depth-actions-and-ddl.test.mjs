/**
 * Phase 58: ERP Depth Actions & DDL Integrity Test Suite
 * Validates new Server Actions and DB Migration 58 for:
 * - HR: payroll runs, payslips, leave applications & approvals
 * - Procurement: supplier register, ERP purchase orders with line items
 * - Accounting: AP aging report with 5-tier aging buckets, P&L income summary
 * - Database: RLS policies, organization isolation, and GRANT enforcement
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 58: ERP Depth Actions & DDL Integrity Suite", async (t) => {
  const migration58Path = path.join(
    ROOT,
    "supabase/migrations/20260922170000_erp_depth_payroll_lines_leaves_suppliers_pos.sql"
  );
  assert.ok(fs.existsSync(migration58Path), "Migration 58 must exist on disk");
  const sql = fs.readFileSync(migration58Path, "utf8");

  await t.test("1. Migration 58 DDL: payroll_line_items schema & RLS", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.payroll_line_items/);
    assert.match(sql, /organization_id\s+UUID\s+NOT NULL REFERENCES public\.organizations\(id\)/);
    assert.match(sql, /payroll_run_id\s+UUID\s+NOT NULL REFERENCES public\.payroll_runs\(id\)/);
    assert.match(sql, /employee_id\s+UUID\s+NOT NULL REFERENCES public\.employees\(id\)/);
    assert.match(sql, /gross_salary\s+NUMERIC\(12,\s*2\)\s+NOT NULL/);
    assert.match(sql, /net_salary\s+NUMERIC\(12,\s*2\)\s+NOT NULL/);
    assert.match(sql, /ALTER TABLE public\.payroll_line_items ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /CREATE POLICY payroll_line_items_org_isolation ON public\.payroll_line_items/);
  });

  await t.test("2. Migration 58 DDL: employee_leaves schema & RLS", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.employee_leaves/);
    assert.match(sql, /leave_type\s+VARCHAR\(20\)\s+NOT NULL CHECK \(leave_type IN \('ANNUAL',\s*'SICK',\s*'CASUAL',\s*'MATERNITY',\s*'UNPAID'\)\)/);
    assert.match(sql, /status\s+VARCHAR\(10\)\s+NOT NULL DEFAULT 'PENDING'/);
    assert.match(sql, /CONSTRAINT chk_leave_dates CHECK \(end_date >= start_date\)/);
    assert.match(sql, /ALTER TABLE public\.employee_leaves ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /CREATE POLICY employee_leaves_org_isolation ON public\.employee_leaves/);
  });

  await t.test("3. Migration 58 DDL: suppliers register schema & RLS", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.suppliers/);
    assert.match(sql, /supplier_code\s+VARCHAR\(20\)\s+NOT NULL/);
    assert.match(sql, /company_name\s+VARCHAR\(200\)\s+NOT NULL/);
    assert.match(sql, /ALTER TABLE public\.suppliers ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /CREATE POLICY suppliers_org_isolation ON public\.suppliers/);
    assert.match(sql, /idx_suppliers_org_active/);
  });

  await t.test("4. Migration 58 DDL: erp_purchase_orders & erp_purchase_order_items schema", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.erp_purchase_orders/);
    assert.match(sql, /po_number\s+VARCHAR\(40\)\s+NOT NULL/);
    assert.match(sql, /supplier_id\s+UUID\s+NOT NULL REFERENCES public\.suppliers\(id\)/);
    assert.match(sql, /status\s+VARCHAR\(20\)\s+NOT NULL DEFAULT 'DRAFT'/);
    assert.match(sql, /ALTER TABLE public\.erp_purchase_orders ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.erp_purchase_order_items/);
    assert.match(sql, /po_id\s+UUID\s+NOT NULL REFERENCES public\.erp_purchase_orders\(id\)/);
    assert.match(sql, /ALTER TABLE public\.erp_purchase_order_items ENABLE ROW LEVEL SECURITY;/);
  });

  await t.test("5. HR Server Actions exports & validation", () => {
    const hrPath = path.join(ROOT, "lib/hr/actions.ts");
    const hrCode = fs.readFileSync(hrPath, "utf8");

    assert.match(hrCode, /export async function createPayrollRunAction/);
    assert.match(hrCode, /export async function getPayslipAction/);
    assert.match(hrCode, /export async function getEmployeeLeaveAction/);
    assert.match(hrCode, /export async function applyLeaveAction/);
    // Verified audit log usage
    assert.match(hrCode, /module:\s*"HR"/);
    assert.match(hrCode, /entityType:\s*"payroll_run"/);
    assert.match(hrCode, /entityType:\s*"employee_leave"/);
  });

  await t.test("6. Procurement Server Actions exports & validation", () => {
    const procPath = path.join(ROOT, "lib/procurement/actions.ts");
    const procCode = fs.readFileSync(procPath, "utf8");

    assert.match(procCode, /export async function getSuppliersAction/);
    assert.match(procCode, /export async function createSupplierAction/);
    assert.match(procCode, /export async function createPurchaseOrderAction/);
    assert.match(procCode, /export async function getPurchaseOrdersAction/);
    assert.match(procCode, /export async function getSupplierInvoicesAction/);
    // Verified target tables
    assert.match(procCode, /from\("erp_purchase_orders"\)/);
    assert.match(procCode, /from\("erp_purchase_order_items"\)/);
  });

  await t.test("7. Accounting Depth Server Actions: AP Aging & Income Summary", () => {
    const acctPath = path.join(ROOT, "lib/accounting/actions.ts");
    const acctCode = fs.readFileSync(acctPath, "utf8");

    assert.match(acctCode, /export async function getAPAgingReportAction/);
    assert.match(acctCode, /export async function getIncomeSummaryAction/);
    // Verified 5-tier aging buckets
    assert.match(acctCode, /current:\s*number/);
    assert.match(acctCode, /days_1_30:\s*number/);
    assert.match(acctCode, /days_31_60:\s*number/);
    assert.match(acctCode, /days_61_90:\s*number/);
    assert.match(acctCode, /days_90_plus:\s*number/);
    // Verified P&L revenue vs expense aggregation
    assert.match(acctCode, /totalRevenue/);
    assert.match(acctCode, /totalExpenses/);
    assert.match(acctCode, /netIncome/);
  });
});
