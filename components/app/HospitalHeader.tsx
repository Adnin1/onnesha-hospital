"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Search,
  ExternalLink,
  Clock,
  Radio,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { MOCK_ORGANIZATION } from "@/lib/mock-data";

export function HospitalHeader() {
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setDateStr(
        now.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between no-print">
      {/* Left: Organization Code & Live Realtime Indicator */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="hidden sm:inline font-mono uppercase bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-600">
            {MOCK_ORGANIZATION.code} CENTRAL CLOUD
          </span>
        </div>

        <div className="hidden md:flex items-center text-xs text-slate-500 font-mono">
          <Clock className="w-3.5 h-3.5 mr-1 text-sky-600" />
          <span>Dhaka BST: <strong>{timeStr || "Loading..."}</strong> ({dateStr})</span>
        </div>
      </div>

      {/* Right: Quick actions & Link to Website */}
      <div className="flex items-center space-x-3">
        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 text-xs z-50">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 font-bold text-slate-800">
                <span>System Notifications</span>
                <span className="text-[10px] text-sky-600">3 Unread</span>
              </div>
              <div className="space-y-2 mt-2">
                <div className="p-2 bg-sky-50 rounded-lg">
                  <p className="font-semibold text-sky-900">New Token: B-007</p>
                  <p className="text-[10px] text-slate-600">Dr. Farhana Yasmin - Gynae OPD</p>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <p className="font-semibold text-emerald-900">Lab Report Ready</p>
                  <p className="text-[10px] text-slate-600">CBC test verified for OH-000101</p>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg">
                  <p className="font-semibold text-amber-900">Low Stock Alert</p>
                  <p className="text-[10px] text-slate-600">Ciprocin 500mg has 45 tablets left</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Public Website button */}
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-lg transition"
        >
          <span className="hidden sm:inline mr-1">Public Website</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </header>
  );
}
