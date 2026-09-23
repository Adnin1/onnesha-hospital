/**
 * Playwright Global Setup — Pre-flight Production Host Check (Layer 1 of 2)
 *
 * GUARD ARCHITECTURE (two complementary layers):
 *
 *   Layer 1 — THIS FILE (globalSetup.ts):
 *     Runs BEFORE any test file is loaded or executed.
 *     Performs a pre-flight check: if the configured baseURL points to a
 *     production hostname AND mutation-capable spec files are detected via
 *     static source scan, the entire test run is ABORTED immediately.
 *     This catches the most common mistake (developer running `npx playwright
 *     test` without setting E2E_BASE_URL on a fresh shell).
 *
 *   Layer 2 — tests/browser/fixtures.ts (runtime network intercept):
 *     Runs DURING each test via page.route() interception.
 *     Intercepts actual HTTP requests at the browser network layer.
 *     Blocks POST, PUT, PATCH, DELETE targeting production hostnames or
 *     Supabase REST/RPC/Edge Function endpoints — REGARDLESS of what the
 *     source scan found. This is the authoritative safety mechanism.
 *
 * WHY BOTH LAYERS:
 *   - Layer 1 (source scan) is fast and gives an early, human-readable error.
 *   - Layer 2 (network intercept) is the true runtime safety net.
 *   - Neither layer alone is sufficient:
 *     * Layer 1 can have false negatives (runtime-computed fetch methods).
 *     * Layer 2 only covers tests that import from fixtures.ts.
 *   - Together they provide defense-in-depth.
 *
 * IMPORTANT: ALLOW_E2E_MUTATION=true NEVER overrides the production block
 * in EITHER layer. Use a staging URL (E2E_BASE_URL=https://staging.example.com).
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
 * potentially mutation-capable (conservative: prefers false positives).
 * This is a STATIC SCAN and is only Layer 1. The runtime network intercept
 * in fixtures.ts is the authoritative Layer 2 guard.
 */
const MUTATION_PATTERNS = [
  /page\.fill\(/,           // form input fill (may trigger form submission)
  /page\.click\(/,          // button click (may submit forms)
  /page\.selectOption\(/,   // select input (may change state)
  /book_online_appointment/, // booking RPC (explicit mutation)
  /fetch.*POST/i,
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
    return false;
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
      `[E2E Guard Layer 1] Invalid E2E_BASE_URL: "${baseURL}" — must be a valid URL.`
    );
  }

  const isProduction = PRODUCTION_HOSTNAMES.has(hostname);

  if (isProduction) {
    // --- ABSOLUTE RULE: ALLOW_E2E_MUTATION=true NEVER permits production writes ---
    // Check this first so we never even scan files before rejecting the override attempt.
    if (process.env.ALLOW_E2E_MUTATION === "true") {
      throw new Error(
        [
          "",
          "╔══════════════════════════════════════════════════════════════╗",
          "║  🛑  ABSOLUTE PRODUCTION BLOCK — OVERRIDE REJECTED           ║",
          "╠══════════════════════════════════════════════════════════════╣",
          "║  ALLOW_E2E_MUTATION=true is set but target is PRODUCTION.    ║",
          `║  Target: ${baseURL.padEnd(52)}║`,
          "║                                                              ║",
          "║  This flag NEVER overrides the production mutation block.    ║",
          "║  Use a staging URL:                                          ║",
          "║    E2E_BASE_URL=https://staging.example.com \\               ║",
          "║    ALLOW_E2E_MUTATION=true npx playwright test               ║",
          "╚══════════════════════════════════════════════════════════════╝",
          "",
        ].join("\n")
      );
    }

    // Layer 1: Static scan for mutation-capable spec files
    const browserDir = path.resolve(process.cwd(), "tests", "browser");
    const specFiles = findSpecFiles(browserDir);
    const mutationSpecs = specFiles.filter(isMutationCapable);

    if (mutationSpecs.length > 0) {
      const names = mutationSpecs
        .map((f) => `  - ${path.relative(process.cwd(), f)}`)
        .join("\n");
      throw new Error(
        [
          "",
          "╔══════════════════════════════════════════════════════════════╗",
          "║  🛑  PRODUCTION MUTATION GUARD — E2E TEST RUN BLOCKED        ║",
          "║  (Layer 1: Static source scan)                               ║",
          "╠══════════════════════════════════════════════════════════════╣",
          `║  Target: ${baseURL.padEnd(52)}║`,
          "║                                                              ║",
          "║  Mutation-capable spec files detected (static scan):         ║",
          names,
          "║                                                              ║",
          "║  Layer 2 (runtime network intercept) is also active for      ║",
          "║  specs that import from tests/browser/fixtures.ts.           ║",
          "║                                                              ║",
          "║  To run against staging only:                                ║",
          "║    E2E_BASE_URL=https://staging.example.com \\               ║",
          "║    ALLOW_E2E_MUTATION=true npx playwright test               ║",
          "╚══════════════════════════════════════════════════════════════╝",
          "",
        ].join("\n")
      );
    }

    console.log(
      `[E2E Guard Layer 1] ✅ Pre-flight PASS. Target is production (${hostname}) — only read-only spec files detected by static scan.`
    );
    console.log(
      `[E2E Guard Layer 2] ℹ️  Runtime network intercept is active for specs importing from tests/browser/fixtures.ts.`
    );
  } else {
    console.log(
      `[E2E Guard Layer 1] ✅ Pre-flight PASS. Target is non-production: ${hostname}`
    );
  }
}
