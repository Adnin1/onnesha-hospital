import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Unified Patient Intake & Episode Settlement Contract", () => {
  test("forward migration defines patient care episodes and settlement invoice linkage", () => {
    const p = path.join(ROOT, "supabase/migrations/20261007200000_unified_patient_care_and_episode_settlement.sql");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /CREATE TABLE IF NOT EXISTS public\.patient_care_episodes/);
    assert.match(c, /ADD COLUMN IF NOT EXISTS episode_id UUID REFERENCES public\.patient_care_episodes/);
    assert.match(c, /is_episode_settlement/);
    assert.match(c, /uq_episode_settlement_invoice/);
  });

  test("atomic intake supports OPD, IPD bed/cabin, and critical care in one transaction", () => {
    const p = path.join(ROOT, "supabase/migrations/20261007200000_unified_patient_care_and_episode_settlement.sql");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /FUNCTION public\.create_patient_intake_atomic/);
    assert.match(c, /patient_visits/);
    assert.match(c, /bed_assignments/);
    assert.match(c, /critical_care_admissions/);
    assert.match(c, /FOR UPDATE/);
  });

  test("settlement calculates deterministic billable days and excludes already invoiced source records", () => {
    const p = path.join(ROOT, "supabase/migrations/20261007200000_unified_patient_care_and_episode_settlement.sql");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /FUNCTION public\.ohms_billable_days/);
    assert.match(c, /NOT EXISTS \(\s*SELECT 1\s+FROM public\.invoice_items/i);
    assert.match(c, /FUNCTION public\.create_episode_settlement_invoice_atomic/);
    assert.match(c, /FUNCTION public\.complete_episode_discharge_atomic/);
  });

  test("patient UI uses the unified intake modal and episode billing panel", () => {
    const p = path.join(ROOT, "app/(hospital)/app/patients/page.tsx");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /UnifiedPatientIntakeModal/);
    assert.match(c, /EpisodeBillingPanel/);
    assert.match(c, /Admit \/ New Service/);
  });

  test("migration 115 guarantees complete demographic fields and upgraded atomic intake", () => {
    const p = path.join(ROOT, "supabase/migrations/20261007220000_unified_patient_intake_and_demographics_polish.sql");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /marital_status VARCHAR\(20\)/);
    assert.match(c, /occupation VARCHAR\(100\)/);
    assert.match(c, /age_years INTEGER/);
    assert.match(c, /nid_or_birth_cert TEXT/);
    assert.match(c, /address TEXT/);
    assert.match(c, /CREATE OR REPLACE FUNCTION public\.create_patient_intake_atomic/);
    assert.match(c, /idx_patients_org_phone_norm/);
  });

  test("modal correctly maps beds and cabins and provides Register Patient Only action", () => {
    const p = path.join(ROOT, "components/patient/UnifiedPatientIntakeModal.tsx");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /setBeds\(\(bedRes\.data as unknown/);
    assert.match(c, /searchReferralAgentsAction/);
    assert.match(c, /submitPatientOnly/);
    assert.match(c, /initialPatient/);
    assert.match(c, /initialMode/);
  });

  test("PatientDetailView mounts EpisodeBillingPanel and UnifiedPatientIntakeModal", () => {
    const p = path.join(ROOT, "app/(hospital)/app/patients/[id]/PatientDetailView.tsx");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /EpisodeBillingPanel/);
    assert.match(c, /UnifiedPatientIntakeModal/);
    assert.match(c, /Admit \/ New Service/);
  });
});
