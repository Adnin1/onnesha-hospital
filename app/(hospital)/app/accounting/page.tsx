"use client";

import React, { useState, useEffect } from "react";
import {
  Scale,
  Plus,
  Search,
  Loader2,
  RefreshCw,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Calendar,
  Undo2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import {
  AccountRecord,
  JournalEntryRecord,
  TrialBalanceRow,
  FiscalPeriodRecord,
  getChartOfAccountsAction,
  getJournalEntriesAction,
  postJournalEntryAction,
  getTrialBalanceAction,
  createAccountAction,
  getFiscalPeriodsAction,
  createFiscalPeriodAction,
  closeFiscalPeriodAction,
  reopenFiscalPeriodAction,
  reverseJournalEntryAction,
  AccountType,
} from "@/lib/accounting/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState<"COA" | "ENTRIES" | "TRIAL_BALANCE" | "PERIODS">("COA");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [entries, setEntries] = useState<JournalEntryRecord[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriodRecord[]>([]);
  const [tbTotals, setTbTotals] = useState({ debits: 0, credits: 0, balanced: true });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");

  // Post Journal Modal
  const [isPostingModalOpen, setIsPostingModalOpen] = useState(false);
  const [entryNumber, setEntryNumber] = useState("");
  const [entryDesc, setEntryDesc] = useState("");
  const [lines, setLines] = useState<
    Array<{ account_id: string; debit: number; credit: number; description: string }>
  >([
    { account_id: "", debit: 0, credit: 0, description: "" },
    { account_id: "", debit: 0, credit: 0, description: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Reversal Modal
  const [reversalModalEntry, setReversalModalEntry] = useState<{ id: string; num: string } | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversing, setReversing] = useState(false);

  // New Account Modal
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [newAccCode, setNewAccCode] = useState("");
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState<AccountType>("EXPENSE");

  // New Fiscal Period Modal
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [periodName, setPeriodName] = useState("");
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [periodEndDate, setPeriodEndDate] = useState("");

  // Guide Accordion State
  const [showGuide, setShowGuide] = useState(true);

  const handleOpenQuickTemplate = (templateType: "CASH_WITHDRAWAL" | "OFFICE_EXPENSE") => {
    setEntryNumber(`JV-${Date.now().toString().slice(-6)}`);
    const cashAcc = accounts.find((a) => a.account_code === "1010" || a.account_name.toLowerCase().includes("cash"));
    const bankAcc = accounts.find((a) => a.account_code === "1020" || a.account_name.toLowerCase().includes("bank"));
    const expAcc = accounts.find((a) => a.account_type === "EXPENSE");

    if (templateType === "CASH_WITHDRAWAL") {
      setEntryDesc("ব্যাংক থেকে নগদ ক্যাশ উত্তোলন (Cash Withdrawal from Bank)");
      setLines([
        { account_id: cashAcc?.id || "", debit: 5000, credit: 0, description: "ক্যাশ ইন হ্যান্ড বৃদ্ধি (Debit)" },
        { account_id: bankAcc?.id || "", debit: 0, credit: 5000, description: "ব্যাংক ব্যালান্স হ্রাস (Credit)" },
      ]);
    } else {
      setEntryDesc("অফিস ও অপারেশনাল ব্যয় পরিশোধ (Operational Office Expense)");
      setLines([
        { account_id: expAcc?.id || "", debit: 1200, credit: 0, description: "খরচের খাত (Debit)" },
        { account_id: cashAcc?.id || "", debit: 0, credit: 1200, description: "ক্যাশ প্রদান (Credit)" },
      ]);
    }
    setIsPostingModalOpen(true);
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [coaRes, entryRes, tbRes, periodRes] = await Promise.all([
        getChartOfAccountsAction(),
        getJournalEntriesAction({ limit: 50 }),
        getTrialBalanceAction(),
        getFiscalPeriodsAction(),
      ]);

      if (!coaRes.success) throw new Error(coaRes.error || "Failed to load accounts");
      setAccounts(coaRes.data?.accounts || []);

      if (!entryRes.success) throw new Error(entryRes.error || "Failed to load entries");
      setEntries(entryRes.data?.entries || []);

      if (!tbRes.success) throw new Error(tbRes.error || "Failed to load trial balance");
      setTrialBalance(tbRes.data?.trialBalance || []);
      setTbTotals({
        debits: tbRes.data?.totalDebits || 0,
        credits: tbRes.data?.totalCredits || 0,
        balanced: tbRes.data?.isBalanced ?? true,
      });

      if (periodRes.success && periodRes.data) {
        setFiscalPeriods(periodRes.data.periods);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading accounting data";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [coaRes, entryRes, tbRes, periodRes] = await Promise.all([
          getChartOfAccountsAction(),
          getJournalEntriesAction({ limit: 50 }),
          getTrialBalanceAction(),
          getFiscalPeriodsAction(),
        ]);

        if (isMounted) {
          if (coaRes.success && coaRes.data) setAccounts(coaRes.data.accounts);
          if (entryRes.success && entryRes.data) setEntries(entryRes.data.entries);
          if (tbRes.success && tbRes.data) {
            setTrialBalance(tbRes.data.trialBalance);
            setTbTotals({
              debits: tbRes.data.totalDebits,
              credits: tbRes.data.totalCredits,
              balanced: tbRes.data.isBalanced,
            });
          }
          if (periodRes.success && periodRes.data) {
            setFiscalPeriods(periodRes.data.periods);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Error loading accounting data";
          setErrorMsg(msg);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleReverseJournal = (entryId: string, entryNum: string) => {
    setReversalModalEntry({ id: entryId, num: entryNum });
    setReversalReason("");
  };

  const handleConfirmReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalModalEntry) return;
    if (!reversalReason.trim()) {
      setErrorMsg("Mandatory reversal justification required.");
      return;
    }
    setReversing(true);
    try {
      const res = await reverseJournalEntryAction({
        originalEntryId: reversalModalEntry.id,
        reversalReason: reversalReason.trim(),
      });
      if (!res.success) {
        setErrorMsg(res.error || "Failed to reverse journal entry");
      } else {
        setSuccessMsg(`Journal entry ${reversalModalEntry.num} successfully reversed.`);
        setReversalModalEntry(null);
        setReversalReason("");
        await loadData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error reversing entry";
      setErrorMsg(msg);
    } finally {
      setReversing(false);
    }
  };

  const handleTogglePeriod = async (period: FiscalPeriodRecord) => {
    setLoading(true);
    try {
      const res = period.is_closed
        ? await reopenFiscalPeriodAction(period.id)
        : await closeFiscalPeriodAction(period.id);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to update period status");
      } else {
        setSuccessMsg(`Fiscal period "${period.period_name}" ${period.is_closed ? "reopened" : "closed"} successfully.`);
        await loadData();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error updating period";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const totalDebitSum = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCreditSum = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebitSum - totalCreditSum) < 0.01 && totalDebitSum > 0;

  const handlePostJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      setErrorMsg("Debits must equal credits and be greater than 0");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await postJournalEntryAction({
        entry_number: entryNumber,
        description: entryDesc,
        lines: lines.map((l) => ({
          account_id: l.account_id,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description,
        })),
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to post entry");
      }

      setSuccessMsg(`Journal Entry ${res.data?.entry_number} posted successfully.`);
      setIsPostingModalOpen(false);
      setEntryNumber(`JV-${Date.now().toString().slice(-6)}`);
      setEntryDesc("");
      setLines([
        { account_id: "", debit: 0, credit: 0, description: "" },
        { account_id: "", debit: 0, credit: 0, description: "" },
      ]);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error posting journal entry";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccCode || !newAccName) {
      setErrorMsg("Code and name are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createAccountAction({
        account_code: newAccCode,
        account_name: newAccName,
        account_type: newAccType,
      });
      if (!res.success) throw new Error(res.error);

      setSuccessMsg(`Account ${newAccCode} created.`);
      setIsAccountModalOpen(false);
      setNewAccCode("");
      setNewAccName("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating account";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodName.trim() || !periodStartDate || !periodEndDate) {
      setErrorMsg("Period Name, Start Date, and End Date are required.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await createFiscalPeriodAction({
        period_name: periodName.trim(),
        start_date: periodStartDate,
        end_date: periodEndDate,
      });
      if (!res.success) throw new Error(res.error || "Failed to create fiscal period");
      setSuccessMsg(`Fiscal period "${res.data?.period.period_name}" created successfully.`);
      setIsPeriodModalOpen(false);
      setPeriodName("");
      setPeriodStartDate("");
      setPeriodEndDate("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating fiscal period";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredAccounts = accounts.filter(
    (a) =>
      a.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.account_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-7 w-7 text-sky-600" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Enterprise General Ledger & Accounting
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Strict double-entry bookkeeping, atomic journal vouchers, and automated trial balance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAccountModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Account
          </button>
          <button
            onClick={() => {
              setEntryNumber(`JV-${Date.now().toString().slice(-6)}`);
              setIsPostingModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Post Journal Entry
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            disabled={loading}
            className="p-2 border border-slate-300 rounded-xl hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 📖 Baby-Simple Admin Guide Banner for Accounting & Ledger */}
      <div className="bg-gradient-to-r from-sky-50 via-indigo-50 to-blue-50 border border-sky-200 rounded-2xl p-5 shadow-xs transition-all">
        <div className="flex justify-between items-start cursor-pointer" onClick={() => setShowGuide(!showGuide)}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-600 text-white rounded-xl shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  হিসাবরক্ষণ ও সাধারণ লেজার ব্যবহারের সহজ নির্দেশিকা (Easy Accounting Guide)
                </h3>
                <span className="text-[10px] bg-sky-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Admin Master Guide
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                হাসপাতালের প্রতিটি টাকার সঠিক হিসাব ও ডাবল-এন্ট্রি বুককিপিং বোঝার সহজ ৩টি নিয়ম
              </p>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 hover:bg-sky-200/50 rounded-lg text-slate-600 transition"
            aria-label="Toggle Guide"
          >
            {showGuide ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>

        {showGuide && (
          <div className="mt-4 pt-4 border-t border-sky-200/70 space-y-4 text-xs">
            {/* The Golden Rule */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-white/80 rounded-xl border border-sky-100 shadow-2xs">
                <span className="font-bold text-emerald-800 flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> ১. ডেবিট (Debit) কী?
                </span>
                <p className="text-slate-600 leading-relaxed">
                  হাসপাতালে <strong>টাকা আসলে</strong> (যেমন: ব্যাংকে জমা, ক্যাশ কাউন্টারে নগদ গ্রহণ) অথবা কোনো <strong>খরচ বৃদ্ধি পেলে</strong> (যেমন: ডাক্তারকে বেতন, বিদ্যুৎ বিল, অক্সিজেন ক্রয়) সংশ্লিষ্ট খাতকে ডেবিট করতে হয়।
                </p>
              </div>
              <div className="p-3 bg-white/80 rounded-xl border border-sky-100 shadow-2xs">
                <span className="font-bold text-indigo-800 flex items-center gap-1.5 mb-1">
                  <Scale className="w-4 h-4 text-indigo-600" /> ২. ক্রেডিট (Credit) কী?
                </span>
                <p className="text-slate-600 leading-relaxed">
                  হাসপাতাল থেকে <strong>টাকা চলে গেলে</strong> (যেমন: ব্যাংক বা ক্যাশ থেকে টাকা দেওয়া) অথবা কোনো <strong>আয় তৈরি হলে</strong> (যেমন: রোগী ভর্তি ফি, ল্যাব টেস্টের বিল, ওষুধ বিক্রি) সংশ্লিষ্ট খাতকে ক্রেডিট করতে হয়।
                </p>
              </div>
            </div>

            {/* 3 Steps */}
            <div className="p-3 bg-white/90 rounded-xl border border-sky-200 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span>প্রতিদিনের কাজ যেভাবে করবেন (৩টি সহজ ধাপ):</span>
                </div>
                <div className="text-slate-600 space-y-0.5 text-[11px] pl-6">
                  <p>• <strong>ধাপ ১:</strong> &quot;Post Journal Entry&quot; বাটনে ক্লিক করুন।</p>
                  <p>• <strong>ধাপ ২:</strong> প্রথম লাইনে টাকা কোথায় গেল/খরচ হলো (Debit) এবং দ্বিতীয় লাইনে টাকা কোথা থেকে আসল (Credit) নির্বাচন করুন। মোট ডেবিট = মোট ক্রেডিট সমান হতে হবে।</p>
                  <p>• <strong>ধাপ ৩:</strong> &quot;Trial Balance&quot; ট্যাবে যেয়ে নিশ্চিত করুন উভয় পাশ সমান (Balanced 100%) আছে।</p>
                </div>
              </div>

              {/* Quick Template Buttons */}
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenQuickTemplate("CASH_WITHDRAWAL")}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  ব্যাংক থেকে ক্যাশ উত্তোলন
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenQuickTemplate("OFFICE_EXPENSE")}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  অফিস খরচ ভাউচার
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("TRIAL_BALANCE")}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  <Scale className="w-3.5 h-3.5" />
                  ব্যালান্স অডিট
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-6">
        <button
          onClick={() => setActiveTab("COA")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === "COA"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <BookOpen className="h-4 w-4" /> Chart of Accounts ({accounts.length})
        </button>
        <button
          onClick={() => setActiveTab("ENTRIES")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === "ENTRIES"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Scale className="h-4 w-4" /> Journal Entries ({entries.length})
        </button>
        <button
          onClick={() => setActiveTab("TRIAL_BALANCE")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === "TRIAL_BALANCE"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" /> Trial Balance
        </button>
        <button
          onClick={() => setActiveTab("PERIODS")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === "PERIODS"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Calendar className="h-4 w-4" /> Fiscal Periods ({fiscalPeriods.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          <span className="ml-3 text-sm">Loading general ledger...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: CHART OF ACCOUNTS */}
          {activeTab === "COA" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="relative w-72">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search accounts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 uppercase text-xs">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Account Code</th>
                      <th className="px-6 py-3 font-semibold">Account Name</th>
                      <th className="px-6 py-3 font-semibold">Category</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                          No accounts found. Use &quot;New Account&quot; to initialize your Chart of Accounts.
                        </td>
                      </tr>
                    ) : (
                      filteredAccounts.map((acc) => (
                        <tr key={acc.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-6 py-4 font-mono font-bold text-sky-700">
                            {acc.account_code}
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            {acc.account_name}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                acc.account_type === "ASSET"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                  : acc.account_type === "LIABILITY"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                  : acc.account_type === "EQUITY"
                                  ? "bg-purple-50 text-purple-700 border border-purple-200/60"
                                  : acc.account_type === "REVENUE"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200/60"
                                  : "bg-rose-50 text-rose-700 border border-rose-200/60"
                              }`}
                            >
                              {acc.account_type}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full text-xs font-bold">
                              ● ACTIVE
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

          {/* TAB 2: JOURNAL ENTRIES */}
          {activeTab === "ENTRIES" && (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Voucher #</th>
                    <th className="px-6 py-3 font-semibold">Date</th>
                    <th className="px-6 py-3 font-semibold">Description</th>
                    <th className="px-6 py-3 font-semibold text-right">Debit (BDT)</th>
                    <th className="px-6 py-3 font-semibold text-right">Credit (BDT)</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        No journal entries recorded. Click &quot;Post Journal Entry&quot; to add one.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <React.Fragment key={entry.id}>
                        <tr className="hover:bg-slate-50/70 transition">
                          <td className="px-6 py-4 font-mono font-bold text-sky-700">
                            {entry.entry_number}
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-medium">{entry.entry_date}</td>
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            {entry.description}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                            {formatCurrencyBDT(entry.total_debit)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                            {formatCurrencyBDT(entry.total_credit)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  entry.status === "POSTED"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                                    : entry.status === "REVERSED"
                                    ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                                    : "bg-slate-100 text-slate-700 border border-slate-200"
                                }`}
                              >
                                {entry.status}
                              </span>
                              {entry.status === "POSTED" && (
                                <button
                                  onClick={() => handleReverseJournal(entry.id, entry.entry_number)}
                                  title="Reverse this journal entry"
                                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                                >
                                  <Undo2 className="h-3 w-3" /> Reverse
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {entry.lines && entry.lines.length > 0 && (
                          <tr className="bg-slate-50/70 text-xs">
                            <td colSpan={6} className="px-8 py-2.5 border-t border-slate-100">
                              <div className="space-y-1">
                                {entry.lines.map((l, idx) => (
                                  <div key={idx} className="flex justify-between font-mono text-slate-600">
                                    <span>{l.account_code || "ACC"} - {l.account_name || "Account"}</span>
                                    <span className="font-semibold">
                                      {l.debit > 0 ? `DR: ${formatCurrencyBDT(l.debit)}` : `CR: ${formatCurrencyBDT(l.credit)}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: TRIAL BALANCE */}
          {activeTab === "TRIAL_BALANCE" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Total Debits</p>
                  <p className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
                    {formatCurrencyBDT(tbTotals.debits)}
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Total Credits</p>
                  <p className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
                    {formatCurrencyBDT(tbTotals.credits)}
                  </p>
                </div>
                <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold">Ledger Invariant</p>
                    <p className="text-lg font-bold text-slate-900 mt-1">
                      {tbTotals.balanced ? "Double-Entry Balanced" : "Unbalanced Discrepancy"}
                    </p>
                  </div>
                  <CheckCircle2
                    className={`h-8 w-8 ${
                      tbTotals.balanced ? "text-emerald-600" : "text-rose-500"
                    }`}
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 uppercase text-xs">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Account Code</th>
                      <th className="px-6 py-3 font-semibold">Account Name</th>
                      <th className="px-6 py-3 font-semibold">Type</th>
                      <th className="px-6 py-3 font-semibold text-right">Debit Balance (BDT)</th>
                      <th className="px-6 py-3 font-semibold text-right">Credit Balance (BDT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trialBalance.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                          No accounting balances calculated.
                        </td>
                      </tr>
                    ) : (
                      trialBalance.map((row) => (
                        <tr key={row.account_id} className="hover:bg-slate-50/70 transition">
                          <td className="px-6 py-4 font-mono font-bold text-sky-700">
                            {row.account_code}
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            {row.account_name}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">{row.account_type}</td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                            {row.total_debit > 0 ? formatCurrencyBDT(row.total_debit) : "—"}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                            {row.total_credit > 0 ? formatCurrencyBDT(row.total_credit) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-right uppercase text-xs">
                        Total Sum:
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {formatCurrencyBDT(tbTotals.debits)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {formatCurrencyBDT(tbTotals.credits)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: FISCAL PERIODS */}
          {activeTab === "PERIODS" && (
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Accounting Period Control</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Prevent historical ledger postings and enforce audit period locking.</p>
                </div>
                <button
                  onClick={() => setIsPeriodModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-sky-600 text-white hover:bg-sky-700 shadow-xs transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> + New Fiscal Period
                </button>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-slate-600 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Period Name</th>
                    <th className="px-6 py-3 font-semibold">Start Date</th>
                    <th className="px-6 py-3 font-semibold">End Date</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold text-right">Control Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fiscalPeriods.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                        No fiscal periods defined yet.
                      </td>
                    </tr>
                  ) : (
                    fiscalPeriods.map((period) => (
                      <tr key={period.id} className="hover:bg-slate-50/70 transition">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">
                          {period.period_name}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{period.start_date}</td>
                        <td className="px-6 py-4 text-slate-500 font-medium">{period.end_date}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              period.is_closed
                                ? "bg-rose-50 text-rose-700 border border-rose-200/60"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            }`}
                          >
                            {period.is_closed ? "CLOSED" : "OPEN"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleTogglePeriod(period)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                              period.is_closed
                                ? "bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200"
                                : "bg-rose-600 text-white hover:bg-rose-700 shadow-2xs"
                            }`}
                          >
                            {period.is_closed ? "Reopen Period" : "Close Period"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MODAL: POST JOURNAL ENTRY */}
      {isPostingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-lg font-extrabold text-slate-900">
                Post Double-Entry Journal Voucher
              </h3>
              <button
                onClick={() => setIsPostingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePostJournal} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Voucher #
                  </label>
                  <input
                    type="text"
                    required
                    value={entryNumber}
                    onChange={(e) => setEntryNumber(e.target.value)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pharmacy inventory bulk supplier settlement"
                    value={entryDesc}
                    onChange={(e) => setEntryDesc(e.target.value)}
                    className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Journal Lines */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase text-slate-600">
                    Journal Lines (Debit & Credit)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLines([
                        ...lines,
                        { account_id: "", debit: 0, credit: 0, description: "" },
                      ])
                    }
                    className="text-xs text-sky-600 hover:underline font-bold cursor-pointer"
                  >
                    + Add Line
                  </button>
                </div>

                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      required
                      value={line.account_id}
                      onChange={(e) => {
                        const updated = [...lines];
                        updated[idx].account_id = e.target.value;
                        setLines(updated);
                      }}
                      className="col-span-5 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    >
                      <option value="">Select Account...</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_code} - {a.account_name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Debit"
                      value={line.debit || ""}
                      onChange={(e) => {
                        const updated = [...lines];
                        updated[idx].debit = parseFloat(e.target.value) || 0;
                        if (updated[idx].debit > 0) updated[idx].credit = 0;
                        setLines(updated);
                      }}
                      className="col-span-3 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Credit"
                      value={line.credit || ""}
                      onChange={(e) => {
                        const updated = [...lines];
                        updated[idx].credit = parseFloat(e.target.value) || 0;
                        if (updated[idx].credit > 0) updated[idx].debit = 0;
                        setLines(updated);
                      }}
                      className="col-span-3 p-2 text-xs border rounded-xl bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />

                    {lines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                        className="col-span-1 text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Balancing summary */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex justify-between items-center text-xs font-mono">
                <div>
                  <span className="text-slate-500">Total Debit: </span>
                  <span className="font-bold text-sky-700">{formatCurrencyBDT(totalDebitSum)}</span>
                </div>
                <div>
                  <span className="text-slate-500">Total Credit: </span>
                  <span className="font-bold text-sky-700">{formatCurrencyBDT(totalCreditSum)}</span>
                </div>
                <div>
                  {isBalanced ? (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">✓ BALANCED</span>
                  ) : (
                    <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-bold">✗ UNBALANCED</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsPostingModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isBalanced || submitting}
                  className="px-4 py-2 text-sm font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {submitting ? "Posting..." : "Confirm & Post Ledger"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW ACCOUNT */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-lg font-extrabold text-slate-900">
                Create Chart of Accounts Code
              </h3>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Account Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1010, 2020, 5010"
                  value={newAccCode}
                  onChange={(e) => setNewAccCode(e.target.value)}
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cash in Vault, Medical Equipment Depreciation"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Account Type
                </label>
                <select
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as AccountType)}
                  className="mt-1 w-full p-2.5 border rounded-xl text-sm bg-white border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                >
                  <option value="ASSET">ASSET</option>
                  <option value="LIABILITY">LIABILITY</option>
                  <option value="EQUITY">EQUITY</option>
                  <option value="REVENUE">REVENUE</option>
                  <option value="EXPENSE">EXPENSE</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {submitting ? "Creating..." : "Save Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {reversalModalEntry && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-2xl">
            <h3 className="text-lg font-extrabold text-slate-900 mb-2">
              Reverse Journal Entry {reversalModalEntry.num}
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-medium">
              Enter mandatory reason for reversing this entry. A compensating reversal entry will be posted into the general ledger.
            </p>

            <form onSubmit={handleConfirmReverse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reversal Reason / Audit Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Correcting mistaken duplicate entry from invoice batch..."
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReversalModalEntry(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversing || !reversalReason.trim()}
                  className="px-4 py-2 text-xs font-semibold bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {reversing ? "Reversing..." : "Confirm Reversal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW FISCAL PERIOD */}
      {isPeriodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200">
              <h3 className="text-lg font-extrabold text-slate-900">Add New Fiscal Period</h3>
              <button
                type="button"
                onClick={() => setIsPeriodModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePeriod} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Period Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q1 FY 2026-2027 (Jul - Sep)"
                  value={periodName}
                  onChange={(e) => setPeriodName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={periodStartDate}
                    onChange={(e) => setPeriodStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={periodEndDate}
                    onChange={(e) => setPeriodEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsPeriodModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {submitting ? "Saving..." : "Create Period"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
