"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RefreshCw, AlertCircle } from "lucide-react";
import { createRecoveryBrowserClient } from "@/lib/supabase/client";

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
  const [statusMessage, setStatusMessage] = useState(
    "আপনার পাসওয়ার্ড রিকভারি টোকেন যাচাই করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন..."
  );

  useEffect(() => {
    let isMounted = true;

    async function handleRecovery() {
      const code = searchParams.get("code");
      const flowId = searchParams.get("sb_flow_id");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const next = sanitizeNextPath(searchParams.get("next"));
      const queryError = searchParams.get("error");
      const queryErrorDesc = searchParams.get("error_description");

      if (queryError || queryErrorDesc) {
        if (isMounted) {
          setErrorMessage(
            queryErrorDesc ||
              "রিকভারি লিংকটি মেয়াদোত্তীর্ণ অথবা অকার্যকর হয়ে গেছে। অনুগ্রহ করে নতুন রিসেট লিংক পাঠান।"
          );
        }
        return;
      }

      const supabase = createRecoveryBrowserClient();

      try {
        // This dedicated recovery client disables automatic URL-session detection.
        // Therefore this page owns the single-use PKCE code exchange.
        if (code) {
          if (isMounted) setStatusMessage("সিকিউর PKCE রিকভারি কোড এক্সচেঞ্জ করা হচ্ছে...");
          const { error } = await supabase.auth.exchangeCodeForSession(
            code,
            flowId ? { flowId } : undefined
          );

          if (error) {
            if (isMounted) {
              setErrorMessage(
                error.message.toLowerCase().includes("expired") ||
                  error.message.toLowerCase().includes("invalid")
                  ? "রিকভারি লিংকটি মেয়াদোত্তীর্ণ, ইতিমধ্যে ব্যবহার করা, অথবা অবৈধ। নতুন রিসেট লিংক পাঠান।"
                  : "রিকভারি সেশন তৈরি করা যায়নি। নতুন রিসেট লিংক পাঠান।"
              );
            }
            return;
          }

          if (isMounted) router.replace(next);
          return;
        }

        // Supabase email templates may provide the recovery token hash directly.
        if (tokenHash) {
          if (type !== "recovery") {
            if (isMounted) setErrorMessage("অবৈধ password-recovery token type।");
            return;
          }

          if (isMounted) setStatusMessage("রিকভারি টোকেন যাচাই করা হচ্ছে...");
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });

          if (error) {
            if (isMounted) setErrorMessage("রিকভারি টোকেনটি মেয়াদোত্তীর্ণ বা অবৈধ। নতুন রিসেট লিংক পাঠান।");
            return;
          }

          if (isMounted) router.replace(next);
          return;
        }

        // Legacy implicit/recovery links can place the tokens in the URL fragment.
        if (typeof window !== "undefined" && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.slice(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const hashError = hashParams.get("error_description") || hashParams.get("error");

          if (hashError) {
            if (isMounted) setErrorMessage("রিকভারি লিংকটি অকার্যকর হয়েছে। নতুন রিসেট লিংক পাঠান।");
            return;
          }

          if (accessToken && refreshToken) {
            if (isMounted) setStatusMessage("রিকভারি সেশন নিরাপদভাবে সক্রিয় করা হচ্ছে...");
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              if (isMounted) setErrorMessage("রিকভারি সেশন সক্রিয় করা যায়নি। নতুন রিসেট লিংক পাঠান।");
              return;
            }

            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            if (isMounted) router.replace(next);
            return;
          }
        }

        // A pre-existing authenticated session is valid for the password-change page.
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          if (isMounted) setErrorMessage("অথেন্টিকেশন সেশন যাচাই করা যায়নি। আবার চেষ্টা করুন।");
          return;
        }

        if (session) {
          if (isMounted) router.replace(next);
          return;
        }

        if (isMounted) {
          setErrorMessage(
            "কোনো বৈধ password-recovery credential পাওয়া যায়নি। আপনার ইমেইলের নতুন রিসেট লিংক ব্যবহার করুন।"
          );
        }
      } catch {
        if (isMounted) {
          setErrorMessage("রিকভারি প্রক্রিয়ায় অপ্রত্যাশিত সমস্যা হয়েছে। নতুন রিসেট লিংক পাঠান।");
        }
      }
    }

    void handleRecovery();

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
