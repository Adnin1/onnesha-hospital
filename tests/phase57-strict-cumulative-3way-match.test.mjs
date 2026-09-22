/**
 * Phase 57: Strict Non-Bypassable Cumulative 3-Way Match & ERP Hardening Test Suite
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

test("Phase 57: Strict Non-Bypassable Cumulative 3-Way Match Suite", async (t) => {
  const migration57Path = path.join(
    ROOT,
    "supabase/migrations/20260922160000_strict_cumulative_3way_match_and_erp_hardening.sql"
  );
  assert.ok(fs.existsSync(migration57Path), "Migration 57 must exist on disk");
  const sql = fs.readFileSync(migration57Path, "utf8");

  await t.test("1. Schema: po_item_id NOT NULL on supplier_invoice_items", () => {
    assert.match(sql, /ALTER TABLE public\.supplier_invoice_items[\s\S]*?ALTER COLUMN po_item_id SET NOT NULL;/);
  });

  await t.test("2. Concurrency: Row-Level Locking on PO and GRN lines via FOR UPDATE", () => {
    assert.match(
      sql,
      /PERFORM 1 FROM public\.purchase_order_items[\s\S]*?WHERE purchase_order_id = v_sinv\.purchase_order_id[\s\S]*?FOR UPDATE;/
    );
    assert.match(
      sql,
      /PERFORM 1 FROM public\.goods_receipt_items[\s\S]*?WHERE grn_id = v_sinv\.grn_id[\s\S]*?FOR UPDATE;/
    );
  });

  await t.test("3. Strict Zero-Line Rejection: Fallback bypass completely eliminated", () => {
    assert.match(sql, /SELECT COUNT\(\*\) INTO v_items_count[\s\S]*?FROM public\.supplier_invoice_items/);
    assert.match(sql, /IF v_items_count = 0 THEN/);
    assert.match(sql, /UPDATE public\.supplier_invoices SET match_status = 'UNMATCHED'/);
    assert.match(
      sql,
      /RAISE EXCEPTION '3-Way Match Strict Invariant Error: Supplier invoice % has 0 line items\. True 3-way match strictly forbids header-only aggregate posting/
    );
    // Ensure the zero-count block fails closed and terminates with an exception
    const zeroLineBlock = sql.match(/IF v_items_count = 0 THEN([\s\S]*?)END IF;/);
    assert.ok(zeroLineBlock, "IF v_items_count = 0 THEN block must exist");
    assert.match(zeroLineBlock[1], /RAISE EXCEPTION/);
    assert.doesNotMatch(zeroLineBlock[1], /PERFORM public\.seed_default_chart_of_accounts/);
    assert.doesNotMatch(zeroLineBlock[1], /post_journal_entry_atomic/);
  });

  await t.test("4. Cumulative Quantity Verification across Multiple Invoices", () => {
    // PO cumulative consumption
    assert.match(sql, /SELECT COALESCE\(SUM\(sii_past\.quantity_invoiced\), 0\)[\s\S]*?INTO v_already_invoiced_qty/);
    assert.match(sql, /WHERE sii_past\.po_item_id = v_item\.po_item_id/);
    assert.match(sql, /AND si_past\.status = 'POSTED'/);
    assert.match(sql, /\(v_already_invoiced_qty \+ v_item\.quantity_invoiced\) > v_poi\.quantity_ordered/);
    assert.match(sql, /\(v_already_invoiced_qty \+ v_item\.quantity_invoiced\) > v_poi\.quantity_received/);

    // GRN cumulative consumption
    assert.match(sql, /SELECT COALESCE\(SUM\(sii_past\.quantity_invoiced\), 0\)[\s\S]*?INTO v_already_invoiced_grn_qty/);
    assert.match(sql, /WHERE sii_past\.grn_item_id = v_item\.grn_item_id/);
    assert.match(sql, /\(v_already_invoiced_grn_qty \+ v_item\.quantity_invoiced\) > v_gri\.quantity_received/);
  });

  await t.test("5. Header Math Reconciliation Invariant", () => {
    assert.match(
      sql,
      /IF ABS\(\(v_sinv\.subtotal \+ v_sinv\.tax_amount\) - v_sinv\.total_amount\) > 0\.05 THEN/
    );
    assert.match(sql, /SET match_status = 'PRICE_DISCREPANCY'/);
  });

  await t.test("6. Algorithmic Simulation: Strict Non-Bypassable Cumulative 3-Way Match", () => {
    function simulateThreeWayMatch({
      poLines,
      grnLines,
      postedInvoices,
      candidateInvoice,
    }) {
      // 0. Header Math
      if (
        Math.abs(
          candidateInvoice.subtotal +
            candidateInvoice.taxAmount -
            candidateInvoice.totalAmount
        ) > 0.05
      ) {
        return { success: false, reason: "header_math_discrepancy" };
      }

      // 1. Mandatory Line Items (No Zero-Line Fallback)
      if (
        !candidateInvoice.lines ||
        candidateInvoice.lines.length === 0
      ) {
        return { success: false, reason: "zero_line_forbidden" };
      }

      let calculatedSubtotal = 0;

      for (const line of candidateInvoice.lines) {
        // Line calculation
        if (
          Math.abs(line.quantity * line.unitPrice - line.lineTotal) > 0.05
        ) {
          return { success: false, reason: "line_math_discrepancy" };
        }
        calculatedSubtotal += line.lineTotal;

        // PO line match
        const poLine = poLines.find((p) => p.id === line.poItemId);
        if (!poLine) {
          return { success: false, reason: "po_line_not_found" };
        }

        // Unit price match
        if (Math.abs(line.unitPrice - poLine.unitCost) > 0.05) {
          return { success: false, reason: "unit_price_discrepancy" };
        }

        // Cumulative PO consumption
        const priorInvoicedPoQty = postedInvoices.reduce((sum, inv) => {
          const matchingLines = inv.lines.filter(
            (l) => l.poItemId === line.poItemId
          );
          return (
            sum +
            matchingLines.reduce((lSum, ml) => lSum + ml.quantity, 0)
          );
        }, 0);

        const totalInvoicedPoQty = priorInvoicedPoQty + line.quantity;
        if (totalInvoicedPoQty > poLine.quantityOrdered) {
          return {
            success: false,
            reason: "cumulative_ordered_exceeded",
            prior: priorInvoicedPoQty,
            current: line.quantity,
            ordered: poLine.quantityOrdered,
          };
        }
        if (totalInvoicedPoQty > poLine.quantityReceived) {
          return {
            success: false,
            reason: "cumulative_received_exceeded",
            prior: priorInvoicedPoQty,
            current: line.quantity,
            received: poLine.quantityReceived,
          };
        }

        // GRN line match (if specified)
        if (line.grnItemId) {
          const grnLine = grnLines.find((g) => g.id === line.grnItemId);
          if (!grnLine) {
            return { success: false, reason: "grn_line_not_found" };
          }

          const priorInvoicedGrnQty = postedInvoices.reduce((sum, inv) => {
            const matchingLines = inv.lines.filter(
              (l) => l.grnItemId === line.grnItemId
            );
            return (
              sum +
              matchingLines.reduce((lSum, ml) => lSum + ml.quantity, 0)
            );
          }, 0);

          const totalInvoicedGrnQty = priorInvoicedGrnQty + line.quantity;
          if (totalInvoicedGrnQty > grnLine.quantityReceived) {
            return {
              success: false,
              reason: "cumulative_grn_exceeded",
              prior: priorInvoicedGrnQty,
              current: line.quantity,
              received: grnLine.quantityReceived,
            };
          }
        }
      }

      // Subtotal check
      if (Math.abs(calculatedSubtotal - candidateInvoice.subtotal) > 0.05) {
        return { success: false, reason: "subtotal_line_mismatch" };
      }

      return { success: true, matchStatus: "MATCHED" };
    }

    const testPo = [
      { id: "poi-1", quantityOrdered: 100, quantityReceived: 100, unitCost: 50 },
      { id: "poi-2", quantityOrdered: 50, quantityReceived: 40, unitCost: 200 }, // partial receipt: 40 of 50
    ];

    const testGrn = [
      { id: "gri-1", quantityReceived: 100 },
      { id: "gri-2", quantityReceived: 40 },
    ];

    // Scenario 1: Zero-line invoice attempt -> MUST FAIL
    const zeroLineInv = {
      subtotal: 5000,
      taxAmount: 0,
      totalAmount: 5000,
      lines: [],
    };
    const rZero = simulateThreeWayMatch({
      poLines: testPo,
      grnLines: testGrn,
      postedInvoices: [],
      candidateInvoice: zeroLineInv,
    });
    assert.strictEqual(rZero.success, false);
    assert.strictEqual(rZero.reason, "zero_line_forbidden");

    // Scenario 2: Invoice 1 (partial 60 units of poi-1) -> PASS
    const inv1 = {
      subtotal: 3000,
      taxAmount: 0,
      totalAmount: 3000,
      lines: [{ poItemId: "poi-1", grnItemId: "gri-1", quantity: 60, unitPrice: 50, lineTotal: 3000 }],
    };
    const r1 = simulateThreeWayMatch({
      poLines: testPo,
      grnLines: testGrn,
      postedInvoices: [],
      candidateInvoice: inv1,
    });
    assert.strictEqual(r1.success, true);

    // Scenario 3: Invoice 2 attempts 50 units of poi-1 (60 + 50 = 110 > 100) -> MUST FAIL CUMULATIVE
    const inv2Excess = {
      subtotal: 2500,
      taxAmount: 0,
      totalAmount: 2500,
      lines: [{ poItemId: "poi-1", grnItemId: "gri-1", quantity: 50, unitPrice: 50, lineTotal: 2500 }],
    };
    const r2Excess = simulateThreeWayMatch({
      poLines: testPo,
      grnLines: testGrn,
      postedInvoices: [inv1],
      candidateInvoice: inv2Excess,
    });
    assert.strictEqual(r2Excess.success, false);
    assert.strictEqual(r2Excess.reason, "cumulative_ordered_exceeded");
    assert.strictEqual(r2Excess.prior, 60);
    assert.strictEqual(r2Excess.current, 50);

    // Scenario 4: Invoice 2 exact remaining 40 units of poi-1 (60 + 40 = 100) -> PASS
    const inv2Exact = {
      subtotal: 2000,
      taxAmount: 0,
      totalAmount: 2000,
      lines: [{ poItemId: "poi-1", grnItemId: "gri-1", quantity: 40, unitPrice: 50, lineTotal: 2000 }],
    };
    const r2Exact = simulateThreeWayMatch({
      poLines: testPo,
      grnLines: testGrn,
      postedInvoices: [inv1],
      candidateInvoice: inv2Exact,
    });
    assert.strictEqual(r2Exact.success, true);

    // Scenario 5: Invoice 3 attempts 1 more unit of poi-1 (100 + 1 = 101 > 100) -> MUST FAIL
    const inv3Excess = {
      subtotal: 50,
      taxAmount: 0,
      totalAmount: 50,
      lines: [{ poItemId: "poi-1", grnItemId: "gri-1", quantity: 1, unitPrice: 50, lineTotal: 50 }],
    };
    const r3Excess = simulateThreeWayMatch({
      poLines: testPo,
      grnLines: testGrn,
      postedInvoices: [inv1, inv2Exact],
      candidateInvoice: inv3Excess,
    });
    assert.strictEqual(r3Excess.success, false);
    assert.strictEqual(r3Excess.reason, "cumulative_ordered_exceeded");

    // Scenario 6: poi-2 has 50 ordered, but only 40 received. Invoice attempts 45 units -> MUST FAIL received check
    const invPoi2Excess = {
      subtotal: 9000,
      taxAmount: 0,
      totalAmount: 9000,
      lines: [{ poItemId: "poi-2", grnItemId: "gri-2", quantity: 45, unitPrice: 200, lineTotal: 9000 }],
    };
    const rPoi2Excess = simulateThreeWayMatch({
      poLines: testPo,
      grnLines: testGrn,
      postedInvoices: [],
      candidateInvoice: invPoi2Excess,
    });
    assert.strictEqual(rPoi2Excess.success, false);
    assert.strictEqual(rPoi2Excess.reason, "cumulative_received_exceeded");

    // Scenario 7: Header Math Discrepancy (subtotal 1000 + tax 150 != total 1200) -> MUST FAIL
    const invHeaderBad = {
      subtotal: 1000,
      taxAmount: 150,
      totalAmount: 1200, // Should be 1150
      lines: [{ poItemId: "poi-1", quantity: 20, unitPrice: 50, lineTotal: 1000 }],
    };
    const rHeaderBad = simulateThreeWayMatch({
      poLines: testPo,
      grnLines: testGrn,
      postedInvoices: [],
      candidateInvoice: invHeaderBad,
    });
    assert.strictEqual(rHeaderBad.success, false);
    assert.strictEqual(rHeaderBad.reason, "header_math_discrepancy");
  });
});
