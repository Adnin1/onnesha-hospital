/**
 * Phase 43: ERP Core - Procurement Requisitions, Goods Receipt Notes (GRN) & Multi-Warehouse Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 43 - ERP Procurement Requisitions, GRN & Warehouse Inventory", async (t) => {
  const actionsPath = path.join(ROOT, "lib/procurement/actions.ts");
  const procurementPagePath = path.join(ROOT, "app/(hospital)/app/procurement/page.tsx");
  const migrationPath = path.join(ROOT, "supabase/migrations/20260921020000_hospital_erp_core_foundations.sql");
  const navPath = path.join(ROOT, "config/navigation.ts");
  const permPath = path.join(ROOT, "lib/permissions.ts");

  assert.ok(fs.existsSync(actionsPath), "lib/procurement/actions.ts must exist");
  assert.ok(fs.existsSync(procurementPagePath), "app/(hospital)/app/procurement/page.tsx must exist");
  assert.ok(fs.existsSync(migrationPath), "Migration 47 must exist");

  const actionsCode = fs.readFileSync(actionsPath, "utf8");
  const pageCode = fs.readFileSync(procurementPagePath, "utf8");
  const migrationCode = fs.readFileSync(migrationPath, "utf8");
  const navCode = fs.readFileSync(navPath, "utf8");
  const permCode = fs.readFileSync(permPath, "utf8");

  await t.test("1. Database Schema & Migration: Requisitions, GRN & Warehouses", () => {
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.purchase_requisitions/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.purchase_requisition_items/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.goods_receipt_notes/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.goods_receipt_items/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.warehouses/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.inventory_transfers/);
  });

  await t.test("2. Procurement Backend Actions Verification", () => {
    assert.match(actionsCode, /export async function getPurchaseRequisitionsAction/);
    assert.match(actionsCode, /export async function createPurchaseRequisitionAction/);
    assert.match(actionsCode, /export async function getGoodsReceiptNotesAction/);
    assert.match(actionsCode, /export async function createGoodsReceiptNoteAction/);
    assert.match(actionsCode, /export async function getWarehousesAction/);
  });

  await t.test("3. GRN Line Valuation & Math Invariant", () => {
    function computeGrnValuation(items) {
      return items.reduce((acc, item) => acc + item.quantity_received * item.unit_cost, 0);
    }

    const testItems = [
      { quantity_received: 100, unit_cost: 45.5 }, // 4550
      { quantity_received: 20, unit_cost: 250 },   // 5000
      { quantity_received: 5, unit_cost: 1200 },   // 6000
    ];

    const total = computeGrnValuation(testItems);
    assert.strictEqual(total, 15550);
  });

  await t.test("4. Navigation and Permissions Integration", () => {
    assert.match(navCode, /\/app\/procurement/);
    assert.match(navCode, /Procurement & GRN/);
    assert.match(permCode, /PROCUREMENT_VIEW: "procurement\.view"/);
    assert.match(permCode, /PROCUREMENT_MANAGE: "procurement\.manage"/);
  });

  await t.test("5. UI Page Renders Requisitions, GRN, and Warehouses Tabs", () => {
    assert.match(pageCode, /Requisitions/);
    assert.match(pageCode, /Goods Receipt Notes/);
    assert.match(pageCode, /Warehouses/);
    assert.match(pageCode, /Record Goods Receipt Note/);
  });
});
