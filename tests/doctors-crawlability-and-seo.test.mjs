/**
 * Verification Test Suite: Doctors Directory Crawlability, SEO, Structured Data & Edge Cases
 * Asserts:
 * 1. layout.tsx includes valid schema.org JSON-LD structured data and crawlable semantic landmarks.
 * 2. layout.tsx metadata excludes sensitive column promises (no BMDC registration number advertising).
 * 3. page.tsx handles loading skeletons, empty states, API error / retry, department filter, real-time search, and deep-linking.
 * 4. page.tsx wraps client content in Suspense for static export safety.
 * 5. out/doctors.html contains pre-rendered JSON-LD and semantic landmarks before client hydration.
 * 6. Zero private doctor columns (bmdc_reg_number, salary, followup_fee, commission_rate) exposed.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "out");

describe("Doctors Directory Crawlability, SEO & Static Export Verification", () => {
  const layoutPath = path.join(ROOT, "app/(public)/doctors/layout.tsx");
  const pagePath = path.join(ROOT, "app/(public)/doctors/page.tsx");
  const doctorsHtmlPath = path.join(OUT_DIR, "doctors.html");

  test("1. app/(public)/doctors/layout.tsx exists and is a Server Component", () => {
    assert.ok(fs.existsSync(layoutPath), "layout.tsx must exist");
    const content = fs.readFileSync(layoutPath, "utf8");

    // Server Component verification: Must NOT contain 'use client'
    assert.ok(
      !content.includes('"use client"') && !content.includes("'use client'"),
      "layout.tsx must remain a Server Component for static pre-rendering at build time"
    );
  });

  test("2. layout.tsx defines accurate metadata without advertising private BMDC numbers", () => {
    const content = fs.readFileSync(layoutPath, "utf8");

    // Check title and description
    assert.ok(content.includes("Specialist Doctor Directory"), "Title must define Specialist Doctor Directory");
    assert.ok(content.includes('canonical: "/doctors"'), "Must specify canonical /doctors");

    // Must NOT advertise private BMDC numbers in metadata description
    assert.ok(
      !content.toLowerCase().includes("their bmdc registration"),
      "Metadata must not promise private BMDC registration number"
    );
  });

  test("3. layout.tsx includes valid Schema.org JSON-LD structured data", () => {
    const content = fs.readFileSync(layoutPath, "utf8");

    assert.ok(content.includes('type="application/ld+json"'), "Must render application/ld+json script");
    assert.ok(content.includes('"@type": "MedicalWebPage"'), "Must declare MedicalWebPage schema");
    assert.ok(content.includes('"@type": "MedicalSpecialty"'), "Must declare MedicalSpecialty entries");
    assert.ok(content.includes('"@type": "ItemList"'), "Must declare ItemList of clinical departments");
    assert.ok(content.includes('"@type": "Hospital"'), "Must reference Hospital entity");

    // Must NOT contain fabricated ratings or reviews
    assert.ok(!content.includes("aggregateRating"), "Must not include fake aggregateRating");
    assert.ok(!content.includes("reviewCount"), "Must not include fake reviewCount");
  });

  test("4. layout.tsx renders crawlable semantic HTML landmarks for medical specialties", () => {
    const content = fs.readFileSync(layoutPath, "utf8");

    // Semantic landmark verification
    assert.ok(content.includes('id="clinical-specialties-directory"'), "Must define clinical specialties section landmark");
    assert.ok(content.includes('aria-labelledby="specialties-overview-heading"'), "Must have accessible heading label");
    assert.ok(content.includes("<article"), "Must use semantic article elements for clinical departments");
    assert.ok(content.includes("<aside"), "Must use semantic aside element for OPD guidelines");

    // Clinical departments coverage
    const expectedDepartments = [
      "General Medicine",
      "Cardiology & Heart Care",
      "Gynecology & Obstetrics",
      "Pediatrics & Child Health",
      "Orthopedic Surgery",
      "Pathology & Lab Medicine",
      "Radiology & Imaging",
      "Emergency & Critical Care",
    ];

    for (const dept of expectedDepartments) {
      assert.ok(content.includes(dept), `Must include ${dept} in semantic landmark`);
    }
  });

  test("5. app/(public)/doctors/page.tsx implements all required edge cases", () => {
    assert.ok(fs.existsSync(pagePath), "page.tsx must exist");
    const content = fs.readFileSync(pagePath, "utf8");

    // Edge Case 1: Loading skeleton
    assert.ok(content.includes("DoctorsLoadingSkeleton"), "Must define DoctorsLoadingSkeleton");
    assert.ok(content.includes('aria-busy="true"'), "Loading skeleton must announce aria-busy=true");

    // Edge Case 2: API error / retry state
    assert.ok(content.includes('role="alert"'), "Must have accessible role=alert for errors");
    assert.ok(content.includes("Retry Connection") || content.includes("loadData()"), "Must provide retry button invoking loadData");
    assert.ok(content.includes("HOSPITAL_METADATA.phone"), "Must offer reception phone link during error state");

    // Edge Case 3: Empty doctor states (global empty & filter-zero-matches)
    assert.ok(content.includes("doctors.length === 0"), "Must handle API zero doctors state");
    assert.ok(content.includes("filteredDoctors.length === 0"), "Must handle zero filter matches state");
    assert.ok(content.includes("handleResetFilters") || content.includes("Clear Filters"), "Must provide reset filters action");

    // Edge Case 4: Department filter
    assert.ok(content.includes("selectedDept"), "Must manage selectedDept state");
    assert.ok(content.includes('aria-pressed='), "Must provide aria-pressed attribute for department pills");
    assert.ok(content.includes("All Departments"), "Must have All Departments filter option");

    // Edge Case 5: Real-time search query
    assert.ok(content.includes("searchQuery"), "Must manage searchQuery state");
    assert.ok(content.includes("Showing"), "Must display active doctor results count");
    assert.ok(content.includes('aria-label="Clear search input"'), "Must provide quick clear search action");

    // Edge Case 6: Direct appointment deep-link
    assert.ok(content.includes("/appointment?doctor="), "Doctor cards must link to direct appointment booking");
    assert.ok(content.includes("doctorDeepLinkParam") || content.includes("searchParams.get(\"doctor\")"), "Must support doctor query parameter deep-link");

    // Edge Case 7: Suspense boundary for Next.js static export
    assert.ok(content.includes("<Suspense fallback="), "Must wrap client search content in Suspense");
  });

  test("6. No private doctor columns exposed in public doctor page or layout", () => {
    const layoutContent = fs.readFileSync(layoutPath, "utf8");
    const pageContent = fs.readFileSync(pagePath, "utf8");

    const sensitiveFields = [
      "bmdc_reg_number",
      "basic_salary",
      "net_salary",
      "salary",
      "followup_fee",
      "report_followup_fee",
      "commission_rate",
    ];

    for (const field of sensitiveFields) {
      assert.ok(!layoutContent.includes(field), `layout.tsx must not reference ${field}`);
      assert.ok(!pageContent.includes(field), `page.tsx must not reference ${field}`);
    }
  });

  test("7. out/doctors.html pre-renders structured data and landmarks in static export", () => {
    assert.ok(fs.existsSync(doctorsHtmlPath), "out/doctors.html must exist from production build");
    const html = fs.readFileSync(doctorsHtmlPath, "utf8");

    // Crawlability check: Schema.org script must be present in static output
    assert.ok(html.includes("application/ld+json"), "out/doctors.html must include JSON-LD script tag");
    assert.ok(html.includes("MedicalWebPage"), "out/doctors.html must include MedicalWebPage schema");
    assert.ok(html.includes("MedicalSpecialty"), "out/doctors.html must include MedicalSpecialty schema");

    // Landmark check: Department overview must be pre-rendered in static HTML
    assert.ok(
      html.includes("clinical-specialties-directory"),
      "out/doctors.html must contain static clinical-specialties-directory landmark"
    );
    assert.ok(
      html.includes("General Medicine") && html.includes("Cardiology &amp; Heart Care"),
      "out/doctors.html must contain pre-rendered clinical department titles"
    );

    // Private field check on static output
    assert.ok(!html.includes("bmdc_reg_number"), "out/doctors.html must not contain bmdc_reg_number");
    assert.ok(!html.includes("followup_fee"), "out/doctors.html must not contain followup_fee");
    assert.ok(!html.includes("commission_rate"), "out/doctors.html must not contain commission_rate");
  });
});
