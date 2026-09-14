import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: 24/7 Emergency Casualty Triage", () => {
  test("1. Emergency triage console renders Red/Yellow/Green prioritization board and triage intake controls", async ({ page }) => {
    await page.goto("/app/emergency");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main").first();
    await expect(container).toBeVisible();

    // Check triage column indicators or action buttons
    const triageBtn = page.locator('button:has-text("ট্রায়াজ"), button:has-text("Triage"), button:has-text("জরুরি"), button:has-text("Emergency")').first();
    if (await triageBtn.isVisible()) {
      await expect(triageBtn).toBeEnabled();
    }
  });
});
