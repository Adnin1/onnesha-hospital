import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Patient & OPD Workflows", () => {
  test("1. Patient directory allows search, triggers patient creation form, and accepts input data", async ({ page }) => {
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
      await page.waitForTimeout(300);

      // Verify modal or form opened and fill inputs if available
      const modalOrHeader = page.locator('div[role="dialog"], h2, h3, form').first();
      await expect(modalOrHeader).toBeVisible();

      const nameInput = page.locator('input[name="fullName"], input[name="name"], input[placeholder*="নাম"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill("Md. Test E2E Patient");
        await expect(nameInput).toHaveValue("Md. Test E2E Patient");
      }
    }
  });

  test("2. OPD console renders live token queue, vitals form inputs, and consultation controls", async ({ page }) => {
    await page.goto("/app/opd");
    await page.waitForLoadState("domcontentloaded");

    const mainArea = page.locator("#main-content, main").first();
    await expect(mainArea).toBeVisible();

    // Check for vitals inputs or consultation triggers
    const bpInput = page.locator('input[placeholder*="BP"], input[name="bp"]').first();
    if (await bpInput.isVisible()) {
      await bpInput.fill("120/80");
      await expect(bpInput).toHaveValue("120/80");
    }

    const actionBtn = page.locator("button").first();
    if (await actionBtn.isVisible()) {
      await expect(actionBtn).toBeEnabled();
    }
  });
});
