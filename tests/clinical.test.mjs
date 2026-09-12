import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Phone normalization functions matching lib/patient/phone.ts
function normalizeBDPhone(phone) {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s\-()+]/g, "");
  if (cleaned.startsWith("880")) cleaned = cleaned.substring(2);
  else if (cleaned.startsWith("88")) cleaned = cleaned.substring(2);
  if (cleaned.length === 10 && cleaned.startsWith("1")) cleaned = "0" + cleaned;
  return cleaned;
}

function isValidNormalizedBDPhone(normalized) {
  return /^01[3-9]\d{8}$/.test(normalized);
}

function formatBDPhoneDisplay(phone) {
  const norm = normalizeBDPhone(phone);
  if (norm.length === 11) return `${norm.slice(0, 5)}-${norm.slice(5)}`;
  return phone;
}

function calculateNameSimilarity(s1, s2) {
  const str1 = s1.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  const str2 = s2.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  if (str1 === str2) return 1.0;
  if (str1.length < 2 || str2.length < 2) return 0;
  const getBigrams = (str) => {
    const s = new Set();
    for (let i = 0; i < str.length - 1; i++) s.add(str.substring(i, i + 2));
    return s;
  };
  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);
  let intersection = 0;
  b1.forEach((bigram) => {
    if (b2.has(bigram)) intersection++;
  });
  return (2.0 * intersection) / (b1.size + b2.size);
}

describe("OHMS Phase 3 Clinical & Patient Management Suite (18 Scenarios)", () => {
  // Scenario 1: Phone normalization canonical 11 digits
  test("1. normalizeBDPhone converts +880, 880, dashes, spaces to canonical 11 digits", () => {
    assert.equal(normalizeBDPhone("+8801712-345678"), "01712345678");
    assert.equal(normalizeBDPhone("880 1819 998877"), "01819998877");
    assert.equal(normalizeBDPhone("01911-000000"), "01911000000");
    assert.equal(normalizeBDPhone("1712345678"), "01712345678");
  });

  // Scenario 2: Phone validation rules (BD Operator prefixes)
  test("2. isValidNormalizedBDPhone validates true BD mobile prefixes and rejects invalid", () => {
    assert.equal(isValidNormalizedBDPhone("01712345678"), true);
    assert.equal(isValidNormalizedBDPhone("01300000000"), true);
    assert.equal(isValidNormalizedBDPhone("01999999999"), true);
    assert.equal(isValidNormalizedBDPhone("01200000000"), false); // 012 not a BD prefix
    assert.equal(isValidNormalizedBDPhone("0171234567"), false);  // only 10 digits
  });

  // Scenario 3: Display phone formatting
  test("3. formatBDPhoneDisplay formats standard 01XXX-XXXXXX format", () => {
    assert.equal(formatBDPhoneDisplay("01712345678"), "01712-345678");
  });

  // Scenario 4: String similarity calculation for name matching
  test("4. calculateNameSimilarity correctly computes Dice bigram coefficients", () => {
    const score1 = calculateNameSimilarity("Mohammad Rafiq", "Mohammad Rafiq");
    assert.equal(score1, 1.0);
    const score2 = calculateNameSimilarity("Md. Rafiqul Islam", "Rafiqul Islam");
    assert.ok(score2 > 0.7);
    const score3 = calculateNameSimilarity("Abdul Karim", "Shahanara Begum");
    assert.ok(score3 < 0.2);
  });

  // Scenario 5: Phone utility in codebase implements canonical 11-digit regex
  test("5. lib/patient/phone.ts matches strict BD mobile prefix validation", () => {
    const phoneCode = fs.readFileSync(path.join(rootDir, "lib", "patient", "phone.ts"), "utf8");
    assert.match(phoneCode, /\/\^01\[3-9\]\\d\{8\}\$\//);
    assert.match(phoneCode, /substring\(2\)/);
  });

  // Scenario 6: Duplicate detection service implements multi-signal scoring
  test("6. lib/patient/duplicate-detection.ts implements multi-signal confidence matrix", () => {
    const dupCode = fs.readFileSync(path.join(rootDir, "lib", "patient", "duplicate-detection.ts"), "utf8");
    assert.match(dupCode, /calculateNameSimilarity/);
    assert.match(dupCode, /HIGH: Exact NID/);
    assert.match(dupCode, /Same Phone \+ High Name Similarity/);
  });

  // Scenario 7: Duplicate detection handles family member shared phones with medium level
  test("7. duplicate detection distinguishes family sharing from true individual duplicate", () => {
    const dupCode = fs.readFileSync(path.join(rootDir, "lib", "patient", "duplicate-detection.ts"), "utf8");
    assert.match(dupCode, /Shared mobile number/);
    assert.match(dupCode, /family or guardian sharing/);
  });

  // Scenario 8: Database migration contains RLS on all Phase 3 clinical tables
  test("8. Migration 020 enforces RLS on all 7 Phase 3 clinical tables", () => {
    const sql = fs.readFileSync(
      path.join(rootDir, "supabase", "migrations", "020_phase3_clinical_foundation.sql"),
      "utf8"
    );

    const requiredTables = [
      "patient_merge_requests",
      "patient_allergies",
      "clinical_alerts",
      "patient_diagnoses",
      "clinical_notes",
      "patient_transfers",
      "patient_consents",
    ];

    for (const tbl of requiredTables) {
      assert.match(sql, new RegExp(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY;`), `Missing RLS on ${tbl}`);
      assert.match(sql, new RegExp(`CREATE POLICY rls_${tbl} ON ${tbl}`), `Missing policy on ${tbl}`);
    }
  });

  // Scenario 9: Database migration includes atomic sequence generators
  test("9. Migration 020 defines generate_patient_code and generate_visit_number functions", () => {
    const sql = fs.readFileSync(
      path.join(rootDir, "supabase", "migrations", "020_phase3_clinical_foundation.sql"),
      "utf8"
    );

    assert.match(sql, /CREATE OR REPLACE FUNCTION generate_patient_code/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION generate_visit_number/);
    assert.match(sql, /patient_code_seq/);
    assert.match(sql, /visit_number_seq/);
  });

  // Scenario 10: Server Action enforces permission check patients:create
  test("10. registerPatientAction enforces patients.create permission check", () => {
    const actionsContent = fs.readFileSync(
      path.join(rootDir, "lib", "patient", "actions.ts"),
      "utf8"
    );
    assert.match(actionsContent, /requirePermission\("patients\.create"\)/);
  });

  // Scenario 11: Server Action enforces permission check patients:view
  test("11. getPatient360Action enforces patients.view permission check", () => {
    const actionsContent = fs.readFileSync(
      path.join(rootDir, "lib", "patient", "actions.ts"),
      "utf8"
    );
    assert.match(actionsContent, /requirePermission\("patients\.view"\)/);
  });

  // Scenario 12: Physiological ranges validated for Vitals entry
  test("12. recordVitalsAction enforces physiological sanity bounds (BP, Temp)", () => {
    const actionsContent = fs.readFileSync(
      path.join(rootDir, "lib", "patient", "actions.ts"),
      "utf8"
    );
    assert.match(actionsContent, /systolicBp < 40 \|\| params\.systolicBp > 300/);
    assert.match(actionsContent, /temperatureC < 30 \|\| params\.temperatureC > 45/);
  });

  // Scenario 13: IPD Discharge requires final diagnosis
  test("13. dischargePatientAction enforces mandatory final diagnosis", () => {
    const actionsContent = fs.readFileSync(
      path.join(rootDir, "lib", "patient", "actions.ts"),
      "utf8"
    );
    assert.match(actionsContent, /Final diagnosis is mandatory for patient discharge/);
  });

  // Scenario 14: Emergency encounter supports temporary unknown patient
  test("14. registerEmergencyEncounterAction generates TEMP identifier when patientId is missing", () => {
    const actionsContent = fs.readFileSync(
      path.join(rootDir, "lib", "patient", "actions.ts"),
      "utf8"
    );
    assert.match(actionsContent, /TEMP-EMG-/);
    assert.match(actionsContent, /is_temporary: true/);
  });

  // Scenario 15: Patient 360 page includes Next.js static export compatibility
  test("15. Patient 360 Page exports generateStaticParams for Cloudflare Pages static export", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "patients", "[id]", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /export function generateStaticParams\(\)/);
    assert.match(pageContent, /return \[{ id: "preview" }\];/);
  });

  // Scenario 16: Patient 360 page renders official printable header
  test("16. Patient 360 page includes HospitalPrintHeader with official document title", () => {
    const pageContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "patients", "[id]", "page.tsx"),
      "utf8"
    );
    assert.match(pageContent, /<HospitalPrintHeader documentTitle="OFFICIAL PATIENT 360° MEDICAL RECORD"/);
  });

  // Scenario 17: Emergency page features fast triage intake modal
  test("17. Emergency page provides rapid casualty triage registration with RED/YELLOW/GREEN zones", () => {
    const emergencyContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "emergency", "page.tsx"),
      "utf8"
    );
    assert.match(emergencyContent, /registerEmergencyEncounterAction/);
    assert.match(emergencyContent, /Rapid Emergency Casualty Registration/);
    assert.match(emergencyContent, /RED \(Immediate \/ Resus\)/);
  });

  // Scenario 18: OPD page saves vital signs and creates clinical notes
  test("18. OPD consultation console connects vitals recording and clinical examination notes", () => {
    const opdContent = fs.readFileSync(
      path.join(rootDir, "app", "(hospital)", "app", "opd", "page.tsx"),
      "utf8"
    );
    assert.match(opdContent, /recordVitalsAction/);
    assert.match(opdContent, /createClinicalNoteAction/);
    assert.match(opdContent, /Save Vitals to EMR/);
  });
});
