/**
 * Conversation 4 Verification Test Suite:
 * Infrastructure Least-Privilege, Concurrency, Headers, Supabase Key Parity & Desktop Release Integrity
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Conversation 4: Infrastructure, Security Gates & Release Integrity", () => {
  const ciWorkflowPath = path.join(ROOT, ".github/workflows/ci.yml");
  const headersPath = path.join(ROOT, "public/_headers");
  const packageJsonPath = path.join(ROOT, "package.json");
  const latestJsonPath = path.join(ROOT, "public/downloads/desktop/latest.json");
  const tauriConfPath = path.join(ROOT, "src-tauri/tauri.conf.json");
  const cargoTomlPath = path.join(ROOT, "src-tauri/Cargo.toml");
  const supabaseClientPath = path.join(ROOT, "lib/supabase/client.ts");
  const supabaseBrowserPath = path.join(ROOT, "lib/supabase/browser.ts");
  const supabaseServerPath = path.join(ROOT, "lib/supabase/server.ts");

  test("1. GitHub Actions workflow implements least-privilege permissions and concurrency control", () => {
    assert.ok(fs.existsSync(ciWorkflowPath), "ci.yml must exist");
    const ciContent = fs.readFileSync(ciWorkflowPath, "utf8");

    // Root permissions must be contents: read
    assert.ok(
      ciContent.match(/permissions:\s*\n\s*contents:\s*read/),
      "Top-level workflow permissions must be restricted to 'contents: read'"
    );

    // Concurrency control
    assert.ok(
      ciContent.includes("concurrency:"),
      "Workflow must define a concurrency group"
    );
    assert.ok(
      ciContent.includes("cancel-in-progress: false"),
      "Workflow must not cancel in-progress production release deployments"
    );

    // Elevated job-level permissions and strict dependency order
    assert.ok(
      ciContent.includes("tauri-windows-build:"),
      "Tauri desktop job must exist"
    );
    assert.ok(
      ciContent.includes("needs: [validate, live-security-test]"),
      "Tauri desktop release must depend on both validate and live-security-test"
    );
    assert.ok(
      ciContent.includes("deploy-production:"),
      "Production deployment job must exist"
    );
    assert.ok(
      ciContent.includes("needs: [validate, live-security-test, tauri-windows-build]"),
      "Production deployment must depend on validate, live-security-test, and desktop build"
    );
    assert.ok(
      ciContent.includes("environment: staging"),
      "Live security test must declare staging environment"
    );
    assert.ok(
      ciContent.includes("environment: production"),
      "Production deployment must declare production environment"
    );

    // Asset forensics crawl step in validate
    assert.ok(
      ciContent.includes("npm run audit:assets"),
      "Mandatory validate job must run asset forensics crawl"
    );
  });

  test("2. Cloudflare Pages _headers file enforces modern security headers and cache control", () => {
    assert.ok(fs.existsSync(headersPath), "_headers file must exist");
    const headers = fs.readFileSync(headersPath, "utf8");

    assert.ok(headers.includes("Strict-Transport-Security: max-age=31536000; includeSubDomains"));
    assert.ok(headers.includes("X-Frame-Options: DENY"));
    assert.ok(headers.includes("X-Content-Type-Options: nosniff"));
    assert.ok(headers.includes("Referrer-Policy: strict-origin-when-cross-origin"));
    assert.ok(!headers.includes("'unsafe-eval'"), "Content-Security-Policy must not allow unsafe-eval");
    assert.ok(headers.includes("connect-src 'self' https://*.supabase.co"));
    assert.ok(headers.includes("/app/*\n  Cache-Control: no-store, no-cache, must-revalidate"));
    assert.ok(headers.includes("/downloads/desktop/*\n  Cache-Control: no-cache, no-store"));
  });

  test("3. Version synchronization is strictly preserved across all 4 project manifests", () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const latest = JSON.parse(fs.readFileSync(latestJsonPath, "utf8"));
    const tauri = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
    const cargo = fs.readFileSync(cargoTomlPath, "utf8");
    const cargoMatch = cargo.match(/version\s*=\s*"([^"]+)"/);

    const version = pkg.version;
    assert.ok(version, "package.json must declare version");
    assert.equal(latest.version, version, "latest.json version must match package.json");
    assert.equal(tauri.version, version, "tauri.conf.json version must match package.json");
    assert.ok(cargoMatch, "Cargo.toml must declare version");
    assert.equal(cargoMatch[1], version, "Cargo.toml version must match package.json");
  });

  test("4. Supabase client adapters support both modern publishable/secret and legacy keys", () => {
    const clientCode = fs.readFileSync(supabaseClientPath, "utf8");
    const browserCode = fs.readFileSync(supabaseBrowserPath, "utf8");
    const serverCode = fs.readFileSync(supabaseServerPath, "utf8");

    assert.ok(
      clientCode.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      "client.ts must support NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
    assert.ok(
      browserCode.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      "browser.ts must support NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
    assert.ok(
      serverCode.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      "server.ts must support NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  });
});
