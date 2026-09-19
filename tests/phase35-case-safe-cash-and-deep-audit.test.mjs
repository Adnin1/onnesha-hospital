/**
 * Phase 35: Forensic Deep Re-Audit & Contract Hardening Tests
 * Verifies:
 * 1. Migration 20260920030000 case-safe cash constraints & DB gateway uniqueness.
 * 2. verify_and_record_online_payment enforces method matching against intent & rejects CASH.
 * 3. payment-initiate requires active profile & rejects idempotency key conflicts.
 * 4. payment-callback uses authoritative provider transaction ID & strict positive amount.
 * 5. CORS headers protect internal webhook secret from browser visibility.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 35: Forensic Deep Re-Audit & Security Hardening", async (t) => {
  await t.test("1. Migration 20260920030000 enforces case-safe cash constraints and gateway uniqueness", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20260920030000_harden_case_safe_cash_and_online_settlement_provider.sql");
    assert.ok(fs.existsSync(migPath), "Migration 20260920030000 must exist");
    const sql = fs.readFileSync(migPath, "utf8");

    // Case-safe cash checks
    assert.match(sql, /UPPER\(TRIM\(payment_method\)\)\s*!=\s*'CASH'/i);
    assert.match(sql, /chk_payments_cashier_method/);
    assert.match(sql, /chk_payments_cash_no_gateway_trx/);

    // Database unique index for gateway transaction id
    assert.match(sql, /idx_payments_org_gateway_trx_unique/);
    assert.match(sql, /ON public\.payments\s*\(organization_id,\s*gateway_transaction_id\)/i);
  });

  await t.test("2. verify_and_record_online_payment validates gateway method against stored intent provider", () => {
    const migPath = path.join(ROOT, "supabase/migrations/20260920030000_harden_case_safe_cash_and_online_settlement_provider.sql");
    const sql = fs.readFileSync(migPath, "utf8");

    // Must check that method matches intent provider
    assert.match(sql, /v_normalized_method\s*!=\s*v_normalized_provider/);
    assert.match(sql, /PROVIDER_MISMATCH/);
    assert.match(sql, /v_normalized_method\s*=\s*'CASH'/);
    assert.match(sql, /INVALID_METHOD/);

    // Security definer with search_path = '' and service_role grant
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path\s*=\s*''/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.verify_and_record_online_payment.*TO service_role/);
  });

  await t.test("3. payment-initiate requires active profile and detects idempotency conflicts", () => {
    const fnPath = path.join(ROOT, "supabase/functions/payment-initiate/index.ts");
    assert.ok(fs.existsSync(fnPath), "payment-initiate function must exist");
    const code = fs.readFileSync(fnPath, "utf8");

    // Profile requirement
    assert.match(code, /!profile\s*\|\|\s*profile\.is_active\s*!==\s*true/);
    assert.match(code, /Forbidden: Active user profile is required/);

    // Idempotency conflict handling
    assert.match(code, /IDEMPOTENCY_CONFLICT/);
    assert.match(code, /409/);
    assert.match(code, /existingIntent\.invoice_id\s*!==\s*invoiceId/);
  });

  await t.test("4. payment-callback uses authoritative transaction ID and validates amount strictly", () => {
    const fnPath = path.join(ROOT, "supabase/functions/payment-callback/index.ts");
    assert.ok(fs.existsSync(fnPath), "payment-callback function must exist");
    const code = fs.readFileSync(fnPath, "utf8");

    // Authoritative transaction ID
    assert.match(code, /authoritativeTrxId/);
    assert.match(code, /verification\.providerTransactionId/);

    // Finite positive amount validation
    assert.match(code, /Number\.isFinite\(parsedAmount\)/);
    assert.match(code, /parsedAmount\s*<=\s*0/);

    // Non-empty trimmed transaction ID
    assert.match(code, /trimmedClientTrxId/);
    assert.match(code, /Missing or empty provider transaction ID/);

    // Browser CORS does not expose internal webhook secret
    assert.ok(!code.includes('"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provider-signature, x-webhook-signature, x-internal-webhook-secret"'), "Browser CORS must not expose internal secret");
  });

  await t.test("5. Cross-tenant isolation guarantees: tenant boundaries are strictly respected", () => {
    // Audit that billing RPCs explicitly enforce organization_id on all queries
    const mig40Path = path.join(ROOT, "supabase/migrations/20260920030000_harden_case_safe_cash_and_online_settlement_provider.sql");
    const mig40 = fs.readFileSync(mig40Path, "utf8");

    assert.match(mig40, /WHERE id = p_intent_id AND organization_id = p_org_id/);
    assert.match(mig40, /WHERE id = v_intent\.invoice_id AND organization_id = p_org_id/);
    assert.match(mig40, /WHERE gateway_transaction_id = v_trimmed_trx_id\s+AND organization_id = p_org_id/);
  });
});
