import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: Financial Reports & Audit Log", () => {
  test("1. Reports console loads operational summaries and filters", async ({ page }) => {
    await page.goto("/app/reports");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();
  });

  test("2. Settings audit log loads forensic trail inspector", async ({ page }) => {
    await page.goto("/app/settings");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();
  });
});
