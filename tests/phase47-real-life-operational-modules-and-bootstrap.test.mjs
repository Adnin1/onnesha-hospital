import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 47: Real-Life Operational Modules, Auto-Bootstrap & Zero-Placeholder Integrity", () => {
  // Test 1: Insurance & Corporate Payers
  test("1. Insurance Actions & Module: Implements claim submission, corporate payers, and auto-bootstrap", () => {
    const actionsPath = path.join(rootDir, "lib", "insurance", "actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/insurance/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /export async function getInsurancePayersAction/, "Must export getInsurancePayersAction");
    assert.match(content, /export async function createInsurancePayerAction/, "Must export createInsurancePayerAction");
    assert.match(content, /export async function createInsuranceClaimAction/, "Must export createInsuranceClaimAction");
    assert.match(content, /export async function updateInsuranceClaimStatusAction/, "Must export updateInsuranceClaimStatusAction");
    assert.match(content, /MetLife Bangladesh/, "Must bootstrap MetLife Bangladesh payer");
    assert.match(content, /Green Delta Insurance/, "Must bootstrap Green Delta Insurance payer");
  });

  // Test 2: Scholarship & Zakat Welfare Funds
  test("2. Scholarship & Welfare Module: Implements patient subsidy, welfare funds, and auto-bootstrap", () => {
    const actionsPath = path.join(rootDir, "lib", "scholarship", "actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/scholarship/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /export async function getWelfareFundsAction/, "Must export getWelfareFundsAction");
    assert.match(content, /export async function createWelfareFundAction/, "Must export createWelfareFundAction");
    assert.match(content, /export async function createScholarshipApplicationAction/, "Must export createScholarshipApplicationAction");
    assert.match(content, /export async function updateScholarshipStatusAction/, "Must export updateScholarshipStatusAction");
    assert.match(content, /General Patient Welfare Zakat Fund/, "Must bootstrap General Welfare Zakat Fund");
    assert.match(content, /Maternal & Child Healthcare Subsidy/, "Must bootstrap Maternal Subsidy Fund");
  });

  // Test 3: Biomedical Devices & Calibration Registry
  test("3. Biomedical Devices: Implements registration, status update, and auto-bootstrap of 6 clinical devices", () => {
    const actionsPath = path.join(rootDir, "lib", "biomedical", "actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/biomedical/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /export async function getBiomedicalDevicesAction/, "Must export getBiomedicalDevicesAction");
    assert.match(content, /export async function createBiomedicalDeviceAction/, "Must export createBiomedicalDeviceAction");
    assert.match(content, /export async function updateBiomedicalDeviceStatusAction/, "Must export updateBiomedicalDeviceStatusAction");
    assert.match(content, /Sysmex XN-550 Automated 5-Part Hematology Analyzer/, "Must bootstrap Sysmex hematology analyzer");
    assert.match(content, /Siemens SOMATOM go\.Now 32-Slice CT Scanner/, "Must bootstrap CT scanner");
    assert.match(content, /Shimadzu Radspeed Fit Digital X-Ray System/, "Must bootstrap X-Ray system");
  });

  // Test 4: Procurement Warehouses
  test("4. Procurement Warehouses: Implements warehouse registry and auto-bootstrap of central vaults", () => {
    const actionsPath = path.join(rootDir, "lib", "procurement", "actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/procurement/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /export async function getWarehousesAction/, "Must export getWarehousesAction");
    assert.match(content, /export async function createWarehouseAction/, "Must export createWarehouseAction");
    assert.match(content, /WH-CENTRAL/, "Must bootstrap WH-CENTRAL warehouse");
    assert.match(content, /WH-PHARM/, "Must bootstrap WH-PHARM warehouse");
    assert.match(content, /WH-OT/, "Must bootstrap WH-OT warehouse");
  });

  // Test 5: Blood Bank 0-Stock Handling
  test("5. Blood Bank Cross-Match Modal: Handles zero-unit inventory with safety alert and disabled submit", () => {
    const modalPath = path.join(rootDir, "components", "blood-bank", "CrossMatchIssueModal.tsx");
    assert.ok(fs.existsSync(modalPath), "components/blood-bank/CrossMatchIssueModal.tsx must exist");
    const content = fs.readFileSync(modalPath, "utf8");

    assert.match(content, /availableBags\.length === 0/, "Must check for 0 available bags");
    assert.match(content, /বর্তমানে কোনো রক্তের ব্যাগ স্টকে উপলব্ধ নেই/, "Must show informative Bangla warning on 0 units");
    assert.match(content, /disabled=\{submitting \|\| availableBags\.length === 0\}/, "Must disable issue submit button when availableBags is empty");
  });

  // Test 6: Hospital Expense Categories Auto-Bootstrap
  test("6. Expenses Module: Auto-bootstraps clinical and operational hospital expense categories", () => {
    const actionsPath = path.join(rootDir, "lib", "expenses", "actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/expenses/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /EXP-DOC/, "Must bootstrap EXP-DOC category");
    assert.match(content, /EXP-OT/, "Must bootstrap EXP-OT category");
    assert.match(content, /EXP-PHARM/, "Must bootstrap EXP-PHARM category");
    assert.match(content, /EXP-LAB/, "Must bootstrap EXP-LAB category");
  });

  // Test 7: Accounting Fiscal Periods Control
  test("7. Accounting Module: Implements fiscal periods creation, toggle, and auto-bootstrap of FY 2026-2027", () => {
    const actionsPath = path.join(rootDir, "lib", "accounting", "actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/accounting/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /export async function getFiscalPeriodsAction/, "Must export getFiscalPeriodsAction");
    assert.match(content, /export async function createFiscalPeriodAction/, "Must export createFiscalPeriodAction");
    assert.match(content, /FY 2026-2027 Full Year/, "Must bootstrap FY 2026-2027");
    assert.match(content, /Q1 FY26-27 \(Jul - Sep 2026\)/, "Must bootstrap Q1");
  });

  // Test 8: Hospital Assets Auto-Bootstrap
  test("8. Hospital Assets Module: Auto-bootstraps clinical capital assets and diagnostic equipment", () => {
    const actionsPath = path.join(rootDir, "lib", "assets", "actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/assets/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.match(content, /AST-MED-001/, "Must bootstrap AST-MED-001");
    assert.match(content, /AST-RAD-002/, "Must bootstrap AST-RAD-002");
    assert.match(content, /AST-SUR-003/, "Must bootstrap AST-SUR-003");
    assert.match(content, /AST-VEH-006/, "Must bootstrap AST-VEH-006 ambulance asset");
  });

  // Test 9: Financial Reports Query Schema Safety
  test("9. Financial Reports: Invoices select query does not request non-existent voided_at column and falls back safely", () => {
    const actionsPath = path.join(rootDir, "lib", "reports", "actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/reports/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    // Must NOT query voided_at in select string
    assert.doesNotMatch(content, /is_voided,\s*void_reason,\s*voided_at/, "Must not query non-existent voided_at column from invoices table");
    // Must safely map voided_at fallback
    assert.match(content, /voided_at:\s*row\.voided_at\s*\?\?\s*\(row\.is_voided\s*\?\s*row\.updated_at\s*:\s*null\)/, "Must safely map voided_at with updated_at fallback");
  });
});
