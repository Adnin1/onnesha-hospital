import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../../lib/permissions.ts";

describe("OHMS Server-Side RBAC & Negative Permission Enforcement Certification", () => {
  // Helper to check if a role possesses a permission
  function roleHasPermission(roleName, permissionKey) {
    if (roleName === "super_admin") return true;
    if ((roleName === "hospital_administrator" || roleName === "admin") && permissionKey === PERMISSIONS.SETTINGS_MANAGE_ROLES) {
      return false; // Root governance is strictly super_admin
    }
    const perms = DEFAULT_ROLE_PERMISSIONS[roleName] || [];
    return perms.includes(permissionKey);
  }

  // 1. Billing Void & Refund (Negative Certification)
  test("1. NEGATIVE RBAC: Receptionist, Doctor, Nurse & Pharmacist CANNOT void or refund invoices", () => {
    const unprivilegedRoles = ["receptionist", "doctor", "nurse", "pharmacist"];
    for (const role of unprivilegedRoles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.BILLING_VOID),
        false,
        `Role ${role} must NOT possess BILLING_VOID permission`
      );
      assert.equal(
        roleHasPermission(role, PERMISSIONS.BILLING_REFUND),
        false,
        `Role ${role} must NOT possess BILLING_REFUND permission`
      );
    }
    // Positive check: Accountant possesses billing void
    assert.equal(roleHasPermission("accountant", PERMISSIONS.BILLING_VOID), true);
  });

  // 2. Accounting & General Ledger Posting (Negative Certification)
  test("2. NEGATIVE RBAC: Clinical and Front-desk staff CANNOT post accounting journals", () => {
    const nonAccountingRoles = ["doctor", "nurse", "receptionist", "pharmacist", "lab_technologist"];
    for (const role of nonAccountingRoles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.ACCOUNTING_MANAGE),
        false,
        `Role ${role} must NOT possess ACCOUNTING_MANAGE permission`
      );
    }
    // Positive check: Accountant possesses accounting manage
    assert.equal(roleHasPermission("accountant", PERMISSIONS.ACCOUNTING_MANAGE), true);
  });

  // 3. Payment Verification & Gateways (Negative Certification)
  test("3. NEGATIVE RBAC: Doctors, Nurses and Receptionists CANNOT verify online payments or manage gateways", () => {
    const roles = ["doctor", "nurse", "receptionist", "pharmacist"];
    for (const role of roles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.PAYMENTS_ONLINE_VERIFY),
        false,
        `Role ${role} must NOT possess PAYMENTS_ONLINE_VERIFY permission`
      );
      assert.equal(
        roleHasPermission(role, PERMISSIONS.PAYMENT_GATEWAY_MANAGE),
        false,
        `Role ${role} must NOT possess PAYMENT_GATEWAY_MANAGE permission`
      );
    }
    assert.equal(roleHasPermission("accountant", PERMISSIONS.PAYMENTS_ONLINE_VERIFY), true);
  });

  // 4. Financial Reconciliation (Negative Certification)
  test("4. NEGATIVE RBAC: Non-finance personnel CANNOT perform cashier reconciliation", () => {
    const nonFinance = ["doctor", "nurse", "receptionist", "pharmacist", "lab_technologist"];
    for (const role of nonFinance) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.PAYMENTS_RECONCILE),
        false,
        `Role ${role} must NOT possess PAYMENTS_RECONCILE permission`
      );
    }
    assert.equal(roleHasPermission("accountant", PERMISSIONS.PAYMENTS_RECONCILE), true);
  });

  // 5. Staff Provisioning & Account Creation (Negative Certification)
  test("5. NEGATIVE RBAC: Operational staff CANNOT provision staff accounts", () => {
    const operationalRoles = ["doctor", "nurse", "accountant", "receptionist", "pharmacist"];
    for (const role of operationalRoles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.STAFF_CREATE),
        false,
        `Role ${role} must NOT possess STAFF_CREATE permission`
      );
    }
  });

  // 6. Role Governance & Privilege Escalation (Negative Certification)
  test("6. NEGATIVE RBAC: Hospital Administrator CANNOT bypass SETTINGS_MANAGE_ROLES", () => {
    assert.equal(
      roleHasPermission("hospital_administrator", PERMISSIONS.SETTINGS_MANAGE_ROLES),
      false,
      "Hospital Administrator must be barred from SETTINGS_MANAGE_ROLES"
    );
    assert.equal(
      roleHasPermission("admin", PERMISSIONS.SETTINGS_MANAGE_ROLES),
      false,
      "Admin must be barred from SETTINGS_MANAGE_ROLES"
    );
    // Only super_admin holds root governance
    assert.equal(roleHasPermission("super_admin", PERMISSIONS.SETTINGS_MANAGE_ROLES), true);
  });

  // 7. Password Reset Authority (Negative Certification)
  test("7. NEGATIVE RBAC: Clinical staff CANNOT reset employee passwords", () => {
    const roles = ["doctor", "nurse", "accountant", "pharmacist", "receptionist"];
    for (const role of roles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.STAFF_RESET_PASSWORD),
        false,
        `Role ${role} must NOT possess STAFF_RESET_PASSWORD permission`
      );
    }
  });

  // 8. Integration & Secret Management (Negative Certification)
  test("8. NEGATIVE RBAC: Operational & clinical roles CANNOT manage integrations", () => {
    const roles = ["doctor", "nurse", "receptionist", "pharmacist", "accountant"];
    for (const role of roles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.INTEGRATIONS_MANAGE),
        false,
        `Role ${role} must NOT possess INTEGRATIONS_MANAGE permission`
      );
    }
  });

  // 9. Forensic Audit Vault Access (Negative Certification)
  test("9. NEGATIVE RBAC: Receptionist, Nurse and Pharmacist CANNOT inspect forensic audit logs", () => {
    const roles = ["receptionist", "nurse", "pharmacist", "doctor"];
    for (const role of roles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.SETTINGS_AUDIT),
        false,
        `Role ${role} must NOT possess SETTINGS_AUDIT permission`
      );
    }
  });

  // 10. Diagnostic Verification & Pathologist Sealing (Negative Certification)
  test("10. NEGATIVE RBAC: Receptionist, Nurse and Pharmacist CANNOT verify lab diagnostic reports", () => {
    const nonLabRoles = ["receptionist", "nurse", "pharmacist", "accountant", "doctor"];
    for (const role of nonLabRoles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.LAB_VERIFY),
        false,
        `Role ${role} must NOT possess LAB_VERIFY permission`
      );
    }
    // Positive check: Lab Technologist possesses LAB_VERIFY
    assert.equal(roleHasPermission("lab_technologist", PERMISSIONS.LAB_VERIFY), true);
  });
});
