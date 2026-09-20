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
} from "lucide-react";
import {
  AccountRecord,
  JournalEntryRecord,
  TrialBalanceRow,
  getChartOfAccountsAction,
  getJournalEntriesAction,
  postJournalEntryAction,
  getTrialBalanceAction,
  createAccountAction,
  AccountType,
} from "@/lib/accounting/actions";
import { formatCurrencyBDT } from "@/lib/utils";

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState<"COA" | "ENTRIES" | "TRIAL_BALANCE">("COA");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [entries, setEntries] = useState<JournalEntryRecord[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
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

  // New Account Modal
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [newAccCode, setNewAccCode] = useState("");
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState<AccountType>("EXPENSE");

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [coaRes, entryRes, tbRes] = await Promise.all([
        getChartOfAccountsAction(),
        getJournalEntriesAction({ limit: 50 }),
        getTrialBalanceAction(),
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
        const [coaRes, entryRes, tbRes] = await Promise.all([
          getChartOfAccountsAction(),
          getJournalEntriesAction({ limit: 50 }),
          getTrialBalanceAction(),
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
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Error loading accounting data";
          setErrorMsg(msg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      isMounted = false;
    };
  }, []);

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

  const filteredAccounts = accounts.filter(
    (a) =>
      a.account_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.account_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="h-7 w-7 text-sky-600 dark:text-sky-400" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Enterprise General Ledger & Accounting
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Strict double-entry bookkeeping, atomic journal vouchers, and automated trial balance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAccountModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition"
          >
            <Plus className="h-4 w-4" /> New Account
          </button>
          <button
            onClick={() => {
              setEntryNumber(`JV-${Date.now().toString().slice(-6)}`);
              setIsPostingModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition"
          >
            <Plus className="h-4 w-4" /> Post Journal Entry
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            disabled={loading}
            className="p-2 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab("COA")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
            activeTab === "COA"
              ? "border-sky-600 text-sky-600 dark:text-sky-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          <BookOpen className="h-4 w-4" /> Chart of Accounts ({accounts.length})
        </button>
        <button
          onClick={() => setActiveTab("ENTRIES")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
            activeTab === "ENTRIES"
              ? "border-sky-600 text-sky-600 dark:text-sky-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          <Scale className="h-4 w-4" /> Journal Entries ({entries.length})
        </button>
        <button
          onClick={() => setActiveTab("TRIAL_BALANCE")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition ${
            activeTab === "TRIAL_BALANCE"
              ? "border-sky-600 text-sky-600 dark:text-sky-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" /> Trial Balance
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
                    className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Account Code</th>
                      <th className="px-6 py-3 font-semibold">Account Name</th>
                      <th className="px-6 py-3 font-semibold">Category</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                          No accounts found. Use &quot;New Account&quot; to initialize your Chart of Accounts.
                        </td>
                      </tr>
                    ) : (
                      filteredAccounts.map((acc) => (
                        <tr key={acc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-4 font-mono font-medium text-sky-700 dark:text-sky-400">
                            {acc.account_code}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                            {acc.account_name}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                acc.account_type === "ASSET"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : acc.account_type === "LIABILITY"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  : acc.account_type === "EQUITY"
                                  ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                  : acc.account_type === "REVENUE"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              }`}
                            >
                              {acc.account_type}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
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
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Voucher #</th>
                    <th className="px-6 py-3 font-semibold">Date</th>
                    <th className="px-6 py-3 font-semibold">Description</th>
                    <th className="px-6 py-3 font-semibold text-right">Debit (BDT)</th>
                    <th className="px-6 py-3 font-semibold text-right">Credit (BDT)</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        No journal entries recorded. Click &quot;Post Journal Entry&quot; to add one.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <React.Fragment key={entry.id}>
                        <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-4 font-mono font-medium text-sky-700 dark:text-sky-400">
                            {entry.entry_number}
                          </td>
                          <td className="px-6 py-4 text-slate-500">{entry.entry_date}</td>
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                            {entry.description}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                            {formatCurrencyBDT(entry.total_debit)}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                            {formatCurrencyBDT(entry.total_credit)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              {entry.status}
                            </span>
                          </td>
                        </tr>
                        {entry.lines && entry.lines.length > 0 && (
                          <tr className="bg-slate-50/40 dark:bg-slate-800/20 text-xs">
                            <td colSpan={6} className="px-8 py-2">
                              <div className="space-y-1">
                                {entry.lines.map((l, idx) => (
                                  <div key={idx} className="flex justify-between font-mono text-slate-600 dark:text-slate-400">
                                    <span>{l.account_code || "ACC"} - {l.account_name || "Account"}</span>
                                    <span>
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
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Total Debits</p>
                  <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                    {formatCurrencyBDT(tbTotals.debits)}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-xs text-slate-500 uppercase font-semibold">Total Credits</p>
                  <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                    {formatCurrencyBDT(tbTotals.credits)}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold">Ledger Invariant</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
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

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase text-xs">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Account Code</th>
                      <th className="px-6 py-3 font-semibold">Account Name</th>
                      <th className="px-6 py-3 font-semibold">Type</th>
                      <th className="px-6 py-3 font-semibold text-right">Debit Balance (BDT)</th>
                      <th className="px-6 py-3 font-semibold text-right">Credit Balance (BDT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {trialBalance.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                          No accounting balances calculated.
                        </td>
                      </tr>
                    ) : (
                      trialBalance.map((row) => (
                        <tr key={row.account_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-4 font-mono font-medium text-sky-700 dark:text-sky-400">
                            {row.account_code}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                            {row.account_name}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">{row.account_type}</td>
                          <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                            {row.total_debit > 0 ? formatCurrencyBDT(row.total_debit) : "—"}
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-white">
                            {row.total_credit > 0 ? formatCurrencyBDT(row.total_credit) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-slate-100 dark:bg-slate-800 font-semibold text-slate-900 dark:text-white">
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
        </>
      )}

      {/* MODAL: POST JOURNAL ENTRY */}
      {isPostingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Post Double-Entry Journal Voucher
              </h3>
              <button
                onClick={() => setIsPostingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePostJournal} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Voucher #
                  </label>
                  <input
                    type="text"
                    required
                    value={entryNumber}
                    onChange={(e) => setEntryNumber(e.target.value)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pharmacy inventory bulk supplier settlement"
                    value={entryDesc}
                    onChange={(e) => setEntryDesc(e.target.value)}
                    className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              {/* Journal Lines */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase text-slate-500">
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
                    className="text-xs text-sky-600 hover:underline font-medium"
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
                      className="col-span-5 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                      className="col-span-3 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
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
                      className="col-span-3 p-2 text-xs border rounded-lg bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                    />

                    {lines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                        className="col-span-1 text-red-500 hover:text-red-700 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Balancing summary */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg flex justify-between items-center text-xs font-mono">
                <div>
                  <span>Total Debit: </span>
                  <span className="font-bold text-sky-600">{formatCurrencyBDT(totalDebitSum)}</span>
                </div>
                <div>
                  <span>Total Credit: </span>
                  <span className="font-bold text-sky-600">{formatCurrencyBDT(totalCreditSum)}</span>
                </div>
                <div>
                  {isBalanced ? (
                    <span className="text-emerald-600 font-bold">✓ BALANCED</span>
                  ) : (
                    <span className="text-rose-500 font-bold">✗ UNBALANCED</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPostingModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isBalanced || submitting}
                  className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b pb-3 border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Create Chart of Accounts Code
              </h3>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Account Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1010, 2020, 5010"
                  value={newAccCode}
                  onChange={(e) => setNewAccCode(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cash in Vault, Medical Equipment Depreciation"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                  Account Type
                </label>
                <select
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as AccountType)}
                  className="mt-1 w-full p-2 border rounded-lg text-sm bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                >
                  <option value="ASSET">ASSET</option>
                  <option value="LIABILITY">LIABILITY</option>
                  <option value="EQUITY">EQUITY</option>
                  <option value="REVENUE">REVENUE</option>
                  <option value="EXPENSE">EXPENSE</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Save Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
