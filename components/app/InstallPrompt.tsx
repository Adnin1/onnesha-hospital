"use client";

import { useState, useEffect } from "react";
import { X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem("ohms_install_dismissed") === "1";
    } catch {
      return false;
    }
  });
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || isStandalone || dismissed) return;

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
  }, [isStandalone, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem("ohms_install_dismissed", "1");
    } catch {
      // safe fallback if storage is restricted
    }
  };

  if (isStandalone || dismissed || !deferredPrompt) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    handleDismiss();
  }

  return (
    <aside
      role="region"
      aria-label="Install Onnesha Hospital Web Application"
      className="install-prompt fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-84 z-40 bg-white border border-slate-200/90 rounded-2xl shadow-xl p-4 flex items-start gap-3 backdrop-blur-xs transition-all"
    >
      <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
        <Download className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">অ্যাপ ইনস্টল করুন</p>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="ইনস্টল প্রম্পট বন্ধ করুন"
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          দ্রুত ওপিডি এবং হাসপাতাল সেবায় অ্যাক্সেস পেতে Onnesha HMS অ্যাপ ইনস্টল করুন।
        </p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="px-3.5 py-1.5 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-2xs transition"
          >
            ইনস্টল করুন
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 rounded-lg transition"
          >
            পরে
          </button>
        </div>
      </div>
    </aside>
  );
}
