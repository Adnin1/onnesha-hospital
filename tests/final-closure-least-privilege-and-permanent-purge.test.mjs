import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("OHMS Absolute Final Closure: Least-Privilege Accounting, Permanent Purge Idempotency, and Telegram Queue Suite", async (t) => {
  const migration221Path = path.join(
    ROOT,
    "supabase/migrations/20261021050000_migration_221_least_privilege_accounting_and_permanent_delete_idempotency.sql"
  );

  await t.test("1. Migration 221 exists and contains well-formed SQL definitions", () => {
    assert.ok(fs.existsSync(migration221Path), "Migration 221 file must exist");
    const content = fs.readFileSync(migration221Path, "utf8");
    assert.ok(content.length > 1000, "Migration 221 must be substantial");
    assert.match(content, /BEGIN;/);
    assert.match(content, /COMMIT;/);
  });

  await t.test("2. Migration 221 provisions durable telegram_command_queue and atomic queue RPCs", () => {
    const content = fs.readFileSync(migration221Path, "utf8");
    assert.match(content, /CREATE TABLE IF NOT EXISTS public\.telegram_command_queue/);
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.enqueue_telegram_command_atomic/);
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.claim_next_telegram_command_atomic/);
    assert.match(content, /GRANT EXECUTE ON FUNCTION public\.enqueue_telegram_command_atomic/);
    assert.match(content, /GRANT EXECUTE ON FUNCTION public\.claim_next_telegram_command_atomic/);
  });

  await t.test("3. Migration 221 hardens post_journal_entry_atomic with strict least-privilege gating", () => {
    const content = fs.readFileSync(migration221Path, "utf8");
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.post_journal_entry_atomic/);
    assert.match(content, /v_is_internal_post/);
    assert.match(content, /app\.internal_operational_gl_posting/);
    assert.match(content, /Front-desk roles \(receptionist\/cashier\) cannot post direct manual journal entries/);
    assert.match(content, /v_total_debit != v_total_credit/);
  });

  await t.test("4. Migration 221 equips post_billing_to_gl_atomic with app.internal_operational_gl_posting session flag", () => {
    const content = fs.readFileSync(migration221Path, "utf8");
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.post_billing_to_gl_atomic/);
    assert.match(content, /PERFORM set_config\('app\.internal_operational_gl_posting', 'on', true\);/);
  });

  await t.test("5. Migration 221 equips delete_invoice_super_admin_atomic with ALREADY_PURGED idempotency and complete cascade", () => {
    const content = fs.readFileSync(migration221Path, "utf8");
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.delete_invoice_super_admin_atomic/);
    assert.match(content, /'mode', 'ALREADY_PURGED'/);
    assert.match(content, /DELETE FROM public\.invoice_edit_history WHERE invoice_id = p_invoice_id/);
    assert.match(content, /DELETE FROM public\.payments WHERE invoice_id = p_invoice_id/);
    assert.match(content, /DELETE FROM public\.referral_commissions WHERE invoice_id = p_invoice_id/);
  });

  await t.test("6. Migration 221 equips delete_hospital_expense_super_admin_atomic with ALREADY_PURGED idempotency", () => {
    const content = fs.readFileSync(migration221Path, "utf8");
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.delete_hospital_expense_super_admin_atomic/);
    assert.match(content, /'mode', 'ALREADY_PURGED'/);
    assert.match(content, /DELETE FROM public\.referral_commission_settlements WHERE id = v_settle\.id/);
  });

  await t.test("7. lib/billing/actions.ts deleteInvoiceAction handles ALREADY_PURGED as idempotent success", () => {
    const actionsPath = path.join(ROOT, "lib/billing/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.match(content, /res\.mode === "ALREADY_PURGED"/);
    assert.match(content, /resolveSystemRuntimeIncident/);
  });

  await t.test("8. lib/patient/actions.ts purgePatientAction validates patient_visits and cascades empty intakes", () => {
    const patientActionsPath = path.join(ROOT, "lib/patient/actions.ts");
    const content = fs.readFileSync(patientActionsPath, "utf8");
    assert.match(content, /supabase\.from\("patient_visits"\)/);
    assert.match(content, /supabase\.from\("patient_episodes"\)\.delete\(\)/);
    assert.doesNotMatch(content, /supabase\.from\("admissions"\)/);
  });

  await t.test("9. lib/referrals/actions.ts deleteReferralAgentAction passes organization_id to RPC", () => {
    const referralsPath = path.join(ROOT, "lib/referrals/actions.ts");
    const content = fs.readFileSync(referralsPath, "utf8");
    assert.match(content, /p_organization_id:\s*session\.organizationId/);
  });

  await t.test("10. functions/api/telegram-webhook.js enforces durable queue ingress and has zero getUpdates calls", () => {
    const webhookPath = path.join(ROOT, "functions/api/telegram-webhook.js");
    const content = fs.readFileSync(webhookPath, "utf8");
    assert.match(content, /enqueue_telegram_command_atomic/);
    assert.match(content, /enqueueTelegramCommand/);
    assert.doesNotMatch(content, /getUpdates/);
  });
});
