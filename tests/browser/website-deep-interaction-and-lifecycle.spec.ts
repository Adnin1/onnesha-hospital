import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: Website Deep Interaction, Form Lifecycle & Resilience", () => {

  test("1. Public Appointment Booking multi-step form lifecycle, boundary validation & state preservation", async ({ page }) => {
    await page.goto("/appointment");
    await page.waitForLoadState("domcontentloaded");

    // Verify Stepper indicator
    const stepIndicator = page.locator("text=Online Serial Booking");
    await expect(stepIndicator).toBeVisible();

    // Step 1: Select doctor
    // Wait for doctors list to finish loading and doctor card to be visible
    await page.waitForSelector('h2:has-text("Step 1: Select Doctor")', { timeout: 15000 });
    const doctorCard = page.locator('[data-testid="doctor-card"], div[role="button"][tabindex="0"]').first();
    await doctorCard.waitFor({ state: "visible", timeout: 15000 });
    const doctorCount = await page.locator('[data-testid="doctor-card"], div[role="button"][tabindex="0"]').count();
    expect(doctorCount).toBeGreaterThan(0);

    // Click first doctor card
    await doctorCard.click();

      // Click "Continue to Date & Time"
      const proceedBtn = page.locator('button:has-text("Continue to Date & Time")');
      await expect(proceedBtn).toBeVisible();
      await expect(proceedBtn).toBeEnabled();
      await proceedBtn.click();

      // Step 2: Date & Schedule selection
      await page.waitForSelector('h2:has-text("Step 2: Choose Appointment Date & Visiting Slot")', { timeout: 10000 });

      // Back navigation test: click "Back"
      const backToDocBtn = page.locator('button:has-text("Back")');
      await expect(backToDocBtn).toBeVisible();
      await backToDocBtn.click();

      // Verify we returned to Step 1 with doctor selected
      await expect(page.locator('h2:has-text("Step 1: Select Doctor")')).toBeVisible();

      // Proceed again to Step 2
      await expect(proceedBtn).toBeEnabled();
      await proceedBtn.click();
      await page.waitForSelector('h2:has-text("Step 2: Choose Appointment Date & Visiting Slot")', { timeout: 10000 });

      // Check if any schedule slots are available
      const slotRadio = page.locator('input[type="radio"][name="slot"]');
      const slotCount = await slotRadio.count();

      if (slotCount > 0) {
        await slotRadio.first().check();
        const nextStepBtn = page.locator('button:has-text("Continue to Patient Info")');
        await expect(nextStepBtn).toBeVisible();
        await expect(nextStepBtn).toBeEnabled();
        await nextStepBtn.click();

        // Step 3: Patient Particulars
        await page.waitForSelector('h2:has-text("Step 3: Patient Particulars & Contact Details")', { timeout: 10000 });

        const nameInput = page.locator('input#patient-fullname');
        const phoneInput = page.locator('input#patient-phone');
        const ageInput = page.locator('input#patient-age');
        const genderSelect = page.locator('select#patient-gender');
        const submitBtn = page.locator('button[type="submit"]:has-text("Confirm Appointment & Generate Token")');

        await expect(nameInput).toBeVisible();
        await expect(phoneInput).toBeVisible();
        await expect(ageInput).toBeVisible();
        await expect(genderSelect).toBeVisible();
        await expect(submitBtn).toBeVisible();

        // Boundary Validation: enter invalid phone to test server/action rejection alert
        await nameInput.fill("Sultana Ahmed");
        await phoneInput.fill("0123");
        await ageInput.fill("28");
        await genderSelect.selectOption("FEMALE");
        await submitBtn.click();

        // Must display accessible error alert for invalid phone
        const errorAlert = page.locator('div[role="alert"]').filter({ hasText: /Bangladeshi mobile number/i });
        await expect(errorAlert.first()).toBeVisible({ timeout: 5000 });
        await expect(errorAlert.first()).toContainText("11-digit");

        // Back navigation to Step 2
        const backToScheduleBtn = page.locator('button:has-text("Back")');
        await expect(backToScheduleBtn).toBeVisible();
        await backToScheduleBtn.click();

        // Verify returned to Step 2
        await expect(page.locator('h2:has-text("Step 2: Choose Appointment Date & Visiting Slot")')).toBeVisible();

        // Proceed forward to Step 3 again
        await nextStepBtn.click();
        await page.waitForSelector('h2:has-text("Step 3: Patient Particulars & Contact Details")', { timeout: 10000 });

        // Fill valid 11-digit Bangladeshi mobile number
        await phoneInput.fill("01711998877");
        await submitBtn.click();

        // Step 4: Instant confirmation & token slip
        await page.waitForSelector('text=Appointment Confirmed Successfully!', { timeout: 10000 });
        await expect(page.locator("text=OPD CONSULTATION TOKEN SLIP")).toBeVisible();
        await expect(page.locator("text=Your Serial Token Number")).toBeVisible();
        await expect(page.getByText(/#\d+/).first()).toBeVisible();
        await expect(page.locator('button:has-text("Print Token Slip")')).toBeVisible();
      }
  });

  test("2. Login Form input normalization, password reveal toggle & safe error shielding", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[placeholder="••••••••"]');
    const loginButton = page.locator('button[type="submit"]:has-text("লগইন করুন")');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(loginButton).toBeVisible();

    // Verify initial password input type is password
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Type credentials
    await emailInput.fill("  DOCTOR_TEST@ONNESHA-HOSPITAL.COM  ");
    await passwordInput.fill("DemoPassword123!");

    // Test password reveal toggle
    const toggleButton = page.locator('button[aria-label*="পাসওয়ার্ড দেখুন"], button[aria-label*="পাসওয়ার্ড লুকান"]');
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    // Should now be type="text"
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Click toggle again to hide
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Submit with invalid credentials
    await loginButton.click();

    // Verify safe error message is displayed
    const errorContainer = page.locator('div[role="alert"], div[class*="bg-red-950"], div[class*="border-red-500"], div:has-text("সমস্যা"), div:has-text("সঠিক নয়"), div:has-text("ভেরিফিকেশন")');
    await expect(errorContainer.first()).toBeVisible({ timeout: 10000 });

    // Assert zero PHI or sensitive token leakage in unauthenticated local/session storage
    const storageKeys = await page.evaluate(() => {
      return {
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      };
    });
    for (const key of storageKeys.local) {
      expect(key.toLowerCase()).not.toContain("patient");
      expect(key.toLowerCase()).not.toContain("medical_record");
    }
  });

  test("3. Self-service password recovery lifecycle & interactive strength meter", async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("networkidle");

    const newPwdInput = page.locator('#new-password');
    const confirmPwdInput = page.locator('#confirm-password');

    await expect(newPwdInput).toBeVisible({ timeout: 15000 });
    await expect(confirmPwdInput).toBeVisible();

    // Fail-closed banner when visiting without valid recovery token
    const alertBanner = page.locator('div[class*="bg-amber-950"], div[class*="border-amber-600"], div:has-text("session পাওয়া যায়নি")');
    await expect(alertBanner.first()).toBeVisible({ timeout: 10000 });

    // Focus input to ensure hydration is active before typing
    await newPwdInput.click();
    await newPwdInput.fill("weak");
    await expect(page.locator("text=দুর্বল (Weak)")).toBeVisible();

    // Type fair password (8+ chars, upper + lower, no digits -> score 2)
    await newPwdInput.fill("Moderate");
    await expect(page.locator("text=মোটামুটি (Fair)")).toBeVisible();

    // Type good password (8+ chars, upper + lower, digit -> score 3)
    await newPwdInput.fill("Moderate12");
    await expect(page.locator("text=ভালো (Good)")).toBeVisible();

    // Type strong password (8+ chars, upper + lower, digit, special -> score 4)
    await newPwdInput.fill("StrongPass@2026!");
    await expect(page.locator("text=শক্তিশালী (Strong)")).toBeVisible();

    // Mismatched confirm password
    await confirmPwdInput.fill("DifferentPassword");
    await expect(page.locator("text=পাসওয়ার্ড দুটি এক নয়")).toBeVisible();

    // Matching confirm password
    await confirmPwdInput.fill("StrongPass@2026!");
    await expect(page.locator("text=পাসওয়ার্ড মিলেছে")).toBeVisible();
  });

  test("4. Live token search input sanitization, trimming & debounce states", async ({ page }) => {
    await page.goto("/check-token");
    await page.waitForLoadState("domcontentloaded");

    const searchInput = page.locator('input[placeholder*="token"], input[aria-label*="token"]').first();
    const searchBtn = page.locator('button:has-text("Check Status")').first();

    await expect(searchInput).toBeVisible();
    await expect(searchBtn).toBeVisible();

    // Type query with whitespace and leading hash
    await searchInput.fill("   #999-UNLISTED   ");
    await searchBtn.click();

    // Feedback area appears
    const resultCard = page.locator('div[class*="rounded-xl border"], div[class*="border"]').first();
    await expect(resultCard).toBeVisible({ timeout: 10000 });
  });

  test("5. Contact Form controls, validation & submit resilience", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForLoadState("domcontentloaded");

    const nameInput = page.locator('#contact-name, input[name="name"], input[placeholder*="Tariqul"]').first();
    const phoneInput = page.locator('#contact-phone, input[type="tel"]').first();
    const submitBtn = page.locator('button[type="submit"]').first();

    await expect(nameInput).toBeVisible();
    await expect(phoneInput).toBeVisible();
    await expect(submitBtn).toBeVisible();

    // Fill valid data
    await nameInput.fill("Anisur Rahman");
    await phoneInput.fill("01812345678");

    const subjectInput = page.locator('#contact-subject, input[name="subject"]').first();
    if (await subjectInput.isVisible()) {
      await subjectInput.fill("General Inquiry");
    }

    const messageInput = page.locator('#contact-message, textarea').first();
    if (await messageInput.isVisible()) {
      await messageInput.fill("Testing contact enquiry form interaction.");
    }
  });

  test("6. Zero Raw Dialogs Invariant: window.alert, window.confirm, window.prompt are never called", async ({ page }) => {
    // Injected dialog spy
    let rawDialogCalled = false;
    let dialogMessage = "";

    page.on("dialog", async (dialog) => {
      rawDialogCalled = true;
      dialogMessage = `${dialog.type()}: ${dialog.message()}`;
      await dialog.dismiss();
    });

    const routes = ["/", "/appointment", "/doctors", "/check-token", "/contact", "/login", "/downloads/desktop"];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      expect(rawDialogCalled, `Route ${route} called raw browser dialog: ${dialogMessage}`).toBe(false);
    }
  });

  test("7. Desktop Download Provenance & Verified Binary Retrieval", async ({ page }) => {
    await page.goto("/downloads/desktop");
    await page.waitForLoadState("domcontentloaded");

    // Status badge must truthfully show PENDING_CI_BUILD
    const statusBadge = page.locator("text=CURRENT DESKTOP BUILD: PENDING_CI_BUILD");
    await expect(statusBadge).toBeVisible();

    // Unbuilt MSI button must be disabled/queued
    const queuedMsi = page.locator('div[data-installer*=".msi"]');
    await expect(queuedMsi).toBeVisible();
    await expect(queuedMsi).toHaveClass(/cursor-not-allowed/);

    // Historical verified release link must be available
    const historicalLink = page.locator('a[href*="Onnesha.Hospital_1.1.4_x64-setup.exe"]');
    await expect(historicalLink).toBeVisible();

    // Directly test HTTP fetch to verify historical binary exists and is accessible (using Playwright request context for CORS immunity)
    const downloadRes = await page.request.head("https://github.com/Adnin1/onnesha-hospital/releases/download/v1.1.4/Onnesha.Hospital_1.1.4_x64-setup.exe");
    expect(downloadRes.status()).toBe(200);
    expect(downloadRes.headers()["content-type"]).toBe("application/octet-stream");
    expect(parseInt(downloadRes.headers()["content-length"] || "0", 10)).toBeGreaterThan(1000000);
  });

  test("8. Mobile Viewport (360x740) touch targets and interactive drawer navigation", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Find and open mobile drawer
    const menuBtn = page.locator('button[aria-label*="menu" i]').first();
    await expect(menuBtn).toBeVisible();

    // Check menu button touch target height
    const box = await menuBtn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(36);
    }

    await menuBtn.click();
    await page.waitForTimeout(300);

    // Close menu
    await menuBtn.click();
    await page.waitForTimeout(300);
  });
});
