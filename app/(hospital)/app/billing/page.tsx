"use client";

import React, { useState } from "react";
import {
  Receipt,
  Plus,
  Trash2,
  Printer,
  Ban,
  DollarSign,
  Search,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Microscope,
  Pill,
  Bed,
} from "lucide-react";
import { MOCK_INVOICES, MOCK_PATIENTS, MOCK_DOCTORS, MOCK_LAB_TESTS } from "@/lib/mock-data";
import { Invoice, InvoiceItem } from "@/types";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";

export default function BillingManagementPage() {
  const [invoices, setInvoices] = useState<Invoice[]>(MOCK_INVOICES);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(MOCK_INVOICES[0]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // New Invoice Form State
  const [selectedPatientId, setSelectedPatientId] = useState(MOCK_PATIENTS[0].id);
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: "item-init-1",
      item_type: "consultation",
      description: "OPD Consultation - Prof. Dr. M. A. Rahman",
      unit_price: 800,
      quantity: 1,
      total_price: 800,
    },
  ]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [paidAmount, setPaidAmount] = useState(800);
  const [paymentMethod, setPaymentMethod] = useState<any>("cash");

  // Calculations
  const subtotal = items.reduce((acc, it) => acc + it.total_price, 0);
  const netTotal = Math.max(0, subtotal - discountAmount);
  const dueAmount = Math.max(0, netTotal - paidAmount);

  // Add Item to Bill
  const addItem = (type: any, desc: string, price: number) => {
    const newItem: InvoiceItem = {
      id: `it-${Date.now()}`,
      item_type: type,
      description: desc,
      unit_price: price,
      quantity: 1,
      total_price: price,
    };
    const updated = [...items, newItem];
    setItems(updated);
    const newSub = updated.reduce((acc, it) => acc + it.total_price, 0);
    setPaidAmount(Math.max(0, newSub - discountAmount));
  };

  const removeItem = (id: string) => {
    const updated = items.filter((it) => it.id !== id);
    setItems(updated);
  };

  // Submit and Generate Invoice
  const handleGenerateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const patient = MOCK_PATIENTS.find((p) => p.id === selectedPatientId) || MOCK_PATIENTS[0];
    const nextInvNo = `INV-2026-${String(invoices.length + 893).padStart(4, "0")}`;

    const newInv: Invoice = {
      id: `inv-${Date.now()}`,
      organization_id: "a0000000-0000-0000-0000-000000000001",
      patient_id: patient.id,
      patient_name: patient.full_name,
      patient_code: patient.patient_id,
      patient_phone: patient.phone,
      invoice_number: nextInvNo,
      items: items,
      subtotal: subtotal,
      discount_amount: discountAmount,
      discount_percent: subtotal > 0 ? (discountAmount / subtotal) * 100 : 0,
      discount_reason: discountReason,
      discount_approved_by: discountAmount > 0 ? "Admin (Approved)" : undefined,
      tax_amount: 0,
      total_amount: netTotal,
      paid_amount: paidAmount,
      due_amount: dueAmount,
      payment_status: dueAmount === 0 ? "paid" : paidAmount > 0 ? "partially_paid" : "unpaid",
      payment_method: paymentMethod,
      is_void: false,
      created_by_name: "Jewel Hossain (Cashier)",
      created_at: new Date().toISOString(),
    };

    setInvoices([newInv, ...invoices]);
    setSelectedInvoice(newInv);
    setIsCreatingNew(false);
  };

  // Void Invoice Action (Audit Compliance)
  const handleVoidInvoice = (invId: string) => {
    const reason = prompt("Enter mandatory reason for VOIDING this invoice (Audit log recorded):");
    if (!reason) return;

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invId
          ? {
              ...inv,
              is_void: true,
              payment_status: "void",
              void_reason: reason,
              voided_by: "Super Admin (Audit Recorded)",
            }
          : inv
      )
    );
    if (selectedInvoice?.id === invId) {
      setSelectedInvoice((prev) =>
        prev
          ? {
              ...prev,
              is_void: true,
              payment_status: "void",
              void_reason: reason,
              voided_by: "Super Admin",
            }
          : null
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Consolidated Billing & Cashier Desk
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Patient Invoices, POS & Revenue Audit
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Multi-category billing (Doctor, Lab, Radiology, Bed, OT, Pharmacy) with audit trail and thermal print.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingNew(true)}
          className="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Create New Bill (POS)
        </button>
      </div>

      {/* Main Dual Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Invoice History & Filter (5 cols) */}
        <div className="lg:col-span-5 space-y-4 no-print">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Recent Billing Transactions
            </h3>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {invoices.map((inv) => {
                const isSelected = selectedInvoice?.id === inv.id;
                return (
                  <div
                    key={inv.id}
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setIsCreatingNew(false);
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex justify-between items-center ${
                      isSelected
                        ? "bg-sky-50/80 border-sky-300 shadow-2xs"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    } ${inv.is_void ? "opacity-60 bg-red-50/30" : ""}`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-slate-900">
                          {inv.invoice_number}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            inv.is_void
                              ? "bg-rose-100 text-rose-800"
                              : inv.payment_status === "paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {inv.payment_status}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mt-1">
                        {inv.patient_name} ({inv.patient_code})
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {formatDateBDT(inv.created_at)} • {inv.created_by_name}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900 block">
                        {formatCurrencyBDT(inv.total_amount)}
                      </span>
                      {inv.due_amount > 0 && !inv.is_void && (
                        <span className="text-[10px] font-bold text-rose-600 block">
                          Due: {formatCurrencyBDT(inv.due_amount)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Invoice Viewer & Printable Pad or New Bill Form (7 cols) */}
        <div className="lg:col-span-7">
          {isCreatingNew ? (
            /* NEW INVOICE BUILDER FORM */
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 no-print">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">
                  New Consolidated Invoice (POS Terminal)
                </h2>
                <button
                  onClick={() => setIsCreatingNew(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
              </div>

              {/* Patient Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Registered Patient
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-slate-50 font-medium"
                >
                  {MOCK_PATIENTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.patient_id} - {p.full_name} ({p.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Add Presets */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  1-Click Quick Add Service
                </label>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => addItem("consultation", "OPD Consultation - Prof. Dr. M. A. Rahman", 800)}
                    className="p-1.5 px-2.5 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg border border-blue-200 font-medium flex items-center"
                  >
                    <Stethoscope className="w-3 h-3 mr-1" />
                    + Dr. Rahman (৳800)
                  </button>
                  <button
                    type="button"
                    onClick={() => addItem("lab_test", "Complete Blood Count (CBC with ESR)", 450)}
                    className="p-1.5 px-2.5 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg border border-purple-200 font-medium flex items-center"
                  >
                    <Microscope className="w-3 h-3 mr-1" />
                    + CBC Test (৳450)
                  </button>
                  <button
                    type="button"
                    onClick={() => addItem("radiology", "Digital Chest X-Ray P/A", 600)}
                    className="p-1.5 px-2.5 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg border border-purple-200 font-medium flex items-center"
                  >
                    <Microscope className="w-3 h-3 mr-1" />
                    + X-Ray (৳600)
                  </button>
                  <button
                    type="button"
                    onClick={() => addItem("bed_charge", "VIP Cabin Daily Charge (Day 1)", 3500)}
                    className="p-1.5 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200 font-medium flex items-center"
                  >
                    <Bed className="w-3 h-3 mr-1" />
                    + VIP Cabin (৳3500)
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Item / Service Description</th>
                      <th className="p-2.5 text-right">Unit Price</th>
                      <th className="p-2.5 text-right">Total</th>
                      <th className="p-2.5 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td className="p-2.5 font-medium text-slate-900">{it.description}</td>
                        <td className="p-2.5 text-right font-mono text-slate-700">
                          {formatCurrencyBDT(it.unit_price)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          {formatCurrencyBDT(it.total_price)}
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Special Discount (৳)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => {
                      const disc = parseFloat(e.target.value) || 0;
                      setDiscountAmount(disc);
                      setPaidAmount(Math.max(0, subtotal - disc));
                    }}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                  {discountAmount > 0 && (
                    <input
                      type="text"
                      placeholder="Discount approval reason..."
                      required
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="w-full mt-1.5 p-2 text-xs border border-amber-300 bg-amber-50 rounded-lg"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Amount Paid at Counter (৳)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-slate-50 font-bold text-emerald-700"
                  />
                  <div className="flex gap-2 mt-2">
                    {["cash", "bkash", "nagad", "card"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`text-[11px] px-2.5 py-1 rounded-md uppercase font-semibold border transition ${
                          paymentMethod === m
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary Bar */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center font-bold">
                <div>
                  <span className="text-slate-500">Subtotal: {formatCurrencyBDT(subtotal)}</span>
                  {discountAmount > 0 && (
                    <span className="text-amber-700 ml-3">
                      Disc: -{formatCurrencyBDT(discountAmount)}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-slate-900 mr-3">Net: {formatCurrencyBDT(netTotal)}</span>
                  {dueAmount > 0 ? (
                    <span className="text-rose-600">Due: {formatCurrencyBDT(dueAmount)}</span>
                  ) : (
                    <span className="text-emerald-700">Fully Paid</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={handleGenerateInvoice}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-sm transition"
                >
                  Confirm & Print Invoice
                </button>
              </div>
            </div>
          ) : selectedInvoice ? (
            /* INVOICE OFFICIAL PAD VIEWER */
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              {/* Action bar (Hide on print) */}
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-6 no-print">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-500">
                    Invoice Status:
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                      selectedInvoice.is_void
                        ? "bg-rose-100 text-rose-800"
                        : selectedInvoice.payment_status === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {selectedInvoice.payment_status}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {!selectedInvoice.is_void && (
                    <button
                      onClick={() => handleVoidInvoice(selectedInvoice.id)}
                      className="inline-flex items-center text-rose-600 hover:text-rose-700 text-xs font-semibold px-3 py-1.5 border border-rose-200 rounded-lg hover:bg-rose-50"
                      title="Void bill (Audit logged)"
                    >
                      <Ban className="w-3.5 h-3.5 mr-1" />
                      Void / Cancel Bill
                    </button>
                  )}
                  <button
                    onClick={handlePrint}
                    className="inline-flex items-center bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                    Print Receipt
                  </button>
                </div>
              </div>

              {/* Official Hospital Invoice Document */}
              <div className="print-pad">
                <HospitalPrintHeader
                  documentTitle="OFFICIAL MONEY RECEIPT & INVOICE"
                  documentNumber={selectedInvoice.invoice_number}
                  dateStr={formatDateBDT(selectedInvoice.created_at)}
                />

                {selectedInvoice.is_void && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-lg text-xs font-bold my-3 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <span>THIS BILL HAS BEEN VOIDED / CANCELLED</span>
                      <p className="text-[10px] font-normal mt-0.5">
                        Reason: {selectedInvoice.void_reason} (By: {selectedInvoice.voided_by})
                      </p>
                    </div>
                  </div>
                )}

                {/* Patient Particulars */}
                <div className="grid grid-cols-2 gap-2 text-xs py-3 border-y border-slate-200 my-4">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Patient Name</span>
                    <strong className="text-slate-900">{selectedInvoice.patient_name}</strong>
                    <span className="block text-slate-600 font-mono text-[11px]">
                      Patient ID: {selectedInvoice.patient_code}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[10px]">Billing Info</span>
                    <span className="text-slate-700 font-medium">
                      Phone: {selectedInvoice.patient_phone || "N/A"}
                    </span>
                    <span className="block text-slate-500 text-[11px]">
                      Payment Method: {selectedInvoice.payment_method?.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="my-4">
                  <table className="w-full text-left text-xs border border-slate-200">
                    <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-8 text-center">#</th>
                        <th className="p-2">Item / Diagnostic / Consultation</th>
                        <th className="p-2 text-right">Rate</th>
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedInvoice.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="p-2 text-slate-900 font-medium">{it.description}</td>
                          <td className="p-2 text-right font-mono text-slate-700">
                            {formatCurrencyBDT(it.unit_price)}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {formatCurrencyBDT(it.total_price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Calculation Block */}
                <div className="flex justify-end my-4">
                  <div className="w-64 text-xs space-y-1.5 border-t border-slate-300 pt-2">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span className="font-mono">{formatCurrencyBDT(selectedInvoice.subtotal)}</span>
                    </div>
                    {selectedInvoice.discount_amount > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span>Discount ({selectedInvoice.discount_percent.toFixed(1)}%):</span>
                        <span className="font-mono">-{formatCurrencyBDT(selectedInvoice.discount_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-900 font-bold text-sm border-t border-slate-200 pt-1">
                      <span>Net Payable:</span>
                      <span className="font-mono">{formatCurrencyBDT(selectedInvoice.total_amount)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Paid Amount:</span>
                      <span className="font-mono">{formatCurrencyBDT(selectedInvoice.paid_amount)}</span>
                    </div>
                    {selectedInvoice.due_amount > 0 && (
                      <div className="flex justify-between text-rose-600 font-bold border-t border-slate-200 pt-1">
                        <span>Outstanding Due:</span>
                        <span className="font-mono">{formatCurrencyBDT(selectedInvoice.due_amount)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <HospitalPrintFooter />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
              Select an invoice from the left or create a new bill.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
