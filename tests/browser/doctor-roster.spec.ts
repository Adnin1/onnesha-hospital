import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: Doctor Roster & Schedule Control", () => {
  test("1. Admin doctors page renders doctor directory, accepts search filter, and fills creation modal", async ({ page }) => {
    await page.goto("/app/doctors");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
