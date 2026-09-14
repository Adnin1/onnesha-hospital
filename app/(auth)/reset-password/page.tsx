"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";
import { createBrowserClient } from "@/lib/supabase/client";
import { mapSafeAuthError } from "@/lib/auth/safe-errors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(mapSafeAuthError(error.message));
        setIsLoading(false);
        return;
      }

      setCompleted(true);
      setIsLoading(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? mapSafeAuthError(err.message) : "পাসওয়ার্ড পরিবর্তন করতে সমস্যা হয়েছে।";
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
          {completed ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-white">পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে</h2>
              <p className="text-xs text-slate-300">
                আপনার নতুন পাসওয়ার্ড দিয়ে হাসপাতালে লগইন করুন। অ্যাডমিন অ্যাকাউন্টের ক্ষেত্রে ২-ফ্যাক্টর TOTP সুরক্ষা সক্রিয় থাকবে।
              </p>
              <div className="pt-4 border-t border-slate-700">
                <button
                  onClick={() => router.push("/login")}
                  className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition cursor-pointer"
                >
                  লগইন পেজে যান
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {errorMessage && (
                <div role="alert" className="p-3.5 bg-red-950/80 border border-red-700/60 rounded-xl text-xs text-red-200 flex items-start gap-2">
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
                disabled={isLoading}
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
