import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration for Onnesha Hospital Management System (OHMS).
 * Strictly separation of concerns:
 * - REAL BROWSER E2E tests run against live production / staging application
 * - Uses synthetic environment variables for authentication credentials
 * - Zero hardcoded secrets in version control
 */

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://onnesha-hospital.pages.dev",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
