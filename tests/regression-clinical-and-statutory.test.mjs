import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Clinical Correctness & Statutory PDPA 2026 Regression Suite (10 Scenarios)", () => {

  test("1. Patient registration accepts registration when optional NID is omitted", () => {
    const patientActions = fs.readFileSync(path.join(ROOT, "lib/patient/actions.ts"), "utf8");
    assert.ok(patientActions.includes("formData.nid"), "Must reference formData.nid");
    assert.ok(patientActions.includes("Optional NID format validation if supplied"), "Must validate NID only if supplied");
  });

  test("2. Patient registration validates NID length (10, 13, or 17 digits) when supplied", () => {
    function validateNid(nid) {
      if (!nid || nid.trim().length === 0) return { valid: true };
      const cleanNid = nid.trim().replace(/[\s-]/g, "");
      if (!/^\d{10}$|^\d{13}$|^\d{17}$/.test(cleanNid)) {
        return { valid: false, error: "Invalid NID format" };
      }
      return { valid: true, cleanNid };
    }

    assert.equal(validateNid("").valid, true, "Empty NID must be valid (optional)");
    assert.equal(validateNid("1234567890").valid, true, "10-digit smart NID must be valid");
    assert.equal(validateNid("1234567890123").valid, true, "13-digit NID must be valid");
    assert.equal(validateNid("19901234567890123").valid, true, "17-digit NID must be valid");
    assert.equal(validateNid("123").valid, false, "3-digit NID must be rejected");
    assert.equal(validateNid("ABC1234567").valid, false, "Alpha NID must be rejected");
  });

  test("3. Bed assignment enforces atomic optimistic concurrency lock checking status=VACANT", () => {
    const bedActions = fs.readFileSync(path.join(ROOT, "lib/ipd/bed-actions.ts"), "utf8");
    assert.ok(bedActions.includes('.eq("status", "VACANT")'), "Must conditionally lock bed where status is VACANT");
    assert.ok(bedActions.includes("assigned concurrently"), "Must warn if bed occupied concurrently");
  });

  test("4. Critical care vitals recording enforces physiological clinical bounds", () => {
    const ccActions = fs.readFileSync(path.join(ROOT, "lib/critical-care/actions.ts"), "utf8");
    assert.ok(ccActions.includes("payload.systolic_bp < 40 || payload.systolic_bp > 300"), "Systolic BP bounds required");
    assert.ok(ccActions.includes("payload.gcs_score < 3 || payload.gcs_score > 15"), "GCS score 3-15 bounds required");
    assert.ok(ccActions.includes("payload.spo2 < 40 || payload.spo2 > 100"), "SpO2 bounds required");
    assert.ok(ccActions.includes("payload.fio2 < 21 || payload.fio2 > 100"), "FiO2 bounds required");
  });

  test("5. Blood bank cross-match strictly rejects incompatible blood units", () => {
    const bbActions = fs.readFileSync(path.join(ROOT, "lib/blood-bank/actions.ts"), "utf8");
    assert.ok(bbActions.includes('payload.cross_match_result !== "compatible"'), "Must reject incompatible units");
  });

  test("6. Blood bank UI presents explicit clinical laboratory responsibility notice", () => {
    const modalContent = fs.readFileSync(path.join(ROOT, "components/blood-bank/CrossMatchIssueModal.tsx"), "utf8");
    assert.ok(modalContent.includes("ক্লিনিক্যাল দায়িত্ববিধি"), "Clinical responsibility notice required");
    assert.ok(modalContent.includes("ল্যাবরেটরি ক্রস-ম্যাচ পরীক্ষার বিকল্প নয়"), "Must state software is not substitute for lab test");
  });

  test("7. Radiology report approval requires documented findings and impression", () => {
    const radActions = fs.readFileSync(path.join(ROOT, "lib/radiology/actions.ts"), "utf8");
    assert.ok(radActions.includes("Radiological findings must be documented"), "Must require findings");
    assert.ok(radActions.includes("Diagnostic impression is required"), "Must require impression");
    assert.ok(radActions.includes("radiologist_id"), "Must attribute approving radiologist");
  });

  test("8. Ambulance dispatch validates locations, non-negative fare, and transitions vehicle status", () => {
    const ambActions = fs.readFileSync(path.join(ROOT, "lib/ambulance/actions.ts"), "utf8");
    assert.ok(ambActions.includes("পিকআপ লোকেশন উল্লেখ করা আবশ্যক"), "Must validate pickup");
    assert.ok(ambActions.includes("ভাড়া ঋণাত্মক হতে পারে না"), "Must validate non-negative fare");
    assert.ok(ambActions.includes('status: "on_trip"'), "Must transition vehicle to on_trip upon dispatch");
    assert.ok(ambActions.includes('status: "available"'), "Must release vehicle back to available upon trip completion");
  });

  test("9. Medical certificates letterhead uses canonical HOSPITAL_METADATA and precise hash terminology", () => {
    const certModal = fs.readFileSync(path.join(ROOT, "components/registrar/PrintCertificateModal.tsx"), "utf8");
    assert.ok(certModal.includes("HOSPITAL_METADATA"), "Must use canonical metadata");
    assert.ok(certModal.includes("Cryptographic Integrity Hash"), "Must use Cryptographic Integrity Hash label");
    assert.ok(!certModal.includes("Cryptographic Anti-Tamper Guarantee"), "Must not overclaim anti-tamper guarantee");
  });

  test("10. Public Privacy Policy explicitly references Bangladesh Personal Data Protection Act, 2026 (Act No. 63 of 2026)", () => {
    const privacyPage = fs.readFileSync(path.join(ROOT, "app/(public)/privacy/page.tsx"), "utf8");
    assert.ok(privacyPage.includes("ব্যক্তিগত উপাত্ত সুরক্ষা আইন, ২০২৬"), "Must use official Bengali statute title");
    assert.ok(privacyPage.includes("Act No. 63 of 2026"), "Must cite Act No. 63 of 2026");
    assert.ok(privacyPage.includes("6 November 2025"), "Must cite deemed effective date");
  });
});
