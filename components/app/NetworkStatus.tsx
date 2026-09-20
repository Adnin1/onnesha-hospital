"use client";

import { useState, useEffect } from "react";

export default function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof window === "undefined") return true;
    return navigator.onLine;
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      setDismissed(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setDismissed(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline || dismissed) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white px-4 py-3 flex items-center justify-between text-sm shadow-lg"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>
          আপনি অফলাইন আছেন। ক্লিনিক্যাল ও আর্থিক ডেটা সেভ করতে ইন্টারনেট সংযোগ প্রয়োজন।
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 px-2 py-1 text-xs bg-red-700 hover:bg-red-800 rounded focus:outline-none focus:ring-2 focus:ring-white"
        aria-label="বিজ্ঞপ্তি বন্ধ করুন"
      >
        ✕
      </button>
    </div>
  );
}
