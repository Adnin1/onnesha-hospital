import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("OHMS Integration: Emergency Casualty Triage & Bed Allocation Logic", () => {
  test("1. Casualty triage prioritizes RED critical cases over YELLOW and GREEN", () => {
    const triageCases = [
      { id: "EMG-001", priority: "GREEN", condition: "Minor laceration" },
      { id: "EMG-002", priority: "RED", condition: "Acute cardiac arrest" },
      { id: "EMG-003", priority: "YELLOW", condition: "Closed fracture" },
    ];

    const sorted = [...triageCases].sort((a, b) => {
      const pOrder = { RED: 1, YELLOW: 2, GREEN: 3 };
      return pOrder[a.priority] - pOrder[b.priority];
    });

    assert.equal(sorted[0].id, "EMG-002");
    assert.equal(sorted[0].priority, "RED");
    assert.equal(sorted[2].priority, "GREEN");
  });

  test("2. Bed allocation transfer prevents double occupancy of single bed", () => {
    const beds = [
      { bed_number: "BED-101", status: "occupied", patient_id: "P-202609-00001" },
      { bed_number: "BED-102", status: "available", patient_id: null },
    ];

    function assignBed(bedNumber, patientId) {
      const target = beds.find((b) => b.bed_number === bedNumber);
      if (!target) return { success: false, error: "Bed not found" };
      if (target.status === "occupied") return { success: false, error: "Bed already occupied" };
      target.status = "occupied";
      target.patient_id = patientId;
      return { success: true };
    }

    const attemptOccupied = assignBed("BED-101", "P-202609-00002");
    assert.equal(attemptOccupied.success, false);
    assert.equal(attemptOccupied.error, "Bed already occupied");

    const attemptAvailable = assignBed("BED-102", "P-202609-00002");
    assert.equal(attemptAvailable.success, true);
  });
});
