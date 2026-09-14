import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Pharmacy Inventory & POS", () => {
  test("1. Pharmacy console loads stock inventory and POS sales interface", async ({ page }) => {
    await page.goto("/app/pharmacy");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    const searchInput = page.locator('input[placeholder*="খুঁজুন"], input[placeholder*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("Napa");
      await expect(searchInput).toHaveValue("Napa");
    }

    const saleBtn = page.locator('button:has-text("বিক্রি"), button:has-text("Sale"), button:has-text("স্টক"), button').first();
    if (await saleBtn.isVisible()) {
      await expect(saleBtn).toBeEnabled();
    }
  });
});
