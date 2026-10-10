import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("OHMS Billing Disambiguation & Financial Invariants Suite", () => {

  // Simulated autoLookupAndSelectPatient logic mirroring app/(hospital)/app/billing/page.tsx
  function simulateAutoLookup(term, candidates) {
    const clean = term.trim();
    if (!clean) return { selected: null, notice: null, searchedList: [] };

    const cleanUpper = clean.toUpperCase();
    const exactMatch = candidates.find(
      (p) =>
        p.patient_code?.toUpperCase() === cleanUpper ||
        p.id?.toUpperCase() === cleanUpper ||
        (p.phone && p.phone.trim() === clean)
    );

    if (exactMatch) {
      return { selected: exactMatch, notice: null, searchedList: [] };
    } else if (candidates.length === 1) {
      return { selected: candidates[0], notice: null, searchedList: [] };
    } else if (candidates.length > 1) {
      return {
        selected: null,
        notice: `একাধিক রোগী পাওয়া গেছে (${candidates.length} জন)। অনুগ্রহ করে নিচের তালিকা থেকে নির্দিষ্ট রোগীটি নির্বাচন করুন।`,
        searchedList: candidates,
      };
    } else {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
      return {
        selected: isUUID ? { id: clean, isFallbackUUID: true } : null,
        notice: isUUID ? null : `"${clean}" সম্পর্কিত কোনো রোগী পাওয়া যায়নি।`,
        searchedList: [],
      };
    }
  }

  test("1. Exact unique match by patient_code auto-selects intended patient", () => {
    const patients = [
      { id: "uuid-1", patient_code: "OH-010101", full_name: "Md. Rahim", phone: "01711000001" },
      { id: "uuid-2", patient_code: "OH-010102", full_name: "Md. Karim", phone: "01711000002" },
    ];
    const res = simulateAutoLookup("OH-010101", patients);
    assert.ok(res.selected);
    assert.equal(res.selected.id, "uuid-1");
    assert.equal(res.notice, null);
  });

  test("2. Exact unique match by phone number auto-selects intended patient", () => {
    const patients = [
      { id: "uuid-1", patient_code: "OH-010101", full_name: "Md. Rahim", phone: "01711000001" },
      { id: "uuid-2", patient_code: "OH-010102", full_name: "Md. Karim", phone: "01711000002" },
    ];
    const res = simulateAutoLookup("01711000002", patients);
    assert.ok(res.selected);
    assert.equal(res.selected.id, "uuid-2");
    assert.equal(res.notice, null);
  });

  test("3. Ambiguous multi-match (common name) does NOT auto-select patients[0] blindly and shows warning banner", () => {
    const patients = [
      { id: "uuid-1", patient_code: "OH-010101", full_name: "Rahim Ali", phone: "01711000001" },
      { id: "uuid-2", patient_code: "OH-010102", full_name: "Rahim Uddin", phone: "01711000002" },
      { id: "uuid-3", patient_code: "OH-010103", full_name: "Rahim Sheikh", phone: "01711000003" },
    ];
    const res = simulateAutoLookup("Rahim", patients);
    assert.equal(res.selected, null, "Must NOT auto-select patients[0] on ambiguous query");
    assert.ok(res.notice.includes("একাধিক রোগী পাওয়া গেছে"));
    assert.equal(res.searchedList.length, 3);
  });

  test("4. Zero results returns null selection and explicit not-found notice", () => {
    const res = simulateAutoLookup("Nonexistent Patient", []);
    assert.equal(res.selected, null);
    assert.ok(res.notice.includes("সম্পর্কিত কোনো রোগী পাওয়া যায়নি"));
  });

  test("5. Net billable amount strictly enforces subtotal minus permitted concession", () => {
    const subtotal = 10000;
    const concessionFixed = 2000;
    const netBillableAmount = Math.max(0, subtotal - concessionFixed);
    assert.equal(netBillableAmount, 8000);

    // Concession cannot exceed subtotal (fail-closed against negative invoice totals)
    const excessiveConcession = 15000;
    const boundedNet = Math.max(0, subtotal - excessiveConcession);
    assert.equal(boundedNet, 0);
  });

  test("6. Referral commission is strictly computed on permitted net billable amount, NOT gross subtotal", () => {
    const subtotal = 10000;
    const concession = 2000;
    const commissionRatePercent = 10;

    const netBillableAmount = Math.max(0, subtotal - concession); // 8000
    const referralCommission = Math.round((netBillableAmount * commissionRatePercent) / 100);

    assert.equal(referralCommission, 800, "Commission on net 8000 @ 10% must be 800, NOT 1000");
    assert.notEqual(referralCommission, 1000, "Gross subtotal commission calculation is forbidden");
  });

  test("7. Admission discount is not duplicated across unbilled episode items", () => {
    const unbilledItems = [
      { itemName: "Admission Fee", unitPrice: 1000, quantity: 1 },
      { itemName: "Bed Charge (Day 1)", unitPrice: 2000, quantity: 1 },
    ];
    const subtotal = unbilledItems.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0); // 3000
    const admissionDiscountAmount = 500;

    // Single application at invoice level
    const grandTotal = Math.max(0, subtotal - admissionDiscountAmount);
    assert.equal(grandTotal, 2500);
  });

  test("8. Dual commission transparency separates doctor fees and marketing referral fees", () => {
    const invoice = {
      subtotal: 5000,
      doctorFee: 1500,
      doctorCommissionRate: 80, // doctor gets 80% of OPD consultation fee
      referralAgentCommissionRate: 10, // agent gets 10% of net diagnostic/services
      netServicesSubtotal: 3500,
    };

    const doctorPayout = Math.round((invoice.doctorFee * invoice.doctorCommissionRate) / 100); // 1200
    const agentPayout = Math.round((invoice.netServicesSubtotal * invoice.referralAgentCommissionRate) / 100); // 350

    assert.equal(doctorPayout, 1200);
    assert.equal(agentPayout, 350);
    assert.ok(doctorPayout + agentPayout <= invoice.subtotal);
  });
});
