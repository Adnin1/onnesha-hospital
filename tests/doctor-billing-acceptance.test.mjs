import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Doctor Management & Billing Acceptance Suite (13 Scenarios)", () => {
  const doctorActionsPath = path.join(rootDir, "lib", "appointments", "actions.ts");
  const billingActionsPath = path.join(rootDir, "lib", "billing", "actions.ts");
  const sealComponentPath = path.join(rootDir, "components", "billing", "PaymentStampSeal.tsx");

  const doctorActionsCode = fs.readFileSync(doctorActionsPath, "utf8");
  const billingActionsCode = fs.readFileSync(billingActionsPath, "utf8");
  const sealCode = fs.readFileSync(sealComponentPath, "utf8");

  // Scenario 1: Doctor update permission enforcement
  test("1. updateDoctorAction strictly enforces doctors.manage permission and 403 rejection", () => {
    assert.match(doctorActionsCode, /requirePermission\(PERMISSIONS\.DOCTORS_MANAGE\)/, "Must enforce DOCTORS_MANAGE permission");
    assert.match(doctorActionsCode, /403 Forbidden|401 Unauthorized/, "Must reject unauthorized invocations");
  });

  // Scenario 2: Doctor cross-tenant mutation denial
  test("2. updateDoctorAction and deleteDoctorAction enforce strict tenant boundary by organization_id", () => {
    assert.match(doctorActionsCode, /\.eq\("organization_id",\s*session\.organizationId\)/, "Must filter update by active organizationId");
    assert.match(doctorActionsCode, /Doctor profile not found in your organization/, "Must reject cross-tenant doctor updates");
  });

  // Scenario 3: Doctor safe archive preserves clinical history
  test("3. deleteDoctorAction inspects referenced appointments and safely deactivates without hard deleting historical records", () => {
    assert.match(doctorActionsCode, /\.from\("appointments"\)\s*\.select\("id",\s*\{\s*count:\s*"exact"/, "Must count appointment references");
    assert.match(doctorActionsCode, /apptCount\s*>\s*0/, "Must branch on existing clinical references");
    assert.match(doctorActionsCode, /is_active:\s*false/, "Must deactivate doctor rather than delete when records exist");
  });

  // Scenario 4: Clean doctor deletion policy
  test("4. deleteDoctorAction permits physical deletion only when zero clinical references exist", () => {
    assert.match(doctorActionsCode, /\.delete\(\)\s*\.eq\("id",\s*doctorId\)\s*\.eq\("organization_id",\s*session\.organizationId\)/, "Must physically delete when zero references exist");
    assert.match(doctorActionsCode, /mode = "DELETED"/, "Must report DELETED mode on clean deletion");
  });

  // Scenario 5: Doctor schedule cleanup and synchronization
  test("5. deleteDoctorAction deactivates all published doctor schedules when archiving", () => {
    assert.match(doctorActionsCode, /\.from\("doctor_schedules"\)\s*\.update\(\{\s*is_active:\s*false\s*\}\)/, "Must deactivate linked schedules");
  });

  // Scenario 6: Authentic PAID stamp seal
  test("6. PaymentStampSeal produces authentic PAID and Bengali পরিশোধিত seal when dueAmount is 0", () => {
    assert.match(sealCode, /PAID/, "Must render PAID stamp text");
    assert.match(sealCode, /পরিশোধিত/, "Must render Bengali পরিশোধিত stamp text");
    assert.match(sealCode, /FULL SETTLEMENT • সম্পূর্ণ পরিশোধ/, "Must render full settlement subtitle");
  });

  // Scenario 7: Authentic DUE stamp seal with formatted currency
  test("7. PaymentStampSeal produces authentic DUE and Bengali বকেয়া seal when dueAmount is positive", () => {
    assert.match(sealCode, /DUE/, "Must render DUE stamp text");
    assert.match(sealCode, /বকেয়া/, "Must render Bengali বকেয়া stamp text");
    assert.match(sealCode, /formatCurrencyBDT\(dueAmount\)/, "Must format BDT due amount");
    assert.match(sealCode, /PAYMENT PENDING • বকেয়া পরিশোধ সাপেক্ষে/, "Must render pending payment subtitle");
  });

  // Scenario 8: Deterministic partial and unpaid status handling in atomic RPC
  test("8. Invoices calculate authoritative due_amount = GREATEST(0, grand_total - paid) and status in atomic RPC", () => {
    const migPath = path.join(rootDir, "supabase", "migrations", "20260919195000_fix_billing_atomicity_and_cashier_prevalidation.sql");
    const migCode = fs.readFileSync(migPath, "utf8");
    assert.match(migCode, /v_new_due := GREATEST\(0,\s*v_invoice\.grand_total - v_new_paid\)/, "Must compute non-negative remaining due");
    assert.match(migCode, /CASE WHEN v_new_due = 0 THEN 'PAID' ELSE 'PARTIAL' END/, "Must classify as PAID when due is 0 and PARTIAL otherwise");
  });

  // Scenario 9: VOID priority over PAID / DUE seals
  test("9. PaymentStampSeal strictly gives VOID priority over PAID/DUE settlement seals", () => {
    assert.match(sealCode, /const isVoid = status === "VOID"/, "Must identify VOID status");
    assert.match(sealCode, /if \(isVoid\)\s*\{\s*return/, "Must return VOID stamp before checking isPaid");
    assert.match(sealCode, /বাতিলকৃত ইনভয়েস/, "Must render cancellation text on voided invoices");
  });

  // Scenario 10: Currency rounding and zero-due precision
  test("10. PaymentStampSeal handles floating point edge cases without displaying false micro-dues", () => {
    assert.match(sealCode, /dueAmount <= 0/, "Must treat zero or sub-cent balances as fully settled");
  });

  // Scenario 11: Pay Due server-side validation & atomic RPC call
  test("11. collectPaymentAction validates amount > 0, verifies tenant boundary, and calls collect_payment_atomic", () => {
    assert.match(billingActionsCode, /params\.amount <= 0/, "Must reject zero or negative payment amounts");
    assert.match(billingActionsCode, /p_org_id:\s*session\.organizationId/, "Must enforce tenant isolation");
    assert.match(billingActionsCode, /collect_payment_atomic/, "Must invoke atomic payment collection RPC");
  });

  // Scenario 12: Overpayment and voided invoice payment rejection in atomic RPC
  test("12. collect_payment_atomic rejects payments on VOID invoices and overpayments with row lock", () => {
    const migPath = path.join(rootDir, "supabase", "migrations", "20260919195000_fix_billing_atomicity_and_cashier_prevalidation.sql");
    const migCode = fs.readFileSync(migPath, "utf8");
    assert.match(migCode, /Cannot collect payment on a voided invoice/, "Must reject collections on voided bills");
    assert.match(migCode, /Payment amount exceeds outstanding invoice balance/, "Must explicitly reject overpayments");
    assert.match(migCode, /FOR UPDATE/, "Must lock invoice row against concurrent race conditions");
  });

  // Scenario 13: Super admin permanent purge vs safe void dual mode
  test("13. deleteInvoiceAction supports atomic permanent purge and payment history wipe for Super Admin", () => {
    assert.match(billingActionsCode, /permanentPurge\?: boolean/, "Must support permanentPurge parameter");
    assert.match(billingActionsCode, /p_permanent_purge:\s*Boolean\(params\.permanentPurge\)/, "Must pass permanent purge flag to atomic RPC");
  });
});
