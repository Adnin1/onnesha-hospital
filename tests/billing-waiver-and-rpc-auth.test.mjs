import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Durable Billing Waivers & RPC Authorization Hardening (Migration 130)", () => {
  const migPath = path.join(
    ROOT,
    "supabase/migrations/20261009180000_durable_billing_waivers_and_rpc_auth_hardening.sql"
  );
  const migSql = fs.readFileSync(migPath, "utf8");

  test("migration 130 defines public.episode_service_waivers table with RLS and constraints", () => {
    assert.match(migSql, /CREATE TABLE IF NOT EXISTS public\.episode_service_waivers/);
    assert.match(migSql, /ALTER TABLE public\.episode_service_waivers ENABLE ROW LEVEL SECURITY/);
    assert.match(migSql, /waived_amount NUMERIC\(14, 2\) NOT NULL DEFAULT 0 CHECK \(waived_amount >= 0\)/);
    assert.match(migSql, /waiver_reason TEXT NOT NULL CHECK \(char_length\(trim\(waiver_reason\)\) >= 3\)/);
    assert.match(migSql, /waived_by UUID NOT NULL REFERENCES auth\.users\(id\)/);
    assert.match(migSql, /status VARCHAR\(20\) NOT NULL DEFAULT 'ACTIVE' CHECK \(status IN \('ACTIVE', 'RESTORED'\)\)/);
    assert.match(migSql, /idx_episode_service_waivers_lookup/);
    assert.match(migSql, /idx_episode_service_waivers_ref/);
  });

  test("migration 130 defines atomic waive and restore RPCs with strict RBAC and auth.uid() enforcement", () => {
    assert.match(migSql, /FUNCTION public\.waive_episode_service_atomic/);
    assert.match(migSql, /FUNCTION public\.restore_episode_service_waiver_atomic/);
    assert.match(migSql, /IF auth\.uid\(\) IS NULL THEN\s+RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'/);
    assert.match(migSql, /public\.is_org_admin_or_has_permission\(p_org_id, 'billing\.manage'\)/);
    assert.match(migSql, /REVOKE ALL ON FUNCTION public\.waive_episode_service_atomic/);
    assert.match(migSql, /REVOKE ALL ON FUNCTION public\.restore_episode_service_waiver_atomic/);
  });

  test("migration 130 upgrades get_episode_billing_overview to exclude active waivers and return waived_items", () => {
    assert.match(migSql, /FROM public\.episode_service_waivers w\s+WHERE w\.organization_id = p_org_id\s+AND w\.episode_id = v_episode_id\s+AND w\.reference_id = ob\.id\s+AND w\.status = 'ACTIVE'/);
    assert.match(migSql, /'waived_items', v_waived_items/);
    assert.match(migSql, /v_waived_items JSONB := '\[\]'::JSONB/);
  });

  test("migration 130 hardens create_patient_intake_atomic against client actor spoofing and enforces RBAC", () => {
    assert.match(migSql, /FUNCTION public\.create_patient_intake_atomic/);
    assert.match(migSql, /v_caller_id\s+UUID\s*:=\s*auth\.uid\(\);/);
    assert.match(migSql, /v_actor_id := v_caller_id/);
    assert.match(migSql, /public\.is_org_admin_or_has_permission\(v_org_id, 'patients\.create'\)/);
    assert.match(migSql, /SET search_path = ''/);
  });

  test("migration 130 hardens create_episode_settlement_invoice_atomic_v2 against cashier spoofing and enforces RBAC", () => {
    assert.match(migSql, /FUNCTION public\.create_episode_settlement_invoice_atomic_v2/);
    assert.match(migSql, /v_caller_id\s+UUID\s*:=\s*auth\.uid\(\);/);
    assert.match(migSql, /v_cashier_id := v_caller_id/);
    assert.match(migSql, /public\.is_org_admin_or_has_permission\(p_org_id, 'billing\.manage'\)/);
    assert.match(migSql, /v_payment_method NOT IN \('CASH', 'BKASH', 'NAGAD'/);
    assert.match(migSql, /SET search_path = ''/);
  });

  test("lib/billing/actions.ts exports waive and restore server actions with audit logging", () => {
    const actionsPath = path.join(ROOT, "lib/billing/actions.ts");
    const actionsCode = fs.readFileSync(actionsPath, "utf8");

    assert.match(actionsCode, /export async function waiveEpisodeServiceAction/);
    assert.match(actionsCode, /export async function restoreEpisodeServiceWaiverAction/);
    assert.match(actionsCode, /requirePermission\("billing\.manage"\)/);
    assert.match(actionsCode, /supabase\.rpc\("waive_episode_service_atomic"/);
    assert.match(actionsCode, /supabase\.rpc\("restore_episode_service_waiver_atomic"/);
    assert.match(actionsCode, /entityType: "episode_service_waivers"/);
    assert.match(actionsCode, /waived_items:\s*EpisodeWaivedItem\[\]/);
  });

  test("EpisodeBillingPanel UI renders permanent waiver triggers, dialog, and audited ledger", () => {
    const panelPath = path.join(ROOT, "components/patient/EpisodeBillingPanel.tsx");
    const panelCode = fs.readFileSync(panelPath, "utf8");

    assert.match(panelCode, /waiveEpisodeServiceAction/);
    assert.match(panelCode, /restoreEpisodeServiceWaiverAction/);
    assert.match(panelCode, /title="Permanently Waive Charge \(Audited\)"/);
    assert.match(panelCode, /Durable Waived Services Ledger \(Audited\)/);
    assert.match(panelCode, /handleConfirmWaiveItem/);
    assert.match(panelCode, /handleRestoreWaivedItem/);
    assert.match(panelCode, /Minimum 3 characters required for legal audit compliance\./);
  });

  test("migration 131 enforces authoritative derivation, unbilled eligibility, and concurrency lock", () => {
    const mig131Path = path.join(
      ROOT,
      "supabase/migrations/20261009190000_authoritative_billing_waiver_derivation.sql"
    );
    const mig131Sql = fs.readFileSync(mig131Path, "utf8");

    assert.match(mig131Sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_episode_service_waivers_active/);
    assert.match(mig131Sql, /PERFORM 1 FROM public\.patient_care_episodes[\s\S]+?FOR UPDATE;/);
    assert.match(mig131Sql, /RAISE EXCEPTION 'ITEM_ALREADY_INVOICED';/);
    assert.match(mig131Sql, /RAISE EXCEPTION 'REFERENCED_SERVICE_NOT_FOUND_OR_INELIGIBLE';/);
    assert.match(mig131Sql, /v_final_waived_amount/);
    assert.match(mig131Sql, /REVOKE ALL ON FUNCTION public\.waive_episode_service_atomic/);
    assert.match(mig131Sql, /GRANT EXECUTE ON FUNCTION public\.waive_episode_service_atomic.+?TO authenticated, service_role/);
  });
});

