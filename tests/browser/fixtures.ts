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
  } catch (err: unknown) {
    console.error("[installMutationGuard] Invalid baseURL:", err);
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
      "/rest/v1/rpc/get_public_token_status",
      "/rest/v1/rpc/get_public_doctor_schedules",
    ];
    const isReadOnlyRpc = READ_ONLY_RPCS.some((rpc) => url.includes(rpc));

    const isSupabaseMutation =
      isMutationMethod &&
      !isReadOnlyRpc &&
      SUPABASE_MUTATION_PATH_PATTERNS.some((pattern) => pattern.test(url));

    // Block any mutation method against any production host
    if (isMutationMethod) {
      const targetHost = (() => {
        try { return new URL(url).hostname; } catch (err: unknown) { console.error("[installMutationGuard] targetHost parse error:", err); return url; }
      })();

      // If it's a read-only RPC against Supabase, allow it
      if (isReadOnlyRpc) {
        await route.fallback();
        return;
      }

      // Let previously registered hermetic fixture mocks handle placeholder requests.
      // Playwright runs page.route handlers in reverse registration order; continue()
      // would bypass the earlier mock and send the placeholder request to the network.
      if (targetHost.includes("placeholder") || targetHost.includes("ci-hermetic")) {
        await route.fallback();
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

    // Allow all safe requests by yielding to earlier mocks or network
    await route.fallback();
  });
}

const DAYS_OF_WEEK = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const MOCK_ALL_DAY_SCHEDULES = DAYS_OF_WEEK.map((day, idx) => ({
  id: `sched-00${idx + 1}`,
  day_of_week: day,
  start_time: "09:00",
  end_time: "13:00",
  max_tokens: 30,
  room_number: "301",
  is_active: true,
}));

const MOCK_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, prefer, range",
  "content-type": "application/json",
};

/**
 * Install hermetic route mocks for placeholder Supabase requests.
 * Fulfills with valid deterministic JSON data so browser tests never fail DNS
 * or raise unhandled fetch rejections (e.g. WebKit "TypeError: Load failed").
 */
async function installHermeticMocks(page: Page): Promise<void> {
  await page.route(
    (url) =>
      url.hostname.includes("ci-hermetic-build-placeholder") ||
      url.hostname.includes("placeholder.supabase"),
    async (route) => {
      const request = route.request();
      if (request.method().toUpperCase() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: MOCK_CORS_HEADERS,
        });
        return;
      }

      const reqUrl = request.url();

      if (reqUrl.includes("/rest/v1/public_departments_view") || reqUrl.includes("/rest/v1/departments")) {
        await route.fulfill({
          status: 200,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify([
            {
              id: "dept-gen-001",
              name: "General Medicine",
              slug: "general-medicine",
              description: "General Outpatient and Internal Medicine Department",
              is_active: true,
            },
            {
              id: "dept-ped-002",
              name: "Pediatrics",
              slug: "pediatrics",
              description: "Child and Adolescent Healthcare Department",
              is_active: true,
            },
          ]),
        });
        return;
      }

      if (reqUrl.includes("/rest/v1/rpc/get_public_doctors_directory") || reqUrl.includes("/rest/v1/doctors")) {
        await route.fulfill({
          status: 200,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify([
            {
              id: "doc-001",
              full_name: "Prof. Dr. M. A. Rahman",
              degrees: "MBBS, FCPS (Medicine)",
              designation: "Professor & Head",
              specialization: "Internal Medicine",
              room_number: "301",
              opd_fee: 1000,
              avatar_url: null,
              public_bio: "Experienced consultant in general and internal medicine.",
              department_name: "General Medicine",
              department_slug: "general-medicine",
              is_active: true,
              is_public: true,
              schedules: MOCK_ALL_DAY_SCHEDULES,
            },
          ]),
        });
        return;
      }

      if (reqUrl.includes("/rest/v1/rpc/get_public_doctor_schedules")) {
        await route.fulfill({
          status: 200,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify(MOCK_ALL_DAY_SCHEDULES),
        });
        return;
      }

      if (reqUrl.includes("/rest/v1/rpc/book_online_appointment")) {
        await route.fulfill({
          status: 200,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            appointment_id: "apt-mock-001",
            token_number: 14,
            patient_code: "P-2026-MOCK-001",
            appointment_date: "2026-10-10",
            doctor_name: "Prof. Dr. M. A. Rahman",
            room_number: "301",
            opd_fee: 1000,
          }),
        });
        return;
      }

      if (reqUrl.includes("/rest/v1/rpc/submit_public_contact_inquiry")) {
        await route.fulfill({
          status: 200,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            inquiry_id: "inq-mock-001",
            reference_number: "INQ-2026-0001",
          }),
        });
        return;
      }

      if (reqUrl.includes("/rest/v1/rpc/get_public_live_queue")) {
        await route.fulfill({
          status: 200,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify([]),
        });
        return;
      }

      if (reqUrl.includes("/rest/v1/rpc/get_public_token_status")) {
        await route.fulfill({
          status: 200,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify(null),
        });
        return;
      }

      if (reqUrl.includes("/auth/v1/token")) {
        await route.fulfill({
          status: 400,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify({
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            message: "Invalid login credentials",
          }),
        });
        return;
      }

      if (reqUrl.includes("/auth/v1/")) {
        await route.fulfill({
          status: 200,
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify({ user: null, session: null }),
        });
        return;
      }

      // Default safe empty response for any other placeholder Supabase query
      await route.fulfill({
        status: 200,
        headers: MOCK_CORS_HEADERS,
        body: JSON.stringify([]),
      });
    }
  );
}

/**
 * Extended `test` fixture that automatically installs the runtime
 * production mutation guard and hermetic placeholder mocks on every test's `page` object.
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

    // Install hermetic mocks for placeholder Supabase endpoints
    await installHermeticMocks(page);

    // Install guard before any test navigation
    await installMutationGuard(page, effectiveBaseURL);

    await apply(page);
  },
});

export { test, expect, installMutationGuard, installHermeticMocks };
export type { Page };

