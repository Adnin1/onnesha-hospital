import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const SW_PATH = path.join(ROOT, "public/sw.js");
const PKG_PATH = path.join(ROOT, "package.json");
const SW_REGISTER_PATH = path.join(ROOT, "components/app/SwRegister.tsx");

describe("OHMS Service Worker Cache Hardening & Stale Prevention", () => {
  const swCode = fs.readFileSync(SW_PATH, "utf8");
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  const expectedVersion = `ohms-static-v5-${pkg.version}`;

  test("1. CACHE_VERSION binds to ohms-static-v5-1.1.47 and passes both 'ohms-static-v' and 'ohms-static-v5' tests", () => {
    assert.ok(
      swCode.includes(`const CACHE_VERSION = '${expectedVersion}';`),
      `public/sw.js must define CACHE_VERSION as '${expectedVersion}'`
    );
    // Legacy test assertions compatibility check
    assert.ok(
      swCode.includes("ohms-static-v"),
      "Must satisfy 'ohms-static-v' pattern assertion from phase17-pwa test"
    );
    assert.ok(
      swCode.includes("ohms-static-v5"),
      "Must satisfy 'ohms-static-v5' pattern assertion from website-public-security test"
    );
    assert.ok(
      swCode.includes(pkg.version),
      `Must contain release version string '${pkg.version}' from package.json`
    );
  });

  test("2. sw.js activate event purges all legacy/stale caches while preserving the active release cache", async () => {
    // Static code assertions
    assert.ok(swCode.includes("self.addEventListener('activate'"), "Must listen to activate event");
    assert.ok(swCode.includes("caches.keys()"), "Must enumerate cache keys on activate");
    assert.ok(swCode.includes("key !== CACHE_VERSION"), "Must filter out non-matching caches");
    assert.ok(swCode.includes("caches.delete(key)"), "Must purge old caches using caches.delete");
    assert.ok(swCode.includes("clients.claim()"), "Must claim clients immediately on activate");

    // Functional VM test
    const listeners = {};
    const deletedCaches = [];
    const mockCaches = {
      keys: async () => [
        "ohms-static-v4",
        "ohms-static-v5",
        "ohms-static-v5-1.1.46",
        expectedVersion,
        "foreign-legacy-cache",
      ],
      delete: async (name) => {
        deletedCaches.push(name);
        return true;
      },
    };

    let claimed = false;
    const ctx = {
      self: {
        addEventListener: (type, fn) => {
          listeners[type] = fn;
        },
        skipWaiting: () => {},
        clients: {
          claim: async () => {
            claimed = true;
          },
        },
      },
      caches: mockCaches,
      URL,
      Set,
      Promise,
      console,
    };

    vm.createContext(ctx);
    vm.runInContext(swCode, ctx);

    assert.ok(listeners["activate"], "activate listener must be registered");

    let activatePromise;
    listeners["activate"]({
      waitUntil: (p) => {
        activatePromise = p;
      },
    });

    await activatePromise;

    // Verify all old caches were purged
    assert.deepEqual(deletedCaches.sort(), [
      "foreign-legacy-cache",
      "ohms-static-v4",
      "ohms-static-v5",
      "ohms-static-v5-1.1.46",
    ]);
    assert.ok(
      !deletedCaches.includes(expectedVersion),
      `Active release cache '${expectedVersion}' must NOT be deleted`
    );
    assert.ok(claimed, "self.clients.claim() must have been called during activate");
  });

  test("3. Allowlisted public HTML marketing pages fetch with { cache: 'no-cache' } to prevent stale deployment shells", async () => {
    // Static code assertion
    assert.ok(
      swCode.includes("fetch(request, { cache: 'no-cache' })"),
      "sw.js must fetch allowlisted public routes with { cache: 'no-cache' }"
    );

    // Functional VM test
    const listeners = {};
    const fetchCalls = [];
    const mockCacheStore = new Map();

    const mockCaches = {
      match: async (req) => mockCacheStore.get(typeof req === "string" ? req : req.url) || null,
      open: async () => ({
        put: async (req, res) => {
          mockCacheStore.set(typeof req === "string" ? req : req.url, res);
        },
      }),
    };

    const ctx = {
      self: {
        addEventListener: (type, fn) => {
          listeners[type] = fn;
        },
        skipWaiting: () => {},
        clients: { claim: async () => {} },
      },
      caches: mockCaches,
      fetch: (req, opts) => {
        fetchCalls.push({ req, opts });
        return Promise.resolve({
          ok: true,
          headers: new Headers({ "Cache-Control": "public, max-age=3600" }),
          clone: () => ({ ok: true }),
        });
      },
      URL,
      Set,
      Promise,
      Headers,
      console,
    };

    vm.createContext(ctx);
    vm.runInContext(swCode, ctx);

    const allowlistRoutes = ["/", "/about", "/contact", "/services", "/doctors", "/privacy", "/terms"];

    for (const route of allowlistRoutes) {
      let responsePromise;
      listeners["fetch"]({
        request: {
          method: "GET",
          url: `https://onneshahospital.com${route}`,
          headers: new Headers(),
        },
        respondWith: (p) => {
          responsePromise = p;
        },
      });

      await responsePromise;
    }

    assert.equal(fetchCalls.length, allowlistRoutes.length);
    for (const call of fetchCalls) {
      assert.equal(
        call.opts?.cache,
        "no-cache",
        `Fetch for allowlisted route '${call.req.url}' must include { cache: 'no-cache' }`
      );
    }
  });

  test("4. shouldNeverCache rejects private, auth, clinical, financial, and parameterized routes from caching", () => {
    const ctx = {
      self: { addEventListener: () => {} },
      caches: {},
      URL,
      Set,
      Promise,
      Headers,
      console,
    };
    vm.createContext(ctx);
    vm.runInContext(swCode, ctx);

    const shouldNeverCache = ctx.shouldNeverCache;
    assert.equal(typeof shouldNeverCache, "function", "shouldNeverCache must be a function");

    // Auth & sensitive pages
    assert.equal(shouldNeverCache("https://onneshahospital.com/login"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/mfa"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/forgot-password"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/reset-password"), true);

    // App & API paths
    assert.equal(shouldNeverCache("https://onneshahospital.com/app"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/app/patients"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/app/billing"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/api/health"), true);

    // Online booking token and confirmation
    assert.equal(shouldNeverCache("https://onneshahospital.com/check-token"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/book-appointment"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/confirm"), true);

    // Lobby displays and recovery routes
    assert.equal(shouldNeverCache("https://onneshahospital.com/displays/queue"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/displays/triage"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/recovery"), true);

    // Clinical and financial keywords
    assert.equal(shouldNeverCache("https://onneshahospital.com/invoice/print"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/prescription/view"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/payroll/export"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/audit/logs"), true);

    // Authorization header
    const authHeaders = new Headers({ authorization: "Bearer secret-token" });
    assert.equal(
      shouldNeverCache({ url: "https://onneshahospital.com/about", headers: authHeaders }),
      true,
      "Requests with Authorization header must bypass cache"
    );

    // Sensitive query parameters
    assert.equal(shouldNeverCache("https://onneshahospital.com/about?token=abc"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/about?access_token=xyz"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/about?session=123"), true);
    assert.equal(shouldNeverCache("https://onneshahospital.com/about?api_key=priv"), true);

    // Public allowlisted without parameters should NOT be blocked by shouldNeverCache
    const normalHeaders = new Headers();
    assert.equal(
      shouldNeverCache({ url: "https://onneshahospital.com/about", headers: normalHeaders }),
      false,
      "Plain public marketing page should not be blocked by shouldNeverCache"
    );
  });

  test("5. isResponseCacheable rejects no-store, private, no-cache, and failed responses", () => {
    const ctx = {
      self: { addEventListener: () => {} },
      caches: {},
      URL,
      Set,
      Promise,
      Headers,
      console,
    };
    vm.createContext(ctx);
    vm.runInContext(swCode, ctx);

    const isResponseCacheable = ctx.isResponseCacheable;
    assert.equal(typeof isResponseCacheable, "function", "isResponseCacheable must be a function");

    // Non-ok response
    assert.equal(isResponseCacheable({ ok: false, status: 500 }), false);
    assert.equal(isResponseCacheable(null), false);

    // Cache-Control: no-store
    assert.equal(
      isResponseCacheable({
        ok: true,
        headers: new Headers({ "Cache-Control": "no-store, no-cache, must-revalidate" }),
      }),
      false
    );

    // Cache-Control: private
    assert.equal(
      isResponseCacheable({
        ok: true,
        headers: new Headers({ "Cache-Control": "private, max-age=0" }),
      }),
      false
    );

    // Cache-Control: no-cache
    assert.equal(
      isResponseCacheable({
        ok: true,
        headers: new Headers({ "Cache-Control": "no-cache" }),
      }),
      false
    );

    // Cacheable response
    assert.equal(
      isResponseCacheable({
        ok: true,
        headers: new Headers({ "Cache-Control": "public, max-age=86400, immutable" }),
      }),
      true
    );
  });

  test("6. SwRegister.tsx registers visibilitychange listener and calls reg.update() on tab switch", () => {
    assert.ok(fs.existsSync(SW_REGISTER_PATH), "SwRegister.tsx must exist");
    const regCode = fs.readFileSync(SW_REGISTER_PATH, "utf8");

    assert.ok(
      regCode.includes('addEventListener("visibilitychange"'),
      "SwRegister must register visibilitychange event listener"
    );
    assert.ok(
      regCode.includes('removeEventListener("visibilitychange"'),
      "SwRegister must clean up visibilitychange event listener on unmount"
    );
    assert.ok(
      regCode.includes('document.visibilityState === "visible"'),
      "SwRegister must check if document.visibilityState is 'visible'"
    );
    assert.ok(
      regCode.includes("reg.update()"),
      "SwRegister must call reg.update() on visibilitychange"
    );
  });
});
