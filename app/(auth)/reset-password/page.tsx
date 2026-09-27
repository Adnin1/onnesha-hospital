"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowRight, CheckCircle2, ShieldAlert, RefreshCw } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { createRecoveryBrowserClient } from "@/lib/supabase/client";
import { mapSafeAuthError } from "@/lib/auth/safe-errors";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isForced = searchParams.get("forced") === "true";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

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
      // the database completion RPC failed.
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

              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold text-slate-300 mb-1">
                  নতুন পাসওয়ার্ড (New Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-300 mb-1">
                  পাসওয়ার্ড নিশ্চিত করুন (Confirm Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || checkingSession || !hasValidSession}
                className="w-full flex items-center justify-center bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <span>পাসওয়ার্ড আপডেট করা হচ্ছে...</span>
                ) : (
                  <>
                    <span>পাসওয়ার্ড আপডেট করুন</span>
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
