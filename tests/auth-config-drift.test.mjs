import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Auth Configuration Drift & Security Policy Enforcement", () => {
  const configPath = path.join(ROOT, "supabase/config.toml");

  test("1. supabase/config.toml exists and is readable", () => {
    assert.ok(fs.existsSync(configPath), "supabase/config.toml must exist");
  });

  test("2. Global auth.enable_signup is strictly disabled (staff-provisioned ERP)", () => {
    const content = fs.readFileSync(configPath, "utf8");
    const authBlock = content.match(/\[auth\]([\s\S]*?)(\n\[|$)/)?.[1] || "";
    assert.match(
      authBlock,
      /enable_signup\s*=\s*false/,
      "Global [auth] enable_signup must be false"
    );
  });

  test("3. Email provider auth.email.enable_signup is strictly disabled", () => {
    const content = fs.readFileSync(configPath, "utf8");
    const emailBlock = content.match(/\[auth\.email\]([\s\S]*?)(\n\[|$)/)?.[1] || "";
    assert.match(
      emailBlock,
      /enable_signup\s*=\s*false/,
      "[auth.email] enable_signup must be false to prevent public registration"
    );
  });

  test("4. Anonymous sign-ins are strictly disabled", () => {
    const content = fs.readFileSync(configPath, "utf8");
    assert.match(
      content,
      /enable_anonymous_sign_ins\s*=\s*false/,
      "enable_anonymous_sign_ins must be false"
    );
  });

  test("5. additional_redirect_urls contains ZERO wildcard domains", () => {
    const content = fs.readFileSync(configPath, "utf8");
    const redirectMatches = content.match(/additional_redirect_urls\s*=\s*\[([\s\S]*?)\]/)?.[1] || "";
    assert.ok(!redirectMatches.includes("*"), "Redirect URLs must never include wildcards");
    assert.ok(redirectMatches.includes("https://onnesha-hospital.pages.dev"), "Production URL required");
  });

  test("6. site_url matches canonical production deployment", () => {
    const content = fs.readFileSync(configPath, "utf8");
    assert.match(
      content,
      /site_url\s*=\s*"https:\/\/onnesha-hospital\.pages\.dev"/,
      "site_url must point to production canonical"
    );
  });
});
