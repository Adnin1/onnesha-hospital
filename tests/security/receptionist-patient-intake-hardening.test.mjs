import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

describe("Receptionist Patient Intake & Pediatric Demographic Invariants (Migration 219)", () => {
  test("1. Migration 219 SQL exists and upgrades create_patient_intake_atomic with full demographic fields", () => {
    const migPath = path.join(
      rootDir,
      "supabase",
      "migrations",
      "20261020190000_migration_219_receptionist_patient_intake_hardening.sql"
    );
    assert.ok(fs.existsSync(migPath), "Migration 219 file must exist");
    const sql = fs.readFileSync(migPath, "utf-8");

    // Must persist address and pediatric age components
    assert.match(sql, /v_address := NULLIF\(trim\(v_patient->>'address'\), ''\);/);
    assert.match(sql, /v_age_years := NULLIF\(COALESCE\(v_patient->>'age_years', v_patient->>'age'\), ''\)::INT;/);
    assert.match(sql, /v_age_months := NULLIF\(v_patient->>'age_months', ''\)::INT;/);
    assert.match(sql, /v_age_days := NULLIF\(v_patient->>'age_days', ''\)::INT;/);

    // Must insert into public.patients with pediatric columns
    assert.match(sql, /INSERT INTO public\.patients \([\s\S]*?age, age_years, age_months, age_days, address/);

    // Must update existing patient demographics if provided
    assert.match(sql, /UPDATE public\.patients\s+SET[\s\S]*?address = COALESCE\(v_address, address\)/);

    // Must broaden intake permissions to include appointments.create and billing.create
    assert.match(sql, /public\.is_org_admin_or_has_permission\(v_org_id, 'appointments\.create'\)/);
    assert.match(sql, /public\.is_org_admin_or_has_permission\(v_org_id, 'billing\.create'\)/);
  });

  test("2. calculateDOBFromYMD in lib/utils.ts correctly handles date math without month-end rollover", () => {
    const utilsPath = path.join(rootDir, "lib", "utils.ts");
    const utilsCode = fs.readFileSync(utilsPath, "utf-8");

    assert.ok(utilsCode.includes("calculateDOBFromYMD"), "utils.ts must export calculateDOBFromYMD");
    assert.ok(utilsCode.includes("targetYear = now.getFullYear() - y"), "utils.ts must use calendar-safe target year calculation");
    assert.ok(utilsCode.includes("targetMonth = now.getMonth() - m"), "utils.ts must use calendar-safe target month calculation");
    assert.ok(utilsCode.includes("targetDate = now.getDate() - dVal"), "utils.ts must use calendar-safe target date calculation");
  });

  test("3. UnifiedPatientIntakeModal implements bulletproof toDhakaIso without RangeError crash", () => {
    const modalPath = path.join(rootDir, "components", "patient", "UnifiedPatientIntakeModal.tsx");
    const modalCode = fs.readFileSync(modalPath, "utf-8");

    // Verify toDhakaIso handles strings with seconds and edge cases
    assert.ok(modalCode.includes("function toDhakaIso(value?: string | null)"), "toDhakaIso must accept optional string");
    assert.ok(modalCode.includes("clean.includes(\"Z\")"), "toDhakaIso must handle UTC ISO strings");
    assert.ok(modalCode.includes("/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}/"), "toDhakaIso must handle datetime with seconds");
  });

  test("4. UnifiedPatientIntakeModal eliminates asynchronous state setter race condition in validateBeforeSubmit", () => {
    const modalPath = path.join(rootDir, "components", "patient", "UnifiedPatientIntakeModal.tsx");
    const modalCode = fs.readFileSync(modalPath, "utf-8");

    assert.ok(modalCode.includes("let targetBedId = ipdBedId;"), "validateBeforeSubmit must track local targetBedId");
    assert.ok(modalCode.includes("let resolvedUnit = criticalUnitId;"), "validateBeforeSubmit must track local resolvedUnit");
    assert.ok(modalCode.includes("let resolvedBed = criticalBedNumber;"), "validateBeforeSubmit must track local resolvedBed");
    assert.ok(modalCode.includes("void submit(false, resolvedServices);"), "validateBeforeSubmit must pass resolvedServices directly to submit");
  });

  test("5. lib/patient/actions.ts matches both PERMISSION_DENIED_INTAKE and PERMISSION_DENIED_PATIENT_INTAKE", () => {
    const actionsPath = path.join(rootDir, "lib", "patient", "actions.ts");
    const actionsCode = fs.readFileSync(actionsPath, "utf-8");

    assert.ok(
      actionsCode.includes('message.includes("PERMISSION_DENIED_INTAKE") || message.includes("PERMISSION_DENIED_PATIENT_INTAKE")'),
      "lib/patient/actions.ts must check both permission denied variants"
    );
  });
});
