"use client";

import React, { useState, useEffect, useTransition, useCallback, useRef } from "react";
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
  const localIncidentsRef = useRef<SystemHealthIssue[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isResolvingIssueId, setIsResolvingIssueId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [justResolvedMessage, setJustResolvedMessage] = useState<string | null>(null);

  const fetchDiagnostics = useCallback((): void => {
    startTransition(async () => {
      try {
        const result = await getSystemHealthDiagnosticsAction(organizationId);
        const durableIds = new Set(result.issues.map((issue) => issue.id));
        const pendingLocal = localIncidentsRef.current.filter((issue) => !durableIds.has(issue.id));
        const issues = [...result.issues, ...pendingLocal];
        const totalIssues = Math.max(result.total_issues, result.issues.length) + pendingLocal.length;

        setData({
          ...result,
          is_healthy: result.is_healthy === true && totalIssues === 0 && issues.length === 0,
          health_score: pendingLocal.length > 0 ? Math.min(result.health_score, 90) : result.health_score,
          critical_count: result.critical_count + pendingLocal.filter((issue) => issue.severity === "CRITICAL").length,
          warning_count: result.warning_count + pendingLocal.filter((issue) => issue.severity === "WARNING").length,
          info_count: result.info_count + pendingLocal.filter((issue) => issue.severity === "INFO").length,
          total_issues: totalIssues,
          issues,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown diagnostic UI exception";
        console.error("[HealthDiagnostics] UI fetch failed; state is UNKNOWN:", message);
        const timestamp = new Date().toISOString();
        const issue: SystemHealthIssue = {
          id: "DIAGNOSTIC_CLIENT_FETCH_FAILED",
          severity: "WARNING",
          module: "সিস্টেম ডায়াগনস্টিক ও মনিটরিং",
          location: "components/app/SystemHealthAlertBanner.tsx:fetchDiagnostics",
          title: "ডায়াগনস্টিক ফলাফল পাওয়া যায়নি",
          reason: message,
          recommendation: "Authenticated organization, Supabase connection এবং diagnostic RPC state পরীক্ষা করুন।",
          timestamp,
        };
        setData({
          is_healthy: false,
          health_score: 0,
          critical_count: 0,
          warning_count: 1 + localIncidentsRef.current.filter((item) => item.severity === "WARNING").length,
          info_count: localIncidentsRef.current.filter((item) => item.severity === "INFO").length,
          total_issues: 1 + localIncidentsRef.current.length,
          checked_at: timestamp,
          organization_id: null,
          issues: [issue, ...localIncidentsRef.current],
          passed_checks: [],
          error: message,
        });
      }
    });
  }, [organizationId, startTransition]);

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 60_000);
    const cleanupMonitoring = setupGlobalErrorMonitoring();

    const handleIncident = (event: Event) => {
      const detail = (event as CustomEvent<Partial<SystemHealthIssue>>).detail;
      if (
        detail?.id &&
        detail.module &&
        detail.location &&
        detail.title
      ) {
        const incident: SystemHealthIssue = {
          id: detail.id,
          severity: detail.severity || "CRITICAL",
          module: detail.module,
          location: detail.location,
          title: detail.title,
          reason: detail.reason || "An operation failed; persistence is being verified.",
          recommendation: detail.recommendation || "Review the failed workflow, fix the cause and rerun diagnostics.",
          timestamp: detail.timestamp || new Date().toISOString(),
        };
        localIncidentsRef.current = [
          ...localIncidentsRef.current.filter((item) => item.id !== incident.id),
          incident,
        ].slice(-20);
        setData((previous) => {
          const priorIssues = previous?.issues || [];
          const alreadyVisible = priorIssues.some((item) => item.id === incident.id);
          const issues = alreadyVisible ? priorIssues : [...priorIssues, incident];
          const baseTotal = Math.max(previous?.total_issues || 0, priorIssues.length);
          const countAdded = alreadyVisible ? 0 : 1;
          const criticalAdded = countAdded && incident.severity === "CRITICAL" ? 1 : 0;
          const warningAdded = countAdded && incident.severity === "WARNING" ? 1 : 0;
          const infoAdded = countAdded && incident.severity === "INFO" ? 1 : 0;

          return {
            is_healthy: false,
            health_score: Math.min(previous?.health_score ?? 0, 90),
            critical_count: (previous?.critical_count || 0) + criticalAdded,
            warning_count: (previous?.warning_count || 0) + warningAdded,
            info_count: (previous?.info_count || 0) + infoAdded,
            total_issues: baseTotal + countAdded,
            checked_at: previous?.checked_at || incident.timestamp,
            organization_id: previous?.organization_id || null,
            issues,
            passed_checks: previous?.passed_checks || [],
            error: previous?.error || null,
          };
        });
      }

      setJustResolvedMessage(null);
      setActionMessage(null);
      fetchDiagnostics();
    };

    const handlePersisted = (event: Event) => {
      const detail = (event as CustomEvent<{ ephemeralId?: string; issueId?: string }>).detail;
      if (detail?.ephemeralId) {
        localIncidentsRef.current = localIncidentsRef.current.filter((item) => item.id !== detail.ephemeralId);
        setData((previous) => {
          if (!previous) return previous;
          const issues = previous.issues.filter((item) => item.id !== detail.ephemeralId);
          return { ...previous, issues, total_issues: Math.max(0, previous.total_issues - (issues.length === previous.issues.length ? 0 : 1)) };
        });
      }
      fetchDiagnostics();
    };

    const handleResolved = () => {
      // A DOM event by itself does not prove that the diagnostic condition is fixed.
      fetchDiagnostics();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("system-health-incident-reported", handleIncident);
      window.addEventListener("system-health-incident-persisted", handlePersisted);
      window.addEventListener("system-health-incident-resolved", handleResolved);
    }

    return () => {
      clearInterval(interval);
      cleanupMonitoring();
      if (typeof window !== "undefined") {
        window.removeEventListener("system-health-incident-reported", handleIncident);
        window.removeEventListener("system-health-incident-persisted", handlePersisted);
        window.removeEventListener("system-health-incident-resolved", handleResolved);
      }
    };
  }, [fetchDiagnostics]);

  const handleResolveIssue = async (issueId: string, module?: string) => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const activeOrg = data?.organization_id;

    // Computed database findings may be cleared only by correcting the source data.
    if (!uuidPattern.test(issueId)) {
      setActionMessage(
        issueId.startsWith("ephemeral-")
          ? "ত্রুটিটি তাৎক্ষণিকভাবে ধরা হয়েছে, কিন্তু database persistence এখনো নিশ্চিত নয়। সংযোগ ঠিক করে পুনরায় পরীক্ষা করুন।"
          : "এটি computed health finding। মূল database বা workflow সমস্যা ঠিক করে rescan করুন; সরাসরি dismiss করা যাবে না।"
      );
      return;
    }

    if (!activeOrg) {
      setActionMessage("সক্রিয় organization যাচাই করা যায়নি। Incident পরিবর্তন করা হয়নি।");
      return;
    }

    setIsResolvingIssueId(issueId);
    setActionMessage(null);

    try {
      const resolvedCount = await resolveSystemRuntimeIssueAction({
        organizationId: activeOrg,
        issueId,
      });

      if (resolvedCount !== 1) {
        setActionMessage("Incident database-এ resolve হয়নি। Permission, organization scope এবং database response পরীক্ষা করুন।");
        return;
      }

      const verification = await getSystemHealthDiagnosticsAction(activeOrg);
      setData(verification);

      if (verification.issues.some((issue) => issue.id === issueId)) {
        setActionMessage("Database resolve response দিয়েছে, কিন্তু rescan-এ incident এখনো আছে। Issue-টিকে solved হিসেবে দেখানো হয়নি।");
        return;
      }

      const moduleName = module || "সনাক্তকৃত সমস্যা";
      setJustResolvedMessage(
        verification.is_healthy && verification.total_issues === 0
          ? "✅ সমস্যা সমাধান সম্পন্ন (" + moduleName + ") — পুনঃপরীক্ষায় সব সংজ্ঞায়িত health check পাস করেছে।"
          : "✅ Incident resolve করা হয়েছে (" + moduleName + ") — তবে আরও " + verification.total_issues + "টি health issue বা warning বাকি আছে।"
      );
      setTimeout(() => setJustResolvedMessage(null), 12_000);
      fetchDiagnostics();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown resolution error";
      setActionMessage("Incident resolve যাচাই করা যায়নি: " + message);
    } finally {
      setIsResolvingIssueId(null);
    }
  };


  if (!data) {
    if (variant === "badge") {
      return <span role="status" className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">স্ট্যাটাস যাচাই হচ্ছে…</span>;
    }
    return (
      <aside role="status" aria-live="polite" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950">
        সিস্টেমের health status যাচাই করা হচ্ছে। ফলাফল পাওয়া না যাওয়া পর্যন্ত সিস্টেমকে healthy ধরা হচ্ছে না।
      </aside>
    );
  }

  const hasIssues = data.is_healthy !== true || data.total_issues > 0 || data.issues.length > 0;

  return (
    <>
      {/* 0. RESOLVED NOTIFICATION BANNER (Shows when an issue was solved) */}
      {justResolvedMessage && variant !== "badge" && (
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

      {/* 1. Persistent alert banner: unresolved incidents remain visible until a verified rescan clears them. */}
      {hasIssues && variant !== "badge" && (
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
                ডেটাবেজ ও সিস্টেমে {data.total_issues}টি অসামঞ্জস্যতা সনাক্ত হয়েছে (স্বাস্থ্য স্কোর:{" "}
                <span className="font-semibold text-rose-600 dark:text-rose-400">{data.health_score}%</span>)।
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

            </div>
          </div>
        </aside>
      )}

      {/* 2. HEADER COMPACT BADGE / TRIGGER */}
      {(variant === "badge" || variant === "full") && (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          title={
            hasIssues
              ? `সিস্টেমে ${data.total_issues}টি বিষয় সমাধানের অপেক্ষায়`
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
              <span>সতর্কবার্তা ({data.total_issues})</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">সিস্টেম সুস্থ</span>
              <span className="sm:hidden">সুস্থ</span>
              <span className="text-[10px] opacity-80">({data.health_score}%)</span>
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
                    সর্বশেষ স্ক্যান: {new Date(data.checked_at).toLocaleTimeString("bn-BD")} | স্কোর:{" "}
                    <span className="font-semibold">{data.health_score}/100</span>
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
              {actionMessage && (
                <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {actionMessage}
                </div>
              )}
              {hasIssues ? (
                <>
                  <div className="text-xs text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 rounded-lg">
                    সিস্টেমের নির্ভরযোগ্যতা নিশ্চিত রাখতে নিচের অসঙ্গতিগুলো পাওয়া গেছে। এগুলো সমাধান
                    না করা পর্যন্ত এই অ্যালার্ট সিস্টেম ড্যাশবোর্ডে দৃশ্যমান থাকবে:
                  </div>

                  <div className="space-y-3">
                    {data.issues.map((issue: SystemHealthIssue) => (
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
                          {/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(issue.id) ? (
                            <button
                              type="button"
                              onClick={() => handleResolveIssue(issue.id, issue.module)}
                              disabled={isPending || isResolvingIssueId === issue.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-2xs transition-colors disabled:opacity-50"
                            >
                              <Wrench className="h-3.5 w-3.5" />
                              <span>{isResolvingIssueId === issue.id ? "পুনঃপরীক্ষা হচ্ছে…" : "সমাধান যাচাই করে incident resolve করুন"}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              মূল database বা workflow কারণ ঠিক করে “পুনরায় পরীক্ষা” চাপুন। এই finding সরাসরি dismiss করা যাবে না।
                            </span>
                          )}
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
                      {data.passed_checks.map((check: string) => (
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
