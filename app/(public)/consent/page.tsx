import type { Metadata } from "next";
import { ShieldCheck, CheckCircle2, Lock, HeartHandshake } from "lucide-react";
import { HOSPITAL_METADATA } from "@/config/hospital";

export const metadata: Metadata = {
  title: "Consent & Privacy Choices | Onnesha Hospital",
  description: "Patient Consent & Privacy Choices Guide referencing the Bangladesh Personal Data Protection Act 2026.",
  alternates: { canonical: "/consent" },
  openGraph: {
    title: "Consent & Privacy Choices | Onnesha Hospital",
    description: "Patient Consent & Privacy Choices Guide referencing the Bangladesh Personal Data Protection Act 2026.",
    url: "/consent",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ConsentPage() {
  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
            Patient Data & Privacy Choices
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Patient Data Consent Portal & Privacy Choices
          </h1>
          <p className="text-xs text-slate-600 mt-2">
            Overview of personal and healthcare data processing authorizations
          </p>
        </div>

        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs space-y-8">
          <div className="flex items-start gap-4 p-4 bg-sky-50 rounded-xl border border-sky-100">
            <HeartHandshake className="w-6 h-6 text-sky-700 shrink-0 mt-1" />
            <div className="text-xs text-slate-700 leading-relaxed">
              <h2 className="font-bold text-slate-900 text-sm mb-1">Consent Principles</h2>
              <p>
                In alignment with Section 13 of the Bangladesh Personal Data Protection Act 2026, Onnesha Hospital outlines below how patient demographic, outpatient consultation, and diagnostic test information is processed.
              </p>
            </div>
          </div>

          {/* Consent Categories */}
          <div className="space-y-4">
            <h2 className="font-bold text-slate-900 text-base">Processing Categories</h2>

            {/* Essential Medical Care */}
            <div className="p-5 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Essential Clinical & Medical Care Data</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                  Treatment Prerequisite
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Covers creation of electronic health records, physician consultations, vitals measurement, diagnostic orders, and financial billing necessary for outpatient or inpatient healthcare delivery.
              </p>
            </div>

            {/* Operational Communication */}
            <div className="p-5 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <ShieldCheck className="w-5 h-5 text-sky-600" />
                  <span>Operational & Booking Communication</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-sky-100 text-sky-800 rounded-md">
                  Operational
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Used to verify appointment booking details and provide queue serial tokens. We do not transmit unencrypted sensitive clinical diagnoses over plain SMS or unsecured public channels.
              </p>
            </div>

            {/* Application Telemetry */}
            <div className="p-5 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <Lock className="w-5 h-5 text-slate-600" />
                  <span>Technical System Diagnostics</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md">
                  Non-PII
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Collects non-PII operational web vitals and application error boundaries to maintain uptime and ensure portal responsiveness for patients and staff.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
            <h3 className="font-bold text-slate-900">How to Update or Revoke Optional Consent</h3>
            <p>
              To modify communication preferences or exercise data subject rights under the Personal Data Protection Act 2026, please visit our hospital reception counter or contact the patient relations desk at{" "}
              {HOSPITAL_METADATA.phone || "the hospital front desk"}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
