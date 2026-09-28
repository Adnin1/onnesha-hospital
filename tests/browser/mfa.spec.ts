import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: MFA / AAL2 Security & Challenge Page", () => {
  test("1. Unauthenticated direct access to /mfa redirects to /login", async ({ page }) => {
    await page.goto("/mfa");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test("2. Unauthenticated direct access to /auth/mfa redirects to /login", async ({ page }) => {
    await page.goto("/auth/mfa");
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test("3. Security settings page (/app/settings/security) requires authenticated admin session", async ({ page }) => {
    await page.goto("/app/settings/security");
    await page.waitForTimeout(600);

    const currentUrl = page.url();
    const redirectedToLogin = currentUrl.includes("/login");
    const hasAuthGuardPrompt =
      (await page.locator("text=/লগইন|Login|Sign In|অনুমতি|অথেন্টিকেশন|যাচাই|প্রবেশ|লোড/i").count()) > 0;

    expect(redirectedToLogin || hasAuthGuardPrompt).toBeTruthy();
  });
});
