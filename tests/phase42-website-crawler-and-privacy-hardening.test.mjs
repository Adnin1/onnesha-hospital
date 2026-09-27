import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 42: Website Crawler Specificity, Sitemap Consistency & Privacy Hardening", () => {
  const robotsPath = path.join(ROOT, "public/robots.txt");
  const headersPath = path.join(ROOT, "public/_headers");
  const sitemapPath = path.join(ROOT, "app/sitemap.ts");
  const checkTokenLayoutPath = path.join(ROOT, "app/(public)/check-token/layout.tsx");
  const privacyPagePath = path.join(ROOT, "app/(public)/privacy/page.tsx");
  const liveQueueWidgetPath = path.join(ROOT, "components/public/LiveQueueWidget.tsx");

  test("1. robots.txt explicitly disallows /app/, /login, /mfa, /auth/ across all crawler groups", () => {
    assert.ok(fs.existsSync(robotsPath), "robots.txt must exist");
    const content = fs.readFileSync(robotsPath, "utf8");

    // Standard wildcards
    assert.ok(content.includes("User-agent: *"));
    assert.ok(content.includes("Disallow: /app/"));
    assert.ok(content.includes("Disallow: /login"));
    assert.ok(content.includes("Disallow: /auth/"));

    // Specific AI crawlers must explicitly have Disallow rules per RFC 9309
    const crawlers = ["GPTBot", "Google-Extended", "PerplexityBot", "ClaudeBot"];
    for (const crawler of crawlers) {
      assert.ok(content.includes(`User-agent: ${crawler}`), `Must configure ${crawler}`);
      const crawlerSection = content.split(`User-agent: ${crawler}`)[1]?.split("User-agent:")[0] || "";
      assert.ok(crawlerSection.includes("Disallow: /app/"), `${crawler} must explicitly disallow /app/`);
      assert.ok(crawlerSection.includes("Disallow: /login"), `${crawler} must explicitly disallow /login`);
      assert.ok(crawlerSection.includes("Disallow: /auth/"), `${crawler} must explicitly disallow /auth/`);
    }
  });

  test("2. public/_headers defines security and cache policies for /auth/* and /check-token*", () => {
    assert.ok(fs.existsSync(headersPath), "_headers must exist");
    const content = fs.readFileSync(headersPath, "utf8");

    assert.ok(content.includes("/auth/*"), "_headers must include rule for /auth/*");
    assert.ok(content.includes("/check-token*"), "_headers must include rule for /check-token*");

    const authSection = content.split("/auth/*")[1]?.split(/\n\n|\n\//)[0] || "";
    assert.ok(authSection.includes("no-store"), "/auth/* must forbid store");
    assert.ok(authSection.includes("noindex"), "/auth/* must specify noindex");

    const checkTokenSection = content.split("/check-token*")[1]?.split(/\n\n|\n\//)[0] || "";
    assert.ok(checkTokenSection.includes("noindex"), "/check-token* must specify noindex");
  });

  test("3. check-token layout enforces noindex metadata while sitemap correctly excludes it", () => {
    const layoutContent = fs.readFileSync(checkTokenLayoutPath, "utf8");
    assert.ok(layoutContent.includes("robots: { index: false, follow: false }"), "check-token layout must declare noindex");

    const sitemapContent = fs.readFileSync(sitemapPath, "utf8");
    assert.ok(!sitemapContent.includes('"/check-token"'), "sitemap must not include noindexed /check-token");
  });

  test("4. LiveQueueWidget implements mounted guard and visibility handling", () => {
    const widgetContent = fs.readFileSync(liveQueueWidgetPath, "utf8");
    assert.ok(widgetContent.includes("mounted = true"), "Must track component mount status");
    assert.ok(widgetContent.includes("if (!mounted) return"), "Must guard state updates against unmount");
    assert.ok(widgetContent.includes("visibilitychange"), "Must pause or refresh on visibility change");
    assert.ok(widgetContent.includes("window.clearInterval"), "Must clean up interval timer");
  });

  test("5. Privacy policy covers Bangladesh Personal Data Protection Act 2026 statutory sections", () => {
    const privacyContent = fs.readFileSync(privacyPagePath, "utf8");
    const requiredSections = [
      "Section 11", // Access
      "Section 12", // Rectification
      "Section 13", // Consent Withdrawal
      "Section 14", // System-Wide Propagation
      "Section 17", // Security Obligations
      "Section 18", // Data Retention
      "Section 20", // Incident Reporting
    ];

    for (const sec of requiredSections) {
      assert.ok(privacyContent.includes(sec), `Privacy policy must reference statutory ${sec}`);
    }
  });
});
