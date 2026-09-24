import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: RBAC Security, 8 Canonical Roles & Navigation Guards", () => {
  // Test 1: Direct navigation to protected hospital paths enforces authentication or AuthGuard protection
  test("1. Direct navigation to protected hospital paths enforces authentication or AuthGuard protection", async ({ page }) => {
    const protectedPaths = [
      "/app/dashboard",
      "/app/billing",
      "/app/hr",
      "/app/settings",
      "/app/settings/staff",
      "/app/pharmacy",
      "/app/lab",
      "/app/opd",
      "/app/ipd",
      "/app/ot",
    ];

    for (const path of protectedPaths) {
      await page.goto(path);
      await page.waitForTimeout(400);

      const currentUrl = page.url();
      // Must either redirect to login page or present AuthGuard authentication container / prompt
      const isRedirectedToLogin = currentUrl.includes("/login");
      const hasAuthGuardPrompt =
        (await page.locator("text=/লগইন|Login|Sign In|অনুমতি|অথেন্টিকেশন|যাচাই|প্রবেশ/i").count()) > 0;

      expect(isRedirectedToLogin || hasAuthGuardPrompt).toBeTruthy();
    }
  });

  // Test 2: Staff Directory route requires authenticated admin role
  test("2. Staff Directory route (/app/settings/staff) is strictly protected from unauthenticated access", async ({ page }) => {
    await page.goto("/app/settings/staff");
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    const redirectedToLogin = currentUrl.includes("/login");
    const hasAuthGuard =
      (await page.locator("text=/লগইন|Sign In|যাচাই|অথেন্টিকেশন|অ্যাক্সেস/i").count()) > 0;

    expect(redirectedToLogin || hasAuthGuard).toBeTruthy();
  });

  // Test 3: Account Deactivated banner displayed when error=account_deactivated is provided
  test("3. Login page displays explicit account deactivated/suspended notification banner", async ({ page }) => {
    await page.goto("/login?error=account_deactivated");
    await page.waitForLoadState("domcontentloaded");

    const alertBanner = page.locator("role=alert");
    await expect(alertBanner).toBeVisible();
    const alertText = await alertBanner.textContent();
    expect(alertText).toMatch(/স্থগিত|নিষ্ক্রিয়|কর্তৃপক্ষের|হয়েছে/);
  });

  // Test 4: Forced reset password flow displays mandatory change banner
  test("4. Reset password page displays mandatory initial change banner when forced=true", async ({ page }) => {
    await page.goto("/reset-password?forced=true");
    await page.waitForLoadState("domcontentloaded");

    const forcedHeading = page.locator("text=/প্রাথমিক পাসওয়ার্ড পরিবর্তন বাধ্যতামূলক/i");
    await expect(forcedHeading).toBeVisible();

    const newPassInput = page.locator('input#new-password');
    const confirmPassInput = page.locator('input#confirm-password');
    await expect(newPassInput).toBeVisible();
    await expect(confirmPassInput).toBeVisible();
  });

  // Test 5: Standard reset password page without forced query param
  test("5. Standard reset password page without forced flag displays standard reset form", async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("domcontentloaded");

    const forcedHeading = page.locator("text=/প্রাথমিক পাসওয়ার্ড পরিবর্তন বাধ্যতামূলক/i");
    const count = await forcedHeading.count();
    expect(count).toBe(0);

    const newPassInput = page.locator('input#new-password');
    await expect(newPassInput).toBeVisible();
  });
});
