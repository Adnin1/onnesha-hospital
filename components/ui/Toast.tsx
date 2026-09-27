"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, X, Info } from "lucide-react";

export interface ToastProps {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = "success", onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const bgStyles = {
    success: "bg-emerald-900 text-emerald-50 border-emerald-700 shadow-emerald-950/20",
    error: "bg-rose-900 text-rose-50 border-rose-700 shadow-rose-950/20",
    warning: "bg-amber-900 text-amber-50 border-amber-700 shadow-amber-950/20",
    info: "bg-sky-900 text-sky-50 border-sky-700 shadow-sky-950/20",
  }[type];

  const Icon = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertCircle,
    info: Info,
  }[type];

  return (
    <div
      role="alert"
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border ${bgStyles} transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 max-w-md`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="text-xs font-semibold leading-relaxed flex-1">{message}</span>
      <button
        onClick={onClose}
        className="p-1 hover:bg-white/20 rounded-lg transition shrink-0"
        aria-label="Close notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
