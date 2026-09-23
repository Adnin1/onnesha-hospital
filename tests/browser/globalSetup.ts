/**
 * Playwright Global Setup — Production Mutation Guard
 *
 * This guard runs BEFORE any test file is executed.
 * It inspects the configured baseURL and halts the test run with an explicit
 * error if:
 *   1. The baseURL resolves to the production Cloudflare Pages URL, AND
 *   2. The test suite includes files that can perform mutations (write/modify
 *      data) against the target, AND
 *   3. The environment variable ALLOW_E2E_MUTATION is not set to "true".
 *
 * WHY: Developer discipline alone is insufficient. The Playwright default
 * falls back to the production URL if E2E_BASE_URL is unset, meaning a
 * developer who runs `npx playwright test` from a fresh shell would hit
 * production silently. This guard makes that failure loud and immediate.
 *
 * HOW TO ALLOW MUTATIONS IN STAGING:
 *   E2E_BASE_URL=https://staging.example.com ALLOW_E2E_MUTATION=true npx playwright test
 *
 * PRODUCTION IS NEVER SAFE FOR MUTATIONS regardless of ALLOW_E2E_MUTATION.
 */

import * as path from "path";
import * as fs from "fs";

/** Hostnames that are permanently classified as production. */
const PRODUCTION_HOSTNAMES = new Set([
  "onnesha-hospital.pages.dev",
  "onneshahospital.com",
  "www.onneshahospital.com",
]);

/**
 * Regex patterns that, when found in a spec file's content, classify it as
 * mutation-capable (it performs writes, POST/PUT/DELETE, or booking RPCs).
 */
const MUTATION_PATTERNS = [
  /page\.fill\(/,           // form input
  /page\.click\(/,          // button press (may submit forms)
  /page\.selectOption\(/,   // select form fields
  /book_online_appointment/, // booking RPC
  /fetch.*POST/i,           // raw POST fetch
  /fetch.*PUT/i,
  /fetch.*DELETE/i,
  /method.*POST/i,
  /method.*PUT/i,
  /method.*DELETE/i,
  /supabase.*insert/i,
  /supabase.*update/i,
  /supabase.*upsert/i,
  /supabase.*delete/i,
];

function isMutationCapable(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return MUTATION_PATTERNS.some((p) => p.test(content));
  } catch {
    return false; // If unreadable, assume safe
  }
}

function findSpecFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSpecFiles(full));
    } else if (/\.(spec|test)\.[jt]s$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

export default async function globalSetup() {
  const baseURL =
    process.env.E2E_BASE_URL ?? "https://onnesha-hospital.pages.dev";

  let hostname: string;
  try {
    hostname = new URL(baseURL).hostname;
  } catch {
    throw new Error(
      `[E2E Guard] Invalid E2E_BASE_URL: "${baseURL}" — must be a valid URL.`
    );
  }

  const isProduction = PRODUCTION_HOSTNAMES.has(hostname);

  if (isProduction) {
    // Scan browser test directory for mutation-capable specs
    const browserDir = path.resolve(process.cwd(), "tests", "browser");
    const specFiles = findSpecFiles(browserDir);
    const mutationSpecs = specFiles.filter(isMutationCapable);

    if (mutationSpecs.length > 0) {
      const allowMutation = process.env.ALLOW_E2E_MUTATION === "true";
      if (!allowMutation) {
        const names = mutationSpecs
          .map((f) => path.relative(process.cwd(), f))
          .join("\n  - ");
        throw new Error(
          [
            "",
            "╔══════════════════════════════════════════════════════════════╗",
            "║  🛑  PRODUCTION MUTATION GUARD — E2E TEST RUN BLOCKED        ║",
            "╠══════════════════════════════════════════════════════════════╣",
            `║  Target URL: ${baseURL.padEnd(48)}║`,
            "║                                                              ║",
            "║  Mutation-capable spec files detected:                       ║",
            `║    - ${names.split("\n").join("\n║    - ").padEnd(56)}║`,
            "║                                                              ║",
            "║  Running mutation tests against production is FORBIDDEN.     ║",
            "║                                                              ║",
            "║  To run against staging (safe):                              ║",
            "║    E2E_BASE_URL=https://staging.example.com \\               ║",
            "║    ALLOW_E2E_MUTATION=true npx playwright test               ║",
            "║                                                              ║",
            "║  To run READ-ONLY tests against production:                  ║",
            "║    npx playwright test --grep '@readonly'                    ║",
            "╚══════════════════════════════════════════════════════════════╝",
            "",
          ].join("\n")
        );
      }

      // ALLOW_E2E_MUTATION=true AND production → still block (safety absolute)
      throw new Error(
        [
          "",
          "╔══════════════════════════════════════════════════════════════╗",
          "║  🛑  ABSOLUTE PRODUCTION BLOCK — MUTATIONS ALWAYS FORBIDDEN  ║",
          "╠══════════════════════════════════════════════════════════════╣",
          "║  ALLOW_E2E_MUTATION=true is set but the target is PRODUCTION.║",
          `║  Target: ${baseURL.padEnd(52)}║`,
          "║  Mutations against production are PERMANENTLY forbidden       ║",
          "║  regardless of ALLOW_E2E_MUTATION. Use a staging URL.        ║",
          "╚══════════════════════════════════════════════════════════════╝",
          "",
        ].join("\n")
      );
    }
  }

  // Log confirmation (visible in CI output)
  const target = isProduction ? "PRODUCTION (read-only tests only)" : hostname;
  console.log(
    `[E2E Guard] ✅ Safe to proceed. Target: ${target}`
  );
}
