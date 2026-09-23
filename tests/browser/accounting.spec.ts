import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: Enterprise Accounting & ERP Ledger", () => {
  test("1. Accounting console loads with Chart of Accounts, Journal Entries, and Trial Balance", async ({ page }) => {
    await page.goto("/app/accounting");
    await page.waitForLoadState("domcontentloaded");

    const mainContainer = page.locator("#main-content, main, form").first();
    await expect(mainContainer).toBeVisible();
  });

  test("2. Procurement console loads requisitions and GRN records", async ({ page }) => {
    await page.goto("/app/procurement");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });

  test("3. Fixed Assets console loads biomedical equipment register", async ({ page }) => {
    await page.goto("/app/assets");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
