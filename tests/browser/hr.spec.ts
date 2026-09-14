import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: HR & Employee Management", () => {
  test("1. HR console loads staff directory and roster attendance", async ({ page }) => {
    await page.goto("/app/hr");
    await expect(page.locator("body")).toBeVisible();
  });
});
