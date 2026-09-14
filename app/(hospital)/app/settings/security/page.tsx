"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, KeyRound, QrCode, Trash2, CheckCircle2, AlertTriangle, Plus, RefreshCw, Copy, Check } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";

interface Factor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: "verified" | "unverified";
  created_at: string;
  updated_at: string;
}

export default function SecuritySettingsPage() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [aalLevel, setAalLevel] = useState<string>("aal1");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Enrollment state
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [newFactorId, setNewFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const fetchSecurityState = async () => {
    try {
      const supabase = createBrowserClient();
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData && aalData.currentLevel) {
        setAalLevel(aalData.currentLevel);
      }

      const { data: factorData, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setErrorMessage("MFA সিকিউরিটি তথ্য লোড করতে ব্যর্থ হয়েছে।");
        setIsLoading(false);
        return;
      }

      setFactors(factorData.all as unknown as Factor[]);
      setIsLoading(false);
    } catch {
      setErrorMessage("সিকিউরিটি সার্ভিসে সংযোগ ব্যর্থ হয়েছে।");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const loadState = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (active && aalData && aalData.currentLevel) {
          setAalLevel(aalData.currentLevel);
        }

        const { data: factorData, error } = await supabase.auth.mfa.listFactors();
        if (!active) return;
        if (error) {
          setErrorMessage("MFA সিকিউরিটি তথ্য লোড করতে ব্যর্থ হয়েছে।");
          setIsLoading(false);
          return;
        }

        setFactors(factorData.all as unknown as Factor[]);
        setIsLoading(false);
      } catch {
        if (active) {
          setErrorMessage("সিকিউরিটি সার্ভিসে সংযোগ ব্যর্থ হয়েছে।");
          setIsLoading(false);
        }
      }
    };

    void loadState();
    return () => {
      active = false;
    };
  }, []);

  const handleStartEnrollment = async () => {
    setIsEnrolling(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createBrowserClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Onnesha Hospital",
        friendlyName: "Authenticator App",
      });

      if (error || !data) {
        setErrorMessage("TOTP এনরোলমেন্ট শুরু করতে ব্যর্থ হয়েছে: " + (error?.message || "অজানা ত্রুটি"));
        setIsEnrolling(false);
        return;
      }

      setNewFactorId(data.id);
      setQrCodeSvg(data.totp.qr_code);
      setSecretKey(data.totp.secret);
    } catch {
      setErrorMessage("TOTP এনরোলমেন্ট প্রক্রিয়া শুরু করতে ত্রুটি হয়েছে।");
      setIsEnrolling(false);
    }
  };

  const handleVerifyEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFactorId || verifyCode.trim().length !== 6) return;

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserClient();
      // 1. Create challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: newFactorId,
      });

      if (challengeError || !challengeData) {
        setErrorMessage("MFA চ্যালেঞ্জ তৈরিতে ব্যর্থতা: " + (challengeError?.message || "অজানা ত্রুটি"));
        setIsVerifying(false);
        return;
      }

      // 2. Verify code -> promotes session to AAL2 and verifies factor
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: newFactorId,
        challengeId: challengeData.id,
        code: verifyCode.trim(),
      });

      if (verifyError) {
        setErrorMessage("ভুল TOTP কোড। আপনার Authenticator অ্যাপ থেকে সঠিক কোডটি দেখে লিখুন।");
        setIsVerifying(false);
        return;
      }

      setSuccessMessage("TOTP Authenticator সফলভাবে অ্যাক্টিভেট ও ভেরিফাই হয়েছে! আপনার অ্যাকাউন্ট এখন AAL2 প্রটেক্টেড।");
      setIsEnrolling(false);
      setNewFactorId(null);
      setQrCodeSvg(null);
      setSecretKey(null);
      setVerifyCode("");
      void fetchSecurityState();
    } catch {
      setErrorMessage("এনরোলমেন্ট ভেরিফিকেশনে সাময়িক ত্রুটি।");
      setIsVerifying(false);
    }
  };

  const handleUnenrollFactor = async (factorIdToUnenroll: string) => {
    if (!confirm("আপনি কি নিশ্চিত যে এই TOTP Authenticator ফ্যাক্টরটি মুছে ফেলতে চান?")) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: factorIdToUnenroll,
      });

      if (error) {
        setErrorMessage("ফ্যাক্টর আনএনরোল করতে ব্যর্থ: " + error.message);
        return;
      }

      setSuccessMessage("TOTP ফ্যাক্টর সফলভাবে মুছে ফেলা হয়েছে।");
      void fetchSecurityState();
    } catch {
      setErrorMessage("ফ্যাক্টর মুছতে সাময়িক ত্রুটি।");
    }
  };

  const copySecretToClipboard = () => {
    if (secretKey) {
      void navigator.clipboard.writeText(secretKey);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Security & MFA Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            অ্যাডমিন অ্যাকাউন্ট সিকিউরিটি, 2-Factor Authenticators (TOTP) এবং AAL2 অ্যাসিওরেন্স লেভেল নিয়ন্ত্রণ প্যানেল।
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
              aalLevel === "aal2"
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : "bg-amber-100 text-amber-800 border border-amber-300"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Assurance Level: {aalLevel.toUpperCase()}</span>
          </span>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div role="alert" className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-600 mb-2" />
          <p className="text-xs text-slate-500">সিকিউরিটি কনফিগারেশন লোড হচ্ছে...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-sky-600" />
                  <h2 className="font-bold text-slate-900 text-sm">Active Multi-Factor Authenticators (TOTP)</h2>
                </div>
                {!isEnrolling && (
                  <button
                    onClick={() => void handleStartEnrollment()}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Authenticator</span>
                  </button>
                )}
              </div>

              {factors.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-6">
                  <QrCode className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">কোনো 2-Factor Authenticator যুক্ত নেই</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    অনলাইন সাইবার হুমকি থেকে অ্যাডমিন অ্যাকাউন্ট সুরক্ষায় Google / Microsoft Authenticator অ্যাপের মাধ্যমে TOTP MFA সক্রিয় করুন।
                  </p>
                  <button
                    onClick={() => void handleStartEnrollment()}
                    className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>TOTP MFA সক্রিয় করুন</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {factors.map((factor) => (
                    <div
                      key={factor.id}
                      className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-xs text-slate-900">
                            {factor.friendly_name || "Authenticator App (TOTP)"}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Status: <span className="font-semibold text-emerald-700">{factor.status}</span> • Added:{" "}
                            {new Date(factor.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => void handleUnenrollFactor(factor.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="ফ্যাক্টর মুছে ফেলুন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Enrollment Modal / Form */}
            {isEnrolling && (
              <div className="bg-white rounded-2xl border border-sky-200 p-6 shadow-md space-y-6">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-900 text-sm">নতুন TOTP Authenticator পেয়ার করুন</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    আপনার স্মার্টফোনে Google Authenticator / Microsoft Authenticator / 1Password অ্যাপ ওপেন করুন।
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 items-center">
                  <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200">
                    {qrCodeSvg ? (
                      <div
                        className="inline-block p-2 bg-white rounded-lg shadow-xs"
                        dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
                      />
                    ) : (
                      <RefreshCw className="w-8 h-8 animate-spin text-sky-600 mx-auto" />
                    )}
                    <p className="text-[11px] text-slate-500 mt-2 font-medium">QR কোডটি স্ক্যান করুন</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        ম্যানুয়াল সিক্রেট কি (Manual Secret Key)
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="bg-slate-100 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono border border-slate-200 flex-1 break-all select-all">
                          {secretKey || "..."}
                        </code>
                        <button
                          onClick={copySecretToClipboard}
                          className="p-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-700 transition"
                          title="কপি করুন"
                        >
                          {copiedSecret ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleVerifyEnrollment} className="space-y-3">
                      <div>
                        <label htmlFor="verify-totp" className="block text-xs font-semibold text-slate-700 mb-1">
                          ৬-সংখ্যার প্রাথমিক ভেরিফিকেশন কোড
                        </label>
                        <input
                          id="verify-totp"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                          placeholder="000000"
                          className="w-full tracking-widest text-center text-lg font-mono px-3 py-2 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-sky-500"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={isVerifying || verifyCode.length !== 6}
                          className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50"
                        >
                          {isVerifying ? "যাচাই করা হচ্ছে..." : "ভেরিফাই ও অ্যাক্টিভেট করুন"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEnrolling(false);
                            setNewFactorId(null);
                          }}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                        >
                          বাতিল
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Info Sidebar */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="font-bold text-sm text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>OWASP & Supabase AAL2 Guide</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Super Admin এবং Hospital Admin অ্যাকাউন্টের জন্য 2-Factor Auth (TOTP) বাধ্যতামূলক।
              </p>
              <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
                <li>AAL1: শুধুমাত্র ইমেইল ও পাসওয়ার্ড যাচাইকৃত।</li>
                <li>AAL2: ইমেইল/পাসওয়ার্ড + TOTP Authenticator কোড উভয়ই যাচাইকৃত।</li>
                <li>উচ্চ-ঝুঁকিপূর্ণ কাজের জন্য AAL2 স্তর আবশ্যক।</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
