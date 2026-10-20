"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  History,
  ShieldAlert,
  Loader2,
  Calendar,
  User,
  FileText,
  Lock,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import {
  getInvoiceEditHistoryAction,
  InvoiceEditHistoryRecord,
} from "@/lib/billing/actions";
import { formatCurrencyBDT } from "@/lib/utils";

interface InvoiceEditHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  patientName?: string;
}

export function InvoiceEditHistoryModal({
  isOpen,
  onClose,
  invoiceId,
  invoiceNumber,
  patientName,
}: InvoiceEditHistoryModalProps) {
  const [history, setHistory] = useState<InvoiceEditHistoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !invoiceId) return;
    let isMounted = true;

    async function loadHistory() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await getInvoiceEditHistoryAction(invoiceId);
        if (isMounted) {
          if (res.success && res.data) {
            setHistory(res.data);
          } else {
            setErrorMsg(res.error || "অডিট হিস্টোরি লোড করতে ব্যর্থ হয়েছে।");
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setErrorMsg(err instanceof Error ? err.message : "ত্রুটি ঘটেছে।");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [isOpen, invoiceId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-white">
              <History className="h-6 w-6 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">ইনভয়েস অডিট ও সংশোধন ইতিহাস</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {history.length}টি সংশোধন রেকর্ড
                </span>
              </div>
              <p className="text-xs text-slate-300">
                ইনভয়েস #{invoiceNumber} {patientName ? `• রোগী: ${patientName}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Guarantee Banner: Immutable & Tamper Proof */}
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="h-4 w-4 text-amber-700 shrink-0" />
            <span>স্থায়ী ও অপরিবর্তনীয় অডিট ট্রেইল: রিসিপশন বা কোনো স্টাফ এই ইতিহাস মুছতে পারবে না।</span>
          </div>
          <span className="text-[10px] uppercase font-extrabold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded">
            Non-Deletable
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Loader2 className="h-7 w-7 animate-spin mx-auto text-indigo-600 mb-2" />
              অডিট হিস্টোরি অনুসন্ধান করা হচ্ছে...
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <ShieldAlert className="h-10 w-10 text-emerald-600 mx-auto" />
              <p className="text-sm font-bold text-slate-800">
                এই ইনভয়েসে কোনো সংশোধন বা পরিবর্তন করা হয়নি।
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                ইনভয়েসটি তৈরির পর থেকে অবিকৃত রয়েছে। রিসিপশন বা ক্যাশিয়ার কোনো আইটেম বা ডিসকাউন্ট এডিট করলে তার পুঙ্খানুপুঙ্খ বিবরণ এখানে স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে।
              </p>
            </div>
          ) : (
            history.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3.5 relative"
              >
                {/* Event Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      #{history.length - idx}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-500" />
                        <span>{item.edited_by_name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-100 text-indigo-800">
                          {item.edited_by_role}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.created_at).toLocaleString("en-GB", {
                          timeZone: "Asia/Dhaka",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}{" "}
                        (BST)
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-right">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                      গ্র্যান্ড টোটাল পরিবর্তন
                    </span>
                    <div className="text-xs font-black flex items-center gap-1 justify-end font-mono">
                      <span className="text-slate-500 line-through">
                        {formatCurrencyBDT(Number(item.previous_grand_total))}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className="text-emerald-700">
                        {formatCurrencyBDT(Number(item.new_grand_total))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Edit Reason */}
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block mb-0.5 flex items-center gap-1">
                    <FileText className="h-3 w-3 text-slate-400" />
                    সংশোধনের কারণ / অডিট নোট:
                  </span>
                  <p className="font-semibold text-slate-800 italic">
                    &ldquo;{item.edit_reason || "No explicit reason specified"}&rdquo;
                  </p>
                </div>

                {/* Financial Summary Diff */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2 rounded-xl bg-white border border-slate-200">
                    <span className="text-[10px] font-semibold text-slate-400 block font-sans">
                      সাবটোটাল (Subtotal)
                    </span>
                    <span className="text-slate-500 line-through text-[11px]">
                      {formatCurrencyBDT(Number(item.previous_subtotal))}
                    </span>{" "}
                    →{" "}
                    <span className="font-bold text-slate-900">
                      {formatCurrencyBDT(Number(item.new_subtotal))}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-white border border-slate-200">
                    <span className="text-[10px] font-semibold text-slate-400 block font-sans">
                      ছাড় (Discount)
                    </span>
                    <span className="text-slate-500 line-through text-[11px]">
                      {formatCurrencyBDT(Number(item.previous_discount))}
                    </span>{" "}
                    →{" "}
                    <span className="font-bold text-rose-600">
                      {formatCurrencyBDT(Number(item.new_discount))}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-white border border-slate-200 col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-semibold text-slate-400 block font-sans">
                      নেট মোট (Grand Total)
                    </span>
                    <span className="font-black text-indigo-900">
                      {formatCurrencyBDT(Number(item.new_grand_total))}
                    </span>
                  </div>
                </div>

                {/* Items Changes Table */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    আইটেম ও সার্ভিস তালিকা তুলনা:
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Previous Items */}
                    <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100">
                      <span className="text-[11px] font-bold text-rose-900 block mb-1">
                        পূর্বের সার্ভিস সমূহ ({item.previous_items?.length || 0}টি):
                      </span>
                      <ul className="space-y-1">
                        {(item.previous_items || []).map((it, pIdx) => (
                          <li
                            key={pIdx}
                            className="flex justify-between items-center text-[11px] text-slate-700 font-mono"
                          >
                            <span className="truncate max-w-[160px] font-sans">
                              {it.item_name} × {it.quantity}
                            </span>
                            <span className="font-semibold">
                              {formatCurrencyBDT(Number(it.total_price))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* New Items */}
                    <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                      <span className="text-[11px] font-bold text-emerald-900 block mb-1">
                        সংশোধিত নতুন সার্ভিস সমূহ ({item.new_items?.length || 0}টি):
                      </span>
                      <ul className="space-y-1">
                        {(item.new_items || []).map((it, nIdx) => (
                          <li
                            key={nIdx}
                            className="flex justify-between items-center text-[11px] text-slate-700 font-mono"
                          >
                            <span className="truncate max-w-[160px] font-sans">
                              {it.item_name} × {it.quantity}
                            </span>
                            <span className="font-semibold text-emerald-800">
                              {formatCurrencyBDT(Number(it.total_price))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            অডিট ট্রেইল আইটেম নং: {history.length} • সুপার অ্যাডমিন সুপারভিশন এনফোর্সড
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl shadow-xs transition-colors"
          >
            বন্ধ করুন (Close)
          </button>
        </div>
      </div>
    </div>
  );
}
