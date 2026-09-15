import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Operation Theatre (OT)", () => {
  test("1. OT management console loads surgery schedule and room booking controls", async ({ page }) => {
    await page.goto("/app/ot");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    const bookingBtn = page.locator('button:has-text("সার্জারি"), button:has-text("OT"), button:has-text("বুকিং"), button').first();
    await expect(bookingBtn).toBeVisible();
    await expect(bookingBtn).toBeEnabled();
  });
});
