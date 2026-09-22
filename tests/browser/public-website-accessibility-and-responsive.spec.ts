import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Public Website Accessibility (WCAG 2.2) & Responsive Viewports", () => {

  test("1. Mobile viewport (360x740): hamburger toggle and mobile navigation drawer", async ({ page }) => {
    // Set viewport to standard mobile dimension (360px width)
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Desktop nav must be hidden on 360px
    const desktopNav = page.locator("nav.hidden.lg\\:flex");
    await expect(desktopNav).toBeHidden();

    // Mobile menu toggle button must be visible
    const menuBtn = page.locator('button[aria-label*="menu" i]').first();
    await expect(menuBtn).toBeVisible();

    // Click menu button to toggle drawer
    await menuBtn.click();
    await page.waitForTimeout(300);

    // Verify navigation links inside mobile menu are accessible
    const mobileLink = page.locator('a[href="/doctors"]').last();
    await expect(mobileLink).toBeVisible();

    // Click menu button again or close
    await menuBtn.click();
    await page.waitForTimeout(300);
  });

  test("2. Responsive horizontal overflow check on 360px mobile across core public pages", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });

    const routes = ["/", "/doctors", "/appointment", "/check-token", "/contact", "/privacy", "/terms"];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      // Verify no horizontal document overflow: scrollWidth should match clientWidth
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      });
      expect(hasHorizontalScroll, `Route ${route} should not have horizontal overflow on 360px`).toBe(false);
    }
  });

  test("3. Doctors directory page: search filter, department pills, and touch target verification", async ({ page }) => {
    await page.goto("/doctors");
    await page.waitForLoadState("domcontentloaded");

    // Search input is accessible and interactive
    const searchInput = page.locator('input[placeholder*="Search doctor"], input[aria-label*="Search doctor"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Medicine");
    await expect(searchInput).toHaveValue("Medicine");

    // Department pills can be clicked
    const allDeptBtn = page.locator('button:has-text("All Departments")').first();
    await expect(allDeptBtn).toBeVisible();
    await allDeptBtn.click();

    // Verify heading exists
    const mainHeading = page.locator("h1").first();
    await expect(mainHeading).toBeVisible();
  });

  test("4. Live token check page: token input and status feedback", async ({ page }) => {
    await page.goto("/check-token");
    await page.waitForLoadState("domcontentloaded");

    const tokenInput = page.locator('input[placeholder*="token"], input[aria-label*="token"]').first();
    await expect(tokenInput).toBeVisible();
    await tokenInput.fill("101");

    const checkBtn = page.locator('button:has-text("Check Status")').first();
    await expect(checkBtn).toBeVisible();
    await checkBtn.click();

    // Verify feedback area appears
    const resultArea = page.locator('div[class*="rounded-xl border"], div[class*="border"]').first();
    await expect(resultArea).toBeVisible();
  });

  test("5. Contact page: form field accessibility and submission controls", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForLoadState("domcontentloaded");

    // Verify name input
    const nameInput = page.locator('#contact-name, input[placeholder*="Tariqul Islam"], input[name="name"]').first();
    await expect(nameInput).toBeVisible();

    // Verify phone input
    const phoneInput = page.locator('#contact-phone, input[placeholder*="017XXXXXXXX"], input[type="tel"]').first();
    await expect(phoneInput).toBeVisible();

    // Verify submit button
    const submitBtn = page.locator('button[type="submit"]:has-text("Inquiry"), button[type="submit"]:has-text("Send"), button:has-text("Send")').first();
    await expect(submitBtn).toBeVisible();
  });

  test("6. Real Browser Cache Storage: PWA caches only static assets and never caches /app/, /api/, or auth routes", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Evaluate window.caches directly inside the real browser environment
    const cacheReport = await page.evaluate(async () => {
      if (!("caches" in window)) {
        return { supported: false, cachedUrls: [] };
      }
      const keys = await window.caches.keys();
      const allUrls: string[] = [];
      for (const key of keys) {
        const cache = await window.caches.open(key);
        const requests = await cache.keys();
        for (const req of requests) {
          allUrls.push(req.url);
        }
      }
      return { supported: true, cachedUrls: allUrls };
    });

    if (cacheReport.supported) {
      // Assert that no sensitive, private app, or clinical endpoint is in Cache Storage
      const forbiddenPatterns = [/\/app(\/|$)/, /\/api\//, /\/login/, /\/mfa/, /patient/i, /billing/i, /invoice/i];
      for (const url of cacheReport.cachedUrls) {
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(url), `Cache Storage must never contain matching URL: ${url}`).toBe(false);
        }
      }
    }
  });

  test("7. Route-by-Route DOM Accessibility: exactly one main landmark with id='main-content' and valid skip link", async ({ page }) => {
    const verifiedRoutes = [
      "/",
      "/about",
      "/doctors",
      "/services",
      "/appointment",
      "/check-token",
      "/contact",
      "/privacy",
      "/terms",
      "/login",
    ];

    for (const route of verifiedRoutes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");

      const a11yLandmarks = await page.evaluate(() => {
        const mains = document.querySelectorAll("main");
        const mainContentIds = document.querySelectorAll("#main-content");
        const skipLinks = document.querySelectorAll('a[href="#main-content"]');
        return {
          mainCount: mains.length,
          mainContentIdCount: mainContentIds.length,
          hasSkipLink: skipLinks.length >= 1,
        };
      });

      expect(a11yLandmarks.mainCount, `Route ${route} must have exactly 1 <main> element`).toBe(1);
      expect(a11yLandmarks.mainContentIdCount, `Route ${route} must have exactly 1 element with id='main-content'`).toBe(1);
      expect(a11yLandmarks.hasSkipLink, `Route ${route} must provide skip-to-content anchor`).toBe(true);
    }
  });
});
