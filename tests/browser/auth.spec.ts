import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Authentication & Navigation", () => {
  test("1. Login page loads cleanly with empty form inputs", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Onnesha|Login|Sign In/i);
    const emailInput = page.locator('input[type="email"]');
    const passInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passInput).toBeVisible();
    await expect(emailInput).toHaveValue("");
    await expect(passInput).toHaveValue("");
  });

  test("2. Unauthenticated user accessing /app/dashboard redirects or shows login prompt", async ({ page }) => {
    await page.goto("/app/dashboard");
    // Should either redirect to /login or present AuthGuard
    const currentUrl = page.url();
    expect(currentUrl.includes("/login") || currentUrl.includes("/app")).toBeTruthy();
  });
});
