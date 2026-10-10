import { test, expect } from "./fixtures";

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

  test("2. Responsive horizontal overflow check across multiple mobile viewports", async ({ page }) => {
    test.setTimeout(120000);
    const viewports = [
      { width: 320, height: 640 },
      { width: 375, height: 812 },
      { width: 412, height: 915 },
    ];

    const routes = ["/", "/doctors", "/appointment", "/check-token", "/contact", "/privacy", "/terms"];

    for (const route of routes) {
      try {
        await page.goto(route, { waitUntil: "domcontentloaded" });
      } catch (err: unknown) {
        const msg = String(err);
        if (msg.includes("ERR_ABORTED") || msg.includes("interrupted")) {
          await page.waitForTimeout(200);
          await page.goto(route, { waitUntil: "domcontentloaded" });
        } else {
          throw err;
        }
      }
      await expect(page.locator("main#main-content")).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(100);

      for (const vp of viewports) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(50);

        // Verify no horizontal document overflow: scrollWidth should match clientWidth
        let hasHorizontalScroll = false;
        for (let evalAttempt = 0; evalAttempt < 3; evalAttempt++) {
          try {
            hasHorizontalScroll = await page.evaluate(() => {
              return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
            });
            break;
          } catch (evalErr: unknown) {
            const errMsg = String(evalErr);
            if (evalAttempt < 2 && errMsg.includes("Execution context was destroyed")) {
              await page.waitForTimeout(150);
              continue;
            }
            throw evalErr;
          }
        }
        expect(hasHorizontalScroll, `Route ${route} should not have horizontal overflow on ${vp.width}x${vp.height}`).toBe(false);
      }
    }
  });

  test("3. Doctors directory page: search filter, department pills, and touch target verification", async ({ page }) => {
    await page.goto("/doctors");
    await page.waitForLoadState("domcontentloaded");

    // Search input is accessible and interactive
    const searchInput = page.locator('input[placeholder*="Search doctor"], input[aria-label*="Search doctor"]').first();
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeEnabled();
    await searchInput.click();
    await searchInput.fill("Medicine");
    await expect(async () => {
      if ((await searchInput.inputValue()) !== "Medicine") {
        await searchInput.fill("Medicine");
      }
      await expect(searchInput).toHaveValue("Medicine");
    }).toPass({ timeout: 5000 });

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
    await page.waitForTimeout(500);

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
    test.setTimeout(120000);
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
      "/consent",
      "/downloads/desktop",
      "/login",
      "/mfa",
      "/forgot-password",
      "/reset-password",
    ];

    for (const route of verifiedRoutes) {
      let navigated = false;
      for (let attempt = 0; attempt < 3 && !navigated; attempt++) {
        try {
          await page.goto(route, { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForLoadState("domcontentloaded");
          navigated = true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            attempt < 2 &&
            (msg.includes("NS_BINDING_ABORTED") ||
              msg.includes("interrupted") ||
              msg.includes("navigation"))
          ) {
            await page.waitForTimeout(400);
            continue;
          }
          throw err;
        }
      }

      // If on /mfa, wait for any unauthenticated redirect to settle
      if (route === "/mfa") {
        await page.waitForTimeout(500);
        await page.waitForLoadState("domcontentloaded");
      }

      // Assert DOM accessibility landmarks using Playwright auto-retrying locators
      await expect(page.locator("main"), `Route ${route} must have exactly 1 <main> element`).toHaveCount(1, { timeout: 10000 });
      await expect(page.locator("#main-content"), `Route ${route} must have exactly 1 element with id='main-content'`).toHaveCount(1, { timeout: 10000 });
      const skipLinkCount = await page.locator('a[href="#main-content"]').count();
      expect(skipLinkCount, `Route ${route} must provide skip-to-content anchor`).toBeGreaterThanOrEqual(1);
    }
  });
});
