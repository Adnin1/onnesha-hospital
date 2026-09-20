import type { Metadata } from "next";
import { ShieldCheck, CheckCircle2, Lock, HeartHandshake } from "lucide-react";

export const metadata: Metadata = {
  title: "Patient Data Consent Management | Onnesha Hospital",
  description: "Consent Management Portal under Bangladesh Personal Data Protection Act 2026.",
};

export default function ConsentPage() {
  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
            Data Privacy & Patient Rights
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Patient Data Consent Portal
          </h1>
          <p className="text-xs text-slate-600 mt-2">
            Manage your personal electronic health data processing authorizations
          </p>
        </div>

        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs space-y-8">
          <div className="flex items-start gap-4 p-4 bg-sky-50 rounded-xl border border-sky-100">
            <HeartHandshake className="w-6 h-6 text-sky-700 flex-shrink-0 mt-1" />
            <div className="text-xs text-slate-700 leading-relaxed">
              <h2 className="font-bold text-slate-900 text-sm mb-1">Your Privacy Control Standard</h2>
              <p>
                In accordance with the Bangladesh Personal Data Protection Act 2026, Onnesha Hospital processes your personal demographic and diagnostic data based on explicit consent for medical care provision.
              </p>
            </div>
          </div>

          {/* Consent Categories */}
          <div className="space-y-4">
            <h2 className="font-bold text-slate-900 text-base">Registered Consent Declarations</h2>

            {/* Essential Medical Care */}
            <div className="p-5 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Essential Clinical & Medical Care Data (Mandatory)</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                  Active / Required
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Covers creation of Electronic Health Records (EHR), physician consultations, vitals recording, laboratory testing, pharmacy dispensing, and financial invoice generation required for medical treatment.
              </p>
            </div>

            {/* Diagnostic Lab Notifications */}
            <div className="p-5 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <ShieldCheck className="w-5 h-5 text-sky-600" />
                  <span>Diagnostic SMS & Web Notifications (Opt-in)</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-sky-100 text-sky-800 rounded-md">
                  Default Enabled
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Allows sending appointment reminders and notification alerts when lab reports are ready. Never contains sensitive clinical diagnoses in plain SMS text.
              </p>
            </div>

            {/* Quality Assurance Telemetry */}
            <div className="p-5 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                  <Lock className="w-5 h-5 text-slate-600" />
                  <span>Anonymized Quality & Performance Telemetry (Opt-out)</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md">
                  Anonymized
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Collects non-PII Core Web Vitals and app loading metrics to optimize clinical response times and server stability.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
            <h3 className="font-bold text-slate-900">How to Revoke or Update Consent</h3>
            <p>
              To modify your consent preferences or request deletion of non-essential records, present your National ID / Registration Slip at our Hospital Data Desk or contact <a href="mailto:dpo@onneshahospital.com" className="text-sky-600 underline">dpo@onneshahospital.com</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
