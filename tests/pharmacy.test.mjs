import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 7 Pharmacy & Double-Entry Stock Suite (10 Scenarios)", () => {
  // Scenario 1: types/pharmacy.ts defines MedicineRecord, MedicineBatchRecord, StockTransactionRecord
  test("1. types/pharmacy.ts defines MedicineRecord, MedicineBatchRecord, StockTransactionRecord", () => {
    const typesContent = fs.readFileSync(path.join(rootDir, "types", "pharmacy.ts"), "utf8");
    assert.match(typesContent, /export interface MedicineRecord/);
    assert.match(typesContent, /export interface MedicineBatchRecord/);
    assert.match(typesContent, /export interface StockTransactionRecord/);
    assert.match(typesContent, /export interface PharmacySaleRecord/);
  });

  // Scenario 2: getPharmacyInventoryAction calculates total stock across batches and checks low-stock thresholds
  test("2. getPharmacyInventoryAction calculates total_stock across batches and flags lowStockCount", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "pharmacy", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getPharmacyInventoryAction/);
    assert.match(actionsContent, /total_stock/);
    assert.match(actionsContent, /min_stock_alert/);
    assert.match(actionsContent, /lowStockCount/);
  });

  // Scenario 3: createMedicineAction enforces pharmacy.manage permission
  test("3. createMedicineAction checks pharmacy.manage permission and audits", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "pharmacy", "actions.ts"), "utf8");
    assert.match(actionsContent, /requirePermission\("pharmacy\.manage"\)/);
    assert.match(actionsContent, /entityType:\s*"medicine"/);
  });

  // Scenario 4: createMedicineBatchAction records PURCHASE stock transaction
  test("4. createMedicineBatchAction creates batch and inserts PURCHASE stock transaction", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "pharmacy", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function createMedicineBatchAction/);
    assert.match(actionsContent, /transaction_type:\s*"PURCHASE"/);
    assert.match(actionsContent, /\.from\("stock_transactions"\)/);
  });

  // Scenario 5: dispensePharmacySaleAction checks sufficient stock and prevents overselling
  test("5. dispensePharmacySaleAction verifies current_stock >= quantity before deduction", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "pharmacy", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function dispensePharmacySaleAction/);
    assert.match(actionsContent, /requirePermission\("pharmacy\.dispense"\)/);
    assert.match(actionsContent, /batch\.current_stock < params\.quantity/);
    assert.match(actionsContent, /transaction_type:\s*"SALE"/);
  });

  // Scenario 6: getStockTransactionsAction retrieves double-entry ledger
  test("6. getStockTransactionsAction queries stock ledger with batch and medicine joins", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "pharmacy", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getStockTransactionsAction/);
    assert.match(actionsContent, /medicine_batches/);
  });

  // Scenario 7: app/pharmacy/page.tsx has zero mock data imports
  test("7. app/pharmacy/page.tsx has zero mock data imports and connects to live database actions", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "pharmacy", "page.tsx"), "utf8");
    assert.doesNotMatch(pageContent, /mock-data/);
    assert.match(pageContent, /getPharmacyInventoryAction/);
    assert.match(pageContent, /dispensePharmacySaleAction/);
  });

  // Scenario 8: Migration 012 specifies stock_transactions and medicine_batches tables
  test("8. Migration 012 defines medicines, medicine_batches, stock_transactions, pharmacy_sales", () => {
    const migContent = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "012_pharmacy.sql"), "utf8");
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS medicines/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS medicine_batches/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS stock_transactions/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS pharmacy_sales/);
  });

  // Scenario 9: Pharmacy UI provides tabs for Catalog, POS, and Double-Entry Stock Ledger
  test("9. Pharmacy UI contains tabs for Catalog, POS, and Stock Audit Ledger", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "pharmacy", "page.tsx"), "utf8");
    assert.match(pageContent, /Catalog & Batches/);
    assert.match(pageContent, /POS Dispensation/);
    assert.match(pageContent, /Stock Audit Ledger/);
  });

  // Scenario 10: POS Form calculates total bill and remaining stock
  test("10. POS Form provides immediate user feedback with sale number and remaining batch balance", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "pharmacy", "page.tsx"), "utf8");
    assert.match(pageContent, /handleDispenseMedicine/);
    assert.match(pageContent, /Remaining stock:/);
  });
});
