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
  dateStr,
  cashierName,
  receiptNumber,
  size = "md",
  className = "",
}: PaymentStampSealProps & { _paidAmount?: number; _totalAmount?: number }) {
  const isVoid = status === "VOID";
  const isPaid = status === "PAID" || dueAmount <= 0;
  const isCompact = size === "compact";

  const sizeClasses = {
    compact: "px-2 py-0.5 text-[8.5px] max-w-[130px]",
    sm: "px-3 py-1.5 text-[10px] max-w-[160px]",
    md: "px-4 py-2 text-xs max-w-[210px]",
    lg: "px-5 py-3 text-sm max-w-[260px]",
  }[size];

  if (isVoid) {
    return (
      <div
        className={`relative inline-block border-2 border-dashed border-slate-600 text-slate-700 bg-slate-50/40 ${isCompact ? "rounded-xl transform -rotate-3" : "rounded-2xl transform -rotate-6"} select-none shadow-xs pointer-events-none print:opacity-100 ${sizeClasses} ${className}`}
        style={{ mixBlendMode: "multiply" }}
      >
        <div className={`border border-slate-400 ${isCompact ? "p-1 rounded-lg" : "p-1.5 rounded-xl"} text-center`}>
          <div className="flex items-center justify-center space-x-1 text-[7.5px] uppercase tracking-widest font-black text-slate-500">
            <Ban className="w-2.5 h-2.5" />
            <span>ANNESHA HOSPITAL</span>
          </div>
          <div className={`${isCompact ? "text-base sm:text-lg my-0" : "text-xl"} font-black tracking-wider uppercase text-slate-800 leading-tight`}>
            VOID
          </div>
          <div className={`${isCompact ? "text-[9.5px]" : "text-[11px]"} font-bold text-slate-600`}>বাতিলকৃত ইনভয়েস</div>
          <div className="text-[7px] text-slate-500 uppercase tracking-tighter mt-0.5">
            NON-NEGOTIABLE • CANCELLED
          </div>
        </div>
      </div>
    );
  }

  if (isPaid) {
    return (
      <div
        className={`relative inline-block ${
          isCompact
            ? "border-2 border-emerald-600/90 text-emerald-800 bg-emerald-50/40 rounded-xl transform -rotate-3 select-none shadow-2xs pointer-events-none print:opacity-100"
            : "border-3 border-emerald-600 text-emerald-800 bg-emerald-50/90 rounded-2xl transform -rotate-6 select-none shadow-sm pointer-events-none print:opacity-100"
        } ${sizeClasses} ${className}`}
        style={{ mixBlendMode: "multiply" }}
      >
        <div className={`border border-dashed border-emerald-500/80 ${isCompact ? "p-1 rounded-lg" : "p-2 rounded-xl"} text-center`}>
          {/* Header */}
          <div className="flex items-center justify-center space-x-1 text-[7.5px] uppercase tracking-widest font-black text-emerald-700">
            <span>★ ANNESHA HOSPITAL ★</span>
          </div>

          {/* Core Stamp Body */}
          <div className={`${isCompact ? "text-base sm:text-lg my-0" : "text-2xl sm:text-3xl my-0.5"} font-black tracking-widest uppercase text-emerald-700 leading-tight font-mono drop-shadow-2xs`}>
            PAID
          </div>
          <div className={`${isCompact ? "text-[9.5px] font-black" : "text-xs sm:text-sm font-black"} text-emerald-800 tracking-wider`}>
            পরিশোধিত
          </div>

          {/* Subtitle & Settlement info */}
          <div className={`${isCompact ? "mt-0.5 pt-0.5 text-[7px]" : "mt-1 pt-1 text-[8px] sm:text-[9px]"} border-t border-emerald-300/70 uppercase tracking-tight text-emerald-700 font-bold`}>
            FULL SETTLEMENT • সম্পূর্ণ পরিশোধ
          </div>
          {!isCompact && receiptNumber && (
            <div className="text-[8px] text-emerald-600 font-mono">
              Rec: {receiptNumber}
            </div>
          )}
          {!isCompact && cashierName && (
            <div className="text-[7px] text-emerald-600 font-mono">
              Cashier: {cashierName}
            </div>
          )}
          {dateStr && (
            <div className={`${isCompact ? "text-[6.5px]" : "text-[7px] sm:text-[8px]"} text-emerald-600/90 font-mono mt-0.5`}>
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
      className={`relative inline-block ${
        isCompact
          ? "border-2 border-rose-600/90 text-rose-800 bg-rose-50/40 rounded-xl transform rotate-3 select-none shadow-2xs pointer-events-none print:opacity-100"
          : "border-3 border-rose-600 text-rose-800 bg-rose-50/90 rounded-2xl transform rotate-6 select-none shadow-sm pointer-events-none print:opacity-100"
      } ${sizeClasses} ${className}`}
      style={{ mixBlendMode: "multiply" }}
    >
      <div className={`border border-dashed border-rose-500/80 ${isCompact ? "p-1 rounded-lg" : "p-2 rounded-xl"} text-center`}>
        {/* Header */}
        <div className="flex items-center justify-center space-x-1 text-[7.5px] uppercase tracking-widest font-black text-rose-700">
          <AlertCircle className="w-2 h-2 mr-0.5 inline" />
          <span>ANNESHA HOSPITAL</span>
        </div>

        {/* Core Stamp Body */}
        <div className={`${isCompact ? "text-base sm:text-lg my-0" : "text-2xl sm:text-3xl my-0.5"} font-black tracking-widest uppercase text-rose-700 leading-tight font-mono drop-shadow-2xs`}>
          DUE
        </div>
        <div className={`${isCompact ? "text-[9.5px] font-black" : "text-xs sm:text-sm font-black"} text-rose-800 tracking-wider`}>
          বকেয়া
        </div>

        {/* Due Balance highlight */}
        <div className={`bg-rose-100/90 text-rose-900 font-mono font-black ${isCompact ? "text-[9px] py-0 px-1" : "text-[11px] sm:text-xs py-0.5 px-1.5"} rounded-md my-0.5 border border-rose-200`}>
          {formatCurrencyBDT(dueAmount)}
        </div>

        {/* Subtitle */}
        <div className={`${isCompact ? "mt-0.5 pt-0.5 text-[7px]" : "mt-1 pt-0.5 text-[8px]"} border-t border-rose-300/70 uppercase tracking-tight text-rose-700 font-bold`}>
          PAYMENT PENDING • বকেয়া পরিশোধ সাপেক্ষে
        </div>
        {!isCompact && cashierName && (
          <div className="text-[7px] text-rose-600 font-mono">
            Cashier: {cashierName}
          </div>
        )}
        {dateStr && (
          <div className={`${isCompact ? "text-[6.5px]" : "text-[7px] sm:text-[8px]"} text-rose-600/90 font-mono mt-0.5`}>
            {new Date(dateStr).toLocaleDateString("en-GB")}
          </div>
        )}
      </div>
    </div>
  );
}
