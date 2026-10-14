"use client";

/**
 * Half-Letter / Statement Page Size Standard (5.5 x 8.5 in / 139.7mm x 215.9mm)
 * Compact hospital billing memo, cash receipt, and delivery challan printing standard.
 */
import React from "react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { generateSvgBarcode } from "@/lib/print/barcode";
import { PaymentStampSeal } from "@/components/billing/PaymentStampSeal";

export interface HalfLetterInvoicePrintProps {
  invoiceNumber: string;
  dateStr: string;
  dueDateStr?: string;
  cashierName?: string;
  patient: {
    name: string;
    patientCode: string;
    phone?: string;
    address?: string;
    age?: number | string;
    gender?: string;
    bloodGroup?: string;
    guardianName?: string;
  };
  departmentName?: string;
  consultantDoctorName?: string;
  items: Array<{
    description: string;
    serviceCategory: string;
    unitPrice: number;
    quantity: number;
    totalAmount: number;
    unit?: string;
  }>;
  payments: Array<{
    receiptNumber: string;
    paymentMethod: string;
    amount: number;
    paidAt: string;
  }>;
  subtotal: number;
  discount: number;
  discountReason?: string;
  tax?: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
}

// Bangladeshi Taka Number to Words converter
function numberToWordsBDT(amount: number): string {
  const integerPart = Math.floor(Math.abs(amount));
  if (integerPart === 0) return "Zero Taka Only";

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  function convertUnderThousand(num: number): string {
    let str = "";
    if (num >= 100) {
      str += ones[Math.floor(num / 100)] + " Hundred ";
      num %= 100;
    }
    if (num >= 20) {
      str += tens[Math.floor(num / 10)] + " ";
      num %= 10;
    }
    if (num > 0) {
      str += ones[num] + " ";
    }
    return str.trim();
  }

  let words = "";
  let n = integerPart;

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const remainder = n;

  if (crore > 0) words += convertUnderThousand(crore) + " Crore ";
  if (lakh > 0) words += convertUnderThousand(lakh) + " Lakh ";
  if (thousand > 0) words += convertUnderThousand(thousand) + " Thousand ";
  if (remainder > 0) words += convertUnderThousand(remainder) + " ";

  return words.trim() + " Taka Only";
}

export function HalfLetterInvoicePrint({
  invoiceNumber,
  dateStr,
  dueDateStr,
  cashierName,
  patient,
  departmentName,
  consultantDoctorName,
  items,
  payments,
  subtotal,
  discount,
  discountReason,
  tax = 0,
  totalAmount,
  paidAmount,
  dueAmount,
}: HalfLetterInvoicePrintProps) {
  const barcodeSvg = generateSvgBarcode(invoiceNumber, 28);
  const wordsStr = numberToWordsBDT(totalAmount);

  return (
    <div className="half-letter-invoice-root mx-auto max-w-[5.5in] min-h-[8.5in] bg-white text-slate-900 font-sans p-4 border border-slate-200 print:border-none print:m-0 print:p-2 print:shadow-none print:w-[5.5in] print:max-w-[5.5in]">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: 5.5in 8.5in;
            margin: 0.2in 0.25in;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .half-letter-invoice-root {
            width: 5.5in !important;
            max-width: 5.5in !important;
            min-height: 8.5in !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}} />

      {/* 1. Header */}
      <div className="border-b-2 border-sky-900 pb-2 mb-2 flex justify-between items-start">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <img
              src="/logo.png"
              alt="ANNESHA HOSPITAL Logo"
              className="w-8 h-8 rounded object-contain shrink-0"
            />
            <div>
              <h1 className="text-base font-black uppercase tracking-tight text-sky-950 leading-tight">
                {HOSPITAL_METADATA.name}
              </h1>
              <p className="text-xs sm:text-sm font-black text-sky-950 leading-tight tracking-normal font-sans pt-0.5">
                {HOSPITAL_METADATA.banglaName}
              </p>
            </div>
          </div>
          <p className="text-[9px] text-slate-600 leading-tight pt-0.5">
            {HOSPITAL_METADATA.address}
          </p>
          <p className="text-[9px] text-slate-600 leading-tight">
            রিসিপশন: {HOSPITAL_METADATA.receptionPhone || "01895-665114"} | অফিস: {HOSPITAL_METADATA.officePhone || "01904210065"}
          </p>
          <p className="text-[8px] text-slate-500 leading-tight">
            ডায়াগনস্টিক লাইসেন্স: {HOSPITAL_METADATA.diagnosticLicense || "HSM4521681"} | ক্লিনিক লাইসেন্স: {HOSPITAL_METADATA.clinicLicense || "HSM4312356"} | DGHS: {HOSPITAL_METADATA.regNo || "10022715"}
          </p>
        </div>

        <div className="text-right">
          <div className="inline-block bg-sky-950 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
            BILL & CASH RECEIPT
          </div>
          <p className="text-[10px] font-mono font-bold text-slate-900 mt-1">
            Bill #: {invoiceNumber}
          </p>
          <p className="text-[9px] text-slate-600">
            Date: {dateStr}
          </p>
          {dueDateStr && dueDateStr !== dateStr && (
            <p className="text-[9px] text-amber-700 font-medium">
              Due Date: {dueDateStr}
            </p>
          )}
        </div>
      </div>

      {/* 2. Patient Demographics Block */}
      <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[10px] mb-2 grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <div>
            <span className="text-slate-500 font-medium">Patient: </span>
            <strong className="text-slate-900 uppercase">{patient.name}</strong>
          </div>
          <div>
            <span className="text-slate-500 font-medium">UHID / ID: </span>
            <strong className="font-mono text-slate-900">{patient.patientCode}</strong>
            {patient.gender && (
              <span className="text-slate-600 ml-1">({patient.gender}{patient.age ? `, ${patient.age}Y` : ""})</span>
            )}
          </div>
          <div>
            <span className="text-slate-500 font-medium">Mobile: </span>
            <span className="font-mono text-slate-800">{patient.phone || "N/A"}</span>
            {patient.bloodGroup && (
              <span className="ml-1 text-rose-700 font-bold">[{patient.bloodGroup}]</span>
            )}
          </div>
          {patient.address && (
            <div className="truncate">
              <span className="text-slate-500 font-medium">Address: </span>
              <span className="text-slate-700">{patient.address}</span>
            </div>
          )}
        </div>

        <div className="space-y-0.5 text-right">
          {consultantDoctorName && (
            <div>
              <span className="text-slate-500 font-medium">Consultant: </span>
              <strong className="text-slate-900">{consultantDoctorName}</strong>
            </div>
          )}
          {departmentName && (
            <div>
              <span className="text-slate-500 font-medium">Dept: </span>
              <span className="text-slate-700">{departmentName}</span>
            </div>
          )}
          {cashierName && (
            <div>
              <span className="text-slate-500 font-medium">Cashier: </span>
              <span className="text-slate-700">{cashierName}</span>
            </div>
          )}
          <div className="pt-0.5">
            <span
              className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                dueAmount <= 0
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : paidAmount > 0
                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                  : "bg-rose-100 text-rose-900 border border-rose-300"
              }`}
            >
              {dueAmount <= 0 ? "PAID IN FULL" : paidAmount > 0 ? `DUE: ৳${dueAmount.toFixed(0)}` : "UNPAID"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Itemized Bill Table */}
      <div className="mb-2">
        <table className="w-full text-left text-[10px] border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[9px] font-bold uppercase">
              <th className="p-1 border-r border-slate-300 w-6 text-center">#</th>
              <th className="p-1 border-r border-slate-300">Service / Item Description</th>
              <th className="p-1 border-r border-slate-300 text-center w-16">Category</th>
              <th className="p-1 border-r border-slate-300 text-right w-14">Rate (৳)</th>
              <th className="p-1 border-r border-slate-300 text-center w-10">Qty</th>
              <th className="p-1 text-right w-16">Total (৳)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-1 border-r border-slate-200 text-center text-slate-500">{idx + 1}</td>
                <td className="p-1 border-r border-slate-200 font-medium text-slate-900">
                  {it.description}
                  {it.unit ? <span className="text-[9px] text-slate-500 ml-1">({it.unit})</span> : null}
                </td>
                <td className="p-1 border-r border-slate-200 text-center text-[9px] text-slate-600">
                  {it.serviceCategory}
                </td>
                <td className="p-1 border-r border-slate-200 text-right font-mono">
                  {it.unitPrice.toFixed(2)}
                </td>
                <td className="p-1 border-r border-slate-200 text-center font-mono font-bold">
                  {it.quantity}
                </td>
                <td className="p-1 text-right font-mono font-bold text-slate-900">
                  {it.totalAmount.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. Financial Calculations & Settlement */}
      <div className="relative grid grid-cols-12 gap-2 mb-2 text-[10px]">
        {/* Authentic Visual Rubber Stamp Seal */}
        <div className="absolute right-2 top-0 z-10 pointer-events-none opacity-90 print:opacity-100">
          <PaymentStampSeal
            status={dueAmount <= 0 ? "PAID" : "DUE"}
            dueAmount={dueAmount}
            paidAmount={paidAmount}
            totalAmount={totalAmount}
            dateStr={dateStr}
            cashierName={cashierName}
            receiptNumber={payments[0]?.receiptNumber}
            size="sm"
          />
        </div>
        {/* Left: Payments Ledger & Words */}
        <div className="col-span-7 flex flex-col justify-between">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block mb-0.5">
              Settlement Receipts:
            </span>
            {payments.length === 0 ? (
              <p className="text-[9px] text-slate-500 italic">No payment received yet.</p>
            ) : (
              <div className="space-y-0.5">
                {payments.map((p, idx) => (
                  <div key={idx} className="flex justify-between bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[9px]">
                    <span className="font-mono text-slate-700">Rec #{p.receiptNumber} ({p.paymentMethod})</span>
                    <span className="font-bold font-mono text-emerald-800">৳{p.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-sky-50 border border-sky-200 rounded p-1.5 mt-1.5">
            <span className="text-[9px] font-bold text-sky-900 block">In Words:</span>
            <p className="text-[9px] font-medium text-sky-950 italic">{wordsStr}</p>
          </div>
        </div>

        {/* Right: Calculations */}
        <div className="col-span-5 bg-slate-50 border border-slate-200 rounded p-1.5 space-y-1">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-mono font-medium">৳{subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-rose-700">
              <span>Discount{discountReason ? ` (${discountReason})` : ""}:</span>
              <span className="font-mono font-semibold">-৳{discount.toFixed(2)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Tax / VAT:</span>
              <span className="font-mono font-medium">৳{tax.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-300 pt-1 font-bold text-slate-900 text-[11px]">
            <span>Net Payable:</span>
            <span className="font-mono">৳{totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-bold">
            <span>Paid Amount:</span>
            <span className="font-mono">৳{paidAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-1 font-black text-[11px]">
            <span>Balance Due:</span>
            <span className={`font-mono ${dueAmount > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              ৳{dueAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Barcode & Verification */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 mb-6">
        <div className="flex items-center space-x-2">
          <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
          <span className="text-[8px] text-slate-500 font-mono">
            {invoiceNumber}
          </span>
        </div>
        <p className="text-[8px] text-slate-400">
          Computer-generated official receipt • অন্বেষা হাসপাতাল
        </p>
      </div>

      {/* 6. Signatures */}
      <div className="grid grid-cols-2 gap-8 text-[9px] text-center pt-2">
        <div>
          <div className="border-t border-dashed border-slate-400 w-32 mx-auto pt-0.5">
            Patient / Guardian
          </div>
        </div>
        <div>
          <div className="border-t border-dashed border-slate-400 w-32 mx-auto pt-0.5 font-bold">
            Authorized Cashier
          </div>
        </div>
      </div>
    </div>
  );
}
