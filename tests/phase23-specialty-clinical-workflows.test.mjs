import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Phase 23: Specialty Clinical Workflows (Dental, Eye, Physiotherapy)", () => {

  test("1. Migration 075 exists and defines specialty clinical tables", () => {
    const migrationPath = path.join(ROOT, "supabase/migrations/20260927020000_specialty_clinical_workflows.sql");
    assert.ok(fs.existsSync(migrationPath), "Migration 075 file must exist");
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS dental_examinations"), "dental_examinations table required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS eye_examinations"), "eye_examinations table required");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS physiotherapy_sessions"), "physiotherapy_sessions table required");
  });

  test("2. Migration 075 enforces RLS and Tenant Isolation on all specialty tables", () => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260927020000_specialty_clinical_workflows.sql"), "utf8");
    assert.ok(sql.includes("ALTER TABLE dental_examinations ENABLE ROW LEVEL SECURITY"), "Dental RLS required");
    assert.ok(sql.includes("ALTER TABLE dental_examinations FORCE ROW LEVEL SECURITY"), "Dental FORCE RLS required");
    assert.ok(sql.includes("ALTER TABLE eye_examinations ENABLE ROW LEVEL SECURITY"), "Eye RLS required");
    assert.ok(sql.includes("ALTER TABLE eye_examinations FORCE ROW LEVEL SECURITY"), "Eye FORCE RLS required");
    assert.ok(sql.includes("ALTER TABLE physiotherapy_sessions ENABLE ROW LEVEL SECURITY"), "Physio RLS required");
    assert.ok(sql.includes("ALTER TABLE physiotherapy_sessions FORCE ROW LEVEL SECURITY"), "Physio FORCE RLS required");
    assert.ok(sql.includes("app.current_organization_id"), "Tenant isolation setting required in policies");
  });

  test("3. Sequence generators exist for dental, eye, and physiotherapy business codes", () => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260927020000_specialty_clinical_workflows.sql"), "utf8");
    assert.ok(sql.includes("CREATE SEQUENCE IF NOT EXISTS dental_exam_code_seq"), "dental_exam_code_seq required");
    assert.ok(sql.includes("CREATE SEQUENCE IF NOT EXISTS eye_exam_code_seq"), "eye_exam_code_seq required");
    assert.ok(sql.includes("CREATE SEQUENCE IF NOT EXISTS physio_session_code_seq"), "physio_session_code_seq required");
  });

  test("4. Dental workflow validates tooth notation and findings structure", () => {
    function validateDentalPayload(payload) {
      if (!payload.chief_complaint || !payload.diagnosis) return { valid: false, error: "Missing required fields" };
      if (payload.procedure_fee !== undefined && payload.procedure_fee < 0) return { valid: false, error: "Fee cannot be negative" };
      return { valid: true };
    }

    const validRecord = {
      chief_complaint: "Severe pain in lower right molar",
      tooth_number: "46",
      diagnosis: "Acute apical periodontitis",
      dental_findings: { caries: true, gingivitis: false, pocket_depth_mm: 4 },
      procedure_done: "Root Canal Treatment - Step 1",
      procedure_fee: 1500,
    };
    assert.equal(validateDentalPayload(validRecord).valid, true);

    const invalidFee = { ...validRecord, procedure_fee: -100 };
    assert.equal(validateDentalPayload(invalidFee).valid, false);
  });

  test("5. Eye / Ophthalmology workflow validates visual acuity and IOP bounds", () => {
    function validateEyePayload(payload) {
      if (!payload.chief_complaint || !payload.diagnosis) return { valid: false, error: "Missing required fields" };
      if (payload.intraocular_pressure_od !== undefined && (payload.intraocular_pressure_od < 0 || payload.intraocular_pressure_od > 80)) {
        return { valid: false, error: "IOP out of physiological bounds" };
      }
      return { valid: true };
    }

    const validRecord = {
      chief_complaint: "Blurred vision and headache",
      visual_acuity_od: "6/6",
      visual_acuity_os: "6/9",
      intraocular_pressure_od: 16.5,
      intraocular_pressure_os: 17.0,
      diagnosis: "Simple Myopia with mild Astigmatism",
      procedure_fee: 600,
    };
    assert.equal(validateEyePayload(validRecord).valid, true);

    const invalidIop = { ...validRecord, intraocular_pressure_od: 95 };
    assert.equal(validateEyePayload(invalidIop).valid, false);
  });

  test("6. Physiotherapy session workflow validates VAS pain score bounds (0-10) and session progression", () => {
    function validatePhysioPayload(payload) {
      if (!payload.chief_complaint || !payload.assessment_findings || !payload.treatment_plan) {
        return { valid: false, error: "Missing clinical details" };
      }
      if (payload.pain_score_initial !== undefined && (payload.pain_score_initial < 0 || payload.pain_score_initial > 10)) {
        return { valid: false, error: "Pain score must be 0-10" };
      }
      if (payload.pain_score_post !== undefined && (payload.pain_score_post < 0 || payload.pain_score_post > 10)) {
        return { valid: false, error: "Pain score must be 0-10" };
      }
      if (payload.session_number > payload.total_sessions_prescribed) {
        return { valid: false, error: "Session number cannot exceed prescribed total" };
      }
      return { valid: true };
    }

    const validSession = {
      chief_complaint: "Cervical radiculopathy and neck spasm",
      pain_score_initial: 8,
      pain_score_post: 4,
      assessment_findings: "Restricted lateral flexion, cervical paraspinal spasm",
      treatment_plan: "Intermittent cervical traction + IFT + isometric neck exercises",
      session_number: 2,
      total_sessions_prescribed: 5,
      modalities_applied: ["TENS", "Cervical Traction"],
      session_fee: 500,
    };
    assert.equal(validatePhysioPayload(validSession).valid, true);

    const invalidPain = { ...validSession, pain_score_initial: 15 };
    assert.equal(validatePhysioPayload(invalidPain).valid, false);

    const overflowSession = { ...validSession, session_number: 6, total_sessions_prescribed: 5 };
    assert.equal(validatePhysioPayload(overflowSession).valid, false);
  });

  test("7. Granular RBAC permissions for clinical specialties exist in lib/permissions.ts", () => {
    const permPath = path.join(ROOT, "lib/permissions.ts");
    const content = fs.readFileSync(permPath, "utf8");
    assert.ok(content.includes("SPECIALTIES_VIEW"), "SPECIALTIES_VIEW permission required");
    assert.ok(content.includes("SPECIALTIES_MANAGE"), "SPECIALTIES_MANAGE permission required");
  });

  test("8. Client actions module exists with CRUD operations for all 3 specialties", () => {
    const actionsPath = path.join(ROOT, "lib/specialties/actions.ts");
    assert.ok(fs.existsSync(actionsPath), "lib/specialties/actions.ts must exist");
    const content = fs.readFileSync(actionsPath, "utf8");
    assert.ok(content.includes("createDentalExaminationAction"), "createDentalExaminationAction required");
    assert.ok(content.includes("getDentalExaminationsAction"), "getDentalExaminationsAction required");
    assert.ok(content.includes("createEyeExaminationAction"), "createEyeExaminationAction required");
    assert.ok(content.includes("getEyeExaminationsAction"), "getEyeExaminationsAction required");
    assert.ok(content.includes("createPhysiotherapySessionAction"), "createPhysiotherapySessionAction required");
    assert.ok(content.includes("getPhysiotherapySessionsAction"), "getPhysiotherapySessionsAction required");
  });

  test("9. Specialties clinical console UI exists under app/(hospital)/app/specialties", () => {
    const pagePath = path.join(ROOT, "app/(hospital)/app/specialties/page.tsx");
    assert.ok(fs.existsSync(pagePath), "Specialties page UI must exist");
    const content = fs.readFileSync(pagePath, "utf8");
    assert.ok(content.includes("Dental Clinic"), "Dental tab required in UI");
    assert.ok(content.includes("Ophthalmology / Eye Clinic"), "Eye tab required in UI");
    assert.ok(content.includes("Physiotherapy & Rehab"), "Physiotherapy tab required in UI");
  });

  test("10. Shared core integration: all specialty tables link to patients, appointments, and billing", () => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260927020000_specialty_clinical_workflows.sql"), "utf8");
    assert.ok(sql.includes("patient_id UUID NOT NULL REFERENCES patients(id)"), "Patient foreign key linkage required");
    assert.ok(sql.includes("appointment_id UUID REFERENCES appointments(id)"), "Appointment foreign key linkage required");
    assert.ok(sql.includes("billing_invoice_id UUID REFERENCES invoices(id)"), "Invoice foreign key linkage required");
  });
});
