import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Dynamic Referral Agent Bill Editing & Commission Recalculation (Migration 252)", () => {
  const migPath = path.join(
    ROOT,
    "supabase/migrations/20261022150000_migration_252_allow_bill_edit_referral_agent_and_recalculate_commissions.sql"
  );
  const migSql = fs.readFileSync(migPath, "utf8");

  test("migration 252 extends search_referral_agents_for_billing with billing.edit authority", () => {
    assert.match(migSql, /CREATE OR REPLACE FUNCTION public\.search_referral_agents_for_billing/);
    assert.match(migSql, /rp\.permission_key IN \('billing\.create', 'billing\.edit', 'billing\.manage'/);
    assert.match(migSql, /SET search_path = ''/);
    assert.match(migSql, /REVOKE ALL ON FUNCTION public\.search_referral_agents_for_billing\(UUID, TEXT\) FROM PUBLIC, anon;/);
    assert.match(migSql, /GRANT EXECUTE ON FUNCTION public\.search_referral_agents_for_billing\(UUID, TEXT\) TO authenticated, service_role;/);
  });

  test("migration 252 defines canonical 8-parameter update_invoice_atomic with SET search_path = ''", () => {
    assert.match(
      migSql,
      /CREATE OR REPLACE FUNCTION public\.update_invoice_atomic\(\s*p_org_id UUID,\s*p_invoice_id UUID,\s*p_user_id UUID,\s*p_items JSONB,\s*p_discount_amount NUMERIC,\s*p_discount_reason TEXT,\s*p_tax_amount NUMERIC,\s*p_referral_agent_id UUID\s*\)/
    );
    assert.match(migSql, /SECURITY DEFINER/);
    assert.match(migSql, /SET search_path = ''/);
  });

  test("migration 252 implements explicit referral agent removal sentinel with earnings deduction", () => {
    assert.match(
      migSql,
      /IF p_referral_agent_id = '00000000-0000-0000-0000-000000000000'::uuid THEN/
    );
    assert.match(
      migSql,
      /UPDATE public\.referral_agents\s+SET total_commission_earned = GREATEST\(0\.00, total_commission_earned - v_existing_comm\.commission_amount\)/
    );
    assert.match(migSql, /DELETE FROM public\.referral_commissions WHERE id = v_existing_comm\.id;/);
  });

  test("migration 252 protects settled/paid referral commissions from destructive edits", () => {
    assert.match(migSql, /IF v_existing_comm\.settlement_status = 'PAID' THEN/);
    assert.match(
      migSql,
      /Cannot remove referral agent: Commission for this invoice has already been settled and paid out\./
    );
    assert.match(
      migSql,
      /Cannot reassign referral agent: Commission has already been settled and paid out/
    );
  });

  test("migration 252 dynamically recalculates commission and adjusts earnings on agent change", () => {
    assert.match(
      migSql,
      /-- Agent changed: deduct from old agent, reassign commission record, add to new agent/
    );
    assert.match(
      migSql,
      /UPDATE public\.referral_agents\s+SET total_commission_earned = GREATEST\(0\.00, total_commission_earned - v_existing_comm\.commission_amount\)/
    );
    assert.match(
      migSql,
      /UPDATE public\.referral_agents\s+SET total_commission_earned = total_commission_earned \+ v_comm_amount/
    );
  });

  test("migration 252 dynamically syncs commission on bill line-item/discount amount change", () => {
    assert.match(
      migSql,
      /-- Same agent: recalculate commission for updated grand total/
    );
    assert.match(migSql, /v_comm_diff := v_comm_amount - v_existing_comm\.commission_amount;/);
    assert.match(
      migSql,
      /UPDATE public\.referral_agents\s+SET total_commission_earned = GREATEST\(0\.00, total_commission_earned \+ v_comm_diff\)/
    );
  });

  test("migration 252 preserves backward-compatible 7-parameter update_invoice_atomic overload", () => {
    assert.match(
      migSql,
      /CREATE OR REPLACE FUNCTION public\.update_invoice_atomic\(\s*p_org_id UUID,\s*p_invoice_id UUID,\s*p_user_id UUID,\s*p_items JSONB,\s*p_discount_amount NUMERIC,\s*p_discount_reason TEXT,\s*p_tax_amount NUMERIC\s*\)/
    );
    assert.match(migSql, /RETURN public\.update_invoice_atomic\([\s\S]*NULL::UUID\s*\);/);
  });

  test("lib/billing/actions.ts correctly integrates referral agent in editInvoiceAction and getInvoicesAction", () => {
    const actPath = path.join(ROOT, "lib/billing/actions.ts");
    const actCode = fs.readFileSync(actPath, "utf8");

    assert.match(actCode, /referral_agents \(id, agent_code, full_name, agent_type, phone, commission_rate_percent, is_commission_eligible\)/);
    assert.match(actCode, /referralAgentId\?: string \| null;/);
    assert.match(actCode, /p_referral_agent_id: pReferralAgentId/);
    assert.match(actCode, /pReferralAgentId = "00000000-0000-0000-0000-000000000000";/);
  });

  test("lib/referrals/actions.ts grants billing.edit access to searchReferralAgentsForBillingAction", () => {
    const refPath = path.join(ROOT, "lib/referrals/actions.ts");
    const refCode = fs.readFileSync(refPath, "utf8");

    assert.match(refCode, /session\.permissions\.includes\("billing\.edit"\)/);
  });

  test("types/billing.ts defines referral_agent_id and referral_agent on InvoiceRecord", () => {
    const typePath = path.join(ROOT, "types/billing.ts");
    const typeCode = fs.readFileSync(typePath, "utf8");

    assert.match(typeCode, /referral_agent_id\?: string \| null;/);
    assert.match(typeCode, /referral_agent\?: \{/);
  });

  test("components/billing/EditInvoiceModal.tsx renders referral agent dropdown, live commission estimation, and audit indicators", () => {
    const modalPath = path.join(ROOT, "components/billing/EditInvoiceModal.tsx");
    const modalCode = fs.readFileSync(modalPath, "utf8");

    assert.match(modalCode, /searchReferralAgentsForBillingAction/);
    assert.match(modalCode, /selectedReferralAgentId/);
    assert.match(modalCode, /estimatedCommission/);
    assert.match(modalCode, /রেফারাল এজেন্ট \/ দালাল সমন্বয়/);
    assert.match(modalCode, /-- সরাসরি রোগী \/ কোনো রেফারাল এজেন্ট নেই \(Direct Patient\) --/);
    assert.match(modalCode, /লাইভ কমিশন প্রাক্কলন:/);
    assert.match(modalCode, /referralAgentId: selectedReferralAgentId/);
  });
});
