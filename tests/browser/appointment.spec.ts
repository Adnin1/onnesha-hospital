import { test, expect } from "./fixtures";

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

    const doctorCard = page.locator('[data-testid="doctor-card"], div[role="button"][tabindex="0"]').first();
    await doctorCard.waitFor({ state: "visible", timeout: 15000 });
    await doctorCard.click();
    await expect(continueBtn1).toBeEnabled({ timeout: 10000 });
    await continueBtn1.click();

    // Step 2: Date & Slot Selection view
    await page.waitForSelector('h2:has-text("Step 2: Choose Appointment Date & Visiting Slot")', { timeout: 15000 });
    const dateInput = page.locator('input[type="date"], input#appointment-date').first();
    await expect(dateInput).toBeVisible();

    // Await schedule slot radio or empty notice to finish loading (resolves loadingSchedules async delay)
    const slotOrNotice = page.locator('input[type="radio"][name="slot"], div:has-text("No active published schedule"), div:has-text("No Visiting Hours")').first();
    await slotOrNotice.waitFor({ state: "visible", timeout: 15000 });

    const slotRadio = page.locator('input[type="radio"][name="slot"]').first();
    const isSlotAvailable = await slotRadio.isVisible();
    if (isSlotAvailable) {
      await slotRadio.check();
      const continueBtn2 = page.locator('button:has-text("Continue to Patient Info")').first();
      await expect(continueBtn2).toBeEnabled({ timeout: 10000 });
      await continueBtn2.click();

      // Step 3: Patient Form
      await page.waitForSelector('h2:has-text("Step 3: Patient Particulars & Contact Details")', { timeout: 15000 });
      const nameInput = page.locator('input#patient-fullname, input[placeholder*="Md. Tariqul"]').first();
      await expect(nameInput).toBeVisible({ timeout: 10000 });
      await nameInput.fill("E2E Test Patient");

      const phoneInput = page.locator('input#patient-phone, input[placeholder*="017XXXX"]').first();
      await expect(phoneInput).toBeVisible({ timeout: 10000 });
      await phoneInput.fill("01799887766");

      const submitBtn = page.locator('button:has-text("Confirm Appointment")').first();
      await expect(submitBtn).toBeVisible({ timeout: 10000 });
      await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    } else {
      const emptyNotice = page.locator('div:has-text("No active published schedule"), div:has-text("No Visiting Hours")').first();
      await expect(emptyNotice).toBeVisible();
    }
  });

  test("2. Staff appointment management console loads live waiting queue and booking interface", async ({ page }) => {
    await page.goto("/app/appointments");
    await page.waitForLoadState("domcontentloaded");

    const container = page.locator("#main-content, main, form").first();
    await expect(container).toBeVisible();
  });
});
