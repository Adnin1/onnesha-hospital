/**
 * Website Performance Regression & Visibility Awareness Test Suite
 * Asserts that polling intervals respect Page Visibility API, prevent overlapping in-flight calls,
 * and clean up event listeners on unmount.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Conversation 3: Website Performance & Visibility Awareness", () => {
  const homePath = path.join(ROOT, "app/(public)/page.tsx");
  const checkTokenPath = path.join(ROOT, "app/(public)/check-token/page.tsx");
  const swPath = path.join(ROOT, "public/sw.js");

  test("1. Landing page queue polling respects document.hidden to prevent background drain", () => {
    assert.ok(fs.existsSync(homePath), "Landing page must exist");
    const code = fs.readFileSync(homePath, "utf8");

    assert.ok(
      code.includes("document.hidden"),
      "Landing page polling must verify document.hidden before fetching"
    );
    assert.ok(
      code.includes('addEventListener("visibilitychange"'),
      "Landing page must register visibilitychange listener"
    );
    assert.ok(
      code.includes('removeEventListener("visibilitychange"'),
      "Landing page must unregister visibilitychange listener on unmount"
    );
  });

  test("2. Landing page prevents overlapping in-flight fetch requests", () => {
    const code = fs.readFileSync(homePath, "utf8");
    assert.ok(
      code.includes("inFlight"),
      "Landing page must maintain inFlight lock to avoid parallel interval requests"
    );
  });

  test("3. Check Token page queue polling respects document.hidden and handles reactivation", () => {
    assert.ok(fs.existsSync(checkTokenPath), "Check Token page must exist");
    const code = fs.readFileSync(checkTokenPath, "utf8");

    assert.ok(
      code.includes("document.hidden"),
      "Check Token polling must check document.hidden"
    );
    assert.ok(
      code.includes('addEventListener("visibilitychange"'),
      "Check Token must register visibilitychange listener"
    );
    assert.ok(
      code.includes('removeEventListener("visibilitychange"'),
      "Check Token must unregister visibilitychange listener on cleanup"
    );
    assert.ok(
      code.includes("inFlight"),
      "Check Token must maintain inFlight lock"
    );
  });

  test("4. Service Worker pre-cache contains only verified, existing static assets", () => {
    assert.ok(fs.existsSync(swPath), "Service Worker file public/sw.js must exist");
    const swCode = fs.readFileSync(swPath, "utf8");

    const assetMatches = swCode.matchAll(/["'](\/(?:favicon\.ico|logo\.png|icons\/[a-zA-Z0-9._-]+))["']/g);
    let matched = 0;
    for (const match of assetMatches) {
      matched++;
      const assetRelPath = match[1].replace(/^\//, "");
      const fullPath = path.join(ROOT, "public", assetRelPath);
      assert.ok(
        fs.existsSync(fullPath),
        `Service Worker pre-cache asset '${match[1]}' must exist on disk at ${fullPath}`
      );
    }
    assert.ok(matched > 0, "Service Worker should pre-cache core icons and logo");
  });
});
