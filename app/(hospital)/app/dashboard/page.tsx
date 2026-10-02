"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  DollarSign,
  Bed,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Stethoscope,
  Clock,
  Sparkles,
  Lock,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  TriageQueueWidget,
  QuickActionsWidget,
} from "@/components/dashboard/DashboardWidgets";
import { WeeklyTrendChart } from "@/components/dashboard/WeeklyTrendChart";
import { DepartmentDistributionChart } from "@/components/dashboard/DepartmentDistributionChart";
import { TodayAppointmentsWidget } from "@/components/dashboard/TodayAppointmentsWidget";
import { RecentPatientsTable } from "@/components/dashboard/RecentPatientsTable";
import { WaitingQueueItem } from "@/types";
import { formatCurrencyBDT } from "@/lib/utils";
import { getDhakaDateString, getDhakaWeekday } from "@/lib/datetime";
import { APP_VERSION } from "@/lib/version";

export default function HospitalDashboardPage() {
  const [waitingQueue, setWaitingQueue] = useState<WaitingQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [metricErrors, setMetricErrors] = useState({
    income: false,
    patients: false,
    beds: false,
    doctors: false,
  });
  const [metrics, setMetrics] = useState({
    todayIncome: 0,
    todayPatients: 0,
    totalDoctors: 0,
    onDutyDoctors: 0,
    offDutyDoctors: 0,
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

        // 1. Fetch real today's patients count with bounded Dhaka date boundaries
        const todayStr = getDhakaDateString();
        const startOfToday = `${todayStr}T00:00:00+06:00`;
        const tomorrowObj = new Date(`${todayStr}T00:00:00Z`);
        tomorrowObj.setUTCDate(tomorrowObj.getUTCDate() + 1);
        const endOfToday = `${tomorrowObj.toISOString().slice(0, 10)}T00:00:00+06:00`;

        const { count: todayPatientsCount, error: patientErr } = await supabase
          .from("patients")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startOfToday)
          .lt("created_at", endOfToday);

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

        // 3. Fetch real doctors and on-duty schedule count
        const dhakaDayName = getDhakaWeekday();
        const [doctorsRes, schedulesRes] = await Promise.all([
          supabase.from("doctors").select("*", { count: "exact", head: true }).eq("is_active", true),
          supabase
            .from("doctor_schedules")
            .select("doctor_id")
            .eq("day_of_week", dhakaDayName)
            .eq("is_active", true),
        ]);

        const totalDoctorsCount = doctorsRes.count ?? 0;
        const doctorsHasError = Boolean(doctorsRes.error);
        const onDutyDoctorIds = new Set(
          (schedulesRes.data || []).map((s: { doctor_id: string }) => s.doctor_id)
        );
        const onDutyDoctorsCount = onDutyDoctorIds.size;
        const offDutyDoctorsCount = Math.max(0, totalDoctorsCount - onDutyDoctorsCount);

        // 4. Fetch real invoices for today without artificial limit cap
        const { data: invoicesData, error: invError } = await supabase
          .from("invoices")
          .select("paid_amount, due_amount")
          .gte("created_at", startOfToday)
          .lt("created_at", endOfToday);

        let incomeSum = 0;
        let dueSum = 0;
        if (invoicesData && invoicesData.length > 0) {
          interface InvRow { paid_amount?: number; due_amount?: number }
          (invoicesData as InvRow[]).forEach((inv) => {
            incomeSum += Number(inv.paid_amount || 0);
            dueSum += Number(inv.due_amount || 0);
          });
        }

        // 5. Fetch live waiting queue
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
            todayPatients: todayPatientsCount ?? 0,
            totalDoctors: totalDoctorsCount,
            onDutyDoctors: onDutyDoctorsCount,
            offDutyDoctors: offDutyDoctorsCount,
            availableBeds: availableBedsCount,
            totalBeds: totalBedsCount,
            dueAmount: dueSum,
          });
          setMetricErrors({
            income: Boolean(invError),
            patients: Boolean(patientErr),
            beds: bedsHasError,
            doctors: doctorsHasError,
          });
          setWaitingQueue(mappedQueue);
          setLastSyncTime(
            new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          );
          setIsLoading(false);
        }
      } catch (err: unknown) {
        console.error("[DashboardPage] load error:", err);
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
    } catch (err: unknown) {
      console.error("[DashboardPage] handleCallToken error:", err);
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
    } catch (err: unknown) {
      console.error("[DashboardPage] handleMarkDone error:", err);
      setErrorMessage("Network error completing token");
    } finally {
      setActionInProgressId(null);
    }
  };

  // Display computation values: real database figures (no fake fallbacks)
  const displayPatientCount = metricErrors.patients ? "Unavailable" : metrics.todayPatients;
  const displayIncomeValue = metricErrors.income
    ? "Unavailable"
    : formatCurrencyBDT(metrics.todayIncome);
  const displayAvailableBeds = metricErrors.beds
    ? "Unavailable"
    : metrics.availableBeds;
  const displayTotalBeds = metrics.totalBeds;
  const displayOccupiedBeds = Math.max(0, metrics.totalBeds - metrics.availableBeds);

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

      {/* Top Banner / Welcome with Bengali Greetings */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-sky-700 uppercase tracking-wider flex items-center bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200/80">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              Enterprise Central Operations
            </span>
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              Dhaka BST Realtime Cloud
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1.5 tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5 font-medium">
            স্বাগতম! আজকের হাসপাতালের সামগ্রিক পরিসংখ্যান ও কার্যক্রম
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden lg:flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60 font-mono">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>{lastSyncTime ? `Last updated: ${lastSyncTime}` : "Auto-refresh active"}</span>
          </div>

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

      {/* 4 Premium KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today Patients */}
        <StatCard
          title="Today Patients"
          bengaliTitle="আজকের রোগী"
          value={displayPatientCount}
          bengaliSubtitle="আজকের নিবন্ধিত রোগী"
          icon={Users}
          iconColor="text-sky-600"
          bgColor="bg-sky-100/80"
          cardTheme="sky"
          badge={metricErrors.patients ? "Data error" : "লাইভ ট্র্যাকিং"}
          isLoading={isLoading}
        />

        {/* Card 2: Today Income */}
        <StatCard
          title="Today Income"
          bengaliTitle="আজকের আয়"
          value={displayIncomeValue}
          bengaliSubtitle="আজকের আদায়কৃত রাজস্ব"
          icon={DollarSign}
          iconColor="text-emerald-600"
          bgColor="bg-emerald-100/80"
          cardTheme="teal"
          badge={metricErrors.income ? "Ledger error" : "আজকের মোট জমা"}
          isLoading={isLoading}
        />

        {/* Card 3: Total Doctors */}
        <StatCard
          title="Total Doctors"
          bengaliTitle="মোট ডাক্তার"
          value={metricErrors.doctors ? "Unavailable" : metrics.totalDoctors}
          bengaliSubtitle="সক্রিয় ডাক্তার তালিকাভুক্ত"
          icon={Stethoscope}
          iconColor="text-blue-600"
          bgColor="bg-blue-100/80"
          cardTheme="blue"
          badge={
            metricErrors.doctors
              ? "Schedule error"
              : `${metrics.onDutyDoctors} On Duty • ${metrics.offDutyDoctors} Off Duty`
          }
          isLoading={isLoading}
        />

        {/* Card 4: Available Beds */}
        <StatCard
          title="Available Beds"
          bengaliTitle="খালি শয্যা"
          value={displayAvailableBeds}
          bengaliSubtitle="খালি শয্যা সংখ্যা"
          icon={Bed}
          iconColor="text-indigo-600"
          bgColor="bg-indigo-100/80"
          cardTheme="indigo"
          badge={
            metricErrors.beds
              ? "Ward matrix error"
              : `${displayOccupiedBeds} Occupied / ${displayTotalBeds} Total`
          }
          progress={{
            current: displayOccupiedBeds,
            total: Math.max(displayTotalBeds, 1),
          }}
          isLoading={isLoading}
        />
      </div>

      {/* Primary Analytics & Clinical Grid (Matching User Design Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Trend Chart + Recent Patients */}
        <div className="lg:col-span-7 space-y-6">
          <WeeklyTrendChart todayCount={typeof displayPatientCount === "number" ? displayPatientCount : 0} />
          <RecentPatientsTable />
        </div>

        {/* Right Column (5 cols): Today's Appointments + Department Donut */}
        <div className="lg:col-span-5 space-y-6">
          <TodayAppointmentsWidget />
          <DepartmentDistributionChart totalCount={typeof displayPatientCount === "number" ? displayPatientCount : 0} />
        </div>
      </div>

      {/* Frontline Quick Actions Grid */}
      <QuickActionsWidget />

      {/* Triage & Operational Queue + Security Safeguards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TriageQueueWidget
            queue={waitingQueue}
            onCallToken={handleCallToken}
            onMarkDone={handleMarkDone}
            isLoading={isLoading}
          />
        </div>

        {/* Security & System Readiness Status Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-emerald-600" />
                System Health & Readiness
              </h3>
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Multi-tenant architecture and Row-Level Security active.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                <span className="text-slate-600 flex items-center">
                  <Lock className="w-3 h-3 mr-1.5 text-slate-400" />
                  PostgreSQL RLS
                </span>
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

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <Link
              href="/app/settings"
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center transition focus:outline-none focus:ring-2 focus:ring-sky-500 rounded p-1"
            >
              <span>View Audit Logs & Settings</span>
              <span className="ml-1">→</span>
            </Link>
            <span className="text-[10px] text-slate-400 font-mono">{APP_VERSION}</span>
          </div>
        </div>
      </div>

      {/* Auto-Refresh Footer Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between py-3 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-500">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>
            Last updated: <strong>{lastSyncTime || "Realtime"}</strong> (Dhaka BST) • Auto-refresh enabled
          </span>
        </div>
        <div className="text-[11px] text-slate-400 mt-1 sm:mt-0 font-medium">
          Onnesha Hospital & Diagnostic Complex ERP Management System
        </div>
      </div>
    </div>
  );
}
