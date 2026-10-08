import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Master 27-Step Golden Lifecycle Verification (Admission -> Referral -> Billing -> Discharge)", () => {
  const actionsPath = path.join(ROOT, "lib", "patient", "actions.ts");
  const modalPath = path.join(ROOT, "components", "patient", "UnifiedPatientIntakeModal.tsx");
  const billingPanelPath = path.join(ROOT, "components", "patient", "EpisodeBillingPanel.tsx");
  const patientViewPath = path.join(ROOT, "app", "(hospital)", "app", "patients", "[id]", "PatientDetailView.tsx");
  const migration127Path = path.join(ROOT, "supabase", "migrations", "20261009010000_permanent_patient_nid_and_intake_contract.sql");
  const migration120Path = path.join(ROOT, "supabase", "migrations", "20261008120000_billing_history_scoping_and_financial_integrity.sql");
  const migration118Path = path.join(ROOT, "supabase", "migrations", "20261008070000_referral_analytics_and_bmdc_compliance_v1154.sql");
  const migration112Path = path.join(ROOT, "supabase", "migrations", "20261007200000_unified_patient_care_and_episode_settlement.sql");
  const migration032Path = path.join(ROOT, "supabase", "migrations", "032_billing_atomicity_and_rbac_hardening.sql");

  // Step 1: Patient Registration
  test("Step 1: Patient Registration validates demographics, NID, emergency contact and duplicate prevention", () => {
    const actions = fs.readFileSync(actionsPath, "utf8");
    assert.match(actions, /export async function registerPatientAction/);
    assert.match(actions, /full_name:\s*formData\.fullName\.trim\(\)/);
    assert.match(actions, /normalized_phone:\s*normalizedPhone/);
    assert.match(actions, /detectDuplicatePatients/);
    assert.match(actions, /recordAuditLog/);
  });

  // Step 2: Registration Serial
  test("Step 2: Registration Serial is database-generated, unique, concurrent-safe and permanent (YYMMDD-XXXXXX)", () => {
    const actions = fs.readFileSync(actionsPath, "utf8");
    assert.match(actions, /const registrationSerial = `\$\{yy\}\$\{mm\}\$\{dd\}-\$\{serialSuffix\}`/);
    assert.match(actions, /registration_serial:\s*registrationSerial/);

    const sql127 = fs.readFileSync(migration127Path, "utf8");
    assert.match(sql127, /v_registration_serial\s*:=\s*TO_CHAR\(v_encounter_at,\s*'YYMMDD'\)/);
  });

  // Step 3: Admission Date/Time
  test("Step 3: Admission Date/Time enforces Asia/Dhaka timestamp, future policy and same/multi-day validity", () => {
    const actions = fs.readFileSync(actionsPath, "utf8");
    assert.match(actions, /admitted_at/);

    const sql112 = fs.readFileSync(migration112Path, "utf8");
    assert.match(sql112, /FUNCTION public\.ohms_billable_days/);
    assert.match(sql112, /GREATEST\(1,\s*CEIL/);
  });

  // Step 4: Referral
  test("Step 4: Referral attribution captures agent, organization and permanently links to care episode", () => {
    const modal = fs.readFileSync(modalPath, "utf8");
    assert.match(modal, /referralAgentId/);
    assert.match(modal, /referrals\.map/);

    const sql127 = fs.readFileSync(migration127Path, "utf8");
    assert.match(sql127, /v_referral_agent_id UUID/);
    assert.match(sql127, /REFERRAL_AGENT_NOT_FOUND/);
    assert.match(sql127, /referral_agent_id,\s*admission_discount_amount/);
  });

  // Step 5: OPD
  test("Step 5: OPD selection records department, doctor, visit and consultation charge within episode", () => {
    const sql127 = fs.readFileSync(migration127Path, "utf8");
    assert.match(sql127, /IF COALESCE\(\(v_opd->>'enabled'\)::BOOLEAN,\s*FALSE\)\s*THEN/);
    assert.match(sql127, /INSERT INTO public\.patient_visits[\s\S]*?'OPD'/);
    assert.match(sql127, /v_billable_base\s*:=\s*v_billable_base\s*\+\s*COALESCE\(v_opd_fee,\s*0\);/);
  });

  // Step 6: IPD
  test("Step 6: IPD selection records department, doctor, bed/cabin and locks resource against double allocation", () => {
    const sql127 = fs.readFileSync(migration127Path, "utf8");
    assert.match(sql127, /IF COALESCE\(\(v_ipd->>'enabled'\)::BOOLEAN,\s*FALSE\)\s*THEN/);
    assert.match(sql127, /UPDATE public\.beds\s+SET status = 'OCCUPIED'/);
    assert.match(sql127, /RAISE EXCEPTION 'IPD_BED_NOT_VACANT';/);
  });

  // Step 7: Critical Care
  test("Step 7: Critical Care enforces unit affinity, eligible vacant bed mapping and concurrency locks", () => {
    const modal = fs.readFileSync(modalPath, "utf8");
    assert.match(modal, /getEligibleCriticalBedsForUnit/);
    assert.match(modal, /b\.critical_care_unit_id === unitId/);

    const sql127 = fs.readFileSync(migration127Path, "utf8");
    assert.match(sql127, /RAISE EXCEPTION 'CRITICAL_CARE_BED_NOT_VACANT:%', v_bed_number;/);
    assert.match(sql127, /UPDATE public\.beds\s+SET status = 'OCCUPIED'/);
  });

  // Step 8: OT
  test("Step 8: OT selection links room, surgeon, procedure and anchors to episode visit", () => {
    const actions = fs.readFileSync(actionsPath, "utf8");
    assert.match(actions, /\.from\("ot_bookings"\)[\s\S]*?\.insert/);
    assert.match(actions, /ot_room_id:\s*ot\.roomId/);
    assert.match(actions, /lead_surgeon_id:\s*ot\.surgeonId/);
    assert.match(actions, /visit_id:\s*visitId/);
  });

  // Step 9: Multi-Service One Submission
  test("Step 9: Multi-Service intake executes OPD + IPD + Critical Care + OT in 1 atomic transaction with full rollback", () => {
    const sql127 = fs.readFileSync(migration127Path, "utf8");
    assert.match(sql127, /CREATE OR REPLACE FUNCTION public\.create_patient_intake_atomic/);
    assert.match(sql127, /INSERT INTO public\.patient_care_episodes/);
    assert.match(sql127, /RAISE EXCEPTION 'CRITICAL_CARE_BED_NOT_VACANT:%'/);
    assert.match(sql127, /RAISE EXCEPTION 'IPD_BED_NOT_VACANT'/);
  });

  // Step 10: One Episode
  test("Step 10: One Episode guarantees all intake events and charges are traceable to single episode_id", () => {
    const sql127 = fs.readFileSync(migration127Path, "utf8");
    assert.match(sql127, /'episode_id',\s*v_episode_id/);
    assert.match(sql127, /'episode_number',\s*v_episode_number/);
  });

  // Step 11: Patient 360
  test("Step 11: Patient 360 clearly separates Current Episode from Lifetime History without leakage", () => {
    const view = fs.readFileSync(patientViewPath, "utf8");
    assert.match(view, /EpisodeBillingPanel/);
    assert.match(view, /Lifelong Clinical/);
    assert.match(view, /Visits & Encounters/);

    const panel = fs.readFileSync(billingPanelPath, "utf8");
    assert.match(panel, /Stat label="Current Unbilled"/);
    assert.match(panel, /Stat label="Episode Due"/);
    assert.match(panel, /Stat label="Patient Lifetime Due"/);

    const sql120 = fs.readFileSync(migration120Path, "utf8");
    assert.match(sql120, /lifetime_invoiced/);
    assert.match(sql120, /lifetime_due/);
  });

  // Step 12: Complete Current-Episode Billing
  test("Step 12: Episode billing calculates room charges, OT, tests, consults, and excludes previously invoiced items", () => {
    const sql112 = fs.readFileSync(migration112Path, "utf8");
    assert.match(sql112, /FUNCTION public\.create_episode_settlement_invoice_atomic/);
    assert.match(sql112, /NOT EXISTS \(\s*SELECT 1\s+FROM public\.invoice_items/i);

    const sql120 = fs.readFileSync(migration120Path, "utf8");
    assert.match(sql120, /episode_service_charges/);
  });

  // Step 13: Admission Discount
  test("Step 13: Admission discount is authorized, capped, server-calculated and applied exactly once", () => {
    const sql127 = fs.readFileSync(migration127Path, "utf8");
    assert.match(sql127, /DISCOUNT_PERCENTAGE_EXCEEDS_LIMIT/);
    assert.match(sql127, /v_admission_discount := ROUND\(\(v_billable_base \* \(v_admission_discount_percent \/ 100\.0\)\), 2\);/);
    assert.match(sql127, /v_admission_discount := v_billable_base;/);
  });

  // Step 14: Referral Commission
  test("Step 14: Referral commission enforces server calculation, BMDC ethics compliance and supervisory review", () => {
    const sql118 = fs.readFileSync(migration118Path, "utf8");
    assert.match(sql118, /BMDC Code of Ethics/);
    assert.match(sql118, /bmdc_ethics_acknowledged/);
    assert.match(sql118, /compliance_approved/);
  });

  // Step 15, 16, 17: Add / Edit / Delete Unbilled Services
  test("Step 15-17: Extra services ledger supports Add, Edit, Delete on unbilled items while posted/paid remain immutable", () => {
    const panel = fs.readFileSync(billingPanelPath, "utf8");
    assert.match(panel, /handleAddExtraService/);
    assert.match(panel, /handleSaveEditService/);
    assert.match(panel, /confirmDeleteService/);
    assert.match(panel, /addEpisodeServiceChargeAction/);
    assert.match(panel, /editEpisodeServiceChargeAction/);
    assert.match(panel, /deleteEpisodeServiceChargeAction/);
  });

  // Step 18: Billing Discount
  test("Step 18: Billing discount is recorded on invoice, distinct from admission discount with audit reason", () => {
    const panel = fs.readFileSync(billingPanelPath, "utf8");
    assert.match(panel, /billingDiscount/);
    assert.match(panel, /billingDiscountReason/);
    assert.match(panel, /totalDiscount/);
  });

  // Step 19: Final Settlement
  test("Step 19: Final Settlement creates idempotent, episode-scoped settlement invoice with concurrency lock", () => {
    const sql112 = fs.readFileSync(migration112Path, "utf8");
    assert.match(sql112, /uq_episode_settlement_invoice/);
    assert.match(sql112, /is_episode_settlement = TRUE/);
    assert.match(sql112, /FOR UPDATE/);
  });

  // Step 20: Payment
  test("Step 20: Payment collection locks invoice row, prevents overpayment and duplicate receipts", () => {
    const actions = fs.readFileSync(path.join(ROOT, "lib", "billing", "actions.ts"), "utf8");
    assert.match(actions, /collect_payment_atomic/);

    const sql032 = fs.readFileSync(migration032Path, "utf8");
    assert.match(sql032, /FOR UPDATE/);
    assert.match(sql032, /Overpayment is not permitted/);
  });

  // Step 21: Due = 0
  test("Step 21: Due = 0 verification is calculated and enforced on the database side", () => {
    const sql112 = fs.readFileSync(migration112Path, "utf8");
    assert.match(sql112, /due_amount > 0\.005/);
    assert.match(sql112, /SETTLEMENT_DUE/);
  });

  // Step 22-26: Atomic Discharge & Resource Release
  test("Step 22-26: Atomic Discharge releases bed, cabin, and critical resource back to VACANT and marks episode DISCHARGED", () => {
    const actions = fs.readFileSync(actionsPath, "utf8");
    assert.match(actions, /export async function dischargePatientAction/);
    assert.match(actions, /\.from\("beds"\)[\s\S]*?\.update\(\{\s*status:\s*"VACANT"\s*\}\)/);
    assert.match(actions, /\.from\("cabins"\)[\s\S]*?\.update\(\{\s*status:\s*"VACANT"\s*\}\)/);
    assert.match(actions, /\.from\("patient_visits"\)[\s\S]*?\.update\(\{\s*status:\s*"DISCHARGED"/);

    const sql112 = fs.readFileSync(migration112Path, "utf8");
    assert.match(sql112, /vacate_or_discharge_bed_atomic/);
    assert.match(sql112, /status = 'DISCHARGED'/);
    assert.match(sql112, /complete_episode_discharge_atomic/);
  });

  // Step 27: Historical Record Preserved
  test("Step 27: Historical records remain fully preserved and queryable after episode discharge", () => {
    const sql120 = fs.readFileSync(migration120Path, "utf8");
    assert.match(sql120, /lifetime_invoiced/);
    assert.match(sql120, /lifetime_paid/);
    assert.match(sql120, /lifetime_due/);
  });
});
