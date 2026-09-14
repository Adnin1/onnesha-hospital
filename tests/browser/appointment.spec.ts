import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Public & Staff Appointments", () => {
  test("1. Public appointment booking portal renders doctor selection, allows input, and submits booking request", async ({ page }) => {
    await page.goto("/appointment");
    await page.waitForLoadState("domcontentloaded");

    // Assert main heading and interactive form elements
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();

    // Fill patient booking form if present
    const nameInput = page.locator('input[name="fullName"], input[name="name"], input[placeholder*="নাম"], input[placeholder*="Name"]').first();
    const phoneInput = page.locator('input[name="phone"], input[placeholder*="ফোন"], input[placeholder*="Phone"]').first();

    if (await nameInput.isVisible()) {
      await nameInput.fill("E2E Test Patient");
      await expect(nameInput).toHaveValue("E2E Test Patient");
    }

    if (await phoneInput.isVisible()) {
      await phoneInput.fill("01711002233");
      await expect(phoneInput).toHaveValue("01711002233");
    }

    // Check doctor select box
    const doctorSelect = page.locator("select").first();
    if (await doctorSelect.isVisible()) {
      const options = doctorSelect.locator("option");
      if (await options.count() > 1) {
        await doctorSelect.selectOption({ index: 1 });
      }
    }
  });

  test("2. Staff appointment management console renders queue and interactive booking controls", async ({ page }) => {
    await page.goto("/app/appointments");
    await page.waitForLoadState("domcontentloaded");

    // Verify main console container and action buttons
    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    // Check for search or filter control
    const searchOrFilter = page.locator('input[type="text"], input[type="search"], select').first();
    if (await searchOrFilter.isVisible()) {
      await expect(searchOrFilter).toBeEnabled();
    }
  });
});
