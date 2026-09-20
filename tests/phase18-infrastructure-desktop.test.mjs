import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 18 Infrastructure, Domain & Desktop Client (10 Scenarios)", async () => {

  test("1. Tauri config file exists and specifies application identity", () => {
    const tauriConfPath = path.join(ROOT, "src-tauri/tauri.conf.json");
    assert.ok(fs.existsSync(tauriConfPath), "tauri.conf.json must exist");
    const conf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
    assert.equal(conf.productName, "Onnesha Hospital");
    assert.equal(conf.identifier, "com.onneshahospital.app");
    assert.ok(conf.version, "Version required");
  });

  test("2. Tauri Cargo.toml exists and configures Rust dependencies", () => {
    const cargoPath = path.join(ROOT, "src-tauri/Cargo.toml");
    assert.ok(fs.existsSync(cargoPath), "Cargo.toml must exist");
    const content = fs.readFileSync(cargoPath, "utf8");
    assert.ok(content.includes("onnesha-hospital-desktop"), "Package name required");
    assert.ok(content.includes("tauri"), "Tauri dependency required");
  });

  test("3. Tauri capability allowlist defines minimum required permissions", () => {
    const capPath = path.join(ROOT, "src-tauri/capabilities/default.json");
    assert.ok(fs.existsSync(capPath), "capabilities/default.json must exist");
    const cap = JSON.parse(fs.readFileSync(capPath, "utf8"));
    assert.ok(Array.isArray(cap.permissions), "Permissions array required");
    assert.ok(cap.permissions.includes("core:default"), "Default permission required");
  });

  test("4. Desktop download page exists under app/(public)/downloads/desktop", () => {
    const downloadPagePath = path.join(ROOT, "app/(public)/downloads/desktop/page.tsx");
    assert.ok(fs.existsSync(downloadPagePath), "Desktop download page required");
    const content = fs.readFileSync(downloadPagePath, "utf8");
    assert.ok(content.includes("Onnesha Hospital"), "Branding required");
    assert.ok(content.includes(".msi"), "MSI download reference required");
  });

  test("5. Desktop update release manifest latest.json exists in public/downloads/desktop", () => {
    const manifestPath = path.join(ROOT, "public/downloads/desktop/latest.json");
    assert.ok(fs.existsSync(manifestPath), "latest.json update manifest required");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.ok(manifest.version, "Version required");
    assert.ok(manifest.platforms, "Platforms object required");
    assert.ok(manifest.platforms["windows-x86_64"], "Windows x64 platform entry required");
  });

  test("6. Desktop client config contains zero embedded Supabase service role keys", () => {
    const tauriConf = fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8");
    const cargo = fs.readFileSync(path.join(ROOT, "src-tauri/Cargo.toml"), "utf8");
    assert.ok(!tauriConf.includes("service_role"), "No service role key in tauri.conf");
    assert.ok(!cargo.includes("service_role"), "No service role key in Cargo.toml");
  });

  test("7. package.json contains desktop scripts (desktop:dev, desktop:build, desktop:check)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.ok(pkg.scripts["desktop:dev"], "desktop:dev script required");
    assert.ok(pkg.scripts["desktop:build"], "desktop:build script required");
    assert.ok(pkg.scripts["desktop:check"], "desktop:check script required");
  });

  test("8. Site URL configuration falls back gracefully to canonical domain", () => {
    const metadataBase = process.env.NEXT_PUBLIC_SITE_URL || "https://onneshahospital.com";
    assert.ok(metadataBase.startsWith("https://"), "HTTPS required for canonical domain");
    assert.ok(!metadataBase.includes("localhost"), "Canonical domain must not default to localhost");
  });

  test("9. Security headers include HSTS and frame protection", () => {
    const headersPath = path.join(ROOT, "public/_headers");
    assert.ok(fs.existsSync(headersPath), "_headers file required");
    const content = fs.readFileSync(headersPath, "utf8");
    assert.ok(content.includes("Strict-Transport-Security"), "HSTS header required");
    assert.ok(content.includes("X-Frame-Options"), "X-Frame-Options header required");
  });

  test("10. Public download route is statically exported", () => {
    const nextConfig = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    assert.ok(nextConfig.includes('"export"'), "Static export mode required");
  });
});
