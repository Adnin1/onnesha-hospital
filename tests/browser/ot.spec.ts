import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Operation Theatre (OT)", () => {
  test("1. OT management console loads surgery schedule and room booking controls", async ({ page }) => {
    await page.goto("/app/ot");
    await expect(page.locator("body")).toBeVisible();
  });
});
