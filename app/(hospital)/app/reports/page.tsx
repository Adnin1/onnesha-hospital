"use client";

import React, { useState, useEffect } from "react";
import {
  Printer,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { InvoiceRecord } from "@/types/billing";
import { DoctorRecord } from "@/types/appointments";
import { getInvoicesAction } from "@/lib/billing/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { formatCurrencyBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";
import { getDhakaDateString } from "@/lib/datetime";

type PeriodFilter = "today" | "7days" | "30days" | "all";

export default function ReportsManagementPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("30days");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "due" | "void">("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function executeLoad() {
      try {
        const [invRes, docRes] = await Promise.all([
          getInvoicesAction({ limit: 500 }),
          getDoctorsAction(),
        ]);

        if (isMounted) {
          if (invRes.success && invRes.data) {
            setInvoices(invRes.data.invoices);
          } else if (!invRes.success) {
            setErrorMessage(invRes.error || "Failed to load billing invoices");
          }

          if (docRes.success && docRes.data) {
            setDoctors(docRes.data.doctors);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(err instanceof Error ? err.message : "Error loading reports telemetry");
          setLoading(false);
        }
      }
    }

    void executeLoad();
    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  // Date filtering logic based on Asia/Dhaka day boundaries
  const filteredInvoices = invoices.filter((inv) => {
    // Status filter
    if (statusFilter === "paid" && (inv.is_voided || (inv.due_amount && inv.due_amount > 0))) return false;
    if (statusFilter === "due" && (inv.is_voided || !inv.due_amount || inv.due_amount <= 0)) return false;
    if (statusFilter === "void" && !inv.is_voided) return false;

    // Period filter
    if (period === "all") return true;
    const invDate = new Date(inv.created_at);
    const now = new Date();

    if (period === "today") {
      const todayStr = getDhakaDateString();
      return inv.created_at.startsWith(todayStr);
    }
    if (period === "7days") {
      const diffMs = now.getTime() - invDate.getTime();
      return diffMs <= 7 * 24 * 60 * 60 * 1000;
    }
    if (period === "30days") {
      const diffMs = now.getTime() - invDate.getTime();
      return diffMs <= 30 * 24 * 60 * 60 * 1000;
    }
    return true;
  });

  // Calculate strict aggregates from filtered dataset
  const activeInvoices = filteredInvoices.filter((i) => !i.is_voided);
  const totalCollection = activeInvoices.reduce((acc, i) => acc + Number(i.paid_amount || 0), 0);
  const totalDues = activeInvoices.reduce((acc, i) => acc + Number(i.due_amount || 0), 0);
  const totalDiscounts = activeInvoices.reduce((acc, i) => acc + Number(i.discount_amount || 0), 0);
  const voidedCount = filteredInvoices.filter((i) => i.is_voided).length;
  const voidedSum = filteredInvoices
    .filter((i) => i.is_voided)
    .reduce((acc, i) => acc + Number(i.grand_total || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
        <div>
          <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
            Financial & Clinical Audits
          </span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Revenue Analytics & Executive Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified cashier collections, doctor consultation fees, outstanding receivables, and audit trails.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-700">
            <button
              onClick={() => setPeriod("today")}
              className={`px-2.5 py-1 rounded-lg transition ${period === "today" ? "bg-white font-bold text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
            >
              Today
            </button>
            <button
              onClick={() => setPeriod("7days")}
              className={`px-2.5 py-1 rounded-lg transition ${period === "7days" ? "bg-white font-bold text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
            >
              7 Days
            </button>
            <button
              onClick={() => setPeriod("30days")}
              className={`px-2.5 py-1 rounded-lg transition ${period === "30days" ? "bg-white font-bold text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
            >
              30 Days
            </button>
            <button
              onClick={() => setPeriod("all")}
              className={`px-2.5 py-1 rounded-lg transition ${period === "all" ? "bg-white font-bold text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
            >
              All Records
            </button>
          </div>

          {/* Status selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-700">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-2 py-1 rounded-lg transition ${statusFilter === "all" ? "bg-white font-bold text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
            >
              All Status
            </button>
            <button
              onClick={() => setStatusFilter("paid")}
              className={`px-2 py-1 rounded-lg transition ${statusFilter === "paid" ? "bg-white font-bold text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
            >
              Paid
            </button>
            <button
              onClick={() => setStatusFilter("due")}
              className={`px-2 py-1 rounded-lg transition ${statusFilter === "due" ? "bg-white font-bold text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
            >
              Due
            </button>
            <button
              onClick={() => setStatusFilter("void")}
              className={`px-2 py-1 rounded-lg transition ${statusFilter === "void" ? "bg-white font-bold text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
            >
              Void
            </button>
          </div>

          <button
            onClick={() => {
              setLoading(true);
              setErrorMessage(null);
              setRefreshTrigger((n) => n + 1);
            }}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Refresh reports"
            aria-label="Refresh financial reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px]"
          >
            <Printer className="w-4 h-4 mr-1.5 text-sky-400" />
            Print Audit Report
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs no-print">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Report Document */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs print-pad">
        <HospitalPrintHeader
          documentTitle="EXECUTIVE FINANCIAL & REVENUE AUDIT REPORT"
          documentNumber={`REP-${new Date().toISOString().slice(0, 10)}`}
          dateStr={new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        />

        {/* Audit Scope Notice */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 my-4 text-xs text-slate-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <span className="font-bold text-slate-800">Reporting Window:</span>{" "}
            <span className="uppercase font-mono text-sky-700">{period}</span>
            <span className="mx-2">•</span>
            <span className="font-bold text-slate-800">Invoices Evaluated:</span>{" "}
            <span className="font-mono text-slate-900">{filteredInvoices.length} records</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Timezone: Asia/Dhaka (BST UTC+6)
          </div>
        </div>

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 my-6">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Gross Collection</span>
            <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
              {loading ? "..." : formatCurrencyBDT(totalCollection)}
            </div>
            <span className="text-[10px] text-slate-400">Total cash + digital receipts</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Outstanding Receivables</span>
            <div className="text-2xl font-black text-amber-700 mt-1 font-mono">
              {loading ? "..." : formatCurrencyBDT(totalDues)}
            </div>
            <span className="text-[10px] text-slate-400">Patient pending dues</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Discounts Approved</span>
            <div className="text-2xl font-black text-slate-800 mt-1 font-mono">
              {loading ? "..." : formatCurrencyBDT(totalDiscounts)}
            </div>
            <span className="text-[10px] text-slate-400">Authorized waivers</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Void Adjustments</span>
            <div className="text-2xl font-black text-rose-700 mt-1 font-mono">
              {loading ? "..." : formatCurrencyBDT(voidedSum)}
            </div>
            <span className="text-[10px] text-slate-400">{voidedCount} voided invoices</span>
          </div>
        </div>

        {/* Doctor Consultation Roster & Fee Schedule */}
        <div className="my-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">
            Doctor OPD Consultation Roster & Official Fee Schedule
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200" aria-label="Doctor consultation fee schedule">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Doctor Name & Specialization</th>
                  <th className="p-2.5 text-center">Chamber Room</th>
                  <th className="p-2.5 text-right">Official OPD Fee</th>
                  <th className="p-2.5 text-center">Fee Status</th>
                  <th className="p-2.5 text-right">BMDC Number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-400">
                      Loading doctor rosters...
                    </td>
                  </tr>
                ) : doctors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-slate-400">
                      No doctors registered in database.
                    </td>
                  </tr>
                ) : (
                  doctors.map((doc) => {
                    const hasFee = typeof doc.opd_fee === "number" && doc.opd_fee > 0;
                    return (
                      <tr key={doc.id}>
                        <td className="p-2.5 font-semibold text-slate-900">
                          {doc.full_name}
                          <span className="block text-[10px] text-slate-500 font-normal">
                            {doc.specialization || "General Medicine"}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-700">
                          {doc.room_number ? `Room ${doc.room_number}` : "Chamber Unassigned"}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-800 font-bold">
                          {hasFee ? formatCurrencyBDT(doc.opd_fee) : "Unset"}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              hasFee ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {hasFee ? "CONFIGURED" : "PENDING"}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-600">
                          {doc.bmdc_reg_number || "A-N/A"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <HospitalPrintFooter />
      </div>
    </div>
  );
}
