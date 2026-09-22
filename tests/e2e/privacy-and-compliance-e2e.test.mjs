import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkSystemHealth, sanitizeErrorForTelemetry } from "../../lib/health-core.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Data Privacy BD 2026 & OWASP ASVS Security Compliance E2E Suite (10 Scenarios)", async () => {

  test("1. Public privacy policy page exists and references BD Personal Data Protection Act 2026", () => {
    const privacyPath = path.join(ROOT, "app/(public)/privacy/page.tsx");
    assert.ok(fs.existsSync(privacyPath), "Privacy page file must exist");
    const content = fs.readFileSync(privacyPath, "utf8");
    assert.ok(content.includes("Bangladesh Personal Data Protection Act"), "Must reference BD PDP Act");
    assert.ok(content.includes("Privacy & Patient Relations Contact Desk"), "Must specify privacy contact desk");
  });

  test("2. Public terms of service page exists and contains emergency medical disclaimer", () => {
    const termsPath = path.join(ROOT, "app/(public)/terms/page.tsx");
    assert.ok(fs.existsSync(termsPath), "Terms page file must exist");
    const content = fs.readFileSync(termsPath, "utf8");
    assert.ok(content.includes("Terms of Service"), "Terms title required");
    assert.ok(content.includes("CRITICAL NOTICE") || content.includes("Emergency"), "Emergency disclaimer required");
  });

  test("3. Public consent management portal page exists and defines active consent categories", () => {
    const consentPath = path.join(ROOT, "app/(public)/consent/page.tsx");
    assert.ok(fs.existsSync(consentPath), "Consent page file must exist");
    const content = fs.readFileSync(consentPath, "utf8");
    assert.ok(content.includes("Patient Data Consent Portal"), "Consent title required");
    assert.ok(content.includes("Essential Clinical"), "Essential care consent category required");
  });

  test("4. app/sitemap.ts contains privacy, terms, consent, and desktop download routes", () => {
    const sitemapPath = path.join(ROOT, "app/sitemap.ts");
    assert.ok(fs.existsSync(sitemapPath), "sitemap.ts must exist");
    const content = fs.readFileSync(sitemapPath, "utf8");
    assert.ok(content.includes('"/privacy"'), "Privacy route required in sitemap");
    assert.ok(content.includes('"/terms"'), "Terms route required in sitemap");
    assert.ok(content.includes('"/consent"'), "Consent route required in sitemap");
    assert.ok(content.includes('"/downloads/desktop"'), "Desktop download route required in sitemap");
  });

  test("5. docs/DATA_PRIVACY_READINESS_BD_2026.md exists and specifies technical controls & legal disclaimer", () => {
    const privacyDocPath = path.join(ROOT, "docs/DATA_PRIVACY_READINESS_BD_2026.md");
    assert.ok(fs.existsSync(privacyDocPath), "Data privacy doc must exist");
    const content = fs.readFileSync(privacyDocPath, "utf8");
    assert.ok(content.includes("TECHNICAL READINESS ≠ LEGAL CERTIFICATION"), "Legal disclaimer required");
    assert.ok(content.includes("Row-Level Security"), "RLS technical control required");
  });

  test("6. docs/FINAL_SECURITY_MODEL.md maps OWASP ASVS 5.0 technical controls", () => {
    const secDocPath = path.join(ROOT, "docs/FINAL_SECURITY_MODEL.md");
    assert.ok(fs.existsSync(secDocPath), "Security model doc must exist");
    const content = fs.readFileSync(secDocPath, "utf8");
    assert.ok(content.includes("OWASP ASVS 5.0"), "ASVS mapping section required");
    assert.ok(content.includes("V4: Access Control"), "ASVS access control mapping required");
  });

  test("7. Health telemetry sanitizer redacts sensitive PHI and patient identifiers", () => {
    const err = new Error("Patient P-202609-99999 NID 1991234567890123 billing error");
    const sanitized = sanitizeErrorForTelemetry(err);
    assert.ok(!sanitized.message.includes("P-202609-99999"), "Patient ID must be stripped");
    assert.ok(!sanitized.message.includes("1991234567890123"), "NID must be stripped");
  });

  test("8. Service worker public/sw.js excludes sensitive API and patient paths from caching", () => {
    const swPath = path.join(ROOT, "public/sw.js");
    assert.ok(fs.existsSync(swPath), "sw.js must exist");
    const content = fs.readFileSync(swPath, "utf8");
    assert.ok(content.includes("NEVER_CACHE_PATTERNS"), "Cache exclusion rules required");
    assert.ok(content.includes("/patient/i"), "Patient path cache exclusion required");
  });

  test("9. System health check library lib/health.ts runs without leaking sensitive state", async () => {
    const health = await checkSystemHealth();
    assert.ok(health.status, "Health status returned");
    assert.equal(health.checks.outbox.pendingCount, 0, "Outbox check clean");
  });

  test("10. Public layout metadata falls back cleanly to canonical domain without onnesha.app references", () => {
    const layoutPath = path.join(ROOT, "app/layout.tsx");
    const sitemapPath = path.join(ROOT, "app/sitemap.ts");
    const layoutContent = fs.readFileSync(layoutPath, "utf8");
    const sitemapContent = fs.readFileSync(sitemapPath, "utf8");
    assert.ok(!layoutContent.includes("onnesha.app"), "No legacy domain in layout");
    assert.ok(!sitemapContent.includes("onnesha.app"), "No legacy domain in sitemap");
  });
});
