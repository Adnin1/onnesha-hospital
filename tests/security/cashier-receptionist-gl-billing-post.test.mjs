import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

test("Cashier & Receptionist GL Billing and Payment Posting Security Suite", async (t) => {
  const migration220Path = path.join(
    ROOT,
    "supabase/migrations/20261020200000_migration_220_allow_cashier_receptionist_gl_billing_post.sql"
  );

  await t.test("1. Migration 220 file exists and is well-formed SQL", () => {
    assert.ok(fs.existsSync(migration220Path), "Migration 220 file must exist");
    const content = fs.readFileSync(migration220Path, "utf8");
    assert.ok(content.length > 500, "Migration 220 must contain substantive SQL definitions");
  });

  await t.test("2. Migration 220 seeds billing.collect and payments.create permissions", () => {
    const content = fs.readFileSync(migration220Path, "utf8");
    assert.match(content, /billing\.collect/);
    assert.match(content, /payments\.create/);
    assert.match(content, /accounting\.post/);
    assert.match(content, /INSERT INTO public\.permissions/);
  });

  await t.test("3. Migration 220 upgrades post_journal_entry_atomic with inclusive operational billing RBAC", () => {
    const content = fs.readFileSync(migration220Path, "utf8");
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.post_journal_entry_atomic/);
    assert.match(content, /p_reference_type IN \('INVOICE', 'BILLING', 'PAYMENT', 'COMMISSION', 'REFERRAL_COMMISSION', 'REFERRAL_PAYMENT'\)/);
    assert.match(content, /LOWER\(r\.name\) IN \('cashier', 'receptionist'\)/);
    assert.match(content, /rp\.permission_key IN \('billing\.create', 'billing\.manage', 'payments\.create', 'billing\.collect'\)/);
  });

  await t.test("4. Migration 220 upgrades post_billing_to_gl_atomic to authorize receptionist role", () => {
    const content = fs.readFileSync(migration220Path, "utf8");
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.post_billing_to_gl_atomic/);
    assert.match(content, /LOWER\(r\.name\) IN \('super_admin', 'admin', 'hospital_administrator', 'finance_manager', 'accountant', 'cashier', 'receptionist'\)/);
    assert.match(content, /rp\.permission_key IN \('billing\.create', 'billing\.manage', 'payments\.create', 'billing\.collect', 'accounting\.manage', '\*'\)/);
  });

  await t.test("5. Migration 220 upgrades collect_payment_atomic to authorize receptionist role and cashier", () => {
    const content = fs.readFileSync(migration220Path, "utf8");
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.collect_payment_atomic/);
    assert.match(content, /LOWER\(r\.name\) IN \('super_admin', 'admin', 'hospital_administrator', 'cashier', 'accountant', 'finance_manager', 'receptionist'\)/);
  });

  await t.test("6. lib/permissions.ts exports BILLING_COLLECT and grants to receptionist", () => {
    const permsPath = path.join(ROOT, "lib/permissions.ts");
    const content = fs.readFileSync(permsPath, "utf8");
    assert.match(content, /BILLING_COLLECT:\s*"billing\.collect"/);
    assert.match(content, /PAYMENTS_CREATE:\s*"payments\.create"/);
    assert.match(content, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.BILLING_COLLECT/);
  });

  await t.test("7. lib/billing/actions.ts collectPaymentAction permits billing.create or billing.collect", () => {
    const actionsPath = path.join(ROOT, "lib/billing/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.match(content, /hasPermission\("billing\.collect"\)/);
    assert.match(content, /hasPermission\("billing\.create"\)/);
  });
});
