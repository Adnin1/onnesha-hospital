import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

test("OHMS Post-UAT Acceptance Hardening Certification (Doctor, Bed, IPD, Referral)", async (t) => {
  // 1. Migration 173 Schema Integrity
  await t.test("1. Migration 173 alters doctor/cabin columns and provides atomic snapshot & payout functions", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261013050000_doctor_bed_ipd_referral_integrity_hardening.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 173 file must exist");
    const content = fs.readFileSync(migrationPath, "utf8");

    // Doctor & Cabin schema changes
    assert.match(content, /ALTER TABLE public\.doctors\s+ALTER COLUMN bmdc_reg_number DROP NOT NULL/i);
    assert.match(content, /ALTER TABLE public\.doctors\s+ALTER COLUMN phone DROP NOT NULL/i);
    assert.match(content, /ALTER TABLE public\.cabins\s+ALTER COLUMN floor_number DROP DEFAULT/i);

    // IPD snapshot fields
    assert.match(content, /admission_fee_snapshot/i);
    assert.match(content, /daily_service_rate_snapshot/i);

    // Atomic Discretionary Payout RPC
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.record_discretionary_referral_payout_atomic/i);
    assert.match(content, /EXP-MARKETING/i);
    assert.match(content, /VOUCHER-/i);
    assert.match(content, /SETTLE-/i);
  });

  // 2. Block A: Doctor BMDC & Dept Resolution
  await t.test("2. lib/appointments/actions.ts persists blank BMDC as null and resolves same-org department", () => {
    const doctorActionsPath = path.join(ROOT, "lib/appointments/actions.ts");
    const content = fs.readFileSync(doctorActionsPath, "utf8");

    // BMDC null persistence (never BMDC-N/A)
    assert.match(content, /bmdc_reg_number:\s*params\.bmdcRegNumber\?\.trim\(\)\s*\|\|\s*null/);
    assert.doesNotMatch(content, /"BMDC-N\/A"/);

    // Same-org department lookup with safe creation
    assert.match(content, /\.eq\("organization_id",\s*session\.organizationId\)/);
    assert.match(content, /General Medicine/);

    // Collision-safe doctor code
    assert.match(content, /DOC-\${specPrefix}-\${dateStr}-\${rand}/);
  });

  // 3. Block B: Bed/Cabin Multi-Tenant Safety & Floor Optionality
  await t.test("3. lib/ipd/bed-actions.ts enforces same-org ward lookup and components/beds/AddBedOrCabinModal respects optional floor", () => {
    const bedActionsPath = path.join(ROOT, "lib/ipd/bed-actions.ts");
    const modalPath = path.join(ROOT, "components/beds/AddBedOrCabinModal.tsx");

    const bedContent = fs.readFileSync(bedActionsPath, "utf8");
    const modalContent = fs.readFileSync(modalPath, "utf8");

    // Bed actions: same-org ward lookup only (no cross-org anyWard)
    assert.doesNotMatch(bedContent, /const \{ data: anyWard \}/);
    assert.match(bedContent, /\.eq\("organization_id", orgId\)/);
    assert.match(bedContent, /General Ward/);

    // Authoritative persisted ward_id and daily_rate
    assert.match(bedContent, /const persistedWardId = \(inserted as \{ ward_id\?: string \}\)\.ward_id \|\| resolvedWardId/);
    assert.match(bedContent, /const persistedDailyRate = Number\(\(inserted as \{ daily_rate\?: number \}\)\.daily_rate \?\? payload\.daily_rate\)/);

    // Cabin floor optionality
    assert.match(modalContent, /floor_number: floorNumber\.trim\(\) \|\| undefined/);
    assert.match(bedContent, /floor_number: payload\.floor_number\?\.trim\(\) \|\| null/);
  });

  // 4. Block C: IPD Admission Snapshot Persistence
  await t.test("4. lib/patient/actions.ts persists admission fee and daily service rate snapshots", () => {
    const patientActionsPath = path.join(ROOT, "lib/patient/actions.ts");
    const content = fs.readFileSync(patientActionsPath, "utf8");

    // Defaults and custom snapshot derivation
    assert.match(content, /admission_fee_snapshot:\s*admFee/);
    assert.match(content, /daily_service_rate_snapshot:\s*dailySvcCharge/);
    assert.match(content, /episode_service_charges/);
    assert.match(content, /IPD Admission Fee/);
  });

  // 5. Block D: Referral Dashboard & Periodic Billing in Asia/Dhaka
  await t.test("5. lib/referrals/actions.ts and app/referrals/page.tsx compute Asia/Dhaka periodic stats and display patient service drilldown", () => {
    const referralActionsPath = path.join(ROOT, "lib/referrals/actions.ts");
    const referralsPagePath = path.join(ROOT, "app/(hospital)/app/referrals/page.tsx");

    const actionsContent = fs.readFileSync(referralActionsPath, "utf8");
    const pageContent = fs.readFileSync(referralsPagePath, "utf8");

    // Action returns patientServicesSummary and periodicBilling
    assert.match(actionsContent, /patientServicesSummary:\s*PatientReferralServiceSummary\[\]/);
    assert.match(actionsContent, /periodicBilling:\s*PeriodicBillingStats/);
    assert.match(actionsContent, /record_discretionary_referral_payout_atomic/);

    // Asia/Dhaka UTC+6 calculation
    assert.match(actionsContent, /const dhakaOffsetMs = 6 \* 60 \* 60 \* 1000/);

    // UI displays 5 periodic billing cards
    assert.match(pageContent, /আজ \(Daily\)/);
    assert.match(pageContent, /এই সপ্তাহ \(Weekly\)/);
    assert.match(pageContent, /এই মাস \(Monthly\)/);
    assert.match(pageContent, /এই বছর \(Yearly\)/);
    assert.match(pageContent, /সর্বমোট \(All-Time\)/);

    // Removed cards
    assert.doesNotMatch(pageContent, /<span className="text-\[10px\] font-bold text-slate-500 block">পরিশোধিত কমিশন<\/span>/);
    assert.doesNotMatch(pageContent, /<span className="text-\[10px\] font-bold text-slate-500 block">পরিশোধিত কিস্তি<\/span>/);

    // Patient services table
    assert.match(pageContent, /রেফারেল করা রোগীদের সেবার বিস্তারিত ও বিল হিসাব/);
    assert.match(pageContent, /রোগী কি কি সেবা নিয়েছে এবং মোট কত টাকা বিল হয়েছে/);
  });
});
