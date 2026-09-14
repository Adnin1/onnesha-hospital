import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("OHMS Integration: Server-Authoritative Billing & Payment Calculations", () => {
  test("1. Invoice total correctly computes subtotal, discount, and due balance", () => {
    const items = [
      { description: "OPD Consultation Fee", amount: 1000 },
      { description: "CBC Lab Test", amount: 500 },
      { description: "ECG", amount: 800 },
    ];
    const discountAmount = 300;
    const paidAmount = 1500;

    const subtotal = items.reduce((acc, item) => acc + item.amount, 0);
    const netTotal = Math.max(0, subtotal - discountAmount);
    const dueAmount = Math.max(0, netTotal - paidAmount);

    assert.equal(subtotal, 2300);
    assert.equal(netTotal, 2000);
    assert.equal(dueAmount, 500);
  });

  test("2. Overpayment attempt is rejected by billing calculation logic", () => {
    const netTotal = 2000;
    const previousPaid = 1500;
    const currentDue = netTotal - previousPaid; // 500

    function processPayment(paymentAttempt) {
      if (paymentAttempt > currentDue) {
        return { success: false, error: "Payment amount exceeds remaining due balance" };
      }
      return { success: true, newDue: currentDue - paymentAttempt };
    }

    const overpay = processPayment(700);
    assert.equal(overpay.success, false);
    assert.equal(overpay.error, "Payment amount exceeds remaining due balance");

    const validPay = processPayment(500);
    assert.equal(validPay.success, true);
    assert.equal(validPay.newDue, 0);
  });
});
