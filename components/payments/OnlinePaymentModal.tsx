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
      });

      if (!res.success || !res.initiateResult) {
        setErrorMessage(res.error || "Failed to initiate online payment session.");
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
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b pb-3 dark:border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Online Bill Payment</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Invoice #{invoiceNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
            <span className="text-xs text-zinc-500">Outstanding Balance</span>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              BDT {dueAmount.toLocaleString()}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Payment Amount (BDT)
            </label>
            <input
              type="number"
              max={dueAmount}
              min={1}
              value={payingAmount}
              onChange={(e) => setPayingAmount(Math.min(dueAmount, Math.max(1, Number(e.target.value))))}
              className="w-full rounded-lg border border-zinc-300 p-2 text-sm focus:border-rose-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Select Payment Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedProvider("BKASH")}
                className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition-all ${
                  selectedProvider === "BKASH"
                    ? "border-rose-600 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
                }`}
              >
                <span className="text-sm font-bold">bKash</span>
                <span className="text-[10px] text-zinc-500">MFS</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProvider("NAGAD")}
                className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition-all ${
                  selectedProvider === "NAGAD"
                    ? "border-amber-600 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
                }`}
              >
                <span className="text-sm font-bold">Nagad</span>
                <span className="text-[10px] text-zinc-500">Post Office</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedProvider("SSLCOMMERZ")}
                className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition-all ${
                  selectedProvider === "SSLCOMMERZ"
                    ? "border-sky-600 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
                }`}
              >
                <span className="text-sm font-bold">Cards/Net</span>
                <span className="text-[10px] text-zinc-500">SSLCommerz</span>
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {errorMessage}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleInitiate}
              disabled={loading || payingAmount <= 0}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Connecting Gateway..." : `Pay BDT ${payingAmount.toLocaleString()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
