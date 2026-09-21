"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Bell,
  ExternalLink,
  Clock,
  CheckCircle2,
  X,
} from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";

interface SystemNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  type: "info" | "warning" | "success";
}

export function HospitalHeader() {
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
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

  // Fetch authentic system notices on mount or open
  useEffect(() => {
    let isMounted = true;
    async function fetchSystemNotices() {
      try {
        setLoadingNotifications(true);
        const { createBrowserClientInstance } = await import("@/lib/supabase/browser");
        const supabase = createBrowserClientInstance();

        // Query recent system audit logs to generate authentic operational notices
        const { data: logs } = await supabase
          .from("audit_logs")
          .select("id, action, entity_type, created_at")
          .order("created_at", { ascending: false })
          .limit(5);

        if (isMounted && logs && logs.length > 0) {
          const mapped: SystemNotification[] = logs.map((l) => ({
            id: l.id,
            title: `System Action: ${l.action}`,
            message: `Entity ${l.entity_type} updated by authorized staff.`,
            created_at: new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            read: false,
            type: "info" as const,
          }));
          setNotifications(mapped);
        } else if (isMounted) {
          setNotifications([]);
        }
      } catch {
        if (isMounted) setNotifications([]);
      } finally {
        if (isMounted) setLoadingNotifications(false);
      }
    }

    void fetchSystemNotices();
    return () => {
      isMounted = false;
    };
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showNotifications) {
        setShowNotifications(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

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

      {/* Right: Notifications & Link to Public Portal */}
      <div className="flex items-center space-x-3">
        {/* Notification Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition relative focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
            aria-expanded={showNotifications}
            aria-haspopup="true"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
            )}
          </button>

          {showNotifications && (
            <div
              className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 text-xs z-50 animate-in fade-in zoom-in-95 duration-100"
              role="dialog"
              aria-label="System Notifications"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <span className="font-bold text-slate-900">System Notifications</span>
                <div className="flex items-center space-x-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[11px] text-sky-600 hover:text-sky-700 font-medium"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                    aria-label="Close notifications"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
                {loadingNotifications ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    Loading notifications...
                  </div>
                ) : notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`p-2.5 rounded-xl border transition ${
                        n.read
                          ? "bg-slate-50 border-slate-100 text-slate-500"
                          : "bg-sky-50/70 border-sky-100 text-slate-800"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <p className="font-semibold text-slate-900 leading-snug">{n.title}</p>
                        <span className="text-[10px] text-slate-400 ml-2 shrink-0">{n.created_at}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">{n.message}</p>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-slate-500">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                    <p className="font-medium">No unread notifications</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Operational notifications will appear here when active.
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
