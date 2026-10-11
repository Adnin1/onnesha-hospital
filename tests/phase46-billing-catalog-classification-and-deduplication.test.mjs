import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 46: Billing Catalog Classification, 3D UI & Deduplication Suite", () => {
  test("1. classifyServiceGroup correctly partitions services into their true medical groups", async () => {
    const { classifyServiceGroup } = await import("../lib/billing/serviceCatalog.ts");
    assert.strictEqual(typeof classifyServiceGroup, "function");

    // Bed & Cabin
    assert.strictEqual(classifyServiceGroup("IPD_BED", "Deluxe AC Cabin"), "BED_CABIN");
    assert.strictEqual(classifyServiceGroup("BED", "General Ward Bed"), "BED_CABIN");

    // Critical Care
    assert.strictEqual(classifyServiceGroup("CRITICAL_CARE", "Coronary Care Unit (CCU)"), "CRITICAL_CARE");
    assert.strictEqual(classifyServiceGroup("ICU", "Intensive Care Unit (ICU) Bed"), "CRITICAL_CARE");

    // Surgery & OT
    assert.strictEqual(classifyServiceGroup("OT_SURGERY", "Major Operation Theatre Facility"), "OT_SURGERY");
    assert.strictEqual(classifyServiceGroup("OT", "Caesarean Section (C-Section)"), "OT_SURGERY");

    // Doctor Consultation
    assert.strictEqual(classifyServiceGroup("CONSULTATION", "General OPD Consultation"), "CONSULTATION");
    assert.strictEqual(classifyServiceGroup("CONSULTATION", "Senior Professor Specialist Consultation"), "CONSULTATION");

    // Radiology & Imaging (CT, MRI, X-Ray, USG, ECG)
    assert.strictEqual(classifyServiceGroup("CT_SCAN", "CT Scan of Brain (Plain)"), "IMAGING");
    assert.strictEqual(classifyServiceGroup("MRI", "MRI of Knee Joint"), "IMAGING");
    assert.strictEqual(classifyServiceGroup("XRAY", "Digital Chest X-Ray"), "IMAGING");
    assert.strictEqual(classifyServiceGroup("USG", "USG of Pregnancy Profile"), "IMAGING");
    assert.strictEqual(classifyServiceGroup("ECG", "12-Lead Electrocardiogram"), "IMAGING");
    assert.strictEqual(classifyServiceGroup("ENDOSCOPY", "Upper GI Endoscopy"), "IMAGING");

    // Lab & Pathology
    assert.strictEqual(classifyServiceGroup("LAB", "Complete Blood Count (CBC) with ESR"), "LAB");
    assert.strictEqual(classifyServiceGroup("BIOCHEM", "Serum Bilirubin (Total)"), "LAB");
    assert.strictEqual(classifyServiceGroup("SERO_IMMUNO", "Blood Grouping & Rh Factor"), "LAB");

    // Emergency & Nursing
    assert.strictEqual(classifyServiceGroup("ADMISSION", "Inpatient Admission & Registration Fee"), "EMERGENCY_NURSING");
    assert.strictEqual(classifyServiceGroup("AMBULANCE", "Hospital Ambulance Service"), "EMERGENCY_NURSING");
  });

  test("2. getAllHospitalServices deduplicates items across built-in, dynamic tests, and database tariffs", async () => {
    const { getAllHospitalServices } = await import("../lib/billing/serviceCatalog.ts");
    
    const mockDynamicTests = [
      { id: "test-1", test_name: "Complete Blood Count (CBC) with ESR", price: 400, category_name: "Hematology" },
      { id: "test-2", test_name: "Custom Lab Investigation XYZ", price: 950, category_name: "Special" },
    ];

    const mockDatabaseTariffs = [
      { service_code: "SRV-TEST-1", service_name: "Complete Blood Count (CBC) with ESR", category: "LAB", price: 450 },
      { service_code: "SRV-CAB-AC", service_name: "Single Deluxe AC Cabin Daily Tariff", category: "IPD_BED", price: 2800 },
    ];

    const unified = getAllHospitalServices(mockDynamicTests, mockDatabaseTariffs);
    assert.ok(Array.isArray(unified));

    // Verify deduplication: CBC should only appear ONCE with the authoritative tariff price
    const cbcItems = unified.filter((u) => u.name.toLowerCase().includes("complete blood count"));
    assert.strictEqual(cbcItems.length, 1, "CBC must appear exactly once without duplicate entries");
    assert.strictEqual(cbcItems[0].price, 450, "Database tariff must override fallback price");

    // Verify Deluxe AC Cabin appears under BED_CABIN group with overridden tariff
    const cabin = unified.find((u) => u.name.toLowerCase().includes("deluxe ac cabin"));
    assert.ok(cabin, "Deluxe AC Cabin must exist");
    assert.strictEqual(cabin.group, "BED_CABIN", "Deluxe AC Cabin must be grouped under BED_CABIN");
    assert.strictEqual(cabin.price, 2800, "Database tariff must override base cabin price");
  });

  test("3. toDbInvoiceCategory converts extended categories to valid DB CHECK constraint values", async () => {
    const { toDbInvoiceCategory } = await import("../lib/billing/serviceCatalog.ts");

    assert.strictEqual(toDbInvoiceCategory("CT_SCAN"), "XRAY");
    assert.strictEqual(toDbInvoiceCategory("MRI"), "XRAY");
    assert.strictEqual(toDbInvoiceCategory("USG"), "USG");
    assert.strictEqual(toDbInvoiceCategory("IPD_BED"), "BED");
    assert.strictEqual(toDbInvoiceCategory("CRITICAL_CARE"), "BED");
    assert.strictEqual(toDbInvoiceCategory("OT_SURGERY"), "OT");
    assert.strictEqual(toDbInvoiceCategory("CONSULTATION"), "CONSULTATION");
    assert.strictEqual(toDbInvoiceCategory("LAB"), "LAB");
    assert.strictEqual(toDbInvoiceCategory("ADMISSION"), "MISC");
  });

  test("4. app/(hospital)/app/billing/page.tsx has no broken hardcoded CONSULTATION fallback", () => {
    const billingPagePath = path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx");
    const content = fs.readFileSync(billingPagePath, "utf8");

    assert.doesNotMatch(
      content,
      /t\.category === "LAB" \? "LAB" : "CONSULTATION"/,
      "page.tsx must not contain the faulty hardcoded consultation fallback"
    );
    assert.match(content, /serviceGroupCounts/, "page.tsx must compute dynamic serviceGroupCounts");
    assert.match(content, /getCategoryBadgeStyle/, "page.tsx must use getCategoryBadgeStyle for 3D badges");
  });

  test("5. app/(hospital)/app/billing/page.tsx has Left/Right 3D scroll buttons, mouse wheel, and auto-centering", () => {
    const billingPagePath = path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx");
    const content = fs.readFileSync(billingPagePath, "utf8");

    assert.match(content, /scrollCategoryTabs/, "Must implement scrollCategoryTabs function");
    assert.match(content, /canScrollCategoryLeft/, "Must track canScrollCategoryLeft state");
    assert.match(content, /canScrollCategoryRight/, "Must track canScrollCategoryRight state");
    assert.match(content, /handleCategoryWheel/, "Must support mouse-wheel horizontal scrolling");
    assert.match(content, /ChevronLeft/, "Must render ChevronLeft navigation button");
    assert.match(content, /ChevronRight/, "Must render ChevronRight navigation button");
    assert.match(content, /scrollIntoView/, "Must auto-center selected category tab into view");
  });
});
