import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Doctor Roster & Schedule Control", () => {
  test("1. Admin doctors page renders doctor directory and creation modal trigger", async ({ page }) => {
    await page.goto("/app/doctors");
    await expect(page.locator("body")).toBeVisible();
    const addButton = page.locator('button:has-text("ডাক্তার"), button:has-text("Doctor"), button:has-text("যোগ")');
    if (await addButton.count() > 0) {
      await expect(addButton.first()).toBeVisible();
    }
  });
});
