"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    async function loadOutbox() {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("notification_outbox")
        .select("id, channel, notification_type, recipient, subject, status, attempt_count, failure_reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) {
        setOutbox(data as OutboxItem[]);
      }
      setLoading(false);
    }
    loadOutbox();
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Notification Outbox & Gateways
        </h1>
        <p className="text-sm text-zinc-500">
          Monitor transactional notifications dispatched via SMS, WhatsApp, and Email.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs font-semibold uppercase text-zinc-500">SMS Gateway (BD Telecom)</div>
          <div className="mt-2 text-lg font-bold text-zinc-800 dark:text-zinc-100">SSL Wireless / Greenweb</div>
          <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">Ready for Integration</div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs font-semibold uppercase text-zinc-500">WhatsApp Business Cloud</div>
          <div className="mt-2 text-lg font-bold text-zinc-800 dark:text-zinc-100">Meta Graph API v19.0</div>
          <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">HSM Templates Mapped</div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs font-semibold uppercase text-zinc-500">Transactional Email</div>
          <div className="mt-2 text-lg font-bold text-zinc-800 dark:text-zinc-100">Resend / SendGrid</div>
          <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">HTML Sanitized & TLS</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-100 p-4 dark:border-zinc-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Recent Outbox Queue Dispatches
          </h2>
          <span className="text-xs text-zinc-400">Showing last 50 dispatches</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">Loading outbox records...</div>
        ) : outbox.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No notifications in outbox yet.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <tr>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {outbox.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                  <td className="px-4 py-3 font-semibold text-xs text-zinc-800 dark:text-zinc-200">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                      {item.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {item.notification_type}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    {item.recipient}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        item.status === "SENT" || item.status === "DELIVERED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : item.status === "QUEUED"
                          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {item.attempt_count}
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
