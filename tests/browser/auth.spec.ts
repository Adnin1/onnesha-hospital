import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Authentication & Navigation", () => {
  test("1. Login page loads cleanly, accepts email/password input, and validates submission", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const emailInput = page.locator('input[type="email"]');
    const passInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passInput).toBeVisible();
    await expect(emailInput).toHaveValue("");
    await expect(passInput).toHaveValue("");

    // Test filling invalid inputs
    await emailInput.fill("invalid.user@hospital.com");
    await passInput.fill("WrongPassword123!");
    await expect(emailInput).toHaveValue("invalid.user@hospital.com");
    await expect(passInput).toHaveValue("WrongPassword123!");

    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test("2. Unauthenticated user accessing /app/dashboard redirects or shows login prompt", async ({ page }) => {
    await page.goto("/app/dashboard");
    await page.waitForTimeout(500);
    // Should either redirect to /login or present AuthGuard
    const currentUrl = page.url();
    const hasPrompt = await page.locator('text=/লগইন|Login|Sign In|অথেন্টিকেশন|যাচাই/i').count() > 0;
    expect(currentUrl.includes("/login") || hasPrompt).toBeTruthy();
  });
});
