"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Activity,
  ExternalLink,
  Clock,
  CheckCircle2,
  X,
} from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";

interface SystemActivityItem {
  id: string;
  action: string;
  entityType: string;
  timeStr: string;
}

export function HospitalHeader() {
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [activities, setActivities] = useState<SystemActivityItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
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
    // Update every 30 seconds to minimize client CPU and battery consumption
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch authentic recent system activity logs on mount
  useEffect(() => {
    let isMounted = true;
    async function fetchSystemActivities() {
      try {
        setLoadingActivities(true);
        const { createBrowserClientInstance } = await import("@/lib/supabase/browser");
        const supabase = createBrowserClientInstance();

        const { data: logs } = await supabase
          .from("audit_logs")
          .select("id, action, entity_type, created_at")
          .order("created_at", { ascending: false })
          .limit(5);

        if (isMounted && logs && logs.length > 0) {
          const mapped: SystemActivityItem[] = logs.map((l) => ({
            id: l.id,
            action: l.action,
            entityType: l.entity_type,
            timeStr: new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }));
          setActivities(mapped);
        } else if (isMounted) {
          setActivities([]);
        }
      } catch {
        if (isMounted) setActivities([]);
      } finally {
        if (isMounted) setLoadingActivities(false);
      }
    }

    void fetchSystemActivities();
    return () => {
      isMounted = false;
    };
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showActivity) {
        setShowActivity(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowActivity(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showActivity]);

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between no-print">
      {/* Left: Organization Code & Dhaka Time */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="hidden sm:inline font-mono uppercase bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-600">
            {HOSPITAL_METADATA.code} CENTRAL CLOUD
          </span>
        </div>

        <div className="hidden md:flex items-center text-xs text-slate-500 font-mono">
          <Clock className="w-3.5 h-3.5 mr-1 text-sky-600" />
          <span>Dhaka BST: <strong>{timeStr || "--:--"}</strong> ({dateStr || "--"})</span>
        </div>
      </div>

      {/* Right: Recent System Activity & Link to Public Portal */}
      <div className="flex items-center space-x-3">
        {/* Recent System Activity Menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowActivity(!showActivity)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition relative focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label="Recent System Activity"
            aria-expanded={showActivity}
            aria-haspopup="true"
          >
            <Activity className="w-4 h-4" />
          </button>

          {showActivity && (
            <div
              className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 text-xs z-50 animate-in fade-in zoom-in-95 duration-100"
              role="dialog"
              aria-label="Recent System Activity"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <span className="font-bold text-slate-900">Recent System Activity</span>
                <button
                  onClick={() => setShowActivity(false)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                  aria-label="Close activity log"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                {loadingActivities ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    Loading activity records...
                  </div>
                ) : activities.length > 0 ? (
                  activities.map((a) => (
                    <div
                      key={a.id}
                      className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 text-slate-700"
                    >
                      <div className="flex justify-between items-start">
                        <p className="font-semibold text-slate-900 leading-snug">
                          {a.action} on {a.entityType}
                        </p>
                        <span className="text-[10px] text-slate-400 ml-2 shrink-0">{a.timeStr}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Audit trail record logged in system ledger.
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-slate-500">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                    <p className="font-medium">No unread notifications or activity</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      System actions will appear here as staff perform tasks.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Public Website button */}
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px]"
        >
          <span className="hidden sm:inline mr-1">Public Website</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
    </header>
  );
}
