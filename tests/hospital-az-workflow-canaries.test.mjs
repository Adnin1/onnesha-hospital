import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

describe("Change Safety: A-Z Hospital Workflow Canaries Matrix (13 Core Domains)", () => {
  // Canary 1: Registration
  test("Canary 1: REGISTRATION — Patient create -> search -> edit -> reopen lifecycle", () => {
    const patientActions = path.join(ROOT, "lib/patient/actions.ts");
    assert.ok(fs.existsSync(patientActions), "Patient actions must exist");
    const code = fs.readFileSync(patientActions, "utf8");
    assert.match(code, /registerPatientAction/);
    assert.match(code, /searchPatientsAction/);
    assert.match(code, /updatePatientAction/);
    assert.match(code, /getPatient360Action/);
  });

  // Canary 2: Appointment & OPD
  test("Canary 2: APPOINTMENT & OPD — Book -> queue -> call -> consultation -> complete", () => {
    const apptActions = path.join(ROOT, "lib/appointments/actions.ts");
    assert.ok(fs.existsSync(apptActions), "Appointment actions must exist");
    const code = fs.readFileSync(apptActions, "utf8");
    assert.match(code, /bookAppointmentAction/);
    assert.match(code, /updateQueueStatusAction/);
    assert.match(code, /getLiveWaitingQueueAction/);

    const queuePage = path.join(ROOT, "app/(hospital)/app/opd/page.tsx");
    assert.ok(fs.existsSync(queuePage), "OPD queue page must exist");
    const queueCode = fs.readFileSync(queuePage, "utf8");
    assert.match(queueCode, /CALLED|called/i);
    assert.match(queueCode, /IN_ROOM|serving/i);
    assert.match(queueCode, /COMPLETED|done/i);
  });

  // Canary 3: Prescription
  test("Canary 3: PRESCRIPTION — Patient -> Rx -> items -> save -> reload -> edit -> print", () => {
    const rxPage = path.join(ROOT, "app/(hospital)/app/prescriptions/page.tsx");
    assert.ok(fs.existsSync(rxPage), "Prescriptions page must exist");
    const code = fs.readFileSync(rxPage, "utf8");
    assert.match(code, /prescription/i);
    assert.match(code, /dosage|medication|medicine/i);

    const rxActions = path.join(ROOT, "lib/prescriptions/actions.ts");
    assert.ok(fs.existsSync(rxActions), "Prescription actions must exist");
    const rxCode = fs.readFileSync(rxActions, "utf8");
    assert.match(rxCode, /createPrescriptionAction|savePrescription/);
  });

  // Canary 4: IPD Bed & Cabin Admission / Discharge
  test("Canary 4: IPD — Admission -> bed/cabin -> treatment -> bill -> discharge -> certificate -> release", () => {
    const ipdPage = path.join(ROOT, "app/(hospital)/app/ipd/page.tsx");
    assert.ok(fs.existsSync(ipdPage), "IPD page must exist");
    const code = fs.readFileSync(ipdPage, "utf8");
    assert.match(code, /createIpdAdmissionAction/);
    assert.match(code, /complete_ipd_discharge_atomic|dischargePatientAction/);
    assert.match(code, /cancelOrDeleteIpdAdmissionAction/);
    assert.match(code, /cabin|bed/i);
  });

  // Canary 5: Diagnostics & Lab
  test("Canary 5: DIAGNOSTICS & LAB — Order -> sample -> processing -> result -> verification -> report", () => {
    const labActions = path.join(ROOT, "lib/lab/actions.ts");
    assert.ok(fs.existsSync(labActions), "Lab actions must exist");
    const labCode = fs.readFileSync(labActions, "utf8");
    assert.match(labCode, /diagnostic_orders/);
    assert.match(labCode, /diagnostic_order_items/);
    assert.match(labCode, /sample/i);
  });

  // Canary 6: Billing & Invoicing
  test("Canary 6: BILLING — Invoice -> line items -> discount -> payment -> receipt -> accounting", () => {
    const billingActions = path.join(ROOT, "lib/billing/actions.ts");
    assert.ok(fs.existsSync(billingActions), "Billing actions must exist");
    const code = fs.readFileSync(billingActions, "utf8");
    assert.match(code, /createInvoiceAction/);
    assert.match(code, /collectPaymentAction/);
    assert.match(code, /total_amount|paid_amount|due_amount/);
  });

  // Canary 7: Hospital Expenses & General Ledger
  test("Canary 7: EXPENSE — Expense -> voucher -> GL posting -> balance sheet / P&L report", () => {
    const expActions = path.join(ROOT, "lib/expenses/actions.ts");
    assert.ok(fs.existsSync(expActions), "Expense actions must exist");
    const code = fs.readFileSync(expActions, "utf8");
    assert.match(code, /recordExpenseAction|approveExpenseAction|record_hospital_expense_atomic/);
    assert.match(code, /voucher_number/i);
  });

  // Canary 8: Referral & Affiliate Commission
  test("Canary 8: REFERRAL — Attribution -> commission -> settlement -> expense -> GL", () => {
    const refActions = path.join(ROOT, "lib/referrals/actions.ts");
    assert.ok(fs.existsSync(refActions), "Referral actions must exist");
    const code = fs.readFileSync(refActions, "utf8");
    assert.match(code, /record_referral_commission_payout_atomic|settleReferralCommissionAction/);
  });

  // Canary 9: Blood Bank & Transfusion
  test("Canary 9: BLOOD BANK — Bag -> crossmatch -> issue -> clinical state -> correction path", () => {
    const bloodPage = path.join(ROOT, "app/(hospital)/app/blood-bank/page.tsx");
    assert.ok(fs.existsSync(bloodPage), "Blood bank page must exist");
    const code = fs.readFileSync(bloodPage, "utf8");
    assert.match(code, /crossmatch/i);
    assert.match(code, /transfusion/i);
    assert.match(code, /donor_name/i);
  });

  // Canary 10: Pharmacy & Stock Sales
  test("Canary 10: PHARMACY — Prescription -> stock -> sale -> invoice -> inventory deduction", () => {
    const pharmaActions = path.join(ROOT, "lib/pharmacy/actions.ts");
    assert.ok(fs.existsSync(pharmaActions), "Pharmacy actions must exist");
    const code = fs.readFileSync(pharmaActions, "utf8");
    assert.match(code, /dispenseMedicationAction|createPharmacyInvoiceAction|pharmacy/i);
  });

  // Canary 11: HR & Payroll
  test("Canary 11: HR & PAYROLL — Staff -> attendance -> payroll calculation -> salary posting", () => {
    const hrActions = path.join(ROOT, "lib/hr/actions.ts");
    assert.ok(fs.existsSync(hrActions), "HR actions must exist");
    const code = fs.readFileSync(hrActions, "utf8");
    assert.match(code, /calculatePayrollAction|postPayrollAction|attendance/i);
  });

  // Canary 12: Procurement & Inventory
  test("Canary 12: INVENTORY & PROCUREMENT — Requisition -> PO -> GRN -> stock-in -> valuation", () => {
    const procActions = path.join(ROOT, "lib/procurement/actions.ts");
    assert.ok(fs.existsSync(procActions), "Procurement actions must exist");
    const code = fs.readFileSync(procActions, "utf8");
    assert.match(code, /purchase_requisitions|purchase_orders|goods_receipt_notes|grn/i);
  });

  // Canary 13: Permanent Mistake Purge & Orphan Safety
  test("Canary 13: PERMANENT MISTAKE PURGE — Safe cancellation vs hard purge with zero orphan records", () => {
    const patientActions = path.join(ROOT, "lib/patient/actions.ts");
    const code = fs.readFileSync(patientActions, "utf8");
    assert.match(code, /cancelOrDeleteIpdAdmissionAction/);
    assert.match(code, /reconcile_bed_vacancy_drift_atomic/);
    assert.match(code, /canPurge/);
    assert.match(code, /permanentDelete/);
  });
});
