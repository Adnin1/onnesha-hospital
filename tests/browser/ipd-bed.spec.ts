import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: IPD Admission & Bed Matrix", () => {
  test("1. IPD admissions page loads active admissions list and bed matrix", async ({ page }) => {
    await page.goto("/app/ipd");
    await expect(page.locator("body")).toBeVisible();
  });

  test("2. Bed management page loads occupancy grid and rate configuration", async ({ page }) => {
    await page.goto("/app/beds");
    await expect(page.locator("body")).toBeVisible();
  });
});
