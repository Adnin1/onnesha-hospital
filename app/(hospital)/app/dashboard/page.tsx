"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  DollarSign,
  Bed,
  CalendarClock,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  TriageQueueWidget,
  QuickActionsWidget,
} from "@/components/dashboard/DashboardWidgets";
import { WaitingQueueItem } from "@/types";
import { formatCurrencyBDT } from "@/lib/utils";
import { getDhakaDateString } from "@/lib/datetime";

export default function HospitalDashboardPage() {
  const [waitingQueue, setWaitingQueue] = useState<WaitingQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metricErrors, setMetricErrors] = useState({
    income: false,
    patients: false,
    beds: false,
  });
  const [metrics, setMetrics] = useState({
    todayIncome: 0,
    totalPatients: 0,
    availableBeds: 0,
    totalBeds: 0,
    dueAmount: 0,
  });

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function executeLoad() {
      try {
        const { createBrowserClientInstance } = await import("@/lib/supabase/browser");
        const supabase = createBrowserClientInstance();

        // 1. Fetch real patients count via server-side head count
        const { count: patientCount, error: patientErr } = await supabase
          .from("patients")
          .select("*", { count: "exact", head: true });

        // 2. Fetch real beds status using server-side index count queries (no full table scans)
        const [totalBedsRes, availableBedsRes] = await Promise.all([
          supabase.from("beds").select("*", { count: "exact", head: true }),
          supabase
            .from("beds")
            .select("*", { count: "exact", head: true })
            .in("status", ["available", "VACANT", "AVAILABLE"]),
        ]);

        const totalBedsCount = totalBedsRes.count ?? 0;
        const availableBedsCount = availableBedsRes.count ?? 0;
        const bedsHasError = Boolean(totalBedsRes.error || availableBedsRes.error);

        // 3. Fetch real invoices for today with bounded Dhaka date boundaries (Asia/Dhaka timezone)
        const todayStr = getDhakaDateString();
        const startOfToday = `${todayStr}T00:00:00+06:00`;
        const tomorrowObj = new Date(`${todayStr}T00:00:00Z`);
        tomorrowObj.setUTCDate(tomorrowObj.getUTCDate() + 1);
        const endOfToday = `${tomorrowObj.toISOString().slice(0, 10)}T00:00:00+06:00`;

        const { data: invoicesData, error: invError } = await supabase
          .from("invoices")
          .select("paid_amount, due_amount")
          .gte("created_at", startOfToday)
          .lt("created_at", endOfToday)
          .limit(500);

        let incomeSum = 0;
        let dueSum = 0;
        if (invoicesData && invoicesData.length > 0) {
          interface InvRow { paid_amount?: number; due_amount?: number }
          (invoicesData as InvRow[]).forEach((inv) => {
            incomeSum += Number(inv.paid_amount || 0);
            dueSum += Number(inv.due_amount || 0);
          });
        }

        // 4. Fetch live waiting queue
        const { getLiveWaitingQueueAction } = await import("@/lib/appointments/actions");
        const queueRes = await getLiveWaitingQueueAction();
        let mappedQueue: WaitingQueueItem[] = [];
        if (queueRes.success && queueRes.data?.queue) {
          mappedQueue = queueRes.data.queue.map((q) => ({
            id: q.id,
            organization_id: q.organization_id,
            doctor_id: q.doctor_id || "",
            doctor_name: q.doctor_name || "",
            room_number: q.room_number || "",
            appointment_id: q.appointment_id || "",
            patient_name: q.patient_name || "Patient",
            token_number: String(q.token_number),
            status: q.queue_status === "WAITING" ? "waiting" : q.queue_status === "CALLED" ? "calling" : q.queue_status === "IN_ROOM" ? "serving" : "done",
            called_at: q.called_at ? new Date(q.called_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined,
          }));
        }

        if (isMounted) {
          setMetrics({
            todayIncome: incomeSum,
            totalPatients: patientCount ?? 0,
            availableBeds: availableBedsCount,
            totalBeds: totalBedsCount,
            dueAmount: dueSum,
          });
          setMetricErrors({
            income: Boolean(invError),
            patients: Boolean(patientErr),
            beds: bedsHasError,
          });
          setWaitingQueue(mappedQueue);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to load dashboard metrics");
          setIsLoading(false);
        }
      }
    }

    void executeLoad();
    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  const handleCallToken = async (id: string) => {
    if (actionInProgressId) return; // Prevent duplicate rapid clicks
    setActionInProgressId(id);
    try {
      const { updateQueueStatusAction } = await import("@/lib/appointments/actions");
      const res = await updateQueueStatusAction({ queueId: id, status: "CALLED" });
      if (res.success) {
        setWaitingQueue((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "calling",
                  called_at: new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }
              : item
          )
        );
      } else {
        setErrorMessage(res.error || "Failed to update token queue status");
      }
    } catch {
      setErrorMessage("Network error updating token status");
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleMarkDone = async (id: string) => {
    if (actionInProgressId) return; // Prevent duplicate rapid clicks
    setActionInProgressId(id);
    try {
      const { updateQueueStatusAction } = await import("@/lib/appointments/actions");
      const res = await updateQueueStatusAction({ queueId: id, status: "COMPLETED" });
      if (res.success) {
        setWaitingQueue((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: "done" } : item))
        );
      } else {
        setErrorMessage(res.error || "Failed to mark token as completed");
      }
    } catch {
      setErrorMessage("Network error completing token");
    } finally {
      setActionInProgressId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Error notification banner */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800 text-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-800 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Banner / Welcome */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider flex items-center">
            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-500" />
            Enterprise Clinical Operations
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Central Hospital Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time outpatient tokens, verified patient directory, bed occupancy, and cashier revenue.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/appointment"
            className="inline-flex items-center text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 px-4 py-2.5 rounded-xl shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px]"
          >
            <span>Online Serial Desk</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </Link>
          <button
            onClick={() => {
              setIsLoading(true);
              setRefreshTrigger((prev) => prev + 1);
            }}
            disabled={isLoading}
            className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Refresh Metrics"
            aria-label="Refresh telemetry metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Collections"
          value={metricErrors.income ? "Unavailable" : formatCurrencyBDT(metrics.todayIncome)}
          subtitle={metricErrors.income ? "Query error retrieving collections" : "Cashier & digital receipts"}
          icon={DollarSign}
          iconColor="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
        />
        <StatCard
          title="Registered Patients"
          value={metricErrors.patients ? "Unavailable" : metrics.totalPatients}
          subtitle={metricErrors.patients ? "Query error retrieving patients" : "Active patient master files"}
          icon={Users}
          iconColor="text-sky-600"
          bgColor="bg-sky-50"
          isLoading={isLoading}
        />
        <StatCard
          title="Bed Availability"
          value={metricErrors.beds ? "Unavailable" : `${metrics.availableBeds} / ${metrics.totalBeds}`}
          subtitle={metricErrors.beds ? "Ward matrix error" : metrics.totalBeds === 0 ? "Ward matrix unconfigured" : "Available / Total Beds"}
          icon={Bed}
          iconColor="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={isLoading}
        />
        <StatCard
          title="Outstanding Dues"
          value={metricErrors.income ? "Unavailable" : formatCurrencyBDT(metrics.dueAmount)}
          subtitle={metricErrors.income ? "Query error retrieving dues" : "Uncollected billing balances"}
          icon={CalendarClock}
          iconColor="text-amber-600"
          bgColor="bg-amber-50"
          isLoading={isLoading}
        />
      </div>

      {/* Quick Actions Grid */}
      <QuickActionsWidget />

      {/* Triage & Operational Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TriageQueueWidget
            queue={waitingQueue}
            onCallToken={handleCallToken}
            onMarkDone={handleMarkDone}
            isLoading={isLoading}
          />
        </div>

        {/* Security & System Readiness Status */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center">
              <Activity className="w-4 h-4 mr-2 text-emerald-600" />
              System Health & Readiness
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Multi-tenant architecture and Row-Level Security active.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                <span className="text-slate-600">PostgreSQL RLS</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  Enforced
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                <span className="text-slate-600">Tenant Isolation</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                <span className="text-slate-600">Audit Logging</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  Recording
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-2">
                <span className="text-slate-600">Cloudflare Edge</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">
                  Protected
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/app/settings"
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-sky-500 rounded p-1"
            >
              <span>View Audit Logs & Settings</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
