import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20261022210945_migration_259_fix_referral_payout_null_patient_record.sql",
  "utf8"
);
const intake = fs.readFileSync("components/patient/UnifiedPatientIntakeModal.tsx", "utf8");

test("referral payout does not dereference an unassigned patient RECORD", () => {
  assert.doesNotMatch(migration, /v_patient\s+RECORD/i);
  assert.doesNotMatch(migration, /v_patient\.full_name/i);
  assert.doesNotMatch(migration, /v_patient\.patient_code/i);
  assert.match(migration, /v_patient_name\s+TEXT\s*:=\s*NULL/i);
  assert.match(migration, /v_patient_code\s+VARCHAR\s*:=\s*NULL/i);
});

test("patient-scoped payout validates patient existence while discretionary payout permits null patient", () => {
  assert.match(migration, /IF p_patient_id IS NOT NULL THEN/i);
  assert.match(migration, /Patient not found in active organization\./i);
  assert.match(migration, /'patient_name',\s*v_patient_name/i);
  assert.match(migration, /'patient_code',\s*v_patient_code/i);
});

test("patient intake exposes searchable referral-agent combobox", () => {
  assert.match(intake, /referralSearchQuery/);
  assert.match(intake, /filteredReferralAgents/);
  assert.match(intake, /নাম বা কোড দিয়ে রেফারেল এজেন্ট খুঁজুন/);
  assert.match(intake, /role="combobox"/);
  assert.match(intake, /Direct Patient/);
});

test("patient intake diagnostic catalog remains searchable", () => {
  assert.match(intake, /diagnosticSearchQuery/);
  assert.match(intake, /filteredDiagnosticTests/);
  assert.match(intake, /টেস্ট সার্চ করুন/);
  assert.match(intake, /CBC/);
  assert.match(intake, /USG/);
});
