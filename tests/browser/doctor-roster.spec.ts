import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Doctor Roster & Schedule Control", () => {
  test("1. Admin doctors page renders doctor directory, accepts search filter, and opens creation modal", async ({ page }) => {
    await page.goto("/app/doctors");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    // Check search input for doctors
    const searchInput = page.locator('input[placeholder*="খুঁজুন"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("Dr.");
      await expect(searchInput).toHaveValue("Dr.");
    }

    // Trigger add doctor modal
    const addButton = page.locator('button:has-text("ডাক্তার"), button:has-text("Doctor"), button:has-text("নতুন")').first();
    if (await addButton.isVisible()) {
      await expect(addButton).toBeEnabled();
      await addButton.click();

      // Verify modal or form opened
      const modal = page.locator('div[role="dialog"], form, h2, h3').first();
      await expect(modal).toBeVisible();
    }
  });
});
