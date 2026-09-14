"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, Mail, ArrowRight, ShieldCheck } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { mapSafeAuthError } from "@/lib/auth/safe-errors";
import { createBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/app/dashboard";

  // Initial fields MUST be blank — zero pre-filled demo emails or passwords
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(mapSafeAuthError(error.message));
        setIsLoading(false);
        return;
      }

      if (!data.user) {
        setErrorMessage("অ্যালার্ট: ইউজার ভেরিফিকেশন পাওয়া যায়নি।");
        setIsLoading(false);
        return;
      }

      // Check MFA Assurance Level
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factorData } = await supabase.auth.mfa.listFactors();

      const hasVerifiedFactors = Boolean(
        factorData?.all && factorData.all.some((f: { status: string }) => f.status === "verified")
      );

      if (hasVerifiedFactors && aalData?.currentLevel === "aal1") {
        // MFA challenge required -> Redirect to /auth/mfa
        router.push(`/auth/mfa?redirectTo=${encodeURIComponent(redirectTo)}`);
        return;
      }

      // Direct access allowed -> Redirect to target route
      router.push(redirectTo);
    } catch (err: unknown) {
      const msg = err instanceof Error ? mapSafeAuthError(err.message) : "লগইন করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।";
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        {/* Logo & Header */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center space-x-2">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white font-bold flex items-center justify-center text-2xl shadow-lg">
              OH
            </div>
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold text-white tracking-tight">
            {HOSPITAL_METADATA.name}
          </h1>
          <p className="text-xs text-sky-400 font-medium">
            Unified Hospital Management System (HMS) Production Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl backdrop-blur-xs">
          <div className="flex items-center gap-2 mb-6 p-3 bg-slate-900/60 rounded-xl border border-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-[11px] text-slate-300">
              সুরক্ষিত হাসপাতাল অ্যাডমিন ও স্টাফ অথেন্টিকেশন পোর্টাল
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-4 p-3.5 bg-red-950/80 border border-red-700/60 rounded-xl text-xs text-red-200 flex items-start gap-2"
            >
              <span className="text-base leading-none">⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="official-email" className="block text-xs font-semibold text-slate-300 mb-1">
                অফিসিয়াল ইমেইল অ্যাড্রেস (Official Email)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="official-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@onneshahospital.com"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="access-password" className="block text-xs font-semibold text-slate-300">
                  অ্যাক্সেস পাসওয়ার্ড (Password)
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-sky-400 hover:text-sky-300 transition"
                >
                  পাসওয়ার্ড ভুলে গেছেন?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="access-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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
                <span>লগইন তথ্য যাচাই করা হচ্ছে...</span>
              ) : (
                <>
                  <span>লগইন করুন (Sign In)</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Back to website */}
        <div className="text-center text-xs text-slate-500">
          <Link href="/" className="hover:text-sky-400 transition">
            ← মূল পাবলিক ওয়েবসাইটে ফিরে যান
          </Link>
        </div>
      </div>
    </div>
  );
}
