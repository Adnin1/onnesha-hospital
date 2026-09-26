"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { SITE_CONFIG } from "@/config/site";
import { createBrowserClient } from "@/lib/supabase/client";
import { mapSafeAuthError } from "@/lib/auth/safe-errors";

// References server-side self-service contract: requestPasswordResetAction

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserClient();
      const siteUrl = typeof window !== "undefined" ? window.location.origin : SITE_CONFIG.canonicalUrl;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${siteUrl}/reset-password`,
      });

      if (error) {
        setErrorMessage(mapSafeAuthError(error.message));
        setIsLoading(false);
        return;
      }

      setSubmitted(true);
      setIsLoading(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? mapSafeAuthError(err.message) : "পাসওয়ার্ড রিসেট লিংক পাঠাতে ব্যর্থ হয়েছে।";
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white font-bold flex items-center justify-center text-2xl shadow-lg">
              OH
            </div>
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold text-white tracking-tight">
            Reset Access Password
          </h1>
          <p className="text-xs text-sky-400 font-medium">
            {HOSPITAL_METADATA.name} — Self-Service Recovery Portal
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl">
          {submitted ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-white">পাসওয়ার্ড রিসেট রিকোয়েস্ট গৃহীত হয়েছে</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                যদি প্রদানকৃত ইমেইলটি অন্বেষা হাসপাতাল সিস্টেমে রেজিস্টার্ড থাকে, তবে পাসওয়ার্ড রিসেটের সিকিউর লিংক পাঠানো হয়েছে। ইমেইল ইনবক্স বা স্প্যাম ফোল্ডার চেক করুন।
              </p>
              <div className="pt-4 border-t border-slate-700">
                <Link
                  href="/login"
                  className="inline-flex items-center text-xs text-sky-400 hover:text-sky-300 font-semibold"
                >
                  ← লগইন পেজে ফিরে যান
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-slate-900/60 rounded-xl border border-slate-700 text-xs text-slate-300">
                <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>আপনার অফিশিয়াল ইমেইল অ্যাড্রেস লিখুন। রিসেট লিংক পাঠানো হবে।</span>
              </div>

              {errorMessage && (
                <div role="alert" className="p-3.5 bg-red-950/80 border border-red-700/60 rounded-xl text-xs text-red-200 flex items-start gap-2">
                  <span className="text-base leading-none">⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label htmlFor="recovery-email" className="block text-xs font-semibold text-slate-300 mb-1">
                  রেজিস্টার্ড ইমেইল (Official Email)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="recovery-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@onneshahospital.com"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <span>রিকোয়েস্ট পাঠানো হচ্ছে...</span>
                ) : (
                  <>
                    <span>রিসেট লিংক পাঠান</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <Link href="/login" className="text-xs text-slate-400 hover:text-sky-400 transition">
                  ← মনে পড়েছে? লগইন করুন
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
