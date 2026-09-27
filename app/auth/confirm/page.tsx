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
  const [statusMessage, setStatusMessage] = useState<string>(
    "আপনার পাসওয়ার্ড রিকভারি টোকেন যাচাই করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন..."
  );

  useEffect(() => {
    let isMounted = true;

    async function handleExchange() {
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const nextParam = searchParams.get("next");
      const queryError = searchParams.get("error");
      const queryErrorDesc = searchParams.get("error_description");
      const next = sanitizeNextPath(nextParam);

      // Handle query errors emitted directly by Supabase Auth server
      if (queryError || queryErrorDesc) {
        if (isMounted) {
          setErrorMessage(
            queryErrorDesc
              ? decodeURIComponent(queryErrorDesc)
              : "রিকভারি লিংকটি মেয়াদোত্তীর্ণ অথবা অকার্যকর হয়ে গেছে। অনুগ্রহ করে পুনরায় রিসেট লিংক পাঠান।"
          );
        }
        return;
      }

      const supabase = createBrowserClient();

      try {
        // 1. Direct PKCE code exchange flow
        if (code) {
          if (isMounted) setStatusMessage("PKCE রিকভারি কোড এক্সচেঞ্জ করা হচ্ছে...");
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            if (isMounted) {
              setErrorMessage(
                exchangeError.message.includes("expired")
                  ? "রিকভারি কোডের মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।"
                  : `রিকভারি কোড যাচাই ব্যর্থ হয়েছে: ${exchangeError.message}`
              );
            }
            return;
          }
          if (isMounted) {
            router.replace(next);
          }
          return;
        }

        // 2. Email OTP / Token Hash flow (verifyOtp)
        if (tokenHash) {
          if (isMounted) setStatusMessage("ইমেইল ওটিপি টোকেন ভেরিফাই করা হচ্ছে...");
          const otpType = (type || "recovery") as "recovery" | "email" | "invite";
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });

          if (otpError) {
            if (isMounted) {
              setErrorMessage(`ওটিপি টোকেন যাচাই ব্যর্থ হয়েছে: ${otpError.message}`);
            }
            return;
          }

          if (isMounted) {
            router.replace(next);
          }
          return;
        }

        // 3. Implicit Hash flow: Check if URL hash contains access_token
        if (typeof window !== "undefined" && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const hashError = hashParams.get("error_description") || hashParams.get("error");

          if (hashError) {
            if (isMounted) {
              setErrorMessage(decodeURIComponent(hashError));
            }
            return;
          }

          if (accessToken && refreshToken) {
            if (isMounted) setStatusMessage("হ্যাশ সেশন রেজিস্টার করা হচ্ছে...");
            const { error: setSessionErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (!setSessionErr && isMounted) {
              router.replace(next);
              return;
            }
          }
        }

        // 4. Pre-existing active session check
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          if (isMounted) {
            router.replace(next);
          }
          return;
        }

        // 5. No credentials found in URL query or hash
        if (isMounted) {
          setErrorMessage(
            "কোনো বৈধ রিকভারি কোড বা টোকেন পাওয়া যায়নি। অনুগ্রহ করে আপনার ইমেইলের রিসেট লিংকে ক্লিক করুন অথবা নতুন করে রিসেট রিকোয়েস্ট পাঠান।"
          );
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg =
            err instanceof Error ? err.message : "অথেন্টিকেশন ভেরিফিকেশনে অপ্রত্যাশিত সমস্যা হয়েছে।";
          setErrorMessage(msg);
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
      <div className="max-w-md w-full text-center space-y-5 bg-slate-800 border border-slate-700 rounded-3xl p-8 shadow-2xl">
        {errorMessage ? (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/40">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-white">পাসওয়ার্ড রিকভারি ব্যর্থ হয়েছে</h2>
            <p className="text-xs text-rose-200 leading-relaxed bg-rose-950/60 p-3 rounded-xl border border-rose-800/50">
              {errorMessage}
            </p>
            <div className="pt-2">
              <Link
                href="/forgot-password"
                className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition shadow-lg cursor-pointer"
              >
                ← নতুন রিসেট লিংক রিকোয়েস্ট করুন
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center mx-auto border border-sky-500/40">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h2 className="text-base font-bold text-white">সিকিউর সেশন ভেরিফিকেশন</h2>
            <p className="text-xs text-slate-300 leading-relaxed">{statusMessage}</p>
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
