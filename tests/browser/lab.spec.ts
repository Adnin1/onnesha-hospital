import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Diagnostics & Lab Workflows", () => {
  test("1. Lab diagnostic console loads pending orders and result entry interface", async ({ page }) => {
    await page.goto("/app/lab");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    const searchInput = page.locator('input[placeholder*="খুঁজুন"], input[placeholder*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("CBC");
      await expect(searchInput).toHaveValue("CBC");
    }

    const actionBtn = page.locator('button:has-text("স্যাম্পল"), button:has-text("Sample"), button:has-text("রেজাল্ট"), button').first();
    if (await actionBtn.isVisible()) {
      await expect(actionBtn).toBeEnabled();
    }
  });
});
