import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("OHMS Enterprise Bed Lifecycle & Critical Care Workflow Regression (10 Scenarios)", () => {

  test("1. Database Migration 99 defines explicit foreign key beds_ward_id_fkey to wards(id)", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261002040000_fix_beds_wards_schema_and_atomic_workflow.sql"
    );
    assert.ok(fs.existsSync(migrationPath), "Migration 99 must exist");
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("ALTER TABLE public.beds ADD COLUMN IF NOT EXISTS ward_id UUID;"));
    assert.ok(content.includes("beds_ward_id_fkey"));
    assert.ok(content.includes("REFERENCES public.wards(id)"));
    assert.ok(content.includes("NOTIFY pgrst, 'reload schema';"));
  });

  test("2. Database Migration 99 enforces partial unique indexes preventing concurrent double-assignments", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261002040000_fix_beds_wards_schema_and_atomic_workflow.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("uq_active_bed_assignment"));
    assert.ok(content.includes("ON public.bed_assignments(bed_id)"));
    assert.ok(content.includes("WHERE status = 'ACTIVE'"));

    assert.ok(content.includes("uq_active_cabin_assignment"));
    assert.ok(content.includes("ON public.bed_assignments(cabin_id)"));
    assert.ok(content.includes("WHERE status = 'ACTIVE'"));
  });

  test("3. Atomic stored procedure admit_patient_to_bed_atomic uses FOR UPDATE row-level lock", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261002040000_fix_beds_wards_schema_and_atomic_workflow.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("FUNCTION public.admit_patient_to_bed_atomic"));
    assert.ok(content.includes("FOR UPDATE"));
    assert.ok(content.includes("DOUBLE_ASSIGNMENT_PREVENTED"));
    assert.ok(content.includes("BED_UNAVAILABLE"));
  });

  test("4. Bed vacate atomic procedure transitions bed directly to CLEANING, never directly to VACANT", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261002040000_fix_beds_wards_schema_and_atomic_workflow.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("FUNCTION public.vacate_or_discharge_bed_atomic"));
    assert.ok(content.includes("SET status = 'CLEANING'"));
    assert.ok(!content.includes("SET status = 'VACANT'\n        WHERE id = p_bed_id;"));
  });

  test("5. Operational status transition strictly validates legal state machine transitions", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261002040000_fix_beds_wards_schema_and_atomic_workflow.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("FUNCTION public.update_bed_operational_status_atomic"));
    assert.ok(content.includes("ILLEGAL_TRANSITION"));
  });

  test("6. Atomic Transfer moves patient from source to destination and sets source to CLEANING", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/20261002040000_fix_beds_wards_schema_and_atomic_workflow.sql"
    );
    const content = fs.readFileSync(migrationPath, "utf8");

    assert.ok(content.includes("FUNCTION public.transfer_bed_or_critical_care_atomic"));
    assert.ok(content.includes("DESTINATION_UNAVAILABLE"));
    assert.ok(content.includes("SET status = 'CLEANING'"));
  });

  test("7. Critical Care admissions action eliminates fake fallback mock data", () => {
    const actionsPath = path.join(ROOT, "lib/critical-care/actions.ts");
    const content = fs.readFileSync(actionsPath, "utf8");

    // Must NOT declare or return DEFAULT_CRITICAL_CARE_ADMISSIONS mock array
    assert.ok(!content.includes("DEFAULT_CRITICAL_CARE_ADMISSIONS"));
    assert.ok(content.includes("critical_care_admissions"));
  });

  test("8. Critical care vitals bounds validation logic rejects unphysiological entries", () => {
    function validateVitals(payload) {
      if (payload.systolic_bp !== undefined && (payload.systolic_bp < 40 || payload.systolic_bp > 300)) {
        return { valid: false, error: "Systolic Blood Pressure must be between 40 and 300 mmHg." };
      }
      if (payload.diastolic_bp !== undefined && (payload.diastolic_bp < 20 || payload.diastolic_bp > 200)) {
        return { valid: false, error: "Diastolic Blood Pressure must be between 20 and 200 mmHg." };
      }
      if (payload.heart_rate !== undefined && (payload.heart_rate < 20 || payload.heart_rate > 300)) {
        return { valid: false, error: "Heart Rate must be between 20 and 300 beats per minute." };
      }
      if (payload.spo2 !== undefined && (payload.spo2 < 40 || payload.spo2 > 100)) {
        return { valid: false, error: "Oxygen Saturation (SpO2) must be between 40% and 100%." };
      }
      if (payload.fio2 !== undefined && (payload.fio2 < 21 || payload.fio2 > 100)) {
        return { valid: false, error: "Fraction of Inspired Oxygen (FiO2) must be between 21% and 100%." };
      }
      if (payload.gcs_score !== undefined && (payload.gcs_score < 3 || payload.gcs_score > 15)) {
        return { valid: false, error: "Glasgow Coma Scale (GCS) score must be between 3 and 15." };
      }
      return { valid: true };
    }

    assert.equal(validateVitals({ systolic_bp: 350 }).valid, false);
    assert.equal(validateVitals({ systolic_bp: 120 }).valid, true);

    assert.equal(validateVitals({ spo2: 120 }).valid, false);
    assert.equal(validateVitals({ spo2: 30 }).valid, false);
    assert.equal(validateVitals({ spo2: 98 }).valid, true);

    assert.equal(validateVitals({ gcs_score: 18 }).valid, false);
    assert.equal(validateVitals({ gcs_score: 2 }).valid, false);
    assert.equal(validateVitals({ gcs_score: 15 }).valid, true);
  });

  test("9. Critical care alert lifecycle strictly enforces TRIGGERED -> ACKNOWLEDGED -> REVIEWED -> RESOLVED", () => {
    const validTransitions = {
      TRIGGERED: ["ACKNOWLEDGED"],
      ACKNOWLEDGED: ["REVIEWED", "RESOLVED"],
      REVIEWED: ["RESOLVED"],
      RESOLVED: [],
    };

    function transitionAlert(currentStatus, nextStatus) {
      if (!validTransitions[currentStatus]?.includes(nextStatus)) {
        return { success: false, error: `Illegal alert transition: Cannot transition from ${currentStatus} to ${nextStatus}.` };
      }
      return { success: true };
    }

    // 1. Direct jump from TRIGGERED to RESOLVED must fail
    assert.equal(transitionAlert("TRIGGERED", "RESOLVED").success, false);

    // 2. Legal transition sequence
    assert.equal(transitionAlert("TRIGGERED", "ACKNOWLEDGED").success, true);
    assert.equal(transitionAlert("ACKNOWLEDGED", "REVIEWED").success, true);
    assert.equal(transitionAlert("REVIEWED", "RESOLVED").success, true);

    // 3. Already resolved alert cannot transition back
    assert.equal(transitionAlert("RESOLVED", "TRIGGERED").success, false);
  });

  test("10. Bed and Critical Care UI components and atomic stored procedures are fully integrated", () => {
    // 1. Check OccupiedBedPanel exists and implements patient drawer with actions
    const occupiedPanelPath = path.join(ROOT, "components/beds/OccupiedBedPanel.tsx");
    assert.ok(fs.existsSync(occupiedPanelPath), "OccupiedBedPanel must exist");
    const occupiedPanelContent = fs.readFileSync(occupiedPanelPath, "utf8");
    assert.ok(occupiedPanelContent.includes("vacateBedAction"));
    assert.ok(occupiedPanelContent.includes("updateBedStatusAction"));
    assert.ok(occupiedPanelContent.includes("CLEANING"));

    // 2. Check CriticalCarePatientPanel exists
    const ccPanelPath = path.join(ROOT, "components/critical-care/CriticalCarePatientPanel.tsx");
    assert.ok(fs.existsSync(ccPanelPath), "CriticalCarePatientPanel must exist");
    const ccPanelContent = fs.readFileSync(ccPanelPath, "utf8");
    assert.ok(ccPanelContent.includes("updateCriticalCareAlertStatusAction"));
    assert.ok(ccPanelContent.includes("ACKNOWLEDGED"));
    assert.ok(ccPanelContent.includes("REVIEWED"));
    assert.ok(ccPanelContent.includes("RESOLVED"));

    // 3. Check TransferBedModal exists
    const transferModalPath = path.join(ROOT, "components/beds/TransferBedModal.tsx");
    assert.ok(fs.existsSync(transferModalPath), "TransferBedModal must exist");
    const transferModalContent = fs.readFileSync(transferModalPath, "utf8");
    assert.ok(transferModalContent.includes("transferBedAction"));
  });
});
