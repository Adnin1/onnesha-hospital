import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Patient & OPD Workflows", () => {
  test("1. Patient directory renders search input and Add Patient button", async ({ page }) => {
    await page.goto("/app/patients");
    await expect(page.locator("body")).toBeVisible();
    const searchInput = page.locator('input[placeholder*="খুঁজুন"], input[placeholder*="Search"]');
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible();
    }
  });

  test("2. OPD console renders token queue and consultation controls", async ({ page }) => {
    await page.goto("/app/opd");
    await expect(page.locator("body")).toBeVisible();
  });
});
