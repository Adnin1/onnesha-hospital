"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  RefreshCw,
  X,
  ChevronRight,
  Database,
  Activity,
  CheckCircle2,
  Wrench,
} from "lucide-react";
import {
  getSystemHealthDiagnosticsAction,
  resolveSystemRuntimeIssueAction,
  type SystemHealthDiagnosticResult,
  type SystemHealthIssue,
} from "@/lib/diagnostics/actions";
import { setupGlobalErrorMonitoring } from "@/lib/diagnostics/troubleshooter";

interface SystemHealthAlertBannerProps {
  organizationId?: string;
  variant?: "banner" | "badge" | "full";
}

export default function SystemHealthAlertBanner({
  organizationId,
  variant = "full",
}: SystemHealthAlertBannerProps) {
  const [data, setData] = useState<SystemHealthDiagnosticResult | null>(null);
  const [ephemeralIssues, setEphemeralIssues] = useState<SystemHealthIssue[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [justResolvedMessage, setJustResolvedMessage] = useState<string | null>(null);

  const fetchDiagnostics = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await getSystemHealthDiagnosticsAction(organizationId);
        setData(res);
      } catch (e) {
        console.error("Failed to load diagnostics:", e);
      }
    });
  }, [organizationId]);

  useEffect(() => {
    fetchDiagnostics();
    // Auto-refresh diagnostics every 60 seconds
    const interval = setInterval(fetchDiagnostics, 60000);

    // Install global client error monitoring
    const cleanupMonitoring = setupGlobalErrorMonitoring(organizationId);

    // Real-time listener for runtime incidents
    const handleIncident = (e: Event) => {
      const detail = (e as CustomEvent<SystemHealthIssue>)?.detail;
      if (detail && detail.title) {
        setEphemeralIssues((prev) => {
          const filtered = prev.filter(
            (item) => !(item.location === detail.location && item.title === detail.title)
          );
          return [detail as SystemHealthIssue, ...filtered];
        });
      }
      setIsDismissed(false);
      setJustResolvedMessage(null);
      fetchDiagnostics();
    };

    const handleResolved = (e: Event) => {
      const detail = (e as CustomEvent<{ module?: string; issueId?: string }>)?.detail;
      const mod = detail?.module;
      if (mod) {
        setEphemeralIssues((prev) => prev.filter((item) => item.module !== mod));
      } else if (detail?.issueId) {
        setEphemeralIssues((prev) => prev.filter((item) => item.id !== detail.issueId));
      } else {
        setEphemeralIssues([]);
      }
      const label = mod || "সনাক্তকৃত সমস্যা";
      setJustResolvedMessage(`সমস্যা সমাধান সম্পন্ন (${label}) — সব সিস্টেম স্বাভাবিক রয়েছে।`);
      setTimeout(() => setJustResolvedMessage(null), 12000);
      fetchDiagnostics();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("system-health-incident-reported", handleIncident);
      window.addEventListener("system-health-incident-resolved", handleResolved);
    }

    return () => {
      clearInterval(interval);
      cleanupMonitoring();
      if (typeof window !== "undefined") {
        window.removeEventListener("system-health-incident-reported", handleIncident);
        window.removeEventListener("system-health-incident-resolved", handleResolved);
      }
    };
  }, [fetchDiagnostics, organizationId]);

  const handleResolveIssue = async (issueId: string, module?: string) => {
    setEphemeralIssues((prev) => prev.filter((item) => item.id !== issueId && item.module !== module));
    const orgId = data?.organization_id || organizationId || "6b78e524-b1e3-4c43-8944-1a5a0248bff8";
    await resolveSystemRuntimeIssueAction({
      organizationId: orgId,
      issueId: issueId.startsWith("ephemeral-") ? undefined : issueId,
      module: module,
    });
    const mod = module || "ইস্যু";
    setJustResolvedMessage(`সমস্যা সমাধান সম্পন্ন (${mod}) — সব সিস্টেম স্বাভাবিক রয়েছে।`);
    setTimeout(() => setJustResolvedMessage(null), 12000);
    fetchDiagnostics();
  };

  const combinedIssues = React.useMemo(() => {
    const dbIssues = data?.issues || [];
    const merged = [...ephemeralIssues];
    for (const issue of dbIssues) {
      if (!merged.some((m) => m.id === issue.id || (m.location === issue.location && m.title === issue.title))) {
        merged.push(issue);
      }
    }
    return merged;
  }, [data?.issues, ephemeralIssues]);

  if (!data && ephemeralIssues.length === 0) {
    return null;
  }

  const hasIssues = combinedIssues.length > 0;
  const totalIssueCount = combinedIssues.length;
  const effectiveHealthScore = hasIssues
    ? Math.max(10, Math.min(data?.health_score ?? 100, 100 - totalIssueCount * 20))
    : (data?.health_score ?? 100);

  return (
    <>
      {/* 0. RESOLVED NOTIFICATION BANNER (Shows when an issue was solved) */}
      {justResolvedMessage && !hasIssues && variant !== "badge" && (
        <aside
          role="status"
          aria-live="polite"
          className="relative bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2.5 text-slate-800 dark:text-slate-100 shadow-sm"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-xs sm:text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                {justResolvedMessage}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setJustResolvedMessage(null)}
              aria-label="বার্তা বন্ধ করুন"
              className="p-1 rounded-md text-emerald-700 hover:text-emerald-900 hover:bg-emerald-500/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </aside>
      )}

      {/* 1. TOP ALERT BANNER (Only renders if unresolved issues exist and not dismissed for this view) */}
      {hasIssues && !isDismissed && variant !== "badge" && (
        <aside
          role="alert"
          aria-live="assertive"
          className="relative bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-slate-800 dark:text-slate-100 shadow-sm"
        >
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-xs sm:text-sm font-medium">
                <span className="font-bold text-amber-700 dark:text-amber-300">
                  সিস্টেম অটো-অ্যালার্ট:
                </span>{" "}
                ডেটাবেজ ও সিস্টেমে {totalIssueCount}টি অসামঞ্জস্যতা সনাক্ত হয়েছে (স্বাস্থ্য স্কোর:{" "}
                <span className="font-semibold text-rose-600 dark:text-rose-400">{effectiveHealthScore}%</span>)।
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              >
                <span>কোথায় ও কি সমস্যা দেখুন</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                aria-label="অ্যালার্ট সাময়িকভাবে বন্ধ করুন"
                className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-amber-500/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 2. HEADER COMPACT BADGE / TRIGGER */}
      {(variant === "badge" || variant === "full") && (
        <button
          type="button"
          onClick={() => {
            setIsDismissed(false);
            setIsModalOpen(true);
          }}
          title={
            hasIssues
              ? `সিস্টেমে ${totalIssueCount}টি বিষয় সমাধানের অপেক্ষায়`
              : "সিস্টেম ও ডেটাবেজ ১০০% সুস্থ ও সক্রিয়"
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all shadow-2xs border ${
            hasIssues
              ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 animate-pulse"
              : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
          }`}
        >
          {hasIssues ? (
            <>
              <AlertOctagon className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
              <span>সতর্কবার্তা ({totalIssueCount})</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">সিস্টেম সুস্থ</span>
              <span className="sm:hidden">সুস্থ</span>
              <span className="text-[10px] opacity-80">({effectiveHealthScore}%)</span>
            </>
          )}
        </button>
      )}

      {/* 3. INTERACTIVE DIAGNOSTIC MODAL */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="diagnostic-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    hasIssues
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  }`}
                >
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h2
                    id="diagnostic-modal-title"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    স্বয়ংক্রিয় সিস্টেম ও ডেটাবেজ স্বাস্থ্য নিরীক্ষা
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    সর্বশেষ স্ক্যান: {data?.checked_at ? new Date(data.checked_at).toLocaleTimeString("bn-BD") : "এখনই"} | স্কোর:{" "}
                    <span className="font-semibold">{effectiveHealthScore}/100</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchDiagnostics}
                  disabled={isPending}
                  className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                  title="পুনরায় পরীক্ষা করুন"
                >
                  <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4">
              {hasIssues ? (
                <>
                  <div className="text-xs text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 rounded-lg">
                    সিস্টেমের নির্ভরযোগ্যতা নিশ্চিত রাখতে নিচের অসঙ্গতিগুলো পাওয়া গেছে। এগুলো সমাধান
                    না করা পর্যন্ত এই অ্যালার্ট সিস্টেম ড্যাশবোর্ডে দৃশ্যমান থাকবে:
                  </div>

                  <div className="space-y-3">
                    {combinedIssues.map((issue: SystemHealthIssue) => (
                      <div
                        key={issue.id}
                        className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {issue.severity === "CRITICAL" ? (
                              <AlertOctagon className="h-4 w-4 text-rose-600 shrink-0" />
                            ) : issue.severity === "WARNING" ? (
                              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                            ) : (
                              <Info className="h-4 w-4 text-sky-600 shrink-0" />
                            )}
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              {issue.title}
                            </h3>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              issue.severity === "CRITICAL"
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                                : issue.severity === "WARNING"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                            }`}
                          >
                            {issue.severity}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-100 dark:border-slate-800">
                            <span className="font-semibold text-slate-500 block mb-0.5">
                              মডিউল ও ক্ষেত্র:
                            </span>
                            <span className="text-slate-800 dark:text-slate-200 font-medium">
                              {issue.module}
                            </span>
                          </div>
                          <div className="bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-100 dark:border-slate-800">
                            <span className="font-semibold text-slate-500 block mb-0.5">
                              সমস্যার স্থান (Location):
                            </span>
                            <code className="text-rose-600 dark:text-rose-400 font-mono text-[11px]">
                              {issue.location}
                            </code>
                          </div>
                        </div>

                        <div className="text-xs bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-100 dark:border-slate-800">
                          <span className="font-semibold text-slate-500 block mb-0.5">
                            সমস্যার কারণ ও বিবরণ (Why / What):
                          </span>
                          <p className="text-slate-700 dark:text-slate-300">{issue.reason}</p>
                        </div>

                        <div className="text-xs bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5 rounded border border-emerald-100 dark:border-emerald-900/30">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400 block mb-0.5">
                            প্রস্তাবিত সমাধান (Remediation):
                          </span>
                          <p className="text-slate-700 dark:text-slate-300">
                            {issue.recommendation}
                          </p>
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => handleResolveIssue(issue.id, issue.module)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-2xs transition-colors disabled:opacity-50"
                          >
                            <Wrench className="h-3.5 w-3.5" />
                            <span>সমাধান হিসেবে চিহ্নিত করুন ও পুনঃপরীক্ষা</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <div className="inline-flex p-3 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-10 w-10" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      কোনো সমস্যা সনাক্ত হয়নি
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                      সাধারণ লেজার, বেড অকুপেন্সি, রেফারেল কমিশন, বিলিং ইনভয়েস এবং ট্রায়াল ব্যালান্সের
                      সকল স্বয়ংক্রিয় অডিট সফলভাবে উত্তীর্ণ হয়েছে।
                    </p>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-left">
                    <span className="text-xs font-semibold text-slate-500 block mb-2">
                      উত্তীর্ণ অডিটসমূহ (Passed Verification Checks):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(data?.passed_checks || []).map((check: string) => (
                        <div
                          key={check}
                          className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-700 dark:text-slate-300"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="font-mono text-[11px] truncate">{check}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Database className="h-3.5 w-3.5" />
                <span>স্বয়ংক্রিয় স্বাস্থ্য নিরীক্ষা ইঞ্জিন v1.0</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
