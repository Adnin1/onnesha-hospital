"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || isStandalone) return;

    const mql = window.matchMedia("(display-mode: standalone)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsStandalone(true);
    };
    mql.addEventListener("change", handleChange);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      mql.removeEventListener("change", handleChange);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, [isStandalone]);

  if (isStandalone || dismissed || !deferredPrompt) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 flex items-start gap-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-800">অ্যাপ ইনস্টল করুন</p>
        <p className="text-xs text-slate-500 mt-1">
          Onnesha HMS আপনার ডিভাইসে ইনস্টল করুন — দ্রুত অ্যাক্সেসের জন্য।
        </p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => void handleInstall()}
            className="px-3 py-1.5 text-xs bg-sky-600 text-white rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            ইনস্টল
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 rounded-lg"
          >
            পরে
          </button>
        </div>
      </div>
    </div>
  );
}
