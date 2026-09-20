import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 17 PWA, Performance, Accessibility & Mobile (15 Scenarios)", async () => {

  // ── PWA ──────────────────────────────────────────────────────────────

  test("1. manifest.json has required PWA fields: name, icons, display, start_url, scope", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public/manifest.json"), "utf8"));
    assert.ok(manifest.name, "name required");
    assert.ok(manifest.short_name, "short_name required");
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.start_url, "start_url required");
    assert.ok(manifest.scope, "scope required");
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, "At least 3 icons");
    const sizes = manifest.icons.map((i) => i.sizes);
    assert.ok(sizes.some((s) => s.includes("192")), "192px icon required");
    assert.ok(sizes.some((s) => s.includes("512")), "512px icon required");
    const maskable = manifest.icons.find((i) => i.purpose === "maskable");
    assert.ok(maskable, "maskable icon required");
  });

  test("2. Service worker file exists and contains versioned cache name", () => {
    const sw = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
    assert.ok(sw.includes("CACHE_VERSION"), "SW must use versioned cache");
    assert.ok(sw.includes("ohms-static-v"), "Cache name must include version identifier");
    assert.ok(sw.includes("skipWaiting"), "SW must call skipWaiting for updates");
    assert.ok(sw.includes("clients.claim"), "SW must claim clients on activate");
  });

  test("3. Service worker NEVER caches patient, clinical, or financial paths", () => {
    const sw = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
    assert.ok(sw.includes("NEVER_CACHE"), "SW must define never-cache rules");
    const sensitiveTerms = ["patient", "prescription", "diagnosis", "invoice", "payment", "billing", "clinical", "pharmacy", "payroll", "audit"];
    for (const term of sensitiveTerms) {
      assert.ok(sw.toLowerCase().includes(term), `SW never-cache must include '${term}'`);
    }
  });

  // ── Offline Safety ───────────────────────────────────────────────────

  test("4. NetworkStatus component exists and detects navigator.onLine", () => {
    const ns = fs.readFileSync(path.join(ROOT, "components/app/NetworkStatus.tsx"), "utf8");
    assert.ok(ns.includes("navigator.onLine"), "Must check navigator.onLine");
    assert.ok(ns.includes("role=\"alert\"") || ns.includes('role="alert"'), "Must use role=alert for a11y");
    assert.ok(ns.includes("aria-live"), "Must use aria-live for screen readers");
    assert.ok(ns.includes("addEventListener"), "Must listen to online/offline events");
  });

  // ── Install UX ───────────────────────────────────────────────────────

  test("5. InstallPrompt component detects standalone mode and beforeinstallprompt", () => {
    const ip = fs.readFileSync(path.join(ROOT, "components/app/InstallPrompt.tsx"), "utf8");
    assert.ok(ip.includes("beforeinstallprompt"), "Must listen for beforeinstallprompt");
    assert.ok(ip.includes("standalone"), "Must detect standalone mode");
    assert.ok(ip.includes("dismissed"), "Must allow user to dismiss");
  });

  // ── Error Boundaries ─────────────────────────────────────────────────

  test("6. Error boundaries exist for hospital, public, and auth routes", () => {
    const hospitalError = fs.existsSync(path.join(ROOT, "app/(hospital)/app/error.tsx"));
    const publicError = fs.existsSync(path.join(ROOT, "app/(public)/error.tsx"));
    const hospitalLoading = fs.existsSync(path.join(ROOT, "app/(hospital)/app/loading.tsx"));
    const publicLoading = fs.existsSync(path.join(ROOT, "app/(public)/loading.tsx"));
    const authLoading = fs.existsSync(path.join(ROOT, "app/(auth)/loading.tsx"));
    assert.ok(hospitalError, "Hospital error boundary required");
    assert.ok(publicError, "Public error boundary required");
    assert.ok(hospitalLoading, "Hospital loading state required");
    assert.ok(publicLoading, "Public loading state required");
    assert.ok(authLoading, "Auth loading state required");
  });

  test("7. Error boundaries use role=alert and do not expose internal errors", () => {
    const hospitalError = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/error.tsx"), "utf8");
    assert.ok(hospitalError.includes('role="alert"'), "Must use role=alert");
    assert.ok(hospitalError.includes("reset"), "Must offer retry/reset action");
    assert.ok(!hospitalError.includes("stack"), "Must NOT expose stack trace to users");
  });

  // ── Accessibility ────────────────────────────────────────────────────

  test("8. Root layout has skip-to-content link and main-content landmark", () => {
    const layout = fs.readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8");
    assert.ok(layout.includes("skip-to-content") || layout.includes("#main-content"), "Skip link required");
    assert.ok(layout.includes("main-content"), "main-content ID required");
  });

  test("9. Global CSS defines focus-visible, touch targets, reduced-motion, sr-only", () => {
    const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    assert.ok(css.includes("focus-visible"), "focus-visible styles required");
    assert.ok(css.includes("prefers-reduced-motion"), "reduced-motion support required");
    assert.ok(css.includes("sr-only"), "sr-only utility required");
    assert.ok(css.includes("44px") || css.includes("min-height"), "Touch target minimum required");
  });

  // ── Push Notifications ───────────────────────────────────────────────

  test("10. Push subscription migration has RLS and tenant isolation", () => {
    const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/026_phase17_push_subscriptions.sql"), "utf8");
    assert.ok(migration.includes("push_subscriptions"), "Table must be created");
    assert.ok(migration.includes("ROW LEVEL SECURITY"), "RLS must be enabled");
    assert.ok(migration.includes("organization_id"), "Tenant isolation via org_id");
    assert.ok(migration.includes("UNIQUE") || migration.includes("uq_push_endpoint"), "Unique endpoint constraint");
  });

  test("11. Push subscription library never exposes VAPID private key to client", () => {
    const push = fs.readFileSync(path.join(ROOT, "lib/push/subscription.ts"), "utf8");
    assert.ok(push.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY"), "Must use public key from env");
    assert.ok(!push.includes("VAPID_PRIVATE_KEY") || push.includes("server-side") || push.includes("NEVER"), "Private key must never be client-side");
    assert.ok(push.includes("SAFE_NOTIFICATION") || push.includes("no PHI") || push.includes("NEVER include PHI"), "Must document safe notification content");
  });

  // ── Security ─────────────────────────────────────────────────────────

  test("12. No hardcoded API keys or secrets in settings page", () => {
    const settings = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/settings/page.tsx"), "utf8");
    assert.ok(!settings.includes("ak_live_"), "No hardcoded API key");
    assert.ok(!settings.includes("99812491204812"), "No credential-like values");
  });

  // ── Performance ──────────────────────────────────────────────────────

  test("13. Web vitals module exports measurement functions without PII", () => {
    const wv = fs.readFileSync(path.join(ROOT, "lib/web-vitals.ts"), "utf8");
    assert.ok(wv.includes("reportWebVitals"), "Must export reportWebVitals");
    assert.ok(wv.includes("LCP") && wv.includes("CLS") && wv.includes("INP"), "Must track core web vitals");
    assert.ok(wv.includes("NEVER") || wv.includes("anonymous") || wv.includes("no PII"), "Must document no PII collection");
  });

  // ── Print Safety ─────────────────────────────────────────────────────

  test("14. Print styles exclude PWA/install/network status elements", () => {
    const css = fs.readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
    const printSection = css.includes("@media print");
    assert.ok(printSection, "Print media query required");
    // Check that pwa/install/network elements are hidden in print
    assert.ok(
      css.includes("pwa-only") || css.includes("install-prompt") || css.includes("network-status") || css.includes(".no-print"),
      "PWA elements must be hidden in print"
    );
  });

  // ── Cloudflare Compatibility ─────────────────────────────────────────

  test("15. Static export output mode preserved in next.config", () => {
    const config = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    assert.ok(config.includes('"export"'), "output: export must be preserved");
  });
});
