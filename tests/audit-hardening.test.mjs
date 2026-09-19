import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("OHMS Master Production Audit & Phase 1-12 Hardening Suite", async (t) => {
  await t.test("1. Migration 021 defines concurrency-safe sequences and constraints", () => {
    const migrationContent = fs.readFileSync(
      path.join(rootDir, "supabase", "migrations", "021_master_audit_concurrency_identifiers.sql"),
      "utf8"
    );
    assert.match(migrationContent, /generate_receipt_number/);
    assert.match(migrationContent, /generate_employee_code/);
    assert.match(migrationContent, /generate_pharmacy_sale_number/);
    assert.match(migrationContent, /generate_emergency_temp_id/);
    assert.match(migrationContent, /idx_unique_active_bed_assignment/);
    assert.match(migrationContent, /idx_unique_active_cabin_assignment/);
    assert.match(migrationContent, /chk_invoices_paid_not_exceed_total/);
    assert.match(migrationContent, /chk_batch_non_negative_stock/);
    assert.match(migrationContent, /get_next_token/);
  });

  await t.test("2. Canonical HOSPITAL_METADATA is configured with zero mock data", () => {
    const configContent = fs.readFileSync(
      path.join(rootDir, "config", "hospital.ts"),
      "utf8"
    );
    assert.match(configContent, /HOSPITAL_METADATA/);
    assert.match(configContent, /Onnesha Hospital/);
    assert.match(configContent, /emergencyHotline/);
    assert.match(configContent, /ambulanceHotline/);
    assert.ok(!configContent.includes("01700-112233"), "Must not contain invented emergency hotline");
    assert.ok(!configContent.includes("01800-445566"), "Must not contain invented ambulance hotline");
  });

  await t.test("3. Billing actions enforce overpayment validation and database sequences", () => {
    const billingActions = fs.readFileSync(
      path.join(rootDir, "lib", "billing", "actions.ts"),
      "utf8"
    );
    assert.match(billingActions, /generate_invoice_number/);
    assert.match(billingActions, /generate_receipt_number/);
    assert.match(billingActions, /exceeds outstanding invoice due/);
    assert.doesNotMatch(billingActions, /OH-INV-\$\{Date\.now/);
    assert.doesNotMatch(billingActions, /OH-RCT-\$\{Date\.now/);
  });

  await t.test("4. HR actions use generate_employee_code database sequence", () => {
    const hrActions = fs.readFileSync(
      path.join(rootDir, "lib", "hr", "actions.ts"),
      "utf8"
    );
    assert.match(hrActions, /generate_employee_code/);
    assert.doesNotMatch(hrActions, /EMP-\$\{Date\.now/);
  });

  await t.test("5. Pharmacy actions use generate_pharmacy_sale_number database sequence", () => {
    const pharmacyActions = fs.readFileSync(
      path.join(rootDir, "lib", "pharmacy", "actions.ts"),
      "utf8"
    );
    assert.match(pharmacyActions, /generate_pharmacy_sale_number/);
    assert.doesNotMatch(pharmacyActions, /PH-SL-\$\{Date\.now/);
  });

  await t.test("6. Appointment booking uses atomic RPC book_staff_appointment_atomic", () => {
    const apptActions = fs.readFileSync(
      path.join(rootDir, "lib", "appointments", "actions.ts"),
      "utf8"
    );
    assert.match(apptActions, /book_staff_appointment_atomic/);
  });

  await t.test("7. Emergency page connects to live database actions with zero fake fallbacks", () => {
    const emgPage = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "emergency", "page.tsx"),
      "utf8"
    );
    assert.match(emgPage, /getEmergencyCasesAction/);
    assert.doesNotMatch(emgPage, /em-\$\{Date\.now/);
    assert.doesNotMatch(emgPage, /Math\.random\(\)/);
  });

  await t.test("8. SMS service returns unconfigured status when credentials missing", () => {
    const smsService = fs.readFileSync(
      path.join(rootDir, "lib", "sms", "sms-service.ts"),
      "utf8"
    );
    assert.match(smsService, /SMS Gateway not configured/);
    assert.doesNotMatch(smsService, /SIM-\$\{Date\.now/);
  });

  await t.test("9. Critical UI components do not import lib/mock-data", () => {
    const header = fs.readFileSync(
      path.join(rootDir, "components", "app", "HospitalHeader.tsx"),
      "utf8"
    );
    const printHeader = fs.readFileSync(
      path.join(rootDir, "components", "print", "HospitalPrintHeader.tsx"),
      "utf8"
    );
    const patientDetail = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "patients", "[id]", "PatientDetailView.tsx"),
      "utf8"
    );

    assert.doesNotMatch(header, /from "@\/lib\/mock-data"/);
    assert.doesNotMatch(printHeader, /from "@\/lib\/mock-data"/);
    assert.doesNotMatch(patientDetail, /from "@\/lib\/mock-data"/);
  });
});
