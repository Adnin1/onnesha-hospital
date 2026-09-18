"use client";

import React from "react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { generateSvgBarcode } from "@/lib/print/barcode";

export interface ThermalReceiptProps {
  receiptNumber: string;
  invoiceNumber: string;
  dateStr: string;
  patientName: string;
  patientPhone?: string;
  cashierName?: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount?: number;
  tax?: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
}

export function ThermalReceipt({
  receiptNumber,
  invoiceNumber,
  dateStr,
  patientName,
  patientPhone,
  cashierName,
  items,
  subtotal,
  discount = 0,
  tax = 0,
  paidAmount,
  dueAmount,
  paymentMethod,
}: ThermalReceiptProps) {
  const barcodeSvg = generateSvgBarcode(receiptNumber, 32);

  return (
    <div className="w-[80mm] max-w-[80mm] bg-white p-3 font-mono text-[11px] text-zinc-900 print:m-0 print:p-1">
      {/* Hospital Header */}
      <div className="text-center border-b border-dashed pb-2 mb-2">
        <h1 className="font-bold text-xs uppercase">{HOSPITAL_METADATA.name}</h1>
        {HOSPITAL_METADATA.address && <p className="text-[10px]">{HOSPITAL_METADATA.address}</p>}
        {HOSPITAL_METADATA.phone && <p className="text-[10px]">Hotline: {HOSPITAL_METADATA.phone}</p>}
        <div className="mt-1 font-bold text-[10px] uppercase tracking-wider border border-zinc-900 inline-block px-1.5 py-0.5">
          POS Money Receipt
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-0.5 border-b border-dashed pb-2 mb-2 text-[10px]">
        <div className="flex justify-between">
          <span>Receipt #:</span>
          <span className="font-bold">{receiptNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Invoice #:</span>
          <span>{invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Date/Time:</span>
          <span>{dateStr}</span>
        </div>
        <div className="flex justify-between">
          <span>Patient:</span>
          <span className="font-semibold truncate max-w-[120px]">{patientName}</span>
        </div>
        {patientPhone && (
          <div className="flex justify-between">
            <span>Phone:</span>
            <span>{patientPhone}</span>
          </div>
        )}
        {cashierName && (
          <div className="flex justify-between">
            <span>Counter/Staff:</span>
            <span>{cashierName}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="border-b border-dashed pb-2 mb-2">
        <table className="w-full text-left text-[10px]">
          <thead>
            <tr className="border-b border-zinc-400">
              <th className="pb-1">Item</th>
              <th className="pb-1 text-center">Qty</th>
              <th className="pb-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {items.map((it, idx) => (
              <tr key={idx}>
                <td className="py-1 pr-1 truncate max-w-[110px]">{it.name}</td>
                <td className="py-1 text-center">{it.qty}</td>
                <td className="py-1 text-right font-semibold">৳{it.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="space-y-1 text-right text-[10px] border-b border-dashed pb-2 mb-2">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>৳{subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-rose-600">
            <span>Discount:</span>
            <span>-৳{discount.toFixed(2)}</span>
          </div>
        )}
        {tax > 0 && (
          <div className="flex justify-between">
            <span>Tax/VAT:</span>
            <span>৳{tax.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-[11px] border-t pt-1">
          <span>Net Total:</span>
          <span>৳{(subtotal - discount + tax).toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Paid ({paymentMethod}):</span>
          <span>৳{paidAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Balance Due:</span>
          <span className={dueAmount > 0 ? "font-bold text-rose-600" : ""}>
            ৳{dueAmount.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Barcode & Footer */}
      <div className="text-center pt-1 space-y-1">
        <div
          className="flex justify-center"
          dangerouslySetInnerHTML={{ __html: barcodeSvg }}
        />
        <p className="text-[9px] text-zinc-500">
          Thank you for choosing {HOSPITAL_METADATA.name}
        </p>
        <p className="text-[8px] text-zinc-400">
          Emergency Hotline: {HOSPITAL_METADATA.emergencyHotline}
        </p>
      </div>
    </div>
  );
}
