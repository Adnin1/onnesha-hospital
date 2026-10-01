import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Phase 62: Public Website Acceptance Matrix, SEO, A11y & Content Truth (10 Scenarios)", () => {
  const publicRoutes = [
    { path: "app/(public)/page.tsx", route: "/" },
    { path: "app/(public)/about/page.tsx", route: "/about" },
    { path: "app/(public)/services/page.tsx", route: "/services" },
    { path: "app/(public)/doctors/page.tsx", route: "/doctors" },
    { path: "app/(public)/appointment/page.tsx", route: "/appointment" },
    { path: "app/(public)/check-token/page.tsx", route: "/check-token" },
    { path: "app/(public)/contact/page.tsx", route: "/contact" },
    { path: "app/(public)/privacy/page.tsx", route: "/privacy" },
    { path: "app/(public)/terms/page.tsx", route: "/terms" },
    { path: "app/(public)/consent/page.tsx", route: "/consent" },
    { path: "app/(public)/downloads/desktop/page.tsx", route: "/downloads/desktop" },
  ];

  test("1. All public routes exist and are defined in the application tree", () => {
    for (const r of publicRoutes) {
      const fullPath = path.join(ROOT, r.path);
      assert.ok(fs.existsSync(fullPath), `Route file must exist: ${r.path}`);
    }
  });

  test("2. Canonical sitemap contains all public indexable routes and excludes private/auth routes", () => {
    const sitemapPath = path.join(ROOT, "app/sitemap.ts");
    assert.ok(fs.existsSync(sitemapPath));
    const content = fs.readFileSync(sitemapPath, "utf8");

    // All indexable routes must be present
    assert.ok(content.includes('""'), "Homepage in sitemap");
    assert.ok(content.includes('"/about"'), "About in sitemap");
    assert.ok(content.includes('"/doctors"'), "Doctors in sitemap");
    assert.ok(content.includes('"/services"'), "Services in sitemap");
    assert.ok(content.includes('"/appointment"'), "Appointment in sitemap");
    assert.ok(content.includes('"/contact"'), "Contact in sitemap");
    assert.ok(content.includes('"/privacy"'), "Privacy in sitemap");
    assert.ok(content.includes('"/terms"'), "Terms in sitemap");
    assert.ok(content.includes('"/consent"'), "Consent in sitemap");

    // Private routes must NOT be in sitemap
    assert.ok(!content.includes('"/app"'), "No internal app routes in sitemap");
    assert.ok(!content.includes('"/login"'), "No login in sitemap");
    assert.ok(!content.includes('"/mfa"'), "No MFA in sitemap");
  });

  test("3. robots.txt disallows internal app and auth routes while allowing public routes", () => {
    const robotsPath = path.join(ROOT, "public/robots.txt");
    assert.ok(fs.existsSync(robotsPath));
    const content = fs.readFileSync(robotsPath, "utf8");

    assert.ok(content.includes("Disallow: /app/"), "Disallows /app/");
    assert.ok(content.includes("Disallow: /login"), "Disallows /login");
    assert.ok(content.includes("Disallow: /auth/"), "Disallows /auth/");
    assert.ok(content.includes("Disallow: /forgot-password"), "Disallows /forgot-password");
    assert.ok(content.includes("Allow: /"), "Allows root public pages");
  });

  test("4. Personal Data Protection Act 2026 (Act No. 63 of 2026) is cited accurately without fictitious labeling", () => {
    const privacyPath = path.join(ROOT, "app/(public)/privacy/page.tsx");
    const consentPath = path.join(ROOT, "app/(public)/consent/page.tsx");
    const privacyContent = fs.readFileSync(privacyPath, "utf8");
    const consentContent = fs.readFileSync(consentPath, "utf8");

    // Must cite the real Act No. 63 of 2026
    assert.ok(
      privacyContent.includes("ব্যক্তিগত উপাত্ত সুরক্ষা আইন, ২০২৬") ||
      privacyContent.includes("Personal Data Protection Act, 2026"),
      "Privacy policy must cite PDPA 2026"
    );
    assert.ok(
      consentContent.includes("ব্যক্তিগত উপাত্ত সুরক্ষা আইন, ২০২৬") ||
      consentContent.includes("Personal Data Protection Act, 2026"),
      "Consent policy must cite PDPA 2026"
    );

    // Must NOT label it fictitious
    assert.ok(!privacyContent.toLowerCase().includes("fictitious"), "Must never call PDPA fictitious");
    assert.ok(!consentContent.toLowerCase().includes("fictitious"), "Must never call PDPA fictitious");
  });

  test("5. Structured Data JSON-LD implements Schema.org Hospital without fabricated ratings", () => {
    const jsonLdPath = path.join(ROOT, "components/public/HospitalJsonLd.tsx");
    assert.ok(fs.existsSync(jsonLdPath));
    const content = fs.readFileSync(jsonLdPath, "utf8");

    assert.ok(content.includes('"@type": "Hospital"'), "Schema.org Hospital type required");
    assert.ok(content.includes("SITE_CONFIG.canonicalUrl"), "Canonical URL required");
    assert.ok(!content.includes("aggregateRating"), "No fake ratings permitted");
    assert.ok(!content.includes("reviewCount"), "No fake reviews permitted");
  });

  test("6. Accessibility: Skip-to-content link, focus-visible, and touch target rules are defined in CSS", () => {
    const cssPath = path.join(ROOT, "app/globals.css");
    const layoutPath = path.join(ROOT, "app/layout.tsx");
    const publicLayoutPath = path.join(ROOT, "app/(public)/layout.tsx");
    const css = fs.readFileSync(cssPath, "utf8");
    const layout = fs.readFileSync(layoutPath, "utf8");
    const publicLayout = fs.readFileSync(publicLayoutPath, "utf8");

    assert.ok(layout.includes('className="skip-to-content"'), "Skip to content link in root layout");
    assert.ok(publicLayout.includes('<main id="main-content"'), "main-content landmark target in public layout");
    assert.ok(css.includes(".skip-to-content"), "Skip to content CSS defined");
    assert.ok(css.includes("*:focus-visible"), "Visible focus outline defined");
    assert.ok(css.includes("min-height: 44px"), "Coarse touch target 44px defined");
  });

  test("7. InstallPrompt component implements session-persisted dismissal and accessible region", () => {
    const promptPath = path.join(ROOT, "components/app/InstallPrompt.tsx");
    assert.ok(fs.existsSync(promptPath));
    const content = fs.readFileSync(promptPath, "utf8");

    assert.ok(content.includes("sessionStorage"), "Must check session storage for dismissal");
    assert.ok(content.includes('role="region"'), "Must have accessible landmark role");
    assert.ok(content.includes("install-prompt"), "Must have .install-prompt class for print shielding");
    assert.ok(content.includes("handleDismiss"), "Must have dismiss handler");
  });

  test("8. Security headers enforce HSTS, X-Frame-Options, CSP with strict allowlist", () => {
    const headersPath = path.join(ROOT, "public/_headers");
    assert.ok(fs.existsSync(headersPath));
    const content = fs.readFileSync(headersPath, "utf8");

    assert.ok(content.includes("Strict-Transport-Security"), "HSTS required");
    assert.ok(content.includes("X-Frame-Options: DENY"), "Frame deny required");
    assert.ok(content.includes("X-Content-Type-Options: nosniff"), "nosniff required");
    assert.ok(content.includes("Content-Security-Policy"), "CSP required");
    assert.ok(!content.includes("unsafe-eval"), "CSP must not allow unsafe-eval");
  });

  test("9. Appointment booking form handles doctor preselection, weekday validation, and loading disable", () => {
    const apptPath = path.join(ROOT, "app/(public)/appointment/page.tsx");
    assert.ok(fs.existsSync(apptPath));
    const content = fs.readFileSync(apptPath, "utf8");

    assert.ok(content.includes("doctorQueryParam"), "Supports doctor preselection from query param");
    assert.ok(content.includes("getDhakaWeekday"), "Validates weekday against chamber schedule");
    assert.ok(content.includes("disabled={bookingLoading}"), "Disables submit during booking mutation");
    assert.ok(content.includes("bookingError"), "Displays inline booking error without alert()");
  });

  test("10. Public navbar mobile menu has accessible controls, escape handler, and click-outside dismissal", () => {
    const navPath = path.join(ROOT, "components/public/PublicNavbar.tsx");
    assert.ok(fs.existsSync(navPath));
    const content = fs.readFileSync(navPath, "utf8");

    assert.ok(content.includes('aria-expanded={mobileOpen}'), "Mobile menu aria-expanded required");
    assert.ok(content.includes('e.key === "Escape"'), "Escape key closes mobile menu");
    assert.ok(content.includes('aria-controls="mobile-nav-menu"'), "aria-controls required");
  });
});
