"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowRight, CheckCircle2, ShieldAlert, RefreshCw, Eye, EyeOff, Check, X, ShieldCheck } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { createRecoveryBrowserClient } from "@/lib/supabase/client";
import { mapSafeAuthError } from "@/lib/auth/safe-errors";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isForced = searchParams.get("forced") === "true";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  const getPasswordStrength = (pwd: string) => {
    let score = 0;
    if (!pwd) return { score: 0, label: "খালি", percent: 0, color: "bg-slate-700", text: "text-slate-400" };
    if (pwd.length >= 8) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;

    if (score <= 1) return { score: 1, label: "দুর্বল (Weak)", percent: 25, color: "bg-red-500", text: "text-red-400" };
    if (score === 2) return { score: 2, label: "মোটামুটি (Fair)", percent: 50, color: "bg-amber-500", text: "text-amber-400" };
    if (score === 3) return { score: 3, label: "ভালো (Good)", percent: 75, color: "bg-sky-500", text: "text-sky-400" };
    return { score: 4, label: "শক্তিশালী (Strong)", percent: 100, color: "bg-emerald-500", text: "text-emerald-400" };
  };

  const strength = getPasswordStrength(newPassword);
  const hasMinLength = newPassword.length >= 8;
  const hasUpperLower = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const hasNumber = /\d/.test(newPassword);
  const hasSpecial = /[^a-zA-Z0-9]/.test(newPassword);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  useEffect(() => {
    const supabase = createRecoveryBrowserClient();
    let isMounted = true;

    async function checkSession() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error || !user) {
        setHasValidSession(false);
        setErrorMessage(
          isForced
            ? "আপনার account session পাওয়া যায়নি। আগে বৈধভাবে লগইন করে temporary password পরিবর্তন করুন।"
            : "কোনো সক্রিয় password-recovery session পাওয়া যায়নি। ইমেইলের নতুন রিকভারি লিংক ব্যবহার করুন।"
        );
      } else {
        setHasValidSession(true);
        setErrorMessage(null);
      }

      setCheckingSession(false);
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === "PASSWORD_RECOVERY" || session) {
        setHasValidSession(true);
        setCheckingSession(false);
        setErrorMessage(null);
      }

      if (event === "SIGNED_OUT") {
        setHasValidSession(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isForced]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasValidSession) {
      setErrorMessage("সক্রিয় authentication session ছাড়া password পরিবর্তন করা যাবে না।");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("দুটি পাসওয়ার্ড এক নয়। পুনরায় যাচাই করুন।");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createRecoveryBrowserClient();

      const {
        data: { user },
        error: sessionError,
      } = await supabase.auth.getUser();

      if (sessionError || !user) {
        setErrorMessage("আপনার authentication session আর বৈধ নেই। নতুন রিকভারি লিংক বা login session ব্যবহার করুন।");
        setIsLoading(false);
        return;
      }

      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (passwordError) {
        setErrorMessage(mapSafeAuthError(passwordError.message));
        setIsLoading(false);
        return;
      }

      // Password update and application-level must_change_password completion are
      // intentionally treated as separate checkpoints. Never report success if
      // the database completion RPC failed (must_change_password: false invariant).
      const { data: completionData, error: completionError } = await supabase.rpc(
        "complete_current_user_password_change"
      );

      if (
        completionError ||
        !completionData ||
        completionData.success !== true ||
        completionData.must_change_password !== false
      ) {
        setCompleted(false);
        setErrorMessage(
          "পাসওয়ার্ড পরিবর্তন হয়েছে, কিন্তু account-security completion database update সফল হয়নি। একই পেজ থেকে আবার চেষ্টা করুন; login access নিশ্চিত না হওয়া পর্যন্ত এই ধাপটি complete হিসেবে দেখানো হবে না।"
        );
        setIsLoading(false);
        return;
      }

      setCompleted(true);
      setIsLoading(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? mapSafeAuthError(err.message)
          : "পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে।";
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
            Set New Access Password
          </h1>
          <p className="text-xs text-sky-400 font-medium">
            {HOSPITAL_METADATA.name} — Password Recovery Completion
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl">
          {checkingSession ? (
            <div className="text-center space-y-3 py-8">
              <RefreshCw className="w-7 h-7 animate-spin text-sky-400 mx-auto" />
              <p className="text-xs text-slate-300">
                সিকিউর password session যাচাই করা হচ্ছে...
              </p>
            </div>
          ) : completed ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-white">
                পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে
              </h2>
              <p className="text-xs text-slate-300">
                নতুন পাসওয়ার্ড কার্যকর হয়েছে এবং account-level temporary-password flag clear হয়েছে।
              </p>
              <div className="pt-4 border-t border-slate-700">
                <button
                  onClick={() => router.push("/app/dashboard")}
                  className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition cursor-pointer"
                >
                  সিস্টেমে প্রবেশ করুন
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {isForced && (
                <div className="p-3.5 bg-amber-950/80 border border-amber-600/70 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-amber-300">
                      প্রাথমিক পাসওয়ার্ড পরিবর্তন বাধ্যতামূলক
                    </span>
                    <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                      temporary password দিয়ে প্রবেশ করার পরে নিজের গোপন পাসওয়ার্ড সেট করতে হবে।
                    </p>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  className="p-3.5 bg-red-950/80 border border-red-700/60 rounded-xl text-xs text-red-200 flex items-start gap-2"
                >
                  <span className="text-base leading-none">⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="p-3 bg-sky-950/40 border border-sky-800/50 rounded-xl text-xs text-sky-200 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-bold block text-sky-300">
                    স্বাধীনভাবে পাসওয়ার্ড নির্বাচনের সুবিধা
                  </span>
                  ফেসবুক বা জিমেইলের মতোই আপনি সম্পূর্ণ স্বাধীনভাবে নিজের পছন্দমতো যেকোনো গোপন পাসওয়ার্ড এখানে সেট করতে পারবেন।
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="new-password" className="block text-xs font-semibold text-slate-300">
                    নতুন পাসওয়ার্ড (New Password)
                  </label>
                  {newPassword && (
                    <span className={`text-[11px] font-medium ${strength.text}`}>
                      {strength.label}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="আপনার পছন্দের পাসওয়ার্ড লিখুন"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {newPassword && (
                  <div className="mt-2 space-y-1.5">
                    <div className="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strength.color}`}
                        style={{ width: `${strength.percent}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400 pt-1">
                      <span className={`flex items-center gap-1 ${hasMinLength ? "text-emerald-400" : "text-slate-400"}`}>
                        {hasMinLength ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 text-center">•</span>}
                        ন্যূনতম ৮ অক্ষর
                      </span>
                      <span className={`flex items-center gap-1 ${hasUpperLower ? "text-emerald-400" : "text-slate-400"}`}>
                        {hasUpperLower ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 text-center">•</span>}
                        ছোট ও বড় হাতের অক্ষর
                      </span>
                      <span className={`flex items-center gap-1 ${hasNumber ? "text-emerald-400" : "text-slate-400"}`}>
                        {hasNumber ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 text-center">•</span>}
                        কমপক্ষে একটি সংখ্যা (0-9)
                      </span>
                      <span className={`flex items-center gap-1 ${hasSpecial ? "text-emerald-400" : "text-slate-400"}`}>
                        {hasSpecial ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 text-center">•</span>}
                        বিশেষ চিহ্ন (@, #, $ ইত্যাদি)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-300 mb-1">
                  পাসওয়ার্ড নিশ্চিত করুন (Confirm Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="একই পাসওয়ার্ড পুনরায় লিখুন"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 transition"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {passwordsMatch && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1.5">
                    <Check className="w-3.5 h-3.5" /> পাসওয়ার্ড মিলেছে (Passwords match)
                  </p>
                )}
                {passwordsMismatch && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1.5">
                    <X className="w-3.5 h-3.5" /> পাসওয়ার্ড দুটি এক নয়
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || checkingSession || !hasValidSession || (confirmPassword.length > 0 && !passwordsMatch)}
                className="w-full flex items-center justify-center bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <span>পাসওয়ার্ড আপডেট করা হচ্ছে...</span>
                ) : (
                  <>
                    <span>পাসওয়ার্ড আপডেট করুন ও লগইন করুন</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
