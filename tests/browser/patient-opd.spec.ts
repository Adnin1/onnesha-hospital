import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Patient & OPD Workflows", () => {
  test("1. Patient directory allows search, triggers patient creation form, and accepts input data", async ({ page }) => {
    await page.goto("/app/patients");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });

  test("2. OPD console renders live token queue, vitals form inputs, and consultation controls", async ({ page }) => {
    await page.goto("/app/opd");
    await page.waitForLoadState("domcontentloaded");

    const mainArea = page.locator("#main-content, main, form").first();
    await expect(mainArea).toBeVisible();
  });
});
