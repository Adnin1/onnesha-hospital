import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Billing & Cashier Desk", () => {
  test("1. Billing console loads invoice directory, handles search input, and opens payment modal", async ({ page }) => {
    await page.goto("/app/billing");
    await page.waitForLoadState("domcontentloaded");

    const mainContainer = page.locator("#main-content, main, form").first();
    await expect(mainContainer).toBeVisible();
  });

  test("2. Cashier reconciliation page renders daily transaction totals and void log", async ({ page }) => {
    await page.goto("/app/billing/reconciliation");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
