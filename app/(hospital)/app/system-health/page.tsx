"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  CheckCircle2,
  Wrench,
  Sparkles,
  FileCheck,
} from "lucide-react";
import {
  getSystemHealthDiagnosticsAction,
  resolveSystemRuntimeIssueAction,
  type SystemHealthDiagnosticResult,
  type SystemHealthIssue,
} from "@/lib/diagnostics/actions";
import { reportSystemRuntimeIncident } from "@/lib/diagnostics/troubleshooter";

export default function SystemHealthPage() {
  const [data, setData] = useState<SystemHealthDiagnosticResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [justResolvedMessage, setJustResolvedMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const fetchDiagnostics = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await getSystemHealthDiagnosticsAction();
        setData(res);
      } catch (err) {
        console.error("[SystemHealthPage] fetchDiagnostics error:", err);
      }
    });
  }, []);

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 45000);

    const handleIncident = () => {
      setJustResolvedMessage(null);
      fetchDiagnostics();
    };

    const handleResolved = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const mod = detail?.module || "সনাক্তকৃত মডিউল";
      setJustResolvedMessage(`সমস্যা সমাধান সম্পন্ন (${mod}) — সব সিস্টেম স্বাভাবিক রয়েছে।`);
      setTimeout(() => setJustResolvedMessage(null), 12000);
      fetchDiagnostics();
    };

    window.addEventListener("system-health-incident-reported", handleIncident);
    window.addEventListener("system-health-incident-resolved", handleResolved);

    return () => {
      clearInterval(interval);
      window.removeEventListener("system-health-incident-reported", handleIncident);
      window.removeEventListener("system-health-incident-resolved", handleResolved);
    };
  }, [fetchDiagnostics]);

  const handleResolveIssue = async (issueId: string, module?: string) => {
    if (!data?.organization_id) return;
    await resolveSystemRuntimeIssueAction({
      organizationId: data.organization_id,
      issueId: issueId.startsWith("ephemeral-") ? undefined : issueId,
      module: module,
    });
    const mod = module || "ইস্যু";
    setJustResolvedMessage(`সমস্যা সমাধান সম্পন্ন (${mod}) — সব সিস্টেম স্বাভাবিক রয়েছে।`);
    setTimeout(() => setJustResolvedMessage(null), 12000);
    fetchDiagnostics();
  };

  // Real-life test demonstration helper: simulates an operational warning and auto-resolves it
  const handleTestSimulation = async () => {
    if (!data?.organization_id || isSimulating) return;
    setIsSimulating(true);
    try {
      await reportSystemRuntimeIncident({
        organizationId: data.organization_id,
        module: "সিস্টেম ডায়াগনস্টিক সিমুলেটর (Live Verification)",
        location: "app/system-health/page.tsx:handleTestSimulation",
        severity: "WARNING",
        errorCode: "DIAGNOSTIC_VERIFICATION_TEST",
        title: "লাইভ ডায়াগনস্টিক টেস্ট অ্যালার্ট (Test Diagnostic Incident)",
        reason: "স্বয়ংক্রিয় টেস্ট অ্যালার্ট সফলভাবে ট্রিগার হয়েছে। সিস্টেম রিয়েল-টাইমে অবস্থান ও কারণ প্রদর্শনে সক্ষম।",
        recommendation: "নিচের 'সমাধান করুন' বাটনে ক্লিক করে 'Issue Solved' স্ট্যাটাস যাচাই করুন।",
      });
      fetchDiagnostics();
    } finally {
      setIsSimulating(false);
    }
  };

  const hasIssues = Boolean(data && !data.is_healthy && data.issues.length > 0);

  const verificationCheckLabels: Record<string, string> = {
    GENERAL_LEDGER_DOUBLE_ENTRY_BALANCED: "সাধারণ লেজার ডাবল-এন্ট্রি ব্যালান্স (Debits = Credits)",
    BED_OCCUPANCY_STATUS_SYNCHRONIZED: "বেড অকুপেন্সি ও সক্রিয় রোগী অ্যাসাইনমেন্ট সমন্বয়",
    BED_WARD_INVENTORY_INTEGRITY_VERIFIED: "বেড ও ওয়ার্ড স্কিমা ফরেন-কি অখণ্ডতা",
    REFERRAL_COMMISSION_LEDGER_BALANCED: "রেফারেল কমিশন ও পে-আউট লেজার সমন্বয়",
    EXPENSE_JOURNAL_LINKAGE_VERIFIED: "হাসপাতাল খরচ ও জার্নাল পোস্টিং লিংকেজ",
    INVOICE_FINANCIAL_INVARIANTS_VERIFIED: "বিলিং ইনভয়েস আর্থিক ইনভ্যারিয়েন্ট (নন-নেগেটিভ)",
    DOCTOR_DIRECTORY_CONFIGURED: "সক্রিয় চিকিৎসক চেম্বার ও ওপিডি প্রস্তুতি",
    TRIAL_BALANCE_PARITY_VERIFIED: "আর্থিক বিবরণী ও ট্রায়াল ব্যালান্স সমতা",
    SYSTEM_RUNTIME_INCIDENTS_ZERO: "সিস্টেম রানটাইম ইনসিডেন্ট মনিটর (জিরো ত্রুটি)",
    PATIENT_INTAKE_ADMISSION_INTEGRITY_VERIFIED: "রোগী ভর্তি সিকোয়েন্স ও অ্যাডমিশন অখণ্ডতা",
    PUBLIC_PORTAL_SAFE_STANDBY: "পাবলিক পোর্টাল সুরক্ষিত স্ট্যান্ডবাই মোড",
    DEFAULT_HEALTHY: "স্ট্যান্ডার্ড স্বাস্থ্য নিরীক্ষা সক্রিয়",
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-sky-50 dark:bg-sky-950/60 rounded-lg text-sky-600 dark:text-sky-400">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                স্বয়ংক্রিয় সিস্টেম ও ডেটাবেজ স্বাস্থ্য নিরীক্ষা ইঞ্জিন
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authoritative Autonomous System & Database Health Troubleshooter Engine v1.0
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchDiagnostics}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs transition-all disabled:opacity-50 min-h-[40px]"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin text-sky-600" : ""}`} />
            <span>সম্পূর্ণ স্ক্যান চালান</span>
          </button>

          <button
            type="button"
            onClick={handleTestSimulation}
            disabled={isPending || isSimulating}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors min-h-[40px]"
            title="একটি টেস্ট ইনসিডেন্ট তৈরি করে অটো-ডিটেকশন ও রিকভারি যাচাই করুন"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>লাইভ টেস্ট অ্যালার্ট</span>
          </button>
        </div>
      </div>

      {/* 2. RESOLVED SUCCESS BANNER */}
      {justResolvedMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-300"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="text-sm font-semibold">{justResolvedMessage}</div>
          </div>
          <button
            type="button"
            onClick={() => setJustResolvedMessage(null)}
            className="text-xs px-2.5 py-1 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 transition-colors"
          >
            বন্ধ করুন
          </button>
        </div>
      )}

      {/* 3. HEALTH METRICS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Health Score */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              সামগ্রিক স্বাস্থ্য স্কোর
            </div>
            <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white flex items-baseline gap-1.5">
              <span>{data ? data.health_score : "--"}</span>
              <span className="text-sm font-normal text-slate-400">/ 100</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {data?.health_score === 100 && data?.is_healthy
                ? "সব সাব-সিস্টেম সক্রিয় ও ত্রুটিমুক্ত (100% HEALTHY)"
                : data?.critical_count && data.critical_count > 0
                ? "গুরুতর ত্রুটি সনাক্ত — দ্রুত সমাধান আবশ্যক (CRITICAL)"
                : data?.warning_count && data.warning_count > 0
                ? "সতর্কতা সক্রিয় — পারফরম্যান্স হ্রাসপ্রাপ্ত (DEGRADED)"
                : data?.is_healthy
                ? "সিস্টেম স্বাভাবিক রয়েছে"
                : "নিরীক্ষা অসম্পূর্ণ বা যাচাই আবশ্যক"}
            </div>
          </div>
          <div
            className={`p-3 rounded-full ${
              data?.is_healthy
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                : "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
            }`}
          >
            {data?.is_healthy ? (
              <ShieldCheck className="h-7 w-7" />
            ) : (
              <AlertOctagon className="h-7 w-7" />
            )}
          </div>
        </div>

        {/* Metric 2: Critical Issues */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              গুরুতর অসঙ্গতি (Critical)
            </div>
            <div className="text-2xl font-black mt-1 text-rose-600 dark:text-rose-400">
              {data ? data.critical_count : 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {data && data.critical_count === 0 ? "জিরো জটিল সমস্যা" : "অবিলম্বে সমাধান প্রয়োজন"}
            </div>
          </div>
          <div className="p-3 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            <AlertOctagon className="h-6 w-6" />
          </div>
        </div>

        {/* Metric 3: Warnings */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              সতর্কবার্তা (Warnings)
            </div>
            <div className="text-2xl font-black mt-1 text-amber-600 dark:text-amber-400">
              {data ? data.warning_count : 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {data && data.warning_count === 0 ? "কোনো সতর্কতা নেই" : "পর্যালোচনাযোগ্য"}
            </div>
          </div>
          <div className="p-3 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>

        {/* Metric 4: Passed Audits */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              উত্তীর্ণ অডিট পরীক্ষা
            </div>
            <div className="text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
              {data ? data.passed_checks.length : 0}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">স্বয়ংক্রিয় অডিট পাস</div>
          </div>
          <div className="p-3 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 4. ACTIVE ISSUES SECTION (Where & Why) */}
      {hasIssues ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <span>সমাধানের অপেক্ষায় থাকা সমস্যা ও অবস্থান (Active Issues & Locations)</span>
            </h2>
            <span className="text-xs text-slate-500">
              মোট: {data?.total_issues} টি সমস্যা
            </span>
          </div>

          <div className="space-y-3.5">
            {data?.issues.map((issue: SystemHealthIssue) => (
              <div
                key={issue.id}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    {issue.severity === "CRITICAL" ? (
                      <AlertOctagon className="h-5 w-5 text-rose-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                        {issue.title}
                      </h3>
                      <div className="text-xs text-slate-400">
                        সনাক্তের সময়: {new Date(issue.timestamp).toLocaleTimeString("bn-BD")}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                      issue.severity === "CRITICAL"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    }`}
                  >
                    {issue.severity}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-500 block mb-1">
                      মডিউল ও ক্ষেত্র (Module):
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {issue.module}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="font-semibold text-slate-500 block mb-1">
                      সমস্যার স্থান (Where / Location):
                    </span>
                    <code className="text-rose-600 dark:text-rose-400 font-mono text-[11px] break-all">
                      {issue.location}
                    </code>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs">
                  <span className="font-semibold text-slate-500 block mb-1">
                    সমস্যার কারণ ও বিবরণ (Why / Reason):
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {issue.reason}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-xs">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 block mb-1">
                    প্রস্তাবিত সমাধান (Remediation):
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {issue.recommendation}
                  </p>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleResolveIssue(issue.id, issue.module)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-2xs transition-colors disabled:opacity-50 min-h-[38px]"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    <span>সমাধান হিসেবে চিহ্নিত করুন ও পুনঃপরীক্ষা (Resolve & Verify)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20 text-center space-y-3">
          <div className="inline-flex p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-10 w-10" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              সব সিস্টেম স্বাভাবিক ও সুরক্ষিত রয়েছে (All Systems Operational)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto mt-1">
              সাধারণ লেজার, বেড অকুপেন্সি, রোগী রেজিস্ট্রেশন, রেফারেল কমিশন, বিলিং ইনভয়েস এবং ট্রায়াল
              ব্যালান্সের সকল স্বয়ংক্রিয় অডিট সফলভাবে উত্তীর্ণ হয়েছে। কোনো সক্রিয় অসামঞ্জস্যতা নেই।
            </p>
          </div>
        </div>
      )}

      {/* 5. 10-POINT SYSTEM VERIFICATION MATRIX */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              ১০-দফা পূর্ণাঙ্গ সিস্টেম ও ডেটাবেজ অডিট চেকলিস্ট (10-Point Verification Matrix)
            </h2>
          </div>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {data?.passed_checks.length || 0} / 10 উত্তীর্ণ
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(verificationCheckLabels).map(([key, label]) => {
            const isPassed = Boolean(data?.passed_checks.includes(key));
            return (
              <div
                key={key}
                className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs transition-colors ${
                  isPassed
                    ? "bg-slate-50/70 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                    : "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-200"
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {isPassed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">{label}</div>
                  <div className="font-mono text-[10px] text-slate-400 mt-0.5">{key}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
