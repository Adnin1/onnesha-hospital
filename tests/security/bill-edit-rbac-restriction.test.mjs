import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from "../../lib/permissions.ts";

test("OHMS Bill Edit RBAC Restriction & Zero-Bypass Certification", async (t) => {
  await t.test("1. DEFAULT ROLE PERMISSIONS: Receptionist MUST NOT have billing.edit by default", () => {
    const receptionistPerms = DEFAULT_ROLE_PERMISSIONS.receptionist || [];
    assert.strictEqual(
      receptionistPerms.includes(PERMISSIONS.BILLING_EDIT),
      false,
      "Receptionist must not have billing.edit by default"
    );
    assert.strictEqual(
      receptionistPerms.includes("billing.edit"),
      false,
      "Receptionist must not have literal billing.edit"
    );
  });

  await t.test("2. FRONTEND BYPASS REMOVAL: app/(hospital)/app/billing/page.tsx does NOT hardcode receptionist for canEditBills", () => {
    const billingPagePath = path.resolve(process.cwd(), "app/(hospital)/app/billing/page.tsx");
    const content = fs.readFileSync(billingPagePath, "utf-8");

    // Must NOT contain the old hardcoded role bypass
    assert.strictEqual(
      content.includes('userRoles.includes("receptionist") ||\n    userRoles.includes("accountant")'),
      false,
      "Billing page must NOT hardcode receptionist/accountant bypass for canEditBills"
    );

    // Must check dynamic billing.edit permission
    assert.ok(
      content.includes('userPermissions.includes("billing.edit")'),
      "Billing page must strictly check userPermissions.includes('billing.edit')"
    );

    // Must store userPermissions in state
    assert.ok(
      content.includes("const [userPermissions, setUserPermissions] = useState<string[]>([]);"),
      "Billing page must maintain userPermissions state"
    );
  });

  await t.test("3. BACKEND SERVER ACTION: lib/billing/actions.ts enforces billing.edit and rejects unauthorized edit", () => {
    const billingActionsPath = path.resolve(process.cwd(), "lib/billing/actions.ts");
    const content = fs.readFileSync(billingActionsPath, "utf-8");

    // Must NOT contain isRegistrarOrReceptionist bypass
    assert.strictEqual(
      content.includes("isRegistrarOrReceptionist"),
      false,
      "editInvoiceAction must not have isRegistrarOrReceptionist bypass"
    );

    // Must enforce session.permissions.includes("billing.edit")
    assert.ok(
      content.includes('session.permissions.includes("billing.edit")'),
      "editInvoiceAction must verify session.permissions.includes('billing.edit')"
    );

    // Must return 403 Forbidden when missing permission
    assert.ok(
      content.includes("Missing billing.edit permission"),
      "editInvoiceAction must return explicit 403 error on missing billing.edit"
    );
  });

  await t.test("4. DATABASE ATOMIC RPC: update_invoice_atomic verifies billing.edit from role_permissions", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261020140000_migration_213_strict_bill_edit_rbac_enforcement.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sql.includes("DELETE FROM public.role_permissions rp"),
      "Migration 213 must purge billing.edit from receptionist role"
    );
    assert.ok(
      sql.includes("LOWER(r.name) = 'receptionist'"),
      "Migration 213 must target receptionist role"
    );
    assert.ok(
      sql.includes("rp.permission_key = 'billing.edit'"),
      "Migration 213 must target billing.edit key"
    );
    assert.ok(
      sql.includes("Missing billing.edit permission for role"),
      "update_invoice_atomic must check billing.edit permission in PostgreSQL"
    );
  });
});
