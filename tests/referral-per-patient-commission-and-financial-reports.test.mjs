import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

describe("Migration 180: Referral Per-Patient Commission, Settlement History & Financial Reports", () => {
  const mig180Path = path.join(
    ROOT,
    "supabase/migrations/20261014020000_referral_per_patient_commission_and_financial_reports.sql"
  );
  assert.ok(fs.existsSync(mig180Path), "Migration 180 file must exist");
  const mig180Content = fs.readFileSync(mig180Path, "utf8");

  test("Migration 180 adds patient and GL columns to referral_commission_settlements", () => {
    assert.match(mig180Content, /ALTER TABLE IF EXISTS public\.referral_commission_settlements/i);
    assert.match(mig180Content, /ADD COLUMN IF NOT EXISTS patient_id\s+UUID/i);
    assert.match(mig180Content, /ADD COLUMN IF NOT EXISTS patient_name/i);
    assert.match(mig180Content, /ADD COLUMN IF NOT EXISTS patient_code/i);
    assert.match(mig180Content, /ADD COLUMN IF NOT EXISTS patient_total_bill/i);
    assert.match(mig180Content, /ADD COLUMN IF NOT EXISTS commission_rate_percent/i);
    assert.match(mig180Content, /ADD COLUMN IF NOT EXISTS expense_id/i);
    assert.match(mig180Content, /ADD COLUMN IF NOT EXISTS journal_entry_id/i);
  });

  test("Migration 180 implements authoritative record_referral_commission_payout_atomic RPC", () => {
    assert.match(mig180Content, /CREATE OR REPLACE FUNCTION public\.record_referral_commission_payout_atomic/);
    assert.match(mig180Content, /p_patient_id\s+UUID/i);
    assert.match(mig180Content, /INSERT INTO public\.referral_commission_settlements/);
    assert.match(mig180Content, /INSERT INTO public\.expenses/);
    assert.match(mig180Content, /INSERT INTO public\.journal_entries/);
    assert.match(mig180Content, /INSERT INTO public\.journal_entry_lines/);
  });

  test("Migration 180 respects journal immutability constraints with status DRAFT -> POSTED", () => {
    assert.match(mig180Content, /'DRAFT'/);
    assert.match(mig180Content, /UPDATE public\.journal_entries SET status = 'POSTED'/);
  });

  test("Migration 180 repairs get_trial_balance and get_general_ledger_report to prevent 42501 crashes", () => {
    assert.match(mig180Content, /CREATE OR REPLACE FUNCTION public\.get_trial_balance/);
    assert.match(mig180Content, /CREATE OR REPLACE FUNCTION public\.get_general_ledger_report/);
    assert.match(mig180Content, /v_caller_id UUID := auth\.uid\(\)/);
    assert.match(mig180Content, /SELECT 1 FROM public\.profiles/);
    assert.match(mig180Content, /SELECT 1 FROM public\.user_roles/);
  });

  test("Migration 180 backfills missing historical settlement and GL journal entries", () => {
    assert.match(mig180Content, /SETTLE-261012-5804/);
    assert.match(mig180Content, /JE-EXP-20261013-96e14a/);
    assert.match(mig180Content, /96e14a37-ccaf-4d82-9563-ccdd696f52b1/);
  });
});

describe("Referrals Actions Layer: Types & Atomic Handlers", () => {
  const actionsPath = path.join(ROOT, "lib/referrals/actions.ts");
  const actionsCode = fs.readFileSync(actionsPath, "utf8");

  test("ReferralSettlement interface has patient and GL fields", () => {
    assert.match(actionsCode, /patient_id\?: string \| null/);
    assert.match(actionsCode, /patient_name\?: string \| null/);
    assert.match(actionsCode, /patient_code\?: string \| null/);
    assert.match(actionsCode, /patient_total_bill\?: number \| null/);
    assert.match(actionsCode, /commission_rate_percent\?: number \| null/);
    assert.match(actionsCode, /expense_id\?: string \| null/);
    assert.match(actionsCode, /journal_entry_id\?: string \| null/);
  });

  test("PatientReferralServiceSummary has per-patient commission metrics", () => {
    assert.match(actionsCode, /commissionRatePercent: number;/);
    assert.match(actionsCode, /commissionEarned: number;/);
    assert.match(actionsCode, /commissionPaid: number;/);
    assert.match(actionsCode, /commissionDue: number;/);
    assert.match(actionsCode, /commissionStatus: "PAID" \| "PARTIAL" \| "PENDING";/);
  });

  test("getReferralAgentByIdAction computes per-patient commission earned, paid, due, and status", () => {
    assert.match(actionsCode, /pCommRows\.reduce\(\(sum, c\) => sum \+ Number\(c\.commission_amount \|\| 0\), 0\)/);
    assert.match(actionsCode, /pSettlements\.reduce\(\(sum, s\) => sum \+ Number\(s\.net_paid_amount \|\| 0\), 0\)/);
    assert.match(actionsCode, /commissionDue = Math\.max\(0/);
    assert.match(actionsCode, /commissionStatus = "PAID"/);
    assert.match(actionsCode, /commissionStatus = "PARTIAL"/);
  });

  test("recordReferralCommissionPayoutAction executes atomic master RPC", () => {
    assert.match(actionsCode, /supabase\.rpc\("record_referral_commission_payout_atomic"/);
    assert.match(actionsCode, /p_patient_id: params\.patientId/);
    assert.match(actionsCode, /p_patient_total_bill: params\.patientTotalBill/);
    assert.match(actionsCode, /p_commission_rate_percent: params\.commissionRatePercent/);
  });
});

describe("Referrals UI Page: Per-Patient Table, Payout Modal & Full History", () => {
  const pagePath = path.join(ROOT, "app/(hospital)/app/referrals/page.tsx");
  const pageCode = fs.readFileSync(pagePath, "utf8");

  test("Drawer patient table renders per-patient commission, paid, due, status, and payout button", () => {
    assert.match(pageCode, /প্রদেয় কমিশন \(৳\)/);
    assert.match(pageCode, /পরিশোধিত কমিশন \(৳\)/);
    assert.match(pageCode, /বকেয়া কমিশন \(৳\)/);
    assert.match(pageCode, /পরিশোধিত \(PAID\)/);
    assert.match(pageCode, /আংশিক \(PARTIAL\)/);
    assert.match(pageCode, /বকেয়া \(PENDING\)/);
    assert.match(pageCode, /কমিশন পরিশোধ/);
  });

  test("Drawer settlement history table includes patient details, bill, and payment method", () => {
    assert.match(pageCode, /রোগী \/ বিবরণ/);
    assert.match(pageCode, /রোগীর বিল \(৳\)/);
    assert.match(pageCode, /পরিশোধিত কমিশন/);
  });

  test("Payout modal features patient selector and real-time financial breakdown", () => {
    assert.match(pageCode, /কমিশনের ধরণ \/ নির্দিষ্ট রোগী নির্বাচন/);
    assert.match(pageCode, /সাধারণ পার্টনার কমিশন \(কোনো নির্দিষ্ট রোগী নয়\)/);
    assert.match(pageCode, /নির্বাচিত রোগী:/);
    assert.match(pageCode, /রোগীর মোট সেবা বিল:/);
    assert.match(pageCode, /বর্তমান বকেয়া কমিশন:/);
  });

  test("Tab 2 and Tab 3 render comprehensive per-patient and settlement details", () => {
    assert.match(pageCode, /রেফারেল রোগীদের সেবা ও বিল হিস্ট্রি/);
    assert.match(pageCode, /Treasury Settlement Disbursements/);
  });
});
