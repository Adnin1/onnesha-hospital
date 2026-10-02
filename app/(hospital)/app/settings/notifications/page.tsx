"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, Send, ShieldCheck, Smartphone, Mail, MessageSquare } from "lucide-react";

interface OutboxItem {
  id: string;
  channel: string;
  notification_type: string;
  recipient: string;
  subject: string | null;
  status: string;
  attempt_count: number;
  failure_reason: string | null;
  created_at: string;
}

export default function NotificationSettingsPage() {
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function loadOutbox() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("notification_outbox")
          .select("id, channel, notification_type, recipient, subject, status, attempt_count, failure_reason, created_at")
          .order("created_at", { ascending: false })
          .limit(50);

        if (isMounted) {
          if (data) {
            setOutbox(data as OutboxItem[]);
          }
          setLoading(false);
        }
      } catch (err: unknown) {
        console.error("[NotificationsSettingsPage] loadOutbox error:", err);
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadOutbox();

    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Enterprise Communications & Alerts
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            নোটিফিকেশন আউটবক্স ও মেসেজ গেটওয়ে
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor transactional appointment reminders, billing receipts, and emergency alerts dispatched via SMS, WhatsApp, and Email.
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            setRefreshTrigger((n) => n + 1);
          }}
          className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
          title="Refresh outbox"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Gateway Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-sky-600" />
            <div className="text-xs font-bold uppercase text-slate-500">SMS Gateway (BD Telecom)</div>
          </div>
          <div className="mt-3 text-lg font-bold text-slate-900">SSL Wireless / Greenweb</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            মাস্কিং এসএমএস রেডি (Fail-Closed Outbox)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            <div className="text-xs font-bold uppercase text-slate-500">WhatsApp Business Cloud</div>
          </div>
          <div className="mt-3 text-lg font-bold text-slate-900">Meta Graph API v19.0</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            HSM টেমপ্লেট ম্যাপড (Token & Rx)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-purple-600" />
            <div className="text-xs font-bold uppercase text-slate-500">Transactional Email</div>
          </div>
          <div className="mt-3 text-lg font-bold text-slate-900">Resend / SendGrid</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            TLS এনক্রিপ্টেড ও স্যানিটাইজড
          </div>
        </div>
      </div>

      {/* Outbox Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-sky-600" />
            সাম্প্রতিক প্রেরিত ও কিউ নোটিফিকেশন লগ
          </h2>
          <span className="text-xs text-slate-400">সর্বশেষ ৫০টি রেকর্ড</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">আউটবক্স লোড হচ্ছে...</div>
        ) : outbox.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            বর্তমানে কোনো আউটবক্স নোটিফিকেশন নেই।
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">চ্যানেল</th>
                  <th className="px-4 py-3">টাইপ</th>
                  <th className="px-4 py-3">প্রাপক (Recipient)</th>
                  <th className="px-4 py-3">বিষয় / টেমপ্লেট</th>
                  <th className="px-4 py-3 text-center">স্ট্যাটাস</th>
                  <th className="px-4 py-3">তারিখ ও সময়</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outbox.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {item.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                      {item.notification_type}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-800">
                      {item.recipient}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.subject || "Transaction Alert"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.status === "SENT" || item.status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-[11px]">
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
  );
}
