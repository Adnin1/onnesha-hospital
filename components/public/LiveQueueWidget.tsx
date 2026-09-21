/**
 * LiveQueueWidget — Client Island for Live Doctor Token Queue
 * Isolated client component for the homepage live queue display.
 * Polls every 15s, respects Page Visibility API, no-PII projection.
 */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { getLiveWaitingQueueAction } from "@/lib/public/actions";

interface QueueItem {
  id: string;
  doctor_name: string;
  room_number: string;
  token_number: string;
  status: "waiting" | "calling" | "serving" | "done" | "skipped";
}

type LoadState = "loading" | "success" | "error" | "empty";

export function LiveQueueWidget() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const fetchQueue = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;

    try {
      const res = await getLiveWaitingQueueAction();
      if (res.success) {
        setQueue(res.queue ?? []);
        setLoadState(res.queue && res.queue.length > 0 ? "success" : "empty");
      } else {
        setLoadState("error");
      }
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let inFlight = false;

    const run = async () => {
      if (!mounted || inFlight) return;
      inFlight = true;
      await fetchQueue();
      inFlight = false;
    };

    void run();
    const timer = window.setInterval(() => void run(), 15000);

    const handleVisibility = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchQueue]);

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-6 text-slate-900 border border-slate-100">
      <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
          <h2 className="font-bold text-base text-slate-800">
            Live Doctor Token Queue
          </h2>
        </div>
        <span className="text-[11px] bg-sky-100 text-sky-800 font-semibold px-2 py-0.5 rounded">
          Auto-refresh (15s)
        </span>
      </div>

      <p className="text-xs text-slate-500 mb-4">
        Currently serving tokens inside outpatient chambers.
      </p>

      <div className="space-y-3" aria-live="polite" aria-label="Live token queue">
        {loadState === "loading" && (
          <div className="flex items-center justify-center py-6 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2 text-sky-500" aria-hidden="true" />
            <span className="text-xs">Loading queue...</span>
          </div>
        )}

        {loadState === "error" && (
          <div className="flex items-center justify-center gap-2 py-4 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Unable to load queue right now. Refreshing...</span>
          </div>
        )}

        {loadState === "empty" && (
          <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-slate-100">
            Doctor chambers active for today. Online bookings open.
          </div>
        )}

        {loadState === "success" && queue.slice(0, 4).map((q) => (
          <div
            key={q.id}
            className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100"
          >
            <div>
              <div className="text-xs font-semibold text-slate-900">
                {q.doctor_name}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center mt-0.5">
                <span className="font-medium text-sky-700 mr-2">
                  {q.room_number}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-md">
                Token: {q.token_number}
              </span>
              <span className="block text-[10px] text-slate-400 capitalize mt-0.5">
                {q.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100">
        <Link
          href="/check-token"
          className="flex items-center justify-center text-xs font-semibold text-sky-700 hover:text-sky-800 w-full py-2 bg-sky-50 rounded-lg hover:bg-sky-100 transition"
        >
          View All Doctor Chambers & Queues
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
