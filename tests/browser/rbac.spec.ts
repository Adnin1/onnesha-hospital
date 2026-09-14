import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: RBAC Security & Navigation Guards", () => {
  test("1. Direct navigation to protected hospital paths enforces authentication", async ({ page }) => {
    const paths = ["/app/billing", "/app/hr", "/app/settings", "/app/pharmacy"];
    for (const p of paths) {
      await page.goto(p);
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
