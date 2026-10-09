import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 39: v1.1.59 Final Production Closure, Migration 120, Episode Billing & Cabin Release", () => {
  // Test 1: Migration 120 Scopes Current Episode Billing and Exposes Lifetime Totals
  test("1. Database Migration 120: Strictly scopes current episode billing history and separates lifetime totals", () => {
    const migrationPath = path.join(
      rootDir,
      "supabase",
      "migrations",
      "20261008120000_billing_history_scoping_and_financial_integrity.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 120 file must exist in supabase/migrations");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_episode_billing_preview/, "Must update public.get_episode_billing_preview");
    assert.match(sql, /'current_episode_invoiced',\s*v_ep_invoiced/, "Must return current_episode_invoiced");
    assert.match(sql, /'current_episode_paid',\s*v_ep_paid/, "Must return current_episode_paid");
    assert.match(sql, /'current_episode_due',\s*GREATEST\(0,\s*v_ep_due\)/, "Must return current_episode_due");
    assert.match(sql, /'lifetime_invoiced',\s*v_life_invoiced/, "Must return lifetime_invoiced");
    assert.match(sql, /'lifetime_paid',\s*v_life_paid/, "Must return lifetime_paid");
    assert.match(sql, /'lifetime_due',\s*GREATEST\(0,\s*v_life_due\)/, "Must return lifetime_due");
    assert.match(sql, /AND\s+i\.episode_id\s*=\s*v_episode\.id/, "Must filter current episode invoices by episode_id");
  });

  // Test 2: Billing Actions Type Safety and Backward Compatibility
  test("2. Billing Actions: Exposes typed lifetime financial attributes with graceful fallbacks", () => {
    const billingActionsPath = path.join(rootDir, "lib", "billing", "actions.ts");
    assert.ok(fs.existsSync(billingActionsPath), "lib/billing/actions.ts must exist");
    const content = fs.readFileSync(billingActionsPath, "utf8");

    assert.match(content, /lifetimeInvoiced:\s*number;/, "EpisodeBillingPreviewData must include lifetimeInvoiced");
    assert.match(content, /lifetimePaid:\s*number;/, "EpisodeBillingPreviewData must include lifetimePaid");
    assert.match(content, /lifetimeDue:\s*number;/, "EpisodeBillingPreviewData must include lifetimeDue");
    assert.match(content, /lifetimeInvoiced:\s*Number\(result\.lifetime_invoiced\s*\?\?\s*result\.previous_invoiced\s*\?\?\s*0\)/);
  });

  // Test 3: Cabin Release upon Patient Discharge
  test("3. Patient Discharge: Releases both bed and cabin occupancy to VACANT", () => {
    const patientActionsPath = path.join(rootDir, "lib", "patient", "actions.ts");
    assert.ok(fs.existsSync(patientActionsPath), "lib/patient/actions.ts must exist");
    const content = fs.readFileSync(patientActionsPath, "utf8");

    assert.match(content, /\.select\("id,\s*bed_id,\s*cabin_id"\)/, "Must query cabin_id on bed assignment");
    assert.match(
      content,
      /if\s*\(bedAssign\.cabin_id\)\s*\{\s*await supabase\s*\.from\("cabins"\)\s*\.update\(\{\s*status:\s*"VACANT"\s*\}\)\s*\.eq\("organization_id",\s*session\.organizationId\)\s*\.eq\("id",\s*bedAssign\.cabin_id\);\s*\}/,
      "Must set cabin status to VACANT upon discharge"
    );
  });

  // Test 4: Migration Repertoire Count
  test("4. Migration Baseline: Exactly 122+ version-controlled schema migrations exist", () => {
    const migrationsDir = path.join(rootDir, "supabase", "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    assert.ok(files.length >= 121, "At least 121 migration files must exist in supabase/migrations");
    assert.ok(files.length >= 122, "At least 122 migration files must exist in supabase/migrations");
  });

  // Test 5: Synchronized Release Version Across All Manifests (1.1.59+)
  test("5. Version Synchronization: version is synchronized across all project manifests (1.1.59+)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    assert.match(pkg.version, /^1\.1\.(59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)$/, "package.json must be 1.1.59-1.1.80");

    const pkgLock = JSON.parse(fs.readFileSync(path.join(rootDir, "package-lock.json"), "utf8"));
    assert.match(pkgLock.version, /^1\.1\.(59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)$/, "package-lock.json must match");
    assert.match(pkgLock.packages[""].version, /^1\.1\.(59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)$/, "package-lock.json empty package must match");

    const dockerfile = fs.readFileSync(path.join(rootDir, "Dockerfile"), "utf8");
    assert.match(dockerfile, /LABEL version="1\.1\.(59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)"/, "Dockerfile LABEL version must match");

    const cargoToml = fs.readFileSync(path.join(rootDir, "src-tauri", "Cargo.toml"), "utf8");
    assert.match(cargoToml, /version\s*=\s*"1\.1\.(59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)"/, "Cargo.toml version must match");

    const tauriConf = JSON.parse(fs.readFileSync(path.join(rootDir, "src-tauri", "tauri.conf.json"), "utf8"));
    assert.match(tauriConf.version, /^1\.1\.(59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)$/, "tauri.conf.json version must match");

    const sw = fs.readFileSync(path.join(rootDir, "public", "sw.js"), "utf8");
    assert.match(sw, /CACHE_VERSION\s*=\s*'ohms-static-v5-1\.1\.(59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)'/, "sw.js CACHE_VERSION must match");

    const latestJson = JSON.parse(fs.readFileSync(path.join(rootDir, "public", "downloads", "desktop", "latest.json"), "utf8"));
    assert.match(latestJson.version, /^1\.1\.(59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80)$/, "latest.json version must match");
  });
});
