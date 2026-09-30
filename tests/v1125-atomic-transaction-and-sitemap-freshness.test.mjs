import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("v1.1.25 Atomic Transaction, Sitemap Freshness & Provenance Truth (6 Scenarios)", () => {
  test("1. updateHospitalMasterDataAction uses update_hospital_master_profile as authoritative transaction", () => {
    const actionsPath = path.join(ROOT, "lib/hospital/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/hospital/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.ok(
      content.includes('supabase.rpc("update_hospital_master_profile"'),
      "Must execute update_hospital_master_profile RPC"
    );
  });

  test("2. updateHospitalMasterDataAction contains zero direct-table fallbacks", () => {
    const actionsPath = path.join(ROOT, "lib/hospital/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.ok(
      !content.includes('.from("organizations").update'),
      "Must NOT have direct organizations table update fallback"
    );
    assert.ok(
      !content.includes('.from("organization_settings").upsert'),
      "Must NOT have direct organization_settings upsert fallback"
    );
  });

  test("3. updateHospitalMasterDataAction does not swallow audit log errors", () => {
    const actionsPath = path.join(ROOT, "lib/hospital/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.ok(
      !content.includes('console.warn("Audit log insert warning:"'),
      "Must NOT swallow audit log errors"
    );
  });

  test("4. sitemap.ts generates dynamic build-time lastModified timestamp", () => {
    const sitemapPath = path.join(ROOT, "app/sitemap.ts");
    assert.ok(fs.existsSync(sitemapPath), "app/sitemap.ts must exist");
    const content = fs.readFileSync(sitemapPath, "utf8");

    assert.ok(
      content.includes("buildLastModified = new Date()"),
      "Must generate build-time lastModified timestamp"
    );
    assert.ok(
      content.includes("lastModified: buildLastModified"),
      "Must assign buildLastModified to each route"
    );
  });

  test("5. Desktop download page explicitly discloses PENDING_CI_BUILD status", () => {
    const pagePath = path.join(ROOT, "app/(public)/downloads/desktop/page.tsx");
    const content = fs.readFileSync(pagePath, "utf8");

    assert.ok(
      content.includes("CURRENT DESKTOP BUILD:") && content.includes("artifactStatus"),
      "Must display current build pending state in UI"
    );
    assert.ok(
      content.includes('artifactStatus = latestManifest.artifact_status || "PENDING_CI_BUILD"'),
      "Must fallback to PENDING_CI_BUILD when unbuilt"
    );
  });

  test("6. Version manifest consistency across all 6 core files", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const pkgLock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
    const tauriConf = JSON.parse(fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
    const cargo = fs.readFileSync(path.join(ROOT, "src-tauri/Cargo.toml"), "utf8");
    const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    const latestJson = JSON.parse(fs.readFileSync(path.join(ROOT, "public/downloads/desktop/latest.json"), "utf8"));

    assert.equal(pkg.version, pkgLock.version);
    assert.equal(pkg.version, tauriConf.version);
    assert.ok(cargo.includes(`version = "${pkg.version}"`));
    assert.ok(dockerfile.includes(`LABEL version="${pkg.version}"`));
    assert.equal(pkg.version, latestJson.version);
  });
});
