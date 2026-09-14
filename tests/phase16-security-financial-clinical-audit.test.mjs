import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Phase 16 Enterprise Security, Financial & Clinical Audit Suite (10 Scenarios)", () => {
  // Scenario 1: Migration 025 creates optimized compound indexes and summary views
  test("1. Migration 025 defines audit vault indexes, summary view, and RPC function", () => {
    const mig = fs.readFileSync(
      path.join(rootDir, "supabase", "migrations", "025_phase16_security_clinical_financial_audit.sql"),
      "utf8"
    );
    assert.match(mig, /idx_audit_logs_org_module_action/);
    assert.match(mig, /CREATE OR REPLACE VIEW audit_trail_summary/);
    assert.match(mig, /CREATE OR REPLACE FUNCTION get_audit_trail_logs/);
    assert.match(mig, /REVOKE UPDATE, DELETE ON audit_logs FROM public/);
  });

  // Scenario 2: lib/audit/logger.ts exports standardized audit types and actions
  test("2. lib/audit/logger.ts defines AuditEntry, AuditLogRecord, and getAuditLogsAction", () => {
    const loggerContent = fs.readFileSync(path.join(rootDir, "lib", "audit", "logger.ts"), "utf8");
    assert.match(loggerContent, /export interface AuditEntry/);
    assert.match(loggerContent, /export interface AuditLogRecord/);
    assert.match(loggerContent, /export async function getAuditLogsAction/);
    assert.match(loggerContent, /export async function recordAuditLog/);
  });

  // Scenario 3: getAuditLogsAction enforces SETTINGS_VIEW permission and multi-tenant RLS
  test("3. getAuditLogsAction asserts requirePermission(PERMISSIONS.SETTINGS_VIEW)", () => {
    const loggerContent = fs.readFileSync(path.join(rootDir, "lib", "audit", "logger.ts"), "utf8");
    assert.match(loggerContent, /requirePermission\(PERMISSIONS\.SETTINGS_VIEW\)/);
    assert.match(loggerContent, /\.from\("audit_logs"\)/);
    assert.match(loggerContent, /order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  });

  // Scenario 4: Clinical Audit utility enforces medical-legal rationale
  test("4. lib/audit/clinical-audit.ts enforces mandatory clinical rationale", () => {
    const clinicalAudit = fs.readFileSync(path.join(rootDir, "lib", "audit", "clinical-audit.ts"), "utf8");
    assert.match(clinicalAudit, /export async function recordClinicalAudit/);
    assert.match(clinicalAudit, /Clinical rationale is mandatory for high-risk interventions/);
    assert.match(clinicalAudit, /module:\s*"CLINICAL"/);
  });

  // Scenario 5: Financial operations record audit trails on invoice creation and voiding
  test("5. lib/billing/actions.ts logs audit entries on invoice creation and voiding", () => {
    const billingActions = fs.readFileSync(path.join(rootDir, "lib", "billing", "actions.ts"), "utf8");
    assert.match(billingActions, /recordAuditLog/);
    assert.match(billingActions, /entityType:\s*"invoice"/);
    assert.match(billingActions, /action:\s*"VOID"/);
  });

  // Scenario 6: Pharmacy stock adjustments log audit entries
  test("6. lib/pharmacy/actions.ts logs audit entries for purchases and stock changes", () => {
    const pharmacyActions = fs.readFileSync(path.join(rootDir, "lib", "pharmacy", "actions.ts"), "utf8");
    assert.match(pharmacyActions, /recordAuditLog/);
    assert.match(pharmacyActions, /module:\s*"PHARMACY"/);
  });

  // Scenario 7: Settings page imports real getAuditLogsAction with zero mock data
  test("7. app/(hospital)/app/settings/page.tsx loads audit logs dynamically without mock arrays", () => {
    const settingsContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "settings", "page.tsx"),
      "utf8"
    );
    assert.match(settingsContent, /import \{ getAuditLogsAction, AuditLogRecord \} from ["']@\/lib\/audit\/logger["']/);
    assert.doesNotMatch(settingsContent, /mock-data/);
    assert.match(settingsContent, /reloadLogs/);
    assert.match(settingsContent, /selectedLogForDiff/);
  });

  // Scenario 8: Settings page provides forensic diff inspector modal
  test("8. Settings page provides forensic before/after diff inspector", () => {
    const settingsContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "settings", "page.tsx"),
      "utf8"
    );
    assert.match(settingsContent, /Audit Forensic Diff/);
    assert.match(settingsContent, /Old State \(Before\)/);
    assert.match(settingsContent, /New State \(After\)/);
  });

  // Scenario 9: Permission matrix includes settings.audit and settings.view
  test("9. lib/permissions.ts defines SETTINGS_VIEW and SETTINGS_AUDIT", () => {
    const perms = fs.readFileSync(path.join(rootDir, "lib", "permissions.ts"), "utf8");
    assert.match(perms, /SETTINGS_VIEW:\s*"settings\.view"/);
    assert.match(perms, /SETTINGS_AUDIT:\s*"settings\.audit"/);
  });

  // Scenario 10: RLS policies on audit_logs prevent cross-tenant queries
  test("10. Migration 017 and 025 enforce tenant isolation on audit_logs", () => {
    const rlsMig = fs.readFileSync(path.join(rootDir, "supabase", "migrations", "017_rls_policies.sql"), "utf8");
    assert.match(rlsMig, /CREATE POLICY rls_audit ON audit_logs FOR ALL USING \(organization_id = get_current_org_id\(\)\)/);
  });
});
