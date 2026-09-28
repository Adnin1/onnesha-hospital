import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sanitizePostgrestSearchTerm, getDhakaDateRange } from "../lib/reports/financial.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Financial Reports Date Boundary, Search Sanitization & Service Worker Hardening", () => {
  test("1. sanitizePostgrestSearchTerm strips PostgREST syntax delimiters (commas, parens, quotes, dots, backslashes)", () => {
    assert.equal(sanitizePostgrestSearchTerm("INV-001,test"), "INV-001test");
    assert.equal(sanitizePostgrestSearchTerm("INV.(123)"), "INV123");
    assert.equal(sanitizePostgrestSearchTerm('INV"test\\'), "INVtest");
    assert.equal(sanitizePostgrestSearchTerm("   INV-2026-999   "), "INV-2026-999");
  });

  test("2. sanitizePostgrestSearchTerm strips SQL LIKE wildcards (% and _) to avoid arbitrary wildcard scan injection", () => {
    assert.equal(sanitizePostgrestSearchTerm("%INV%"), "INV");
    assert.equal(sanitizePostgrestSearchTerm("INV_001_"), "INV001");
    assert.equal(sanitizePostgrestSearchTerm("%%%"), "");
  });

  test("3. sanitizePostgrestSearchTerm preserves legitimate alphanumeric identifiers, hyphens, and Bangla characters", () => {
    assert.equal(sanitizePostgrestSearchTerm("INV-202609-00042"), "INV-202609-00042");
    assert.equal(sanitizePostgrestSearchTerm("জরুরি"), "জরুরি");
    assert.equal(sanitizePostgrestSearchTerm("ডাক্তার"), "ডাক্তার");
    assert.equal(sanitizePostgrestSearchTerm(""), "");
    assert.equal(sanitizePostgrestSearchTerm(undefined), "");
  });

  test("4. sanitizePostgrestSearchTerm truncates excessive inputs to 60 characters", () => {
    const longInput = "A".repeat(120);
    const sanitized = sanitizePostgrestSearchTerm(longInput);
    assert.equal(sanitized.length, 60);
  });

  test("5. getDhakaDateRange exports exact half-open [startInclusive, endExclusive) interval across midnight transitions", () => {
    const refDate = new Date("2026-09-28T12:00:00Z");
    const today = getDhakaDateRange("today", undefined, undefined, refDate);

    // Dhaka midnight: 2026-09-28 00:00:00 BST = 2026-09-27T18:00:00.000Z
    // Dhaka end: 2026-09-28 23:59:59.999 BST = 2026-09-28T17:59:59.999Z
    // Dhaka endExclusive: 2026-09-29 00:00:00 BST = 2026-09-28T18:00:00.000Z
    assert.equal(today.endExclusive.getTime() - today.start.getTime(), 86400000, "Today interval must span exactly 24 hours (86,400,000 ms)");
    assert.equal(today.endExclusive.getTime() - today.end.getTime(), 1, "endExclusive must follow end by exactly 1 ms");

    // A record at 23:59:59.999 BST must satisfy: created_at >= start && created_at < endExclusive
    const lastMsRecord = new Date(today.end.getTime());
    assert.ok(lastMsRecord.getTime() >= today.start.getTime(), "Must be >= start");
    assert.ok(lastMsRecord.getTime() < today.endExclusive.getTime(), "Must be < endExclusive");

    // A record at next day midnight 00:00:00 BST must NOT satisfy: created_at < endExclusive
    const nextDayMidnight = new Date(today.endExclusive.getTime());
    assert.ok(!(nextDayMidnight.getTime() < today.endExclusive.getTime()), "Next day midnight must be excluded by < endExclusive");
  });

  test("6. lib/reports/actions.ts enforces endExclusiveDate with .lt and sanitizes searchQuery with .ilike", () => {
    const actionsPath = path.join(ROOT, "lib/reports/actions.ts");
    const code = fs.readFileSync(actionsPath, "utf8");

    // Must define sanitizePostgrestSearchTerm
    assert.ok(code.includes("sanitizePostgrestSearchTerm"), "actions.ts must define and use sanitizePostgrestSearchTerm");

    // Must use .lt with endBoundary in paginated invoices and export actions
    assert.ok(code.includes('query.lt("created_at", endBoundary)'), "Must use .lt for exclusive end boundary");

    // Must use .ilike with sanitized search term
    assert.ok(code.includes('query.ilike("invoice_number", `%${sanitizedSearch}%`)'), "Must use .ilike with sanitized search query");
  });

  test("7. app/(hospital)/app/reports/page.tsx supplies endExclusiveIso for both paginated queries and CSV export", () => {
    const pagePath = path.join(ROOT, "app/(hospital)/app/reports/page.tsx");
    const code = fs.readFileSync(pagePath, "utf8");

    // Paginated action call must pass endExclusiveIso
    assert.ok(code.includes("endDate: period === \"all\" ? undefined : dateBounds.endExclusiveIso"), "page.tsx must pass endExclusiveIso to getPaginatedReportInvoicesAction");

    // Export action call must pass endExclusiveIso
    assert.ok(code.includes("endExclusiveDate: period === \"all\" ? undefined : dateBounds.endExclusiveIso"), "page.tsx must pass endExclusiveDate to getExportReportInvoicesAction");
  });

  test("8. public/sw.js defines PUBLIC_CACHE_ALLOWLIST and enforces fail-closed network-only handling for unlisted routes", () => {
    const swPath = path.join(ROOT, "public/sw.js");
    const code = fs.readFileSync(swPath, "utf8");

    assert.ok(code.includes("PUBLIC_CACHE_ALLOWLIST"), "sw.js must define PUBLIC_CACHE_ALLOWLIST");
    assert.ok(code.includes("PUBLIC_CACHE_ALLOWLIST.has(cleanPath)"), "sw.js must check allowlist before caching HTML");
    assert.ok(code.includes("// Any other route: network-only, NEVER cached"), "sw.js must fail closed for unlisted routes");
  });

  test("9. Root layout app/layout.tsx declares canonical URL as root '/'", () => {
    const layoutPath = path.join(ROOT, "app/layout.tsx");
    const code = fs.readFileSync(layoutPath, "utf8");

    assert.ok(code.includes('canonical: "/"'), "app/layout.tsx must declare canonical: '/'");
    assert.ok(!code.includes('canonical: "./"'), "app/layout.tsx must not declare relative './'");
  });
});
