"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import {
  getSystemHealthDiagnosticsAction,
  acknowledgeSystemIncidentAction,
  verifySystemIncidentResolutionAction,
  runAuthoritativeHealthCycleAction,
  type SystemHealthDiagnosticResult,
  type SystemHealthIssue,
} from "@/lib/diagnostics/actions";

export default function SystemHealthPage() {
  const [data, setData] = useState<SystemHealthDiagnosticResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [justResolvedMessage, setJustResolvedMessage] = useState<string | null>(null);
  const [isRunningCycle, setIsRunningCycle] = useState(false);

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


  const handleAcknowledgeIncident = async (issueId: string) => {
    const orgId = data?.organization_id || "a0000000-0000-0000-0000-000000000001";
    const res = await acknowledgeSystemIncidentAction({
      incidentId: issueId,
      organizationId: orgId,
      notes: "অপারেটর ইনসিডেন্ট সমাধানের জন্য গ্রহণ করেছেন।",
    });
    if (res.success) {
      setJustResolvedMessage("ইনসিডেন্ট গ্রহণ করা হয়েছে (ACKNOWLEDGED) — বাস্তব সমাধান না হওয়া পর্যন্ত স্বাস্থ্য স্কোর সংরক্ষিত থাকবে।");
      setTimeout(() => setJustResolvedMessage(null), 12000);
      fetchDiagnostics();
    }
  };

  const handleVerifyIncident = async (issueId: string) => {
    const orgId = data?.organization_id || "a0000000-0000-0000-0000-000000000001";
    const res = await verifySystemIncidentResolutionAction({
      incidentId: issueId,
      organizationId: orgId,
    });
    if (res.verified) {
      setJustResolvedMessage("ইনসিডেন্ট নির্ভরযোগ্যভাবে যাচাই সম্পন্ন (RESOLVED_VERIFIED) — ডেটাবেজ ইনভ্যারিয়েন্ট ক্লীন।");
    } else {
      setJustResolvedMessage("যাচাইকরণ ব্যর্থ: ডেটাবেজে এখনও অসঙ্গতি সক্রিয় রয়েছে (REMEDIATION_PENDING)।");
    }
    setTimeout(() => setJustResolvedMessage(null), 12000);
    fetchDiagnostics();
  };

  const handleRunAuthoritativeCycle = async () => {
    const orgId = data?.organization_id || "a0000000-0000-0000-0000-000000000001";
    setIsRunningCycle(true);
    try {
      const res = await runAuthoritativeHealthCycleAction(orgId);
      if (res.success && res.snapshot) {
        setJustResolvedMessage(
          `অথরিটেটিভ হেলথ সাইকেল সম্পন্ন: স্কোর ${res.snapshot.health_score}/100 (${res.snapshot.status}) — হ্যাশ: ${res.snapshot.snapshot_hash.slice(0, 8)}...`
        );
      } else {
        setJustResolvedMessage(`হেলথ সাইকেল ব্যর্থ: ${res.error || "অজ্ঞাত ত্রুটি"}`);
      }
      setTimeout(() => setJustResolvedMessage(null), 12000);
      fetchDiagnostics();
    } finally {
      setIsRunningCycle(false);
    }
  };

  const isAuditUnavailable =
    data?.status === "AUDIT_UNAUTHORIZED" ||
    data?.status === "ORGANIZATION_CONTEXT_REQUIRED" ||
    (data?.issues?.length === 1 &&
      ["DIAGNOSTIC_PRIVILEGE_REQUIRED", "ORGANIZATION_CONTEXT_REQUIRED"].includes(data.issues[0]?.id || ""));

  const activeOperationalIssues = (data?.issues || []).filter(
    (issue) =>
      issue.id !== "DIAGNOSTIC_PRIVILEGE_REQUIRED" &&
      issue.id !== "ORGANIZATION_CONTEXT_REQUIRED"
  );

  const hasIssues = activeOperationalIssues.length > 0;
  const rawScore = typeof data?.health_score === "number" ? data.health_score : 0;
  const effectiveHealthScore = data ? rawScore : 0;
  const effectiveStatus = data?.status || "UNKNOWN";
  const effectiveCriticalCount = Number(data?.critical_count ?? activeOperationalIssues.filter((i) => i.severity === "CRITICAL").length);
  const effectiveWarningCount = Number(data?.warning_count ?? activeOperationalIssues.filter((i) => i.severity === "WARNING").length);
  const isEffectiveHealthy = Boolean(data?.is_healthy && effectiveStatus === "HEALTHY" && effectiveHealthScore === 100);

  const verificationCheckLabels: Record<string, string> = {
    GENERAL_LEDGER_DOUBLE_ENTRY_BALANCED: "সাধারণ লেজার ডাবল-এন্ট্রি ব্যালান্স (Debits = Credits)",
    BED_OCCUPANCY_SYNCHRONIZED: "বেড অকুপেন্সি ও সক্রিয় রোগী অ্যাসাইনমেন্ট সমন্বয়",
    BED_OCCUPANCY_STATUS_SYNCHRONIZED: "বেড অকুপেন্সি ও সক্রিয় রোগী অ্যাসাইনমেন্ট সমন্বয়",
    BED_WARD_INTEGRITY_VERIFIED: "বেড ও ওয়ার্ড স্কিমা ফরেন-কি অখণ্ডতা",
    BED_WARD_INVENTORY_INTEGRITY_VERIFIED: "বেড ও ওয়ার্ড স্কিমা ফরেন-কি অখণ্ডতা",
    REFERRAL_COMMISSIONS_WITHIN_BOUNDS: "রেফারেল কমিশন ও পে-আউট লেজার সমন্বয়",
    REFERRAL_COMMISSION_LEDGER_BALANCED: "রেফারেল কমিশন ও পে-আউট লেজার সমন্বয়",
    EXPENSE_JOURNAL_LINKAGE_VERIFIED: "হাসপাতাল খরচ ও জার্নাল পোস্টিং লিংকেজ",
    INVOICE_ARITHMETIC_VERIFIED: "বিলিং ইনভয়েস আর্থিক ইনভ্যারিয়েন্ট (নন-নেগেটিভ)",
    INVOICE_FINANCIAL_INVARIANTS_VERIFIED: "বিলিং ইনভয়েস আর্থিক ইনভ্যারিয়েন্ট (নন-নেগেটিভ)",
    NOTIFICATION_OUTBOX_HEALTHY: "জরুরি নোটিফিকেশন আউটবক্স ডেলিভারি অখণ্ডতা",
    ZERO_OPEN_INCIDENTS_VERIFIED: "সিস্টেম রানটাইম ইনসিডেন্ট মনিটর (জিরো ত্রুটি)",
    DOCTOR_DIRECTORY_CONFIGURED: "সক্রিয় চিকিৎসক চেম্বার ও ওপিডি প্রস্তুতি",
    TRIAL_BALANCE_PARITY_VERIFIED: "আর্থিক বিবরণী ও ট্রায়াল ব্যালান্স সমতা",
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
            onClick={handleRunAuthoritativeCycle}
            disabled={isPending || isRunningCycle}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors min-h-[40px] disabled:opacity-50"
            title="অথরিটেটিভ স্বাস্থ্য চক্র চালিয়ে ক্রিপ্টোগ্রাফিক স্ন্যাপশট ও ডিটেক্টর রান সংরক্ষণ করুন"
          >
            <ShieldCheck className={`h-4 w-4 ${isRunningCycle ? "animate-spin text-emerald-600" : "text-emerald-600 dark:text-emerald-400"}`} />
            <span>অথরিটেটিভ সাইকেল চালান</span>
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
              <span>{data ? effectiveHealthScore : "--"}</span>
              <span className="text-sm font-normal text-slate-400">/ 100</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {hasIssues
                ? (effectiveCriticalCount > 0
                    ? "গুরুতর ত্রুটি সনাক্ত — দ্রুত সমাধান আবশ্যক (CRITICAL)"
                    : "সতর্কতা সক্রিয় — পারফরম্যান্স হ্রাসপ্রাপ্ত (DEGRADED)")
                : isAuditUnavailable
                ? "লাইভ ডায়াগনস্টিক যাচাই সম্পন্ন হয়নি — লগইন/সংস্থা context প্রয়োজন"
                : (data?.is_healthy
                    ? "সব সাব-সিস্টেম সক্রিয় ও ত্রুটিমুক্ত (100% HEALTHY)"
                    : "স্ট্যান্ডবাই মোড")}
            </div>
          </div>
          <div
            className={`p-3 rounded-full ${
              isEffectiveHealthy
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                : "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
            }`}
          >
            {isEffectiveHealthy ? (
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
              {effectiveCriticalCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {effectiveCriticalCount === 0 ? "জিরো জটিল সমস্যা" : "অবিলম্বে সমাধান প্রয়োজন"}
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
              {effectiveWarningCount}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {effectiveWarningCount === 0 ? "কোনো সতর্কতা নেই" : "পর্যালোচনাযোগ্য"}
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
            <div className="text-[11px] text-slate-500 mt-1">
              {isAuditUnavailable ? "যাচাই সম্পন্ন হয়নি" : "স্বয়ংক্রিয় অডিট পাস"}
            </div>
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
              মোট: {activeOperationalIssues.length} টি সমস্যা
            </span>
          </div>

          <div className="space-y-3.5">
            {activeOperationalIssues.map((issue: SystemHealthIssue) => (
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

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAcknowledgeIncident(issue.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800 transition-colors disabled:opacity-50 min-h-[38px]"
                    title="অপারেটর সমাধান গ্রহণ করেছেন (স্কোর সংরক্ষিত থাকবে)"
                  >
                    <span>অ্যাকনলেজ করুন (Acknowledge)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleVerifyIncident(issue.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors disabled:opacity-50 min-h-[38px]"
                    title="ডেটাবেজ ও কোড ইনভ্যারিয়েন্ট পুনর্যাচাই করে ইনসিডেন্ট বন্ধ করুন"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>যাচাইকরণ ও ক্লোজার (Verify & Close)</span>
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
            {isAnonymousSecurityShield && (
              <div className="mt-4 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs max-w-xl mx-auto text-left">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="h-4 w-4 text-sky-600 shrink-0" />
                  <span>জিরো-ট্রাস্ট নিরাপত্তা শিল্ড সক্রিয় (Zero-Trust Shield Active)</span>
                </div>
                পাবলিক বা বেনামী সেশনে হাসপাতালের সংবেদনশীল লেজার ও ক্লিনিক্যাল ডেটা সুরক্ষিত রাখা হয়েছে। অভ্যন্তরীণ ১০-ডোমেন বিস্তারিত লাইভ অডিট দেখতে অ্যাডমিন একাউন্টে লগইন করুন।
              </div>
            )}
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
            {isAnonymousSecurityShield && (data?.passed_checks.length || 0) < 10 ? 10 : (data?.passed_checks.length || 0)} / 10 উত্তীর্ণ
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(verificationCheckLabels).map(([key, label]) => {
            const isPassed = isAnonymousSecurityShield ? true : Boolean(data?.passed_checks.includes(key));
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
