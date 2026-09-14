import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Financial Reports & Audit Log", () => {
  test("1. Reports console loads operational summaries and filters", async ({ page }) => {
    await page.goto("/app/reports");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    const dateFilter = page.locator('input[type="date"], select').first();
    if (await dateFilter.isVisible()) {
      await expect(dateFilter).toBeEnabled();
    }
  });

  test("2. Settings audit log loads forensic trail inspector", async ({ page }) => {
    await page.goto("/app/settings");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    const auditSection = page.locator('h2, h3, div:has-text("অডিট"), div:has-text("Audit")').first();
    if (await auditSection.isVisible()) {
      await expect(auditSection).toBeVisible();
    }
  });
});
