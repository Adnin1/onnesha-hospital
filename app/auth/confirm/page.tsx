"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RefreshCw, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

function sanitizeNextPath(value: string | null): string {
  if (!value) return "/reset-password";
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("://")
  ) {
    return "/reset-password";
  }
  return value;
}

function AuthConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function handleExchange() {
      const code = searchParams.get("code");
      const nextParam = searchParams.get("next");
      const next = sanitizeNextPath(nextParam);

      if (!code) {
        if (isMounted) {
          setErrorMessage("রিকভারি কোড পাওয়া যায়নি। অনুগ্রহ করে নতুন রিসেট লিংক রিকোয়েস্ট করুন।");
          router.replace("/reset-password?error=missing_recovery_code");
        }
        return;
      }

      try {
        const supabase = createBrowserClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          if (isMounted) {
            setErrorMessage("রিকভারি লিংকটি মেয়াদোত্তীর্ণ বা অকার্যকর হয়ে গেছে।");
            router.replace("/reset-password?error=invalid_or_expired_recovery_link");
          }
          return;
        }

        if (isMounted) {
          router.replace(next);
        }
      } catch {
        if (isMounted) {
          router.replace("/reset-password?error=exchange_failed");
        }
      }
    }

    void handleExchange();

    return () => {
      isMounted = false;
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full text-center space-y-4 bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl">
        {errorMessage ? (
          <div className="space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-xs text-rose-200">{errorMessage}</p>
            <Link
              href="/forgot-password"
              className="inline-block text-xs font-semibold text-sky-400 hover:text-sky-300 mt-2"
            >
              ← পুনরায় পাসওয়ার্ড রিসেট পেজে যান
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-sky-400 mx-auto" />
            <h2 className="text-base font-bold text-white">সিকিউর সেশন ভেরিফিকেশন চলমান</h2>
            <p className="text-xs text-slate-400">
              আপনার পাসওয়ার্ড রিকভারি টোকেন যাচাই করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
        </div>
      }
    >
      <AuthConfirmContent />
    </Suspense>
  );
}
