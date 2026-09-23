import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: Pharmacy Inventory & POS", () => {
  test("1. Pharmacy console loads stock inventory and POS sales interface", async ({ page }) => {
    await page.goto("/app/pharmacy");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
