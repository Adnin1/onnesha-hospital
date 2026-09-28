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
  CheckCircle2,
  Building2,
  ExternalLink,
  Percent,
  Search,
  Stethoscope,
  Clock,
} from "lucide-react";
import { InvoiceRecord } from "@/types/billing";
import { DoctorRecord } from "@/types/appointments";
import { getInvoicesAction } from "@/lib/billing/actions";
import { getDoctorsAction } from "@/lib/appointments/actions";
import { getTrialBalanceAction, TrialBalanceRow } from "@/lib/accounting/actions";
import { formatCurrencyBDT, formatDateBDT } from "@/lib/utils";
import { HospitalPrintHeader, HospitalPrintFooter } from "@/components/print/HospitalPrintHeader";
import {
  FinancialPeriod,
  filterInvoicesByPeriod,
  filterPaymentsByPeriod,
  computeFinancialAggregates,
  computeDepartmentalRevenue,
  computePaymentChannelBreakdown,
  computeAccountsReceivableAging,
  computeProfitAndLossStatement,
  computeMonthlyFinancialTrend,
  generateFinancialReportCSV,
} from "@/lib/reports/financial";
import { PaymentRecord } from "@/types/billing";

export default function ReportsManagementPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [period, setPeriod] = useState<FinancialPeriod>("this_month");
  const [reportingBasis, setReportingBasis] = useState<"accrual" | "cash">("accrual");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "due" | "void">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "overview" | "departments" | "channels" | "ar_aging" | "trends" | "pnl" | "dues" | "doctors"
  >("overview");
  const [showHowToGuide, setShowHowToGuide] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;
    async function executeLoad() {
      try {
        setLoading(true);
        const [invRes, docRes, tbRes] = await Promise.all([
          getInvoicesAction({ limit: 5000 }),
          getDoctorsAction(),
          getTrialBalanceAction(),
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

          if (tbRes.success && tbRes.data) {
            setTrialBalance(tbRes.data.trialBalance);
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

  // 1. Filter by period using Asia/Dhaka calendar boundaries
  const periodFilteredInvoices = useMemo(() => {
    return filterInvoicesByPeriod(invoices, period, customStart, customEnd);
  }, [invoices, period, customStart, customEnd]);

  // 2. Filter payments by period using payment date
  const allPayments = useMemo(() => {
    const list: PaymentRecord[] = [];
    for (const inv of invoices) {
      if (!inv.is_voided && inv.payments) {
        list.push(...inv.payments);
      }
    }
    return list;
  }, [invoices]);

  const periodFilteredPayments = useMemo(() => {
    return filterPaymentsByPeriod(allPayments, period, customStart, customEnd);
  }, [allPayments, period, customStart, customEnd]);

  // 3. Filter by status & search
  const displayedInvoices = useMemo(() => {
    return periodFilteredInvoices.filter((inv) => {
      // Status filter
      if (statusFilter === "paid" && (inv.is_voided || (inv.due_amount && inv.due_amount > 0))) return false;
      if (statusFilter === "due" && (inv.is_voided || !inv.due_amount || inv.due_amount <= 0)) return false;
      if (statusFilter === "void" && !inv.is_voided) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const numMatch = inv.invoice_number.toLowerCase().includes(q);
        const patientMatch = inv.patient?.full_name?.toLowerCase().includes(q);
        const phoneMatch = inv.patient?.phone?.includes(q);
        const codeMatch = inv.patient?.patient_code?.toLowerCase().includes(q);
        if (!numMatch && !patientMatch && !phoneMatch && !codeMatch) return false;
      }

      return true;
    });
  }, [periodFilteredInvoices, statusFilter, searchQuery]);

  // Financial aggregates
  const aggregates = useMemo(() => {
    return computeFinancialAggregates(periodFilteredInvoices);
  }, [periodFilteredInvoices]);

  // Departmental breakdown
  const departments = useMemo(() => {
    return computeDepartmentalRevenue(periodFilteredInvoices);
  }, [periodFilteredInvoices]);

  // Payment channels breakdown (Payment Date basis)
  const channels = useMemo(() => {
    return computePaymentChannelBreakdown(periodFilteredInvoices, periodFilteredPayments);
  }, [periodFilteredInvoices, periodFilteredPayments]);

  // Accounts Receivable (AR) Aging Summary
  const arAging = useMemo(() => {
    return computeAccountsReceivableAging(invoices);
  }, [invoices]);

  // Monthly trends for current calendar year
  const monthlyTrends = useMemo(() => {
    return computeMonthlyFinancialTrend(invoices, new Date().getFullYear());
  }, [invoices]);

  // Total operating expenses from Chart of Accounts / Trial Balance
  const totalExpenses = useMemo(() => {
    return trialBalance
      .filter((row) => row.account_type === "EXPENSE")
      .reduce((sum, row) => sum + Math.abs(Number(row.net_balance || 0)), 0);
  }, [trialBalance]);

  // True Profit & Loss Statement (Accrual basis)
  const pnlStatement = useMemo(() => {
    const expenseRows = trialBalance
      .filter((row) => row.account_type === "EXPENSE")
      .map((row) => ({
        category: `${row.account_name} (${row.account_code})`,
        amount: Math.abs(Number(row.net_balance || 0)),
      }));

    return computeProfitAndLossStatement({
      invoices: periodFilteredInvoices,
      operatingExpenses: expenseRows,
      periodStartIso: customStart || "",
      periodEndIso: customEnd || "",
    });
  }, [periodFilteredInvoices, trialBalance, customStart, customEnd]);

  // Net Operating Surplus / Deficit (Accrual Basis)
  const netSurplus = useMemo(() => {
    return pnlStatement.accrual.netOperatingSurplus;
  }, [pnlStatement]);

  // Pending dues list
  const dueInvoices = useMemo(() => {
    return periodFilteredInvoices.filter((inv) => !inv.is_voided && Number(inv.due_amount || 0) > 0);
  }, [periodFilteredInvoices]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const csv = generateFinancialReportCSV(displayedInvoices, {
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
              ERP v1.1.10
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
              <div className="flex items-center gap-2 font-bold text-amber-300 text-sm mb-1.5">
                <AlertCircle className="w-4 h-4" />
                ৩. ভুল হলে এডিট/সংশোধন কিভাবে করবেন? (Edit/Void)
              </div>
              <p className="text-slate-300 leading-relaxed mb-3">
                হাসপাতাল অডিট আইনে সরাসরি বিল মুছে ফেলা নিষিদ্ধ (চুরি রোধে)। ভুল বিল বাতিল করতে সুপারভাইজার উপযুক্ত কারণ লিখে <strong className="text-white">Void</strong> করবেন। আর বকেয়া টাকা নিতে বিলিং পেজে <strong className="text-white">Collect Payment</strong> বাটনে অবশিষ্ট টাকা আদায় করবেন।
              </p>
              <Link
                href="/app/billing"
                className="inline-flex items-center text-[11px] font-semibold text-amber-300 hover:underline"
              >
                বকেয়া বা ভয়েড পরিচালনা <ChevronRight className="w-3 h-3 ml-0.5" />
              </Link>
            </div>

            <div className="bg-white/10 p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 font-bold text-purple-300 text-sm mb-1.5">
                <BarChart3 className="w-4 h-4" />
                ৪. সাপ্তাহিক, মাসিক ও বার্ষিক রিপোর্ট
              </div>
              <p className="text-slate-300 leading-relaxed mb-3">
                এই পেজেই উপরের ফিল্টার থেকে <strong className="text-white">This Month, This Year বা Custom Range</strong> বেছে নিন। সম্পূর্ণ লাভ-ক্ষতি, ডিপার্টমেন্ট আয়ের গ্রাফ, বকেয়া তালিকা দেখে প্রিন্ট বা এক্সেলে নামিয়ে নিন।
              </p>
              <span className="text-[11px] font-semibold text-purple-300">
                স্বয়ংক্রিয় হিসাব প্রস্তুত
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Period & Filter Control Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3 no-print">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          {/* Period Presets */}
          <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-700">
            <button
              onClick={() => setPeriod("today")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "today" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              আজ (Today)
            </button>
            <button
              onClick={() => setPeriod("this_week")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "this_week" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              চলতি সপ্তাহ (Week)
            </button>
            <button
              onClick={() => setPeriod("this_month")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "this_month" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              চলতি মাস (Month)
            </button>
            <button
              onClick={() => setPeriod("last_month")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "last_month" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              গত মাস (Last Month)
            </button>
            <button
              onClick={() => setPeriod("this_year")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "this_year" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              চলতি বছর (Annual)
            </button>
            <button
              onClick={() => setPeriod("all")}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === "all" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              সব সময় (All Time)
            </button>
            <button
              onClick={() => setPeriod("custom")}
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
              onClick={() => setStatusFilter("all")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                statusFilter === "all" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              সব স্ট্যাটাস
            </button>
            <button
              onClick={() => setStatusFilter("paid")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                statusFilter === "paid" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              পরিশোধিত (Paid)
            </button>
            <button
              onClick={() => setStatusFilter("due")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                statusFilter === "due" ? "bg-white font-bold text-slate-900 shadow-xs" : "hover:text-slate-900"
              }`}
            >
              বকেয়া (Due)
            </button>
            <button
              onClick={() => setStatusFilter("void")}
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
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <span className="font-semibold text-slate-600">শেষ তারিখ:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          ) : (
            <div className="text-xs text-slate-500 font-medium">
              নির্বাচিত সময়কাল: <span className="font-bold text-slate-800 uppercase">{period.replace("_", " ")}</span> ({displayedInvoices.length} টি রেকর্ড পাওয়া গেছে)
            </div>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="রোগীর নাম / মোবাইল / ইনভয়েস নং..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
            {loading ? "..." : formatCurrencyBDT(aggregates.totalBilled)}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            মোট সক্রিয় ইনভয়েস: {aggregates.activeInvoicesCount}
          </div>
        </div>

        {/* Total Collection */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
            <span>মোট নগদ ও ডিজিটাল আদায়</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700 mt-1.5 font-mono">
            {loading ? "..." : formatCurrencyBDT(aggregates.totalCollected)}
          </div>
          <div className="text-[10px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
            <span className="px-1.5 py-0.2 bg-emerald-50 rounded">
              {aggregates.collectionRate}% আদায় সম্পন্ন
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
            {loading ? "..." : formatCurrencyBDT(aggregates.totalDues)}
          </div>
          <div className="text-[10px] font-semibold text-amber-600 mt-1 flex items-center gap-1">
            <span className="px-1.5 py-0.2 bg-amber-50 rounded">
              {aggregates.dueRate}% বকেয়া অনুপাত
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
            {loading ? "..." : formatCurrencyBDT(totalExpenses)}
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
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          সার্বিক সারসংক্ষেপ (Overview)
        </button>

        <button
          onClick={() => setActiveTab("departments")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "departments"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          বিভাগভিত্তিক আয় (Department Revenue)
        </button>

        <button
          onClick={() => setActiveTab("channels")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "channels"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          পেমেন্ট চ্যানেল (Payment Methods)
        </button>

        <button
          onClick={() => setActiveTab("trends")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "trends"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          ১২ মাসের ট্রেন্ড (Monthly Trend)
        </button>

        <button
          onClick={() => setActiveTab("pnl")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "pnl"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          লাভ-ক্ষতি বিবরণী (Income vs Expense)
        </button>

        <button
          onClick={() => setActiveTab("ar_aging")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "ar_aging"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          বকেয়া বয়স বিশ্লেষণ (AR Aging)
        </button>

        <button
          onClick={() => setActiveTab("dues")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "dues"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          বকেয়া তালিকা ({dueInvoices.length})
        </button>

        <button
          onClick={() => setActiveTab("doctors")}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "doctors"
              ? "bg-sky-600 text-white shadow-xs"
              : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Stethoscope className="w-3.5 h-3.5" />
          ডাক্তারদের ফি শিডিউল
        </button>
      </div>

      {/* Main Tab Content Document */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs print-pad">
        <HospitalPrintHeader
          documentTitle="EXECUTIVE FINANCIAL & REVENUE AUDIT REPORT"
          documentNumber={`REP-${new Date().toISOString().slice(0, 10)}`}
          dateStr={new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        />

        {/* Audit Scope Header */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 my-4 text-xs text-slate-600 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <span className="font-bold text-slate-800">রিপোর্টিং উইন্ডো:</span>{" "}
            <span className="uppercase font-mono text-sky-700 font-bold">{period.replace("_", " ")}</span>
            <span className="mx-2">•</span>
            <span className="font-bold text-slate-800">রেকর্ড সংখ্যা:</span>{" "}
            <span className="font-mono text-slate-900">{displayedInvoices.length} টি ইনভয়েস</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Timezone: Asia/Dhaka (BST UTC+6) • Official ERP Records
          </div>
        </div>

        {/* TAB 1: OVERVIEW & RECENT INVOICE LEDGER */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              সাম্প্রতিক লেনদেন ও ইনভয়েস খতিয়ান ({displayedInvoices.length} টি রেকর্ড)
            </h3>
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
                  ) : displayedInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-slate-400">
                        নির্বাচিত সময়কালে কোনো ইনভয়েস রেকর্ড পাওয়া যায়নি।
                      </td>
                    </tr>
                  ) : (
                    displayedInvoices.slice(0, 50).map((inv) => (
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
          </div>
        )}

        {/* TAB 2: DEPARTMENT REVENUE BREAKDOWN */}
        {activeTab === "departments" && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              হাসপাতালের বিভাগভিত্তিক আয়ের বিবরণী (Department Revenue Breakdown)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {departments.map((dept) => (
                <div key={dept.category} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{dept.categoryLabelBn}</h4>
                      <p className="text-[11px] text-slate-500">{dept.categoryLabelEn}</p>
                    </div>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {formatCurrencyBDT(dept.totalRevenue)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-3">
                    <div
                      className="bg-sky-600 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, dept.percentageOfTotal)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 mt-2 font-mono">
                    <span>পরিবেশিত সেবা: {dept.itemCount} টি</span>
                    <span className="font-bold text-sky-700">{dept.percentageOfTotal}% অংশ</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: PAYMENT CHANNELS */}
        {activeTab === "channels" && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              নগদ ও ডিজিটাল পেমেন্ট চ্যানেল ভিত্তিক আদায় (Cash & Digital MFS Breakdown)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {channels.map((chan) => (
                <div key={chan.method} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">{chan.methodLabelBn}</span>
                  <div className="text-lg font-black text-slate-900 mt-1 font-mono">
                    {formatCurrencyBDT(chan.totalCollected)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2 flex justify-between">
                    <span>লেনদেন: {chan.transactionCount} টি</span>
                    <span className="font-bold text-sky-600">{chan.percentageOfTotal}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: 12-MONTH TREND */}
        {activeTab === "trends" && (
          <div className="space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              চলতি ক্যালেন্ডার বছরের মাসভিত্তিক আয়-ব্যয় চিত্র ({new Date().getFullYear()})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">মাস</th>
                    <th className="p-2.5 text-right">মোট বিলকৃত (Invoiced)</th>
                    <th className="p-2.5 text-right">আদায়কৃত (Collected)</th>
                    <th className="p-2.5 text-right">বকেয়া (Dues)</th>
                    <th className="p-2.5 text-center">আদায় অনুপাত (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {monthlyTrends.map((t) => (
                    <tr key={t.monthIndex} className="hover:bg-slate-50 font-mono">
                      <td className="p-2.5 font-bold font-sans text-slate-900">
                        {t.monthNameBn} ({t.monthName})
                      </td>
                      <td className="p-2.5 text-right text-slate-900 font-semibold">
                        {formatCurrencyBDT(t.invoiced)}
                      </td>
                      <td className="p-2.5 text-right text-emerald-700 font-bold">
                        {formatCurrencyBDT(t.collected)}
                      </td>
                      <td className="p-2.5 text-right text-amber-700 font-bold">
                        {formatCurrencyBDT(t.dues)}
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.collectionRate >= 80
                              ? "bg-emerald-100 text-emerald-700"
                              : t.collectionRate > 0
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {t.collectionRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: PROFIT & LOSS (ACCRUAL & CASH STATEMENT) */}
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
                  <span className="font-mono text-emerald-700">+{formatCurrencyBDT(pnlStatement.accrual.grossPatientRevenue)}</span>
                </div>
                <div className="p-2.5 bg-white flex justify-between text-slate-600">
                  <span>বাদ: অনুমোদিত ছাড় ও ওয়েভার (Discounts Allowed)</span>
                  <span className="font-mono text-purple-700">-{formatCurrencyBDT(pnlStatement.accrual.discountsAllowed)}</span>
                </div>
                <div className="p-2.5 bg-slate-50 font-semibold text-slate-800 flex justify-between border-t border-b border-slate-100">
                  <span>নীট স্বীকৃতিপ্রাপ্ত রাজস্ব (Net Recognized Revenue)</span>
                  <span className="font-mono text-emerald-800 font-bold">+{formatCurrencyBDT(pnlStatement.accrual.netRecognizedRevenue)}</span>
                </div>

                <div className="bg-slate-100 p-2.5 font-bold text-slate-800 flex justify-between border-t border-slate-200">
                  <span>২. পরিচালন ব্যয় (Operating Expenses from General Ledger)</span>
                  <span className="font-mono text-rose-700">-{formatCurrencyBDT(pnlStatement.accrual.operatingExpenses)}</span>
                </div>
                <div className="p-2.5 divide-y divide-slate-100 bg-white max-h-48 overflow-y-auto">
                  {pnlStatement.accrual.expenseBreakdown.length === 0 ? (
                    <div className="py-2 text-slate-400 italic">কোনো এক্সপেন্স অ্যাকাউন্ট রেকর্ড পাওয়া যায়নি।</div>
                  ) : (
                    pnlStatement.accrual.expenseBreakdown.map((exp, idx) => (
                      <div key={idx} className="flex justify-between py-1 text-slate-600">
                        <span>{exp.category}</span>
                        <span className="font-mono text-rose-600">-{formatCurrencyBDT(exp.amount)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="bg-slate-800 text-white p-3 font-bold flex justify-between items-center text-sm border-t border-slate-700">
                  <span>নীট পরিচালন উদ্বৃত্ত / (ঘাটতি) (Operating Surplus/Deficit)</span>
                  <span className={`font-mono text-base font-black ${pnlStatement.accrual.netOperatingSurplus >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatCurrencyBDT(pnlStatement.accrual.netOperatingSurplus)}
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
                  <span className="font-mono text-emerald-700">+{formatCurrencyBDT(pnlStatement.cash.cashCollectionsInflow)}</span>
                </div>
                <div className="p-2.5 bg-white flex justify-between text-slate-600">
                  <span>ক্যাশ কাউন্টার আদায় (Cash Drawer)</span>
                  <span className="font-mono">{formatCurrencyBDT(aggregates.totalCollected)}</span>
                </div>
                <div className="p-2.5 bg-white flex justify-between text-slate-600">
                  <span>রিফান্ড প্রদান (Cash Refunds)</span>
                  <span className="font-mono text-amber-700">-{formatCurrencyBDT(pnlStatement.cash.cashRefundsOutflow)}</span>
                </div>

                <div className="bg-slate-100 p-2.5 font-bold text-slate-800 flex justify-between border-t border-slate-200">
                  <span>২. নগদ ব্যয় পরিশোধ (Cash Disbursements)</span>
                  <span className="font-mono text-rose-700">-{formatCurrencyBDT(totalExpenses)}</span>
                </div>
                <div className="p-2.5 bg-white text-slate-600">
                  <span>হাসপাতাল পরিচালন খরচ পরিশোধ</span>
                  <span className="float-right font-mono text-rose-600">-{formatCurrencyBDT(totalExpenses)}</span>
                </div>

                <div className="bg-emerald-800 text-white p-3 font-bold flex justify-between items-center text-sm border-t border-emerald-700">
                  <span>নীট নগদ প্রবাহ (Net Operating Cash Flow)</span>
                  <span className={`font-mono text-base font-black ${aggregates.totalCollected - totalExpenses >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatCurrencyBDT(aggregates.totalCollected - totalExpenses)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ACCOUNTS RECEIVABLE (AR) AGING */}
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
                বকেয়া ও অপরিশোধিত ইনভয়েসের তালিকা ({dueInvoices.length} টি রোগী)
              </h3>
              <Link
                href="/app/billing"
                className="text-xs font-semibold text-sky-600 hover:underline flex items-center gap-1 no-print"
              >
                বিলিং পেজে টাকা আদায় করুন <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">ইনভয়েস নং</th>
                    <th className="p-2.5">তারিখ</th>
                    <th className="p-2.5">রোগীর নাম</th>
                    <th className="p-2.5">মোবাইল নম্বর</th>
                    <th className="p-2.5 text-right">মোট বিল</th>
                    <th className="p-2.5 text-right">পরিশোধ</th>
                    <th className="p-2.5 text-right text-amber-700">বকেয়া পাওনা</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dueInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-emerald-600 font-medium">
                        ✓ নির্বাচিত সময়কালে কোনো বকেয়া বা পাওনা বাকি নেই!
                      </td>
                    </tr>
                  ) : (
                    dueInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-amber-50/50">
                        <td className="p-2.5 font-mono font-bold text-slate-900">{inv.invoice_number}</td>
                        <td className="p-2.5 font-mono text-slate-600">{formatDateBDT(inv.created_at)}</td>
                        <td className="p-2.5 font-semibold text-slate-800">{inv.patient?.full_name || "অজ্ঞাত"}</td>
                        <td className="p-2.5 font-mono text-slate-600">{inv.patient?.phone || "N/A"}</td>
                        <td className="p-2.5 text-right font-mono font-semibold">{formatCurrencyBDT(inv.grand_total)}</td>
                        <td className="p-2.5 text-right font-mono text-emerald-700">{formatCurrencyBDT(inv.paid_amount)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-amber-700">
                          {formatCurrencyBDT(inv.due_amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
