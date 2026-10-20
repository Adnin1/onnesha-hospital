import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 43: Billing Invoice Patient Age & Lab Test Delivery Time Verification", async (t) => {
  const printFilePath = path.join(ROOT, "components", "print", "HalfLetterInvoicePrint.tsx");
  const billingPagePath = path.join(ROOT, "app", "(hospital)", "app", "billing", "page.tsx");
  const billingActionsPath = path.join(ROOT, "lib", "billing", "actions.ts");
  const a4PrintPath = path.join(ROOT, "components", "print", "A4InvoicePrint.tsx");
  const thermalPrintPath = path.join(ROOT, "components", "print", "ThermalReceipt.tsx");

  assert.ok(fs.existsSync(printFilePath), "HalfLetterInvoicePrint.tsx must exist");
  assert.ok(fs.existsSync(billingPagePath), "Billing page.tsx must exist");
  assert.ok(fs.existsSync(billingActionsPath), "Billing actions.ts must exist");

  const printContent = fs.readFileSync(printFilePath, "utf8");
  const billingPageContent = fs.readFileSync(billingPagePath, "utf8");
  const billingActionsContent = fs.readFileSync(billingActionsPath, "utf8");
  const a4Content = fs.readFileSync(a4PrintPath, "utf8");
  const thermalContent = fs.readFileSync(thermalPrintPath, "utf8");

  await t.test("1. HalfLetterInvoicePrint.tsx decouples age from gender", () => {
    // Must NOT wrap patient.age strictly inside {patient.gender && ( ... )}
    assert.doesNotMatch(
      printContent,
      /\{patient\.gender\s*&&\s*\(\s*<span[^>]*>\s*\(\{patient\.gender\{patient\.age/,
      "Must not lock patient.age inside patient.gender conditional"
    );
    assert.match(
      printContent,
      /genderAgeDisplay/,
      "Must compute decoupled genderAgeDisplay to render age even when gender is undefined"
    );
    assert.match(
      printContent,
      /formattedAgeStr/,
      "Must compute formattedAgeStr handling number, string, and Bengali year units"
    );
  });

  await t.test("2. HalfLetterInvoicePrint.tsx detects diagnostic items and renders delivery schedule", () => {
    assert.match(
      printContent,
      /isDiagnosticItem/,
      "Must include isDiagnosticItem helper"
    );
    assert.match(
      printContent,
      /getEstimatedDeliveryHours/,
      "Must include getEstimatedDeliveryHours helper"
    );
    assert.match(
      printContent,
      /calculateEstimatedDelivery/,
      "Must include calculateEstimatedDelivery helper"
    );
    assert.match(
      printContent,
      /print-delivery-badge/,
      "Must render print-delivery-badge for diagnostic report delivery schedule"
    );
    assert.match(
      printContent,
      /রিপোর্ট ডেলিভারি সময়সূচী|ডেলিভারি সময়/,
      "Must display Bengali delivery schedule header"
    );
    assert.match(
      printContent,
      /টেস্ট গ্রহণ/,
      "Must display test intake/order time"
    );
    assert.match(
      printContent,
      /সম্ভাব্য ডেলিভারি/,
      "Must display expected delivery time"
    );
  });

  await t.test("3. HalfLetterInvoicePrint itemized table renders per-test test time and delivery time", () => {
    assert.match(
      printContent,
      /itemTurnaround/,
      "Table rows must calculate turnaround per item"
    );
    assert.match(
      printContent,
      /itemDelivery/,
      "Table rows must calculate delivery time per diagnostic item"
    );
    assert.match(
      printContent,
      /itemTestTime/,
      "Table rows must render test intake time per diagnostic item"
    );
  });

  await t.test("4. billing/page.tsx supplies gender and formatted age in both preview and print modal", () => {
    // Check selectedInvoice preview
    assert.match(
      billingPageContent,
      /gender:\s*selectedInvoice\.patient\?\.gender/,
      "Preview must pass patient gender"
    );
    assert.match(
      billingPageContent,
      /formatPatientAgeDisplay\(\s*selectedInvoice\.patient\?\.age/,
      "Preview must format patient age with formatPatientAgeDisplay"
    );

    // Check halfLetterPrint modal
    assert.match(
      billingPageContent,
      /gender:\s*halfLetterPrintInv\.patient\?\.gender/,
      "Print modal must pass patient gender"
    );
    assert.match(
      billingPageContent,
      /formatPatientAgeDisplay\(\s*halfLetterPrintInv\.patient\?\.age/,
      "Print modal must format patient age with formatPatientAgeDisplay"
    );
  });

  await t.test("5. lib/billing/actions.ts queries patient age, pediatric months/days, and DOB", () => {
    assert.match(
      billingActionsContent,
      /patients\s*\([^)]*age_months[^)]*age_days[^)]*dob[^)]*\)/,
      "getInvoicesAction must select age_months, age_days, dob from patients table"
    );
    assert.match(
      billingActionsContent,
      /select\("id,\s*patient_code,\s*full_name,\s*phone,\s*gender,\s*address,\s*age,\s*age_months,\s*age_days,\s*dob/,
      "createInvoiceAction must select full demographics including age_months and age_days"
    );
  });

  await t.test("6. A4InvoicePrint and ThermalReceipt also support patient age, gender, and delivery time", () => {
    assert.match(a4Content, /patient\.gender\s*\|\|\s*patient\.age/, "A4 invoice must render patient gender and age");
    assert.match(thermalContent, /patientGender\s*\|\|\s*patientAge/, "Thermal receipt must render patient age and gender");
    assert.match(thermalContent, /deliveryTimeStr/, "Thermal receipt must support report delivery time");
  });
});
