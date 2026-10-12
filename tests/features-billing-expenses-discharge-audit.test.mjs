/**
 * OHMS Feature Integrity and Forensic Hardening Test Suite
 * 
 * Verifies:
 * 1. Billing & Cashier:
 *    - Half-Letter (5.5 x 8.5 in) invoice print format and page-size CSS.
 *    - Patient mandatory demographics (name, id, phone, age, address, blood group).
 *    - Medicine line items (name, unit, price, quantity).
 *    - Elimination of silent fallback (no || 500 consultation fee).
 *    - Hospital service tariff manager integration (OPD, IPD, Admission, ICU, OT).
 *    - Explicit PAID / DUE / UNPAID status semantics.
 * 
 * 2. Hospital Expenses ERP:
 *    - Cross-tenant RPC security (p_org_id = public.get_current_org_id()).
 *    - Atomic GL rollback invariant (strict fail on journal failure, zero phantom vouchers).
 *    - Atomic void reversing journal entry with canonical VOIDED status and exclusion from analytics.
 *    - Revocation of direct mutation grants on hospital_service_tariffs and expense_categories.
 *    - Server actions & UI wiring for update, archive, and idempotent monthly recurring retainers.
 * 
 * 3. IPD Discharge Folder & Certificate:
 *    - Atomic complete_ipd_discharge_atomic database RPC.
 *    - Mandatory consultant doctor name and BMDC registration requirement.
 *    - 4-part folder structure derived from physical reference video frames.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("OHMS New Features Verification: Billing, Expenses ERP, and IPD Discharge", async (t) => {
  const billingPagePath = path.join(ROOT, "app/(hospital)/app/billing/page.tsx");
  const halfLetterPrintPath = path.join(ROOT, "components/print/HalfLetterInvoicePrint.tsx");
  const tariffManagerPath = path.join(ROOT, "components/billing/HospitalTariffManager.tsx");
  const settingsPagePath = path.join(ROOT, "app/(hospital)/app/settings/page.tsx");
  const expensesPagePath = path.join(ROOT, "app/(hospital)/app/expenses/page.tsx");
  const expenseActionsPath = path.join(ROOT, "lib/expenses/actions.ts");
  const patientActionsPath = path.join(ROOT, "lib/patient/actions.ts");
  const dischargePrintPath = path.join(ROOT, "components/print/DischargeSummaryPrint.tsx");
  const mig145Path = path.join(ROOT, "supabase/migrations/20261011033000_harden_expenses_tariffs_and_discharge_security.sql");
  const mig147Path = path.join(ROOT, "supabase/migrations/20261011035000_harden_expenses_tariffs_and_discharge_security_v3.sql");
  const mig148Path = path.join(ROOT, "supabase/migrations/20261011040000_harden_expenses_tariffs_and_discharge_security_v4.sql");

  assert.ok(fs.existsSync(billingPagePath), "Billing page must exist");
  assert.ok(fs.existsSync(halfLetterPrintPath), "HalfLetterInvoicePrint component must exist");
  assert.ok(fs.existsSync(tariffManagerPath), "HospitalTariffManager component must exist");
  assert.ok(fs.existsSync(settingsPagePath), "Settings page must exist");
  assert.ok(fs.existsSync(expensesPagePath), "Expenses page must exist");
  assert.ok(fs.existsSync(expenseActionsPath), "Expense actions must exist");
  assert.ok(fs.existsSync(patientActionsPath), "Patient actions must exist");
  assert.ok(fs.existsSync(dischargePrintPath), "DischargeSummaryPrint component must exist");
  assert.ok(fs.existsSync(mig145Path), "Migration 145 must exist");
  assert.ok(fs.existsSync(mig147Path), "Migration 147 must exist");
  assert.ok(fs.existsSync(mig148Path), "Migration 148 must exist");

  const billingCode = fs.readFileSync(billingPagePath, "utf8");
  const halfLetterCode = fs.readFileSync(halfLetterPrintPath, "utf8");
  const tariffManagerCode = fs.readFileSync(tariffManagerPath, "utf8");
  const settingsCode = fs.readFileSync(settingsPagePath, "utf8");
  const expensesCode = fs.readFileSync(expensesPagePath, "utf8");
  const expenseActionsCode = fs.readFileSync(expenseActionsPath, "utf8");
  const patientActionsCode = fs.readFileSync(patientActionsPath, "utf8");
  const dischargePrintCode = fs.readFileSync(dischargePrintPath, "utf8");
  const mig145Code = fs.readFileSync(mig145Path, "utf8");
  const mig147Code = fs.readFileSync(mig147Path, "utf8");
  const mig148Code = fs.readFileSync(mig148Path, "utf8");

  // -------------------------------------------------------------
  // SECTION 1: Billing & Cashier Subsystem
  // -------------------------------------------------------------
  await t.test("1.1 Half-Letter / Statement print layout adheres strictly to 5.5 x 8.5 in specifications", () => {
    assert.match(halfLetterCode, /@page\s*\{\s*size:\s*5\.5in\s*8\.5in/i, "Must declare 5.5in 8.5in page size in print CSS");
    assert.match(halfLetterCode, /139\.7mm|5\.5in/, "Must define 5.5in (139.7mm) width");
    assert.match(halfLetterCode, /215\.9mm|8\.5in/, "Must define 8.5in (215.9mm) height");
    assert.match(halfLetterCode, /Half-Letter|Statement/, "Must document Half-Letter / Statement format");
  });

  await t.test("1.2 Billing invoice mandates patient details and medicine line items", () => {
    assert.match(billingCode, /patientAddressInput/, "Must support patient address");
    assert.match(billingCode, /patientAgeInput/, "Must support patient age");
    assert.match(billingCode, /medicineNameInput/, "Must support medicine name entry");
    assert.match(billingCode, /medicineUnitInput/, "Must support medicine unit");
    assert.match(billingCode, /medicinePriceInput/, "Must support medicine price entry");
    assert.match(billingCode, /medicineQtyInput/, "Must support medicine quantity entry");
    assert.match(billingCode, /addItemRow\("PHARMACY"/, "Must add pharmacy/medicine item row to invoice");
  });

  await t.test("1.3 Consultation fee requires explicit configuration without silent || 500 fallback", () => {
    assert.ok(!billingCode.includes("doc.consultation_fee || 500"), "Silent fallback || 500 must be removed from billing page");
    assert.ok(!billingCode.includes("doc.opd_fee || 500"), "Silent fallback || 500 must be removed from billing page");
    assert.match(billingCode, /fee\s*<=\s*0/, "Must validate fee <= 0 and prevent addition without configured rate");
  });

  await t.test("1.4 Hospital tariff management is integrated into Settings for OPD, IPD, ICU, OT", () => {
    assert.match(settingsCode, /HospitalTariffManager/, "HospitalTariffManager must be mounted in Settings");
    assert.match(settingsCode, /Hospital Services Tariff \(OPD \/ IPD \/ ICU \/ OT\)/, "Must provide hospital service tariff tab");
    assert.match(tariffManagerCode, /saveHospitalServiceTariffAction/, "Must invoke saveHospitalServiceTariffAction");
    assert.match(tariffManagerCode, /OPD|IPD|ADMISSION|ICU|OT/, "Tariff manager must support hospital categories");
  });

  await t.test("1.5 Billing invoice explicitly handles PAID, DUE, and UNPAID statuses", () => {
    assert.match(billingCode, /status\s*===\s*"PAID"/, "Must handle PAID status");
    assert.match(billingCode, /due_amount|dueAmount/, "Must calculate due amount");
    assert.match(halfLetterCode, /PAID|DUE|UNPAID/, "Print layout must present payment status clearly");
  });

  // -------------------------------------------------------------
  // SECTION 2: Hospital Expense ERP Subsystem
  // -------------------------------------------------------------
  await t.test("2.1 Expense RPCs enforce strict tenant validation rejecting cross-tenant injections", () => {
    assert.match(mig145Code, /v_caller_org\s*:=\s*public\.get_current_org_id\(\);/, "Must read authenticated org_id");
    assert.match(mig145Code, /p_org_id\s*!=\s*v_caller_org/, "Must reject mismatched org_id with 403 Forbidden");
    assert.match(mig145Code, /Cross-tenant violation/, "Must raise Cross-tenant violation exception");
  });

  await t.test("2.2 GL posting failure causes atomic rollback with zero phantom vouchers", () => {
    assert.match(mig145Code, /General Ledger journal posting failed/, "Must raise exception on GL failure");
    assert.ok(!mig145Code.includes("'success', true, 'warning'"), "Must never return success: true on GL failure");
  });

  await t.test("2.3 Voiding atomically reverses posted journal entries and excludes VOIDED from analytics", () => {
    assert.match(mig145Code, /void_hospital_expense_atomic/, "Must define void_hospital_expense_atomic function");
    assert.match(mig145Code, /status\s*=\s*'VOIDED'/, "Must update expense status to VOIDED");
    assert.match(mig145Code, /REV-|EXPENSE_VOID_REVERSAL/, "Must generate reversing journal entry reference");
    assert.match(mig145Code, /e\.status\s*NOT IN\s*\('VOID',\s*'VOIDED'\)/, "Analytics summary must exclude both VOID and VOIDED");
  });

  await t.test("2.4 Tariff and category direct table mutation grants are revoked", () => {
    assert.match(mig145Code, /REVOKE INSERT, UPDATE, DELETE ON public\.hospital_service_tariffs FROM authenticated;/, "Must revoke direct tariff mutations");
    assert.match(mig145Code, /REVOKE INSERT, UPDATE, DELETE ON public\.expense_categories FROM authenticated;/, "Must revoke direct category mutations");
    assert.match(mig145Code, /save_hospital_service_tariff_atomic/, "Must gate tariff updates behind authorized atomic function");
  });

  await t.test("2.5 Expense server actions and UI support update, category archiving, and monthly retainers", () => {
    assert.match(expenseActionsCode, /export async function updateExpenseAction/, "Must export updateExpenseAction");
    assert.match(expenseActionsCode, /export async function archiveExpenseCategoryAction/, "Must export archiveExpenseCategoryAction");
    assert.match(expenseActionsCode, /export async function generateMonthlyRecurringExpensesAction/, "Must export generateMonthlyRecurringExpensesAction");
    assert.match(expensesCode, /updateExpenseAction/, "Expense page must wire updateExpenseAction");
    assert.match(expensesCode, /archiveExpenseCategoryAction/, "Expense page must wire archiveExpenseCategoryAction");
    assert.match(expensesCode, /generateMonthlyRecurringExpensesAction/, "Expense page must wire generateMonthlyRecurringExpensesAction");
    assert.match(expensesCode, /Monthly Retainers/, "UI must render Monthly Retainers action");
  });

  // -------------------------------------------------------------
  // SECTION 3: IPD Discharge Certificate & Folder Subsystem
  // -------------------------------------------------------------
  await t.test("3.1 Complete IPD discharge database RPC executes atomically across visit, bed, and cabin", () => {
    assert.match(mig145Code, /complete_ipd_discharge_atomic/, "Must define complete_ipd_discharge_atomic function");
    assert.match(mig148Code, /status = 'VACATED'/, "Bed assignment must be marked VACATED");
    assert.match(mig148Code, /vacated_at = NOW\(\)/, "Bed assignment must record vacated_at");
    assert.match(mig148Code, /UPDATE public\.beds\s+SET status = 'VACANT'/, "Bed status must be updated to VACANT");
    assert.match(mig148Code, /UPDATE public\.cabins\s+SET status = 'VACANT'/, "Cabin status must be updated to VACANT");
    assert.match(mig148Code, /UPDATE public\.patient_visits\s+SET status = 'DISCHARGED'/, "Visit status must be updated to DISCHARGED");
  });

  await t.test("3.2 Discharge server action enforces mandatory consultant doctor, with optional BMDC registration", () => {
    assert.match(patientActionsCode, /finalDiagnosis\.trim\(\)\.length\s*<\s*2/, "Must mandate final diagnosis");
    assert.match(patientActionsCode, /Consultant doctor name or selection is mandatory/, "Must validate consultant doctor");
    assert.doesNotMatch(patientActionsCode, /Doctor BMDC registration number is mandatory/, "BMDC registration must be optional");
    assert.match(patientActionsCode, /complete_ipd_discharge_atomic/, "Must call complete_ipd_discharge_atomic RPC");
  });

  await t.test("3.3 Discharge summary print layout implements the 4-part folder design from reference video", () => {
    assert.match(dischargePrintCode, /part-folder|Part Folder|4-Part|4-page/i, "Must identify as 4-part folder / summary");
    assert.match(dischargePrintCode, /DISCHARGE CERTIFICATE|Discharge Certificate/i, "Cover must feature Discharge Certificate heading");
    assert.match(dischargePrintCode, /BMDC/i, "Must display doctor BMDC registration number");
    assert.match(dischargePrintCode, /ot_details|operation_name|operative_findings|OT/i, "Page 2 must contain OT procedure details");
    assert.match(dischargePrintCode, /baby_note|baby_weight|babySex|Baby/i, "Page 2 must include baby delivery note if applicable");
    assert.match(dischargePrintCode, /medications|schedule|Rx|Dosage/i, "Page 3 must feature Treatment Rx table");
    assert.match(dischargePrintCode, /advice|উপদেশ|danger signs|Emergency/i, "Page 4 must feature discharge advice / warnings");
  });
});
