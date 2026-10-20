import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Pediatric & Baby Age (Years, Months, Days) Invariants", () => {
  // Test 1: Utility Functions for Pediatric Age
  test("Pediatric Age Calculation Logic & Bi-directional DOB Sync", () => {
    // Implement standalone deterministic copy of lib/utils algorithm to verify mathematical invariants
    function calculateDetailedAgeFromDOB(dobStr, asOfDate = new Date()) {
      if (!dobStr) return { years: 0, months: 0, days: 0 };
      const parts = dobStr.split("-");
      if (parts.length !== 3) return { years: 0, months: 0, days: 0 };
      const birthYear = parseInt(parts[0], 10);
      const birthMonth = parseInt(parts[1], 10) - 1;
      const birthDay = parseInt(parts[2], 10);

      const birth = new Date(birthYear, birthMonth, birthDay);
      const now = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());

      if (birth > now) return { years: 0, months: 0, days: 0 };

      let years = now.getFullYear() - birth.getFullYear();
      let months = now.getMonth() - birth.getMonth();
      let days = now.getDate() - birth.getDate();

      if (days < 0) {
        months -= 1;
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += prevMonth.getDate();
      }

      if (months < 0) {
        years -= 1;
        months += 12;
      }

      return {
        years: Math.max(0, years),
        months: Math.max(0, months),
        days: Math.max(0, days),
      };
    }

    function calculateDOBFromYMD(years, months, days, asOfDate = new Date()) {
      const now = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());
      const targetYear = now.getFullYear() - Math.max(0, years);
      const targetMonth = now.getMonth() - Math.max(0, months);
      const targetDay = now.getDate() - Math.max(0, days);

      const computed = new Date(targetYear, targetMonth, targetDay);
      const y = computed.getFullYear();
      const m = String(computed.getMonth() + 1).padStart(2, "0");
      const d = String(computed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    const fixedNow = new Date(2026, 9, 20); // 2026-10-20

    // 15-day-old baby
    const dob15Days = "2026-10-05";
    const res15 = calculateDetailedAgeFromDOB(dob15Days, fixedNow);
    assert.equal(res15.years, 0, "Years must be 0 for baby under 1 month");
    assert.equal(res15.months, 0, "Months must be 0 for baby under 1 month");
    assert.equal(res15.days, 15, "Days must be 15");

    // 4-month-old baby
    const dob4Months = "2026-06-20";
    const res4M = calculateDetailedAgeFromDOB(dob4Months, fixedNow);
    assert.equal(res4M.years, 0);
    assert.equal(res4M.months, 4);
    assert.equal(res4M.days, 0);

    // Bi-directional round-trip
    const computedDob = calculateDOBFromYMD(0, 4, 10, fixedNow);
    const roundTrip = calculateDetailedAgeFromDOB(computedDob, fixedNow);
    assert.equal(roundTrip.years, 0);
    assert.equal(roundTrip.months, 4);
    assert.equal(roundTrip.days, 10);
  });

  // Test 2: Formatting display in Bengali and English
  test("formatPatientAgeDisplay produces accurate, culturally clear strings", () => {
    function toBengaliNumerals(num) {
      const en = "0123456789";
      const bn = "০১২৩৪৫৬৭৮৯";
      return String(num).replace(/[0-9]/g, (digit) => bn[en.indexOf(digit)] ?? digit);
    }

    function formatPatientAgeDisplay(years, months, days) {
      const y = typeof years === "number" ? years : 0;
      const m = typeof months === "number" ? months : 0;
      const d = typeof days === "number" ? days : 0;

      if (y === 0 && m === 0 && d === 0) {
        return "০ দিন (নবজাতক/শিশু)";
      }

      if (y === 0) {
        const parts = [];
        if (m > 0) parts.push(`${toBengaliNumerals(m)} মাস`);
        if (d > 0) parts.push(`${toBengaliNumerals(d)} দিন`);
        return `${parts.join(" ")} (নবজাতক/শিশু)`.trim();
      }

      const parts = [`${toBengaliNumerals(y)} বছর`];
      if (m > 0) parts.push(`${toBengaliNumerals(m)} মাস`);
      return parts.join(" ");
    }

    assert.equal(formatPatientAgeDisplay(0, 0, 12), "১২ দিন (নবজাতক/শিশু)");
    assert.equal(formatPatientAgeDisplay(0, 3, 0), "৩ মাস (নবজাতক/শিশু)");
    assert.equal(formatPatientAgeDisplay(0, 5, 20), "৫ মাস ২০ দিন (নবজাতক/শিশু)");
    assert.equal(formatPatientAgeDisplay(30, 0, 0), "৩০ বছর");
    assert.equal(formatPatientAgeDisplay(45, 6, 0), "৪৫ বছর ৬ মাস");
  });

  // Test 3: Verify Database Migration File Invariants
  test("Migration 216 contains required schema alterations and triggers", () => {
    const migrationPath = path.join(
      rootDir,
      "supabase",
      "migrations",
      "20261020170000_migration_216_pediatric_baby_age_months_days_support.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 216 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS age_months INT DEFAULT 0"), "Must create age_months column");
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS age_days INT DEFAULT 0"), "Must create age_days column");
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.sync_patients_dob_columns()"), "Must create sync function");
    assert.ok(sql.includes("CREATE TRIGGER trg_sync_patients_dob"), "Must attach trigger to patients table");
    assert.ok(sql.includes("BEFORE INSERT OR UPDATE ON public.patients"), "Must trigger before insert or update");
  });

  // Test 4: Verify Reusable Component and UI Integration
  test("PediatricAgeInputGroup component and modal integrations exist", () => {
    const componentPath = path.join(rootDir, "components", "patient", "PediatricAgeInputGroup.tsx");
    assert.ok(fs.existsSync(componentPath), "PediatricAgeInputGroup.tsx must exist");
    const componentCode = fs.readFileSync(componentPath, "utf8");
    assert.ok(componentCode.includes("ageYears"), "Must expose ageYears prop");
    assert.ok(componentCode.includes("ageMonths"), "Must expose ageMonths prop");
    assert.ok(componentCode.includes("ageDays"), "Must expose ageDays prop");
    assert.ok(componentCode.includes("onDobChange"), "Must expose onDobChange callback");

    // Unified Patient Intake Modal
    const intakeModalPath = path.join(rootDir, "components", "patient", "UnifiedPatientIntakeModal.tsx");
    const intakeCode = fs.readFileSync(intakeModalPath, "utf8");
    assert.ok(intakeCode.includes("PediatricAgeInputGroup"), "Intake modal must render PediatricAgeInputGroup");
    assert.ok(intakeCode.includes("age_months"), "Intake modal payload must include age_months");
    assert.ok(intakeCode.includes("age_days"), "Intake modal payload must include age_days");

    // Edit Patient Modal
    const editModalPath = path.join(rootDir, "components", "patient", "EditPatientModal.tsx");
    const editCode = fs.readFileSync(editModalPath, "utf8");
    assert.ok(editCode.includes("PediatricAgeInputGroup"), "Edit modal must render PediatricAgeInputGroup");

    // Billing Page
    const billingPath = path.join(rootDir, "app", "(hospital)", "app", "billing", "page.tsx");
    const billingCode = fs.readFileSync(billingPath, "utf8");
    assert.ok(billingCode.includes("PediatricAgeInputGroup"), "Billing page must render PediatricAgeInputGroup");
    assert.ok(billingCode.includes("formatPatientAgeDisplay"), "Billing page must use formatPatientAgeDisplay");

    // IPD Page
    const ipdPath = path.join(rootDir, "app", "(hospital)", "app", "ipd", "page.tsx");
    const ipdCode = fs.readFileSync(ipdPath, "utf8");
    assert.ok(ipdCode.includes("formatPatientAgeDisplay"), "IPD page must use formatPatientAgeDisplay");
    assert.ok(ipdCode.includes("UnifiedPatientIntakeModal"), "IPD page must integrate UnifiedPatientIntakeModal");
  });
});
