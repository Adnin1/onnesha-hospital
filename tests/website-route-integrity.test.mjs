/**
 * Website Route Integrity & Static Export Verification Test Suite
 * Asserts all public routes, manifest icons, sitemap URLs, and robots.txt entries exist cleanly in out/.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "out");

describe("Conversation 3: Static Route Integrity & Sitemaps", () => {
  test("1. Core public pages are generated in static export out/", () => {
    assert.ok(fs.existsSync(OUT_DIR), "out/ directory must exist (run build first)");

    const expectedPages = [
      "index.html",
      "doctors.html",
      "appointment.html",
      "check-token.html",
      "contact.html",
      "privacy.html",
      "terms.html",
      "consent.html",
      "downloads/desktop.html",
      "login.html",
    ];

    for (const page of expectedPages) {
      const pagePath = path.join(OUT_DIR, page);
      assert.ok(
        fs.existsSync(pagePath),
        `Expected static route file '${page}' must exist in out/`
      );
      const content = fs.readFileSync(pagePath, "utf8");
      assert.ok(content.length > 200, `Page '${page}' should have valid non-trivial HTML content`);
      assert.ok(!content.includes("404 Not Found"), `Page '${page}' should not contain a 404 message`);
    }
  });

  test("2. manifest.json conforms to PWA specification and references existing icons", () => {
    const manifestPath = path.join(OUT_DIR, "manifest.json");
    assert.ok(fs.existsSync(manifestPath), "out/manifest.json must exist");

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.display, "standalone", "Display mode must be standalone");
    assert.ok(manifest.name && manifest.name.length > 0, "Manifest must have a name");
    assert.ok(Array.isArray(manifest.icons), "Manifest must contain icons array");
    assert.ok(manifest.icons.length >= 2, "Manifest must have at least 192 and 512 icons");

    for (const icon of manifest.icons) {
      const iconPath = path.join(OUT_DIR, icon.src.replace(/^\//, ""));
      assert.ok(
        fs.existsSync(iconPath),
        `Manifest icon ${icon.src} must exist at ${iconPath}`
      );
    }
  });

  test("3. sitemap.xml exists and all URLs resolve to valid static pages", () => {
    const sitemapPath = path.join(OUT_DIR, "sitemap.xml");
    assert.ok(fs.existsSync(sitemapPath), "out/sitemap.xml must exist");

    const content = fs.readFileSync(sitemapPath, "utf8");
    const locMatches = [...content.matchAll(/<loc>([^<]+)<\/loc>/g)];
    assert.ok(locMatches.length > 0, "sitemap.xml must declare at least one URL");

    for (const match of locMatches) {
      const locUrl = match[1];
      const parsed = new URL(locUrl);
      let pagePath = parsed.pathname.replace(/^\//, "");
      if (!pagePath || pagePath === "") pagePath = "index.html";
      else if (!pagePath.endsWith(".html")) pagePath += ".html";

      const fullStaticPath = path.join(OUT_DIR, pagePath);
      assert.ok(
        fs.existsSync(fullStaticPath),
        `Sitemap URL ${locUrl} corresponds to ${pagePath}, which must exist in out/`
      );
    }
  });

  test("4. robots.txt is present and properly formatted", () => {
    const robotsPath = path.join(OUT_DIR, "robots.txt");
    assert.ok(fs.existsSync(robotsPath), "out/robots.txt must exist");

    const robots = fs.readFileSync(robotsPath, "utf8");
    assert.ok(robots.includes("User-agent: *"), "robots.txt must include User-agent");
    assert.ok(robots.includes("Sitemap:"), "robots.txt must reference sitemap");
  });
});
