"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Printer,
  RefreshCw,
  AlertCircle,
  Download,
  Calendar,
  DollarSign,
  TrendingUp,
  CreditCard,
  BarChart3,
  FileText,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Building2,
  Percent,
  Search,
  Stethoscope,
  Clock,
} from "lucide-react";
import { InvoiceRecord } from "@/types/billing";
import { DoctorRecord } from "@/types/appointments";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { getTrialBalanceAction, TrialBalanceRow } from "@/lib/accounting/actions";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";
import {
  FinancialPeriod,
  DEPARTMENT_MAP,
  PAYMENT_METHOD_MAP,
  getDhakaDateRange,
  generateFinancialReportCSV,
} from "@/lib/reports/financial";
import {
  getFinancialDashboardAggregatesAction,
  getPaymentChannelBreakdownAction,
  getDepartmentRevenueBreakdownAction,
  getAccountsReceivableAgingAction,
  getProfitAndLossSummaryAction,
  getPaginatedReportInvoicesAction,
  FinancialDashboardAggregatesData,
  PaymentChannelBreakdownData,
  DepartmentRevenueBreakdownData,
  AccountsReceivableAgingData,
  ProfitAndLossSummaryData,
} from "@/lib/reports/actions";

export default function ReportsManagementPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<FinancialPeriod>("this_month");
  const [reportingBasis, setReportingBasis] = useState<"accrual" | "cash">("accrual");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "due" | "void">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [activeTab, setActiveTab] = useState<
    "overview" | "departments" | "channels" | "ar_aging" | "trends" | "pnl" | "dues" | "doctors"
  >("overview");
  const [showHowToGuide, setShowHowToGuide] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Authoritative Server-Aggregated State
  const [aggregates, setAggregates] = useState<FinancialDashboardAggregatesData>({
    totalInvoices: 0,
    activeInvoices: 0,
    voidedInvoices: 0,
    grossRevenue: 0,
    totalDiscounts: 0,
    netRevenue: 0,
    grossCollections: 0,
    totalRefunds: 0,
    netCollections: 0,
    historicalArDue: 0,
    collectionRatePct: 0,
    dueRatePct: 0,
  });

  const [departments, setDepartments] = useState<DepartmentRevenueBreakdownData[]>([]);
  const [channels, setChannels] = useState<PaymentChannelBreakdownData[]>([]);
  const [arAging, setArAging] = useState<AccountsReceivableAgingData>({
    asOfDate: new Date().toISOString(),
    totalInvoicesDue: 0,
    totalAR: 0,
    current_0_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_91_120: 0,
    days_120_plus: 0,
    reconciliationDifference: 0,
    isReconciled: true,
  });

  const [pnlSummary, setPnlSummary] = useState<ProfitAndLossSummaryData>({
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    accrualBasis: {
      grossRevenue: 0,
      discounts: 0,
      netRecognizedRevenue: 0,
      operatingExpenses: 0,
      netOperatingSurplus: 0,
      expenseBreakdown: [],
    },
    cashMovement: {
      patientCollections: 0,
      totalCashInflow: 0,
      refunds: 0,
      operatingDisbursements: 0,
      totalCashOutflow: 0,
      netCashMovement: 0,
    },
  });

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [totalInvoicesCount, setTotalInvoicesCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);

  // Compute exact Asia/Dhaka boundaries for current filter
  const dateBounds = useMemo(() => {
    return getDhakaDateRange(period, customStart, customEnd);
  }, [period, customStart, customEnd]);

  useEffect(() => {
    let isMounted = true;

    async function executeLoad() {
      try {
        setLoading(true);
        const [aggRes, depRes, chRes, arRes, pnlRes, invRes, docRes, tbRes] = await Promise.all([
          getFinancialDashboardAggregatesAction({
            startDate: dateBounds.startIso,
            endDate: dateBounds.endIso,
          }),
          getDepartmentRevenueBreakdownAction({
            startDate: dateBounds.startIso,
            endDate: dateBounds.endIso,
          }),
          getPaymentChannelBreakdownAction({
            startDate: dateBounds.startIso,
            endDate: dateBounds.endIso,
          }),
          getAccountsReceivableAgingAction({
            asOfDate: dateBounds.endIso,
          }),
          getProfitAndLossSummaryAction({
            startDate: dateBounds.startIso,
            endDate: dateBounds.endIso,
          }),
          getPaginatedReportInvoicesAction({
            page,
            pageSize,
            status: statusFilter,
            searchQuery,
            startDate: period === "all" ? undefined : dateBounds.startIso,
            endDate: period === "all" ? undefined : dateBounds.endIso,
          }),
          getDoctorsAction(),
          getTrialBalanceAction(),
        ]);

        if (!isMounted) return;

        if (aggRes.success && aggRes.data) {
          setAggregates(aggRes.data);
        } else if (!aggRes.success) {
          setErrorMessage(aggRes.error || "Failed to load financial dashboard aggregates");
        }

        if (depRes.success && depRes.data) {
          setDepartments(depRes.data);
        }

        if (chRes.success && chRes.data) {
          setChannels(chRes.data);
        }

        if (arRes.success && arRes.data) {
          setArAging(arRes.data);
        }

        if (pnlRes.success && pnlRes.data) {
          setPnlSummary(pnlRes.data);
        }

        if (invRes.success && invRes.data) {
          setInvoices(invRes.data.invoices);
          setTotalInvoicesCount(invRes.data.totalCount);
          setTotalPages(invRes.data.totalPages || 1);
        } else if (!invRes.success) {
          setErrorMessage(invRes.error || "Failed to load paginated billing invoices");
        }

        if (docRes.success && docRes.data) {
          setDoctors(docRes.data.doctors);
        }

        if (tbRes.success && tbRes.data) {
          setTrialBalance(tbRes.data.trialBalance);
        }

        setLoading(false);
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
  }, [
    period,
    customStart,
    customEnd,
    page,
    statusFilter,
    searchQuery,
    dateBounds.startIso,
    dateBounds.endIso,
    refreshTrigger,
  ]);

  // Reset page to 1 when search or status filter changes
  const handleFilterChange = (newStatus: "all" | "paid" | "due" | "void") => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setPage(1);
  };

  const handlePeriodChange = (newPeriod: FinancialPeriod) => {
    setPeriod(newPeriod);
    setPage(1);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const csv = generateFinancialReportCSV(invoices, {
      periodLabel: period.toUpperCase(),
      organizationName: "Onnesha Hospital & Diagnostic Complex",
      reportingBasis: reportingBasis === "cash" ? "Cash Collection Basis" : "Accrual Accounting Basis",
      generatedAt: new Date().toISOString(),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `Onnesha_Hospital_Financial_Report_${period}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalOperatingExpenses =
    pnlSummary.accrualBasis.operatingExpenses > 0
      ? pnlSummary.accrualBasis.operatingExpenses
      : trialBalance
          .filter((row) => row.account_type === "EXPENSE")
          .reduce((sum, row) => sum + Math.abs(Number(row.net_balance || 0)), 0);

  const netSurplus =
    pnlSummary.accrualBasis.netOperatingSurplus !== 0
      ? pnlSummary.accrualBasis.netOperatingSurplus
      : aggregates.netRevenue - totalOperatingExpenses;

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Center */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
              Financial Intelligence & Accounting
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
              Asia/Dhaka (BST, UTC+6)
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">
              ERP v1.1.11
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1 tracking-tight">
            হসপিটাল আয়-ব্যয় ও সার্বিক আর্থিক বিবরণী
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Verified cashier collections, patient dues, department revenue, operating expenses, and audit ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => setShowHowToGuide(!showHowToGuide)}
            className="inline-flex items-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs px-3.5 py-2 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[36px]"
          >
            <HelpCircle className="w-4 h-4 mr-1.5 text-indigo-600" />
            {showHowToGuide ? "গাইড বন্ধ করুন" : "হিসাব পরিচালনা গাইড"}
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs px-3.5 py-2 rounded-xl border border-emerald-200 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[36px]"
            title="Download CSV Spreadsheet for Excel"
          >
            <Download className="w-4 h-4 mr-1.5 text-emerald-600" />
            CSV এক্সপোর্ট
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-2xs transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px]"
          >
            <Printer className="w-4 h-4 mr-1.5 text-sky-400" />
            প্রিন্ট অডিট রিপোর্ট
          </button>

          <button
            onClick={() => {
              setLoading(true);
              setErrorMessage(null);
              setRefreshTrigger((n) => n + 1);
            }}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-sky-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
            title="Refresh reports"
            aria-label="Refresh financial reports"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Expandable Financial Operations Guide Banner */}
      {showHowToGuide && (
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-indigo-700 no-print transition-all">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-wider">
                Management SOP Guide
              </span>
              <h2 className="text-lg font-bold text-white mt-1">
                হসপিটালের টাকা-পয়সার হিসাব পরিচালনা ও চেক করার সম্পূর্ণ নিয়মাবলি
              </h2>
            </div>
            <button
              onClick={() => setShowHowToGuide(false)}
              className="text-slate-400 hover:text-white p-1 text-sm rounded-lg"
            >
              ✕ বন্ধ
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs mt-3">
            <div className="bg-white/10 p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm mb-1.5">
                <DollarSign className="w-4 h-4" />
                ১. টাকা বা বিল যোগ করবেন কিভাবে? (Add)
              </div>
              <p className="text-slate-300 leading-relaxed mb-3">
                রোগী আসলে <Link href="/app/billing" className="underline font-bold text-white hover:text-sky-300">Billing & Cashier</Link> পেজে যান। &quot;নতুন ইনভয়েস তৈরি&quot; বাটনে ক্লিক করে রোগীর নাম, সার্ভিস (ওপিডি/ল্যাব/ওষুধ/বেড) যোগ করুন এবং নগদ বা বিকাশে টাকা নিয়ে সাথে সাথে ৮০ মিমি থার্মাল বা A4 রিসিট প্রিন্ট দিন।
              </p>
              <Link
                href="/app/billing"
                className="inline-flex items-center text-[11px] font-semibold text-emerald-300 hover:underline"
              >
                বিলিং কাউন্টারে যান <ChevronRight className="w-3 h-3 ml-0.5" />
              </Link>
            </div>

            <div className="bg-white/10 p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 font-bold text-sky-300 text-sm mb-1.5">
                <CheckCircle2 className="w-4 h-4" />
                ২. ক্যাশ ও হিসাব চেক করবেন কিভাবে? (Check)
              </div>
              <p className="text-slate-300 leading-relaxed mb-3">
                দিনের শেষে ক্যাশিয়ার কত টাকা জমা নিয়েছেন তা মেলাতে <Link href="/app/billing/reconciliation" className="underline font-bold text-white hover:text-sky-300">Cash Register</Link>-এ যান। ক্যাশ ড্রয়ারের টাকা গুনে সিস্টেমের সাথে মিলিয়ে ক্লোজ করুন। ডাবল-এন্ট্রি হিসাবের জন্য <Link href="/app/accounting" className="underline font-bold text-white hover:text-sky-300">Accounting</Link> দেখুন।
              </p>
              <Link
                href="/app/billing/reconciliation"
                className="inline-flex items-center text-[11px] font-semibold text-sky-300 hover:underline"
              >
                ক্যাশ রিকনসিলিয়েশন দেখুন <ChevronRight className="w-3 h-3 ml-0.5" />
              </Link>
            </div>

            <div className="bg-white/10 p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 font-bold text-purple-300 text-sm mb-1.5">
                <BarChart3 className="w-4 h-4" />
                ৩. সাপ্তাহিক, মাসিক ও বার্ষিক রিপোর্ট
              </div>
              <p className="text-slate-300 leading-relaxed mb-3">
                উপরের ফিল্টারে &quot;চলতি সপ্তাহ&quot;, &quot;চলতি মাস&quot;, &quot;গত মাস&quot; বা &quot;চলতি বছর&quot; সিলেক্ট করুন। মুহূর্তের মধ্যে মোট কত টাকা বিল হয়েছে, কত টাকা আদায় হয়েছে, কত বকেয়া রয়েছে এবং হসপিটালের লাভ/ক্ষতি (P&L) এক নজরে স্ক্রিনে দেখা যাবে।
              </p>
              <span className="text-[11px] font-semibold text-purple-300">
                ফিল্টার বাটনে ক্লিক করে সময় পরিবর্তন করুন
              </span>
            </div>

            <div className="bg-white/10 p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 font-bold text-amber-300 text-sm mb-1.5">
                <AlertCircle className="w-4 h-4" />
                ৪. ভুল হলে বিল এডিট বা বাতিল (Void)
              </div>
              <p className="text-slate-300 leading-relaxed mb-3">
                ভুল এন্ট্রি হলে বিলিং পেজে গিয়ে ইনভয়েসটি ওপেন করুন। হাসপাতাল পলিসি অনুযায়ী উপযুক্ত কারণ লিখে &quot;Void Invoice&quot; করুন। প্রতিটি বাতিলের তথ্য অডিট লগে সুরক্ষিত থাকে যেন কোনো অসদুপায় অবলম্বন না করা যায়।
              </p>
              <Link
                href="/app/settings/audit-logs"
                className="inline-flex items-center text-[11px] font-semibold text-amber-300 hover:underline"
              >
                ফরেনসিক অডিট লগ দেখুন <ChevronRight className="w-3 h-3 ml-0.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Period Ribbon */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Period Selector */}
          <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-700">
            <button
              onClick={() => handlePeriodChange("today")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "today" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              আজকের দিন (Today)
            </button>
            <button
              onClick={() => handlePeriodChange("this_week")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "this_week" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              চলতি সপ্তাহ (Week)
            </button>
            <button
              onClick={() => handlePeriodChange("this_month")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "this_month" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              চলতি মাস (Month)
            </button>
            <button
              onClick={() => handlePeriodChange("last_month")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "last_month" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              গত মাস (Last Month)
            </button>
            <button
              onClick={() => handlePeriodChange("this_year")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "this_year" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              চলতি বছর (Annual)
            </button>
            <button
              onClick={() => handlePeriodChange("all")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "all" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              সব সময় (All Time)
            </button>
            <button
              onClick={() => handlePeriodChange("custom")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "custom" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              নির্দিষ্ট তারিখ (Custom)
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-700">
            <button
              onClick={() => handleFilterChange("all")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                statusFilter === "all" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              সব স্ট্যাটাস
            </button>
            <button
              onClick={() => handleFilterChange("paid")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                statusFilter === "paid" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              পরিশোধিত (Paid)
            </button>
            <button
              onClick={() => handleFilterChange("due")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                statusFilter === "due" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              বকেয়া (Due)
            </button>
            <button
              onClick={() => handleFilterChange("void")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                statusFilter === "void" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              বাতিল (Void)
            </button>
          </div>

          {/* Basis Toggle: Accrual vs Cash */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <span className="text-[10px] text-slate-500 font-bold px-1.5 uppercase">ভিত্তি:</span>
            <button
              onClick={() => setReportingBasis("accrual")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                reportingBasis === "accrual" ? "bg-white font-bold text-sky-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              অ্যাকাউন্টিং (Accrual)
            </button>
            <button
              onClick={() => setReportingBasis("cash")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                reportingBasis === "cash" ? "bg-white font-bold text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              নগদ আদায় (Cash)
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {period === "custom" ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                শুরুর তারিখ:
              </span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => {
                  setCustomStart(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <span className="font-semibold text-slate-600">শেষ তারিখ:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => {
                  setCustomEnd(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          ) : (
            <div className="text-xs text-slate-500 font-medium">
              নির্বাচিত সময়কাল: <span className="font-bold text-slate-800 uppercase">{period.replace("_", " ")}</span> ({totalInvoicesCount} টি রেকর্ড পাওয়া গেছে)
            </div>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="ইনভয়েস নং দিয়ে খুঁজুন..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-800 text-xs no-print">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 6 Executive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Total Billed */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
            <span>মোট বিলকৃত টাকা</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-black text-slate-900 mt-1.5 font-mono">
            {loading ? "..." : formatCurrencyBDT(aggregates.grossRevenue)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            মোট সক্রিয় ইনভয়েস: {aggregates.activeInvoices}
          </div>
        </div>

        {/* Total Collection */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
            <span>মোট নগদ ও ডিজিটাল আদায়</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700 mt-1.5 font-mono">
            {loading ? "..." : formatCurrencyBDT(aggregates.netCollections)}
          </div>
          <div className="text-[10px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
            <span className="px-1.5 py-0.2 bg-emerald-50 rounded">
              {aggregates.collectionRatePct}% আদায় সম্পন্ন
            </span>
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
            <span>বকেয়া / পাওনা টাকা</span>
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-700 mt-1.5 font-mono">
            {loading ? "..." : formatCurrencyBDT(aggregates.historicalArDue)}
          </div>
          <div className="text-[10px] font-semibold text-amber-600 mt-1 flex items-center gap-1">
            <span className="px-1.5 py-0.2 bg-amber-50 rounded">
              {aggregates.dueRatePct}% বকেয়া অনুপাত
            </span>
          </div>
        </div>

        {/* Discounts Approved */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
            <span>অনুমোদিত ছাড় / ডিসকাউন্ট</span>
            <Percent className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-black text-purple-700 mt-1.5 font-mono">
            {loading ? "..." : formatCurrencyBDT(aggregates.totalDiscounts)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            বিশেষ ছাড় ও ওয়েভার
          </div>
        </div>

        {/* Operating Expenses */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
            <span>হসপিটালের মোট খরচ</span>
            <TrendingUp className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-black text-rose-600 mt-1.5 font-mono">
            {loading ? "..." : formatCurrencyBDT(totalOperatingExpenses)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            বেতন, সরবরাহ ও ব্যবস্থাপনা
          </div>
        </div>

        {/* Net Operating Surplus / Profit */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
            <span>নীট উদ্বৃত্ত / লাভ</span>
            <DollarSign className={`w-4 h-4 ${netSurplus >= 0 ? "text-emerald-600" : "text-rose-600"}`} />
          </div>
          <div className={`text-xl font-black mt-1.5 font-mono ${netSurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {loading ? "..." : formatCurrencyBDT(netSurplus)}
          </div>
          <div className="text-[10px] font-semibold mt-1">
            <span className={`px-1.5 py-0.2 rounded ${netSurplus >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {netSurplus >= 0 ? "লাভজনক অবস্থান" : "ঘাটতি / ঋণাত্মক"}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (7 Reporting Views) */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 pb-2 no-print">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "overview"
              ? "bg-sky-600 text-white shadow-2xs"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          সার্বিক ইনভয়েস লেজার
        </button>

        <button
          onClick={() => setActiveTab("departments")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "departments"
              ? "bg-sky-600 text-white shadow-2xs"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          বিভাগভিত্তিক আয় (Departmental)
        </button>

        <button
          onClick={() => setActiveTab("channels")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "channels"
              ? "bg-sky-600 text-white shadow-2xs"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          পেমেন্ট মাধ্যম (Payment Channels)
        </button>

        <button
          onClick={() => setActiveTab("pnl")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "pnl"
              ? "bg-sky-600 text-white shadow-2xs"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          লাভ-ক্ষতি বিবরণী (Profit & Loss)
        </button>

        <button
          onClick={() => setActiveTab("ar_aging")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "ar_aging"
              ? "bg-sky-600 text-white shadow-2xs"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          বকেয়া বয়স ও অডিট (AR Aging)
        </button>

        <button
          onClick={() => setActiveTab("dues")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "dues"
              ? "bg-sky-600 text-white shadow-2xs"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          বকেয়া খতিয়ান (Dues Ledger)
        </button>

        <button
          onClick={() => setActiveTab("doctors")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "doctors"
              ? "bg-sky-600 text-white shadow-2xs"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          ডাক্তার ওপিডি রোস্টার
        </button>
      </div>

      {/* Main Tab Content Display */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 print:p-0 print:border-none">
        {/* Printable Formal Header */}
        <div className="mb-6">
          <HospitalPrintHeader
            documentTitle="হাসপাতাল আয়-ব্যয় ও সামগ্রিক আর্থিক বিবরণী অডিট"
            documentSubtitle={`সময়কাল: ${period.toUpperCase()} • হিসাবের ভিত্তি: ${reportingBasis === "cash" ? "Cash Collection Basis" : "Accrual Accounting Basis"}`}
          />
          <div className="text-[11px] text-slate-500 font-mono">
            Timezone: Asia/Dhaka (BST UTC+6) • Official ERP Records
          </div>
        </div>

        {/* TAB 1: OVERVIEW & RECENT INVOICE LEDGER */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                সার্বভৌম ইনভয়েস খতিয়ান (পৃষ্ঠা {page} / {totalPages} — মোট {totalInvoicesCount} টি রেকর্ড)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200" aria-label="Invoice ledger">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">ইনভয়েস নং</th>
                    <th className="p-2.5">তারিখ</th>
                    <th className="p-2.5">রোগীর নাম ও আইডি</th>
                    <th className="p-2.5 text-right">মোট বিল</th>
                    <th className="p-2.5 text-right">পরিশোধ</th>
                    <th className="p-2.5 text-right">বকেয়া</th>
                    <th className="p-2.5 text-center">স্ট্যাটাস</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400">
                        হিসাব লোড হচ্ছে...
                      </td>
                    </tr>
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400">
                        নির্বাচিত সময়কালে কোনো ইনভয়েস রেকর্ড পাওয়া যায়নি।
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr key={inv.id} className={inv.is_voided ? "bg-rose-50/50" : "hover:bg-slate-50"}>
                        <td className="p-2.5 font-mono font-bold text-slate-900">
                          {inv.invoice_number}
                        </td>
                        <td className="p-2.5 font-mono text-slate-600">
                          {formatDateBDT(inv.created_at)}
                        </td>
                        <td className="p-2.5">
                          <span className="font-semibold text-slate-800">{inv.patient?.full_name || "অজ্ঞাত রোগী"}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">
                            {inv.patient?.patient_code || "N/A"} • {inv.patient?.phone || ""}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-slate-900">
                          {formatCurrencyBDT(inv.grand_total)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatCurrencyBDT(inv.paid_amount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-amber-700">
                          {Number(inv.due_amount || 0) > 0 ? formatCurrencyBDT(inv.due_amount) : "০"}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inv.is_voided
                                ? "bg-rose-100 text-rose-700"
                                : inv.status === "PAID"
                                ? "bg-emerald-100 text-emerald-700"
                                : inv.status === "PARTIAL"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {inv.is_voided ? "VOID" : inv.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Server-Side Pagination Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-slate-200 no-print text-xs text-slate-600">
              <div>
                রেকর্ড: <span className="font-bold text-slate-900">{totalInvoicesCount > 0 ? (page - 1) * pageSize + 1 : 0}</span> থেকে{" "}
                <span className="font-bold text-slate-900">{Math.min(page * pageSize, totalInvoicesCount)}</span> (মোট {totalInvoicesCount})
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  পূর্ববর্তী
                </button>
                <span className="px-2 font-mono font-semibold">
                  পৃষ্ঠা {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold"
                >
                  পরবর্তী
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEPARTMENTAL REVENUE */}
        {activeTab === "departments" && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              ক্লিনিক্যাল ও সার্ভিস বিভাগভিত্তিক মোট রাজস্ব আয়
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">বিভাগের নাম (Department)</th>
                    <th className="p-2.5 text-center">সার্ভিস সংখ্যা (Items)</th>
                    <th className="p-2.5 text-right">মোট আয় (Revenue BDT)</th>
                    <th className="p-2.5 text-right">শতকরা অনুপাত (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-slate-400">
                        নির্বাচিত সময়সীমায় কোনো বিভাগীয় আয় রেকর্ড পাওয়া যায়নি।
                      </td>
                    </tr>
                  ) : (
                    departments.map((dept) => (
                      <tr key={dept.category} className="hover:bg-slate-50">
                        <td className="p-2.5 font-semibold text-slate-800">
                          {DEPARTMENT_MAP[dept.category]?.labelBn || dept.category}
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {DEPARTMENT_MAP[dept.category]?.labelEn || dept.category}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-600">
                          {dept.itemCount}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                          {formatCurrencyBDT(dept.totalRevenue)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-sky-700">
                          {dept.percentageOfTotal}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: PAYMENT CHANNELS */}
        {activeTab === "channels" && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              নগদ ও ডিজিটাল আদায় চ্যানেল বিশ্লেষণ (Payment Gateways & Counter Cash)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">পেমেন্ট মাধ্যম</th>
                    <th className="p-2.5 text-center">লেনদেন সংখ্যা (Count)</th>
                    <th className="p-2.5 text-right">আদায়ের পরিমাণ (BDT)</th>
                    <th className="p-2.5 text-right">শতকরা অনুপাত (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {channels.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-slate-400">
                        নির্বাচিত সময়ে কোনো আদায় রেকর্ড পাওয়া যায়নি।
                      </td>
                    </tr>
                  ) : (
                    channels.map((chan) => (
                      <tr key={chan.method} className="hover:bg-slate-50">
                        <td className="p-2.5 font-semibold text-slate-800">
                          {PAYMENT_METHOD_MAP[chan.method]?.labelBn || chan.method}
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {PAYMENT_METHOD_MAP[chan.method]?.labelEn || chan.method}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-600">
                          {chan.transactionCount}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatCurrencyBDT(chan.totalCollected)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-emerald-800">
                          {chan.percentageOfTotal}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: PROFIT & LOSS (ACCRUAL & CASH STATEMENT) */}
        {activeTab === "pnl" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  আয়-ব্যয় ও লাভ-ক্ষতি বিবরণী (Profit & Loss Statement)
                </h3>
                <p className="text-xs text-slate-500">
                  অ্যাকাউন্টিং স্ট্যান্ডার্ড অনুযায়ী স্বীকৃতিপ্রাপ্ত রাজস্ব এবং জেনারেল লেজারের পরিচালন ব্যয়ের সমন্বিত হিসাব।
                </p>
              </div>
              <span className="px-2.5 py-1 bg-sky-50 text-sky-700 text-xs font-bold rounded-lg border border-sky-200">
                ভিত্তি: {reportingBasis === "cash" ? "নগদ আদায় ভিত্তি (Cash)" : "বকেয়া/অ্যাকাউন্টিং ভিত্তি (Accrual)"}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Accrual P&L Block */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <div className="bg-slate-900 text-white p-3 font-bold flex justify-between items-center">
                  <span>অ্যাকাউন্টিং লাভ-ক্ষতি (Accrual P&L Statement)</span>
                  <span className="text-[10px] bg-sky-600 px-2 py-0.5 rounded">মানসম্মত হিসাববিজ্ঞান</span>
                </div>

                <div className="bg-slate-100 p-2.5 font-bold text-slate-800 flex justify-between border-b border-slate-200">
                  <span>১. মোট সেবা রাজস্ব (Gross Patient Services)</span>
                  <span className="font-mono text-emerald-700">+{formatCurrencyBDT(pnlSummary.accrualBasis.grossRevenue)}</span>
                </div>
                <div className="p-2.5 bg-white flex justify-between text-slate-600">
                  <span>বাদ: অনুমোদিত ছাড় ও ওয়েভার (Discounts Allowed)</span>
                  <span className="font-mono text-purple-700">-{formatCurrencyBDT(pnlSummary.accrualBasis.discounts)}</span>
                </div>
                <div className="p-2.5 bg-slate-50 font-semibold text-slate-800 flex justify-between border-t border-b border-slate-100">
                  <span>নীট স্বীকৃতিপ্রাপ্ত রাজস্ব (Net Recognized Revenue)</span>
                  <span className="font-mono text-emerald-800 font-bold">+{formatCurrencyBDT(pnlSummary.accrualBasis.netRecognizedRevenue)}</span>
                </div>

                <div className="bg-slate-100 p-2.5 font-bold text-slate-800 flex justify-between border-t border-slate-200">
                  <span>২. পরিচালন ব্যয় (Operating Expenses from General Ledger)</span>
                  <span className="font-mono text-rose-700">-{formatCurrencyBDT(pnlSummary.accrualBasis.operatingExpenses)}</span>
                </div>
                <div className="p-2.5 divide-y divide-slate-100 bg-white max-h-48 overflow-y-auto">
                  {pnlSummary.accrualBasis.expenseBreakdown.length === 0 ? (
                    <div className="py-2 text-slate-400 italic">কোনো এক্সপেন্স অ্যাকাউন্ট রেকর্ড পাওয়া যায়নি।</div>
                  ) : (
                    pnlSummary.accrualBasis.expenseBreakdown.map((exp, idx) => (
                      <div key={idx} className="flex justify-between py-1 text-slate-600">
                        <span>{exp.category}</span>
                        <span className="font-mono text-rose-600">-{formatCurrencyBDT(exp.amount)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="bg-slate-800 text-white p-3 font-bold flex justify-between items-center text-sm border-t border-slate-700">
                  <span>নীট পরিচালন উদ্বৃত্ত / (ঘাটতি) (Operating Surplus/Deficit)</span>
                  <span className={`font-mono text-base font-black ${pnlSummary.accrualBasis.netOperatingSurplus >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatCurrencyBDT(pnlSummary.accrualBasis.netOperatingSurplus)}
                  </span>
                </div>
              </div>

              {/* Cash Flow Block */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <div className="bg-emerald-900 text-white p-3 font-bold flex justify-between items-center">
                  <span>নগদ পরিচালন প্রবাহ (Cash Collection Basis)</span>
                  <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded">ক্যাশ কাউন্টার ভিত্তিক</span>
                </div>

                <div className="bg-slate-100 p-2.5 font-bold text-slate-800 flex justify-between border-b border-slate-200">
                  <span>১. নগদ ও ডিজিটাল আদায় (Cash Inflows)</span>
                  <span className="font-mono text-emerald-700">+{formatCurrencyBDT(pnlSummary.cashMovement.totalCashInflow)}</span>
                </div>
                <div className="p-2.5 bg-white flex justify-between text-slate-600">
                  <span>রোগীর আদায় (Patient Collections)</span>
                  <span className="font-mono">{formatCurrencyBDT(pnlSummary.cashMovement.patientCollections)}</span>
                </div>
                <div className="p-2.5 bg-white flex justify-between text-slate-600">
                  <span>রিফান্ড প্রদান (Cash Refunds)</span>
                  <span className="font-mono text-amber-700">-{formatCurrencyBDT(pnlSummary.cashMovement.refunds)}</span>
                </div>

                <div className="bg-slate-100 p-2.5 font-bold text-slate-800 flex justify-between border-t border-slate-200">
                  <span>২. নগদ ব্যয় পরিশোধ (Cash Disbursements)</span>
                  <span className="font-mono text-rose-700">-{formatCurrencyBDT(pnlSummary.cashMovement.operatingDisbursements)}</span>
                </div>
                <div className="p-2.5 bg-white text-slate-600">
                  <span>হাসপাতাল পরিচালন খরচ পরিশোধ</span>
                  <span className="float-right font-mono text-rose-600">-{formatCurrencyBDT(pnlSummary.cashMovement.operatingDisbursements)}</span>
                </div>

                <div className="bg-emerald-800 text-white p-3 font-bold flex justify-between items-center text-sm border-t border-emerald-700">
                  <span>নীট নগদ প্রবাহ (Net Operating Cash Movement)</span>
                  <span className={`font-mono text-base font-black ${pnlSummary.cashMovement.netCashMovement >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatCurrencyBDT(pnlSummary.cashMovement.netCashMovement)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ACCOUNTS RECEIVABLE (AR) AGING */}
        {activeTab === "ar_aging" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  বকেয়া বয়স বিশ্লেষণ ও অডিট রিকনসিলিয়েশন (Accounts Receivable Aging)
                </h3>
                <p className="text-xs text-slate-500">
                  ইনভয়েসের বয়স অনুযায়ী বকেয়া পাওনা টাকা ৫টি আলাদা সময়সীমায় (Aging Buckets) শ্রেণীবদ্ধ।
                </p>
              </div>
              <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1 ${
                arAging.isReconciled ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"
              }`}>
                {arAging.isReconciled ? "✓ Reconciled: মোট বকেয়া = বাক্সের সমষ্টি" : "⚠ অডিট নোটিশ"}
              </span>
            </div>

            {/* 5 Aging Buckets Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">চলতি (০–৩০ দিন)</span>
                <div className="text-lg font-black text-slate-900 mt-1 font-mono">
                  {formatCurrencyBDT(arAging.current_0_30)}
                </div>
                <span className="text-[10px] text-emerald-600 font-semibold">স্বাভাবিক পরিশোধ চক্র</span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">৩১–৬০ দিন পুরোনো</span>
                <div className="text-lg font-black text-amber-700 mt-1 font-mono">
                  {formatCurrencyBDT(arAging.days_31_60)}
                </div>
                <span className="text-[10px] text-amber-600 font-semibold">ফলো-আপ প্রয়োজন</span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">৬১–৯০ দিন পুরোনো</span>
                <div className="text-lg font-black text-orange-700 mt-1 font-mono">
                  {formatCurrencyBDT(arAging.days_61_90)}
                </div>
                <span className="text-[10px] text-orange-600 font-semibold">তাগাদা প্রদান আবশ্যক</span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase">৯১–১২০ দিন পুরোনো</span>
                <div className="text-lg font-black text-rose-700 mt-1 font-mono">
                  {formatCurrencyBDT(arAging.days_91_120)}
                </div>
                <span className="text-[10px] text-rose-600 font-semibold">উচ্চ ঝুঁকিপূর্ণ বকেয়া</span>
              </div>

              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl shadow-xs">
                <span className="text-[10px] font-bold text-rose-700 uppercase">১২০+ দিন (৪ মাস+)</span>
                <div className="text-lg font-black text-rose-800 mt-1 font-mono">
                  {formatCurrencyBDT(arAging.days_120_plus)}
                </div>
                <span className="text-[10px] text-rose-700 font-semibold">বিশেষ ব্যবস্থাপনা তলব</span>
              </div>
            </div>

            {/* Total AR Control Total */}
            <div className="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-sm">সর্বমোট নিয়ন্ত্রণাধীন বকেয়া (Total AR Control Total):</span>
                <span className="block text-[11px] text-slate-400 mt-0.5">মোট অপরিশোধিত ইনভয়েস: {arAging.totalInvoicesDue} টি</span>
              </div>
              <span className="font-mono text-lg font-black text-amber-400">
                {formatCurrencyBDT(arAging.totalAR)}
              </span>
            </div>
          </div>
        )}

        {/* TAB 6: DUES & DEFAULTER LIST */}
        {activeTab === "dues" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                বকেয়া ও অপরিশোধিত ইনভয়েসের তালিকা (পৃষ্ঠা {page} / {totalPages} — মোট {totalInvoicesCount} টি)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">ইনভয়েস নং</th>
                    <th className="p-2.5">রোগীর নাম</th>
                    <th className="p-2.5">মোবাইল নং</th>
                    <th className="p-2.5 text-right">মোট বিল</th>
                    <th className="p-2.5 text-right">পরিশোধ</th>
                    <th className="p-2.5 text-right">বকেয়া পাওনা (BDT)</th>
                    <th className="p-2.5 text-center">তারিখ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {invoices.filter((i) => !i.is_voided && Number(i.due_amount || 0) > 0).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400">
                        বর্তমান ফিল্টারে কোনো বকেয়া ইনভয়েস নেই।
                      </td>
                    </tr>
                  ) : (
                    invoices
                      .filter((i) => !i.is_voided && Number(i.due_amount || 0) > 0)
                      .map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-slate-900">
                            {inv.invoice_number}
                          </td>
                          <td className="p-2.5 font-semibold text-slate-800">
                            {inv.patient?.full_name || "অজ্ঞাত"}
                          </td>
                          <td className="p-2.5 font-mono text-slate-600">
                            {inv.patient?.phone || "N/A"}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-800">
                            {formatCurrencyBDT(inv.grand_total)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-emerald-700">
                            {formatCurrencyBDT(inv.paid_amount)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-amber-700">
                            {formatCurrencyBDT(inv.due_amount)}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-500">
                            {formatDateBDT(inv.created_at)}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center text-xs text-slate-600 pt-2 no-print">
              <span>পৃষ্ঠা {page} / {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40"
                >
                  পূর্ববর্তী
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 border border-slate-200 rounded disabled:opacity-40"
                >
                  পরবর্তী
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: DOCTOR ROSTER & FEES */}
        {activeTab === "doctors" && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              ডাক্তারদের ওপিডি কনসালটেশন ফি ও রোস্টার শিডিউল
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">ডাক্তারের নাম ও পদবি</th>
                    <th className="p-2.5 text-center">চেম্বার রুম নং</th>
                    <th className="p-2.5 text-right">ওপিডি ফি (BDT)</th>
                    <th className="p-2.5 text-center">স্ট্যাটাস</th>
                    <th className="p-2.5 text-right">বিএমডিসি রেজি:</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {doctors.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-slate-400">
                        ডাটাবেসে কোনো ডাক্তার পাওয়া যায়নি।
                      </td>
                    </tr>
                  ) : (
                    doctors.map((doc) => {
                      const hasFee = typeof doc.opd_fee === "number" && doc.opd_fee > 0;
                      return (
                        <tr key={doc.id} className="hover:bg-slate-50">
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
        )}

        {/* Formal Authority Signature Blocks (Print Layout) */}
        <div className="mt-12 pt-8 border-t border-slate-300 grid grid-cols-3 gap-6 text-center text-xs">
          <div>
            <div className="border-b border-slate-400 w-40 mx-auto mb-2" />
            <span className="font-bold text-slate-800">ক্যাশিয়ার / বিলিং অফিসার</span>
            <span className="block text-[10px] text-slate-500">Prepared By</span>
          </div>
          <div>
            <div className="border-b border-slate-400 w-40 mx-auto mb-2" />
            <span className="font-bold text-slate-800">সিনিয়র অ্যাকাউন্ট্যান্ট</span>
            <span className="block text-[10px] text-slate-500">Audited By</span>
          </div>
          <div>
            <div className="border-b border-slate-400 w-40 mx-auto mb-2" />
            <span className="font-bold text-slate-800">ম্যানেজিং ডিরেক্টর / মালিক</span>
            <span className="block text-[10px] text-slate-500">Approved By</span>
          </div>
        </div>

        <HospitalPrintFooter />
      </div>
    </div>
  );
}
