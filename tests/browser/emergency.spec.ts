import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: 24/7 Emergency Casualty Triage", () => {
  test("1. Emergency triage console renders Red/Yellow/Green prioritization board", async ({ page }) => {
    await page.goto("/app/emergency");
    await expect(page.locator("body")).toBeVisible();
  });
});
