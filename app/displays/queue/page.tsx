"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Activity,
  Clock,
  Sparkles,
} from "lucide-react";
import { getLiveWaitingQueueAction } from "@/lib/public/actions";

interface QueueItem {
  id: string;
  token_number: string;
  department: string;
  doctor_name: string;
  room_number?: string;
  status: "CALLED" | "IN_ROOM" | "WAITING";
  called_at?: string;
}

/**
 * Synthesizes a pleasant 3-tone hospital lobby chime using Web Audio API
 * Tone sequence: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz)
 */
function playQueueChime(audioCtx: AudioContext | null): void {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime;
    const notes = [
      { freq: 523.25, time: 0.0, dur: 0.25 }, // C5
      { freq: 659.25, time: 0.15, dur: 0.3 },  // E5
      { freq: 783.99, time: 0.32, dur: 0.55 }, // G5
    ];

    notes.forEach((n) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(n.freq, now + n.time);

      gain.gain.setValueAtTime(0.001, now + n.time);
      gain.gain.exponentialRampToValueAtTime(0.25, now + n.time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);
    });
  } catch (err: unknown) {
    console.warn("[Queue Display] Audio chime exception:", err);
  }
}

export default function QueueDisplayPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentCalling, setCurrentCalling] = useState<QueueItem | null>(null);
  const [lastCalledToken, setLastCalledToken] = useState<string>("");
  const [currentTime, setCurrentTime] = useState<string>("");
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [audioBlocked, setAudioBlocked] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isBangla, setIsBangla] = useState<boolean>(true);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [staleSeconds, setStaleSeconds] = useState<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<unknown>(null);
  const lastSuccessRef = useRef<number>(Date.now());

  // User gesture handler to unblock AudioContext on restrictive TV browsers
  const unblockAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      } catch {
        // Safe ignore
      }
    }

    if (audioCtxRef.current) {
      audioCtxRef.current
        .resume()
        .then(() => {
          setAudioBlocked(false);
          setAudioEnabled(true);
          playQueueChime(audioCtxRef.current);
        })
        .catch(() => {
          setAudioBlocked(true);
        });
    }
  }, []);

  // Listen for user tap anywhere on screen to unblock audio if currently suspended
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUserGesture = () => {
      if (audioBlocked) {
        unblockAudio();
      }
    };
    window.addEventListener("pointerdown", handleUserGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
    };
  }, [audioBlocked, unblockAudio]);

  // Initialize Web Audio Context upon user toggle
  const toggleAudio = () => {
    if (!audioEnabled) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
          if (audioCtxRef.current.state === "suspended") {
            audioCtxRef.current.resume().catch(() => {
              setAudioBlocked(true);
            });
          }
          playQueueChime(audioCtxRef.current);
          setAudioEnabled(true);
          setAudioBlocked(false);
        }
      } catch (err) {
        console.error("Audio initialization error:", err);
        setAudioBlocked(true);
      }
    } else {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      setAudioEnabled(false);
      setAudioBlocked(false);
    }
  };

  // Screen Wake Lock API for 24/7 TV Kiosk Display
  useEffect(() => {
    let released = false;

    async function requestWakeLock() {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        try {
          const lock = await (navigator as unknown as { wakeLock: { request: (type: string) => Promise<unknown> } }).wakeLock.request("screen");
          if (!released) {
            wakeLockRef.current = lock;
            setWakeLockActive(true);
          }
        } catch {
          setWakeLockActive(false);
        }
      }
    }

    void requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (wakeLockRef.current && typeof (wakeLockRef.current as { release: () => Promise<void> }).release === "function") {
        (wakeLockRef.current as { release: () => Promise<void> }).release().catch(() => {});
      }
    };
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Clock Ticker & Stale Watchdog (Auto-refresh after 3 minutes disconnect)
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

      const elapsed = Math.floor((Date.now() - lastSuccessRef.current) / 1000);
      setStaleSeconds(elapsed);

      // Watchdog: If disconnected or frozen for > 3 minutes (180s), reload page to revive connection
      if (elapsed >= 180 && typeof window !== "undefined") {
        console.warn("[Queue Watchdog] Stale duration > 180s. Triggering auto-recovery reload.");
        window.location.reload();
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Live Queue Fetching & Chime Triggering
  const fetchQueueData = useCallback(async () => {
    try {
      const res = await getLiveWaitingQueueAction();
      if (res.success && res.queue) {
        lastSuccessRef.current = Date.now();
        setStaleSeconds(0);

        const mapped: QueueItem[] = res.queue.map((q) => ({
          id: q.id,
          token_number: q.token_number,
          department: "General OPD",
          doctor_name: q.doctor_name,
          room_number: q.room_number || "Room 101",
          status: (q.status === "calling" ? "CALLED" : q.status === "serving" ? "IN_ROOM" : "WAITING") as QueueItem["status"],
          called_at: q.called_at,
        }));

        setQueue(mapped);

        // Find active calling token
        const calling = mapped.find((item) => item.status === "CALLED") || mapped.find((item) => item.status === "IN_ROOM") || null;
        setCurrentCalling(calling);

        // Play chime if token changed
        if (calling && calling.token_number !== lastCalledToken) {
          setLastCalledToken(calling.token_number);
          if (audioEnabled && audioCtxRef.current) {
            playQueueChime(audioCtxRef.current);
          }
        }
      }
    } catch (err) {
      console.error("[Queue Display] fetch error:", err);
    }
  }, [audioEnabled, lastCalledToken]);

  useEffect(() => {
    void fetchQueueData();
    const interval = setInterval(fetchQueueData, 4000);
    return () => clearInterval(interval);
  }, [fetchQueueData]);

  // Separate upcoming waiting from called
  const upcomingTokens = queue.filter((item) => item.status === "WAITING").slice(0, 8);
  const inConsultationTokens = queue.filter((item) => item.status === "IN_ROOM").slice(0, 4);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      {/* Top Banner / TV Kiosk Header */}
      <header className="h-20 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white font-black flex items-center justify-center text-2xl shadow-md border border-sky-400/40">
            OH
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white">
              {isBangla ? "অন্বেষা হাসপাতাল এন্ড ডায়াগনস্টিক সেন্টার" : "ANNESHA HOSPITAL & DIAGNOSTIC CENTER"}
            </h1>
            <p className="text-xs text-sky-400 font-medium tracking-wide">
              {isBangla ? "বহির্বিভাগ (OPD) ডিজিটাল লাইভ টোকেন ডিসপ্লে" : "Outpatient Department (OPD) Live Token Calling Board"}
            </p>
          </div>
        </div>

        {/* Clock & Controls */}
        <div className="flex items-center space-x-4">
          {/* Live Bangladesh Clock */}
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl flex items-center space-x-2 text-emerald-400 font-mono text-lg font-bold shadow-inner">
            <Clock className="w-5 h-5 text-emerald-500 animate-pulse" />
            <span>{currentTime || "12:00:00 PM"}</span>
            <span className="text-[10px] text-slate-500 ml-1">BST</span>
          </div>

          {/* Bilingual Toggle */}
          <button
            onClick={() => setIsBangla(!isBangla)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
          >
            {isBangla ? "EN" : "বাংলা"}
          </button>

          {/* Audio Chime Toggle */}
          <button
            onClick={toggleAudio}
            className={`p-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-semibold ${
              audioEnabled
                ? "bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-950"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
            }`}
            title={audioEnabled ? "Audio Chime Enabled" : "Click to Enable Audio Chime"}
          >
            {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            <span className="hidden sm:inline">{audioEnabled ? "Chime ON" : "Chime OFF"}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Audio Autoplay Unblock Banner */}
      {audioBlocked && (
        <button
          onClick={unblockAudio}
          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer z-50 shrink-0"
        >
          <Volume2 className="w-4 h-4" />
          <span>
            {isBangla
              ? "অডিও ঘোষণা বাজাতে স্ক্রিনের যেকোনো স্থানে স্পর্শ করুন (Click/Tap anywhere to unblock announcement sound)"
              : "Audio announcement blocked by browser policy. Click or tap anywhere to unblock."}
          </span>
        </button>
      )}

      {/* Stale Connection Warning Banner */}
      {staleSeconds > 30 && (
        <div className="w-full bg-rose-600/90 text-white px-4 py-1.5 text-xs font-semibold flex items-center justify-between z-40 shrink-0 px-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>
              {isBangla
                ? `সংযোগ বিঘ্নিত — সর্বশেষ আপডেট ${staleSeconds} সেকেন্ড আগে`
                : `Connection disrupted — Last updated ${staleSeconds}s ago`}
            </span>
          </div>
          <span className="text-[11px] font-mono text-rose-200">
            {isBangla ? "স্বয়ংক্রিয় পুনঃসংযোগ চলমান..." : "Watchdog Reconnecting..."}
          </span>
        </div>
      )}

      {/* Main Display Grid */}
      <main className="grow p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* Left Hero Card: Currently Calling (Col 7) */}
        <section className="lg:col-span-7 flex flex-col">
          <div className="grow bg-gradient-to-br from-sky-950/70 via-slate-900 to-slate-950 rounded-3xl border-2 border-sky-500/50 p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header Badge */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-600/30 border border-sky-400/50 text-sky-300 font-bold text-sm tracking-wider uppercase">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                {isBangla ? "বর্তমান কলিং টোকেন" : "NOW CALLING"}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {wakeLockActive ? "• Display Active (WakeLock ON)" : ""}
              </span>
            </div>

            {/* Token Number Display */}
            <div className="my-auto text-center py-6">
              <p className="text-slate-400 text-sm uppercase tracking-widest font-semibold mb-2">
                {isBangla ? "টোকেন নম্বর" : "TOKEN NUMBER"}
              </p>
              <div className="text-7xl sm:text-8xl md:text-9xl font-black text-amber-300 tracking-tight drop-shadow-[0_10px_20px_rgba(245,158,11,0.3)] animate-pulse">
                {currentCalling ? `#${currentCalling.token_number}` : "--"}
              </div>
            </div>

            {/* Calling Details: Doctor, Room, Dept */}
            <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-6 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">{isBangla ? "কক্ষ নম্বর" : "CONSULTATION ROOM"}</p>
                <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-1">
                  {currentCalling?.room_number || "Room 101"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">{isBangla ? "ডাক্তার ও বিভাগ" : "DOCTOR & SPECIALTY"}</p>
                <p className="text-lg sm:text-xl font-bold text-white mt-1 truncate">
                  {currentCalling?.doctor_name || "Specialist Doctor"}
                </p>
                <p className="text-xs text-sky-400 truncate">{currentCalling?.department || "General Medicine"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Section: In Consultation & Upcoming Waiting Queue (Col 5) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {/* Active In-Consultation Rooms */}
          <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-5 shadow-xl">
            <h2 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              {isBangla ? "পরামর্শ কক্ষে উপস্থিত" : "IN CONSULTATION"}
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {inConsultationTokens.length > 0 ? (
                inConsultationTokens.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-950 border border-emerald-900/50 rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-lg font-black text-emerald-300">#{item.token_number}</span>
                      <p className="text-[10px] text-slate-400 truncate">{item.doctor_name}</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded">
                      {item.room_number || "RM 1"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-center py-4 text-xs text-slate-500">
                  {isBangla ? "বর্তমানে কোনো টোকেন সক্রিয় নেই" : "No tokens currently in consultation"}
                </div>
              )}
            </div>
          </div>

          {/* Upcoming in Waiting Queue */}
          <div className="grow bg-slate-900/80 rounded-3xl border border-slate-800 p-5 shadow-xl flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wider font-bold text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                {isBangla ? "অপেক্ষমান টোকেন তালিকা" : "UPCOMING WAITING TOKENS"}
              </h2>
              <span className="text-[11px] font-mono text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
                {upcomingTokens.length} {isBangla ? "জন অপেক্ষমান" : "waiting"}
              </span>
            </div>

            <div className="grow grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 overflow-hidden">
              {upcomingTokens.length > 0 ? (
                upcomingTokens.map((item, idx) => (
                  <div
                    key={item.id}
                    className="bg-slate-950 border border-slate-800 hover:border-sky-700/60 rounded-xl p-3 flex items-center justify-between transition"
                  >
                    <div>
                      <span className="text-xs text-slate-500 font-mono">#{idx + 1}</span>
                      <p className="text-xl font-black text-white">#{item.token_number}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-sky-400 block truncate max-w-[90px]">
                        {item.department}
                      </span>
                      <span className="text-[9px] text-slate-500 block">
                        {isBangla ? "অপেক্ষায়" : "Waiting"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 sm:col-span-4 lg:col-span-2 text-center my-auto py-8 text-xs text-slate-500">
                  {isBangla ? "লাইনে আর কোনো রোগী অপেক্ষমান নেই" : "No more patients waiting in queue"}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Ticker / Running Footer */}
      <footer className="h-12 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-semibold text-slate-300">
            {isBangla ? "লাইভ আপডেট সক্রিয়" : "Live Synchronization Active"}
          </span>
        </div>
        <div className="truncate text-center text-slate-400 max-w-xl">
          {isBangla
            ? "আপনার টোকেন নম্বর ডাকলে নির্দিষ্ট কক্ষে প্রবেশ করুন। জরুরী সেবার জন্য হেল্পলাইনে যোগাযোগ করুন: 01718835623"
            : "Please proceed to your assigned consultation room when your token is called. Emergency Hotline: 01718835623"}
        </div>
        <div className="text-slate-500 font-mono text-[11px]">
          OHMS v1.1.80
        </div>
      </footer>
    </div>
  );
}
