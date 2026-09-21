import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 35 Website, UI/UX, Role Security & Design System Forensics (12 Scenarios)", () => {

  test("1. HospitalSidebar does not contain a fake client-side role switcher select dropdown", () => {
    const sidebarCode = fs.readFileSync(path.join(ROOT, "components/app/HospitalSidebar.tsx"), "utf8");
    assert.ok(!sidebarCode.includes("<select"), "Sidebar must not contain a role switcher <select> element");
    assert.ok(!sidebarCode.includes("handleRoleChange"), "Sidebar must not contain handleRoleChange client mutation");
    assert.doesNotMatch(sidebarCode, /useState<RoleType>\("super_admin"\)/, "activeRole must not initialize to hardcoded super_admin");
  });

  test("2. HospitalSidebar derives identity and permissions from canonical getCurrentUserSession", () => {
    const sidebarCode = fs.readFileSync(path.join(ROOT, "components/app/HospitalSidebar.tsx"), "utf8");
    assert.ok(sidebarCode.includes("getCurrentUserSession"), "Sidebar must import and call getCurrentUserSession");
    assert.ok(sidebarCode.includes("Verified Staff Role"), "Sidebar must indicate verified role badge");
  });

  test("3. HospitalHeader contains no hardcoded sample notifications or fake clinical tokens", () => {
    const headerCode = fs.readFileSync(path.join(ROOT, "components/app/HospitalHeader.tsx"), "utf8");
    assert.ok(!headerCode.includes("New Token: B-007"), "Fake B-007 token must be eliminated");
    assert.ok(!headerCode.includes("CBC test verified for OH-000101"), "Fake OH-000101 lab result must be eliminated");
    assert.ok(!headerCode.includes("Ciprocin 500mg"), "Fake Ciprocin stock alert must be eliminated");
    assert.ok(headerCode.includes("No unread notifications"), "Authentic empty notification state required");
  });

  test("4. Public HomePage accurately labels 15-second polling queue as Auto-refresh instead of Realtime", () => {
    const homeCode = fs.readFileSync(path.join(ROOT, "app/(public)/page.tsx"), "utf8");
    assert.ok(homeCode.includes("Auto-refresh (15s)"), "Queue badge must honestly declare Auto-refresh (15s)");
    assert.doesNotMatch(homeCode, />\s*Realtime\s*</, "Misleading standalone Realtime badge must be removed from queue highlight");
  });

  test("5. Public HomePage eliminates unverified compliance and absolute marketing claims", () => {
    const homeCode = fs.readFileSync(path.join(ROOT, "app/(public)/page.tsx"), "utf8");
    assert.ok(!homeCode.includes("এন্ড-টু-এন্ড এনক্রিপশনে সংরক্ষিত"), "Unproven E2EE claim must be replaced with accurate RLS & TLS description");
    assert.ok(!homeCode.includes("Fully automated biochemistry and hematology analyzers"), "Exaggerated claim must be removed");
    assert.ok(!homeCode.includes("100% transparent billing without hidden costs"), "Absolute 100% billing claim must be removed");
  });

  test("6. Dashboard bed occupancy utilizes server-side head count queries without full table row scans", () => {
    const dashCode = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/dashboard/page.tsx"), "utf8");
    assert.ok(dashCode.includes('select("*", { count: "exact", head: true })'), "Must use count exact with head true");
    assert.doesNotMatch(dashCode, /\.select\("status"\)/, "Must not load full bed status rows into client array");
  });

  test("7. Dashboard invoice telemetry enforces bounded date boundaries and handles errors safely", () => {
    const dashCode = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/dashboard/page.tsx"), "utf8");
    assert.ok(dashCode.includes('.gte("created_at"'), "Must have gte lower date boundary");
    assert.ok(dashCode.includes('.lt("created_at"'), "Must have lt upper date boundary");
    assert.ok(dashCode.includes('"Unavailable"'), "Must display Unavailable rather than misleading 0 when query fails");
  });

  test("8. Dashboard queue action handlers prevent duplicate rapid clicks and check server response", () => {
    const dashCode = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/dashboard/page.tsx"), "utf8");
    assert.ok(dashCode.includes("actionInProgressId"), "Must track actionInProgressId to prevent duplicate clicks");
    assert.ok(dashCode.includes("if (res.success)"), "Must check server mutation result before updating client state");
  });

  test("9. Reports page eliminates hardcoded commission percentage and doctor fee fallbacks", () => {
    const reportsCode = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/reports/page.tsx"), "utf8");
    assert.ok(!reportsCode.includes("commRate = 20"), "Hardcoded 20% commission rate must be eliminated");
    assert.ok(!reportsCode.includes("opd_fee || 800"), "Hardcoded 800 fee fallback must be eliminated");
    assert.ok(!reportsCode.includes('room_number || "101"'), "Hardcoded room 101 fallback must be eliminated");
    assert.ok(reportsCode.includes("setPeriod"), "Must provide configurable period filtering");
  });

  test("10. Centralized SITE_CONFIG exists and governs canonical domain across metadata and sitemap", () => {
    const siteConfigPath = path.join(ROOT, "config/site.ts");
    assert.ok(fs.existsSync(siteConfigPath), "config/site.ts must exist");
    const siteConfig = fs.readFileSync(siteConfigPath, "utf8");
    assert.ok(siteConfig.includes("https://onneshahospital.com"), "Canonical URL must default to onneshahospital.com");

    const layoutCode = fs.readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8");
    assert.ok(layoutCode.includes("SITE_CONFIG.canonicalUrl"), "app/layout.tsx must use SITE_CONFIG");

    const sitemapCode = fs.readFileSync(path.join(ROOT, "app/sitemap.ts"), "utf8");
    assert.ok(sitemapCode.includes("SITE_CONFIG.canonicalUrl"), "app/sitemap.ts must use SITE_CONFIG");
  });

  test("11. public/_headers enforces Content-Security-Policy, HSTS and anti-clickjacking headers", () => {
    const headersPath = path.join(ROOT, "public/_headers");
    assert.ok(fs.existsSync(headersPath), "public/_headers must exist");
    const headersContent = fs.readFileSync(headersPath, "utf8");
    assert.ok(headersContent.includes("Content-Security-Policy:"), "Content-Security-Policy header required");
    assert.ok(headersContent.includes("Strict-Transport-Security:"), "HSTS header required");
    assert.ok(headersContent.includes("X-Frame-Options: DENY"), "Anti-clickjacking header required");
  });

  test("12. CheckToken page accurately documents auto-refreshing intervals", () => {
    const checkTokenCode = fs.readFileSync(path.join(ROOT, "app/(public)/check-token/page.tsx"), "utf8");
    assert.ok(checkTokenCode.includes("Auto-refreshing every 15s"), "Token check page must state honest 15s auto-refresh interval");
  });

});
