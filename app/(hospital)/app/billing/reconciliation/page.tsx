"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCashRegisterSummaryAction } from "@/lib/billing/actions";
import { CashRegisterSummary } from "@/types/billing";
import { formatCurrencyBDT } from "@/lib/utils";
import {
  Wallet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer,
  CreditCard,
} from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"cashier" | "gateways">("cashier");
  const [cashSummary, setCashSummary] = useState<CashRegisterSummary | null>(null);
  const [intents, setIntents] = useState<PaymentIntentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProvider, setFilterProvider] = useState<string>("ALL");
  const [physicalCashInput, setPhysicalCashInput] = useState<string>("");
  const [openingFloat, setOpeningFloat] = useState<number>(0);
  const [closeoutSaved, setCloseoutSaved] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [sumRes, dbRes] = await Promise.all([
          getCashRegisterSummaryAction(),
          (async () => {
            const supabase = createClient();
            let query = supabase
              .from("payment_intents")
              .select("id, intent_reference, invoice_id, payable_amount, provider, status, provider_transaction_id, created_at")
              .order("created_at", { ascending: false })
              .limit(50);

            if (filterProvider !== "ALL") {
              query = query.eq("provider", filterProvider);
            }
            return await query;
          })(),
        ]);

        if (isMounted) {
          if (sumRes.success && sumRes.data) {
            setCashSummary(sumRes.data.summary);
          }
          if (dbRes.data) {
            setIntents(dbRes.data as PaymentIntentRecord[]);
          }
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [filterProvider, refreshTrigger]);

  // Calculations
  const systemExpectedCash = (cashSummary?.todayCashCollected || 0) + openingFloat;
  const countedCash = parseFloat(physicalCashInput) || 0;
  const variance = physicalCashInput !== "" ? countedCash - systemExpectedCash : 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Cashier Desk & Gateway Settlements
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            ক্যাশ ও অনলাইন পেমেন্ট রিকনসিলিয়েশন
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Daily cashier drawer closeout, cash variance verification, and MFS gateway reconciliations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px]"
          >
            <Printer className="w-4 h-4 mr-1.5 text-sky-400" />
            শিফট রিসিট প্রিন্ট
          </button>
          <button
            onClick={() => {
              setLoading(true);
              setRefreshTrigger((n) => n + 1);
            }}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Refresh reconciliation"
            aria-label="Refresh reconciliation data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2 no-print">
        <button
          onClick={() => setActiveTab("cashier")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === "cashier"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          ক্যাশ ড্রয়ার রিকনসিলিয়েশন (Cash Drawer Closeout)
        </button>
        <button
          onClick={() => setActiveTab("gateways")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === "gateways"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          অনলাইন গেটওয়ে পেমেন্টস (bKash / Nagad / SSL)
        </button>
      </div>

      {/* TAB 1: CASHIER DRAWER RECONCILIATION */}
      {activeTab === "cashier" && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">আজকের মোট বিল</span>
              <div className="text-xl font-black text-slate-900 mt-1 font-mono">
                {formatCurrencyBDT(cashSummary?.todayTotalInvoiced || 0)}
              </div>
              <span className="text-[10px] text-slate-400">সক্রিয় ইনভয়েস: {cashSummary?.activeInvoiceCount || 0}</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">নগদ ক্যাশ আদায়</span>
              <div className="text-xl font-black text-emerald-700 mt-1 font-mono">
                {formatCurrencyBDT(cashSummary?.todayCashCollected || 0)}
              </div>
              <span className="text-[10px] text-emerald-600 font-semibold">ক্যাশ কাউন্টার রিসিট</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">ডিজিটাল ও এমএফএস আদায়</span>
              <div className="text-xl font-black text-sky-700 mt-1 font-mono">
                {formatCurrencyBDT(cashSummary?.todayMfsCollected || 0)}
              </div>
              <span className="text-[10px] text-sky-600 font-semibold">বিকাশ / নগদ / কার্ড</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase">সর্বমোট সংগৃহীত টাকা</span>
              <div className="text-xl font-black text-slate-900 mt-1 font-mono">
                {formatCurrencyBDT(cashSummary?.todayTotalCollected || 0)}
              </div>
              <span className="text-[10px] text-slate-400">নগদ + ডিজিটাল সমষ্টি</span>
            </div>
          </div>

          {/* Cash Drawer Calculator */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-sky-600" />
              ক্যাশিয়ার শিফট ক্লোজআউট ও ড্রয়ার ব্যালেন্স যাচাই
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              দিনের শুরুতে ক্যাশ ড্রয়ারে থাকা শুরু ব্যালেন্স (Opening Float) এবং দিন শেষে গুনে পাওয়া নগদ টাকা বসিয়ে ব্যালেন্স মিলিয়ে নিন।
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  শুরু ব্যালেন্স (Opening Float BDT)
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingFloat || ""}
                  onChange={(e) => setOpeningFloat(parseFloat(e.target.value) || 0)}
                  placeholder="যেমন: ১০০০"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  সকালে ক্যাশ ড্রয়ারে থাকা খুচরা টাকা
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  হাতে গুনে পাওয়া মোট নগদ টাকা (Physical Count BDT)
                </label>
                <input
                  type="number"
                  min="0"
                  value={physicalCashInput}
                  onChange={(e) => setPhysicalCashInput(e.target.value)}
                  placeholder="ড্রয়ারের আসল ক্যাশ টাকা"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  শিফট শেষে ক্যাশ ড্রয়ার গুনে পাওয়া টাকা
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  হিসাব অনুযায়ী প্রত্যাশিত ক্যাশ
                </label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800">
                  {formatCurrencyBDT(systemExpectedCash)}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  ওপেনিং ফ্লট ({openingFloat}) + আজকের ক্যাশ আদায় ({cashSummary?.todayCashCollected || 0})
                </span>
              </div>
            </div>

            {/* Variance Result Alert */}
            {physicalCashInput !== "" && (
              <div
                className={`mt-6 p-4 rounded-xl border flex items-center justify-between ${
                  variance === 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : variance > 0
                    ? "bg-sky-50 border-sky-200 text-sky-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  {variance === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-sm">
                      {variance === 0
                        ? "✓ ক্যাশ ড্রয়ার সম্পূর্ণ নির্ভুল (Zero Variance)"
                        : variance > 0
                        ? `উদ্বৃত্ত ক্যাশ: +${formatCurrencyBDT(variance)} (Cash Surplus)`
                        : `ক্যাশ ঘাটতি: ${formatCurrencyBDT(variance)} (Cash Shortage)`}
                    </span>
                    <p className="text-[11px] mt-0.5">
                      প্রত্যাশিত: {formatCurrencyBDT(systemExpectedCash)} | হাতে রয়েছে: {formatCurrencyBDT(countedCash)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setCloseoutSaved(true)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition"
                >
                  {closeoutSaved ? "✓ শিফট সংরক্ষিত" : "শিফট ক্লোজআউট নিশ্চিত করুন"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ONLINE GATEWAYS & SETTLEMENTS */}
      {activeTab === "gateways" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                অনলাইন পেমেন্ট গেটওয়ে সেটেলমেন্ট ও ইনটেন্ট হিস্ট্রি
              </h2>
              <span className="text-xs text-slate-400">সর্বশেষ ৫০টি ডিজিটাল ট্রানজ্যাকশন</span>
            </div>

            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
              {["ALL", "BKASH", "NAGAD", "SSLCOMMERZ"].map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterProvider(p)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    filterProvider === p ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">লোড হচ্ছে...</div>
            ) : intents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                নির্বাচিত গেটওয়েতে কোনো ডিজিটাল ট্রানজ্যাকশন রেকর্ড নেই।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">ইনটেন্ট রেফারেন্স</th>
                      <th className="px-4 py-3">প্রোভাইডার</th>
                      <th className="px-4 py-3 text-right">টাকার পরিমাণ</th>
                      <th className="px-4 py-3">ট্রানজ্যাকশন আইডি</th>
                      <th className="px-4 py-3 text-center">স্ট্যাটাস</th>
                      <th className="px-4 py-3">তারিখ ও সময়</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {intents.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{item.intent_reference}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {item.provider}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {formatCurrencyBDT(item.payable_amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{item.provider_transaction_id || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === "PAID"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "PENDING"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-sans text-[11px]">
                          {new Date(item.created_at).toLocaleString("en-GB")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
