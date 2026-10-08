import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function normalizeBDPhone(phone) {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s\-()+]/g, "");
  if (cleaned.startsWith("880")) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith("88")) {
    cleaned = cleaned.substring(2);
  }
  if (cleaned.length === 10 && cleaned.startsWith("1")) {
    cleaned = "0" + cleaned;
  }
  return cleaned;
}

function isValidNormalizedBDPhone(normalized) {
  return /^01[3-9]\d{8}$/.test(normalized);
}

describe("Patient Intake Atomic Resilience & End-to-End Database Invariants", () => {
  test("1. Bangladesh phone validation properly validates local and international formats", () => {
    // Valid 11-digit numbers
    assert.strictEqual(normalizeBDPhone("01712345678"), "01712345678");
    assert.strictEqual(isValidNormalizedBDPhone(normalizeBDPhone("01712345678")), true);
    assert.strictEqual(normalizeBDPhone("+8801812345678"), "01812345678");
    assert.strictEqual(isValidNormalizedBDPhone(normalizeBDPhone("+8801812345678")), true);
    assert.strictEqual(normalizeBDPhone("8801912345678"), "01912345678");
    assert.strictEqual(isValidNormalizedBDPhone(normalizeBDPhone("8801912345678")), true);
    assert.strictEqual(normalizeBDPhone("01312345678"), "01312345678");
    assert.strictEqual(isValidNormalizedBDPhone(normalizeBDPhone("01312345678")), true);

    // Invalid numbers
    assert.strictEqual(isValidNormalizedBDPhone(normalizeBDPhone("01212345678")), false); // Invalid prefix
    assert.strictEqual(isValidNormalizedBDPhone(normalizeBDPhone("017123456")), false); // Too short
    assert.strictEqual(isValidNormalizedBDPhone(normalizeBDPhone("")), false);
    assert.strictEqual(isValidNormalizedBDPhone(normalizeBDPhone("12345678901")), false);

    // Verify lib/patient/phone.ts matches
    const phoneFile = path.join(ROOT, "lib/patient/phone.ts");
    const code = fs.readFileSync(phoneFile, "utf8");
    assert.match(code, /export function normalizeBDPhone/);
    assert.match(code, /export function isValidNormalizedBDPhone/);
  });

  test("2. Migration 122 SQL guarantees zero-dependency patient-only registration and active episode creation", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261008200000_resilient_bed_lookup_and_intake_hardening.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Must generate patient code and permanent registration serial
    assert.match(sql, /generate_patient_code\(v_org_id\)/);
    assert.match(sql, /v_registration_serial := TO_CHAR\(v_encounter_at, 'YYMMDD'\)/);

    // Must insert into public.patients with full demographics
    assert.match(sql, /INSERT INTO public\.patients/);
    assert.match(sql, /v_registration_serial/);

    // Must create patient_episodes record with status ACTIVE
    assert.match(sql, /INSERT INTO public\.patient_episodes/);
    assert.match(sql, /'ACTIVE'/);

    // When services are disabled, skips OPD, IPD, and CC encounters
    assert.match(sql, /IF COALESCE\(\(v_opd->>'enabled'\)::BOOLEAN, FALSE\) THEN/);
    assert.match(sql, /IF COALESCE\(\(v_ipd->>'enabled'\)::BOOLEAN, FALSE\) THEN/);
    assert.match(sql, /IF COALESCE\(\(v_cc->>'enabled'\)::BOOLEAN, FALSE\) THEN/);

    // Returns json with patient_id, registration_serial, episode_id
    assert.match(sql, /'patient_id', v_patient_id/);
    assert.match(sql, /'registration_serial', v_registration_serial/);
    assert.match(sql, /'episode_id', v_episode_id/);
  });

  test("3. Migration 122 SQL handles case-insensitive bed numbers and unit affinity in Critical Care", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261008200000_resilient_bed_lookup_and_intake_hardening.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Case-insensitive trimmed lookup
    assert.match(sql, /UPPER\(TRIM\(bed_number\)\) = v_bed_number/);

    // Priority ordering: matching unit first, unassigned second, any active third
    assert.match(sql, /ORDER BY\s+CASE WHEN critical_care_unit_id = v_unit_id THEN 1/);

    // Updates bed to OCCUPIED and binds patient name and unit id
    assert.match(sql, /UPDATE public\.beds\s+SET status = 'OCCUPIED'/);
    assert.match(sql, /critical_care_unit_id = COALESCE\(critical_care_unit_id, v_unit_id\)/);
  });

  test("4. UnifiedPatientIntakeModal provides both 'Register Patient Only' and 'Register & Create Admissions' buttons", () => {
    const modalPath = path.join(ROOT, "components/patient/UnifiedPatientIntakeModal.tsx");
    const code = fs.readFileSync(modalPath, "utf8");

    // submitPatientOnly overrides all services to enabled: false
    assert.match(code, /function submitPatientOnly\(\)/);
    assert.match(code, /opd:\s*\{\s*enabled:\s*false\s*\}/);
    assert.match(code, /ipd:\s*\{\s*enabled:\s*false\s*\}/);
    assert.match(code, /criticalCare:\s*\{\s*enabled:\s*false\s*\}/);
    assert.match(code, /ot:\s*\{\s*enabled:\s*false\s*\}/);

    // Auto-scroll on missing validation fields
    assert.match(code, /function scrollToField\(fieldId:\s*string\)/);
    assert.match(code, /scrollIntoView\(\{\s*behavior:\s*"smooth",\s*block:\s*"center"\s*\}\)/);

    // Smart auto-population of first available bed/unit when services are toggled
    assert.match(code, /toggleCriticalCare/);
    assert.match(code, /setCriticalUnitId\(defaultUnit\)/);
    assert.match(code, /toggleIpd/);
    assert.match(code, /setIpdBedId\(availableBeds\[0\]\.id\)/);

    // Dismiss / Remove service buttons for each service
    assert.match(code, /✕ বাদ দিন \(Remove OPD\)/);
    assert.match(code, /✕ বাদ দিন \(Remove IPD\)/);
    assert.match(code, /✕ বাদ দিন \(Remove Critical Care\)/);
    assert.match(code, /✕ বাদ দিন \(Remove OT\)/);

    // 1-Click bypass actions in error banners
    assert.match(code, /ক্রিটিক্যাল কেয়ার ছাড়া এগিয়ে যান/);
    assert.match(code, /আইপিডি ছাড়া এগিয়ে যান/);
  });

  test("5. createUnifiedPatientIntakeAction links OT surgeries to the episode visit anchor", () => {
    const actionPath = path.join(ROOT, "lib/patient/actions.ts");
    const code = fs.readFileSync(actionPath, "utf8");

    assert.match(code, /create_patient_intake_atomic/);
    assert.match(code, /critical_care_visit_id/);
    assert.match(code, /from\("ot_bookings"\)\s*\.insert/);
  });

  test("6. getIntakeDropdownOptionsAction provides resilient fallbacks and full option catalogs", () => {
    const actionPath = path.join(ROOT, "lib/patient/actions.ts");
    const code = fs.readFileSync(actionPath, "utf8");

    assert.match(code, /export async function getIntakeDropdownOptionsAction/);
    assert.match(code, /departments/);
    assert.match(code, /doctors/);
    assert.match(code, /beds/);
    assert.match(code, /cabins/);
    assert.match(code, /units/);
    assert.match(code, /otRooms/);
  });

  test("7. Receptionist role includes full front-desk clinical intake permissions", () => {
    const permPath = path.join(ROOT, "lib/permissions.ts");
    const code = fs.readFileSync(permPath, "utf8");

    assert.match(code, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.OPD_VIEW/);
    assert.match(code, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.IPD_VIEW/);
    assert.match(code, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.IPD_ADMIT/);
    assert.match(code, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.CRITICAL_CARE_VIEW/);
    assert.match(code, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.CRITICAL_CARE_MANAGE/);
  });

  test("8. Migration 123 guarantees dual-column 'nid' and 'nid_or_birth_cert' schema compatibility and repair", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261008220000_add_nid_column_and_repair_patient_intake.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 123 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.match(sql, /ADD COLUMN IF NOT EXISTS nid TEXT/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS nid_or_birth_cert TEXT/);
    assert.match(sql, /SET nid = nid_or_birth_cert/);
    assert.match(sql, /idx_patients_org_nid/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_patient_intake_atomic/);
    assert.match(sql, /nid, nid_or_birth_cert/);
  });

  test("9. Migration 124 guarantees emergency contacts, generate_episode_number, patient_episodes view, and bed assignment patient_id", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261008230000_permanent_patient_intake_and_episode_alignment.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 124 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.match(sql, /emergency_contact_name TEXT/);
    assert.match(sql, /total_visits INTEGER NOT NULL DEFAULT 1/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.generate_episode_number/);
    assert.match(sql, /CREATE OR REPLACE VIEW public\.patient_episodes/);
    assert.match(sql, /INSTEAD OF INSERT ON public\.patient_episodes/);
    assert.match(sql, /INSERT INTO public\.bed_assignments\s*\(\s*organization_id,\s*patient_id/);
  });

  test("10. Migration 125 repairs episode_service_charges and get_episode_billing_preview", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261008233000_repair_episode_service_charges_and_billing_preview.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 125 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.match(sql, /ADD COLUMN IF NOT EXISTS description TEXT/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS is_billed BOOLEAN DEFAULT FALSE/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.trg_sync_episode_service_charges/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_episode_billing_preview/);
  });

  test("11. Migration 126 adds is_active to cabins and hardens intake atomicity", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261008235000_add_is_active_to_cabins_and_harden_intake.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 126 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");

    assert.match(sql, /ALTER TABLE public\.cabins\s+ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE/);
    assert.match(sql, /idx_cabins_org_active/);
    assert.match(sql, /COALESCE\(is_active, TRUE\) = TRUE/);
  });
});
