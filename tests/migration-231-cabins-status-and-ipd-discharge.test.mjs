import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("Migration 231: Cabins & Beds Status Check Constraints & IPD Discharge Hardening", async (t) => {
  const migrationPath = path.join(
    ROOT,
    "supabase",
    "migrations",
    "20261021170000_migration_231_fix_cabins_status_constraint_and_expense_permissions.sql"
  );

  await t.test("1. Migration 231 file exists and expands status check constraints", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration 231 file must exist");
    const content = fs.readFileSync(migrationPath, "utf8");

    // Must harmonize cabins_status_check
    assert.match(
      content,
      /ALTER\s+TABLE\s+public\.cabins\s+ADD\s+CONSTRAINT\s+cabins_status_check/i,
      "Migration 231 must re-create cabins_status_check"
    );
    assert.match(
      content,
      /VACANT.*AVAILABLE.*OCCUPIED.*CLEANING/s,
      "Migration 231 must accept both VACANT and AVAILABLE in cabins check constraint"
    );

    // Must harmonize beds_status_check
    assert.match(
      content,
      /ALTER\s+TABLE\s+public\.beds\s+ADD\s+CONSTRAINT\s+beds_status_check/i,
      "Migration 231 must re-create beds_status_check"
    );

    // Must harmonize bed_assignments_status_check
    assert.match(
      content,
      /ALTER\s+TABLE\s+public\.bed_assignments\s+ADD\s+CONSTRAINT\s+bed_assignments_status_check/i,
      "Migration 231 must re-create bed_assignments_status_check"
    );

    // Must set VACANT in trigger function
    assert.match(
      content,
      /UPDATE\s+public\.cabins\s+SET\s+status\s*=\s*'VACANT'/i,
      "Migration 231 trigger must set status = 'VACANT'"
    );

    // Must allow expenses.create permission in record_hospital_expense_atomic
    assert.match(
      content,
      /'expenses\.create'/i,
      "Migration 231 must check expenses.create in record_hospital_expense_atomic"
    );
  });

  await t.test("2. lib/patient/actions.ts adheres to canonical assignment and bed statuses", () => {
    const actionPath = path.join(ROOT, "lib", "patient", "actions.ts");
    const content = fs.readFileSync(actionPath, "utf8");

    // Bed assignments must be VACATED
    assert.match(
      content,
      /status:\s*"VACATED",\s*vacated_at:/,
      "dischargePatientAction must set bed_assignments status to VACATED"
    );

    // Transferred bed must be CLEANING or CLEANING_REQUIRED
    assert.match(
      content,
      /update\(\{\s*status:\s*"CLEANING(_REQUIRED)?"\s*\}\)/,
      "transferPatientAction must set bed status to CLEANING or CLEANING_REQUIRED"
    );
  });
});
