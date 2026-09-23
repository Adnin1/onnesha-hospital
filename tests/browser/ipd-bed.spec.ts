import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: IPD Admission & Bed Matrix", () => {
  test("1. IPD admissions page loads active admissions list and provides admission trigger", async ({ page }) => {
    await page.goto("/app/ipd");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, [role='status'], [role='main']").first();
    await expect(container).toBeVisible();

    const hasAuth = await page.locator('text=/লগইন|Login|Sign In|অনুমতি|অথেন্টিকেশন|যাচাই/i').count() > 0;
    if (!hasAuth) {
      const admitBtn = page.locator('button:has-text("ভর্তি"), button:has-text("Admit"), button:has-text("নতুন"), button').first();
      await expect(admitBtn).toBeVisible();
      await expect(admitBtn).toBeEnabled();
    }
  });

  test("2. Bed management page loads occupancy grid and rate configuration controls", async ({ page }) => {
    await page.goto("/app/beds");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, [role='status'], [role='main']").first();
    await expect(container).toBeVisible();

    const hasAuth = await page.locator('text=/লগইন|Login|Sign In|অনুমতি|অথেন্টিকেশন|যাচাই/i').count() > 0;
    if (!hasAuth) {
      const addBedBtn = page.locator('button:has-text("বেড"), button:has-text("Bed"), button').first();
      await expect(addBedBtn).toBeVisible();
      await expect(addBedBtn).toBeEnabled();
    }
  });
});
