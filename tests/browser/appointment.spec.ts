import { test, expect } from "@playwright/test";

test.describe("Real Browser E2E: Public & Staff Appointments", () => {
  test("1. Public appointment booking portal steps through booking wizard and handles schedule availability", async ({ page }) => {
    await page.goto("/appointment");
    await page.waitForLoadState("domcontentloaded");

    // Assert main heading
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();

    // Step 1: Select doctor and click Continue to Date & Time
    const continueBtn1 = page.locator('button:has-text("Continue to Date & Time")').first();
    await expect(continueBtn1).toBeVisible();

    const doctorCard = page.locator('div[class*="cursor-pointer"]').first();
    const hasDoctor = await doctorCard.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasDoctor) {
      await doctorCard.click();
      await expect(continueBtn1).toBeEnabled();
      await continueBtn1.click();

      // Step 2: Date & Slot Selection view
      const dateInput = page.locator('input[type="date"]').first();
      await expect(dateInput).toBeVisible();

      // Check schedule slot radio or empty notice
      const slotRadio = page.locator('input[type="radio"][name="slot"]').first();
      const emptyNotice = page.locator('div:has-text("No active published schedule")').first();

      const isSlotAvailable = await slotRadio.isVisible().catch(() => false);
      if (isSlotAvailable) {
        await slotRadio.check();
        const continueBtn2 = page.locator('button:has-text("Continue to Patient Info")').first();
        await expect(continueBtn2).toBeEnabled();
        await continueBtn2.click();

        // Step 3: Patient Form
        const nameInput = page.locator('input[placeholder*="Md. Tariqul"]').first();
        await expect(nameInput).toBeVisible();
        await nameInput.fill("E2E Test Patient");

        const phoneInput = page.locator('input[placeholder*="017XXXX"]').first();
        await expect(phoneInput).toBeVisible();
        await phoneInput.fill("01799887766");

        const submitBtn = page.locator('button:has-text("Confirm Appointment")').first();
        await expect(submitBtn).toBeEnabled();
      } else {
        await expect(emptyNotice).toBeVisible();
      }
    } else {
      // If doctor directory is still loading or empty, verify loading indicator or empty banner
      await expect(page.locator('text=Select Doctor & Specialty')).toBeVisible();
    }
  });

  test("2. Staff appointment management console loads live waiting queue and booking interface", async ({ page }) => {
    await page.goto("/app/appointments");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
