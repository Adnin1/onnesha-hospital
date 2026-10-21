import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Migration 232: Comprehensive Clinical EMR, IPD, Blood Bank & Queue Verification", async (t) => {
  const rootDir = process.cwd();
  const mig232Path = path.join(
    rootDir,
    "supabase",
    "migrations",
    "20261021180000_migration_232_comprehensive_clinical_and_operational_defects_fix.sql"
  );

  await t.test("1. Migration 232 exists and defines all required atomic procedures and cache reload", () => {
    assert.ok(fs.existsSync(mig232Path), "Migration 232 must exist");
    const sql = fs.readFileSync(mig232Path, "utf8");

    assert.match(sql, /NOTIFY\s+pgrst,\s*'reload\s+schema'/i, "Must reload PostgREST schema cache");
    assert.match(sql, /GRANT ALL ON TABLE public\.prescription_items TO authenticated/i, "Must grant prescription_items to authenticated");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_digital_prescription_atomic/i, "Must define create_digital_prescription_atomic");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_waiting_queue_status_atomic/i, "Must define update_waiting_queue_status_atomic");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cancel_or_delete_ipd_admission_atomic/i, "Must define cancel_or_delete_ipd_admission_atomic");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_blood_transfusion_dossier_atomic/i, "Must define update_blood_transfusion_dossier_atomic");
    assert.match(sql, /p_permanent_delete\s+BOOLEAN/i, "Blood transfusion cancel/void must support permanent delete");
  });

  await t.test("2. lib/prescriptions/actions.ts calls create_digital_prescription_atomic", () => {
    const rxActionsPath = path.join(rootDir, "lib", "prescriptions", "actions.ts");
    const content = fs.readFileSync(rxActionsPath, "utf8");
    assert.match(content, /create_digital_prescription_atomic/, "Must call create_digital_prescription_atomic RPC");
  });

  await t.test("3. lib/appointments/actions.ts calls update_waiting_queue_status_atomic", () => {
    const apptActionsPath = path.join(rootDir, "lib", "appointments", "actions.ts");
    const content = fs.readFileSync(apptActionsPath, "utf8");
    assert.match(content, /update_waiting_queue_status_atomic/, "Must call update_waiting_queue_status_atomic RPC");
  });

  await t.test("4. lib/blood-bank/actions.ts supports permanent delete and dossier editing", () => {
    const bbActionsPath = path.join(rootDir, "lib", "blood-bank", "actions.ts");
    const content = fs.readFileSync(bbActionsPath, "utf8");
    assert.match(content, /permanentDelete/, "Must support permanentDelete parameter");
    assert.match(content, /updateBloodTransfusionDossierAction/, "Must export updateBloodTransfusionDossierAction");
  });

  await t.test("5. HalfLetterInvoicePrint.tsx includes compact demographics and delivery schedule", () => {
    const printPath = path.join(rootDir, "components", "print", "HalfLetterInvoicePrint.tsx");
    const content = fs.readFileSync(printPath, "utf8");
    assert.match(content, /Report Delivery Schedule/, "Must include delivery schedule");
    assert.match(content, /test receive/, "Must include test receive label");
    assert.match(content, /somvabbo delivery time/, "Must include somvabbo delivery time label");
    assert.match(content, /Address:/, "Must include Address in patient demographics");
  });
});
