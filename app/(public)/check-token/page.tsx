"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { RefreshCw, AlertCircle, Clock, Loader2 } from "lucide-react";
import {
  getLiveWaitingQueueAction,
  getPublicTokenStatusAction,
  PublicTokenStatusResult,
} from "@/lib/public/actions";

interface QueueItem {
  id: string;
  doctor_name: string;
  room_number: string;
  token_number: string;
  status: "waiting" | "calling" | "serving" | "done" | "skipped";
  called_at?: string;
}

export default function CheckTokenPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchToken, setSearchToken] = useState("");
  const [searchResult, setSearchResult] = useState<PublicTokenStatusResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let inFlight = false;

    const loadQueue = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      if (inFlight) return;
      inFlight = true;

      try {
        const res = await getLiveWaitingQueueAction();
        if (isMounted) {
          if (res.success) {
            setQueue(res.queue);
          }
          setLoading(false);
        }
      } finally {
        inFlight = false;
      }
    };

    void loadQueue();
    const timer = setInterval(() => {
      void loadQueue();
    }, 15000); // 15s live refresh

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void loadQueue();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = searchToken.trim().replace(/^#/, "").toUpperCase();
    if (!cleaned) return;

    setHasSearched(true);
    setIsSearching(true);

    try {
      // 1. Authoritative backend RPC lookup
      const authRes = await getPublicTokenStatusAction(cleaned);

      if (authRes.success && authRes.found) {
        setSearchResult(authRes);
      } else {
        // 2. Check local loaded queue fallback
        const localFound = queue.find(
          (q) => q.token_number.replace(/^#/, "").toUpperCase() === cleaned.toUpperCase()
        );

        if (localFound) {
          setSearchResult({
            success: true,
            found: true,
            token_number: localFound.token_number,
            status: localFound.status,
            status_label:
              localFound.status === "serving"
                ? "In Consultation Room"
                : localFound.status === "calling"
                ? "Now Calling"
                : "Waiting in Queue",
            doctor_name: localFound.doctor_name,
            room_number: localFound.room_number,
          });
        } else {
          setSearchResult(authRes);
        }
      }
    } catch (err: unknown) {
      console.error("[CheckTokenPage] handleSearch error:", err);
      setSearchResult({
        success: false,
        found: false,
        message: "Failed to check token status. Please check connection and try again.",
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="py-12 bg-slate-900 text-slate-100 min-h-[85vh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center space-x-2 bg-sky-500/20 text-sky-300 px-3 py-1 rounded-full text-xs font-semibold mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live Digital Waiting Queue & Triage Board</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Chamber Token Status & Display
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Auto-refreshing every 15s directly synced with doctor consultation rooms.
          </p>
        </div>

        {/* Token Search Box */}
        <div className="max-w-md mx-auto mb-10">
          <form
            onSubmit={handleSearch}
            className="flex rounded-xl bg-slate-800 border border-slate-700 p-1.5 shadow-lg"
          >
            <input
              type="text"
              aria-label="Enter your token number"
              placeholder="Enter your token number (e.g. 101, A-01)..."
              value={searchToken}
              onChange={(e) => setSearchToken(e.target.value)}
              className="grow bg-transparent px-3 min-h-[44px] text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-lg uppercase font-mono"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs px-4 py-2 min-h-[44px] rounded-lg transition shrink-0 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
            >
              {isSearching ? "Checking..." : "Check Status"}
            </button>
          </form>

          {/* Search Result Feedback */}
          {hasSearched && (
            <div className="mt-4 p-4 rounded-xl border transition">
              {isSearching ? (
                <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl text-slate-300 text-xs flex items-center justify-center space-x-2">
                  <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                  <span>Querying chamber status for token #{searchToken}...</span>
                </div>
              ) : searchResult && searchResult.found ? (
                <div
                  className={`p-4 rounded-xl text-xs border ${
                    searchResult.status === "serving"
                      ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-200"
                      : searchResult.status === "calling"
                      ? "bg-amber-950/80 border-amber-500/50 text-amber-200"
                      : searchResult.status === "done"
                      ? "bg-slate-800 border-slate-700 text-slate-300"
                      : "bg-sky-950/80 border-sky-500/50 text-sky-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white">
                      Token: {searchResult.token_number}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded font-bold uppercase text-[10px] ${
                        searchResult.status === "serving"
                          ? "bg-emerald-500 text-slate-950"
                          : searchResult.status === "calling"
                          ? "bg-amber-500 text-slate-950 animate-pulse"
                          : searchResult.status === "done"
                          ? "bg-slate-700 text-slate-300"
                          : "bg-sky-500 text-slate-950"
                      }`}
                    >
                      {searchResult.status_label || searchResult.status}
                    </span>
                  </div>
                  {searchResult.doctor_name && (
                    <p>
                      <strong>Doctor:</strong> {searchResult.doctor_name}
                    </p>
                  )}
                  {searchResult.room_number && (
                    <p>
                      <strong>Chamber Room:</strong> {searchResult.room_number}
                    </p>
                  )}
                  {searchResult.queue_ahead !== undefined && searchResult.status === "waiting" && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-sky-300">
                      <Clock className="w-3 h-3" />
                      <span>{searchResult.queue_ahead} patient(s) waiting ahead in this chamber.</span>
                    </p>
                  )}
                  <p className="mt-2 text-[11px]">
                    {searchResult.status === "serving"
                      ? "Your token is currently being attended by the doctor inside the chamber."
                      : searchResult.status === "calling"
                      ? "Attention! Your token is being called right now. Please proceed to the room immediately."
                      : searchResult.status === "done"
                      ? "Consultation Completed: Your consultation has concluded for today."
                      : searchResult.status === "skipped"
                      ? "This token was marked as skipped or cancelled. Please speak with the reception desk."
                      : "Please wait in the patient lobby and monitor the display screen for your token call."}
                  </p>
                </div>
              ) : searchResult?.has_other_date ? (
                <div className="bg-slate-800 border border-amber-600/40 p-4 rounded-xl text-amber-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Token &quot;{searchToken}&quot; is scheduled for a different date:{" "}
                    <strong>{searchResult.scheduled_date}</strong>.
                  </span>
                </div>
              ) : (
                <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl text-slate-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Token &quot;{searchToken}&quot; was not found in the active waiting queue for today.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Large Digital Display Screen for Waiting Halls */}
        <div className="bg-slate-800/90 rounded-3xl border border-slate-700/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xs">
          <div className="flex justify-between items-center pb-6 border-b border-slate-700 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                NOW SERVING IN CHAMBERS
              </h2>
              <p className="text-xs text-slate-400">
                Hospital Hall Screen • Real-Time Digital Token Display
              </p>
            </div>
            <div className="flex items-center space-x-2 text-xs text-emerald-400 font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>LIVE REFRESHING</span>
            </div>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin mb-2" />
              <p className="text-xs">Connecting to chamber display board...</p>
            </div>
          )}

          {!loading && queue.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <p className="text-sm font-semibold text-slate-300">No active patient tokens in queue right now.</p>
              <p className="text-xs mt-1 text-slate-500">New tokens will appear here automatically as doctor chambers open.</p>
            </div>
          )}

          {!loading && queue.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {queue.map((item) => {
                const isServing = item.status === "serving";
                const isCalling = item.status === "calling";

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-5 border transition flex flex-col justify-between ${
                      isServing
                        ? "bg-slate-900 border-emerald-500/80 ring-2 ring-emerald-500/20"
                        : isCalling
                        ? "bg-slate-900 border-amber-500/80 ring-2 ring-amber-500/30 animate-pulse"
                        : "bg-slate-900/60 border-slate-700/60"
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-xs font-bold text-sky-400 font-mono">
                          {item.room_number}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isServing
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : isCalling
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-slate-700 text-slate-400"
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-white line-clamp-1">
                        {item.doctor_name}
                      </h3>
                    </div>

                    <div className="my-4 text-center py-4 bg-slate-950/80 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block">
                        Current Token
                      </span>
                      <span
                        className={`text-3xl sm:text-4xl font-black font-mono tracking-wider ${
                          isServing
                            ? "text-emerald-400"
                            : isCalling
                            ? "text-amber-400"
                            : "text-slate-300"
                        }`}
                      >
                        {item.token_number}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex justify-between items-center">
                      <span className="text-emerald-400 font-medium">● Chamber Active</span>
                      {item.called_at && (
                        <span className="font-mono text-slate-500">{item.called_at}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-8 text-center text-xs text-slate-400">
          Need a token?{" "}
          <Link href="/appointment" className="text-sky-400 hover:underline font-semibold">
            Book an appointment online
          </Link>{" "}
          or visit our ground floor reception counter.
        </div>
      </div>
    </div>
  );
}
