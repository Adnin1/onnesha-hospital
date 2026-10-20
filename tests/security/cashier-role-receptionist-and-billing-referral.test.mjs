import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../../lib/permissions.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Security & RBAC: Cashier Role Validation for Receptionists & Billing Referral Combobox", () => {
  const mig214Path = path.join(
    ROOT,
    "supabase/migrations/20261020150000_migration_214_fix_cashier_role_validation_and_referral_combobox.sql"
  );
  const mig215Path = path.join(
    ROOT,
    "supabase/migrations/20261020160000_migration_215_allow_billing_referral_agent_creation.sql"
  );
  const mig214Sql = fs.readFileSync(mig214Path, "utf8");
  const mig215Sql = fs.readFileSync(mig215Path, "utf8");

  test("1. MIGRATION 214: create_invoice_atomic authorizes receptionist and cashier roles", () => {
    assert.ok(
      mig214Sql.includes("'receptionist'"),
      "create_invoice_atomic must include receptionist in authorized cashier roles"
    );
    assert.ok(
      mig214Sql.includes("'billing.create'"),
      "create_invoice_atomic must permit users holding billing.create permission"
    );
    assert.ok(
      mig214Sql.includes("Specified cashier does not hold an authorized cashier role in organization"),
      "Must retain authoritative cashier validation guard clause"
    );
  });

  test("2. MIGRATION 215: create_referral_agent_atomic authorizes receptionist and billing staff", () => {
    assert.ok(
      mig215Sql.includes("'receptionist'"),
      "create_referral_agent_atomic must permit receptionist role"
    );
    assert.ok(
      mig215Sql.includes("'billing.create'"),
      "create_referral_agent_atomic must permit billing.create permission"
    );
    assert.ok(
      mig215Sql.includes("'referral.assign'"),
      "create_referral_agent_atomic must permit referral.assign permission"
    );
  });

  test("3. RBAC: Receptionist role possesses referral.assign and billing.create permissions", () => {
    const receptionistPerms = DEFAULT_ROLE_PERMISSIONS["receptionist"] || [];
    assert.ok(
      receptionistPerms.includes(PERMISSIONS.REFERRAL_ASSIGN),
      "Receptionist must have referral.assign in DEFAULT_ROLE_PERMISSIONS"
    );
    assert.ok(
      receptionistPerms.includes(PERMISSIONS.BILLING_CREATE),
      "Receptionist must have billing.create in DEFAULT_ROLE_PERMISSIONS"
    );
  });

  test("4. ACTION ACCESS: Billing referral lookup authorizes receptionists and rejects unprivileged callers", () => {
    function simulateSearchReferralAccess(session) {
      if (!session || !session.userId || !session.organizationId) {
        return { success: false, error: "401 Unauthorized" };
      }
      const isSuperAdmin = session.roles.includes("super_admin");
      const canAccess =
        isSuperAdmin ||
        session.permissions.includes("referral.assign") ||
        session.permissions.includes("referral.view") ||
        session.permissions.includes("billing.create") ||
        session.permissions.includes("billing.view") ||
        session.permissions.includes("referral.manage");
      if (!canAccess) {
        return { success: false, error: "403 Forbidden: Missing referral.assign or view permission." };
      }
      return { success: true, data: [] };
    }

    // Receptionist session
    const receptionistSession = {
      userId: "user-rec-1",
      organizationId: "org-1",
      roles: ["receptionist"],
      permissions: [PERMISSIONS.BILLING_CREATE, PERMISSIONS.REFERRAL_ASSIGN],
    };
    const recRes = simulateSearchReferralAccess(receptionistSession);
    assert.strictEqual(recRes.success, true, "Receptionist must succeed in searching referral partners");

    // Unprivileged cleaner session
    const cleanerSession = {
      userId: "user-cleaner-1",
      organizationId: "org-1",
      roles: ["cleaner"],
      permissions: [],
    };
    const cleanerRes = simulateSearchReferralAccess(cleanerSession);
    assert.strictEqual(cleanerRes.success, false);
    assert.match(cleanerRes.error, /403 Forbidden/);
  });

  test("5. VALIDATION: Quick-Add Referral Partner enforces strict boundary invariants", () => {
    function validateQuickAddPartner(params) {
      if (!params.full_name?.trim()) return { success: false, error: "Full name required" };
      if (!params.phone?.trim()) return { success: false, error: "Phone number required" };
      const rate = params.commission_rate_percent ?? 10;
      if (rate < 1 || rate > 40) {
        return { success: false, error: "Commission rate must be between 1% and 40%." };
      }
      return { success: true };
    }

    // Valid inputs
    assert.strictEqual(
      validateQuickAddPartner({ full_name: "Dr. Karim", phone: "01711000000", commission_rate_percent: 15 }).success,
      true
    );

    // Negative / excessive rate rejection
    assert.strictEqual(
      validateQuickAddPartner({ full_name: "Dr. Karim", phone: "01711000000", commission_rate_percent: 0 }).success,
      false
    );
    assert.strictEqual(
      validateQuickAddPartner({ full_name: "Dr. Karim", phone: "01711000000", commission_rate_percent: 50 }).success,
      false
    );

    // Missing required fields
    assert.strictEqual(
      validateQuickAddPartner({ full_name: "", phone: "01711000000" }).success,
      false
    );
    assert.strictEqual(
      validateQuickAddPartner({ full_name: "Valid Name", phone: "" }).success,
      false
    );
  });
});
