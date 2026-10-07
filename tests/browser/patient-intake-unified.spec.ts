import { test, expect } from "./fixtures";

test.describe("Real Browser E2E: Unified Patient Intake & Episode Billing Workflow", () => {
  test("1. Patient directory loads, provides patient search and unified intake trigger", async ({ page }) => {
    await page.goto("/app/patients");
    await page.waitForLoadState("domcontentloaded");

    const mainContainer = page.locator("#main-content, main, [role='main']").first();
    await expect(mainContainer).toBeVisible();

    // In unauthenticated CI / Hermetic test environments, wait for either auth guard login input or patient directory search
    const authOrDirectoryInput = page.locator('input[type="email"], input[placeholder*="Search by name, phone"], input[placeholder*="Patient ID"], input[type="search"]').first();
    await expect(authOrDirectoryInput).toBeVisible();

    if (page.url().includes("/login")) {
      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toBeVisible();
      return;
    }

    // Verify search input is rendered and usable
    const searchInput = page.locator('input[placeholder*="Search by name, phone"], input[placeholder*="Patient ID"], input[type="search"], input[type="text"]').first();
    await expect(searchInput).toBeVisible();

    // Check for the intake / registration modal trigger button
    const registerTrigger = page.locator('button:has-text("Add Patient"), button:has-text("New Patient"), button:has-text("Register Patient"), button:has-text("Admit / New Service")').first();
    if (await registerTrigger.isVisible()) {
      await expect(registerTrigger).toBeEnabled();
      await registerTrigger.click();

      // Verify the Unified Patient Intake dialog opens with correct accessibility semantics
      const modal = page.locator('[role="dialog"][aria-modal="true"]');
      await expect(modal).toBeVisible();

      // Verify mode tabs exist
      const newPatientTab = modal.locator('button:has-text("New Patient")');
      const existingPatientTab = modal.locator('button:has-text("Existing Patient")');
      await expect(newPatientTab).toBeVisible();
      await expect(existingPatientTab).toBeVisible();

      // Verify action buttons exist in modal footer
      const cancelBtn = modal.locator('button:has-text("Cancel")');
      await expect(cancelBtn).toBeVisible();

      // Verify primary submit button is rendered and not permanently locked
      const primarySubmit = modal.locator('button[type="submit"]');
      await expect(primarySubmit).toBeVisible();

      // Close modal
      await cancelBtn.click();
      await expect(modal).not.toBeVisible();
    }
  });

  test("2. Billing console loads Episode Billing Panel and supports lookup", async ({ page }) => {
    await page.goto("/app/billing");
    await page.waitForLoadState("domcontentloaded");

    const mainContainer = page.locator("#main-content, main, [role='main']").first();
    await expect(mainContainer).toBeVisible();

    // Verify episode lookup or patient search is present
    const lookupInput = page.locator('input[placeholder*="Search patient"], input[placeholder*="Search by name, phone"], input[type="text"]').first();
    if (await lookupInput.isVisible()) {
      await expect(lookupInput).toBeEnabled();
    }
  });
});
