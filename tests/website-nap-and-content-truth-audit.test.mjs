import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Website NAP (Name, Address, Phone) & Content Truth Audit Matrix", () => {
  const hospitalConfigPath = path.join(ROOT, "config/hospital.ts");
  const siteConfigPath = path.join(ROOT, "config/site.ts");
  const sitemapPath = path.join(ROOT, "app/sitemap.ts");
  const llmsPath = path.join(ROOT, "public/llms.txt");
  const footerPath = path.join(ROOT, "components/public/PublicFooter.tsx");
  const navbarPath = path.join(ROOT, "components/public/PublicNavbar.tsx");
  const jsonLdPath = path.join(ROOT, "components/public/HospitalJsonLd.tsx");
  const contactPath = path.join(ROOT, "app/(public)/contact/page.tsx");
  const aboutPath = path.join(ROOT, "app/(public)/about/page.tsx");

  test("1. config/hospital.ts exists and acts as the SINGLE AUTHORITATIVE SOURCE of truth", () => {
    assert.ok(fs.existsSync(hospitalConfigPath), "config/hospital.ts must exist");
    const content = fs.readFileSync(hospitalConfigPath, "utf8");

    assert.ok(content.includes("SINGLE AUTHORITATIVE SOURCE OF TRUTH"), "Must declare single source of truth");
    assert.ok(content.includes("export const HOSPITAL_METADATA"), "Must export HOSPITAL_METADATA");
    assert.ok(content.includes("dghsFacilityId: \"10022715\""), "Must include DGHS Facility ID 10022715");
    assert.ok(content.includes("ANNESHA HOSPITAL / অন্বেষা হাসপাতাল"), "Must include DGHS registered facility name");
  });

  test("2. config/hospital.ts tags physical address with 'CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED'", () => {
    const content = fs.readFileSync(hospitalConfigPath, "utf8");

    assert.ok(content.includes("CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED"));
    assert.ok(content.includes("সোনালী ব্যাংকের সামনে, খান্দার, বগুড়া"), "Must document repository default address");
    assert.ok(content.includes("Mofiz Paglar Mor, Sherpur Road, Bogura"), "Must document external directory finding");
    assert.ok(content.includes("physicalAddress"), "Must structure physicalAddress blocker");
  });

  test("3. config/hospital.ts tags English brand transliteration with 'CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED'", () => {
    const content = fs.readFileSync(hospitalConfigPath, "utf8");

    assert.ok(content.includes("englishBrandTransliteration"), "Must structure englishBrandTransliteration blocker");
    assert.ok(content.includes("Annesha Hospital and Diagnostic Center"), "Must document ERP & database default");
    assert.ok(content.includes("Onnesha Hospital & Diagnostic Complex"), "Must document public web portal branding");
  });

  test("4. config/site.ts synchronizes directly with config/hospital.ts", () => {
    assert.ok(fs.existsSync(siteConfigPath));
    const content = fs.readFileSync(siteConfigPath, "utf8");

    assert.ok(content.includes('from "./hospital"'), "Must import from config/hospital");
    assert.ok(content.includes("HOSPITAL_METADATA.banglaName"), "Must sync banglaName from hospital config");
    assert.ok(content.includes("HOSPITAL_METADATA.shortName"), "Must sync shortName from hospital config");
    assert.ok(content.includes("HOSPITAL_METADATA.currency"), "Must sync currency from hospital config");
    assert.ok(content.includes("CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED"), "Must note blocker in site config");
  });

  test("5. app/sitemap.ts tags content truth blocker and contains no conflicting hardcoded addresses", () => {
    assert.ok(fs.existsSync(sitemapPath));
    const content = fs.readFileSync(sitemapPath, "utf8");

    assert.ok(content.includes("CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED"), "Must tag blocker in sitemap comments");
    assert.ok(!content.includes("Sherpur Road"), "Must not leak unverified external directory address in sitemap");
  });

  test("6. public/llms.txt documents authoritative NAP truth and tags content truth blockers", () => {
    assert.ok(fs.existsSync(llmsPath));
    const content = fs.readFileSync(llmsPath, "utf8");

    assert.ok(content.includes("Organization Identity & NAP (Name, Address, Phone) Content Truth"), "Section 1 required");
    assert.ok(content.includes("config/hospital.ts"), "Must cite config/hospital.ts as authoritative source");
    assert.ok(content.includes("10022715"), "Must cite DGHS Facility ID 10022715");
    assert.ok(content.includes("01718835623"), "Must cite official phone");
    assert.ok(content.includes("01904210065"), "Must cite ambulance hotline");
    assert.ok(content.includes("CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED"), "Must tag blocker");
  });

  test("7. PublicFooter, PublicNavbar, and HospitalJsonLd consume authoritative metadata without hardcoded address conflicts", () => {
    const footer = fs.readFileSync(footerPath, "utf8");
    const navbar = fs.readFileSync(navbarPath, "utf8");
    const jsonLd = fs.readFileSync(jsonLdPath, "utf8");

    // Footer
    assert.ok(footer.includes("HOSPITAL_METADATA.address"), "Footer renders address from hospital metadata");
    assert.ok(footer.includes("HOSPITAL_METADATA.phone"), "Footer renders phone from hospital metadata");
    assert.ok(footer.includes("HOSPITAL_METADATA.ambulanceHotline"), "Footer renders ambulance from hospital metadata");
    assert.ok(!footer.includes("Sherpur Road"), "Footer must not contain unverified external directory address");

    // Navbar
    assert.ok(navbar.includes("HOSPITAL_METADATA.shortName"), "Navbar uses dynamic shortName");
    assert.ok(navbar.includes("HOSPITAL_METADATA.banglaName"), "Navbar uses dynamic banglaName");

    // JSON-LD
    assert.ok(jsonLd.includes("HOSPITAL_METADATA.address"), "JsonLd uses hospital metadata address");
    assert.ok(jsonLd.includes("HOSPITAL_METADATA.dghsFacilityId"), "JsonLd includes DGHS Facility ID");
    assert.ok(!jsonLd.includes("Sherpur Road"), "JsonLd must not contain unverified address");
  });

  test("8. Contact page and About page consume authoritative hospital metadata with zero hardcoded conflicts", () => {
    const contact = fs.readFileSync(contactPath, "utf8");
    const about = fs.readFileSync(aboutPath, "utf8");

    assert.ok(contact.includes("HOSPITAL_METADATA.address"), "Contact page renders hospital address");
    assert.ok(contact.includes("CONTENT TRUTH BLOCKER — OWNER VERIFICATION REQUIRED"), "Contact page tags blocker in comment");
    assert.ok(!contact.includes("Sherpur Road"), "Contact page must not hardcode unverified address");

    assert.ok(about.includes("HOSPITAL_METADATA.address"), "About page renders hospital address");
    assert.ok(about.includes("HOSPITAL_METADATA.dghsFacilityId"), "About page displays DGHS Facility ID");
    assert.ok(!about.includes("Sherpur Road"), "About page must not hardcode unverified address");
  });
});
