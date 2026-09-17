"use client";

import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Printer,
  Ban,
  Search,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  InvoiceRecord,
  InvoiceItemRecord,
  PaymentRecord,
  CashRegisterSummary,
} from "@/types/billing";
import {
  getInvoicesAction,
  createInvoiceAction,
  collectPaymentAction,
  voidInvoiceAction,
  getCashRegisterSummaryAction,
} from "@/lib/billing/actions";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function BillingManagementPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [registerSummary, setRegisterSummary] = useState<CashRegisterSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Invoice Modal
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [patientIdInput, setPatientIdInput] = useState("");
  const [items, setItems] = useState<Array<{
    category: InvoiceItemRecord["service_category"];
    itemName: string;
    unitPrice: number;
    quantity: number;
  }>>([
    {
      category: "CONSULTATION",
      itemName: "General OPD Consultation",
      unitPrice: 500,
      quantity: 1,
    },
  ]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [initialPaymentAmount, setInitialPaymentAmount] = useState(500);
  const [paymentMethod, setPaymentMethod] = useState<PaymentRecord["payment_method"]>("CASH");
  const [formLoading, setFormLoading] = useState(false);

  // Collect Payment Modal
  const [paymentModalInv, setPaymentModalInv] = useState<InvoiceRecord | null>(null);
  const [collectAmount, setCollectAmount] = useState(0);
  const [collectMethod, setCollectMethod] = useState<PaymentRecord["payment_method"]>("CASH");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectLoading, setCollectLoading] = useState(false);

  const loadBillingData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [invRes, regRes] = await Promise.all([
        getInvoicesAction({ status: statusFilter }),
        getCashRegisterSummaryAction(),
      ]);

      if (invRes.success && invRes.data) {
        setInvoices(invRes.data.invoices);
        if (invRes.data.invoices.length > 0 && !selectedInvoice) {
          setSelectedInvoice(invRes.data.invoices[0]);
        }
      } else {
        setErrorMsg(invRes.error || "Failed to load invoices");
      }

      if (regRes.success && regRes.data) {
        setRegisterSummary(regRes.data.summary);
      }
    } catch {
      setErrorMsg("Network error loading billing ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [invRes, regRes] = await Promise.all([
          getInvoicesAction({ status: statusFilter === "ALL" ? undefined : statusFilter }),
          getCashRegisterSummaryAction(),
        ]);

        if (isMounted) {
          if (invRes.success && invRes.data) {
            setInvoices(invRes.data.invoices);
          } else {
            setErrorMsg(invRes.error || "Failed to load invoices");
          }

          if (regRes.success && regRes.data) {
            setRegisterSummary(regRes.data.summary);
          }
        }
      } catch {
        if (isMounted) setErrorMsg("Network error loading billing ledger");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [statusFilter]);

  // Calculations for new invoice
  const subtotal = items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
  const netTotal = Math.max(0, subtotal - discountAmount);
  const dueAmount = Math.max(0, netTotal - initialPaymentAmount);

  const addItemRow = (category: InvoiceItemRecord["service_category"], name: string, price: number) => {
    const next = [...items, { category, itemName: name, unitPrice: price, quantity: 1 }];
    setItems(next);
    const newSub = next.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
    setInitialPaymentAmount(Math.max(0, newSub - discountAmount));
  };

  const removeItemRow = (idx: number) => {
    if (items.length <= 1) return;
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientIdInput.trim()) {
      alert("Please enter a valid Patient ID or Code.");
      return;
    }

    setFormLoading(true);
    try {
      const res = await createInvoiceAction({
        patientId: patientIdInput.trim(),
        items,
        discountAmount: Number(discountAmount),
        discountReason: discountReason.trim() || undefined,
        initialPaymentAmount: Number(initialPaymentAmount),
        paymentMethod,
      });

      if (res.success && res.data) {
        setIsCreatingNew(false);
        await loadBillingData();
        setSelectedInvoice(res.data.invoice);
      } else {
        alert(res.error || "Failed to generate invoice");
      }
    } catch {
      alert("Error generating invoice");
    } finally {
      setFormLoading(false);
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInv) return;

    setCollectLoading(true);
    try {
      const res = await collectPaymentAction({
        invoiceId: paymentModalInv.id,
        amount: Number(collectAmount),
        paymentMethod: collectMethod,
        notes: collectNotes.trim() || undefined,
      });

      if (res.success) {
        setPaymentModalInv(null);
        await loadBillingData();
      } else {
        alert(res.error || "Failed to collect payment");
      }
    } catch {
      alert("Error processing payment");
    } finally {
      setCollectLoading(false);
    }
  };

  const handleVoidInvoice = async (invoice: InvoiceRecord) => {
    const reason = prompt("Enter supervisor void reason for audit vault:");
    if (!reason) return;

    try {
      const res = await voidInvoiceAction({ invoiceId: invoice.id, reason });
      if (res.success) {
        await loadBillingData();
      } else {
        alert(res.error || "Failed to void invoice");
      }
    } catch {
      alert("Error voiding invoice");
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const q = searchQuery.toLowerCase();
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.patient?.full_name && inv.patient.full_name.toLowerCase().includes(q)) ||
      (inv.patient?.patient_code && inv.patient.patient_code.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Revenue Cycle & Cash Counter
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Billing & Invoicing Engine
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Non-destructive ledger, multi-service invoices, partial payment tracking, and digital cashier receipts.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadBillingData}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh billing data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setIsCreatingNew(true)}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Generate New Invoice
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* CASH COUNTER SUMMARY STRIP */}
      {registerSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Today&apos;s Invoiced</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {formatCurrencyBDT(registerSummary.todayTotalInvoiced)}
            </div>
            <span className="text-[10px] text-slate-400">{registerSummary.activeInvoiceCount} Active Bills</span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
            <span className="text-[11px] font-bold text-emerald-800 uppercase">Cash Collected</span>
            <div className="text-2xl font-black text-emerald-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayCashCollected)}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">Physical cash register</span>
          </div>

          <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 shadow-2xs">
            <span className="text-[11px] font-bold text-sky-800 uppercase">MFS (bKash/Nagad)</span>
            <div className="text-2xl font-black text-sky-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayMfsCollected)}
            </div>
            <span className="text-[10px] text-sky-700 font-medium">Digital gateway receipts</span>
          </div>

          <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 shadow-2xs">
            <span className="text-[11px] font-bold text-indigo-800 uppercase">Total Collected</span>
            <div className="text-2xl font-black text-indigo-700 mt-1">
              {formatCurrencyBDT(registerSummary.todayTotalCollected)}
            </div>
            <span className="text-[10px] text-indigo-700 font-medium">Settled today</span>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 items-center">
        <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          {["ALL", "UNPAID", "PARTIAL", "PAID", "VOID"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === status ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoice number, patient..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
      </div>

      {/* MAIN LAYOUT: INVOICES LIST & DETAILS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: INVOICE TABLE */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500">
                      Loading invoices...
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500">
                      No invoices found.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className={`cursor-pointer transition hover:bg-slate-50/80 ${
                        selectedInvoice?.id === inv.id ? "bg-sky-50/50 font-semibold" : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{inv.patient?.full_name || "Patient"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{inv.patient?.patient_code}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrencyBDT(inv.grand_total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 font-bold">
                        {formatCurrencyBDT(inv.paid_amount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-rose-600 font-bold">
                        {formatCurrencyBDT(inv.due_amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.status === "PAID"
                              ? "bg-emerald-100 text-emerald-800"
                              : inv.status === "PARTIAL"
                              ? "bg-amber-100 text-amber-800"
                              : inv.status === "VOID"
                              ? "bg-slate-200 text-slate-700 line-through"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: INVOICE PREVIEW / PRINT SLIP */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          {selectedInvoice ? (
            <div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Official Invoice</span>
                  <h3 className="text-base font-black text-slate-900 font-mono">{selectedInvoice.invoice_number}</h3>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => window.print()}
                    className="p-2 border rounded-xl hover:bg-slate-50 text-slate-700 transition"
                    title="Print Invoice"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  {selectedInvoice.due_amount > 0 && !selectedInvoice.is_voided && (
                    <button
                      onClick={() => {
                        setPaymentModalInv(selectedInvoice);
                        setCollectAmount(selectedInvoice.due_amount);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition flex items-center shadow-2xs"
                    >
                      <Wallet className="w-3.5 h-3.5 mr-1" />
                      Collect Due
                    </button>
                  )}
                  {!selectedInvoice.is_voided && (
                    <button
                      onClick={() => handleVoidInvoice(selectedInvoice)}
                      className="p-2 border border-rose-200 rounded-xl hover:bg-rose-50 text-rose-600 transition"
                      title="Void Invoice"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* PRINTABLE SLIP CONTAINER */}
              <div className="pt-4 space-y-3 text-xs">
                <HospitalPrintHeader documentTitle="BILLING INVOICE & CASH RECEIPT" />

                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium">Patient:</span>
                    <p className="font-bold text-slate-900">{selectedInvoice.patient?.full_name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      ID: {selectedInvoice.patient?.patient_code} • Ph: {selectedInvoice.patient?.phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 font-medium">Issue Date:</span>
                    <p className="font-mono text-slate-900">{formatDateBDT(selectedInvoice.created_at)}</p>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 ${
                        selectedInvoice.status === "PAID"
                          ? "bg-emerald-100 text-emerald-800"
                          : selectedInvoice.status === "PARTIAL"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {selectedInvoice.status}
                    </span>
                  </div>
                </div>

                {/* LINE ITEMS */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Service Line Items</span>
                  <table className="w-full text-left text-xs border border-slate-100 rounded-lg overflow-hidden">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[9px]">
                      <tr>
                        <th className="py-1.5 px-2">Item</th>
                        <th className="py-1.5 px-2 text-center">Qty</th>
                        <th className="py-1.5 px-2 text-right">Price</th>
                        <th className="py-1.5 px-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedInvoice.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-2 font-medium">{it.item_name}</td>
                          <td className="py-1.5 px-2 text-center font-mono">{it.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{formatCurrencyBDT(it.unit_price)}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold">
                            {formatCurrencyBDT(it.total_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* TOTAL SUMMARY */}
                <div className="p-3 bg-slate-50 rounded-xl space-y-1 font-mono text-xs border border-slate-100">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>{formatCurrencyBDT(selectedInvoice.subtotal)}</span>
                  </div>
                  {selectedInvoice.discount_amount > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Discount:</span>
                      <span>-{formatCurrencyBDT(selectedInvoice.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1">
                    <span>Grand Total:</span>
                    <span>{formatCurrencyBDT(selectedInvoice.grand_total)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Paid Amount:</span>
                    <span>{formatCurrencyBDT(selectedInvoice.paid_amount)}</span>
                  </div>
                  <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
                    <span>Remaining Due:</span>
                    <span>{formatCurrencyBDT(selectedInvoice.due_amount)}</span>
                  </div>
                </div>

                {/* PAYMENTS HISTORY */}
                {selectedInvoice.payments.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Payment Receipts</span>
                    {selectedInvoice.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between items-center p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 text-[11px]"
                      >
                        <span className="font-mono text-emerald-950 font-bold">
                          {p.receipt_number} ({p.payment_method})
                        </span>
                        <span className="font-mono font-black text-emerald-700">{formatCurrencyBDT(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <HospitalPrintFooter />
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs">
              Select an invoice from the ledger to view detailed receipts.
            </div>
          )}
        </div>
      </div>

      {/* GENERATE INVOICE MODAL */}
      {isCreatingNew && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 text-xs max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-black text-slate-900 mb-1">Generate Patient Invoice</h3>
            <p className="text-slate-500 mb-4">Add consultation, diagnostic, bed, or surgery charges.</p>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Patient UUID or Reference *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter patient ID"
                  value={patientIdInput}
                  onChange={(e) => setPatientIdInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                />
              </div>

              {/* Preset quick buttons */}
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">
                  Quick Service Adder:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addItemRow("CONSULTATION", "Consultant Specialist OPD", 800)}
                    className="px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-800 font-bold text-[11px]"
                  >
                    + Consultation (800)
                  </button>
                  <button
                    type="button"
                    onClick={() => addItemRow("LAB", "Complete Blood Count (CBC)", 450)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[11px]"
                  >
                    + CBC Lab (450)
                  </button>
                  <button
                    type="button"
                    onClick={() => addItemRow("BED", "General Ward Bed Daily Tariff", 1000)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold text-[11px]"
                  >
                    + Ward Bed (1000)
                  </button>
                  <button
                    type="button"
                    onClick={() => addItemRow("OT", "Major Surgical Theater Charge", 6000)}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-bold text-[11px]"
                  >
                    + OT Charge (6000)
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Invoice Line Items:</span>
                {items.map((it, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={it.category}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].category = e.target.value as InvoiceItemRecord["service_category"];
                        setItems(next);
                      }}
                      className="w-28 px-2 py-1.5 border rounded-lg bg-slate-50 font-semibold text-[11px]"
                    >
                      <option value="CONSULTATION">Consultation</option>
                      <option value="LAB">Lab</option>
                      <option value="XRAY">X-Ray</option>
                      <option value="USG">USG</option>
                      <option value="BED">Bed</option>
                      <option value="OT">OT</option>
                      <option value="PHARMACY">Pharmacy</option>
                      <option value="MISC">Misc</option>
                    </select>

                    <input
                      type="text"
                      required
                      value={it.itemName}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].itemName = e.target.value;
                        setItems(next);
                      }}
                      className="flex-1 px-2.5 py-1.5 border rounded-lg bg-slate-50 font-semibold text-[11px]"
                    />

                    <input
                      type="number"
                      min="1"
                      value={it.quantity}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].quantity = Number(e.target.value);
                        setItems(next);
                      }}
                      className="w-16 px-2 py-1.5 border rounded-lg bg-slate-50 font-mono text-center text-[11px]"
                    />

                    <input
                      type="number"
                      min="0"
                      value={it.unitPrice}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].unitPrice = Number(e.target.value);
                        setItems(next);
                      }}
                      className="w-24 px-2 py-1.5 border rounded-lg bg-slate-50 font-mono text-right text-[11px]"
                    />

                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      className="p-1.5 text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Totals & Initial Settlement */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div className="space-y-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Discount (BDT)</label>
                    <input
                      type="number"
                      min="0"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Discount Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Director waiver"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Initial Payment (BDT)</label>
                    <input
                      type="number"
                      min="0"
                      value={initialPaymentAmount}
                      onChange={(e) => setInitialPaymentAmount(Number(e.target.value))}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentRecord["payment_method"])}
                      className="w-full px-3 py-1.5 border rounded-xl bg-slate-50 font-semibold"
                    >
                      <option value="CASH">Cash Counter</option>
                      <option value="BKASH">bKash Merchant</option>
                      <option value="NAGAD">Nagad</option>
                      <option value="ROCKET">Rocket</option>
                      <option value="VISA">Visa / Mastercard</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl font-mono text-xs flex justify-between font-bold">
                <span>Grand Total: {formatCurrencyBDT(netTotal)}</span>
                <span className="text-rose-600">Remaining Due: {formatCurrencyBDT(dueAmount)}</span>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {formLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm & Issue Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COLLECT PAYMENT MODAL */}
      {paymentModalInv && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-xs">
            <h3 className="text-base font-black text-slate-900 mb-1">Collect Due Payment</h3>
            <p className="text-slate-500 mb-4">
              Invoice: <strong>{paymentModalInv.invoice_number}</strong> • Total Due:{" "}
              <strong className="text-rose-600">{formatCurrencyBDT(paymentModalInv.due_amount)}</strong>
            </p>

            <form onSubmit={handleCollectPayment} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Collect Amount (BDT) *</label>
                <input
                  type="number"
                  min="1"
                  max={paymentModalInv.due_amount}
                  required
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as PaymentRecord["payment_method"])}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="CASH">Cash Counter</option>
                  <option value="BKASH">bKash Merchant</option>
                  <option value="NAGAD">Nagad</option>
                  <option value="ROCKET">Rocket</option>
                  <option value="VISA">Visa / Mastercard</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Transaction ID</label>
                <input
                  type="text"
                  placeholder="e.g. TrxID / Counter note"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPaymentModalInv(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl disabled:opacity-50 flex items-center"
                >
                  {collectLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  Confirm Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
