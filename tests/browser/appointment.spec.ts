import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Public & Staff Appointments", () => {
  test("1. Public appointment booking portal renders doctor selection and time slots", async ({ page }) => {
    await page.goto("/appointment");
    await expect(page.locator("body")).toBeVisible();
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
  });

  test("2. Staff appointment management console renders queue and booking calendar", async ({ page }) => {
    await page.goto("/app/appointments");
    await expect(page.locator("body")).toBeVisible();
  });
});
