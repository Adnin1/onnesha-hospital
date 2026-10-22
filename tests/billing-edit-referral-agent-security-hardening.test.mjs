import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath =
  "supabase/migrations/20261022160000_migration_253_harden_invoice_edit_identity_and_atomic_referral_guards.sql";

const sql = fs.readFileSync(migrationPath, "utf8");

test("Migration 253 binds invoice edit identity to auth.uid for non-service callers", () => {
  assert.match(sql, /v_auth_uid UUID := auth\.uid\(\)/);
  assert.match(sql, /p_user_id IS DISTINCT FROM v_auth_uid/);
  assert.match(sql, /caller identity does not match p_user_id/);
});

test("Migration 253 moves the v252 implementation to a private non-client helper", () => {
  assert.match(sql, /SET SCHEMA private/);
  assert.match(sql, /RENAME TO update_invoice_atomic_v252_internal/);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION private\.update_invoice_atomic_v252_internal[\s\S]*FROM PUBLIC, anon, authenticated, service_role/
  );
});

test("Migration 253 validates invoice and referral agent before delegating to the mutating implementation", () => {
  const lockPos = sql.indexOf("FOR UPDATE;");
  const invalidAgentPos = sql.indexOf("Selected referral agent is invalid or inactive.");
  const delegatePos = sql.indexOf("RETURN private.update_invoice_atomic_v252_internal");

  assert.ok(lockPos >= 0, "invoice row lock must exist");
  assert.ok(invalidAgentPos > lockPos, "referral validation must run after invoice lock");
  assert.ok(delegatePos > invalidAgentPos, "mutating delegate must run after validation");
});

test("Migration 253 blocks edits after referral commission settlement before mutation", () => {
  const paidGuardPos = sql.indexOf("settlement_status = 'PAID'");
  const paidErrorPos = sql.indexOf("Cannot edit this invoice because its referral commission has already been settled and paid.");
  const delegatePos = sql.indexOf("RETURN private.update_invoice_atomic_v252_internal");

  assert.ok(paidGuardPos >= 0);
  assert.ok(paidErrorPos > paidGuardPos);
  assert.ok(delegatePos > paidErrorPos, "paid-settlement guard must precede mutation");
});

test("Public invoice-edit overloads stay unavailable to anon but executable by authenticated staff", () => {
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.update_invoice_atomic\([\s\S]*\) FROM PUBLIC, anon/
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.update_invoice_atomic\([\s\S]*\) TO authenticated, service_role/
  );
});
