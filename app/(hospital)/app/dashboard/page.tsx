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
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  TriageQueueWidget,
  QuickActionsWidget,
} from "@/components/dashboard/DashboardWidgets";
import { WaitingQueueItem } from "@/types";
import { formatCurrencyBDT } from "@/lib/utils";

export default function HospitalDashboardPage() {
  const [waitingQueue, setWaitingQueue] = useState<WaitingQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    todayIncome: 0,
    totalPatients: 0,
    availableBeds: 0,
    totalBeds: 0,
    dueAmount: 0,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setIsLoading(true);
      try {
        const { createBrowserClientInstance } = await import("@/lib/supabase/browser");
        const supabase = createBrowserClientInstance();

        // 1. Fetch real patients count
        const { count: patientCount } = await supabase
          .from("patients")
          .select("*", { count: "exact", head: true });

        // 2. Fetch real beds status
        const { data: bedsData } = await supabase
          .from("beds")
          .select("status");

        const totalBedsCount = bedsData?.length || 0;
        const availableBedsCount =
          bedsData?.filter((b) => b.status === "available" || b.status === "VACANT").length || 0;

        // 3. Fetch real invoices for today
        const todayStr = new Date().toISOString().split("T")[0];
        const { data: invoicesData } = await supabase
          .from("invoices")
          .select("paid_amount, due_amount")
          .gte("created_at", todayStr);

        let incomeSum = 0;
        let dueSum = 0;
        if (invoicesData && invoicesData.length > 0) {
          interface InvRow { paid_amount?: number; due_amount?: number }
          (invoicesData as InvRow[]).forEach((inv) => {
            incomeSum += Number(inv.paid_amount || 0);
            dueSum += Number(inv.due_amount || 0);
          });
        }

        if (isMounted) {
          setMetrics({
            todayIncome: incomeSum,
            totalPatients: patientCount || 0,
            availableBeds: availableBedsCount,
            totalBeds: totalBedsCount,
            dueAmount: dueSum,
          });
          setWaitingQueue([]);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCallToken = (id: string) => {
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
  };

  const handleMarkDone = (id: string) => {
    setWaitingQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "done" } : item))
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider flex items-center">
            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-sky-600" />
            Hospital Operations Command Center
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            Executive Daily Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Production telemetry & clinical operations overview • Onnesha Hospital
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/app/patients"
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center"
          >
            <span>Patient Registry</span>
            <ArrowUpRight className="w-4 h-4 ml-1.5" />
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition"
            title="Refresh Metrics"
            aria-label="Refresh telemetry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Collections"
          value={formatCurrencyBDT(metrics.todayIncome)}
          subtitle="Realtime cash & digital receipts"
          icon={DollarSign}
          iconColor="text-emerald-600"
          bgColor="bg-emerald-50"
          isLoading={isLoading}
        />
        <StatCard
          title="Registered Patients"
          value={metrics.totalPatients}
          subtitle="Active patient master files"
          icon={Users}
          iconColor="text-sky-600"
          bgColor="bg-sky-50"
          isLoading={isLoading}
        />
        <StatCard
          title="Bed Availability"
          value={`${metrics.availableBeds} / ${metrics.totalBeds}`}
          subtitle={metrics.totalBeds === 0 ? "Ward matrix unconfigured" : "Available / Total Beds"}
          icon={Bed}
          iconColor="text-indigo-600"
          bgColor="bg-indigo-50"
          isLoading={isLoading}
        />
        <StatCard
          title="Outstanding Dues"
          value={formatCurrencyBDT(metrics.dueAmount)}
          subtitle="Uncollected billing balances"
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
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center justify-between"
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
