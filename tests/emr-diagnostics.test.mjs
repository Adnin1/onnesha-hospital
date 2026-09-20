import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 5 Prescriptions & Diagnostic Lab EMR Suite (10 Scenarios)", () => {
  // Scenario 1: types/clinical-emr.ts defines Prescription and Diagnostic models
  test("1. types/clinical-emr.ts defines PrescriptionRecord, PrescriptionItemRecord, DiagnosticOrderRecord", () => {
    const typesContent = fs.readFileSync(path.join(rootDir, "types", "clinical-emr.ts"), "utf8");
    assert.match(typesContent, /export interface PrescriptionRecord/);
    assert.match(typesContent, /export interface PrescriptionItemRecord/);
    assert.match(typesContent, /export interface DiagnosticOrderRecord/);
    assert.match(typesContent, /export interface DiagnosticParameterRecord/);
  });

  // Scenario 2: createPrescriptionAction checks permissions and mandatory diagnosis
  test("2. createPrescriptionAction asserts requirePermission('prescriptions.create') and requires diagnosis", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "prescriptions", "actions.ts"), "utf8");
    assert.match(actionsContent, /requirePermission\("prescriptions\.create"\)/);
    assert.match(actionsContent, /Clinical diagnosis is mandatory for prescription issuance/);
  });

  // Scenario 3: createPrescriptionAction inserts prescription items with dosage patterns
  test("3. createPrescriptionAction inserts prescription line items and records audit event", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "prescriptions", "actions.ts"), "utf8");
    assert.match(actionsContent, /\.from\("prescription_items"\)\s*\.insert/);
    assert.match(actionsContent, /recordAuditLog/);
    assert.match(actionsContent, /entityType:\s*"prescription"/);
  });

  // Scenario 4: getPrescriptionsAction supports patientId and limit filtering
  test("4. getPrescriptionsAction retrieves prescriptions with full patient, doctor, and line item joins", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "prescriptions", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getPrescriptionsAction/);
    assert.match(actionsContent, /prescription_items\(\*\)/);
  });

  // Scenario 5: getDiagnosticOrdersAction queries orders with test parameters and barcode collections
  test("5. getDiagnosticOrdersAction retrieves orders with parameters, reference ranges, and barcodes", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "lab", "actions.ts"), "utf8");
    assert.match(actionsContent, /export async function getDiagnosticOrdersAction/);
    assert.match(actionsContent, /sample_collections\(barcode\)/);
    assert.match(actionsContent, /diagnostic_result_values/);
  });

  // Scenario 6: verifyDiagnosticReportAction updates status and saves electronic signature
  test("6. verifyDiagnosticReportAction asserts lab.manage permission and generates pathologist verification signature", () => {
    const actionsContent = fs.readFileSync(path.join(rootDir, "lib", "lab", "actions.ts"), "utf8");
    assert.match(actionsContent, /requirePermission\("lab\.manage"\)/);
    assert.match(actionsContent, /status:\s*"VERIFIED"/);
    assert.match(actionsContent, /diagnostic_report_verifications/);
    assert.match(actionsContent, /signature_hash/);
  });

  // Scenario 7: app/(hospital)/app/prescriptions/page.tsx has zero mock data imports
  test("7. app/prescriptions/page.tsx uses real database actions and has zero mock data imports", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "prescriptions", "page.tsx"),
      "utf8"
    );
    assert.doesNotMatch(pageContent, /@\/lib\/mock-data/);
    assert.match(pageContent, /getPrescriptionsAction/);
    assert.match(pageContent, /createPrescriptionAction/);
    assert.match(pageContent, /HospitalPrintHeader/);
    assert.match(pageContent, /HospitalPrintFooter/);
  });

  // Scenario 8: app/(hospital)/app/lab/page.tsx has zero mock data imports
  test("8. app/lab/page.tsx uses real database actions and has zero mock data imports", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "lab", "page.tsx"),
      "utf8"
    );
    assert.doesNotMatch(pageContent, /@\/lib\/mock-data/);
    assert.match(pageContent, /getDiagnosticOrdersAction/);
    assert.match(pageContent, /verifyDiagnosticReportAction/);
    assert.match(pageContent, /HospitalPrintHeader/);
  });

  // Scenario 9: Prescriptions page includes E-Rx modal and medicine row additions
  test("9. Prescriptions page supports dynamic prescription item rows and print pad", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "prescriptions", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /handleAddMedRow/);
    assert.match(pageContent, /handleCreatePrescription/);
    assert.match(pageContent, /dosage_pattern/);
  });

  // Scenario 10: Lab page supports sample barcoding and pathologist signature verification
  test("10. Lab page displays sample barcode and dual-gate pathologist verification", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "lab", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /handleVerifyReport/);
    assert.match(pageContent, /VERIFIED/);
    assert.match(pageContent, /Barcode/);
  });
});

