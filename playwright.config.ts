import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration for Onnesha Hospital Management System (OHMS).
 * Strictly separation of concerns:
 * - REAL BROWSER E2E tests run against live production / staging application
 * - Uses synthetic environment variables for authentication credentials
 * - Zero hardcoded secrets in version control
 */

export default defineConfig({
  globalSetup: "./tests/browser/globalSetup.ts",
  testDir: "./tests/browser",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npx --yes serve out -l 3000 -c serve.json",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
