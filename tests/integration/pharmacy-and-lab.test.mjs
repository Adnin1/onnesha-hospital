import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("OHMS Integration: Pharmacy Inventory & Diagnostic Lab Result Logic", () => {
  test("1. Pharmacy stock decrement enforces zero negative stock rule", () => {
    const inventory = [
      { medicine_id: "MED-001", name: "Paracetamol 500mg", stock_quantity: 10 },
    ];

    function dispenseMedicine(medicineId, quantity) {
      const item = inventory.find((i) => i.medicine_id === medicineId);
      if (!item) return { success: false, error: "Medicine not found" };
      if (item.stock_quantity < quantity) {
        return { success: false, error: "Insufficient stock available" };
      }
      item.stock_quantity -= quantity;
      return { success: true, remaining: item.stock_quantity };
    }

    const overDispense = dispenseMedicine("MED-001", 15);
    assert.equal(overDispense.success, false);
    assert.equal(overDispense.error, "Insufficient stock available");

    const validDispense = dispenseMedicine("MED-001", 4);
    assert.equal(validDispense.success, true);
    assert.equal(validDispense.remaining, 6);
  });

  test("2. Lab order result state transition follows order -> sample -> verified report", () => {
    let order = {
      id: "LAB-202609-001",
      patient_id: "P-202609-00001",
      test_name: "Complete Blood Count (CBC)",
      status: "pending",
      verified_by: null,
    };

    function collectSample(o) {
      if (o.status !== "pending") throw new Error("Invalid state transition");
      return { ...o, status: "sample_collected" };
    }

    function verifyReport(o, doctorId) {
      if (o.status !== "sample_collected") throw new Error("Sample must be collected before verification");
      return { ...o, status: "verified", verified_by: doctorId, verified_at: new Date().toISOString() };
    }

    order = collectSample(order);
    assert.equal(order.status, "sample_collected");

    order = verifyReport(order, "DOC-001");
    assert.equal(order.status, "verified");
    assert.equal(order.verified_by, "DOC-001");
  });
});
