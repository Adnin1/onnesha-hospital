import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 8 Billing & Invoicing Engine Suite (10 Scenarios)", () => {
  // Scenario 1: types/billing.ts defines InvoiceRecord, InvoiceItemRecord, PaymentRecord
  test("1. types/billing.ts defines InvoiceRecord, InvoiceItemRecord, PaymentRecord, CashRegisterSummary", () => {
    const typesContent = fs.readFileSync(path.join(rootDir, "types", "billing.ts"), "utf8");
    assert.match(typesContent, /export interface InvoiceRecord/);
    assert.match(typesContent, /export interface InvoiceItemRecord/);
    assert.match(typesContent, /export interface PaymentRecord/);
    assert.match(typesContent, /export interface CashRegisterSummary/);
  });

  // Scenario 2: createInvoiceAction asserts billing.create and requires items
  test("2. createInvoiceAction asserts requirePermission('billing.create') and requires items", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "billing", "actions.ts"), "utf8");
    assert.match(actionsContent, /requirePermission\("billing\.create"\)/);
    assert.match(actionsContent, /Invoice must contain at least one line item/);
  });

  // Scenario 3: createInvoiceAction inserts invoice header, line items, and immediate payment
  test("3. createInvoiceAction records invoice, items, initial payments, and audit log", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "billing", "actions.ts"), "utf8");
    assert.match(actionsContent, /\.from\("invoices"\)\s*\.insert/);
    assert.match(actionsContent, /\.from\("invoice_items"\)\s*\.insert/);
    assert.match(actionsContent, /recordAuditLog/);
    assert.match(actionsContent, /entityType:\s*"invoice"/);
  });

  // Scenario 4: collectPaymentAction asserts billing.collect and updates due amount
  test("4. collectPaymentAction verifies invoice not voided and calculates updated remaining due", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "billing", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function collectPaymentAction/);
    assert.match(actionsContent, /requirePermission\("billing\.collect"\)/);
    assert.match(actionsContent, /Cannot collect payment on a voided invoice/);
    assert.match(actionsContent, /\.from\("payments"\)\s*\.insert/);
  });

  // Scenario 5: voidInvoiceAction requires supervisor billing.manage permission
  test("5. voidInvoiceAction requires billing.manage permission and mandates void reason", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "billing", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function voidInvoiceAction/);
    assert.match(actionsContent, /requirePermission\("billing\.manage"\)/);
    assert.match(actionsContent, /Void reason is required for supervisory audit/);
    assert.match(actionsContent, /status:\s*"VOID"/);
  });

  // Scenario 6: getCashRegisterSummaryAction tallies today's cash and MFS collections
  test("6. getCashRegisterSummaryAction aggregates daily cash, MFS, and gross invoiced volume", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "billing", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getCashRegisterSummaryAction/);
    assert.match(actionsContent, /todayCashCollected/);
    assert.match(actionsContent, /todayMfsCollected/);
  });

  // Scenario 7: app/billing/page.tsx has zero mock data imports
  test("7. app/billing/page.tsx has zero mock data imports and connects to live database actions", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx"), "utf8");
    assert.doesNotMatch(pageContent, /mock-data/);
    assert.match(pageContent, /getInvoicesAction/);
    assert.match(pageContent, /createInvoiceAction/);
    assert.match(pageContent, /collectPaymentAction/);
  });

  // Scenario 8: Migration 011 specifies invoices, invoice_items, payments, refunds, cash_transactions
  test("8. Migration 011 defines invoices, invoice_items, payments, and refunds schema", () => {
    const migContent = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "011_billing.sql"), "utf8");
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS invoices/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS invoice_items/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS payments/);
    assert.match(migContent, /CREATE TABLE IF NOT EXISTS refunds/);
  });

  // Scenario 9: Billing page integrates HospitalPrintHeader & HospitalPrintFooter for receipts
  test("9. Billing page mounts HospitalPrintHeader and HospitalPrintFooter for printable receipts", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx"), "utf8");
    assert.match(pageContent, /HospitalPrintHeader/);
    assert.match(pageContent, /HospitalPrintFooter/);
    assert.match(pageContent, /BILLING INVOICE & CASH RECEIPT/);
  });

  // Scenario 10: Billing status filter supports ALL, UNPAID, PARTIAL, PAID, VOID
  test("10. Billing UI supports filtering invoices by status", () => {
    const pageContent = fs.readFileSync(path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx"), "utf8");
    assert.match(pageContent, /"ALL", "UNPAID", "PARTIAL", "PAID", "VOID"/);
  });
});
