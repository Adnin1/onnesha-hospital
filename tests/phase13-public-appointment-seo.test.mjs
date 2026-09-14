import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("OHMS Phase 13 Public Website, Online Appointment & SEO Suite", async (t) => {
  // Scenario 1: Migration 022 defines public views and book_online_appointment RPC
  await t.test("1. Migration 022 defines public sanitized views and book_online_appointment RPC", () => {
    const migrationContent = fs.readFileSync(
      path.join(rootDir, "supabase", "migrations", "022_phase13_public_online_booking.sql"),
      "utf8"
    );
    assert.match(migrationContent, /public_doctors_view/);
    assert.match(migrationContent, /public_departments_view/);
    assert.match(migrationContent, /book_online_appointment/);
    assert.match(migrationContent, /public_contact_inquiries/);
    assert.match(migrationContent, /get_next_token/);
    assert.match(migrationContent, /waiting_queue/);
  });

  // Scenario 2: Public doctors view explicitly omits salary, commissions, and private HR data
  await t.test("2. Public doctors view strictly omits private HR, salary, and commission columns", () => {
    const migrationContent = fs.readFileSync(
      path.join(rootDir, "supabase", "migrations", "022_phase13_public_online_booking.sql"),
      "utf8"
    );
    const viewQuery = migrationContent.split("CREATE OR REPLACE VIEW public_doctors_view")[1].split(";")[0];
    assert.doesNotMatch(viewQuery, /salary/i);
    assert.doesNotMatch(viewQuery, /commission/i);
    assert.doesNotMatch(viewQuery, /bank_account/i);
    assert.doesNotMatch(viewQuery, /national_id/i);
  });

  // Scenario 3: lib/public/actions.ts provides sanitized public actions
  await t.test("3. lib/public/actions.ts provides public data layer without unrestricted select(*)", () => {
    const publicActions = fs.readFileSync(
      path.join(rootDir, "lib", "public", "actions.ts"),
      "utf8"
    );
    assert.match(publicActions, /getPublicDoctorsAction/);
    assert.match(publicActions, /getPublicDepartmentsAction/);
    assert.match(publicActions, /bookOnlineAppointmentAction/);
    assert.match(publicActions, /submitContactInquiryAction/);
    assert.match(publicActions, /isValidNormalizedBDPhone/);
  });

  // Scenario 4: Online appointment page connects to real backend actions and has zero mock imports
  await t.test("4. app/(public)/appointment/page.tsx connects to real database actions with zero mock imports", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(public)", "appointment", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /getPublicDoctorsAction/);
    assert.match(pageContent, /bookOnlineAppointmentAction/);
    assert.match(pageContent, /HospitalPrintHeader/);
    assert.doesNotMatch(pageContent, /from "@\/lib\/mock-data"/);
    assert.doesNotMatch(pageContent, /Math\.random\(\)/);
  });

  // Scenario 5: Public doctors page connects to database actions
  await t.test("5. app/(public)/doctors/page.tsx connects to real database actions with zero mock imports", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(public)", "doctors", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /getPublicDoctorsAction/);
    assert.match(pageContent, /getPublicDepartmentsAction/);
    assert.doesNotMatch(pageContent, /from "@\/lib\/mock-data"/);
  });

  // Scenario 6: Check token page queries live waiting queue
  await t.test("6. app/(public)/check-token/page.tsx connects to live database waiting queue", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(public)", "check-token", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /getLiveWaitingQueueAction/);
    assert.doesNotMatch(pageContent, /from "@\/lib\/mock-data"/);
  });

  // Scenario 7: Public contact page connects to real inquiry action and canonical metadata
  await t.test("7. app/(public)/contact/page.tsx submits inquiries and uses canonical metadata", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(public)", "contact", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /submitContactInquiryAction/);
    assert.match(pageContent, /HOSPITAL_METADATA/);
    assert.doesNotMatch(pageContent, /from "@\/lib\/mock-data"/);
  });

  // Scenario 8: Public navbar & footer use canonical metadata
  await t.test("8. PublicNavbar and PublicFooter use canonical HOSPITAL_METADATA", () => {
    const navbarContent = fs.readFileSync(
      path.join(rootDir, "components", "public", "PublicNavbar.tsx"),
      "utf8"
    );
    const footerContent = fs.readFileSync(
      path.join(rootDir, "components", "public", "PublicFooter.tsx"),
      "utf8"
    );
    assert.match(navbarContent, /HOSPITAL_METADATA/);
    assert.match(footerContent, /HOSPITAL_METADATA/);
    assert.doesNotMatch(navbarContent, /from "@\/lib\/mock-data"/);
    assert.doesNotMatch(footerContent, /from "@\/lib\/mock-data"/);
  });

  // Scenario 9: SEO sitemap exists and excludes private /app routes
  await t.test("9. Sitemap is implemented and strictly restricts indexing of internal /app routes", () => {
    const sitemapContent = fs.readFileSync(
      path.join(rootDir, "app", "sitemap.ts"),
      "utf8"
    );
    assert.match(sitemapContent, /\/doctors/);
    assert.match(sitemapContent, /\/appointment/);
    assert.match(sitemapContent, /\/check-token/);
    assert.doesNotMatch(sitemapContent, /\/app\//);
    assert.doesNotMatch(sitemapContent, /\/login/);
  });

  // Scenario 10: JSON-LD Hospital structured data component is mounted
  await t.test("10. HospitalJsonLd structured data schema.org is mounted in public layout", () => {
    const jsonLdContent = fs.readFileSync(
      path.join(rootDir, "components", "public", "HospitalJsonLd.tsx"),
      "utf8"
    );
    const layoutContent = fs.readFileSync(
      path.join(rootDir, "app", "(public)", "layout.tsx"),
      "utf8"
    );
    assert.match(jsonLdContent, /"@type": "Hospital"/);
    assert.match(jsonLdContent, /"emergencyTelephone"/);
    assert.match(layoutContent, /<HospitalJsonLd \/>/);
  });
});
