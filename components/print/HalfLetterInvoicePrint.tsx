"use client";

/**
 * Half-Letter / Statement Page Size Standard (5.5 x 8.5 in / 139.7mm x 215.9mm)
 * Compact hospital billing memo, cash receipt, and delivery challan printing standard.
 */
import React from "react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { generateSvgBarcode } from "@/lib/print/barcode";
import { PaymentStampSeal } from "@/components/billing/PaymentStampSeal";
import { formatDateBDT, formatTimeBDT } from "@/lib/utils";

function safeFormatPrintDate(dStr: string | undefined): string {
  if (!dStr) return "—";
  if (dStr.includes("T") || dStr.includes("+") || (dStr.includes("-") && dStr.length > 15)) {
    try {
      const d = new Date(dStr);
      if (!isNaN(d.getTime())) {
        return `${formatDateBDT(d)}, ${formatTimeBDT(d)}`;
      }
    } catch {
      // fallback
    }
  }
  return dStr;
}

export interface HalfLetterInvoicePrintProps {
  invoiceNumber: string;
  dateStr: string;
  dueDateStr?: string;
  deliveryDateStr?: string;
  testTimeStr?: string;
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
    testTimeStr?: string;
    deliveryTimeStr?: string;
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

function isDiagnosticItem(category?: string, description?: string): boolean {
  const cat = (category || "").toUpperCase().trim();
  const diagCats = [
    "LAB", "DIAGNOSTIC", "PATHOLOGY", "BIOCHEMISTRY", "HAEMATOLOGY",
    "HEMATOLOGY", "MICROBIOLOGY", "IMMUNOLOGY", "SEROLOGY", "USG",
    "ULTRASONOGRAPHY", "XRAY", "X-RAY", "RADIOLOGY", "IMAGING",
    "ECG", "CARDIOLOGY", "INVESTIGATION"
  ];
  if (diagCats.includes(cat)) return true;
  const desc = (description || "").toLowerCase();
  return /(usg|ultrasound|x-ray|xray|ecg|cbc|rbs|fbs|blood|urine|stool|lipid|creatinine|lft|sgpt|sgot|serum|culture|biopsy|histopath|hormone|tsh|echo|endoscopy|colonoscopy|ct[- ]scan|mri)/i.test(desc);
}

function getEstimatedDeliveryHours(category?: string, description?: string): number {
  const desc = (description || "").toLowerCase();
  const cat = (category || "").toUpperCase();

  // Histopathology, Culture, Biopsy: 48-72 hours
  if (/culture|histopath|biopsy|pap smear/i.test(desc)) {
    return 72;
  }
  // USG, X-Ray, ECG: 1-2 hours
  if (["USG", "ULTRASONOGRAPHY", "XRAY", "X-RAY", "ECG"].includes(cat) || /usg|ultrasound|x-ray|xray|ecg/i.test(desc)) {
    return 2;
  }
  // Rapid blood tests (RBS, FBS, Blood grouping, Rh): 1-2 hours
  if (/rbs|fbs|random blood|fasting blood|blood grouping|rh/i.test(desc)) {
    return 2;
  }
  // Standard lab hematology / biochemistry (CBC, LFT, Lipid, Creatinine, Urine): 3 hours
  return 3;
}

function calculateEstimatedDelivery(dateStr: string | undefined, hoursToAdd: number): string {
  try {
    let base = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(base.getTime())) {
      base = new Date();
    }
    const target = new Date(base.getTime() + hoursToAdd * 60 * 60 * 1000);
    const targetHour = target.getHours();

    // If routine turnaround (<= 4h) lands after 8:30 PM (20:30) or before 8:00 AM, deliver next morning at 10:00 AM
    if (hoursToAdd <= 4 && (targetHour >= 20 || targetHour < 8)) {
      if (targetHour >= 20) {
        target.setDate(target.getDate() + 1);
      }
      target.setHours(10, 0, 0, 0);
    }

    return `${formatDateBDT(target)}, ${formatTimeBDT(target)}`;
  } catch {
    return "Same Day (আজকের মধ্যে)";
  }
}

export function HalfLetterInvoicePrint({
  invoiceNumber,
  dateStr,
  dueDateStr,
  deliveryDateStr,
  testTimeStr,
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
  const cleanDate = safeFormatPrintDate(dateStr);
  const cleanDueDate = safeFormatPrintDate(dueDateStr);

  const diagItems = items.filter((it) => isDiagnosticItem(it.serviceCategory, it.description));
  const hasDiag = diagItems.length > 0;
  const maxTurnaroundHours = hasDiag
    ? Math.max(...diagItems.map((it) => getEstimatedDeliveryHours(it.serviceCategory, it.description)))
    : 3;

  const effectiveTestTime = testTimeStr || cleanDate;
  const effectiveDeliveryTime = deliveryDateStr || (hasDiag ? calculateEstimatedDelivery(dateStr, maxTurnaroundHours) : "");

  const formattedAgeStr = (() => {
    if (patient.age === undefined || patient.age === null || patient.age === "") return "";
    if (typeof patient.age === "number") {
      return patient.age > 0 ? `${patient.age}Y` : "0Y (Infant)";
    }
    const str = String(patient.age).trim();
    if (!str) return "";
    return str.match(/[YMDymdবছরমাসদিন]/) ? str : `${str}Y`;
  })();

  const genderAgeParts = [
    patient.gender ? patient.gender.trim() : null,
    formattedAgeStr ? formattedAgeStr : null,
  ].filter(Boolean);
  const genderAgeDisplay = genderAgeParts.length > 0 ? `(${genderAgeParts.join(", ")})` : "";

  return (
    <div className="half-letter-invoice-root mx-auto max-w-[5.5in] bg-white text-slate-900 font-sans p-4 border border-slate-200 print:border-none print:m-0 print:p-0 print:shadow-none print:w-full print:max-w-none">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: 5.5in 8.5in;
            margin: 5mm 6mm;
          }
          html, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
            color: #000000 !important;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          }
          .half-letter-invoice-root {
            width: 100% !important;
            max-width: 138mm !important;
            min-height: auto !important;
            height: auto !important;
            padding: 1mm 2mm !important;
            margin: 0 auto !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            box-sizing: border-box !important;
            color: #000000 !important;
          }
          .half-letter-invoice-root * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .half-letter-invoice-root .text-slate-500,
          .half-letter-invoice-root .text-slate-600,
          .half-letter-invoice-root .text-slate-400 {
            color: #1e293b !important;
          }
          .half-letter-invoice-root .text-slate-700,
          .half-letter-invoice-root .text-slate-800,
          .half-letter-invoice-root .text-slate-900,
          .half-letter-invoice-root strong,
          .half-letter-invoice-root b {
            color: #000000 !important;
          }
          .half-letter-invoice-root table,
          .half-letter-invoice-root th,
          .half-letter-invoice-root td {
            border-color: #475569 !important;
          }
          .print-header-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-patient-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-delivery-badge {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-table thead {
            display: table-header-group !important;
          }
          .print-table tbody tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-totals-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-footer-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}} />

      {/* 1. Header */}
      <div className="print-header-block border-b-2 border-indigo-950 pb-2 mb-2 flex justify-between items-start gap-2">
        <div className="space-y-0.5 flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <img
              src="/logo.png"
              alt="ANNESHA HOSPITAL Logo"
              className="w-8 h-8 rounded object-contain shrink-0 print:w-9 print:h-9"
            />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black uppercase tracking-tight text-indigo-950 leading-tight">
                {HOSPITAL_METADATA.name}
              </h1>
              <p className="text-xs sm:text-sm font-black text-sky-950 leading-tight tracking-normal font-sans pt-0.5">
                {HOSPITAL_METADATA.banglaName}
              </p>
            </div>
          </div>
          <p className="text-[9px] text-slate-700 leading-tight pt-0.5">
            {HOSPITAL_METADATA.address}
          </p>
          <p className="text-[9px] text-slate-700 leading-tight">
            রিসিপশন: {HOSPITAL_METADATA.receptionPhone || "01895-665114"} | অফিস: {HOSPITAL_METADATA.officePhone || "01904210065"}
          </p>
          <p className="text-[8px] text-slate-600 leading-tight">
            ডায়াগনস্টিক লাইসেন্স: {HOSPITAL_METADATA.diagnosticLicense || "HSM4521681"} | ক্লিনিক লাইসেন্স: {HOSPITAL_METADATA.clinicLicense || "HSM4312356"}
          </p>
        </div>

        <div className="shrink-0 text-right pl-2">
          <div className="inline-block bg-sky-950 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
            BILL & CASH RECEIPT
          </div>
          <p className="text-[10px] font-mono font-bold text-slate-900 mt-1 whitespace-nowrap">
            Bill #: {invoiceNumber}
          </p>
          <p className="text-[9px] text-slate-800 font-medium whitespace-nowrap">
            Date: {cleanDate}
          </p>
          {cleanDueDate && cleanDueDate !== cleanDate && (
            <p className="text-[9px] text-amber-800 font-medium whitespace-nowrap">
              Due Date: {cleanDueDate}
            </p>
          )}
        </div>
      </div>

      {/* 2. Patient Demographics Block */}
      <div className="print-patient-block bg-slate-50 print:bg-white border border-slate-300 print:border-slate-400 rounded p-2 text-[10px] mb-2 grid grid-cols-2 gap-2">
        <div className="space-y-0.5 min-w-0">
          <div>
            <span className="text-slate-600 font-medium">Patient: </span>
            <strong className="text-slate-900 uppercase font-black">{patient.name}</strong>
          </div>
          <div>
            <span className="text-slate-600 font-medium">UHID / ID: </span>
            <strong className="font-mono text-slate-900 font-bold">{patient.patientCode}</strong>
            {genderAgeDisplay && (
              <span className="text-slate-800 ml-1 font-semibold">
                {genderAgeDisplay}
              </span>
            )}
          </div>
          <div>
            <span className="text-slate-600 font-medium">Mobile: </span>
            <span className="font-mono text-slate-900 font-medium">{patient.phone || "N/A"}</span>
            {patient.bloodGroup && !["UNKNOWN", "N/A", "UNDEFINED", "NONE"].includes(patient.bloodGroup.trim().toUpperCase()) && (
              <span className="ml-1 text-slate-900 font-bold">[{patient.bloodGroup.trim()}]</span>
            )}
          </div>
          {patient.address && (
            <div className="break-words">
              <span className="text-slate-600 font-medium">Address: </span>
              <span className="text-slate-800">{patient.address}</span>
            </div>
          )}
        </div>

        <div className="space-y-0.5 text-right min-w-0">
          {consultantDoctorName && (
            <div>
              <span className="text-slate-600 font-medium">Consultant: </span>
              <strong className="text-slate-900 font-bold">{consultantDoctorName}</strong>
            </div>
          )}
          {departmentName && (
            <div>
              <span className="text-slate-600 font-medium">Dept: </span>
              <span className="text-slate-800">{departmentName}</span>
            </div>
          )}
          {cashierName && (
            <div>
              <span className="text-slate-600 font-medium">Cashier: </span>
              <span className="text-slate-800 font-medium">{cashierName}</span>
            </div>
          )}
          <div className="pt-0.5">
            <span
              className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                dueAmount <= 0
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-400"
                  : paidAmount > 0
                  ? "bg-amber-100 text-amber-950 border border-amber-400"
                  : "bg-rose-100 text-rose-950 border border-rose-400"
              }`}
            >
              {dueAmount <= 0 ? "PAID IN FULL" : paidAmount > 0 ? `DUE: ৳${dueAmount.toFixed(0)}` : "UNPAID"}
            </span>
          </div>
        </div>
      </div>

      {/* 2.5 Diagnostic Report Delivery Schedule Banner */}
      {hasDiag && (
        <div className="print-delivery-badge bg-sky-50 print:bg-slate-100 border border-sky-300 print:border-slate-500 rounded p-1.5 text-[9px] mb-2 flex items-center justify-between">
          <div className="flex items-center space-x-1 min-w-0">
            <span className="font-bold text-sky-950 print:text-black uppercase tracking-wider">
              🧪 রিপোর্ট ডেলিভারি সময়সূচী (Delivery Schedule):
            </span>
          </div>
          <div className="flex items-center space-x-3 text-right shrink-0">
            <div>
              <span className="text-slate-600 print:text-black">টেস্ট গ্রহণ: </span>
              <strong className="text-slate-900 print:text-black font-mono font-bold">{effectiveTestTime}</strong>
            </div>
            <div className="border-l border-sky-300 print:border-slate-400 pl-2">
              <span className="text-sky-900 print:text-black font-semibold">সম্ভাব্য ডেলিভারি: </span>
              <strong className="text-sky-950 print:text-black font-mono font-black text-[10px] bg-white px-1.5 py-0.5 rounded border border-sky-400 print:border-slate-600">
                {effectiveDeliveryTime}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 3. Itemized Bill Table */}
      <div className="mb-2">
        <table className="print-table w-full text-left text-[10px] border-collapse border border-slate-400 table-fixed">
          <thead>
            <tr className="bg-slate-100 print:bg-slate-100 text-slate-900 border-b border-slate-400 text-[9px] font-bold uppercase">
              <th className="p-1 border-r border-slate-400 w-[24px] text-center">#</th>
              <th className="p-1 border-r border-slate-400 w-auto">Service / Item Description</th>
              <th className="p-1 border-r border-slate-400 text-center w-[58px]">Category</th>
              <th className="p-1 border-r border-slate-400 text-right w-[54px]">Rate (৳)</th>
              <th className="p-1 border-r border-slate-400 text-center w-[34px]">Qty</th>
              <th className="p-1 text-right w-[62px]">Total (৳)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const isDiag = isDiagnosticItem(it.serviceCategory, it.description);
              const itemTurnaround = getEstimatedDeliveryHours(it.serviceCategory, it.description);
              const itemDelivery = it.deliveryTimeStr || calculateEstimatedDelivery(dateStr, itemTurnaround);
              const itemTestTime = it.testTimeStr || effectiveTestTime;

              return (
                <tr key={idx} className="border-b border-slate-300 hover:bg-slate-50">
                  <td className="p-1 border-r border-slate-300 text-center text-slate-600 font-mono">{idx + 1}</td>
                  <td className="p-1 border-r border-slate-300 font-semibold text-slate-900 break-words">
                    <div>
                      <span>{it.description}</span>
                      {it.unit ? <span className="text-[9px] text-slate-600 ml-1 font-normal">({it.unit})</span> : null}
                    </div>
                    {isDiag && (
                      <div className="text-[8px] text-slate-700 print:text-black font-normal mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium text-slate-600 print:text-black">টেস্ট: <span className="font-mono text-slate-900 font-semibold">{itemTestTime}</span></span>
                        <span className="text-slate-400 print:text-black">•</span>
                        <span className="font-medium text-sky-950 print:text-black">ডেলিভারি: <span className="font-mono text-slate-900 font-bold">{itemDelivery}</span></span>
                      </div>
                    )}
                  </td>
                  <td className="p-1 border-r border-slate-300 text-center text-[9px] text-slate-700 truncate">
                    {it.serviceCategory}
                  </td>
                  <td className="p-1 border-r border-slate-300 text-right font-mono font-medium">
                    {it.unitPrice.toFixed(2)}
                  </td>
                  <td className="p-1 border-r border-slate-300 text-center font-mono font-bold">
                    {it.quantity}
                  </td>
                  <td className="p-1 text-right font-mono font-bold text-slate-900">
                    {it.totalAmount.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. Financial Calculations & Settlement */}
      {(() => {
        const cleanDiscountReason = discountReason
          ? discountReason.replace(/^[\[(]+/, "").replace(/[\])]+$/, "").trim()
          : "";
        return (
          <div className="print-totals-block grid grid-cols-12 gap-2 mb-2 text-[10px] items-start">
            {/* Left: Payments Ledger, Rubber Stamp & In Words */}
            <div className="col-span-7 flex flex-col justify-between space-y-1.5">
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-700 block mb-0.5">
                    Settlement Receipts:
                  </span>
                  {payments.length === 0 ? (
                    <p className="text-[9px] text-slate-500 italic">No payment received yet.</p>
                  ) : (
                    <div className="space-y-0.5">
                      {payments.map((p, idx) => (
                        <div key={idx} className="flex justify-between bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-[9px]">
                          <span className="font-mono text-slate-800">Rec #{p.receiptNumber} ({p.paymentMethod})</span>
                          <span className="font-bold font-mono text-emerald-900">৳{p.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Official Stamp Placement - Neatly in left block beside receipts without obscuring math */}
                <div className="shrink-0 flex items-center justify-center pointer-events-none">
                  <PaymentStampSeal
                    status={dueAmount <= 0 ? "PAID" : "DUE"}
                    dueAmount={dueAmount}
                    paidAmount={paidAmount}
                    totalAmount={totalAmount}
                    dateStr={cleanDate}
                    cashierName={cashierName}
                    receiptNumber={payments[0]?.receiptNumber}
                    size="compact"
                  />
                </div>
              </div>

              <div className="bg-sky-50 print:bg-white border border-sky-300 print:border-slate-400 rounded p-1.5">
                <span className="text-[9px] font-bold text-slate-900 block">In Words:</span>
                <p className="text-[9px] font-semibold text-slate-900 italic">{wordsStr}</p>
              </div>
            </div>

            {/* Right: Calculations */}
            <div className="col-span-5 bg-slate-50 print:bg-white border border-slate-300 print:border-slate-400 rounded p-1.5 space-y-1">
              <div className="flex justify-between text-slate-700">
                <span>Subtotal:</span>
                <span className="font-mono font-medium">৳{subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-rose-800 font-medium">
                  <span>Discount{cleanDiscountReason ? ` (${cleanDiscountReason})` : ""}:</span>
                  <span className="font-mono font-semibold">-৳{discount.toFixed(2)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>Tax / VAT:</span>
                  <span className="font-mono font-medium">৳{tax.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-300 pt-1 font-bold text-slate-900 text-[11px]">
                <span>Net Payable:</span>
                <span className="font-mono font-black">৳{totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-bold">
                <span>Paid Amount:</span>
                <span className="font-mono font-black">৳{paidAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-300 pt-1 font-black text-[11px]">
                <span>Balance Due:</span>
                <span className={`font-mono font-black ${dueAmount > 0 ? "text-rose-800" : "text-emerald-800"}`}>
                  ৳{dueAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 5. Barcode, Verification & Signatures (Atomic Footer Block) */}
      <div className="print-footer-block">
        <div className="flex items-center justify-between border-t border-slate-300 pt-1.5 mb-6">
          <div className="flex items-center space-x-2">
            <div dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
            <span className="text-[8px] text-slate-700 font-mono font-bold">
              {invoiceNumber}
            </span>
          </div>
          <p className="text-[8px] text-slate-600 font-medium">
            Computer-generated official receipt • অন্বেষা হাসপাতাল
          </p>
        </div>

        {/* 6. Signatures */}
        <div className="grid grid-cols-2 gap-8 text-[9px] text-center pt-2">
          <div>
            <div className="border-t border-dashed border-slate-500 w-32 mx-auto pt-0.5 text-slate-800">
              Patient / Guardian
            </div>
          </div>
          <div>
            <div className="border-t border-dashed border-slate-500 w-32 mx-auto pt-0.5 font-bold text-slate-900">
              Authorized Cashier
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
