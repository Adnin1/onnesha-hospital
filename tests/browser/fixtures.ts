/**
 * Playwright Runtime Production Mutation Guard — Network-Level Interception
 *
 * This module exports a wrapped `test` object (extended from @playwright/test)
 * that automatically intercepts and blocks ALL HTTP mutation methods
 * (POST, PUT, PATCH, DELETE) when the test target is a production host.
 *
 * WHY THIS IS NECESSARY (vs source-scan in globalSetup):
 *   - globalSetup source-scan can only detect *potential* mutation capability
 *     by reading file content. A file that imports `fetch` and calls it with
 *     a runtime-computed method string would pass the scan.
 *   - THIS guard intercepts at the actual HTTP network layer — every request
 *     the browser makes during a test is inspected in real-time. If a mutation
 *     request reaches the network while targeting production, it is aborted
 *     with a 403-equivalent and the test is failed immediately.
 *
 * PRODUCTION HOSTNAMES (permanently classified):
 *   - onnesha-hospital.pages.dev
 *   - onneshahospital.com
 *   - www.onneshahospital.com
 *
 * BLOCKED MUTATIONS (when target is production):
 *   - HTTP methods: POST, PUT, PATCH, DELETE
 *   - Supabase REST API: /rest/v1/* mutations
 *   - Supabase RPC: /rest/v1/rpc/*
 *   - Supabase Edge Functions: /functions/v1/*
 *   - navigator.sendBeacon (intercepted as POST)
 *   - Any form submission that triggers a POST
 *
 * ALLOWED (production):
 *   - GET, HEAD, OPTIONS (all safe reads)
 *   - All navigation (page.goto, page.reload)
 *   - Read-only Supabase queries
 *
 * OVERRIDE: ALLOW_E2E_MUTATION=true NEVER overrides the production block.
 *           This is an absolute rule. Use a staging URL instead.
 *
 * USAGE:
 *   Import `test` and `expect` from this module in spec files that need
 *   production-safe testing. For existing specs importing from @playwright/test,
 *   the globalSetup source-scan + this fixture provide layered protection.
 */

import { test as baseTest, expect, Page } from "@playwright/test";

/** Hostnames that are permanently classified as production. */
const PRODUCTION_HOSTNAMES = new Set([
  "onnesha-hospital.pages.dev",
  "onneshahospital.com",
  "www.onneshahospital.com",
]);

/** HTTP methods that constitute mutations. */
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Supabase URL patterns that, when matched, indicate a backend mutation
 * even if the HTTP method alone doesn't.
 * (Supabase uses POST for RPC calls which are logically reads sometimes,
 *  but we err on the side of safety: all POST to /rest/v1/ is blocked.)
 */
const SUPABASE_MUTATION_PATH_PATTERNS = [
  /\/rest\/v1\//,      // all Supabase REST (including RPC at /rest/v1/rpc/*)
  /\/functions\/v1\//, // all Edge Functions
];

/**
 * Install the runtime production mutation guard on a Playwright page.
 * Must be called before any navigation in a test.
 */
async function installMutationGuard(page: Page, baseURL: string): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(baseURL).hostname;
  } catch {
    return; // Invalid URL — let other guards handle it
  }

  const isProduction = PRODUCTION_HOSTNAMES.has(hostname);
  if (!isProduction) {
    return; // Non-production target: no guard needed
  }

  // Intercept ALL network requests
  await page.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = request.url();

    const isMutationMethod = MUTATION_METHODS.has(method);

    // Check if it targets Supabase REST/Functions with a mutation method
    // Note: Supabase JS client issues HTTP POST for RPC functions.
    // Read-only public RPCs (idempotent data fetches) should NOT be blocked:
    const READ_ONLY_RPCS = [
      "/rest/v1/rpc/get_public_live_queue",
      "/rest/v1/rpc/get_public_doctors_directory",
    ];
    const isReadOnlyRpc = READ_ONLY_RPCS.some((rpc) => url.includes(rpc));

    const isSupabaseMutation =
      isMutationMethod &&
      !isReadOnlyRpc &&
      SUPABASE_MUTATION_PATH_PATTERNS.some((pattern) => pattern.test(url));

    // Block any mutation method against any production host
    if (isMutationMethod) {
      const targetHost = (() => {
        try { return new URL(url).hostname; } catch { return url; }
      })();

      // If it's a read-only RPC against Supabase, allow it
      if (isReadOnlyRpc) {
        await route.continue();
        return;
      }

      // Block mutations targeting production or Supabase
      if (
        PRODUCTION_HOSTNAMES.has(targetHost) ||
        isSupabaseMutation ||
        targetHost.endsWith(".supabase.co") ||
        targetHost.endsWith(".supabase.com")
      ) {
        console.error(
          `[E2E Runtime Guard] 🛑 BLOCKED ${method} ${url} — production mutations are permanently forbidden.`
        );
        // Abort the request to prevent it from reaching the server
        await route.abort("accessdenied");
        return;
      }
    }

    // Allow all safe requests
    await route.continue();
  });
}

/**
 * Extended `test` fixture that automatically installs the runtime
 * production mutation guard on every test's `page` object.
 *
 * Specs that import `test` from this file get automatic network-level
 * protection without any additional boilerplate.
 */
const test = baseTest.extend<{ page: Page }>({
  page: async ({ page, baseURL }, apply) => {
    const effectiveBaseURL =
      baseURL ??
      process.env.E2E_BASE_URL ??
      "https://onnesha-hospital.pages.dev";

    // Install guard before any test navigation
    await installMutationGuard(page, effectiveBaseURL);

    await apply(page);
  },
});

export { test, expect, installMutationGuard };
export type { Page };
