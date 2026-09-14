"use client";

import React from "react";
import { HospitalPrintHeader, HospitalPrintFooter } from "./HospitalPrintHeader";
import { generateSvgBarcode } from "@/lib/print/barcode";

export interface A4InvoicePrintProps {
  invoiceNumber: string;
  dateStr: string;
  dueDateStr?: string;
  patient: {
    name: string;
    patientCode: string;
    phone?: string;
    address?: string;
  };
  departmentName?: string;
  admittingDoctorName?: string;
  items: Array<{
    description: string;
    serviceCategory: string;
    unitPrice: number;
    quantity: number;
    totalAmount: number;
  }>;
  payments: Array<{
    receiptNumber: string;
    paymentMethod: string;
    amount: number;
    paidAt: string;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
}

export function A4InvoicePrint({
  invoiceNumber,
  dateStr,
  dueDateStr,
  patient,
  departmentName,
  admittingDoctorName,
  items,
  payments,
  subtotal,
  discount,
  tax,
  totalAmount,
  paidAmount,
  dueAmount,
}: A4InvoicePrintProps) {
  const barcodeSvg = generateSvgBarcode(invoiceNumber, 36);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-zinc-900 print:m-0 print:p-0">
      {/* 1. Official Header */}
      <HospitalPrintHeader
        documentTitle="HOSPITAL BILLING STATEMENT"
        documentNumber={invoiceNumber}
        dateStr={dateStr}
      />

      {/* 2. Patient & Admission Metadata */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded border bg-zinc-50 p-4 text-xs">
        <div className="space-y-1">
          <div><span className="text-zinc-500">Patient Name: </span><strong>{patient.name}</strong></div>
          <div><span className="text-zinc-500">Hospital ID: </span><strong className="font-mono">{patient.patientCode}</strong></div>
          {patient.phone && <div><span className="text-zinc-500">Contact: </span><span>{patient.phone}</span></div>}
          {patient.address && <div><span className="text-zinc-500">Address: </span><span>{patient.address}</span></div>}
        </div>
        <div className="space-y-1 text-right">
          {departmentName && <div><span className="text-zinc-500">Department: </span><strong>{departmentName}</strong></div>}
          {admittingDoctorName && <div><span className="text-zinc-500">Attending Consultant: </span><strong>{admittingDoctorName}</strong></div>}
          {dueDateStr && <div><span className="text-zinc-500">Settlement Due Date: </span><span>{dueDateStr}</span></div>}
          <div className="pt-1">
            <span className={`inline-block rounded px-2.5 py-0.5 font-bold uppercase text-[10px] ${
              dueAmount <= 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800"
            }`}>
              {dueAmount <= 0 ? "PAID IN FULL" : `DUE: BDT ${dueAmount.toLocaleString()}`}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Itemized Bill Table */}
      <div className="mb-6">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-700">Itemized Charges</h3>
        <table className="w-full text-left text-xs border border-collapse border-zinc-200">
          <thead className="bg-zinc-100">
            <tr>
              <th className="border p-2">#</th>
              <th className="border p-2">Service / Description</th>
              <th className="border p-2">Category</th>
              <th className="border p-2 text-right">Unit Price</th>
              <th className="border p-2 text-center">Qty</th>
              <th className="border p-2 text-right">Total (BDT)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-b">
                <td className="border p-2 text-zinc-500">{idx + 1}</td>
                <td className="border p-2 font-medium">{it.description}</td>
                <td className="border p-2 text-zinc-500">{it.serviceCategory}</td>
                <td className="border p-2 text-right">৳{it.unitPrice.toFixed(2)}</td>
                <td className="border p-2 text-center">{it.quantity}</td>
                <td className="border p-2 text-right font-semibold">৳{it.totalAmount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. Financial Summary & Payments Ledger */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        {/* Payment History */}
        <div className="col-span-7">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-700">Payment Settlements</h3>
          {payments.length === 0 ? (
            <div className="rounded border border-dashed p-3 text-xs text-zinc-500">No payment records received yet.</div>
          ) : (
            <table className="w-full text-left text-xs border">
              <thead className="bg-zinc-50 text-[11px]">
                <tr>
                  <th className="border p-1.5">Receipt #</th>
                  <th className="border p-1.5">Method</th>
                  <th className="border p-1.5 text-right">Amount</th>
                  <th className="border p-1.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, idx) => (
                  <tr key={idx}>
                    <td className="border p-1.5 font-mono">{p.receiptNumber}</td>
                    <td className="border p-1.5 font-semibold">{p.paymentMethod}</td>
                    <td className="border p-1.5 text-right font-semibold">৳{p.amount.toFixed(2)}</td>
                    <td className="border p-1.5 text-zinc-500">{new Date(p.paidAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Calculation Table */}
        <div className="col-span-5 rounded border bg-zinc-50 p-3 text-xs space-y-2">
          <div className="flex justify-between text-zinc-600">
            <span>Gross Charges:</span>
            <span>৳{subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Hospital Discount:</span>
              <span>-৳{discount.toFixed(2)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-zinc-600">
              <span>Tax / VAT:</span>
              <span>৳{tax.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-bold text-zinc-900 text-sm">
            <span>Net Payable:</span>
            <span>৳{totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold">
            <span>Total Collected:</span>
            <span>৳{paidAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-zinc-300 pt-2 font-black text-sm">
            <span>Outstanding Balance:</span>
            <span className={dueAmount > 0 ? "text-rose-600" : "text-emerald-700"}>
              ৳{dueAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Barcode & Verification */}
      <div className="flex items-center justify-between border-t pt-4">
        <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
        <p className="text-[10px] text-zinc-500">Scan barcode to verify invoice integrity at Cash Counter</p>
      </div>

      {/* Footer */}
      <HospitalPrintFooter />
    </div>
  );
}
