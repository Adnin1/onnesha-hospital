/**
 * Phase 59: Public Data Shielding & Database Integrity Constraints Test Suite
 * Validates:
 * - Public doctors view / RPC projection omitting commission/salary
 * - Direct table security on sensitive consultant tables
 * - Derived field DB constraints (payroll net salary, PO item total price)
 * - Thread-safe atomic sequential PO numbering generator
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 59: Public Data Shielding & Database Integrity Suite", async (t) => {
  const migration59Path = path.join(
    ROOT,
    "supabase/migrations/20260922193000_public_data_projection_and_erp_integrity_hardening.sql"
  );
  assert.ok(fs.existsSync(migration59Path), "Migration 59 must exist on disk");
  const sql = fs.readFileSync(migration59Path, "utf8");

  await t.test("1. Migration 59: public_doctors_view excludes sensitive salary/commission fields", () => {
    assert.match(sql, /CREATE OR REPLACE VIEW public\.public_doctors_view/);
    const viewMatch = sql.match(/CREATE OR REPLACE VIEW public\.public_doctors_view[\s\S]*?WHERE/);
    assert.ok(viewMatch, "view definition must be extractable");
    assert.doesNotMatch(viewMatch[0], /commission/i, "public_doctors_view must never expose commission columns");
    assert.doesNotMatch(viewMatch[0], /salary/i, "public_doctors_view must never expose salary columns");
    assert.match(sql, /GRANT SELECT ON public\.public_doctors_view TO anon/);
    assert.match(sql, /REVOKE SELECT ON public\.doctor_commission_rules FROM anon/);
    assert.match(sql, /REVOKE SELECT ON public\.doctor_commissions FROM anon/);
  });

  await t.test("2. Migration 59: get_public_doctors_directory secure RPC exists with empty search_path", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_public_doctors_directory/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path = ''/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_public_doctors_directory\(UUID\) TO anon/);
  });

  await t.test("3. Migration 59: Payroll net salary database check constraint", () => {
    assert.match(sql, /chk_payroll_net_equals_gross_minus_deductions/);
    assert.match(sql, /CHECK\s*\(net_salary = gross_salary - deductions\)/);
  });

  await t.test("4. Migration 59: ERP PO item line total database check constraint", () => {
    assert.match(sql, /chk_erp_po_item_total_price/);
    assert.match(sql, /CHECK\s*\(total_price = quantity_ordered \* unit_price\)/);
  });

  await t.test("5. Migration 59: Atomic PO numbering sequence function", () => {
    assert.match(sql, /CREATE SEQUENCE IF NOT EXISTS public\.seq_erp_po_number/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.generate_next_po_number/);
    assert.match(sql, /nextval\('public\.seq_erp_po_number'\)/);
  });

  await t.test("6. Public actions: getPublicDoctorsAction uses secure projection", () => {
    const publicActionsPath = path.join(ROOT, "lib/public/actions.ts");
    const actionsCode = fs.readFileSync(publicActionsPath, "utf8");

    assert.match(actionsCode, /get_public_doctors_directory/);
    assert.match(actionsCode, /public_doctors_view/);
  });

  await t.test("7. Procurement actions: createPurchaseOrderAction uses atomic sequence RPC", () => {
    const procPath = path.join(ROOT, "lib/procurement/actions.ts");
    const procCode = fs.readFileSync(procPath, "utf8");

    assert.match(procCode, /generate_next_po_number/);
  });
});
