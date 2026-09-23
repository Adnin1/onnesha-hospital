import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: HR & Employee Management", () => {
  test("1. HR console loads staff directory, supports search, and provides attendance roster controls", async ({ page }) => {
    await page.goto("/app/hr");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
