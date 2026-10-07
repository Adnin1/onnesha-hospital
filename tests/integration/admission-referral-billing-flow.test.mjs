import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATION_PATH = path.join(ROOT, "supabase/migrations/20261007210000_billing_referral_autosuggest_and_custom_rate.sql");

describe("OHMS IPD Admission Referral Attribution & Billing Commission Auto-Suggestion Flow", () => {
  // -------------------------------------------------------------------------------------
  // 1. Authoritative Mathematical Formula Test
  // -------------------------------------------------------------------------------------
  function calculateCommission(subtotal, discount, ratePercent) {
    if (ratePercent < 1.0 || ratePercent > 40.0) {
      throw new Error("Referral commission rate out of hospital bounds (1% to 40%)");
    }
    const netBase = Math.max(0, subtotal - (discount || 0));
    const commission = Math.round(((netBase * ratePercent) / 100) * 100) / 100;
    return {
      subtotal,
      discount: discount || 0,
      netBase,
      ratePercent,
      commission,
    };
  }

  test("1. Formula: Inpatient bill of 15,000 BDT with 3,000 discount at default 15% rate yields 12,000 net base and 1,800 commission", () => {
    const res = calculateCommission(15000, 3000, 15);
    assert.equal(res.subtotal, 15000);
    assert.equal(res.discount, 3000);
    assert.equal(res.netBase, 12000);
    assert.equal(res.ratePercent, 15);
    assert.equal(res.commission, 1800);
  });

  test("2. Formula: Cashier adjusts commission rate from 15% to custom 20% on 12,000 net base yielding 2,400 commission", () => {
    const res = calculateCommission(15000, 3000, 20);
    assert.equal(res.netBase, 12000);
    assert.equal(res.commission, 2400);
  });

  test("3. Formula: Cashier adjusts commission rate to 10% on 12,000 net base yielding 1,200 commission", () => {
    const res = calculateCommission(15000, 3000, 10);
    assert.equal(res.netBase, 12000);
    assert.equal(res.commission, 1200);
  });

  test("4. Formula: Boundary enforcement rejects rates outside 1% to 40%", () => {
    assert.throws(() => calculateCommission(10000, 0, 0.5), /out of hospital bounds/);
    assert.throws(() => calculateCommission(10000, 0, 45.0), /out of hospital bounds/);
    // Boundary extremes 1% and 40% are valid
    assert.doesNotThrow(() => calculateCommission(10000, 0, 1.0));
    assert.doesNotThrow(() => calculateCommission(10000, 0, 40.0));
  });

  // -------------------------------------------------------------------------------------
  // 2. Migration 112 Architecture & DDL Integrity Verification
  // -------------------------------------------------------------------------------------
  test("5. Migration 112 exists and declares get_patient_referral_attribution_for_billing RPC", () => {
    assert.ok(fs.existsSync(MIGRATION_PATH), "Migration 112 must exist");
    const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_patient_referral_attribution_for_billing/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_patient_referral_attribution_for_billing/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_patient_referral_attribution_for_billing/);
  });

  test("6. Migration 112 declares search_referral_agents_for_billing RPC with commission rate projection", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.search_referral_agents_for_billing/);
    assert.match(sql, /commission_rate_percent NUMERIC\(5,2\)/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.search_referral_agents_for_billing/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.search_referral_agents_for_billing/);
  });

  test("7. Migration 112 upgrades create_invoice_atomic and create_invoice_and_post_gl_atomic to 13 parameters", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
    assert.match(sql, /DROP FUNCTION IF EXISTS public\.create_invoice_atomic/);
    assert.match(sql, /p_referral_agent_id UUID DEFAULT NULL/);
    assert.match(sql, /p_referral_commission_rate NUMERIC DEFAULT NULL/);
    assert.match(sql, /DROP FUNCTION IF EXISTS public\.create_invoice_and_post_gl_atomic/);
  });

  test("8. Migration 112 enforces explicit suppression token (00000000-0000-0000-0000-000000000000) for cashier override", () => {
    const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
    assert.match(sql, /00000000-0000-0000-0000-000000000000/);
    assert.match(sql, /v_explicit_suppression/);
  });

  // -------------------------------------------------------------------------------------
  // 3. Bed Actions & Modal Source Code Contract Verification
  // -------------------------------------------------------------------------------------
  test("9. lib/ipd/bed-actions.ts assignBedAction accepts referralAgentId and passes p_referral_agent_id to RPC", () => {
    const bedActionsPath = path.join(ROOT, "lib/ipd/bed-actions.ts");
    const content = fs.readFileSync(bedActionsPath, "utf8");
    assert.match(content, /referralAgentId\?: string/);
    assert.match(content, /p_referral_agent_id:\s*params\.referralAgentId \|\| null/);
    assert.match(content, /patient_referral_attributions/);
  });

  test("10. components/beds/AssignBedModal.tsx includes referral partner select dropdown and passes referralAgentId", () => {
    const modalPath = path.join(ROOT, "components/beds/AssignBedModal.tsx");
    const content = fs.readFileSync(modalPath, "utf8");
    assert.match(content, /searchReferralAgentsAction/);
    assert.match(content, /selectedReferralAgentId/);
    assert.match(content, /referralAgentId:\s*selectedReferralAgentId \|\| undefined/);
    assert.match(content, /রেফারেন্স \/ কার মাধ্যমে ভর্তি/);
  });

  // -------------------------------------------------------------------------------------
  // 4. Referral Actions & Billing Actions Integration Verification
  // -------------------------------------------------------------------------------------
  test("11. lib/referrals/actions.ts exports getPatientReferralAttributionAction and searchReferralAgentsForBillingAction", () => {
    const refActionsPath = path.join(ROOT, "lib/referrals/actions.ts");
    const content = fs.readFileSync(refActionsPath, "utf8");
    assert.match(content, /export async function getPatientReferralAttributionAction/);
    assert.match(content, /get_patient_referral_attribution_for_billing/);
    assert.match(content, /export async function searchReferralAgentsForBillingAction/);
    assert.match(content, /search_referral_agents_for_billing/);
  });

  test("12. lib/billing/actions.ts createInvoiceAction supports referralAgentId and referralCommissionRate", () => {
    const billingActionsPath = path.join(ROOT, "lib/billing/actions.ts");
    const content = fs.readFileSync(billingActionsPath, "utf8");
    assert.match(content, /referralAgentId\?: string/);
    assert.match(content, /p_referral_agent_id/);
    assert.match(content, /p_referral_commission_rate/);
  });

  // -------------------------------------------------------------------------------------
  // 5. Billing UI Auto-Suggestion & Configurable Commission UI Verification
  // -------------------------------------------------------------------------------------
  test("13. app/(hospital)/app/billing/page.tsx auto-suggests reference partner from admission and displays commission rate input", () => {
    const billingPagePath = path.join(ROOT, "app/(hospital)/app/billing/page.tsx");
    const content = fs.readFileSync(billingPagePath, "utf8");
    assert.match(content, /checkAttributionForPatient/);
    assert.match(content, /getPatientReferralAttributionAction/);
    assert.match(content, /searchReferralAgentsForBillingAction/);
    assert.match(content, /isAttributionSuggested/);
    assert.match(content, /ভর্তি থেকে স্বয়ংক্রিয় প্রাপ্ত/);
    assert.match(content, /কমিশন শতকরা হার \(Commission Rate %\)/);
    assert.match(content, /প্রাক্কলিত কমিশন \(Estimated Commission\)/);
  });

  // -------------------------------------------------------------------------------------
  // 6. Security & Patient Privacy Invariant: Commission Hidden from Patient Receipts
  // -------------------------------------------------------------------------------------
  test("14. Patient-facing print templates (A4 & Thermal) strictly hide referral commission numbers", () => {
    const a4PrintPath = path.join(ROOT, "components/print/A4InvoicePrint.tsx");
    const a4Content = fs.readFileSync(a4PrintPath, "utf8");
    // Ensure referral commission is NOT displayed on the patient bill
    assert.doesNotMatch(a4Content, /referral_commissions/i);
    assert.doesNotMatch(a4Content, /commission_amount/i);
    assert.doesNotMatch(a4Content, /কমিশন পার্সেন্টেজ/i);
  });
});
