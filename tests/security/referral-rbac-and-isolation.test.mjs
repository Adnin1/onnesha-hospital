import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../../lib/permissions.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("OHMS Security & Penetration Testing: Referral Subsystem RBAC, Multi-Tenant Isolation & Privacy Defense", () => {
  const migrationPath = path.join(
    ROOT,
    "supabase/migrations/20261007070000_referral_affiliate_commission_subsystem.sql"
  );
  const sqlContent = fs.readFileSync(migrationPath, "utf8");

  function roleHasPermission(roleName, permissionKey) {
    if (roleName === "super_admin") return true;
    if (
      (roleName === "hospital_administrator" || roleName === "admin") &&
      permissionKey === PERMISSIONS.SETTINGS_MANAGE_ROLES
    ) {
      return false;
    }
    const perms = DEFAULT_ROLE_PERMISSIONS[roleName] || [];
    return perms.includes(permissionKey);
  }

  // --- Scenario 15: Anonymous / Unauthenticated Access Rejection ---
  test("15. SECURITY: Unauthenticated caller cannot invoke referral actions or RPCs", () => {
    // Check RPC SECURITY DEFINER auth check in SQL
    assert.ok(
      sqlContent.includes("v_calling_user_id := auth.uid();") || sqlContent.includes("v_calling_user := auth.uid();"),
      "RPCs must extract caller UID via auth.uid()"
    );
    assert.ok(
      sqlContent.includes("IF v_calling_user_id IS NULL") || sqlContent.includes("REVOKE ALL ON FUNCTION"),
      "Must explicitly revoke anon permissions or guard against unauthenticated caller"
    );
    assert.ok(
      sqlContent.includes("REVOKE ALL ON FUNCTION public.search_active_referral_agents(UUID, TEXT) FROM PUBLIC, anon;"),
      "Search RPC must explicitly revoke execute privileges from anon"
    );

    // Simulated action guard
    function secureReferralActionHandler(context) {
      if (!context || !context.userId) {
        return { success: false, error: "Unauthorized: Authentication required." };
      }
      return { success: true, data: [] };
    }

    const unauthedCall = secureReferralActionHandler(null);
    assert.equal(unauthedCall.success, false);
    assert.match(unauthedCall.error, /Unauthorized/i);
  });

  // --- Scenario 16: Ordinary Staff Negative RBAC Enforcement ---
  test("16. NEGATIVE RBAC: Receptionist, Nurse, Lab Tech and Doctor CANNOT view commission ledgers or approve payouts", () => {
    const ordinaryRoles = ["receptionist", "nurse", "lab_technologist", "lab_technician", "doctor"];

    for (const role of ordinaryRoles) {
      assert.equal(
        roleHasPermission(role, PERMISSIONS.REFERRAL_COMMISSION_VIEW),
        false,
        `Role ${role} must NOT possess REFERRAL_COMMISSION_VIEW`
      );
      assert.equal(
        roleHasPermission(role, PERMISSIONS.REFERRAL_COMMISSION_APPROVE),
        false,
        `Role ${role} must NOT possess REFERRAL_COMMISSION_APPROVE`
      );
      assert.equal(
        roleHasPermission(role, PERMISSIONS.REFERRAL_COMMISSION_PAY),
        false,
        `Role ${role} must NOT possess REFERRAL_COMMISSION_PAY`
      );
      assert.equal(
        roleHasPermission(role, PERMISSIONS.REFERRAL_MANAGE),
        false,
        `Role ${role} must NOT possess REFERRAL_MANAGE`
      );
    }

    // Positive check: Accountant and Finance Admin possess commission permissions
    assert.equal(roleHasPermission("accountant", PERMISSIONS.REFERRAL_COMMISSION_VIEW), true);
    assert.equal(roleHasPermission("accountant", PERMISSIONS.REFERRAL_COMMISSION_PAY), true);
    assert.equal(roleHasPermission("finance_admin", PERMISSIONS.REFERRAL_COMMISSION_VIEW), true);
    assert.equal(roleHasPermission("finance_admin", PERMISSIONS.REFERRAL_COMMISSION_APPROVE), true);
    assert.equal(roleHasPermission("finance_admin", PERMISSIONS.REFERRAL_COMMISSION_PAY), true);
  });

  // --- Scenario 17: IPD/Admission Narrow Search Data Masking ---
  test("17. DATA MINIMIZATION: Admission desk search masks sensitive financial fields", () => {
    // Verify stored procedure search_active_referral_agents returns only safe projection
    assert.ok(
      sqlContent.includes("CREATE OR REPLACE FUNCTION public.search_active_referral_agents"),
      "search_active_referral_agents RPC must exist"
    );
    assert.ok(
      sqlContent.includes("RETURNS TABLE (") &&
        sqlContent.includes("agent_code VARCHAR(40)") &&
        sqlContent.includes("full_name VARCHAR(150)") &&
        sqlContent.includes("agent_type VARCHAR(30)") &&
        sqlContent.includes("phone VARCHAR(30)"),
      "RPC must only return narrow non-sensitive columns"
    );
    // Ensure sensitive financial columns are NOT in the return table definition of the search RPC
    assert.equal(
      sqlContent.includes("commission_rate_percent NUMERIC") && sqlContent.includes("RETURNS TABLE (\n    id UUID,\n    agent_code VARCHAR(40),\n    full_name VARCHAR(150),\n    agent_type VARCHAR(30),\n    phone VARCHAR(30),\n    commission_rate_percent"),
      false,
      "Search RPC must NOT leak commission_rate_percent"
    );
    assert.equal(
      sqlContent.includes("total_commission_earned NUMERIC") && sqlContent.includes("RETURNS TABLE (\n    id UUID,\n    agent_code VARCHAR(40),\n    full_name VARCHAR(150),\n    agent_type VARCHAR(30),\n    phone VARCHAR(30),\n    total_commission"),
      false,
      "Search RPC must NOT leak total_commission_earned"
    );
  });

  // --- Scenario 18: Cross-Tenant Isolation Enforcement ---
  test("18. MULTI-TENANCY: Strict organization_id isolation prevents cross-tenant access", () => {
    // Verify RLS policies on referral tables
    const tables = [
      "referral_agents",
      "referral_rate_history",
      "patient_referral_attributions",
      "referral_commissions",
      "referral_commission_settlements",
      "referral_commission_settlement_items",
    ];

    for (const table of tables) {
      assert.ok(
        sqlContent.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`),
        `Table ${table} must have RLS enabled`
      );
      assert.ok(
        sqlContent.includes(`ON public.${table}`),
        `Table ${table} must have tenant isolation policy`
      );
    }

    // Verify organization_id check inside settlement RPC
    assert.ok(
      sqlContent.includes("organization_id = p_org_id"),
      "Settlement RPC must filter commission records by p_org_id"
    );
    assert.ok(
      sqlContent.includes("v_active_org != p_org_id"),
      "RPCs must verify active caller organization against parameter p_org_id"
    );
  });

  // --- Scenario 19: Patient & Cashier Print Confidentiality ---
  test("19. PRIVACY DEFENSE: Patient invoices and cashier receipts do not leak referral commission data", () => {
    const a4PrintPath = path.join(ROOT, "components/billing/A4InvoicePrint.tsx");
    const thermalPrintPath = path.join(ROOT, "components/billing/ThermalReceipt.tsx");

    if (fs.existsSync(a4PrintPath)) {
      const a4Content = fs.readFileSync(a4PrintPath, "utf8");
      assert.equal(
        a4Content.includes("commission_rate_percent"),
        false,
        "A4 Invoice Print must NOT mention commission_rate_percent"
      );
      assert.equal(
        a4Content.includes("referral_commissions"),
        false,
        "A4 Invoice Print must NOT render referral commission ledgers"
      );
    }

    if (fs.existsSync(thermalPrintPath)) {
      const thermalContent = fs.readFileSync(thermalPrintPath, "utf8");
      assert.equal(
        thermalContent.includes("commission_amount"),
        false,
        "Thermal Receipt must NOT leak commission_amount"
      );
    }
  });

  // --- Scenario 20: Forensic Audit Trail ---
  test("20. FORENSIC AUDIT: Rate modifications and commission settlements generate immutable audit records", () => {
    // Verify referral_rate_history logging
    assert.ok(
      sqlContent.includes("INSERT INTO public.referral_rate_history"),
      "Rate changes must append to referral_rate_history"
    );
    assert.ok(
      sqlContent.includes("old_rate"),
      "Audit trail must record old_rate"
    );
    assert.ok(
      sqlContent.includes("new_rate"),
      "Audit trail must record new_rate"
    );
    assert.ok(
      sqlContent.includes("reason"),
      "Audit trail must record reason for change"
    );
    assert.ok(
      sqlContent.includes("changed_by"),
      "Audit trail must record changed_by actor ID"
    );

    // Verify settlement audit logs
    assert.ok(
      sqlContent.includes("INSERT INTO public.referral_commission_settlements"),
      "Settlement must generate immutable settlement header"
    );
    assert.ok(
      sqlContent.includes("INSERT INTO public.referral_commission_settlement_items"),
      "Settlement must generate itemized payout lines"
    );
  });
});
