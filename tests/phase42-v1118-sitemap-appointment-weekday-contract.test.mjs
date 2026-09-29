import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getDhakaWeekday } from "../lib/datetime.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS v1.1.18 Hardening: Sitemap Consolidation, Appointment Filtering, and Contract Reconciliation", () => {
  test("1. getDhakaWeekday calculates accurate uppercase day of week in Asia/Dhaka timezone", () => {
    // 2026-09-30 is Wednesday
    assert.equal(getDhakaWeekday("2026-09-30"), "WEDNESDAY");
    // 2026-10-02 is Friday
    assert.equal(getDhakaWeekday("2026-10-02"), "FRIDAY");
    // 2026-10-03 is Saturday
    assert.equal(getDhakaWeekday("2026-10-03"), "SATURDAY");
    // 2026-10-04 is Sunday
    assert.equal(getDhakaWeekday("2026-10-04"), "SUNDAY");
    // Date object
    const dateObj = new Date("2026-10-05T06:00:00Z"); // 12:00 PM Dhaka -> Monday
    assert.equal(getDhakaWeekday(dateObj), "MONDAY");
  });

  test("2. Duplicate public/sitemap.xml is removed; app/sitemap.ts is authoritative and excludes /check-token", () => {
    const publicSitemap = path.join(ROOT, "public/sitemap.xml");
    assert.ok(!fs.existsSync(publicSitemap), "public/sitemap.xml must be deleted to prevent static collision");

    const appSitemap = path.join(ROOT, "app/sitemap.ts");
    assert.ok(fs.existsSync(appSitemap), "app/sitemap.ts must exist as authoritative generator");

    const content = fs.readFileSync(appSitemap, "utf8");
    assert.ok(!content.includes('"/check-token"'), "Transient queue lookup /check-token must NOT be in sitemap.ts");
    assert.ok(content.includes('"/appointment"'), "/appointment must be in sitemap.ts");
    assert.ok(content.includes('"/doctors"'), "/doctors must be in sitemap.ts");
  });

  test("3. PublicDoctor contract is strictly reconciled with public_doctors_view projection", () => {
    const actionsFile = fs.readFileSync(path.join(ROOT, "lib/public/actions.ts"), "utf8");
    assert.ok(!actionsFile.includes("bmdc_reg_number?:"), "bmdc_reg_number must not be exposed in PublicDoctor");
    assert.ok(!actionsFile.includes("followup_fee?:"), "followup_fee must not be in PublicDoctor");
    assert.ok(!/\s+bio\?:/.test(actionsFile), "bio must not be in PublicDoctor (public_bio only)");
    assert.ok(!actionsFile.includes("experience_years?:"), "experience_years must not be in PublicDoctor");

    const widgetFile = fs.readFileSync(path.join(ROOT, "components/public/FeaturedDoctorsWidget.tsx"), "utf8");
    assert.ok(!widgetFile.includes("doc.bmdc_reg_number"), "FeaturedDoctorsWidget must not reference bmdc_reg_number");

    const doctorsPage = fs.readFileSync(path.join(ROOT, "app/(public)/doctors/page.tsx"), "utf8");
    assert.ok(!doctorsPage.includes("doc.bmdc_reg_number"), "Doctors page must not reference bmdc_reg_number");
  });

  test("4. Appointment booking page implements Suspense boundary, doctor query param, and weekday filtering", () => {
    const apptPage = fs.readFileSync(path.join(ROOT, "app/(public)/appointment/page.tsx"), "utf8");
    assert.ok(apptPage.includes("<Suspense"), "AppointmentBookingPage must wrap content in <Suspense>");
    assert.ok(apptPage.includes("useSearchParams"), "Appointment page must consume query parameters");
    assert.ok(apptPage.includes("getDhakaWeekday"), "Appointment page must import getDhakaWeekday");
    assert.ok(apptPage.includes("matchingSchedules"), "Appointment page must derive matching schedules by weekday");
    assert.ok(apptPage.includes("doctorQueryParam"), "Appointment page must handle doctor query param");
  });

  test("5. deploy.yml enforces dedicated staging live-security-test gate before production deploy", () => {
    const deployFile = fs.readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    assert.ok(deployFile.includes("live-security-test:"), "deploy.yml must define live-security-test job");
    assert.ok(
      deployFile.includes("needs: [preflight-gate, live-security-test]"),
      "deploy-cloudflare must require [preflight-gate, live-security-test]"
    );
  });

  test("6. public/llms.txt claims are audited and accurate", () => {
    const llmsFile = fs.readFileSync(path.join(ROOT, "public/llms.txt"), "utf8");
    assert.ok(
      llmsFile.includes("Deferred — Inactive"),
      "Future apex domain must be documented as Deferred — Inactive"
    );
    assert.ok(
      !llmsFile.includes("Automated Delivery"),
      "Diagnostics must not claim unsupported automated IoT delivery"
    );
    assert.ok(
      llmsFile.includes("Structured Lab Test Reporting with Pathologist Sign-Off Verification"),
      "Diagnostics must accurately reflect structured pathology reporting with sign-off locking"
    );
  });
});
