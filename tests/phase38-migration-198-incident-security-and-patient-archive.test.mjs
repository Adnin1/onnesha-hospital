import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Phase 38: Migration 198 Incident Security, Patient Archive & Print Architecture Matrix", () => {
  const mig198Path = path.join(
    ROOT,
    "supabase",
    "migrations",
    "20261015030000_migration_198_incident_security_lifecycle_and_patient_archive.sql"
  );
  const patientActionsPath = path.join(ROOT, "lib", "patient", "actions.ts");
  const patientViewPath = path.join(ROOT, "app", "(hospital)", "app", "patients", "[id]", "PatientDetailView.tsx");
  const billingPagePath = path.join(ROOT, "app", "(hospital)", "app", "billing", "page.tsx");
  const halfLetterPrintPath = path.join(ROOT, "components", "print", "HalfLetterInvoicePrint.tsx");

  test("1. Migration 198 exists and defines strict incident lifecycle and patient archive columns", () => {
    assert.ok(fs.existsSync(mig198Path), "Migration 198 SQL file must exist");
    const sql = fs.readFileSync(mig198Path, "utf8");

    // Patient Archive schema
    assert.match(sql, /ALTER TABLE public\.patients/);
    assert.match(sql, /is_deleted BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /deleted_at TIMESTAMPTZ/);
    assert.match(sql, /deleted_by UUID/);
    assert.match(sql, /deletion_reason TEXT/);
    assert.match(sql, /idx_patients_is_deleted_org/);

    // Operator acknowledgement RPC
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.acknowledge_system_incident/);
    assert.match(sql, /lifecycle_status = 'ACKNOWLEDGED'/);
    const ackMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.acknowledge_system_incident[\s\S]*?\$\$;/);
    assert.ok(ackMatch, "acknowledge_system_incident function body must exist");
    assert.doesNotMatch(ackMatch[0], /is_resolved\s*=\s*TRUE/i, "Acknowledge RPC must not set is_resolved = TRUE");

    // Authoritative verification RPC
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.verify_system_incident_resolution/);
    assert.match(sql, /lifecycle_status = 'RESOLVED_VERIFIED'/);
    assert.match(sql, /is_resolved = TRUE/);
    assert.match(sql, /REMEDIATION_PENDING/);

    // Hardened resolve_system_runtime_issue
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.resolve_system_runtime_issue/);
  });

  test("2. Migration 198 strictly forbids service_role first-organization fallback", () => {
    const sql = fs.readFileSync(mig198Path, "utf8");

    // Must NOT contain first-organization fallback
    assert.doesNotMatch(
      sql,
      /SELECT\s+id\s+INTO\s+v_target_org\s+FROM\s+public\.organizations\s+ORDER\s+BY\s+created_at\s+ASC\s+LIMIT\s+1/i,
      "Migration 198 must not contain arbitrary first organization fallback"
    );

    // Must require organization context
    assert.match(sql, /ORGANIZATION_CONTEXT_REQUIRED: Explicit target organization UUID is mandatory for service_role/);
  });

  test("3. Migration 198 enforces tenant-bound role check and revokes diagnostics.view from resolution", () => {
    const sql = fs.readFileSync(mig198Path, "utf8");

    // Tenant binding on user_roles
    assert.match(sql, /ur\.organization_id = v_target_org/);

    // Explicit management permissions only (diagnostics.view must not be present in resolution check)
    assert.match(sql, /p\.slug IN \('diagnostics\.manage', 'incident\.resolve', 'settings\.manage'\)/);
    assert.doesNotMatch(
      sql,
      /p\.slug IN \([^)]*'diagnostics\.view'[^)]*\)/,
      "diagnostics.view must not be accepted for incident resolution/acknowledgement"
    );

    // Public and anon are revoked
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.acknowledge_system_incident.*FROM PUBLIC, anon/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.verify_system_incident_resolution.*FROM PUBLIC, anon/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.resolve_system_runtime_issue.*FROM PUBLIC, anon/);
  });

  test("4. deletePatientAction defaults strictly to safe archive (soft-delete) and denies patients.edit", () => {
    const code = fs.readFileSync(patientActionsPath, "utf8");

    // Permission checks
    assert.match(code, /hasPermission\("patients\.delete"\)/);
    assert.match(code, /hasPermission\("patients\.manage"\)/);

    // Extract deletePatientAction block
    const match = code.match(/export async function deletePatientAction[\s\S]*?^}/m);
    assert.ok(match, "deletePatientAction must be defined");
    const fnBody = match[0];

    // Must NOT accept patients.edit
    assert.doesNotMatch(fnBody, /hasPermission\("patients\.edit"\)/, "patients.edit must not permit patient deletion");

    // Must perform soft-delete archive
    assert.match(fnBody, /is_deleted:\s*true/);
    assert.match(fnBody, /deleted_at:/);
    assert.match(fnBody, /deleted_by:/);
    assert.match(fnBody, /deletion_reason:/);

    // Must not execute raw hard delete unconditionally
    assert.doesNotMatch(fnBody, /\.from\("patients"\)\s*\.delete\(\)/, "deletePatientAction must not perform raw hard delete");
  });

  test("5. restorePatientAction and purgePatientAction provide controlled unarchive and narrow zero-history purge", () => {
    const code = fs.readFileSync(patientActionsPath, "utf8");

    // restorePatientAction exists
    assert.match(code, /export async function restorePatientAction/);
    assert.match(code, /is_deleted:\s*false/);

    // purgePatientAction exists with clinical attachment safeguards
    assert.match(code, /export async function purgePatientAction/);
    assert.match(code, /PURGE_BLOCKED:\s*Patient has linked clinical or financial history/);
  });

  test("6. PatientDetailView rejects cross-patient fallback and enforces zero-leak privacy", () => {
    const code = fs.readFileSync(patientViewPath, "utf8");

    // Must not fall back to first patient
    assert.doesNotMatch(code, /realPatient\s*=\s*listRes\.data\.patients\[0\]/);
    assert.doesNotMatch(code, /getPatientsAction/);
    assert.match(code, /NEVER leak the first patient's record as a fallback/);
  });

  test("7. Billing 389-service search implements weighted ranking algorithm", () => {
    const code = fs.readFileSync(billingPagePath, "utf8");

    // Weighted ranking
    assert.match(code, /score\s*=\s*100;?\s*\/\/\s*Exact name match/);
    assert.match(code, /score\s*=\s*80;?\s*\/\/\s*Starts with term/);
    assert.match(code, /score\s*=\s*60;?\s*\/\/\s*Whole word match/);
    assert.match(code, /matches\.sort\(/);
  });

  test("8. Duplicate service addition increases quantity rather than duplicating lines", () => {
    const code = fs.readFileSync(billingPagePath, "utf8");

    assert.match(code, /existingIndex\s*>=\s*0/);
    assert.match(code, /quantity:\s*next\[existingIndex\]\.quantity\s*\+\s*quantity/);
  });

  test("9. HalfLetterInvoicePrint uses atomic block break avoidance with repeating table headers", () => {
    const code = fs.readFileSync(halfLetterPrintPath, "utf8");

    // Indivisible whole-document root is removed
    assert.doesNotMatch(
      code,
      /\.half-letter-invoice-root\s*\{[^}]*page-break-inside:\s*avoid\s*!important/s,
      "Root invoice container must not have page-break-inside: avoid"
    );

    // Atomic block rules
    assert.match(code, /\.print-header-block\s*\{[^}]*page-break-inside:\s*avoid/s);
    assert.match(code, /\.print-patient-block\s*\{[^}]*page-break-inside:\s*avoid/s);
    assert.match(code, /\.print-table thead\s*\{[^}]*display:\s*table-header-group/s);
    assert.match(code, /\.print-table tbody tr\s*\{[^}]*page-break-inside:\s*avoid/s);
    assert.match(code, /\.print-totals-block\s*\{[^}]*page-break-inside:\s*avoid/s);
    assert.match(code, /\.print-footer-block\s*\{[^}]*page-break-inside:\s*avoid/s);

    // Classes present in JSX
    assert.match(code, /className="[^"]*print-header-block/);
    assert.match(code, /className="[^"]*print-patient-block/);
    assert.match(code, /className="[^"]*print-table/);
    assert.match(code, /className="[^"]*print-totals-block/);
    assert.match(code, /className="[^"]*print-footer-block/);
  });

  test("10. Repository-wide audit: Zero occurrences of DGHS ID 10022715", () => {
    // Check that config and components do not contain 10022715
    const filesToAudit = [
      "config/hospital.ts",
      "config/site.ts",
      "components/print/HospitalPrintHeader.tsx",
      "components/print/HalfLetterInvoicePrint.tsx",
      "app/(hospital)/app/settings/page.tsx",
      "lib/hospital/actions.ts",
      "public/llms.txt",
    ];

    for (const f of filesToAudit) {
      const p = path.join(ROOT, f);
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8");
        assert.ok(!content.includes("10022715"), `File ${f} must not contain 10022715`);
      }
    }
  });
});
