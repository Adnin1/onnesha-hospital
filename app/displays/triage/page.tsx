"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Maximize2,
  Minimize2,
  Clock,
  Radio,
  HeartPulse,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { createBrowserClientInstance } from "@/lib/supabase/browser";

interface TriageCase {
  id: string;
  uhid: string;
  triagePriority: "RED" | "YELLOW" | "GREEN";
  chiefComplaint: string;
  assignedBed?: string;
  arrivedAt: string;
  elapsedMinutes: number;
  status: "TRIAGED" | "ATTENDING" | "ADMITTED" | "STABILIZED";
}

export default function EmergencyTriageDisplayPage() {
  const [cases, setCases] = useState<TriageCase[]>([]);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isBangla, setIsBangla] = useState<boolean>(true);
  const wakeLockRef = useRef<unknown>(null);

  // Bangladesh Clock Ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: "Asia/Dhaka",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Screen Wake Lock API
  useEffect(() => {
    let released = false;
    async function requestWakeLock() {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        try {
          const lock = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<unknown> } }).wakeLock.request("screen");
          if (!released) wakeLockRef.current = lock;
        } catch {
          // ignore
        }
      }
    }
    void requestWakeLock();
    return () => {
      released = true;
      if (wakeLockRef.current && typeof (wakeLockRef.current as { release: () => Promise<void> }).release === "function") {
        (wakeLockRef.current as { release: () => Promise<void> }).release().catch(() => {});
      }
    };
  }, []);

  // Live Emergency Triage Cases Poller / Realtime
  useEffect(() => {
    async function fetchTriageCases() {
      try {
        const supabase = createBrowserClientInstance();
        const { data } = await supabase
          .from("patient_visits")
          .select("id, visit_number, triage_priority, chief_complaint, admitted_at, status")
          .eq("visit_type", "EMERGENCY")
          .order("admitted_at", { ascending: false })
          .limit(20);

        if (data && data.length > 0) {
          const now = Date.now();
          const mapped: TriageCase[] = data.map((v) => {
            const arrTime = new Date(v.admitted_at || Date.now()).getTime();
            const elapsed = Math.max(1, Math.round((now - arrTime) / 60000));
            return {
              id: v.id,
              uhid: v.visit_number || `EMR-${v.id.slice(0, 4)}`,
              triagePriority: (v.triage_priority as TriageCase["triagePriority"]) || "YELLOW",
              chiefComplaint: v.chief_complaint || "Emergency triage intake",
              assignedBed: "Bay " + (v.id.charCodeAt(0) % 6 + 1),
              arrivedAt: new Date(v.admitted_at || Date.now()).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
              elapsedMinutes: elapsed,
              status: "TRIAGED",
            };
          });
          setCases(mapped);
        } else {
          // Default empty or standby state
          setCases([]);
        }
      } catch (err) {
        console.error("[Emergency Triage Display] fetch error:", err);
      }
    }

    void fetchTriageCases();
    const interval = setInterval(fetchTriageCases, 5000);
    return () => clearInterval(interval);
  }, []);

  const redCases = cases.filter((c) => c.triagePriority === "RED");
  const yellowCases = cases.filter((c) => c.triagePriority === "YELLOW");
  const greenCases = cases.filter((c) => c.triagePriority === "GREEN");

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Top TV Header */}
      <header className="h-20 bg-rose-950/60 border-b border-rose-900/60 px-6 flex items-center justify-between shadow-xl shrink-0">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white font-black flex items-center justify-center text-2xl shadow-lg border border-rose-400">
            <Radio className="w-7 h-7 animate-pulse text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl lg:text-2xl font-black tracking-tight text-white uppercase">
                {isBangla ? "২৪/৭ জরুরি ও ক্যাজুয়ালটি ট্রায়াজ বোর্ড" : "24/7 EMERGENCY & CASUALTY TRIAGE BOARD"}
              </h1>
              <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                LIVE
              </span>
            </div>
            <p className="text-xs text-rose-300 font-medium">
              {isBangla ? "অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার | বগুড়া" : "Annesha Hospital & Diagnostic Center | Bogura"}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="bg-slate-950/80 border border-rose-900/60 px-4 py-2 rounded-xl flex items-center space-x-2 text-rose-300 font-mono text-lg font-bold">
            <Clock className="w-5 h-5 text-rose-400" />
            <span>{currentTime || "12:00:00 PM"}</span>
            <span className="text-[10px] text-slate-500">BST</span>
          </div>

          <button
            onClick={() => setIsBangla(!isBangla)}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-700 transition"
          >
            {isBangla ? "EN" : "বাংলা"}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main 3-Column Triage Lanes */}
      <main className="grow p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden">
        {/* RED LANE (Immediate / Resuscitation) */}
        <section className="bg-slate-900/90 rounded-3xl border-2 border-rose-600/70 flex flex-col shadow-2xl overflow-hidden">
          <div className="bg-rose-900/40 border-b border-rose-800/80 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 animate-bounce" />
              <h2 className="font-black text-rose-200 text-sm tracking-wider uppercase">
                {isBangla ? "লাল (রেড) : অতি-জরুরি / পুনরুজ্জীবন" : "RED LANE : RESUSCITATION"}
              </h2>
            </div>
            <span className="bg-rose-600 text-white font-mono font-bold text-xs px-2.5 py-0.5 rounded-full">
              {redCases.length}
            </span>
          </div>

          <div className="grow p-4 space-y-3 overflow-y-auto">
            {redCases.length > 0 ? (
              redCases.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-950 border-2 border-rose-500/80 rounded-2xl p-4 shadow-lg animate-pulse"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black text-rose-400 font-mono">{c.uhid}</span>
                    <span className="text-xs font-bold bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-800">
                      {c.assignedBed}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 font-medium line-clamp-2">
                    {c.chiefComplaint}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono border-t border-slate-900 pt-2">
                    <span>Arrived: {c.arrivedAt}</span>
                    <span className="text-rose-400 font-bold">{c.elapsedMinutes}m ago</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                {isBangla ? "বর্তমানে কোনো রেড ট্রায়াজ রোগী নেই" : "No active critical resuscitation cases"}
              </div>
            )}
          </div>
        </section>

        {/* YELLOW LANE (Urgent / Observation) */}
        <section className="bg-slate-900/90 rounded-3xl border-2 border-amber-500/60 flex flex-col shadow-2xl overflow-hidden">
          <div className="bg-amber-900/40 border-b border-amber-800/80 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-amber-400" />
              <h2 className="font-black text-amber-200 text-sm tracking-wider uppercase">
                {isBangla ? "হলুদ (ইয়েলো) : জরুরি পর্যবেক্ষণ" : "YELLOW LANE : URGENT OBSERVATION"}
              </h2>
            </div>
            <span className="bg-amber-600 text-white font-mono font-bold text-xs px-2.5 py-0.5 rounded-full">
              {yellowCases.length}
            </span>
          </div>

          <div className="grow p-4 space-y-3 overflow-y-auto">
            {yellowCases.length > 0 ? (
              yellowCases.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-950 border border-amber-500/60 rounded-2xl p-4 shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black text-amber-300 font-mono">{c.uhid}</span>
                    <span className="text-xs font-bold bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800">
                      {c.assignedBed}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 font-medium line-clamp-2">
                    {c.chiefComplaint}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono border-t border-slate-900 pt-2">
                    <span>Arrived: {c.arrivedAt}</span>
                    <span className="text-amber-400 font-bold">{c.elapsedMinutes}m ago</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                {isBangla ? "কোনো ইয়েলো ট্রায়াজ রোগী নেই" : "No active urgent cases"}
              </div>
            )}
          </div>
        </section>

        {/* GREEN LANE (Standard / Non-urgent) */}
        <section className="bg-slate-900/90 rounded-3xl border-2 border-emerald-500/60 flex flex-col shadow-2xl overflow-hidden">
          <div className="bg-emerald-900/40 border-b border-emerald-800/80 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h2 className="font-black text-emerald-200 text-sm tracking-wider uppercase">
                {isBangla ? "সবুজ (গ্রীন) : সাধারণ জরুরি সেবা" : "GREEN LANE : STANDARD / SUB-ACUTE"}
              </h2>
            </div>
            <span className="bg-emerald-600 text-white font-mono font-bold text-xs px-2.5 py-0.5 rounded-full">
              {greenCases.length}
            </span>
          </div>

          <div className="grow p-4 space-y-3 overflow-y-auto">
            {greenCases.length > 0 ? (
              greenCases.map((c) => (
                <div
                  key={c.id}
                  className="bg-slate-950 border border-emerald-500/50 rounded-2xl p-4 shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black text-emerald-400 font-mono">{c.uhid}</span>
                    <span className="text-xs font-bold bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                      {c.assignedBed}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2 font-medium line-clamp-2">
                    {c.chiefComplaint}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono border-t border-slate-900 pt-2">
                    <span>Arrived: {c.arrivedAt}</span>
                    <span className="text-emerald-400 font-bold">{c.elapsedMinutes}m ago</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                {isBangla ? "কোনো গ্রীন ট্রায়াজ রোগী নেই" : "No active green cases"}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="h-12 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          <span>{isBangla ? "ইমার্জেন্সি ট্রায়াজ লাইভ সিঙ্ক" : "Emergency Triage Live Sync Active"}</span>
        </span>
        <span className="text-slate-500 font-mono text-[11px]">
          Onnesha Emergency Command Center • 24/7 Casualty
        </span>
      </footer>
    </div>
  );
}
