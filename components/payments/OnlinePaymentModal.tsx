"use client";

import React, { useState } from "react";
import { PaymentProvider } from "@/lib/payments/types";
import { PaymentService } from "@/lib/payments/payment-service";

interface OnlinePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  dueAmount: number;
  onSuccess?: () => void;
}

export function OnlinePaymentModal({
  isOpen,
  onClose,
  organizationId,
  invoiceId,
  invoiceNumber,
  dueAmount,
  onSuccess,
}: OnlinePaymentModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>("BKASH");
  const [payingAmount, setPayingAmount] = useState<number>(dueAmount);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionKey] = useState<string>(() => `idem_${invoiceId}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`);

  if (!isOpen) return null;

  const handleInitiate = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await PaymentService.createPaymentIntent({
        organizationId,
        invoiceId,
        provider: selectedProvider,
        amount: Number(payingAmount),
        idempotencyKey: sessionKey,
      });

      if (!res.success || !res.initiateResult) {
        setErrorMessage(res.error || "Online payment is not configured for this hospital yet.");
        setLoading(false);
        return;
      }

      if (res.initiateResult.redirectGatewayUrl) {
        // In browser, navigate to payment gateway checkout
        window.location.href = res.initiateResult.redirectGatewayUrl;
      } else {
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Payment error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Online Bill Payment</h3>
            <p className="text-xs text-slate-500 font-medium">Invoice #{invoiceNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-3.5">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Outstanding Balance</span>
            <div className="text-2xl font-black text-rose-600 mt-0.5">
              BDT {dueAmount.toLocaleString()}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Payment Amount (BDT)
            </label>
            <input
              type="number"
              max={dueAmount}
              min={1}
              value={payingAmount}
              onChange={(e) => setPayingAmount(Math.min(dueAmount, Math.max(1, Number(e.target.value))))}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm text-slate-900 font-medium focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Select Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedProvider("BKASH")}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                  selectedProvider === "BKASH"
                    ? "border-rose-600 bg-rose-50 text-rose-700 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <span className="text-sm font-bold">bKash</span>
                <span className="text-[10px] text-slate-500 font-medium">MFS</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProvider("NAGAD")}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                  selectedProvider === "NAGAD"
                    ? "border-amber-600 bg-amber-50 text-amber-700 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <span className="text-sm font-bold">Nagad</span>
                <span className="text-[10px] text-slate-500 font-medium">Post Office</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProvider("SSLCOMMERZ")}
                className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${
                  selectedProvider === "SSLCOMMERZ"
                    ? "border-sky-600 bg-sky-50 text-sky-700 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <span className="text-sm font-bold">Cards/Net</span>
                <span className="text-[10px] text-slate-500 font-medium">SSLCommerz</span>
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition min-h-[40px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleInitiate}
              disabled={loading || payingAmount <= 0}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition min-h-[40px]"
            >
              {loading ? "Connecting Gateway..." : `Pay BDT ${payingAmount.toLocaleString()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
