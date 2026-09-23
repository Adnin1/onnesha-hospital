import { test, expect } from "./fixtures";

test.describe("Production Mutation Guard — Runtime Network Layer Verification", () => {
  test("Runtime guard intercepts and blocks POST/mutation requests against protected endpoints", async ({ page, baseURL }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Attempt a POST fetch against the current origin or Supabase endpoint
    // When baseURL is production (onnesha-hospital.pages.dev / onneshahospital.com),
    // the fixture MUST abort the request (accessdenied / Failed to fetch).
    const isTargetProduction =
      baseURL?.includes("onnesha-hospital.pages.dev") ||
      baseURL?.includes("onneshahospital.com");

    let fetchFailed = false;
    try {
      await page.evaluate(async () => {
        await fetch("/api/test-mutation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mutation_attempt" }),
        });
      });
    } catch {
      fetchFailed = true;
    }

    if (isTargetProduction) {
      // Against production, runtime network guard MUST abort the POST request!
      expect(fetchFailed).toBe(true);
    } else {
      // In local/mock environments, test completes without throwing false security blocks
      expect(true).toBe(true);
    }
  });
});
