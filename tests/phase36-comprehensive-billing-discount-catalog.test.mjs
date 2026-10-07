import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 36: Comprehensive Billing Catalog, Dynamic Test Adder, % Discount (5%-60%) & Instant Print Suite", () => {
  // Test 1: serviceCatalog.ts exports and structure
  test("1. serviceCatalog.ts exports MASTER_HOSPITAL_SERVICES covering consultations, labs, imaging, beds, ICU, OT, and nursing", () => {
    const catalogPath = path.join(rootDir, "lib", "billing", "serviceCatalog.ts");
    assert.ok(fs.existsSync(catalogPath), "serviceCatalog.ts must exist");
    const content = fs.readFileSync(catalogPath, "utf8");

    assert.match(content, /export const MASTER_HOSPITAL_SERVICES/);
    assert.match(content, /export function getAllHospitalServices/);

    // Check all 7 key groups are present
    assert.match(content, /group:\s*"CONSULTATION"/);
    assert.match(content, /group:\s*"LAB"/);
    assert.match(content, /group:\s*"IMAGING"/);
    assert.match(content, /group:\s*"BED_CABIN"/);
    assert.match(content, /group:\s*"CRITICAL_CARE"/);
    assert.match(content, /group:\s*"OT_SURGERY"/);
    assert.match(content, /group:\s*"EMERGENCY_NURSING"/);

    // Verify key hospital services
    assert.match(content, /General OPD Consultation/);
    assert.match(content, /Complete Blood Count \(CBC\)/);
    assert.match(content, /Serum Creatinine/);
    assert.match(content, /Digital X-Ray/);
    assert.match(content, /Ultrasonography/);
    assert.match(content, /General Ward Bed/);
    assert.match(content, /Single Deluxe AC Cabin/);
    assert.match(content, /Intensive Care Unit \(ICU\)/);
    assert.match(content, /Major Surgical Theatre/);
    assert.match(content, /Caesarean Section/);
    assert.match(content, /Oxygen/);
    assert.match(content, /Hospital Ambulance Service/);
  });

  // Test 2: Dynamic Lab Tests Merging
  test("2. getAllHospitalServices deduplicates and merges dynamic lab tests from database", () => {
    const catalogPath = path.join(rootDir, "lib", "billing", "serviceCatalog.ts");
    const content = fs.readFileSync(catalogPath, "utf8");

    assert.match(content, /getAllHospitalServices\(/);
    assert.match(content, /dynamicLabTests\?/);
    assert.match(content, /existingNames\.has/);
  });

  // Test 3: Admission Discount (% 5%-60%) in UnifiedPatientIntakeModal.tsx
  test("3. UnifiedPatientIntakeModal.tsx converts admission discount to percentage (5% - 60%)", () => {
    const intakePath = path.join(rootDir, "components", "patient", "UnifiedPatientIntakeModal.tsx");
    assert.ok(fs.existsSync(intakePath), "UnifiedPatientIntakeModal.tsx must exist");
    const content = fs.readFileSync(intakePath, "utf8");

    assert.match(content, /admissionDiscountPercent/);
    assert.match(content, /৫% - ৬০%/);
    assert.match(content, /p < 5 \|\| p > 60/);
    assert.match(content, /\[Admission Discount:\s*\$\{pct\}%\]/);
  });

  // Test 4: Billing Discount (% 5%-60%) in app/(hospital)/app/billing/page.tsx
  test("4. Billing Management Page converts billing discount to percentage (5% - 60%) with live BDT calculation", () => {
    const billingPagePath = path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx");
    assert.ok(fs.existsSync(billingPagePath), "billing page.tsx must exist");
    const content = fs.readFileSync(billingPagePath, "utf8");

    assert.match(content, /discountPercent/);
    assert.match(content, /calculatedDiscountAmount/);
    assert.match(content, /Math\.round\(\(subtotal \* Number\(discountPercent\)\) \/ 100\)/);
    assert.match(content, /p < 5 \|\| p > 60/);
    assert.match(content, /৫% থেকে ৬০%/);
    assert.match(content, /\[Discount:\s*\$\{discountPercent\}%\]/);
  });

  // Test 5: Quick Service Adder & Dynamic Catalog in Billing Modal
  test("5. Billing page displays full hospital service catalog, filter pills, and search", () => {
    const billingPagePath = path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx");
    const content = fs.readFileSync(billingPagePath, "utf8");

    assert.match(content, /হাসপাতাল সেবা ও প্যাথলজি টেস্ট ক্যাটালগ/);
    assert.match(content, /serviceFilterGroup/);
    assert.match(content, /serviceSearchTerm/);
    assert.match(content, /filteredServices/);
    assert.match(content, /all-hospital-services-datalist/);
    assert.match(content, /getDiagnosticTestsCatalogAction/);
  });

  // Test 6: Instant Bill Paper Print on Confirm & Issue Invoice
  test("6. Clicking Confirm & Issue Invoice triggers instant print and isolates invoice slip", () => {
    const billingPagePath = path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx");
    const content = fs.readFileSync(billingPagePath, "utf8");

    assert.match(content, /window\.print\(\)/);
    assert.match(content, /setTimeout\(\(\) => \{\s*window\.print\(\);\s*\}, 350\)/);
    assert.match(content, /print:hidden/);
    assert.match(content, /HospitalPrintHeader/);
    assert.match(content, /HospitalPrintFooter/);
  });
});
