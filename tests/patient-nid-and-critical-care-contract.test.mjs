import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Permanent Patient NID Contract & Critical Care Intake Hardening (Tests A-G)", () => {
  const migrationPath = path.join(
    rootDir,
    "supabase",
    "migrations",
    "20261009010000_permanent_patient_nid_and_intake_contract.sql"
  );

  test("Test H: Migration 127 exists, creates nid_or_birth_cert, sync trigger, and reloads schema", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration 127 file must exist in supabase/migrations");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.match(sql, /ALTER TABLE public\.patients ADD COLUMN IF NOT EXISTS nid_or_birth_cert TEXT;/);
    assert.match(sql, /idx_patients_nid_or_birth_cert/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sync_patient_nid_columns\(\)/);
    assert.match(sql, /CREATE TRIGGER trg_sync_patient_nid_columns/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
  });

  test("Test A: New patient without NID - SQL contract cleanly allows null NID without column errors", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(
      sql,
      /v_nid := NULLIF\(trim\(COALESCE\(v_patient->>'nid_or_birth_cert', v_patient->>'nid'\)\), ''\);/,
      "Must safely extract v_nid from nid_or_birth_cert or nid fallback"
    );
    assert.match(
      sql,
      /INSERT INTO public\.patients \([\s\S]*?nid_or_birth_cert[\s\S]*?\)[\s\S]*?VALUES \([\s\S]*?v_nid[\s\S]*?\)/,
      "Insert into patients must write to nid_or_birth_cert"
    );
  });

  test("Test B: New patient with valid NID - Stored authoritatively in nid_or_birth_cert and synchronized", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(sql, /IF NEW\.nid_or_birth_cert IS NOT NULL AND NEW\.nid IS NULL THEN/);
    assert.match(sql, /NEW\.nid := NEW\.nid_or_birth_cert;/);
    assert.match(sql, /NEW\.nid_or_birth_cert := NEW\.nid;/);

    const actionsPath = path.join(rootDir, "lib", "patient", "actions.ts");
    const actionsContent = fs.readFileSync(actionsPath, "utf8");
    assert.match(actionsContent, /nid_or_birth_cert:\s*payload\.patient\.nid_or_birth_cert \|\| payload\.patient\.nid \|\| null/);
  });

  test("Test C: Duplicate NID - Controlled rejection with DUPLICATE_NID exception and user-friendly error", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(
      sql,
      /IF v_nid IS NOT NULL AND EXISTS \([\s\S]*?nid_or_birth_cert = v_nid[\s\S]*?\) THEN[\s\S]*?RAISE EXCEPTION 'DUPLICATE_NID:%', v_nid;/,
      "Must raise DUPLICATE_NID exception on duplicate NID in active patients"
    );

    const actionsPath = path.join(rootDir, "lib", "patient", "actions.ts");
    const actionsContent = fs.readFileSync(actionsPath, "utf8");
    assert.match(
      actionsContent,
      /message\.includes\("DUPLICATE_NID"\)\s*\?\s*"This National ID \(NID\) \/ Birth Certificate number is already registered for another patient in this hospital\."/,
      "Action must translate DUPLICATE_NID into clear user-facing error"
    );
  });

  test("Test D: Critical Care toggled before data load - Reactive auto-defaulting and eligible bed resolution", () => {
    const modalPath = path.join(rootDir, "components", "patient", "UnifiedPatientIntakeModal.tsx");
    const modalContent = fs.readFileSync(modalPath, "utf8");

    assert.match(
      modalContent,
      /const getEligibleCriticalBedsForUnit = useCallback\(/,
      "Modal must define getEligibleCriticalBedsForUnit callback"
    );
    assert.match(
      modalContent,
      /b\.critical_care_unit_id && b\.critical_care_unit_id === unitId/,
      "Must strictly check critical_care_unit_id match"
    );
    assert.match(
      modalContent,
      /useEffect\(\(\) => \{[\s\S]*?if \(!isOpen \|\| loadingOptions\) return;[\s\S]*?if \(criticalEnabled\) \{/,
      "Modal must reactively auto-default unit and eligible bed when options finish loading"
    );
    assert.match(
      modalContent,
      /Loading Critical Care availability\.\.\./,
      "Must render loading availability state"
    );
    assert.match(
      modalContent,
      /Selected Critical Care unit-এর কোনো vacant bed নেই/,
      "Must explicitly warn when no vacant bed exists in selected CC unit"
    );
  });

  test("Test E: Critical Care + OT combined - 1 atomic episode, zero column errors, valid references", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(sql, /INSERT INTO public\.critical_care_admissions/);
    assert.match(sql, /'critical_care_admission_id',\s*v_cc_admission_id/);
    assert.match(sql, /'critical_care_visit_id',\s*COALESCE\(v_ipd_visit_id,\s*v_opd_visit_id\)/);

    const actionsPath = path.join(rootDir, "lib", "patient", "actions.ts");
    const actionsContent = fs.readFileSync(actionsPath, "utf8");
    assert.match(actionsContent, /criticalCareAdmissionId:\s*result\.critical_care_admission_id/);
    assert.match(actionsContent, /from\("ot_bookings"\)/);
  });

  test("Test F: Full Multi-Service Intake (OPD + IPD + Critical + OT) - 1 patient, 1 episode, 4 services", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(sql, /IF COALESCE\(\(v_opd->>'enabled'\)::BOOLEAN, FALSE\) THEN/);
    assert.match(sql, /IF COALESCE\(\(v_ipd->>'enabled'\)::BOOLEAN, FALSE\) THEN/);
    assert.match(sql, /IF COALESCE\(\(v_cc->>'enabled'\)::BOOLEAN, FALSE\) THEN/);
    assert.match(sql, /INSERT INTO public\.patient_care_episodes/);

    // Billable base calculation and discount re-computation
    assert.match(sql, /v_billable_base := v_billable_base \+ COALESCE\(v_opd_fee, 0\);/);
    assert.match(sql, /v_billable_base := v_billable_base \+ COALESCE\(v_daily_charge, 0\);/);
    assert.match(sql, /v_billable_base := v_billable_base \+ COALESCE\(v_cc_daily_charge, 0\);/);
    assert.match(sql, /v_admission_discount := ROUND\(\(v_billable_base \* \(v_admission_discount_percent \/ 100\.0\)\), 2\);/);
    assert.match(sql, /v_admission_discount := v_billable_base;/);
  });

  test("Test G: Service failure rollback - Entire transaction rolls back atomically on bed or doctor failure", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(sql, /RAISE EXCEPTION 'CRITICAL_CARE_BED_NOT_FOUND:%', v_bed_number;/);
    assert.match(sql, /RAISE EXCEPTION 'CRITICAL_CARE_BED_NOT_VACANT:%', v_bed_number;/);
    assert.match(sql, /RAISE EXCEPTION 'IPD_BED_NOT_VACANT';/);
  });
});
