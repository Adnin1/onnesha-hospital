import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_MODULE_DEFINITIONS,
} from "../../lib/permissions.ts";

test("OHMS Granular RBAC Matrix & Action Privileges Certification", async (t) => {
  await t.test("1. MODULE DEFINITIONS: All 10 core hospital modules are defined with action metadata", () => {
    assert.strictEqual(PERMISSION_MODULE_DEFINITIONS.length >= 10, true);
    const moduleIds = PERMISSION_MODULE_DEFINITIONS.map((m) => m.id);
    
    const requiredModules = [
      "expenses",
      "referrals",
      "billing",
      "patients",
      "ipd_beds",
      "blood_bank",
      "lab",
      "pharmacy",
      "doctors_staff",
      "settings_audit",
    ];

    for (const req of requiredModules) {
      assert.strictEqual(moduleIds.includes(req), true, `Module ${req} must be defined`);
    }

    // Every permission must have key, banglaLabel, action, and description
    for (const mod of PERMISSION_MODULE_DEFINITIONS) {
      assert.ok(mod.banglaTitle, `Module ${mod.id} must have banglaTitle`);
      for (const p of mod.permissions) {
        assert.ok(p.key, `Permission in ${mod.id} missing key`);
        assert.ok(p.banglaLabel, `Permission ${p.key} missing banglaLabel`);
        assert.ok(["VIEW", "CREATE", "EDIT", "DELETE", "MANAGE"].includes(p.action), `Invalid action ${p.action} for ${p.key}`);
        assert.ok(p.description, `Permission ${p.key} missing description`);
      }
    }
  });

  await t.test("2. EXPENSES & REFERRALS ZERO-LEAK: Receptionist cannot access expenses or referrals by default", () => {
    const receptionistPerms = DEFAULT_ROLE_PERMISSIONS.receptionist || [];
    
    // Expenses checks
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.EXPENSES_VIEW), false, "Receptionist must NOT have expenses.view");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.EXPENSES_CREATE), false, "Receptionist must NOT have expenses.create");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.EXPENSES_EDIT), false, "Receptionist must NOT have expenses.edit");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.EXPENSES_DELETE), false, "Receptionist must NOT have expenses.delete");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.EXPENSES_MANAGE), false, "Receptionist must NOT have expenses.manage");

    // Referral checks
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.REFERRAL_VIEW), false, "Receptionist must NOT have referral.view");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.REFERRAL_CREATE), false, "Receptionist must NOT have referral.create");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.REFERRAL_EDIT), false, "Receptionist must NOT have referral.edit");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.REFERRAL_DELETE), false, "Receptionist must NOT have referral.delete");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.REFERRAL_MANAGE), false, "Receptionist must NOT have referral.manage");
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.REFERRAL_COMMISSION_PAY), false, "Receptionist must NOT have referral.commission.pay");

    // Only referral.assign allowed for intake
    assert.strictEqual(receptionistPerms.includes(PERMISSIONS.REFERRAL_ASSIGN), true, "Receptionist can only assign partner during patient intake");
  });

  await t.test("3. NAVIGATION INTEGRITY: Expenses route is guarded by EXPENSES_VIEW not BILLING_VIEW", () => {
    const navPath = path.resolve(process.cwd(), "config/navigation.ts");
    const content = fs.readFileSync(navPath, "utf-8");
    
    assert.match(
      content,
      /href:\s*"\/app\/expenses",[\s\S]*?perm:\s*PERMISSIONS\.EXPENSES_VIEW/,
      "/app/expenses must strictly require PERMISSIONS.EXPENSES_VIEW"
    );
  });

  await t.test("4. ACTION HANDLERS ENCLOSURE: Expenses actions enforce granular permissions", () => {
    const expActionPath = path.resolve(process.cwd(), "lib/expenses/actions.ts");
    const expContent = fs.readFileSync(expActionPath, "utf-8");

    assert.ok(expContent.includes('expenses.view'), "getExpensesAction must check expenses.view");
    assert.ok(expContent.includes('expenses.create'), "createExpenseAction must check expenses.create");
    assert.ok(expContent.includes('expenses.edit'), "updateExpenseAction must check expenses.edit");
    assert.ok(expContent.includes('expenses.delete'), "deleteExpenseAction must check expenses.delete");
  });

  await t.test("5. ACTION HANDLERS ENCLOSURE: Referral actions enforce granular permissions", () => {
    const refActionPath = path.resolve(process.cwd(), "lib/referrals/actions.ts");
    const refContent = fs.readFileSync(refActionPath, "utf-8");

    assert.ok(refContent.includes('referral.view'), "getReferralAgentsAction must check referral.view");
    assert.ok(refContent.includes('referral.create'), "createReferralAgentAction must check referral.create");
    assert.ok(refContent.includes('referral.edit'), "updateReferralAgentAction must check referral.edit");
    assert.ok(refContent.includes('referral.delete'), "deleteReferralAgentAction must check referral.delete");
  });

  await t.test("6. UI CLIENT GUARDS: Expenses and Referrals pages have Access Denied fallback screens", () => {
    const expPage = fs.readFileSync(path.resolve(process.cwd(), "app/(hospital)/app/expenses/page.tsx"), "utf-8");
    assert.ok(expPage.includes("Access Restricted"), "Expenses page must render access restricted screen when permission denied");

    const refPage = fs.readFileSync(path.resolve(process.cwd(), "app/(hospital)/app/referrals/page.tsx"), "utf-8");
    assert.ok(refPage.includes("Access Restricted"), "Referrals page must render access restricted screen when permission denied");
  });

  await t.test("7. SETTINGS PAGE RBAC: Provides Module Filters, Search, and Bulk Granular Toggles", () => {
    const settingsPage = fs.readFileSync(path.resolve(process.cwd(), "app/(hospital)/app/settings/page.tsx"), "utf-8");
    assert.ok(settingsPage.includes("PERMISSION_MODULE_DEFINITIONS"), "Settings must consume PERMISSION_MODULE_DEFINITIONS");
    assert.ok(settingsPage.includes("selectedModuleFilter"), "Settings must support module filtering");
    assert.ok(settingsPage.includes("toggleModulePermissions"), "Settings must support granting/revoking whole module");
    assert.ok(settingsPage.includes("handleResetRoleToDefault"), "Settings must support resetting role to official default");
  });
});
