import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

test("Multi-Role RBAC & Health Engine Invariant Test Suite", async (t) => {
  const mig220Path = path.join(
    ROOT,
    "supabase/migrations/20261020200000_migration_220_allow_cashier_receptionist_gl_billing_post.sql"
  );
  const permsPath = path.join(ROOT, "lib/permissions.ts");
  const billingActionsPath = path.join(ROOT, "lib/billing/actions.ts");

  await t.test("1. Receptionist Front-Desk & Billing Operational Integrity", () => {
    const permsContent = fs.readFileSync(permsPath, "utf8");
    assert.match(permsContent, /BILLING_CREATE:\s*"billing\.create"/);
    assert.match(permsContent, /BILLING_COLLECT:\s*"billing\.collect"/);
    assert.match(permsContent, /PAYMENTS_CREATE:\s*"payments\.create"/);
    assert.match(permsContent, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.BILLING_CREATE/);
    assert.match(permsContent, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.BILLING_COLLECT/);
    assert.match(permsContent, /receptionist:\s*\[[\s\S]*?PERMISSIONS\.PAYMENTS_CREATE/);
  });

  await t.test("2. Cashier Counter Billing & Money Collection Invariant", () => {
    const migContent = fs.readFileSync(mig220Path, "utf8");
    assert.match(
      migContent,
      /LOWER\(r\.name\) IN \('super_admin', 'admin', 'hospital_administrator', 'cashier', 'accountant', 'finance_manager', 'receptionist'\)/
    );
    assert.match(
      migContent,
      /rp\.permission_key IN \('billing\.create', 'billing\.manage', 'billing\.collect', 'payments\.create', '\*'\)/
    );
  });

  await t.test("3. General Ledger Double-Entry Separation of Duties Invariant", () => {
    const migContent = fs.readFileSync(mig220Path, "utf8");
    // Verify that operational billing entries allow front-desk roles
    assert.match(
      migContent,
      /IF p_reference_type IN \('INVOICE', 'BILLING', 'PAYMENT', 'COMMISSION', 'REFERRAL_COMMISSION', 'REFERRAL_PAYMENT'\)/
    );
    assert.match(migContent, /LOWER\(r\.name\) IN \('cashier', 'receptionist'\)/);
    // Verify that non-operational manual entries strictly enforce accounting roles
    assert.match(
      migContent,
      /rp\.permission_key IN \('accounting\.manage', 'accounting\.post', '\*'\)/
    );
  });

  await t.test("4. Client-side Multi-Permission Resilience in Billing Actions", () => {
    const actionsContent = fs.readFileSync(billingActionsPath, "utf8");
    assert.match(actionsContent, /hasPermission\("billing\.collect"\)/);
    assert.match(actionsContent, /hasPermission\("billing\.create"\)/);
    assert.match(actionsContent, /hasPermission\("billing\.manage"\)/);
  });

  await t.test("5. Project Health Check Automated Governance Section 17 exists", () => {
    const healthCheckPath = path.join(ROOT, "scripts/project-health-check.mjs");
    const healthContent = fs.readFileSync(healthCheckPath, "utf8");
    assert.match(healthContent, /17\. Multi-Role RBAC & Front-Desk Workflow Invariants/);
    assert.match(healthContent, /Migration 220 enforces Receptionist & Cashier operational GL posting/);
  });

  await t.test("6. Scheduled Health Check Automated Role Permission Probe exists", () => {
    const scheduledPath = path.join(ROOT, "scripts/scheduled-health-check.mjs");
    const scheduledContent = fs.readFileSync(scheduledPath, "utf8");
    assert.match(scheduledContent, /checkRolePermissionIntegrity/);
    assert.match(scheduledContent, /Multi-role permissions verified intact/);
  });
});
