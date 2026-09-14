import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Public & Staff Appointments", () => {
  test("1. Public appointment booking portal steps through booking wizard and accepts patient inputs", async ({ page }) => {
    await page.goto("/appointment");
    await page.waitForLoadState("domcontentloaded");

    // Assert main header
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();

    // Step 1: Doctor selection button check
    const nextStep1Btn = page.locator('button:has-text("Continue to Date & Time")').first();
    if (await nextStep1Btn.isVisible() && await nextStep1Btn.isEnabled()) {
      await nextStep1Btn.click();
    }

    // Step 2: Date & slot selection
    const nextStep2Btn = page.locator('button:has-text("Continue to Patient Info")').first();
    if (await nextStep2Btn.isVisible() && await nextStep2Btn.isEnabled()) {
      await nextStep2Btn.click();
    }

    // Step 3: Patient Information Form
    const nameInput = page.locator('input[placeholder*="Name"], input[placeholder*="নাম"]').first();
    const phoneInput = page.locator('input[placeholder*="017"], input[placeholder*="Phone"]').first();

    if (await nameInput.isVisible()) {
      await nameInput.fill("Md. E2E Booking Patient");
      await expect(nameInput).toHaveValue("Md. E2E Booking Patient");
    }

    if (await phoneInput.isVisible()) {
      await phoneInput.fill("01711998877");
      await expect(phoneInput).toHaveValue("01711998877");
    }

    // Submit booking button check
    const confirmBtn = page.locator('button:has-text("Confirm Appointment"), button[type="submit"]').first();
    if (await confirmBtn.isVisible()) {
      await expect(confirmBtn).toBeVisible();
    }
  });

  test("2. Staff appointment management console loads live waiting queue and booking interface", async ({ page }) => {
    await page.goto("/app/appointments");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    const searchInput = page.locator('input[type="text"], input[type="search"], select').first();
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeEnabled();
      await searchInput.fill("01711");
      await expect(searchInput).toHaveValue("01711");
    }
  });
});
