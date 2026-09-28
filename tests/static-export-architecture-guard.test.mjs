import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Static Export Architecture, Docker & Security Governance Guard (7 Scenarios)", async () => {

  test("1. next.config.ts explicitly specifies static export output mode", () => {
    const nextConfig = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    assert.match(nextConfig, /output:\s*["']export["']/, "output: 'export' must be configured in next.config.ts");
  });

  test("2. Zero unsupported 'use server' directives in production codebase", () => {
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".js")) {
          const content = fs.readFileSync(fullPath, "utf8");
          assert.ok(
            !content.includes('"use server"') && !content.includes("'use server'"),
            `File ${path.relative(ROOT, fullPath)} must not contain 'use server' directive in static export architecture`
          );
        }
      }
    }
    walk(path.join(ROOT, "app"));
    walk(path.join(ROOT, "components"));
    walk(path.join(ROOT, "lib"));
  });

  test("3. Zero next/headers imports in UI routes/components and server.ts strictly isolated", () => {
    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".js")) {
          const content = fs.readFileSync(fullPath, "utf8");
          const rel = path.relative(ROOT, fullPath).replace(/\\/g, "/");
          // app and components must NEVER import next/headers
          assert.ok(
            !content.includes("from 'next/headers'") && !content.includes('from "next/headers"'),
            `UI file ${rel} must not import from next/headers in static export architecture`
          );
          // app and components must NEVER import lib/supabase/server
          assert.ok(
            !content.includes("lib/supabase/server") && !content.includes("@/lib/supabase/server"),
            `UI file ${rel} must not import server-runtime client @/lib/supabase/server`
          );
        }
      }
    }
    walk(path.join(ROOT, "app"));
    walk(path.join(ROOT, "components"));
  });

  test("4. public/_headers defines strict CSP without development sandbox origins", () => {
    const headers = fs.readFileSync(path.join(ROOT, "public/_headers"), "utf8");
    assert.ok(headers.includes("Content-Security-Policy:"), "CSP header required");
    assert.ok(!headers.includes("sandbox.sslcommerz.com"), "Production CSP must not contain sandbox.sslcommerz.com");
    assert.ok(headers.includes("Strict-Transport-Security:"), "HSTS required");
    assert.ok(headers.includes("X-Frame-Options: DENY"), "DENY frame-options required");
    assert.ok(headers.includes("no-store"), "Protected routes must enforce no-store");
  });

  test("5. docker/nginx.conf CSP is synchronized with public/_headers without sandbox leakage", () => {
    const nginxConf = fs.readFileSync(path.join(ROOT, "docker/nginx.conf"), "utf8");
    assert.ok(!nginxConf.includes("sandbox.sslcommerz.com"), "docker/nginx.conf must not contain sandbox.sslcommerz.com");
    assert.ok(nginxConf.includes("securepay.sslcommerz.com"), "docker/nginx.conf must include securepay.sslcommerz.com");
  });

  test("6. Dockerfile version label matches package.json version", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    assert.ok(dockerfile.includes(`LABEL version="${pkg.version}"`), `Dockerfile label must match version ${pkg.version}`);
  });

  test("7. Development seeder enforces SEED_ENV guard and rejects production project IDs", () => {
    const seeder = fs.readFileSync(path.join(ROOT, "scripts/seed-development-data.mjs"), "utf8");
    assert.ok(seeder.includes("SEED_ENV"), "Seeder must require SEED_ENV");
    assert.ok(seeder.includes("iuhtzahuszdkdarhxobx"), "Seeder must explicitly reject production project ID");
  });
});
