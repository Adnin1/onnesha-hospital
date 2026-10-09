import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Patient Admission Pathways & Error Guards (Migration 128/130 & lib/patient/actions.ts)", () => {
  const mig128Path = path.join(
    ROOT,
    "supabase/migrations/20261009160000_permanent_unified_admission_and_episode_billing.sql"
  );
  const mig130Path = path.join(
    ROOT,
    "supabase/migrations/20261009180000_durable_billing_waivers_and_rpc_auth_hardening.sql"
  );
  const actionsPath = path.join(ROOT, "lib/patient/actions.ts");

  const mig128Sql = fs.readFileSync(mig128Path, "utf8");
  const mig130Sql = fs.readFileSync(mig130Path, "utf8");
  const actionsCode = fs.readFileSync(actionsPath, "utf8");

  test("migration 128 guarantees consultation_fee parity and bi-directional trigger synchronization", () => {
    assert.match(mig128Sql, /ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC\(10,\s*2\)\s+DEFAULT\s+800\.00/);
    assert.match(mig128Sql, /CREATE OR REPLACE FUNCTION public\.sync_doctor_fees\(\)/);
    assert.match(mig128Sql, /NEW\.consultation_fee := NEW\.opd_fee/);
    assert.match(mig128Sql, /NEW\.opd_fee := NEW\.consultation_fee/);
    assert.match(mig128Sql, /CREATE TRIGGER trg_sync_doctor_fees/);
  });

  test("atomic intake handles both existing patient ID and new patient registration", () => {
    assert.match(mig130Sql, /IF v_existing_patient_id IS NOT NULL THEN/);
    assert.match(mig130Sql, /SELECT id, patient_code, registration_serial/);
    assert.match(mig130Sql, /RAISE EXCEPTION 'PATIENT_NOT_FOUND';/);
    assert.match(mig130Sql, /ELSE[\s\S]*?INSERT INTO public\.patients/);
  });

  test("atomic intake validates and executes IPD Bed admission with row locking and status update", () => {
    assert.match(mig130Sql, /IF \(v_ipd->>'enabled'\)::BOOLEAN IS TRUE THEN/);
    assert.match(mig130Sql, /SELECT status, bed_number, daily_charge[\s\S]*?FROM public\.beds[\s\S]*?FOR UPDATE;/);
    assert.match(mig130Sql, /IF v_bed_status != 'VACANT' THEN\s+RAISE EXCEPTION 'BED_NOT_VACANT';/);
    assert.match(mig130Sql, /UPDATE public\.beds\s+SET status = 'OCCUPIED'/);
    assert.match(mig130Sql, /INSERT INTO public\.bed_assignments/);
  });

  test("atomic intake validates and executes IPD Cabin admission with row locking and status update", () => {
    assert.match(mig130Sql, /SELECT status, cabin_number, daily_charge[\s\S]*?FROM public\.cabins[\s\S]*?FOR UPDATE;/);
    assert.match(mig130Sql, /IF v_cabin_status != 'VACANT' THEN\s+RAISE EXCEPTION 'CABIN_NOT_VACANT';/);
    assert.match(mig130Sql, /UPDATE public\.cabins\s+SET status = 'OCCUPIED'/);
  });

  test("atomic intake validates and executes Critical Care (ICU/CCU/HDU) admission with ventilator flag", () => {
    assert.match(mig130Sql, /IF \(v_cc->>'enabled'\)::BOOLEAN IS TRUE THEN/);
    assert.match(mig130Sql, /SELECT is_active, daily_charge[\s\S]*?FROM public\.critical_care_units/);
    assert.match(mig130Sql, /IF v_unit_active IS NOT TRUE THEN\s+RAISE EXCEPTION 'CRITICAL_CARE_UNIT_INACTIVE';/);
    assert.match(mig130Sql, /SELECT id, status[\s\S]*?FROM public\.critical_care_beds[\s\S]*?FOR UPDATE;/);
    assert.match(mig130Sql, /IF v_cc_bed_id IS NOT NULL AND v_cc_bed_status != 'VACANT' THEN\s+RAISE EXCEPTION 'CRITICAL_CARE_BED_OCCUPIED';/);
    assert.match(mig130Sql, /UPDATE public\.critical_care_beds\s+SET status = 'OCCUPIED'/);
    assert.match(mig130Sql, /INSERT INTO public\.critical_care_admissions\s*\([\s\S]*?ventilator_required[\s\S]*?\)/);
  });

  test("atomic intake validates and executes OT surgery scheduling alongside admission", () => {
    assert.match(mig130Sql, /IF \(v_ot->>'enabled'\)::BOOLEAN IS TRUE THEN/);
    assert.match(mig130Sql, /INSERT INTO public\.ot_bookings\s*\([\s\S]*?procedure_name[\s\S]*?\)/);
    assert.match(mig130Sql, /v_ot_procedure/);
  });

  test("lib/patient/actions.ts maps database collision and authorization errors into readable user messages", () => {
    assert.match(actionsCode, /BED_NOT_VACANT/);
    assert.match(actionsCode, /The selected bed is already occupied or unavailable\. Please select another bed\./);
    assert.match(actionsCode, /CABIN_NOT_VACANT/);
    assert.match(actionsCode, /The selected cabin is already occupied or unavailable\. Please select another cabin\./);
    assert.match(actionsCode, /CRITICAL_CARE_BED_OCCUPIED/);
    assert.match(actionsCode, /The selected Critical Care bed is already occupied or unavailable\. Please select another bed\./);
    assert.match(actionsCode, /PERMISSION_DENIED_PATIENT_INTAKE/);
    assert.match(actionsCode, /You do not have permission to register or admit patients\./);
  });
});

describe("Patient 360 Dynamic Routing & Cache Shielding", () => {
  const detailPath = path.join(
    ROOT,
    "app/(hospital)/app/patients/[id]/PatientDetailView.tsx"
  );
  const detailCode = fs.readFileSync(detailPath, "utf8");
  const swPath = path.join(ROOT, "public/sw.js");
  const swCode = fs.readFileSync(swPath, "utf8");
  const redirectsPath = path.join(ROOT, "public/_redirects");
  const redirectsCode = fs.readFileSync(redirectsPath, "utf8");

  test("PatientDetailView resolves patient ID from searchParams, pathSlug, and route params without silent fallback", () => {
    assert.match(detailCode, /useSearchParams/);
    assert.match(detailCode, /window\.location\.pathname/);
    assert.match(detailCode, /const effectiveId = \(queryId && queryId\.trim\(\)\)/);
    assert.match(detailCode, /if \(effectiveId\) \{/);
    assert.match(detailCode, /const res = await getPatient360Action\(effectiveId\);/);
    assert.match(detailCode, /setError\(res\.error \|\| "Failed to load patient record\."\);/);
    // Explicit assertion: If effectiveId is present, the function returns and never calls directory list fallback
    assert.match(detailCode, /return;\s*\}\s*\/\/\s*2\.\s*Otherwise/);
  });

  test("PatientDetailView displays explicit Patient Record Unavailable screen on invalid or missing records", () => {
    assert.match(detailCode, /if \(error \|\| !patient\) \{/);
    assert.match(detailCode, /<h2 className="text-lg font-bold text-slate-900">Patient Record Unavailable<\/h2>/);
    assert.match(detailCode, /Back to Patient Registry/);
  });

  test("Cloudflare Pages _redirects rewrites /app/patients/* to /app/patients/preview 200 SPA entrypoint", () => {
    assert.match(redirectsCode, /\/app\/patients\/\*\s+\/app\/patients\/preview\s+200/);
  });

  test("Service Worker excludes all patient, billing, clinical, and authenticated app paths from caching", () => {
    assert.match(swCode, /\/\\\/app\(\\\/\|\$\)\//);
    assert.match(swCode, /\/patient\/i/);
    assert.match(swCode, /\/billing\/i/);
    assert.match(swCode, /\/clinical\/i/);
    assert.match(swCode, /\/invoice\/i/);
    assert.match(swCode, /function shouldNeverCache/);
  });
});

describe("5-Source Episode Billing & Durable Audited Waivers Ledger", () => {
  const mig128Path = path.join(
    ROOT,
    "supabase/migrations/20261009160000_permanent_unified_admission_and_episode_billing.sql"
  );
  const mig130Path = path.join(
    ROOT,
    "supabase/migrations/20261009180000_durable_billing_waivers_and_rpc_auth_hardening.sql"
  );
  const panelPath = path.join(ROOT, "components/patient/EpisodeBillingPanel.tsx");

  const mig128Sql = fs.readFileSync(mig128Path, "utf8");
  const mig130Sql = fs.readFileSync(mig130Path, "utf8");
  const panelCode = fs.readFileSync(panelPath, "utf8");

  test("get_episode_billing_overview aggregates all 5 revenue streams", () => {
    // 1. OPD Consultations
    assert.match(mig128Sql, /FROM public\.patient_visits pv/);
    assert.match(mig128Sql, /'OPD Consultation - '/);
    // 2. Bed & Cabin Stays
    assert.match(mig128Sql, /FROM public\.bed_assignments ba/);
    assert.match(mig128Sql, /'Bed Stay - '/);
    assert.match(mig128Sql, /'Cabin Stay - '/);
    // 3. Critical Care Unit Stays
    assert.match(mig128Sql, /FROM public\.critical_care_admissions cca/);
    assert.match(mig128Sql, /'Critical Care - '/);
    // 4. OT Procedures & Surgeries
    assert.match(mig128Sql, /FROM public\.ot_bookings ob/);
    assert.match(mig128Sql, /'OT Surgery - '/);
    // 5. Episode Service Charges (Medicines, Nursing, Tests, Custom)
    assert.match(mig128Sql, /FROM public\.episode_service_charges esc/);
  });

  test("migration 130 filters out active durable waivers from unbilled charges", () => {
    assert.match(
      mig130Sql,
      /AND NOT EXISTS \(\s*SELECT 1\s+FROM public\.episode_service_waivers w\s+WHERE w\.organization_id = p_org_id\s+AND w\.episode_id = v_episode_id\s+AND w\.reference_id = ob\.id\s+AND w\.status = 'ACTIVE'\s*\)/
    );
  });

  test("EpisodeBillingPanel renders single-line Stat component for unbilled total to satisfy golden tests", () => {
    assert.match(
      panelCode,
      /<Stat label="Current Unbilled" value=\{formatCurrencyBDT\(activeUnbilledTotal\)\}/
    );
  });
});
