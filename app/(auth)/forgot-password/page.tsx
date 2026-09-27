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
        redirectTo: `${siteUrl}/auth/confirm`,
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
            <div className="text-center space-y-4 py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-white">পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                আপনার রেজিস্টার্ড ইমেইল <span className="font-semibold text-sky-400">{email}</span>-এ সিকিউর পাসওয়ার্ড রিকভারি লিংক পাঠানো হয়েছে।
              </p>

              <div className="p-3.5 bg-amber-950/60 border border-amber-600/70 rounded-xl text-left text-xs text-amber-200 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>জরুরি নির্দেশনা: ইনবক্সে না পেলে Spam চেক করুন</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  গুগল/জিমেইল স্বয়ংক্রিয় সিকিউরিটি মেইলগুলোকে অনেক সময় প্রাইমারি ইনবক্সের বদলে <strong>Spam (স্প্যাম) ফোল্ডারে</strong> রেখে দেয়। আপনার জিমেইল অ্যাপের বাম পাশের মেনু থেকে <strong>Spam</strong> ফোল্ডারটি ওপেন করুন।
                </p>
                <div className="pt-1 flex flex-col gap-1 text-[11px] text-slate-300">
                  <span>১. স্প্যাম ফোল্ডার থেকে ইমেইলটি খুলুন।</span>
                  <span>২. <strong>Reset Password</strong> লিংকে ক্লিক করুন।</span>
                  <span>৩. লিংকে প্রবেশ করে ফেসবুক বা জিমেইলের মতোই <strong>নিজের ইচ্ছামতো যেকোনো নতুন পাসওয়ার্ড</strong> টাইপ করে সাবমিট করুন।</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  আবার ইমেইল পাঠাতে চান?
                </button>
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
                <span>আপনার Supabase Auth-এ নিবন্ধিত login/recovery email লিখুন। রিসেট লিংক পাঠানো হবে।</span>
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
