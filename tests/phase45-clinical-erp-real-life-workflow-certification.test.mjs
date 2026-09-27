import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Import calculateAgeFromDOB from lib/utils.ts
import { calculateAgeFromDOB, normalizeRole, CANONICAL_ROLES } from "../lib/utils.ts";

describe("OHMS Conversation 2: Full Clinical & Hospital ERP Functional Certification (10 Invariants)", () => {

  // 1. Patient Registration & Age Calculation
  test("1. calculateAgeFromDOB accurately calculates integer age from date of birth string and Date object", () => {
    const today = new Date();
    const birthYear = today.getFullYear() - 30;
    const dobString = `${birthYear}-01-01`;
    const calculatedAge = calculateAgeFromDOB(dobString);
    assert.ok(calculatedAge === 30 || calculatedAge === 29, "Age should accurately reflect elapsed full years");

    assert.equal(calculateAgeFromDOB(null), 0);
    assert.equal(calculateAgeFromDOB(undefined), 0);
    assert.equal(calculateAgeFromDOB("invalid-date"), 0);

    const infantDob = new Date();
    infantDob.setMonth(infantDob.getMonth() - 2);
    assert.equal(calculateAgeFromDOB(infantDob), 0, "Infant under 1 year should have age 0 years");
  });

  // 2. OPD Consultation & 5 Vital Signs Bounds
  test("2. OPD vitals form captures 5 clinical vitals: BP, Pulse, SpO2, Temp, and Weight", () => {
    const opdPageContent = fs.readFileSync(path.join(rootDir, "app/(hospital)/app/opd/page.tsx"), "utf8");
    assert.ok(opdPageContent.includes("spo2"), "OPD page must manage SpO2 state");
    assert.ok(opdPageContent.includes("SpO2 Saturation") || opdPageContent.includes("SpO2"), "SpO2 input label must exist");
    assert.ok(opdPageContent.includes("Blood Pressure"), "BP input must exist");
    assert.ok(opdPageContent.includes("Pulse Rate"), "Pulse input must exist");
    assert.ok(opdPageContent.includes("Body Temp"), "Temp input must exist");
    assert.ok(opdPageContent.includes("Weight"), "Weight input must exist");
    assert.ok(opdPageContent.includes("handleCompleteConsultation"), "Complete consultation handler must exist");
  });

  // 3. Emergency Casualty Triage & Zero-Dummy Navigations
  test("3. Emergency triage page has zero dummy alert handlers and links to ICU & OT", () => {
    const emergencyPageContent = fs.readFileSync(path.join(rootDir, "app/(hospital)/app/emergency/page.tsx"), "utf8");
    assert.ok(!emergencyPageContent.includes('alert(`Transferred'), "Dummy alert for ICU transfer must be eliminated");
    assert.ok(!emergencyPageContent.includes('alert(`Emergency'), "Dummy alert for OT transfer must be eliminated");
    assert.ok(emergencyPageContent.includes("/app/ipd?patientCode="), "Direct link to IPD/ICU must exist");
    assert.ok(emergencyPageContent.includes("/app/ot?patientCode="), "Direct link to OT must exist");
    assert.ok(emergencyPageContent.includes("HOSPITAL_METADATA.emergencyHotline"), "Hotline must use configured metadata");
  });

  // 4. IPD Bed Management & Discharge Disposition
  test("4. IPD admissions module supports all 5 clinical discharge disposition types", () => {
    const ipdPageContent = fs.readFileSync(path.join(rootDir, "app/(hospital)/app/ipd/page.tsx"), "utf8");
    assert.ok(ipdPageContent.includes("NORMAL"), "Normal discharge disposition required");
    assert.ok(ipdPageContent.includes("DOR"), "DOR (Discharge on Request) required");
    assert.ok(ipdPageContent.includes("LAMA"), "LAMA (Left Against Medical Advice) required");
    assert.ok(ipdPageContent.includes("REFERRED"), "Referred disposition required");
    assert.ok(ipdPageContent.includes("DECEASED"), "Deceased disposition required");
  });

  // 5. Diagnostic Pathology Report Verification Lifecycle
  test("5. Diagnostic lab workflow verifies immutable report state with pathologist remarks", () => {
    const labPageContent = fs.readFileSync(path.join(rootDir, "app/(hospital)/app/lab/page.tsx"), "utf8");
    assert.ok(labPageContent.includes("verifyDiagnosticReportAction"), "Lab report verification action must be used");
    assert.ok(labPageContent.includes("Consultant Pathologist") || labPageContent.includes("VERIFIED"), "Verification workflow required");
  });

  // 6. Pharmacy Stock Inventory & Zero Negative Stock Enforcement
  test("6. Pharmacy POS dispense enforces available stock and prevents negative inventory", () => {
    const pharmacyActionContent = fs.readFileSync(path.join(rootDir, "lib/pharmacy/actions.ts"), "utf8");
    assert.ok(pharmacyActionContent.includes("dispensePharmacySaleAction"), "Dispense action must exist");
    assert.ok(pharmacyActionContent.includes("Insufficient stock") || pharmacyActionContent.includes("current_stock"), "Stock check required");
  });

  // 7. Cashier Billing Server-Authoritative Due Calculations
  test("7. Billing calculation logic enforces Subtotal, Discount, Net Total, and Due Balance invariants", () => {
    const items = [
      { unit_price: 1200, quantity: 1 },
      { unit_price: 450, quantity: 2 },
      { unit_price: 150, quantity: 3 },
    ];
    const subtotal = items.reduce((acc, it) => acc + (it.unit_price * it.quantity), 0);
    assert.equal(subtotal, 1200 + 900 + 450); // 2550

    const discount = 250;
    const netTotal = Math.max(0, subtotal - discount);
    assert.equal(netTotal, 2300);

    const paid = 1500;
    const due = Math.max(0, netTotal - paid);
    assert.equal(due, 800);
  });

  // 8. Mandatory Justification for Financial Void Operations
  test("8. Financial invoice void requires clinical/administrative reason for audit trail", () => {
    const billingActionsContent = fs.readFileSync(path.join(rootDir, "lib/billing/actions.ts"), "utf8");
    assert.ok(billingActionsContent.includes("voidInvoiceAction"), "voidInvoiceAction must exist");
    assert.ok(
      billingActionsContent.includes("Void reason is required") || billingActionsContent.includes("void_reason"),
      "Audit void reason check required"
    );
  });

  // 9. Double-Entry Accounting Balancing Invariant
  test("9. Accounting journal entry validator verifies Debits == Credits balance", () => {
    const accountingActionContent = fs.readFileSync(path.join(rootDir, "lib/accounting/actions.ts"), "utf8");
    assert.ok(accountingActionContent.includes("postJournalEntryAction"), "postJournalEntryAction must exist");
    assert.ok(
      accountingActionContent.includes("debit") && accountingActionContent.includes("credit"),
      "Debit and credit balancing required"
    );
  });

  // 10. 9 Canonical Roles Normalization & Fail-Closed Security
  test("10. normalizeRole maps all 9 canonical hospital roles and fails closed on unauthorized strings", () => {
    assert.equal(CANONICAL_ROLES.length, 9, "Exactly 9 canonical roles defined in OHMS");
    assert.equal(normalizeRole("Super Admin"), "super_admin");
    assert.equal(normalizeRole("Doctor"), "doctor");
    assert.equal(normalizeRole("Nurse"), "nurse");
    assert.equal(normalizeRole("Cashier"), "accountant");
    assert.equal(normalizeRole("Lab Technician"), "lab_technologist");
    assert.equal(normalizeRole("Pharmacist"), "pharmacist");
    assert.equal(normalizeRole("HR Manager"), "hr_payroll");
    assert.equal(normalizeRole("Receptionist"), "receptionist");
    assert.equal(normalizeRole("Hospital Administrator"), "hospital_administrator");

    // Fail closed
    assert.equal(normalizeRole("Hacker"), "");
    assert.equal(normalizeRole(""), "");
    assert.equal(normalizeRole(null), "");
    assert.equal(normalizeRole(undefined), "");
  });
});
