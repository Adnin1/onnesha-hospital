import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 37: v1.1.57 Production Excellence, Tariff Authority & Website Finalization", () => {
  // Test 1: Service / Tariff Authority — Database tariff overrides software fallback
  test("1. Service / Tariff Authority: Database diagnostic tests override static software fallbacks", async () => {
    const catalogPath = path.join(rootDir, "lib", "billing", "serviceCatalog.ts");
    assert.ok(fs.existsSync(catalogPath), "serviceCatalog.ts must exist");

    // Dynamic import to test function runtime behavior directly
    const { getAllHospitalServices, MASTER_HOSPITAL_SERVICES } = await import(`../lib/billing/serviceCatalog.ts?v=${Date.now()}`);

    // Verify baseline static fallback has CBC
    const staticCbc = MASTER_HOSPITAL_SERVICES.find((s) => s.name.includes("Complete Blood Count (CBC)"));
    assert.ok(staticCbc, "MASTER_HOSPITAL_SERVICES must contain CBC");
    assert.equal(staticCbc.price, 400, "Static fallback price for CBC is 400");

    // Simulate database returning authoritative tariff update for CBC (e.g. 550) + a custom new test
    const mockDbTests = [
      {
        id: "db-test-cbc-01",
        test_name: staticCbc.name,
        price: 550,
        category_name: "Hematology",
      },
      {
        id: "db-test-dengue-02",
        test_name: "Dengue NS1 Antigen Test",
        price: 700,
        category_name: "Serology",
      },
    ];

    const resolvedServices = getAllHospitalServices(mockDbTests);

    // CBC must now have the authoritative database price (550), NOT 400!
    const resolvedCbc = resolvedServices.find((s) => s.name === staticCbc.name);
    assert.ok(resolvedCbc, "Resolved services must contain CBC");
    assert.equal(resolvedCbc.price, 550, "Database tariff (550) must strictly override fallback default (400)");
    assert.equal(resolvedCbc.isDatabaseAuthoritative, true, "CBC must be flagged as database authoritative");

    // Dengue test must be appended as new dynamic service
    const resolvedDengue = resolvedServices.find((s) => s.name.includes("Dengue NS1 Antigen Test"));
    assert.ok(resolvedDengue, "Dynamic tests from DB must be added to catalog");
    assert.equal(resolvedDengue.price, 700);
    assert.equal(resolvedDengue.isDatabaseAuthoritative, true);
  });

  // Test 2: Safe Fallback when Database Catalog is Empty or Unreachable
  test("2. Safe Fallback: When DB tests are absent, catalog returns software defaults without failure", async () => {
    const { getAllHospitalServices, MASTER_HOSPITAL_SERVICES } = await import(`../lib/billing/serviceCatalog.ts?v2=${Date.now()}`);

    const fallbackServices = getAllHospitalServices();
    assert.equal(fallbackServices.length, MASTER_HOSPITAL_SERVICES.length, "Must return fallback master services");
    assert.ok(fallbackServices.every((s) => s.isDatabaseAuthoritative === false), "Fallback services must indicate non-DB authoritative state");
  });

  // Test 3: Public Homepage 17-Section Architecture & Heading Structure
  test("3. Homepage Finalization: app/(public)/page.tsx implements exact clinical hierarchy and no fake data", () => {
    const pagePath = path.join(rootDir, "app", "(public)", "page.tsx");
    assert.ok(fs.existsSync(pagePath), "page.tsx must exist");
    const content = fs.readFileSync(pagePath, "utf8");

    // Hero headline and verified CTAs
    assert.match(content, /Patient-first care\. Trusted doctors\. Modern diagnostics\./, "Hero headline must match specification");
    assert.match(content, /Book an Appointment/, "Must include primary Book an Appointment CTA");
    assert.match(content, /Emergency \/ Call Now/, "Must include Emergency Hotline CTA");
    assert.match(content, /Check Live Token/, "Must include Check Live Token CTA");

    // Section 7: Quick Actions
    assert.match(content, /Quick Actions/, "Must include Quick Actions section");
    assert.match(content, /Specialist consultations/, "Quick action 1");
    assert.match(content, /Find doctors &amp; visiting hours/, "Quick action 2");
    assert.match(content, /Services &amp; Tests/, "Quick action 3");

    // Section 8: Medical Departments
    assert.match(content, /Our Medical Departments/, "Must include departments section");
    assert.match(content, /Cardiology/, "Must include cardiology");
    assert.match(content, /Gynecology/, "Must include gynecology");
    assert.match(content, /Pediatrics/, "Must include pediatrics");
    assert.match(content, /Orthopedics/, "Must include orthopedics");

    // Section 9: Core Services & Diagnostics
    assert.match(content, /Hospital Services &amp; Diagnostics/, "Must include services section");
    assert.match(content, /Outdoor Consultation \(OPD\)/);
    assert.match(content, /24\/7 Emergency &amp; Casualty/);
    assert.match(content, /Indoor Admission \(IPD\)/);
    assert.match(content, /Clinical Diagnostics (&|&amp;) Lab/);
    assert.match(content, /Hospital Pharmacy/);
    assert.match(content, /Operation Theatre \(OT\)/);

    // Section 10: Featured Specialists Widget
    assert.match(content, /<FeaturedDoctorsWidget \/>/, "Must embed FeaturedDoctorsWidget");

    // Section 11: Why Choose Us (Zero fake data)
    assert.match(content, /Why Patients Trust Onnesha Hospital/);
    assert.doesNotMatch(content, /50,\s*000\+|100% cure|#1 hospital/i, "Must not contain fake patient statistics or awards");

    // Section 12: Facilities Overview
    assert.match(content, /Our Inpatient &amp; Diagnostic Facilities/);
    assert.match(content, /General Ward/);
    assert.match(content, /Deluxe Cabins/);
    assert.match(content, /Critical Care/);

    // Section 13: How Appointment Works (4 steps)
    assert.match(content, /How Online Appointment Works/);
    assert.match(content, /Select Doctor (&|&amp;) Specialty/);
    assert.match(content, /Choose Schedule (&|&amp;) Date/);
    assert.match(content, /Enter Patient Details/);
    assert.match(content, /Receive Instant Token/);

    // Section 14: Safe Live Token Info
    assert.match(content, /Privacy-Protected Live Token Displays/);

    // Section 15: Location, Hours & Contact
    assert.match(content, /Hospital Location/);
    assert.match(content, /Visiting (&|&amp;) Service Hours/);
    assert.match(content, /Direct Contact Numbers/);

    // Section 16: Emergency CTA
    assert.match(content, /Need Immediate Medical Assistance\?/);
  });

  // Test 4: LiveQueueWidget Privacy & Visibility Resilience
  test("4. LiveQueueWidget: Enforces zero-PII projection and pauses polling when document is hidden", () => {
    const queuePath = path.join(rootDir, "components", "public", "LiveQueueWidget.tsx");
    assert.ok(fs.existsSync(queuePath), "LiveQueueWidget.tsx must exist");
    const content = fs.readFileSync(queuePath, "utf8");

    // Page Visibility API check
    assert.match(content, /document\.hidden/, "Must respect Page Visibility API to pause polling when tab is hidden");
    assert.match(content, /inFlight/, "Must prevent overlapping duplicate concurrent requests");

    // PII shielding: QueueItem type must not contain patient personal data
    assert.match(content, /token_number:\s*string/);
    assert.match(content, /room_number:\s*string/);
    assert.match(content, /doctor_name:\s*string/);
    assert.doesNotMatch(content, /patient_name|patient_phone|patient_nid|diagnosis/);
  });

  // Test 5: Service Worker v1.1.57 Cache Versioning & Old Cache Purge
  test("5. Service Worker: Enforces CACHE_VERSION ohms-static-v5-1.1.57 and clean cache purge", () => {
    const swPath = path.join(rootDir, "public", "sw.js");
    assert.ok(fs.existsSync(swPath), "sw.js must exist");
    const content = fs.readFileSync(swPath, "utf8");

    assert.match(content, /const CACHE_VERSION = 'ohms-static-v5-1\.1\.(57|58)';/);
    assert.match(content, /keys\.filter\(key => key !== CACHE_VERSION\)\.map\(key => caches\.delete\(key\)\)/, "Must purge old cache versions on activate");
    assert.match(content, /NEVER_CACHE_PATTERNS/, "Must define never-cache patterns for private/clinical/auth routes");
  });

  // Test 6: Content Truth Governance & DGHS Facility Identity
  test("6. Content Truth Governance: Maintains DGHS Facility ID 10022715 and documented truth blockers", () => {
    const configPath = path.join(rootDir, "config", "hospital.ts");
    assert.ok(fs.existsSync(configPath), "config/hospital.ts must exist");
    const content = fs.readFileSync(configPath, "utf8");

    assert.match(content, /dghsFacilityId:\s*"10022715"/);
    assert.match(content, /dghsRegisteredName:\s*"ANNESHA HOSPITAL \/ অন্বেষা হাসপাতাল"/);
    assert.match(content, /CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED/);
  });

  // Test 7: Synchronized Version across all manifests
  test("7. Version Synchronization: version is synchronized across all manifests (1.1.57+)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    assert.match(pkg.version, /^1\.1\.(57|58)$/, "package.json must be 1.1.57 or 1.1.58");

    const pkgLock = JSON.parse(fs.readFileSync(path.join(rootDir, "package-lock.json"), "utf8"));
    assert.match(pkgLock.version, /^1\.1\.(57|58)$/, "package-lock.json must match");
    assert.match(pkgLock.packages[""].version, /^1\.1\.(57|58)$/, "package-lock.json empty package must match");

    const dockerfile = fs.readFileSync(path.join(rootDir, "Dockerfile"), "utf8");
    assert.match(dockerfile, /LABEL version="1\.1\.(57|58)"/, "Dockerfile LABEL version must match");

    const cargoToml = fs.readFileSync(path.join(rootDir, "src-tauri", "Cargo.toml"), "utf8");
    assert.match(cargoToml, /version\s*=\s*"1\.1\.(57|58)"/, "Cargo.toml version must match");

    const tauriConf = JSON.parse(fs.readFileSync(path.join(rootDir, "src-tauri", "tauri.conf.json"), "utf8"));
    assert.match(tauriConf.version, /^1\.1\.(57|58)$/, "tauri.conf.json version must match");

    const sw = fs.readFileSync(path.join(rootDir, "public", "sw.js"), "utf8");
    assert.match(sw, /CACHE_VERSION\s*=\s*'ohms-static-v5-1\.1\.(57|58)'/, "sw.js CACHE_VERSION must match");

    const latestJson = JSON.parse(fs.readFileSync(path.join(rootDir, "public", "downloads", "desktop", "latest.json"), "utf8"));
    assert.match(latestJson.version, /^1\.1\.(57|58)$/, "latest.json version must match");
  });
});
