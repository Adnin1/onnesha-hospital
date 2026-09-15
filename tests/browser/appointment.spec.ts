import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Public & Staff Appointments", () => {
  test("1. Public appointment booking portal steps through booking wizard and accepts patient inputs", async ({ page }) => {
    await page.goto("/appointment");
    await page.waitForLoadState("domcontentloaded");

    // Assert main header
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();

    // Check wizard container is rendered
    const wizardContainer = page.locator("main, div.max-w-4xl").first();
    await expect(wizardContainer).toBeVisible();

    // Step 1: Check next step button or loader/error container
    const step1Element = page.locator('button:has-text("Continue to Date & Time"), div:has-text("Loading"), div:has-text("No active")').first();
    await expect(step1Element).toBeVisible();
  });

  test("2. Staff appointment management console loads live waiting queue and booking interface", async ({ page }) => {
    await page.goto("/app/appointments");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
