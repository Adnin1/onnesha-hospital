import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: RBAC Security & Navigation Guards", () => {
  test("1. Direct navigation to protected hospital paths enforces authentication or AuthGuard protection", async ({ page }) => {
    const protectedPaths = ["/app/billing", "/app/hr", "/app/settings", "/app/pharmacy"];

    for (const path of protectedPaths) {
      await page.goto(path);
      await page.waitForTimeout(500);

      const currentUrl = page.url();
      // Must either redirect to login page or present AuthGuard authentication container / prompt
      const isRedirectedToLogin = currentUrl.includes("/login");
      const hasAuthGuardPrompt = await page.locator('text=/লগইন|Login|Sign In|অনুমতি|অথেন্টিকেশন|যাচাই/i').count() > 0;

      expect(isRedirectedToLogin || hasAuthGuardPrompt).toBeTruthy();
    }
  });
});
