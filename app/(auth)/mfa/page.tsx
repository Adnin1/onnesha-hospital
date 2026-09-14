"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, KeyRound, ArrowRight, RefreshCw, LogOut } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { createBrowserClient } from "@/lib/supabase/client";

export default function MfaChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/app/dashboard";

  const [otpCode, setOtpCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadMfaFactors() {
      try {
        const supabase = createBrowserClient();
        const { data: userResponse } = await supabase.auth.getUser();

        if (!userResponse.user) {
          router.push("/login");
          return;
        }

        const { data: factorData, error } = await supabase.auth.mfa.listFactors();
        if (error || !factorData) {
          setErrorMessage("MFA ফ্যাক্টর লিস্ট সংগ্রহ করা সম্ভব হয়নি।");
          setIsLoading(false);
          return;
        }

        const verifiedTotp = factorData.totp.find((f: { status: string }) => f.status === "verified");
        if (!verifiedTotp) {
          // No verified factor -> Allow enrollment or direct dashboard access if optional
          router.push(redirectTo);
          return;
        }

        setFactorId(verifiedTotp.id);
        setIsLoading(false);
      } catch {
        setErrorMessage("সিকিউরিটি সার্ভিস কানেকশন এরর।");
        setIsLoading(false);
      }
    }

    void loadMfaFactors();
  }, [router, redirectTo]);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || otpCode.trim().length !== 6) {
      setErrorMessage("অনুগ্রহ করে ৬-সংখ্যার সঠিক অথেন্টিকেটর কোড দিন।");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserClient();
      // 1. Create MFA challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError || !challengeData) {
        setErrorMessage("MFA চ্যালেঞ্জ তৈরি করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
        setIsSubmitting(false);
        return;
      }

      // 2. Verify MFA challenge code -> upgrades session to AAL2
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: otpCode.trim(),
      });

      if (verifyError) {
        setErrorMessage("ভুল বা মেয়াদোত্তীর্ণ ৬-ডিজিটের TOTP কোড। আপনার Authenticator অ্যাপের সাম্প্রতিক কোড লিখুন।");
        setIsSubmitting(false);
        return;
      }

      // 3. Success -> Session elevated to AAL2 -> Redirect to target route
      router.push(redirectTo);
    } catch {
      setErrorMessage("ভেরিফিকেশনে সাময়িক ত্রুটি হয়েছে।");
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 mb-3 border border-amber-500/40">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            2-Factor Security Verification
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {HOSPITAL_METADATA.name} — Mandatory Admin MFA (AAL2) Protection
          </p>
        </div>

        {/* Verification Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-6 p-3 bg-amber-950/40 rounded-xl border border-amber-800/50 text-amber-200 text-xs">
            <ShieldCheck className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              আপনার Google Authenticator, Microsoft Authenticator অথবা 1Password অ্যাপ খুলে ৬-সংখ্যার TOTP কোডটি দিন।
            </span>
          </div>

          {errorMessage && (
            <div role="alert" className="mb-4 p-3.5 bg-red-950/80 border border-red-700/60 rounded-xl text-xs text-red-200 flex items-start gap-2">
              <span className="text-base leading-none">⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-400 mb-2" />
              <p className="text-xs text-slate-400">MFA চ্যালেঞ্জ লোড করা হচ্ছে...</p>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label htmlFor="otp-code" className="block text-xs font-semibold text-slate-300 mb-2 text-center">
                  ৬-ডিজিটের সিকিউরিটি কোড (Authenticator Code)
                </label>
                <input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 bg-slate-900 border border-slate-700 rounded-xl text-amber-400 placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || otpCode.length !== 6}
                className="w-full flex items-center justify-center bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-3 rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>যাচাই করা হচ্ছে...</span>
                ) : (
                  <>
                    <span>ভেরিফাই এবং অ্যাডমিন প্যানেলে প্রবেশ করুন</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
            <button
              onClick={() => void handleLogout()}
              className="flex items-center gap-1 hover:text-red-400 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>লগআউট করুন</span>
            </button>
            <Link href="/login" className="hover:text-sky-400 transition">
              অন্য অ্যাকাউন্টে লগইন
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
