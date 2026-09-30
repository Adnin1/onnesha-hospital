import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Approved Hospital Master Data and Super Admin Controls (6 Scenarios)", () => {
  test("1. Canonical config/hospital.ts contains approved hospital credentials", () => {
    const configPath = path.join(ROOT, "config/hospital.ts");
    assert.ok(fs.existsSync(configPath), "config/hospital.ts must exist");
    const content = fs.readFileSync(configPath, "utf8");

    assert.ok(content.includes("অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার"), "Bengali name required");
    assert.ok(content.includes("Annesha Hospital and Diagnostic Center"), "English name required");
    assert.ok(content.includes("01718835623"), "Hotline phone required");
    assert.ok(content.includes("01904210065"), "Ambulance phone required");
    assert.ok(content.includes("aaih.apon@gmail.com"), "Official email required");
    assert.ok(content.includes("সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া"), "Full Bogura address required");
  });

  test("2. APPROVED_HOSPITAL_DATA in lib/hospital/actions.ts matches approved specifications", () => {
    const actionsPath = path.join(ROOT, "lib/hospital/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/hospital/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");

    assert.ok(content.includes("APPROVED_HOSPITAL_DATA"), "APPROVED_HOSPITAL_DATA export required");
    assert.ok(content.includes("Annesha Hospital and Diagnostic Center"));
    assert.ok(content.includes("অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার"));
    assert.ok(content.includes("01718835623"));
    assert.ok(content.includes("01904210065"));
    assert.ok(content.includes("aaih.apon@gmail.com"));
    assert.ok(content.includes("সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া"));
  });

  test("3. Migration 97 updates organizations and organization_settings with approved data", () => {
    const migrationFile = path.join(
      ROOT,
      "supabase/migrations/20261001020000_real_hospital_master_data_and_admin_controls.sql"
    );
    assert.ok(fs.existsSync(migrationFile), "Migration 97 must exist");
    const content = fs.readFileSync(migrationFile, "utf8");

    assert.ok(content.includes("Annesha Hospital and Diagnostic Center"));
    assert.ok(content.includes("01718835623"));
    assert.ok(content.includes("01904210065"));
    assert.ok(content.includes("সোনালী ব্যাংকের সামনে,খান্দার ,বগুড়া"));
    assert.ok(content.includes("aaih.apon@gmail.com"));
    assert.ok(content.includes("update_hospital_master_profile"));
    assert.ok(content.includes("super_admin"));
  });

  test("4. lib/hospital/actions.ts enforces role-based authorization guards and audit logging", () => {
    const actionsFile = path.join(ROOT, "lib/hospital/actions.ts");
    const content = fs.readFileSync(actionsFile, "utf8");

    assert.ok(content.includes("super_admin"), "Must check super_admin role");
    assert.ok(content.includes("hospital_administrator"), "Must check hospital_administrator role");
    assert.ok(content.includes("audit_logs"), "Must log audit trail for changes");
    assert.ok(content.includes("getHospitalMasterDataAction"), "Must export get action");
    assert.ok(content.includes("updateHospitalMasterDataAction"), "Must export update action");
  });

  test("5. Settings page provides Super Admin controls to edit, modify, and reset master profile", () => {
    const settingsFile = path.join(ROOT, "app/(hospital)/app/settings/page.tsx");
    const content = fs.readFileSync(settingsFile, "utf8");

    assert.ok(content.includes("Hospital Profile & Master Data Management"));
    assert.ok(content.includes("Save Hospital Master Data"));
    assert.ok(content.includes("Reset to Approved Master Data"));
    assert.ok(content.includes("Super Admin / Administrator Only"));
    assert.ok(content.includes("handleSaveHospitalData"));
    assert.ok(content.includes("handleResetHospitalData"));
  });

  test("6. Environment definitions include approved hospital identity", () => {
    const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    assert.ok(envExample.includes("NEXT_PUBLIC_APP_NAME"), "App name env required");
    assert.ok(envExample.includes("01718835623"), "Phone env required");
    assert.ok(envExample.includes("01904210065"), "Ambulance env required");
    assert.ok(envExample.includes("aaih.apon@gmail.com"), "Email env required");
  });
});
