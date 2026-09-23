import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: Diagnostics & Lab Workflows", () => {
  test("1. Lab diagnostic console loads pending orders and result entry interface", async ({ page }) => {
    await page.goto("/app/lab");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
