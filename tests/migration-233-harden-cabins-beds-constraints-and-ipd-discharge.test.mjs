import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Migration 233: Harden Cabins & Beds Constraints, IPD Discharge, and Admission Deletion", async (t) => {
  const migrationPath = path.join(
    ROOT,
    "supabase",
    "migrations",
    "20261021190000_migration_233_harden_ipd_discharge_and_cabins_constraints.sql"
  );

  await t.test("1. Migration 233 file exists and enforces case-insensitive status constraints", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration 233 file must exist");
    const content = fs.readFileSync(migrationPath, "utf8");

    // Must harmonize cabins_status_check with UPPER(status)
    assert.match(
      content,
      /ALTER\s+TABLE\s+public\.cabins\s+ADD\s+CONSTRAINT\s+cabins_status_check\s+CHECK\s*\(\s*UPPER\s*\(\s*status\s*\)\s+IN/i,
      "Migration 233 must re-create cabins_status_check with UPPER(status)"
    );
    assert.match(
      content,
      /VACANT.*AVAILABLE.*OCCUPIED.*CLEANING.*MAINTENANCE.*VACATED.*DISCHARGED.*CANCELLED/s,
      "Migration 233 cabins constraint must include all clinical and operational statuses"
    );

    // Must harmonize beds_status_check with UPPER(status)
    assert.match(
      content,
      /ALTER\s+TABLE\s+public\.beds\s+ADD\s+CONSTRAINT\s+beds_status_check\s+CHECK\s*\(\s*UPPER\s*\(\s*status\s*\)\s+IN/i,
      "Migration 233 must re-create beds_status_check with UPPER(status)"
    );

    // Must harmonize bed_assignments_status_check with UPPER(status)
    assert.match(
      content,
      /ALTER\s+TABLE\s+public\.bed_assignments\s+ADD\s+CONSTRAINT\s+bed_assignments_status_check\s+CHECK\s*\(\s*UPPER\s*\(\s*status\s*\)\s+IN/i,
      "Migration 233 must re-create bed_assignments_status_check with UPPER(status)"
    );

    // Must grant execute on reconcile_bed_vacancy_drift_atomic to authenticated
    assert.match(
      content,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.reconcile_bed_vacancy_drift_atomic\(UUID\)\s+TO\s+authenticated/i,
      "Migration 233 must grant execute on reconcile_bed_vacancy_drift_atomic to authenticated"
    );

    // Must grant execute on cancel_or_delete_ipd_admission_atomic to authenticated
    assert.match(
      content,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.cancel_or_delete_ipd_admission_atomic/i,
      "Migration 233 must grant execute on cancel_or_delete_ipd_admission_atomic to authenticated"
    );

    // Must grant execute on complete_ipd_discharge_atomic to authenticated
    assert.match(
      content,
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.complete_ipd_discharge_atomic/i,
      "Migration 233 must grant execute on complete_ipd_discharge_atomic to authenticated"
    );
  });

  await t.test("2. Actions safely wrap secondary vacancy reconciliation", () => {
    const patientActions = fs.readFileSync(path.join(ROOT, "lib", "patient", "actions.ts"), "utf8");
    assert.match(
      patientActions,
      /\[dischargePatientAction\] Drift reconciliation notice/,
      "dischargePatientAction must safely handle drift reconciliation notice"
    );
    assert.match(
      patientActions,
      /\[cancelOrDeleteIpdAdmissionAction\] Drift reconciliation notice/,
      "cancelOrDeleteIpdAdmissionAction must safely handle drift reconciliation notice"
    );

    const bedActions = fs.readFileSync(path.join(ROOT, "lib", "ipd", "bed-actions.ts"), "utf8");
    assert.match(
      bedActions,
      /updateFields\.status = "AVAILABLE"/,
      "updateCabinDetailsAction must set uppercase AVAILABLE"
    );
  });
});
