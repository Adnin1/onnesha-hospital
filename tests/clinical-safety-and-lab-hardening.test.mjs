import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

describe("OHMS Clinical Safety & Diagnostic Lab Hardening Suite (10 Scenarios)", () => {
  // Scenario 1: LabResultEntryModal has zero normal/descriptive template auto-population
  test("1. LabResultEntryModal does not contain fake normal template auto-fill or mock descriptive text", () => {
    const modalPath = path.join(rootDir, "components", "lab", "LabResultEntryModal.tsx");
    const content = fs.readFileSync(modalPath, "utf8");
    assert.doesNotMatch(content, /NORMAL_TEMPLATES/, "NORMAL_TEMPLATES must not exist in LabResultEntryModal");
    assert.doesNotMatch(content, /DESCRIPTIVE_TEMPLATES/, "DESCRIPTIVE_TEMPLATES must not exist in LabResultEntryModal");
    assert.doesNotMatch(content, /handleApplyNormalTemplate/, "Autofill button handler must not exist");
    assert.match(content, /ক্লিনিক্যাল ফলাফল এন্ট্রি/, "Must display standard clinical measurement entry header");
  });

  // Scenario 2: app/(hospital)/app/lab/page.tsx has zero fake doctor / BMDC fallback identities
  test("2. Lab page print template does not fallback to hardcoded fake doctor or BMDC registration", () => {
    const labPagePath = path.join(rootDir, "app", "(hospital)", "app", "lab", "page.tsx");
    const content = fs.readFileSync(labPagePath, "utf8");
    assert.doesNotMatch(content, /Dr\.\s*Farhana\s*Yasmin/i, "Dr. Farhana Yasmin fake fallback must not exist");
    assert.doesNotMatch(content, /A-68421/, "Fake BMDC registration A-68421 must not exist");
    assert.match(content, /selectedOrder\.verified_by_doctor/, "Must resolve verifier from doctor record");
    assert.match(content, /selectedOrder\.verified_by_profile/, "Must resolve verifier from profile record");
  });

  // Scenario 3: Quality certification claims and signature terminology sanitized
  test("3. Lab page uses SOP quality statement and electronic verification terminology", () => {
    const labPagePath = path.join(rootDir, "app", "(hospital)", "app", "lab", "page.tsx");
    const content = fs.readFileSync(labPagePath, "utf8");
    assert.doesNotMatch(content, /Bio-Rad External Quality Assurance Certified/i, "Unsupported Bio-Rad claim must be removed");
    assert.match(content, /Clinical Laboratory Quality Controlled \(SOP\)/, "Must use standard SOP QA text");
    assert.match(content, /ELECTRONICALLY VERIFIED/, "Must use electronic verification terminology");
    assert.match(content, /Verification Integrity Hash/, "Must label SHA-256 digest accurately");
  });

  // Scenario 4: verifyDiagnosticReportAction requires lab.verify permission
  test("4. verifyDiagnosticReportAction strictly requires lab.verify permission", () => {
    const actionsPath = path.join(rootDir, "lib", "lab", "actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.match(content, /await\s+requirePermission\("lab\.verify"\)/, "Must require lab.verify permission");
  });

  // Scenario 5: Verification hash covers canonical serialized report content
  test("5. Verification hash covers canonical serialized report content and measured values", () => {
    const actionsPath = path.join(rootDir, "lib", "lab", "actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.match(content, /canonicalPayload/, "Must construct canonical serialized report payload");
    assert.match(content, /createHash\("sha256"\)\s*\.update\(canonicalPayload\)\s*\.digest\("hex"\)/, "Must hash canonical report content");
  });

  // Scenario 6: Editing results resets VERIFIED status and purges prior verification
  test("6. saveDiagnosticResultsAction invalidates prior verification if edited post-verification", () => {
    const actionsPath = path.join(rootDir, "lib", "lab", "actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.match(content, /existingOrder\?\.status === "VERIFIED"/, "Must detect if existing order was VERIFIED");
    assert.match(content, /verified_by_profile_id:\s*null/, "Must reset verified_by_profile_id");
    assert.match(content, /verified_at:\s*null/, "Must reset verified_at");
    assert.match(content, /\.delete\(\)\s*\.eq\("order_item_id"/, "Must purge invalidated verification record");
  });

  // Scenario 7: deliverDiagnosticOrderAction enforces VERIFIED precondition
  test("7. deliverDiagnosticOrderAction blocks delivery unless order is in VERIFIED state", () => {
    const actionsPath = path.join(rootDir, "lib", "lab", "actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.match(content, /orderRec\.status !== "VERIFIED"/, "Must check order status is VERIFIED");
    assert.match(content, /!orderRec\.verified_by_profile_id/, "Must verify authenticated verifier identity");
    assert.match(content, /\.eq\("status", "VERIFIED"\)/, "Must gate database update with status: VERIFIED");
  });

  // Scenario 8: acceptDiagnosticOrderAction calls atomic RPC
  test("8. acceptDiagnosticOrderAction calls accept_diagnostic_order_atomic RPC", () => {
    const actionsPath = path.join(rootDir, "lib", "lab", "actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.match(content, /accept_diagnostic_order_atomic/, "Must call accept_diagnostic_order_atomic RPC");
  });

  // Scenario 9: Migration 165 defines atomic acceptance and verification RPCs
  test("9. Migration 165 defines accept_diagnostic_order_atomic and verify_diagnostic_order_atomic", () => {
    const migPath = path.join(
      rootDir,
      "supabase",
      "migrations",
      "20261012160000_accept_diagnostic_order_atomic_and_clinical_safety.sql"
    );
    assert.ok(fs.existsSync(migPath), "Migration 165 file must exist");
    const content = fs.readFileSync(migPath, "utf8");
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.accept_diagnostic_order_atomic/);
    assert.match(content, /CREATE OR REPLACE FUNCTION public\.verify_diagnostic_order_atomic/);
    assert.match(content, /GRANT EXECUTE ON FUNCTION public\.accept_diagnostic_order_atomic/);
    assert.match(content, /FOR UPDATE/);
  });

  // Scenario 10: Financial reports date range does not generate +275760 overflow
  test("10. Financial reports getDhakaDateRange('all') exports safe ISO bounds without year overflow", () => {
    const finPath = path.join(rootDir, "lib", "reports", "financial.ts");
    const content = fs.readFileSync(finPath, "utf8");
    assert.doesNotMatch(content, /8640000000000000/, "Unsafe timestamp 8640000000000000 must not be used");
    assert.match(content, /9999-12-31T23:59:59\.999Z/, "Safe ISO ceiling 9999-12-31 must be used");
  });
});
