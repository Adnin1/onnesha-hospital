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
  size?: "compact" | "sm" | "md" | "lg";
  className?: string;
}

export function PaymentStampSeal({
  status,
  dueAmount = 0,
  _paidAmount,
  _totalAmount,
  dateStr: _dateStr,
  cashierName: _cashierName,
  receiptNumber: _receiptNumber,
  size = "md",
  className = "",
}: PaymentStampSealProps & { _paidAmount?: number; _totalAmount?: number }) {
  const isVoid = status === "VOID";
  const isPaid = status === "PAID" || dueAmount <= 0;

  const sizeClasses = {
    compact: "px-1.5 py-0.5 text-[7.5px] max-w-[105px]",
    sm: "px-2 py-0.5 text-[8px] max-w-[120px]",
    md: "px-2.5 py-1 text-[8.5px] max-w-[145px]",
    lg: "px-3 py-1.5 text-xs max-w-[180px]",
  }[size];

  if (isVoid) {
    return (
      <div
        className={`relative inline-block border-[1.5px] border-dashed border-slate-600 text-slate-700 bg-slate-50/50 rounded-xl transform -rotate-3 select-none shadow-2xs pointer-events-none print:opacity-100 ${sizeClasses} ${className}`}
        style={{ mixBlendMode: "multiply" }}
      >
        <div className="border border-slate-400/80 p-1 rounded-lg text-center leading-tight">
          <div className="flex items-center justify-center space-x-1 text-[6.5px] uppercase tracking-widest font-black text-slate-500">
            <Ban className="w-2 h-2" />
            <span>ANNESHA HOSPITAL</span>
          </div>
          <div className="text-base sm:text-lg my-0 font-black tracking-wider uppercase text-slate-800 leading-tight">
            VOID
          </div>
          <div className="text-[9px] font-bold text-slate-600 leading-none">বাতিলকৃত ইনভয়েস</div>
          <div className="text-[6.5px] text-slate-500 uppercase tracking-tighter mt-0.5 pt-0.5 border-t border-slate-300/60 font-semibold">
            NON-NEGOTIABLE • CANCELLED
          </div>
        </div>
      </div>
    );
  }

  if (isPaid) {
    return (
      <div
        className={`relative inline-block border-[1.5px] border-emerald-600 text-emerald-800 bg-emerald-50/80 rounded-xl transform -rotate-3 select-none shadow-2xs pointer-events-none print:opacity-100 ${sizeClasses} ${className}`}
        style={{ mixBlendMode: "multiply" }}
      >
        <div className="border border-dashed border-emerald-500/80 p-1 rounded-lg text-center leading-tight">
          {/* Header */}
          <div className="flex items-center justify-center space-x-1 text-[6.5px] uppercase tracking-widest font-black text-emerald-700 leading-none">
            <span>★ ANNESHA HOSPITAL ★</span>
          </div>

          {/* Core Stamp Body - Short, High-Contrast, Elegant */}
          <div className="text-base sm:text-lg font-black tracking-widest uppercase text-emerald-700 leading-none font-mono my-0.5 drop-shadow-2xs">
            PAID
          </div>
          <div className="text-[9.5px] font-black text-emerald-800 tracking-wider leading-none">
            পরিশোধিত
          </div>

          {/* Clean Subtitle - Minimized Details */}
          <div className="mt-0.5 pt-0.5 text-[6.5px] border-t border-emerald-300/70 uppercase tracking-tighter text-emerald-700 font-bold leading-tight">
            FULL SETTLEMENT • সম্পূর্ণ পরিশোধ
          </div>
        </div>
      </div>
    );
  }

  // DUE / UNPAID / PARTIAL Seal
  return (
    <div
      className={`relative inline-block border-[1.5px] border-rose-600 text-rose-800 bg-rose-50/80 rounded-xl transform rotate-3 select-none shadow-2xs pointer-events-none print:opacity-100 ${sizeClasses} ${className}`}
      style={{ mixBlendMode: "multiply" }}
    >
      <div className="border border-dashed border-rose-500/80 p-1 rounded-lg text-center leading-tight">
        {/* Header */}
        <div className="flex items-center justify-center space-x-1 text-[6.5px] uppercase tracking-widest font-black text-rose-700 leading-none">
          <AlertCircle className="w-2 h-2 mr-0.5 inline" />
          <span>ANNESHA HOSPITAL</span>
        </div>

        {/* Core Stamp Body */}
        <div className="text-base sm:text-lg font-black tracking-widest uppercase text-rose-700 leading-none font-mono my-0.5 drop-shadow-2xs">
          DUE
        </div>
        <div className="text-[9.5px] font-black text-rose-800 tracking-wider leading-none">
          বকেয়া
        </div>

        {/* Due Balance highlight */}
        <div className="bg-rose-100/90 text-rose-900 font-mono font-black text-[8.5px] py-0 px-1 rounded my-0.5 border border-rose-200 inline-block leading-tight">
          {formatCurrencyBDT(dueAmount)}
        </div>

        {/* Clean Subtitle - Minimized Details */}
        <div className="mt-0.5 pt-0.5 text-[6.5px] border-t border-rose-300/70 uppercase tracking-tighter text-rose-700 font-bold leading-tight">
          PAYMENT PENDING • বকেয়া পরিশোধ সাপেক্ষে
        </div>
      </div>
    </div>
  );
}
