/**
 * Phase 34: Financial Invariants, Online Settlement Cashier Semantics,
 * Clean Desktop Distribution Manifest, and Provider Adapter Verification
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 34: Financial Invariants & Gateway Contracts Audit", async (t) => {
  await t.test("1. Migration 20260920005000 enforces strict DB money constraints", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20260920005000_harden_money_invariants_and_online_settlement.sql");
    assert.ok(fs.existsSync(migPath), "Migration file must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Check constraints on invoices
    assert.match(sql, /chk_invoices_subtotal/);
    assert.match(sql, /subtotal >= 0/);
    assert.match(sql, /chk_invoices_discount_le_subtotal/);
    assert.match(sql, /discount_amount <= subtotal/);
    assert.match(sql, /chk_invoices_due_eq_difference/);
    assert.match(sql, /due_amount = grand_total - paid_amount/);

    // Payments constraints
    assert.match(sql, /ALTER TABLE public\.payments ALTER COLUMN cashier_id DROP NOT NULL;/);
    assert.match(sql, /chk_payments_amount_positive/);
    assert.match(sql, /payment_method != 'CASH' OR cashier_id IS NOT NULL/);
    assert.match(sql, /payment_method != 'CASH' OR gateway_transaction_id IS NULL/);
  });

  await t.test("2. verify_and_record_online_payment enforces zero arbitrary cashier fallback", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20260920005000_harden_money_invariants_and_online_settlement.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    assert.match(sql, /IF p_cashier_id IS NOT NULL THEN/);
    assert.match(sql, /Invalid cashier: specified cashier profile does not belong to this organization or is inactive/);
    assert.match(sql, /ELSE\s+v_cashier_uuid := NULL;/);
    assert.ok(!sql.includes("v_invoice.created_by::uuid"), "Silent fallback to invoice creator must be eliminated");
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.verify_and_record_online_payment/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.verify_and_record_online_payment.*TO service_role/);
  });

  await t.test("3. latest.json contains zero dead GitHub release links and valid canonical URLs", () => {
    const manifestPath = path.join(ROOT, "public/downloads/desktop/latest.json");
    assert.ok(fs.existsSync(manifestPath), "latest.json must exist");
    const content = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(content);

    assert.match(parsed.version, /^1\.0\.\d+$/);
    assert.ok(!parsed.platforms["windows-x86_64"].github_release, "Broken GitHub release URL must not exist in manifest");
    assert.match(parsed.platforms["windows-x86_64"].installer_exe, /https:\/\/onnesha-hospital\.pages\.dev\/downloads\/desktop\/Onnesha-Hospital-Setup-1\.0\.\d+\.exe/);
    assert.match(parsed.platforms["windows-x86_64"].installer_msi, /https:\/\/onnesha-hospital\.pages\.dev\/downloads\/desktop\/Onnesha-Hospital-1\.0\.\d+\.msi/);
    assert.equal(parsed.signing.enabled, false);
    assert.match(parsed.signing.notice, /Informational version metadata manifest/);
  });

  await t.test("4. payment-callback edge function implements dedicated adapter architecture and fail-closed deferral", () => {
    const callbackPath = path.join(ROOT, "supabase/functions/payment-callback/index.ts");
    const code = fs.readFileSync(callbackPath, "utf8");

    assert.match(code, /class BkashAdapter/);
    assert.match(code, /class NagadAdapter/);
    assert.match(code, /class SslCommerzAdapter/);
    assert.match(code, /LIVE_MERCHANT_DEFERRED/);
    assert.match(code, /PROVIDER_MISMATCH/);
    assert.match(code, /CLIENT_SETTLEMENT_PROHIBITED/);
    assert.match(code, /safeCompareStrings/);
  });

  await t.test("5. PaymentService validates inputs and prevents NaN / malformed parameters", () => {
    const servicePath = path.join(ROOT, "lib/payments/payment-service.ts");
    const code = fs.readFileSync(servicePath, "utf8");

    assert.match(code, /Invalid organization ID/);
    assert.match(code, /Invalid invoice ID/);
    assert.match(code, /Invalid payment provider/);
    assert.match(code, /Payment amount must be a positive finite number/);
  });
});
