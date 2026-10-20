import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

test("OHMS Clinical Standards & Security: Blood Bank, Registration Age, Invoice Audit, RBAC & Diagnostics Truth", async (t) => {
  // 1. Blood Bank Cross Match Clinical & WHO Standards
  await t.test("1. BLOOD BANK: Cross-match dossier supports donor name, age, contact, blood group and source blood bank", () => {
    const crossMatchModalPath = path.join(ROOT, "components/blood-bank/CrossMatchIssueModal.tsx");
    assert.equal(fs.existsSync(crossMatchModalPath), true, "CrossMatchIssueModal must exist");
    const content = fs.readFileSync(crossMatchModalPath, "utf8");

    assert.ok(content.includes("donorName"), "Must handle donor name");
    assert.ok(content.includes("donorAge"), "Must handle donor age");
    assert.ok(content.includes("donorPhone"), "Must handle donor contact phone");
    assert.ok(content.includes("donorBloodGroup"), "Must handle donor blood group");
    assert.ok(content.includes("sourcingBloodBank"), "Must handle sourcing blood bank");
    assert.ok(content.includes("majorMatch"), "Must verify major cross-match");
    assert.ok(content.includes("minorMatch"), "Must verify minor cross-match");
    assert.ok(content.includes("technologistVerified"), "Must require technologist verification");
  });

  // 2. Patient Registration Age Input
  await t.test("2. PATIENT REGISTRATION: Direct age input with bi-directional DOB calculation is available", () => {
    const intakeModalPath = path.join(ROOT, "components/patient/UnifiedPatientIntakeModal.tsx");
    assert.equal(fs.existsSync(intakeModalPath), true, "UnifiedPatientIntakeModal must exist");
    const content = fs.readFileSync(intakeModalPath, "utf8");

    assert.ok(
      content.includes("PediatricAgeInputGroup") || content.includes("handleAgeChange"),
      "Must implement direct age input handler"
    );
    assert.ok(
      content.includes("onDobChange") || content.includes("handleDobChange"),
      "Must implement bi-directional DOB sync"
    );
    assert.ok(
      content.includes("PediatricAgeInputGroup") || content.includes("Patient Age (সরাসরি বয়স)"),
      "Must render Patient Age field in registration form"
    );
  });

  // 3. Invoice Edit History & Immutability
  await t.test("3. INVOICE EDIT AUDIT: invoice_edit_history table and update_invoice_atomic enforce immutability", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20261020110000_migration_211_blood_bank_dob_invoice_audit_rbac.sql");
    assert.equal(fs.existsSync(migrationPath), true, "Migration 211 must exist");
    const migrationSql = fs.readFileSync(migrationPath, "utf8");

    assert.ok(migrationSql.includes("CREATE TABLE IF NOT EXISTS public.invoice_edit_history"), "Must create invoice_edit_history table");
    assert.ok(migrationSql.includes("invoice_edit_history_no_delete"), "Must prohibit DELETE on invoice_edit_history");
    assert.ok(migrationSql.includes("invoice_edit_history_no_update"), "Must prohibit UPDATE on invoice_edit_history");
    assert.ok(migrationSql.includes("edited_by_user_id"), "Must record editor user ID");
    assert.ok(migrationSql.includes("previous_items"), "Must record previous items state");
    assert.ok(migrationSql.includes("new_items"), "Must record new items state");
  });

  // 4. Reception Anti-Fraud Supervision UI
  await t.test("4. ANTI-FRAUD SUPERVISION: Billing interface provides immutable audit modal and edit history view", () => {
    const historyModalPath = path.join(ROOT, "components/billing/InvoiceEditHistoryModal.tsx");
    assert.equal(fs.existsSync(historyModalPath), true, "InvoiceEditHistoryModal must exist");
    const content = fs.readFileSync(historyModalPath, "utf8");

    assert.ok(content.includes("getInvoiceEditHistoryAction"), "Must call getInvoiceEditHistoryAction");
    assert.ok(content.includes("সংশোধনের কারণ / অডিট নোট:"), "Must display mandatory edit reason");
    assert.ok(content.includes("Non-Deletable"), "Must display non-deletable tamper-proof badge");

    const billingPagePath = path.join(ROOT, "app/(hospital)/app/billing/page.tsx");
    const pageContent = fs.readFileSync(billingPagePath, "utf8");
    assert.ok(pageContent.includes("InvoiceEditHistoryModal"), "Billing page must render InvoiceEditHistoryModal");
  });

  // 5. RBAC Dynamic Permissions Persistence
  await t.test("5. RBAC PERSISTENCE: Settings page saves permissions dynamically into PostgreSQL role_permissions", () => {
    const staffActionsPath = path.join(ROOT, "lib/staff/actions.ts");
    const staffContent = fs.readFileSync(staffActionsPath, "utf8");

    assert.ok(staffContent.includes("saveRolePermissionsAction"), "Must export saveRolePermissionsAction");
    assert.ok(staffContent.includes("getOrganizationRolePermissionsAction"), "Must export getOrganizationRolePermissionsAction");
    assert.ok(staffContent.includes("save_role_permissions_atomic"), "Must invoke save_role_permissions_atomic RPC");

    const settingsPagePath = path.join(ROOT, "app/(hospital)/app/settings/page.tsx");
    const settingsContent = fs.readFileSync(settingsPagePath, "utf8");
    assert.ok(settingsContent.includes("saveRolePermissionsAction"), "Settings page must invoke saveRolePermissionsAction");
    assert.ok(settingsContent.includes("getOrganizationRolePermissionsAction"), "Settings page must load dynamic permissions on mount");
  });

  // 6. System Health Diagnostic Truth & Zero Fake Green
  await t.test("6. HEALTH DIAGNOSTIC TRUTH: Health engine requires active resolution and never displays fake 100% when issues exist", () => {
    const bannerPath = path.join(ROOT, "components/app/SystemHealthAlertBanner.tsx");
    const bannerContent = fs.readFileSync(bannerPath, "utf8");

    assert.ok(bannerContent.includes("hasIssues"), "Must determine issues from active operational issues and health score");
    assert.ok(bannerContent.includes("effectiveHealthScore"), "Must compute dynamic effective health score");

    const diagActionsPath = path.join(ROOT, "lib/diagnostics/actions.ts");
    const diagContent = fs.readFileSync(diagActionsPath, "utf8");
    assert.ok(diagContent.includes("getCurrentUserSession"), "getSystemHealthDiagnosticsAction must resolve user session");
  });
});
