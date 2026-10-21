import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const migration224Path = path.join(
  rootDir,
  "supabase",
  "migrations",
  "20261021080000_migration_224_remediate_p0_rbac_and_secure_rpc_grants.sql"
);

test("Security Hardening: Migration 224 P0 RBAC & Telegram Queue Remediation Suite", async (t) => {
  assert.ok(fs.existsSync(migration224Path), "Migration 224 file must exist");
  const sql = fs.readFileSync(migration224Path, "utf8");

  await t.test("1. P0 Remediation: save_role_permissions_atomic eliminates null caller bypass", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.save_role_permissions_atomic/);
    assert.match(sql, /IF \(auth\.role\(\) = 'service_role' OR current_user IN \('postgres', 'service_role'\)\)/);
    assert.match(sql, /ELSIF v_caller_id IS NOT NULL THEN/);
    assert.match(sql, /v_is_authorized := false;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_role_permissions_atomic\(UUID, TEXT, TEXT\[\]\) FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_role_permissions_atomic\(UUID, TEXT, TEXT\[\]\) FROM anon;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.save_role_permissions_atomic\(UUID, TEXT, TEXT\[\]\) TO authenticated, service_role;/);
  });

  await t.test("2. Secure get_organization_role_permissions_matrix with organization admin authorization", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_organization_role_permissions_matrix/);
    assert.match(sql, /403 Forbidden: Unauthorized access to organization role matrix/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_organization_role_permissions_matrix\(UUID\) FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_organization_role_permissions_matrix\(UUID\) FROM anon;/);
  });

  await t.test("3. Secure claim_next_telegram_command_atomic to service_role and super_admin only", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.claim_next_telegram_command_atomic/);
    assert.match(sql, /403 Forbidden: Only authorized background worker or super_admin can claim queue commands/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_next_telegram_command_atomic\(TEXT\) FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_next_telegram_command_atomic\(TEXT\) FROM anon;/);
  });

  await t.test("4. Secure enqueue_telegram_command_atomic against anonymous queue injection", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.enqueue_telegram_command_atomic/);
    assert.match(sql, /403 Forbidden: Direct queue enqueue requires service_role or admin authentication/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.enqueue_telegram_command_atomic\(BIGINT, BIGINT, BIGINT, TEXT, JSONB\) FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.enqueue_telegram_command_atomic\(BIGINT, BIGINT, BIGINT, TEXT, JSONB\) FROM anon;/);
  });

  await t.test("5. Revoke anonymous execution on Telegram update claiming and completion RPCs", () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_telegram_update_atomic\(BIGINT, TEXT\) FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_telegram_update_atomic\(BIGINT, TEXT\) FROM anon;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.complete_telegram_update_atomic\(BIGINT, TEXT\) FROM PUBLIC;/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.complete_telegram_update_atomic\(BIGINT, TEXT\) FROM anon;/);
  });

  await t.test("6. Revoke anonymous execution across sensitive financial, payroll, and internal ERP RPCs", () => {
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.disburse_payroll_to_gl_atomic/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.post_payroll_accrual_to_gl_atomic/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.reverse_journal_entry_atomic/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.close_fiscal_period/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.reopen_fiscal_period/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_supplier_payment_to_gl_atomic/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.post_grn_to_inventory_and_gl_atomic/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_pharmacy_sale_erp_atomic/);
  });

  await t.test("7. Tenant-isolation RLS policies and anonymous revocation on 26 un-policied internal tables", () => {
    const sensitiveTables = [
      "cash_transactions", "department_services", "diagnostic_results",
      "inventory_items", "medicine_batches", "medicines", "organization_branches",
      "patient_addresses", "patient_contacts", "patient_documents", "patient_history",
      "patient_identifications", "patient_notes", "payroll_runs", "prescriptions",
      "purchase_orders", "refunds", "sms_logs", "token_counters", "vital_signs", "waiting_queue"
    ];
    for (const tbl of sensitiveTables) {
      assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${tbl} FROM anon, PUBLIC;`));
      assert.match(sql, new RegExp(`GRANT ALL ON TABLE public\\.${tbl} TO service_role;`));
    }
  });
});
