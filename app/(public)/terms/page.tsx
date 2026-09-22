import type { Metadata } from "next";
import { FileText, AlertCircle, Scale, ShieldAlert, CheckSquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service | Onnesha Hospital",
  description: "Terms of Service and Operational Conditions for Onnesha Hospital & Diagnostic Complex.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service | Onnesha Hospital",
    description: "Terms of Service and Operational Conditions for Onnesha Hospital & Diagnostic Complex.",
    url: "/terms",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return (
    <div className="py-12 bg-slate-50 min-h-[80vh]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-sky-600 tracking-wider uppercase">
            Legal Terms & Operational Guidelines
          </span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Terms of Service
          </h1>
          <p className="text-xs text-slate-600 mt-2">
            Effective Date: September 2026 | Onnesha Hospital & Diagnostic Complex
          </p>
        </div>

        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs space-y-8">
          {/* Section 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <FileText className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">1. Acceptance of Terms</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              By accessing the Onnesha Hospital online appointment portal, patient portal, or installing the Onnesha Hospital Windows Desktop Client, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, you should not access or use our digital services.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">2. Emergency Medical Disclaimer</h2>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed">
              <strong>CRITICAL NOTICE:</strong> The online portal and desktop appointment booking interface are intended for routine, elective, and scheduled outpatient appointments. For immediate, life-threatening medical emergencies, do NOT wait for online verification. Proceed immediately to the nearest emergency department or call 999.
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <Scale className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">3. User Responsibilities & Patient Accuracy</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Patients and hospital staff utilizing the portal must provide accurate personal, contact, and medical information. Providing false registration data or impersonating medical staff is strictly prohibited and subject to legal action under Bangladesh penal code and the Cyber Security Act 2026.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">4. Intellectual Property & System Integrity</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              All digital software interfaces, prescription layouts, diagnostic reporting templates, trademarks, and logos associated with Onnesha HMS are the intellectual property of Onnesha Hospital & Diagnostic Complex. Unauthorized reverse engineering, automated scraping, or unauthorized interference with system APIs is prohibited under applicable laws and hospital policy.
            </p>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-sky-700">
              <CheckSquare className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold text-slate-900">5. Billing & Refund Policy</h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              All digital payments, diagnostic test fees, and OPD consultation charges processed through the system are subject to official hospital billing verification. Cancellations or refund requests must be initiated through the hospital billing counter prior to sample collection or doctor consultation.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
