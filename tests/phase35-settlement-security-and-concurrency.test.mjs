import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const CANONICAL_ORG_ID = "a0000000-0000-0000-0000-000000000001";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://iuhtzahuszdkdarhxobx.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_OPiG-7uhoIlnysXKrpErsw_rdXEJ4rs";

describe("OHMS Phase 35: Settlement Cashier Security, Concurrency Lock & Waiver Reconciliation", () => {
  const migPath = path.join(ROOT, "supabase/migrations/20261009250000_authoritative_settlement_cashier_and_concurrency_closure.sql");

  test("1. Migration 137 exists and enforces authoritative cashier identity & anti-spoofing", () => {
    assert.ok(fs.existsSync(migPath), "Migration 137 must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Cashier identity derived from auth.uid()
    assert.ok(sql.includes("v_effective_cashier := v_calling_user;"), "Must derive cashier directly from auth.uid()");
    assert.ok(sql.includes("CASHIER_SPOOFING_PROHIBITED"), "Must reject mismatched client-supplied cashier ID");

    // Created_by and cashier_id use effective cashier
    assert.ok(sql.includes("p_notes, v_effective_cashier, NOW(), NOW()"), "Invoice created_by must use authoritative cashier");
    assert.ok(sql.includes("v_effective_cashier, v_effective_cashier, NOW(), NOW()"), "Payment cashier_id and created_by must use authoritative cashier");
  });

  test("2. create_episode_settlement_invoice_atomic_v2 validates discount authorization & payment method", () => {
    const sql = fs.readFileSync(migPath, "utf8");

    // Discount check
    assert.ok(sql.includes("DISCOUNT_UNAUTHORIZED"), "Must enforce billing.discount permission for non-zero discount");
    assert.ok(sql.includes("DISCOUNT_REASON_REQUIRED"), "Must enforce non-empty reason for non-zero discount");
    assert.ok(sql.includes("NEGATIVE_DISCOUNT_PROHIBITED"), "Must reject negative discount");

    // Payment method validation
    assert.ok(sql.includes("INVALID_PAYMENT_METHOD"), "Must reject unauthorized payment method");
    assert.ok(sql.includes("'CASH', 'BKASH', 'NAGAD'"), "Must check against canonical payment methods");
  });

  test("3. generate_patient_registration_serial acquires advisory lock and derives atomic sequence", () => {
    const sql = fs.readFileSync(migPath, "utf8");

    // Advisory lock
    assert.ok(sql.includes("pg_advisory_xact_lock"), "Must acquire transaction advisory lock to prevent race condition duplicates");
    assert.ok(sql.includes("patient_reg_serial:"), "Advisory lock key must be partitioned by tenant and date");

    // Monotonic sequence derivation
    assert.ok(sql.includes("MAX("), "Must use MAX sequence rather than naive COUNT(*)");
    assert.ok(sql.includes("LPAD("), "Must format serial with leading zeros");
  });

  test("4. Durable waiver accounting enforces full-line invariant & exact net-billable derivation", () => {
    const sql = fs.readFileSync(migPath, "utf8");

    // Full-line waiver invariant
    assert.ok(sql.includes("PARTIAL_LINE_WAIVER_PROHIBITED"), "Must prohibit partial line waivers at item level");

    // Net billable calculation in get_episode_billing_overview
    assert.ok(sql.includes("net_billable"), "Must calculate net billable amount subtracting active waivers");
    assert.ok(sql.includes("COALESCE(w.waived_amount, 0)"), "Must account for active waived amount");
  });

  test("5. Live DB Security: Anonymous calls to settlement and waiver RPCs are rejected fail-closed", async (t) => {
    if (SUPABASE_URL.includes("placeholder") || !SUPABASE_URL.startsWith("https://")) {
      t.skip("Skipped in mock environment without live database");
      return;
    }

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

    // Test settlement RPC rejection
    const { data: settleData, error: settleErr } = await client.rpc("create_episode_settlement_invoice_atomic_v2", {
      p_org_id: CANONICAL_ORG_ID,
      p_patient_id: "00000000-0000-0000-0000-000000000001",
      p_episode_id: "00000000-0000-0000-0000-000000000001",
      p_cashier_id: "00000000-0000-0000-0000-000000000999",
      p_paid_amount: 0,
      p_discount_amount: 0,
    });

    if (settleErr && (settleErr.message?.includes("fetch") || settleErr.message?.includes("ENOTFOUND"))) {
      t.skip("Skipped due to network isolation");
      return;
    }

    assert.ok(settleErr, "Anonymous call to create_episode_settlement_invoice_atomic_v2 MUST be rejected");
    assert.match(
      settleErr.message,
      /AUTHENTICATION_REQUIRED|permission denied|function .* does not exist/i,
      "Expected authentication or permission failure"
    );

    // Test waiver RPC rejection
    const { data: waiveData, error: waiveErr } = await client.rpc("waive_episode_service_atomic", {
      p_org_id: CANONICAL_ORG_ID,
      p_patient_id: "00000000-0000-0000-0000-000000000001",
      p_episode_id: "00000000-0000-0000-0000-000000000001",
      p_reference_id: "00000000-0000-0000-0000-000000000001",
      p_waiver_reason: "Test waiver",
    });

    assert.ok(waiveErr, "Anonymous call to waive_episode_service_atomic MUST be rejected");
    assert.match(
      waiveErr.message,
      /AUTHENTICATION_REQUIRED|permission denied|function .* does not exist/i,
      "Expected authentication or permission failure"
    );
  });
});
