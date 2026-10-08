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
    assert.match(c, /setBeds\(\((bedRes\.value\.data|bedRes\.data) as unknown/);
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
  });

  test("migration 116 repairs updated_at, registration serial, and episode service charges", () => {
    const p = path.join(ROOT, "supabase/migrations/20261008010000_repair_patients_updated_at_and_serial.sql");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
    assert.match(c, /registration_serial TEXT/);
    assert.match(c, /admission_discount_amount NUMERIC\(12,2\)/);
    assert.match(c, /CREATE TABLE IF NOT EXISTS public\.episode_service_charges/);
    assert.match(c, /FUNCTION public\.add_episode_service_charge_atomic/);
    assert.match(c, /FUNCTION public\.edit_episode_service_charge_atomic/);
    assert.match(c, /FUNCTION public\.delete_episode_service_charge_atomic/);
    assert.match(c, /FUNCTION public\.create_patient_intake_atomic/);
    assert.match(c, /FUNCTION public\.get_episode_billing_preview/);
    assert.match(c, /FUNCTION public\.create_episode_settlement_invoice_atomic/);
  });

  test("billing management page mounts EpisodeBillingPanel for seamless workflow", () => {
    const p = path.join(ROOT, "app/(hospital)/app/billing/page.tsx");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /import\s*\{\s*EpisodeBillingPanel\s*\}\s*from\s*["']@\/components\/patient\/EpisodeBillingPanel["']/);
    assert.match(c, /<EpisodeBillingPanel/);
  });

  test("EpisodeBillingPanel supports extra service ledger, discounts, and discharge", () => {
    const p = path.join(ROOT, "components/patient/EpisodeBillingPanel.tsx");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /addEpisodeServiceChargeAction/);
    assert.match(c, /editEpisodeServiceChargeAction/);
    assert.match(c, /deleteEpisodeServiceChargeAction/);
    assert.match(c, /prepareEpisodeSettlementAction/);
    assert.match(c, /completeEpisodeDischargeAction/);
    assert.match(c, /searchPatientsAction/);
  });

  test("migration 117 hardens billing integrity, overview RPC, and atomic v2 discharge", () => {
    const p = path.join(ROOT, "supabase/migrations/20261008030000_episode_billing_integrity_and_discharge_hardening.sql");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /FUNCTION public\.get_episode_billing_overview/);
    assert.match(c, /FUNCTION public\.create_episode_settlement_invoice_atomic_v2/);
    assert.match(c, /FUNCTION public\.complete_episode_discharge_atomic_v2/);
  });

  test("migration 118 introduces critical care bed binding, bmdc ethics, and referral analytics", () => {
    const p = path.join(ROOT, "supabase/migrations/20261008050000_referral_performance_and_critical_care_authority.sql");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /critical_care_unit_id/);
    assert.match(c, /bmdc_ethics_acknowledged/);
    assert.match(c, /FUNCTION public\.get_referral_performance_analytics/);
    assert.match(c, /FUNCTION public\.get_referral_agents_safe_directory/);
  });

  test("UnifiedPatientIntakeModal guarantees resilient submission and decoupling from option lookups", () => {
    const p = path.join(ROOT, "components/patient/UnifiedPatientIntakeModal.tsx");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /finally\s*\{\s*setSubmitting\(false\);\s*\}/);
    assert.doesNotMatch(c, /disabled=\{\s*submitting\s*\|\|\s*loadingOptions\s*\}/);
  });

  test("migration 120 strictly scopes current episode billing history and separates lifetime totals", () => {
    const p = path.join(ROOT, "supabase/migrations/20261008120000_billing_history_scoping_and_financial_integrity.sql");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /current_episode_invoiced/);
    assert.match(c, /current_episode_paid/);
    assert.match(c, /current_episode_due/);
    assert.match(c, /lifetime_invoiced/);
    assert.match(c, /lifetime_paid/);
    assert.match(c, /lifetime_due/);
  });

  test("dischargePatientAction releases both bed and cabin assignments to VACANT", () => {
    const p = path.join(ROOT, "lib/patient/actions.ts");
    const c = fs.readFileSync(p, "utf8");
    assert.match(c, /if\s*\(bedAssign\.cabin_id\)\s*\{\s*await supabase\s*\.from\("cabins"\)\s*\.update\(\{\s*status:\s*"VACANT"\s*\}\)/);
  });
});

