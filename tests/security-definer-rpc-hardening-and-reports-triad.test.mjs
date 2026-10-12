import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Security Definer Direct-RPC Hardening & Financial Reports Basis Triad (10 Scenarios)", () => {
  // Scenario 1: Migration 166 exists and hardens delete_invoice_super_admin_atomic
  test("1. Migration 166 hardens delete_invoice_super_admin_atomic with auth.uid, super_admin role, and mandatory audit", () => {
    const migPath = path.join(
      ROOT,
      "supabase",
      "migrations",
      "20261012173000_harden_security_definer_rpcs_and_purge_audit.sql"
    );
    assert.ok(fs.existsSync(migPath), "Migration 166 must exist");
    const content = fs.readFileSync(migPath, "utf8");

    assert.match(content, /CREATE OR REPLACE FUNCTION public\.delete_invoice_super_admin_atomic/);
    assert.match(content, /v_caller := auth\.uid\(\);/, "Must inspect auth.uid() directly");
    assert.match(content, /super_admin/, "Must enforce super_admin role");
    assert.match(content, /Purge reason is mandatory/, "Must enforce non-empty reason");
    assert.match(content, /INSERT INTO public\.audit_logs/, "Must insert audit log inside SQL transaction");
    assert.match(content, /GRANT EXECUTE ON FUNCTION public\.delete_invoice_super_admin_atomic/);
    assert.match(content, /REVOKE EXECUTE ON FUNCTION public\.delete_invoice_super_admin_atomic.*FROM anon/);
  });

  // Scenario 2: Migration 166 hardens accept_diagnostic_order_atomic
  test("2. Migration 166 hardens accept_diagnostic_order_atomic with caller validation and audit", () => {
    const migPath = path.join(
      ROOT,
      "supabase",
      "migrations",
      "20261012173000_harden_security_definer_rpcs_and_purge_audit.sql"
    );
    const content = fs.readFileSync(migPath, "utf8");

    assert.match(content, /CREATE OR REPLACE FUNCTION public\.accept_diagnostic_order_atomic/);
    assert.match(content, /v_caller := auth\.uid\(\);/);
    assert.match(content, /ORDERED', 'PENDING', 'PAID/);
    assert.match(content, /INSERT INTO public\.audit_logs[\s\S]*?'ACCEPT'/);
  });

  // Scenario 3: Migration 166 hardens verify_diagnostic_order_atomic with result completeness & amendment log
  test("3. Migration 166 enforces state machine, result completeness, and diagnostic_report_verification_logs", () => {
    const migPath = path.join(
      ROOT,
      "supabase",
      "migrations",
      "20261012173000_harden_security_definer_rpcs_and_purge_audit.sql"
    );
    const content = fs.readFileSync(migPath, "utf8");

    assert.match(content, /CREATE TABLE IF NOT EXISTS public\.diagnostic_report_verification_logs/);
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.verify_diagnostic_order_atomic/);
    assert.match(content, /PROCESSING', 'SAMPLE_COLLECTED/, "Must only allow PROCESSING or SAMPLE_COLLECTED prior state");
    assert.match(content, /diagnostic_results/, "Must check result completeness before verification");
    assert.match(content, /INSERT INTO public\.audit_logs[\s\S]*?'VERIFY'/);
  });

  // Scenario 4: lib/billing/actions.ts enforces non-empty purge reason
  test("4. lib/billing/actions.ts validates non-empty reason before invoking RPC", () => {
    const billingActions = fs.readFileSync(path.join(ROOT, "lib/billing/actions.ts"), "utf8");

    assert.match(billingActions, /const purgeReason = params\.reason\?\.trim\(\);/);
    assert.match(billingActions, /Deletion reason is mandatory and cannot be empty\./);
  });

  // Scenario 5: lib/lab/actions.ts enforces prior state, completeness, and deterministic sorting
  test("5. lib/lab/actions.ts enforces state check, result completeness, and deterministic sorting", () => {
    const labActions = fs.readFileSync(path.join(ROOT, "lib/lab/actions.ts"), "utf8");

    assert.match(labActions, /orderData\.status !== "PROCESSING" && orderData\.status !== "SAMPLE_COLLECTED"/);
    assert.match(labActions, /Cannot clinically verify order without entered test results/);
    assert.match(labActions, /a\.id\.localeCompare\(b\.id\)/, "Must sort items deterministically");
    assert.match(labActions, /va\.parameter_name\.localeCompare\(vb\.parameter_name\)/, "Must sort parameters deterministically");
  });

  // Scenario 6: Financial Reports actions accept basis: accrual | cash | due
  test("6. lib/reports/actions.ts supports Basis Triad (accrual, cash, due)", () => {
    const reportsActions = fs.readFileSync(path.join(ROOT, "lib/reports/actions.ts"), "utf8");

    assert.match(reportsActions, /basis\?: "accrual" \| "cash" \| "due"/);
    assert.match(reportsActions, /query\.gt\("paid_amount", 0\)/, "Must filter cash collections");
    assert.match(reportsActions, /query\.gt\("due_amount", 0\)/, "Must filter receivables");
  });

  // Scenario 7: Reports UI renders all three basis buttons
  test("7. app/(hospital)/app/reports/page.tsx renders Accrual, Cash, and Due basis buttons", () => {
    const reportsPage = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/reports/page.tsx"), "utf8");

    assert.match(reportsPage, /reportingBasis.*"accrual" \| "cash" \| "due"/);
    assert.match(reportsPage, /অ্যাকাউন্টিং \(Accrual\)/);
    assert.match(reportsPage, /নগদ আদায় \(Cash\)/);
    assert.match(reportsPage, /বকেয়া ভিত্তি \(Due\)/);
    assert.match(reportsPage, /basis: reportingBasis/, "Must pass reportingBasis to invoice fetch action");
  });

  // Scenario 8: Net surplus calculation dynamically adapts to active basis
  test("8. app/(hospital)/app/reports/page.tsx dynamically adapts netSurplus to basis", () => {
    const reportsPage = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/reports/page.tsx"), "utf8");

    assert.match(reportsPage, /reportingBasis === "cash"/);
    assert.match(reportsPage, /reportingBasis === "due"/);
    assert.match(reportsPage, /aggregates\.historicalArDue/);
  });

  // Scenario 9: Canonical hospital metadata and logo assets
  test("9. config/hospital.ts contains Reception 01895-665114 and Office 01904210065", () => {
    const hospitalConfig = fs.readFileSync(path.join(ROOT, "config/hospital.ts"), "utf8");

    assert.match(hospitalConfig, /01895-665114/, "Reception phone required");
    assert.match(hospitalConfig, /01904210065/, "Office/Ambulance hotline required");

    const logoPath = path.join(ROOT, "public/logo.png");
    const icon192 = path.join(ROOT, "public/icons/icon-192.png");
    const icon512 = path.join(ROOT, "public/icons/icon-512.png");

    assert.ok(fs.existsSync(logoPath) && fs.statSync(logoPath).size > 1000, "Valid logo.png required");
    assert.ok(fs.existsSync(icon192) && fs.statSync(icon192).size > 1000, "Valid icon-192 required");
    assert.ok(fs.existsSync(icon512) && fs.statSync(icon512).size > 1000, "Valid icon-512 required");
  });

  // Scenario 10: Settings page allows Super Admin to modify, edit, reset, and clear details
  test("10. app/(hospital)/app/settings/page.tsx provides full CRUD and reset/clear controls", () => {
    const settingsPage = fs.readFileSync(path.join(ROOT, "app/(hospital)/app/settings/page.tsx"), "utf8");

    assert.match(settingsPage, /Reception Phone \(রিসিপশন\)/);
    assert.match(settingsPage, /Office & Emergency Phone \(অফিস\)/);
    assert.match(settingsPage, /Ambulance Hotline \(অ্যাম্বুলেন্স\)/);
    assert.match(settingsPage, /Save Hospital Master Data/);
    assert.match(settingsPage, /Reset to Approved Master Data/);
    assert.match(settingsPage, /মুছে ফেলুন \(Clear All\)/);
  });
});
