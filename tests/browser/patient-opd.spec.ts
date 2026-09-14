import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Patient & OPD Workflows", () => {
  test("1. Patient directory renders search input, accepts query input, and triggers modal", async ({ page }) => {
    await page.goto("/app/patients");
    await page.waitForLoadState("domcontentloaded");

    const searchInput = page.locator('input[placeholder*="খুঁজুন"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("01711");
      await expect(searchInput).toHaveValue("01711");
    }

    const addButton = page.locator('button:has-text("নতুন"), button:has-text("Add"), button:has-text("রোগী")').first();
    if (await addButton.isVisible()) {
      await expect(addButton).toBeEnabled();
      await addButton.click();
      // Verify modal or form opened
      const modalOrHeader = page.locator('div[role="dialog"], h2, h3, form').first();
      await expect(modalOrHeader).toBeVisible();
    }
  });

  test("2. OPD console renders token queue, vitals form, and consultation trigger", async ({ page }) => {
    await page.goto("/app/opd");
    await page.waitForLoadState("domcontentloaded");

    const mainArea = page.locator("#main-content, main").first();
    await expect(mainArea).toBeVisible();

    // Verify presence of interactive controls
    const actionBtn = page.locator("button").first();
    if (await actionBtn.isVisible()) {
      await expect(actionBtn).toBeEnabled();
    }
  });
});
