"use client";

import React from "react";
import { AlertCircle, Ban } from "lucide-react";
import { formatCurrencyBDT } from "@/lib/utils";

export interface PaymentStampSealProps {
  status: "PAID" | "DUE" | "PARTIAL" | "UNPAID" | "VOID" | string;
  dueAmount?: number;
  paidAmount?: number;
  totalAmount?: number;
  dateStr?: string;
  cashierName?: string;
  receiptNumber?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PaymentStampSeal({
  status,
  dueAmount = 0,
  _paidAmount,
  _totalAmount,
  dateStr,
  cashierName,
  receiptNumber,
  size = "md",
  className = "",
}: PaymentStampSealProps & { _paidAmount?: number; _totalAmount?: number }) {
  const isPaid = status === "PAID" || dueAmount <= 0;
  const isVoid = status === "VOID";

  const sizeClasses = {
    sm: "px-3 py-1.5 text-[10px] max-w-[160px]",
    md: "px-4 py-2 text-xs max-w-[210px]",
    lg: "px-5 py-3 text-sm max-w-[260px]",
  }[size];

  if (isVoid) {
    return (
      <div
        className={`relative inline-block border-2 border-dashed border-slate-600 text-slate-700 bg-slate-50/90 rounded-2xl transform -rotate-6 select-none shadow-xs pointer-events-none print:opacity-100 ${sizeClasses} ${className}`}
        style={{ mixBlendMode: "multiply" }}
      >
        <div className="border border-slate-400 p-1.5 rounded-xl text-center">
          <div className="flex items-center justify-center space-x-1 text-[9px] uppercase tracking-widest font-black text-slate-500">
            <Ban className="w-3 h-3" />
            <span>ANNESHA HOSPITAL</span>
          </div>
          <div className="text-xl font-black tracking-wider uppercase text-slate-800 leading-tight">
            VOID
          </div>
          <div className="text-[11px] font-bold text-slate-600">বাতিলকৃত ইনভয়েস</div>
          <div className="text-[8px] text-slate-500 uppercase tracking-tighter mt-0.5">
            NON-NEGOTIABLE • CANCELLED
          </div>
        </div>
      </div>
    );
  }

  if (isPaid) {
    return (
      <div
        className={`relative inline-block border-3 border-emerald-600 text-emerald-800 bg-emerald-50/90 rounded-2xl transform -rotate-6 select-none shadow-sm pointer-events-none print:opacity-100 ${sizeClasses} ${className}`}
        style={{ mixBlendMode: "multiply" }}
      >
        <div className="border border-dashed border-emerald-500 p-2 rounded-xl text-center">
          {/* Header */}
          <div className="flex items-center justify-center space-x-1 text-[8px] sm:text-[9px] uppercase tracking-widest font-black text-emerald-700">
            <span>★ ANNESHA HOSPITAL ★</span>
          </div>

          {/* Core Stamp Body */}
          <div className="text-2xl sm:text-3xl font-black tracking-widest uppercase text-emerald-700 leading-tight my-0.5 font-mono drop-shadow-2xs">
            PAID
          </div>
          <div className="text-xs sm:text-sm font-black text-emerald-800 tracking-wider">
            পরিশোধিত
          </div>

          {/* Subtitle & Settlement info */}
          <div className="mt-1 pt-1 border-t border-emerald-300/70 text-[8px] sm:text-[9px] uppercase tracking-tight text-emerald-700 font-bold">
            FULL SETTLEMENT • সম্পূর্ণ পরিশোধ
          </div>
          {receiptNumber && (
            <div className="text-[8px] text-emerald-600 font-mono">
              Rec: {receiptNumber}
            </div>
          )}
          {cashierName && (
            <div className="text-[7px] text-emerald-600 font-mono">
              Cashier: {cashierName}
            </div>
          )}
          {dateStr && (
            <div className="text-[7px] sm:text-[8px] text-emerald-600/90 font-mono mt-0.5">
              {new Date(dateStr).toLocaleDateString("en-GB")}
            </div>
          )}
        </div>
      </div>
    );
  }

  // DUE / UNPAID / PARTIAL Seal
  return (
    <div
      className={`relative inline-block border-3 border-rose-600 text-rose-800 bg-rose-50/90 rounded-2xl transform rotate-6 select-none shadow-sm pointer-events-none print:opacity-100 ${sizeClasses} ${className}`}
      style={{ mixBlendMode: "multiply" }}
    >
      <div className="border border-dashed border-rose-500 p-2 rounded-xl text-center">
        {/* Header */}
        <div className="flex items-center justify-center space-x-1 text-[8px] sm:text-[9px] uppercase tracking-widest font-black text-rose-700">
          <AlertCircle className="w-2.5 h-2.5 mr-0.5 inline" />
          <span>ANNESHA HOSPITAL</span>
        </div>

        {/* Core Stamp Body */}
        <div className="text-2xl sm:text-3xl font-black tracking-widest uppercase text-rose-700 leading-tight my-0.5 font-mono drop-shadow-2xs">
          DUE
        </div>
        <div className="text-xs sm:text-sm font-black text-rose-800 tracking-wider">
          বকেয়া
        </div>

        {/* Due Balance highlight */}
        <div className="bg-rose-100/90 text-rose-900 font-mono font-black text-[11px] sm:text-xs py-0.5 px-1.5 rounded-md my-0.5 border border-rose-200">
          {formatCurrencyBDT(dueAmount)}
        </div>

        {/* Subtitle */}
        <div className="mt-1 pt-0.5 border-t border-rose-300/70 text-[8px] uppercase tracking-tight text-rose-700 font-bold">
          PAYMENT PENDING • বকেয়া পরিশোধ সাপেক্ষে
        </div>
        {cashierName && (
          <div className="text-[7px] text-rose-600 font-mono">
            Cashier: {cashierName}
          </div>
        )}
        {dateStr && (
          <div className="text-[7px] sm:text-[8px] text-rose-600/90 font-mono mt-0.5">
            {new Date(dateStr).toLocaleDateString("en-GB")}
          </div>
        )}
      </div>
    </div>
  );
}
