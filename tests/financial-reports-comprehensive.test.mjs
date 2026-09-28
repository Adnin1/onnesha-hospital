import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  filterInvoicesByPeriod,
  computeFinancialAggregates,
  computeDepartmentalRevenue,
  computePaymentChannelBreakdown,
  computeMonthlyFinancialTrend,
  generateFinancialReportCSV,
} from "../lib/reports/financial.ts";

describe("OHMS Financial Analytics & Comprehensive Reporting Engine", () => {
  const refDate = new Date("2026-09-28T12:00:00Z");

  const sampleInvoices = [
    {
      id: "inv-1",
      organization_id: "org-1",
      invoice_number: "INV-202609-001",
      patient_id: "pat-1",
      subtotal: 1500,
      discount_amount: 200,
      grand_total: 1300,
      paid_amount: 1000,
      due_amount: 300,
      status: "PARTIAL",
      is_voided: false,
      created_at: "2026-09-28T04:00:00Z", // Today
      updated_at: "2026-09-28T04:00:00Z",
      items: [
        { service_category: "CONSULTATION", item_name: "OPD Specialist", unit_price: 1000, quantity: 1, total_price: 1000 },
        { service_category: "LAB", item_name: "CBC Test", unit_price: 500, quantity: 1, total_price: 500 },
      ],
      payments: [
        { id: "pmt-1", organization_id: "org-1", invoice_id: "inv-1", receipt_number: "REC-01", payment_method: "CASH", amount: 600, cashier_id: "usr-1", payment_date: "2026-09-28T04:00:00Z" },
        { id: "pmt-2", organization_id: "org-1", invoice_id: "inv-1", receipt_number: "REC-02", payment_method: "BKASH", amount: 400, cashier_id: "usr-1", payment_date: "2026-09-28T04:10:00Z" },
      ],
      patient: { id: "pat-1", patient_code: "OH-00101", full_name: "Rahim Uddin", phone: "01711000001" },
    },
    {
      id: "inv-2",
      organization_id: "org-1",
      invoice_number: "INV-202609-002",
      patient_id: "pat-2",
      subtotal: 2000,
      discount_amount: 0,
      grand_total: 2000,
      paid_amount: 2000,
      due_amount: 0,
      status: "PAID",
      is_voided: false,
      created_at: "2026-09-27T08:00:00Z", // Sunday of current calendar week (this_week, this_month)
      updated_at: "2026-09-27T08:00:00Z",
      items: [
        { service_category: "PHARMACY", item_name: "Antibiotics & Syrups", unit_price: 2000, quantity: 1, total_price: 2000 },
      ],
      payments: [
        { id: "pmt-3", organization_id: "org-1", invoice_id: "inv-2", receipt_number: "REC-03", payment_method: "NAGAD", amount: 2000, cashier_id: "usr-2", payment_date: "2026-09-27T08:05:00Z" },
      ],
      patient: { id: "pat-2", patient_code: "OH-00102", full_name: "Fatema Begum", phone: "01811000002" },
    },
    {
      id: "inv-3",
      organization_id: "org-1",
      invoice_number: "INV-202608-001",
      patient_id: "pat-3",
      subtotal: 5000,
      discount_amount: 500,
      grand_total: 4500,
      paid_amount: 4500,
      due_amount: 0,
      status: "PAID",
      is_voided: false,
      created_at: "2026-08-15T10:00:00Z", // Last month (August 2026)
      updated_at: "2026-08-15T10:00:00Z",
      items: [
        { service_category: "BED", item_name: "Deluxe Cabin Stay", unit_price: 4500, quantity: 1, total_price: 4500 },
      ],
      payments: [
        { id: "pmt-4", organization_id: "org-1", invoice_id: "inv-3", receipt_number: "REC-04", payment_method: "VISA", amount: 4500, cashier_id: "usr-1", payment_date: "2026-08-15T10:05:00Z" },
      ],
      patient: { id: "pat-3", patient_code: "OH-00088", full_name: "Karim Khan", phone: "01911000003" },
    },
    {
      id: "inv-4",
      organization_id: "org-1",
      invoice_number: "INV-202609-VOID",
      patient_id: "pat-1",
      subtotal: 1000,
      discount_amount: 0,
      grand_total: 1000,
      paid_amount: 0,
      due_amount: 0,
      status: "VOID",
      is_voided: true,
      void_reason: "Doctor consultation cancelled due to emergency call.",
      created_at: "2026-09-28T05:00:00Z",
      updated_at: "2026-09-28T05:15:00Z",
      items: [
        { service_category: "CONSULTATION", item_name: "Cardiology OPD", unit_price: 1000, quantity: 1, total_price: 1000 },
      ],
      payments: [],
      patient: { id: "pat-1", patient_code: "OH-00101", full_name: "Rahim Uddin", phone: "01711000001" },
    },
  ];

  test("1. Period filtering: today isolates records created on the current date", () => {
    const todayInvoices = filterInvoicesByPeriod(sampleInvoices, "today", undefined, undefined, refDate);
    assert.equal(todayInvoices.length, 2); // inv-1 and inv-4
    assert.ok(todayInvoices.some((i) => i.id === "inv-1"));
    assert.ok(todayInvoices.some((i) => i.id === "inv-4"));
  });

  test("2. Period filtering: this_week captures records within the Asia/Dhaka calendar week (Sunday to Saturday)", () => {
    const weekInvoices = filterInvoicesByPeriod(sampleInvoices, "this_week", undefined, undefined, refDate);
    assert.equal(weekInvoices.length, 3); // inv-1, inv-2, inv-4
    assert.ok(!weekInvoices.some((i) => i.id === "inv-3")); // August record excluded
  });

  test("3. Period filtering: this_month vs last_month isolates respective calendar months", () => {
    const sepInvoices = filterInvoicesByPeriod(sampleInvoices, "this_month", undefined, undefined, refDate);
    assert.equal(sepInvoices.length, 3); // September records

    const augInvoices = filterInvoicesByPeriod(sampleInvoices, "last_month", undefined, undefined, refDate);
    assert.equal(augInvoices.length, 1); // inv-3 (August)
    assert.equal(augInvoices[0].id, "inv-3");
  });

  test("4. Period filtering: this_year and custom range correctly bound invoices", () => {
    const yearInvoices = filterInvoicesByPeriod(sampleInvoices, "this_year", undefined, undefined, refDate);
    assert.equal(yearInvoices.length, 4); // All 4 are from 2026

    const customInvoices = filterInvoicesByPeriod(sampleInvoices, "custom", "2026-08-01", "2026-08-31", refDate);
    assert.equal(customInvoices.length, 1);
    assert.equal(customInvoices[0].id, "inv-3");
  });

  test("5. Financial aggregates compute accurate sums and exclude voided items from billed revenue", () => {
    const agg = computeFinancialAggregates(sampleInvoices);
    // Active invoices: inv-1 (1300), inv-2 (2000), inv-3 (4500) = 7800 total billed
    assert.equal(agg.totalBilled, 7800);
    // Paid amounts: inv-1 (1000) + inv-2 (2000) + inv-3 (4500) = 7500
    assert.equal(agg.totalCollected, 7500);
    // Due amounts: inv-1 (300) = 300
    assert.equal(agg.totalDues, 300);
    // Discounts: inv-1 (200) + inv-3 (500) = 700
    assert.equal(agg.totalDiscounts, 700);
    // Voided invoices: inv-4 (1000)
    assert.equal(agg.voidedInvoicesCount, 1);
    assert.equal(agg.totalVoidedAmount, 1000);
    // Rates
    assert.ok(agg.collectionRate >= 95, "Collection rate should be ~96%");
    assert.ok(agg.dueRate <= 5, "Due rate should be ~4%");
  });

  test("6. Departmental revenue accurately sums item totals by clinical category", () => {
    const depts = computeDepartmentalRevenue(sampleInvoices);
    const bedDept = depts.find((d) => d.category === "BED");
    const pharmDept = depts.find((d) => d.category === "PHARMACY");
    const opdDept = depts.find((d) => d.category === "CONSULTATION");
    const labDept = depts.find((d) => d.category === "LAB");

    assert.ok(bedDept && bedDept.totalRevenue === 4500);
    assert.ok(pharmDept && pharmDept.totalRevenue === 2000);
    assert.ok(opdDept && opdDept.totalRevenue === 1000); // Only active inv-1 counted, voided inv-4 excluded
    assert.ok(labDept && labDept.totalRevenue === 500);
  });

  test("7. Payment channels breakdown accurately calculates collections by MFS, Cash, and Card", () => {
    const channels = computePaymentChannelBreakdown(sampleInvoices);
    const cash = channels.find((c) => c.method === "CASH");
    const bkash = channels.find((c) => c.method === "BKASH");
    const nagad = channels.find((c) => c.method === "NAGAD");
    const visa = channels.find((c) => c.method === "VISA");

    assert.ok(cash && cash.totalCollected === 600);
    assert.ok(bkash && bkash.totalCollected === 400);
    assert.ok(nagad && nagad.totalCollected === 2000);
    assert.ok(visa && visa.totalCollected === 4500);
  });

  test("8. Monthly financial trend yields 12-month summary for target calendar year", () => {
    const trend = computeMonthlyFinancialTrend(sampleInvoices, 2026);
    assert.equal(trend.length, 12);
    // August (monthIndex 7): inv-3 = 4500
    assert.equal(trend[7].invoiced, 4500);
    assert.equal(trend[7].collected, 4500);
    // September (monthIndex 8): inv-1 (1300) + inv-2 (2000) = 3300
    assert.equal(trend[8].invoiced, 3300);
    assert.equal(trend[8].collected, 3000);
    assert.equal(trend[8].dues, 300);
  });

  test("9. CSV export generates standard RFC-compliant comma-separated table with escaped quotes", () => {
    const csv = generateFinancialReportCSV(sampleInvoices);
    assert.ok(csv.includes("Invoice Number,Date (BST)"));
    assert.ok(csv.includes("INV-202609-001"));
    assert.ok(csv.includes("Rahim Uddin"));
    assert.ok(csv.includes("Doctor consultation cancelled due to emergency call."));
  });
});
