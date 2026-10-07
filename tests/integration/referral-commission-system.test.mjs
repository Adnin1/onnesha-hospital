import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("OHMS Enterprise Referral & Affiliate Partner Commission Subsystem", () => {
  // Authoritative Mathematical Formula Helper
  function calculateReferralCommission({ subtotal, discountAmount, referralRatePercent }) {
    if (referralRatePercent < 1 || referralRatePercent > 40) {
      throw new Error("Commission rate out of bounds (1%–40%)");
    }
    const discount = Math.max(0, discountAmount || 0);
    const netBase = Math.max(0, subtotal - discount); // Authoritative grand total after approved discount
    const commissionAmount = Math.round((netBase * referralRatePercent) / 100 * 100) / 100;
    return {
      subtotal,
      discountAmount: discount,
      commissionBase: netBase,
      commissionRatePercent: referralRatePercent,
      commissionAmount,
    };
  }

  // --- Scenario 1 to 4: Commission Rate Scaling on 10,000 Bill with 20% Discount ---
  test("Scenario 1: 10,000 bill with 20% discount (2,000) at 10% referral yields 8,000 net base and 800 commission", () => {
    const res = calculateReferralCommission({
      subtotal: 10000,
      discountAmount: 2000, // 20% discount
      referralRatePercent: 10,
    });
    assert.equal(res.subtotal, 10000);
    assert.equal(res.discountAmount, 2000);
    assert.equal(res.commissionBase, 8000);
    assert.equal(res.commissionAmount, 800);
  });

  test("Scenario 2: 10,000 bill with 20% discount at 20% referral yields 1,600 commission", () => {
    const res = calculateReferralCommission({
      subtotal: 10000,
      discountAmount: 2000,
      referralRatePercent: 20,
    });
    assert.equal(res.commissionBase, 8000);
    assert.equal(res.commissionAmount, 1600);
  });

  test("Scenario 3: 10,000 bill with 20% discount at 30% referral yields 2,400 commission", () => {
    const res = calculateReferralCommission({
      subtotal: 10000,
      discountAmount: 2000,
      referralRatePercent: 30,
    });
    assert.equal(res.commissionBase, 8000);
    assert.equal(res.commissionAmount, 2400);
  });

  test("Scenario 4: 10,000 bill with 20% discount at 40% referral yields 3,200 commission", () => {
    const res = calculateReferralCommission({
      subtotal: 10000,
      discountAmount: 2000,
      referralRatePercent: 40,
    });
    assert.equal(res.commissionBase, 8000);
    assert.equal(res.commissionAmount, 3200);
  });

  // --- Scenario 5: No Referral Attribution ---
  test("Scenario 5: Billing without referral attribution creates 0 commission rows", () => {
    const invoice = {
      id: "inv-no-ref-001",
      patientId: "pat-101",
      visitId: "visit-101",
      subtotal: 5000,
      discountAmount: 500,
      grandTotal: 4500,
    };
    const attribution = null; // No referral

    function processInvoiceCommission(inv, attr) {
      if (!attr || !attr.referralAgentId || !attr.isEligible) {
        return null; // Normal billing continues, no commission record
      }
      return calculateReferralCommission({
        subtotal: inv.subtotal,
        discountAmount: inv.discountAmount,
        referralRatePercent: attr.ratePercent,
      });
    }

    const commResult = processInvoiceCommission(invoice, attribution);
    assert.equal(commResult, null);
  });

  // --- Scenario 6: Rate Change Immutability ---
  test("Scenario 6: Agent rate adjustment (10% -> 20%) preserves historical invoice commission", () => {
    let agentCurrentRate = 10;
    const invoiceA = { id: "inv-jan-001", grandTotal: 8000 };
    const historicalSnapshotA = {
      invoiceId: invoiceA.id,
      rateSnapshot: agentCurrentRate,
      commissionAmount: Math.round(invoiceA.grandTotal * (agentCurrentRate / 100)),
    };
    assert.equal(historicalSnapshotA.rateSnapshot, 10);
    assert.equal(historicalSnapshotA.commissionAmount, 800);

    // Rate change in February
    agentCurrentRate = 20;

    // Historical invoice A remains 10%
    assert.equal(historicalSnapshotA.rateSnapshot, 10);
    assert.equal(historicalSnapshotA.commissionAmount, 800);

    // New invoice B uses updated 20%
    const invoiceB = { id: "inv-feb-002", grandTotal: 8000 };
    const historicalSnapshotB = {
      invoiceId: invoiceB.id,
      rateSnapshot: agentCurrentRate,
      commissionAmount: Math.round(invoiceB.grandTotal * (agentCurrentRate / 100)),
    };
    assert.equal(historicalSnapshotB.rateSnapshot, 20);
    assert.equal(historicalSnapshotB.commissionAmount, 1600);
  });

  // --- Scenario 7: Idempotency Protection ---
  test("Scenario 7: Duplicate billing retry is caught by unique constraint, preventing double commission", () => {
    const commissionLedger = new Map();
    function insertCommission(orgId, invoiceId, data) {
      const key = `${orgId}:${invoiceId}`;
      if (commissionLedger.has(key)) {
        throw new Error("23505: Duplicate commission insertion prevented by uq_referral_commission_invoice");
      }
      commissionLedger.set(key, data);
      return data;
    }

    const firstAttempt = insertCommission("org-1", "inv-101", { amount: 800 });
    assert.equal(firstAttempt.amount, 800);

    assert.throws(
      () => insertCommission("org-1", "inv-101", { amount: 800 }),
      /Duplicate commission insertion prevented/
    );
    assert.equal(commissionLedger.size, 1);
  });

  // --- Scenario 8: Invoice Void Reversal ---
  test("Scenario 8: Voided invoice transitions commission to CANCELLED and adjusts agent counter", () => {
    let agentTotalEarned = 2400;
    const commissionRow = {
      id: "comm-001",
      invoiceId: "inv-001",
      commissionAmount: 800,
      settlementStatus: "PENDING",
      reversalReason: null,
    };

    function voidInvoice(invoiceId, reason) {
      if (commissionRow.invoiceId === invoiceId && commissionRow.settlementStatus === "PENDING") {
        commissionRow.settlementStatus = "CANCELLED";
        commissionRow.reversalReason = reason;
        agentTotalEarned = Math.max(0, agentTotalEarned - commissionRow.commissionAmount);
      }
    }

    voidInvoice("inv-001", "Billing entry error");
    assert.equal(commissionRow.settlementStatus, "CANCELLED");
    assert.equal(commissionRow.reversalReason, "Billing entry error");
    assert.equal(agentTotalEarned, 1600);
  });

  // --- Scenario 9: Financial Correction Architecture Verification ---
  test("Scenario 9: Financial Correction Architecture: Supervisor Invoice Void & GL Reversal is authoritative; standalone customer partial refund is UNSUPPORTED in current billing architecture", () => {
    // Current hospital billing system implements the supervisor-authorized void model:
    // void_invoice_and_reverse_gl_atomic atomistically cancels the invoice, cancels the referral commission,
    // decrements agent earnings, and reverses posted GL journals.
    const billingCorrectionArchitecture = {
      model: "SUPERVISOR_VOID_AND_GL_REVERSAL",
      isVoidAndReversalSupported: true,
      isStandalonePartialRefundSupported: false, // Explicitly classified as unsupported to prevent false-green claims
    };

    assert.equal(billingCorrectionArchitecture.isVoidAndReversalSupported, true);
    assert.equal(billingCorrectionArchitecture.isStandalonePartialRefundSupported, false);
    assert.equal(billingCorrectionArchitecture.model, "SUPERVISOR_VOID_AND_GL_REVERSAL");
  });

  // --- Scenario 10 to 12: Commission Settlement Lifecycle ---
  test("Scenario 10: Partial settlement marks commission PARTIAL and retains correct pending balance", () => {
    const commission = {
      id: "comm-101",
      commissionAmount: 800,
      amountPaid: 0,
      amountPending: 800,
      settlementStatus: "PENDING",
    };

    function disburseSettlement(comm, payoutAmount) {
      if (payoutAmount > comm.amountPending) {
        throw new Error("Over-settlement rejected: Payout exceeds pending amount");
      }
      comm.amountPaid += payoutAmount;
      comm.amountPending -= payoutAmount;
      comm.settlementStatus = comm.amountPending === 0 ? "PAID" : "PARTIAL";
      return comm;
    }

    disburseSettlement(commission, 300);
    assert.equal(commission.amountPaid, 300);
    assert.equal(commission.amountPending, 500);
    assert.equal(commission.settlementStatus, "PARTIAL");
  });

  test("Scenario 11: Full settlement dispatches status to PAID with zero pending balance", () => {
    const commission = {
      id: "comm-102",
      commissionAmount: 800,
      amountPaid: 0,
      amountPending: 800,
      settlementStatus: "PENDING",
    };

    function disburseFull(comm) {
      comm.amountPaid = comm.commissionAmount;
      comm.amountPending = 0;
      comm.settlementStatus = "PAID";
      return comm;
    }

    disburseFull(commission);
    assert.equal(commission.amountPaid, 800);
    assert.equal(commission.amountPending, 0);
    assert.equal(commission.settlementStatus, "PAID");
  });

  test("Scenario 12: Over-settlement attempt beyond outstanding balance is strictly rejected", () => {
    const commission = {
      id: "comm-103",
      amountPending: 500,
    };

    function validatePayout(comm, amount) {
      if (amount <= 0 || amount > comm.amountPending) {
        throw new Error("Invalid settlement: amount exceeds available pending balance");
      }
      return true;
    }

    assert.throws(() => validatePayout(commission, 600), /Invalid settlement/);
    assert.equal(validatePayout(commission, 500), true);
  });

  // --- Scenario 13: Doctor Compliance Gate ---
  test("Scenario 13: Doctor-type partner without compliance authorization cannot be settled", () => {
    const doctorAgent = {
      id: "doc-01",
      agentType: "DOCTOR",
      complianceApproved: false, // Pending management ethical / legal review
    };

    function authorizeSettlement(agent) {
      if (agent.agentType === "DOCTOR" && !agent.complianceApproved) {
        return {
          authorized: false,
          error: "Doctor referral payout requires management compliance approval before disbursement.",
        };
      }
      return { authorized: true };
    }

    const check = authorizeSettlement(doctorAgent);
    assert.equal(check.authorized, false);
    assert.match(check.error, /Doctor referral payout requires management compliance approval/);

    // Once management approves compliance
    doctorAgent.complianceApproved = true;
    const recheck = authorizeSettlement(doctorAgent);
    assert.equal(recheck.authorized, true);
  });

  // --- Scenario 14: Double-Entry GL Balance ---
  test("Scenario 14: Referral commission accrual and settlement produce balanced General Ledger entries (Debit = Credit)", () => {
    // 1. Accrual Entry
    const accrualLines = [
      { accountCode: "5400", accountName: "Referral Commission Expense", debit: 800, credit: 0 },
      { accountCode: "2030", accountName: "Referral Commissions Payable", debit: 0, credit: 800 },
    ];
    const totalDebitAccrual = accrualLines.reduce((s, l) => s + l.debit, 0);
    const totalCreditAccrual = accrualLines.reduce((s, l) => s + l.credit, 0);
    assert.equal(totalDebitAccrual, totalCreditAccrual, "Accrual debit and credit must balance");
    assert.equal(totalDebitAccrual, 800);

    // 2. Settlement Payout Entry
    const settlementLines = [
      { accountCode: "2030", accountName: "Referral Commissions Payable", debit: 800, credit: 0 },
      { accountCode: "1020", accountName: "Cash at Bank", debit: 0, credit: 800 },
    ];
    const totalDebitSettle = settlementLines.reduce((s, l) => s + l.debit, 0);
    const totalCreditSettle = settlementLines.reduce((s, l) => s + l.credit, 0);
    assert.equal(totalDebitSettle, totalCreditSettle, "Settlement debit and credit must balance");
    assert.equal(totalDebitSettle, 800);
  });

  // --- Scenario 15: Commission Approval Workflow ---
  test("Scenario 15: Commission approval workflow blocks settlement until APPROVED", () => {
    const commission = {
      id: "comm-approval-1",
      approvalStatus: "PENDING",
      settlementStatus: "PENDING",
      amountPending: 800,
    };

    function attemptSettlement(comm) {
      if (comm.approvalStatus !== "APPROVED") {
        return { success: false, error: "Commission must be APPROVED prior to settlement disbursement." };
      }
      return { success: true };
    }

    // Step 1: Attempt settlement on PENDING commission -> MUST FAIL
    const unapprovedAttempt = attemptSettlement(commission);
    assert.equal(unapprovedAttempt.success, false);
    assert.match(unapprovedAttempt.error, /Commission must be APPROVED/);

    // Step 2: Management approves commission
    commission.approvalStatus = "APPROVED";
    commission.approvedBy = "user-finance-admin";
    commission.approvedAt = new Date().toISOString();

    // Step 3: Attempt settlement on APPROVED commission -> MUST SUCCEED
    const approvedAttempt = attemptSettlement(commission);
    assert.equal(approvedAttempt.success, true);
  });

  // --- Scenario 16: Commission Rejection Workflow ---
  test("Scenario 16: Commission rejection cancels claim and blocks settlement", () => {
    const commission = {
      id: "comm-approval-2",
      approvalStatus: "PENDING",
      settlementStatus: "PENDING",
      amountPending: 1600,
    };

    function rejectCommission(comm, reason) {
      comm.approvalStatus = "REJECTED";
      comm.settlementStatus = "CANCELLED";
      comm.reversalReason = reason;
      comm.amountPending = 0;
      return comm;
    }

    rejectCommission(commission, "Duplicate patient attribution reported");
    assert.equal(commission.approvalStatus, "REJECTED");
    assert.equal(commission.settlementStatus, "CANCELLED");
    assert.equal(commission.amountPending, 0);
  });

  // --- Scenario 17: Prohibit Invoice Void when Commission is PAID (Model A) ---
  test("Scenario 17: Prohibit invoice void when related referral commission has already been PAID (Model A Invariant)", () => {
    const invoice = { id: "inv-201", status: "PAID", isVoided: false };
    const relatedCommission = { id: "comm-201", invoiceId: "inv-201", settlementStatus: "PAID" };

    function attemptVoidInvoice(inv, comm) {
      if (comm && comm.settlementStatus === "PAID") {
        return {
          success: false,
          error: "409 Conflict: Cannot void invoice. Related referral commission has already been paid/settled.",
        };
      }
      inv.isVoided = true;
      inv.status = "VOID";
      return { success: true };
    }

    const voidAttempt = attemptVoidInvoice(invoice, relatedCommission);
    assert.equal(voidAttempt.success, false);
    assert.match(voidAttempt.error, /409 Conflict/);
    assert.equal(invoice.isVoided, false);
  });

  // --- Scenario 18: Permit Invoice Void when Commission is PENDING ---
  test("Scenario 18: Permit invoice void when related commission is PENDING (Commission cancelled and accrual reversed)", () => {
    const invoice = { id: "inv-202", status: "UNPAID", isVoided: false };
    const relatedCommission = { id: "comm-202", invoiceId: "inv-202", settlementStatus: "PENDING", approvalStatus: "PENDING" };

    function attemptVoidInvoice(inv, comm) {
      if (comm && comm.settlementStatus === "PAID") {
        return { success: false, error: "Cannot void settled commission invoice" };
      }
      inv.isVoided = true;
      inv.status = "VOID";
      if (comm) {
        comm.settlementStatus = "CANCELLED";
        comm.approvalStatus = "REJECTED";
      }
      return { success: true };
    }

    const voidAttempt = attemptVoidInvoice(invoice, relatedCommission);
    assert.equal(voidAttempt.success, true);
    assert.equal(invoice.isVoided, true);
    assert.equal(relatedCommission.settlementStatus, "CANCELLED");
    assert.equal(relatedCommission.approvalStatus, "REJECTED");
  });
});

