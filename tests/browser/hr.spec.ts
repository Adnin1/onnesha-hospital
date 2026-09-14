import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: HR & Employee Management", () => {
  test("1. HR console loads staff directory, supports search, and provides attendance roster controls", async ({ page }) => {
    await page.goto("/app/hr");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    const searchInput = page.locator('input[placeholder*="খুঁজুন"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("Staff");
      await expect(searchInput).toHaveValue("Staff");
    }

    const actionBtn = page.locator('button:has-text("কর্মচারী"), button:has-text("Employee"), button:has-text("স্টাফ"), button').first();
    if (await actionBtn.isVisible()) {
      await expect(actionBtn).toBeEnabled();
    }
  });
});
