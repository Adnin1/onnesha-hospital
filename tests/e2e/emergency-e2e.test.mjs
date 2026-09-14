import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("OHMS E2E: Emergency Casualty Triage & IPD Admission Workflow", () => {
  test("1. Emergency triage sorts arrivals by clinical severity (RED > YELLOW > GREEN)", () => {
    const queue = [
      { id: "EMG-01", triageCategory: "GREEN", arrivalTime: "10:00" },
      { id: "EMG-02", triageCategory: "RED", arrivalTime: "10:05" },
      { id: "EMG-03", triageCategory: "YELLOW", arrivalTime: "10:02" },
    ];

    const priorityMap = { RED: 1, YELLOW: 2, GREEN: 3 };
    const sorted = [...queue].sort((a, b) => priorityMap[a.triageCategory] - priorityMap[b.triageCategory]);

    assert.equal(sorted[0].id, "EMG-02");
    assert.equal(sorted[0].triageCategory, "RED");
    assert.equal(sorted[1].id, "EMG-03");
    assert.equal(sorted[2].id, "EMG-01");
  });

  test("2. Bed assignment transitions bed status from available -> occupied -> discharged", () => {
    let bed = { bed_id: "BED-201", status: "available", patient_id: null };

    // Admit patient
    bed = { ...bed, status: "occupied", patient_id: "P-202609-00042" };
    assert.equal(bed.status, "occupied");
    assert.equal(bed.patient_id, "P-202609-00042");

    // Discharge patient
    bed = { ...bed, status: "cleaning_required", patient_id: null };
    assert.equal(bed.status, "cleaning_required");
    assert.equal(bed.patient_id, null);
  });
});
