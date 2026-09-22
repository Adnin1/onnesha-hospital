/**
 * Phase 56: True Line-Level 3-Way Match & Payment Concurrency Hardening Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 56: True Line-Level 3-Way Match & Concurrency Invariant Suite", async (t) => {
  const migration56Path = path.join(
    ROOT,
    "supabase/migrations/20260922150000_true_line_level_3way_match_and_concurrency.sql"
  );
  assert.ok(fs.existsSync(migration56Path), "Migration 56 must exist on disk");
  const sql = fs.readFileSync(migration56Path, "utf8");

  await t.test("1. Schema & Security: supplier_invoice_items Table & RLS", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.supplier_invoice_items/);
    assert.match(sql, /po_item_id UUID REFERENCES public\.purchase_order_items/);
    assert.match(sql, /grn_item_id UUID REFERENCES public\.goods_receipt_items/);
    assert.match(sql, /quantity_invoiced INT NOT NULL CHECK \(quantity_invoiced > 0\)/);
    assert.match(sql, /unit_price NUMERIC\(12, 2\) NOT NULL CHECK \(unit_price >= 0\)/);
    assert.match(sql, /line_total NUMERIC\(14, 2\) NOT NULL CHECK \(line_total >= 0\)/);
    assert.match(sql, /ALTER TABLE public\.supplier_invoice_items ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /CREATE POLICY supplier_invoice_items_tenant_isolation/);
  });

  await t.test("2. Concurrency Safety: Unique Reference Invariant on Journal Entries", () => {
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_org_ref/);
    assert.match(sql, /ON public\.journal_entries \(organization_id, reference_type, reference_id\)/);
    assert.match(sql, /WHERE status IN \('POSTED', 'DRAFT'\)/);
  });

  await t.test("3. Concurrency Safety: Row-Level Locking with SELECT ... FOR UPDATE", () => {
    assert.match(sql, /SELECT \* INTO v_sinv FROM public\.supplier_invoices[\s\S]*?FOR UPDATE/);
    assert.match(sql, /SELECT \* INTO v_grn FROM public\.goods_receipt_notes[\s\S]*?FOR UPDATE/);
    assert.match(sql, /SELECT \* INTO v_po FROM public\.purchase_orders[\s\S]*?FOR UPDATE/);
    assert.match(sql, /SELECT \* INTO v_pmt FROM public\.payments[\s\S]*?FOR UPDATE/);
    assert.match(sql, /SELECT \* INTO v_inv FROM public\.invoices[\s\S]*?FOR UPDATE/);
  });

  await t.test("4. Line-Level 3-Way Match: Quantity, Price & Calculation Invariants in SQL", () => {
    assert.match(sql, /v_item\.quantity_invoiced \* v_item\.unit_price/);
    assert.match(sql, /v_item\.quantity_invoiced > v_poi\.quantity_ordered/);
    assert.match(sql, /v_poi\.quantity_received < v_item\.quantity_invoiced/);
    assert.match(sql, /ABS\(v_item\.unit_price - v_poi\.unit_cost\) > 0\.05/);
    assert.match(sql, /v_item\.quantity_invoiced > v_gri\.quantity_received/);
    assert.match(sql, /ABS\(v_calculated_subtotal - v_sinv\.subtotal\) > 0\.05/);
  });

  await t.test("5. Algorithmic Verification: Line-Level Matching catches Price/Quantity Swaps", () => {
    function verifyThreeWayMatch(poLines, invoiceLines) {
      if (invoiceLines.length === 0) return { matched: false, reason: "no lines" };

      let calculatedSubtotal = 0;
      for (const invLine of invoiceLines) {
        // 1. Math check
        if (Math.abs(invLine.quantity * invLine.unitPrice - invLine.lineTotal) > 0.05) {
          return { matched: false, reason: "line_math_discrepancy" };
        }
        calculatedSubtotal += invLine.lineTotal;

        // 2. PO Line check
        const poLine = poLines.find((p) => p.id === invLine.poLineId);
        if (!poLine) return { matched: false, reason: "orphan_line" };
        if (invLine.itemId !== poLine.itemId) return { matched: false, reason: "item_mismatch" };
        if (invLine.quantity > poLine.quantityOrdered) return { matched: false, reason: "ordered_exceeded" };
        if (invLine.quantity > poLine.quantityReceived) return { matched: false, reason: "received_exceeded" };
        if (Math.abs(invLine.unitPrice - poLine.unitCost) > 0.05) return { matched: false, reason: "unit_price_mismatch" };
      }

      return { matched: true, subtotal: calculatedSubtotal };
    }

    const standardPo = [
      { id: "po-1", itemId: "med-A", quantityOrdered: 10, quantityReceived: 10, unitCost: 100 },
      { id: "po-2", itemId: "med-B", quantityOrdered: 20, quantityReceived: 20, unitCost: 200 },
    ];

    // Case A: Valid exact match
    const validInvoice = [
      { poLineId: "po-1", itemId: "med-A", quantity: 10, unitPrice: 100, lineTotal: 1000 },
      { poLineId: "po-2", itemId: "med-B", quantity: 20, unitPrice: 200, lineTotal: 4000 },
    ];
    assert.strictEqual(verifyThreeWayMatch(standardPo, validInvoice).matched, true);

    // Case B: Aggregate total matches (5000), but quantities are swapped!
    const swappedQuantityInvoice = [
      { poLineId: "po-1", itemId: "med-A", quantity: 20, unitPrice: 100, lineTotal: 2000 }, // ordered only 10!
      { poLineId: "po-2", itemId: "med-B", quantity: 15, unitPrice: 200, lineTotal: 3000 },
    ];
    const qtyRes = verifyThreeWayMatch(standardPo, swappedQuantityInvoice);
    assert.strictEqual(qtyRes.matched, false);
    assert.strictEqual(qtyRes.reason, "ordered_exceeded");

    // Case C: Aggregate total matches, but prices are swapped!
    const swappedPriceInvoice = [
      { poLineId: "po-1", itemId: "med-A", quantity: 10, unitPrice: 200, lineTotal: 2000 }, // PO unitCost was 100!
      { poLineId: "po-2", itemId: "med-B", quantity: 20, unitPrice: 150, lineTotal: 3000 },
    ];
    const priceRes = verifyThreeWayMatch(standardPo, swappedPriceInvoice);
    assert.strictEqual(priceRes.matched, false);
    assert.strictEqual(priceRes.reason, "unit_price_mismatch");

    // Case D: Invoiced quantity exceeds received quantity (partial receipt)
    const partialPo = [
      { id: "po-1", itemId: "med-A", quantityOrdered: 100, quantityReceived: 40, unitCost: 50 },
    ];
    const overInvoiced = [
      { poLineId: "po-1", itemId: "med-A", quantity: 50, unitPrice: 50, lineTotal: 2500 }, // only 40 received!
    ];
    const recvRes = verifyThreeWayMatch(partialPo, overInvoiced);
    assert.strictEqual(recvRes.matched, false);
    assert.strictEqual(recvRes.reason, "received_exceeded");
  });

  await t.test("6. Payment Invariant: Cumulative Overpayment Calculation & Atomicity", () => {
    assert.match(sql, /SELECT COALESCE\(SUM\(amount\), 0\.00\) INTO v_cumulative_paid/);
    assert.match(sql, /WHERE invoice_id = v_pmt\.invoice_id/);
    assert.match(sql, /UPPER\(status\) NOT IN \('VOID', 'REFUNDED', 'CANCELLED'\)/);
    assert.match(sql, /IF \(v_cumulative_paid \+ v_pmt\.amount\) > \(v_inv\.total_amount \+ 0\.05\) THEN/);
    assert.match(sql, /Cumulative payments \(.*\) exceed invoice total amount/);
    assert.match(sql, /UPDATE public\.invoices[\s\S]*?paid_amount = \(v_cumulative_paid \+ v_pmt\.amount\)/);
    assert.match(sql, /due_amount = GREATEST\(0\.00, total_amount - \(v_cumulative_paid \+ v_pmt\.amount\)\)/);
  });

  await t.test("7. Algorithmic Verification: Multi-Payment Cumulative Balance Control", () => {
    function processPayment(invoiceTotal, existingPayments, newPaymentAmount) {
      const settled = existingPayments
        .filter((p) => !["VOID", "REFUNDED", "CANCELLED"].includes(p.status))
        .reduce((sum, p) => sum + p.amount, 0);

      if (newPaymentAmount <= 0) return { success: false, reason: "non_positive_amount" };
      if (settled + newPaymentAmount > invoiceTotal + 0.05) {
        return { success: false, reason: "cumulative_overpayment", settled, attempted: newPaymentAmount, invoiceTotal };
      }

      const totalPaid = settled + newPaymentAmount;
      const due = Math.max(0, invoiceTotal - totalPaid);
      const status = due <= 0.05 ? "PAID" : "PARTIALLY_PAID";
      return { success: true, totalPaid, due, status };
    }

    const invoiceTotal = 10000;

    // Payment 1: 4000
    const p1 = processPayment(invoiceTotal, [], 4000);
    assert.strictEqual(p1.success, true);
    assert.strictEqual(p1.totalPaid, 4000);
    assert.strictEqual(p1.due, 6000);
    assert.strictEqual(p1.status, "PARTIALLY_PAID");

    // Payment 2: 4000
    const p2 = processPayment(invoiceTotal, [{ amount: 4000, status: "COMPLETED" }], 4000);
    assert.strictEqual(p2.success, true);
    assert.strictEqual(p2.totalPaid, 8000);
    assert.strictEqual(p2.due, 2000);
    assert.strictEqual(p2.status, "PARTIALLY_PAID");

    // Payment 3 (Excess): 3000 (8000 + 3000 = 11000 > 10000) -> MUST FAIL!
    const p3Excess = processPayment(
      invoiceTotal,
      [
        { amount: 4000, status: "COMPLETED" },
        { amount: 4000, status: "COMPLETED" },
      ],
      3000
    );
    assert.strictEqual(p3Excess.success, false);
    assert.strictEqual(p3Excess.reason, "cumulative_overpayment");

    // Payment 3 (Exact): 2000 (8000 + 2000 = 10000) -> MUST PASS & TRANSITION TO PAID!
    const p3Exact = processPayment(
      invoiceTotal,
      [
        { amount: 4000, status: "COMPLETED" },
        { amount: 4000, status: "COMPLETED" },
      ],
      2000
    );
    assert.strictEqual(p3Exact.success, true);
    assert.strictEqual(p3Exact.totalPaid, 10000);
    assert.strictEqual(p3Exact.due, 0);
    assert.strictEqual(p3Exact.status, "PAID");
  });
});
