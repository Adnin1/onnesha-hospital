/**
 * Phase 44: ERP Core - Fixed Assets Lifecycle & Inpatient Nursing Care Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 44 - ERP Fixed Assets & Inpatient Nursing Rounds", async (t) => {
  const assetsActionsPath = path.join(ROOT, "lib/assets/actions.ts");
  const nursingActionsPath = path.join(ROOT, "lib/nursing/actions.ts");
  const assetsPagePath = path.join(ROOT, "app/(hospital)/app/assets/page.tsx");
  const migrationPath = path.join(ROOT, "supabase/migrations/20260921020000_hospital_erp_core_foundations.sql");
  const navPath = path.join(ROOT, "config/navigation.ts");
  const permPath = path.join(ROOT, "lib/permissions.ts");

  assert.ok(fs.existsSync(assetsActionsPath), "lib/assets/actions.ts must exist");
  assert.ok(fs.existsSync(nursingActionsPath), "lib/nursing/actions.ts must exist");
  assert.ok(fs.existsSync(assetsPagePath), "app/(hospital)/app/assets/page.tsx must exist");
  assert.ok(fs.existsSync(migrationPath), "Migration 47 must exist");

  const assetsActionsCode = fs.readFileSync(assetsActionsPath, "utf8");
  const nursingActionsCode = fs.readFileSync(nursingActionsPath, "utf8");
  const pageCode = fs.readFileSync(assetsPagePath, "utf8");
  const migrationCode = fs.readFileSync(migrationPath, "utf8");
  const navCode = fs.readFileSync(navPath, "utf8");
  const permCode = fs.readFileSync(permPath, "utf8");

  await t.test("1. Database Schema: Assets, Maintenance, Nursing Notes & Vitals", () => {
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.hospital_assets/);
    assert.match(migrationCode, /category VARCHAR\(50\) NOT NULL CHECK \(category IN \('MEDICAL_EQUIPMENT', 'DIAGNOSTIC_MACHINE', 'IT_HARDWARE', 'FURNITURE', 'VEHICLE', 'FACILITY'\)\)/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.asset_maintenance_logs/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.nursing_notes/);
    assert.match(migrationCode, /shift VARCHAR\(20\) NOT NULL CHECK \(shift IN \('MORNING', 'EVENING', 'NIGHT'\)\)/);
    assert.match(migrationCode, /CREATE TABLE IF NOT EXISTS public\.patient_vitals_rounds/);
  });

  await t.test("2. Backend Actions Verification", () => {
    assert.match(assetsActionsCode, /export async function getHospitalAssetsAction/);
    assert.match(assetsActionsCode, /export async function createHospitalAssetAction/);
    assert.match(assetsActionsCode, /export async function getAssetMaintenanceLogsAction/);
    assert.match(assetsActionsCode, /export async function createAssetMaintenanceLogAction/);

    assert.match(nursingActionsCode, /export async function getNursingNotesAction/);
    assert.match(nursingActionsCode, /export async function createNursingNoteAction/);
    assert.match(nursingActionsCode, /export async function getPatientVitalsRoundsAction/);
    assert.match(nursingActionsCode, /export async function recordPatientVitalsRoundAction/);
  });

  await t.test("3. Navigation and Permissions Integration", () => {
    assert.match(navCode, /\/app\/assets/);
    assert.match(navCode, /Fixed Assets & Equipment/);
    assert.match(permCode, /ASSETS_VIEW: "assets\.view"/);
    assert.match(permCode, /ASSETS_MANAGE: "assets\.manage"/);
    assert.match(permCode, /NURSING_VIEW: "nursing\.view"/);
    assert.match(permCode, /NURSING_MANAGE: "nursing\.manage"/);
  });

  await t.test("4. UI Page Renders Asset Register and Maintenance Tabs", () => {
    assert.match(pageCode, /Equipment Register/);
    assert.match(pageCode, /Service & Calibration/);
    assert.match(pageCode, /Register Hospital Asset/);
    assert.match(pageCode, /Log Calibration & Service/);
  });
});
