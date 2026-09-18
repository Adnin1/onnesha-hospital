"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface PaymentIntentRecord {
  id: string;
  intent_reference: string;
  invoice_id: string;
  payable_amount: number;
  provider: string;
  status: string;
  provider_transaction_id: string | null;
  created_at: string;
}

export default function PaymentReconciliationPage() {
  const [intents, setIntents] = useState<PaymentIntentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProvider, setFilterProvider] = useState<string>("ALL");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from("payment_intents")
        .select("id, intent_reference, invoice_id, payable_amount, provider, status, provider_transaction_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (filterProvider !== "ALL") {
        query = query.eq("provider", filterProvider);
      }

      const { data } = await query;
      if (data) {
        setIntents(data as PaymentIntentRecord[]);
      }
      setLoading(false);
    }
    loadData();
  }, [filterProvider]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Online Payment Reconciliation
          </h1>
          <p className="text-sm text-zinc-500">
            Monitor and reconcile gateway settlements across bKash, Nagad, and SSLCommerz.
          </p>
        </div>

        <div className="flex gap-2">
          {["ALL", "BKASH", "NAGAD", "SSLCOMMERZ"].map((p) => (
            <button
              key={p}
              onClick={() => setFilterProvider(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                filterProvider === p
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Recent Payment Intents & Settlements
          </h2>
          <span className="text-xs text-zinc-400">Showing last 50 transactions</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">Loading ledger...</div>
        ) : intents.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No gateway payment intents recorded yet.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Intent Ref</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Provider TrxID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {intents.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {item.intent_reference}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold dark:bg-zinc-800">
                      {item.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">
                    ৳{Number(item.payable_amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {item.provider_transaction_id || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        item.status === "PAID"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : item.status === "PENDING" || item.status === "AUTHORIZED"
                          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(item.created_at).toLocaleString("en-GB", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
